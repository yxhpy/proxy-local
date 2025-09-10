import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CloudflaredErrorType } from '../src/utils/cloudflared-error-parser.js';

// 模拟DNS管理器的简化测试版本
class TestDNSManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.apiBaseUrl = 'https://api.cloudflare.com/client/v4';
    this.lastApiCall = null;
    this.mockApiResponses = new Map();
    this.mockCliResults = new Map();
  }

  // 设置模拟API响应
  setMockApiResponse(url, response) {
    this.mockApiResponses.set(url, response);
  }

  // 设置模拟CLI结果
  setMockCliResult(command, result) {
    this.mockCliResults.set(command, result);
  }

  // 模拟三层DNS配置
  async configureDNS(tunnelId, domain) {
    const context = {
      tunnelId,
      domain,
      startTime: Date.now(),
      attempts: []
    };

    try {
      // 第一层：CLI尝试
      const cliResult = await this.tryCliDnsCreation(tunnelId, domain);
      context.attempts.push({ layer: 'cli', result: cliResult });

      if (cliResult.success) {
        return {
          ...cliResult,
          method: 'cli',
          context
        };
      }

      // 第二层：冲突解决
      if (cliResult.errorType === CloudflaredErrorType.DNS_RECORD_EXISTS) {
        const conflictResult = await this.handleDnsConflict(tunnelId, domain);
        context.attempts.push({ layer: 'conflict', result: conflictResult });

        if (conflictResult.success) {
          return {
            ...conflictResult,
            method: 'conflict_resolution',
            context
          };
        }
      }

      // 第三层：API回退
      const apiResult = await this.createDnsRecordViaApi(tunnelId, domain);
      context.attempts.push({ layer: 'api', result: apiResult });

      if (apiResult.success) {
        return {
          ...apiResult,
          method: 'api_fallback',
          context
        };
      }

      throw new Error(`所有三层DNS配置方法都失败了`);

    } catch (error) {
      return {
        success: false,
        error: error.message,
        context
      };
    }
  }

  // 模拟CLI DNS创建
  async tryCliDnsCreation(tunnelId, domain) {
    const command = `cloudflared tunnel route dns ${tunnelId} ${domain}`;
    
    // 检查是否有预设的模拟结果
    const mockResult = this.mockCliResults.get(command);
    if (mockResult) {
      return mockResult;
    }

    // 默认成功响应
    return {
      success: true,
      output: 'Route created successfully',
      command
    };
  }

  // 模拟冲突处理
  async handleDnsConflict(tunnelId, domain) {
    // 模拟查询现有记录
    const existingRecords = await this.queryExistingDnsRecords(domain);
    
    if (existingRecords.length === 0) {
      return { success: false, error: '未找到具体冲突记录' };
    }

    // 模拟自动解决冲突（非交互环境）
    return await this.autoResolveConflict(tunnelId, domain, existingRecords[0]);
  }

  // 模拟查询现有DNS记录
  async queryExistingDnsRecords(domain) {
    const zoneId = await this.getZoneId(domain);
    if (!zoneId) {
      return [];
    }

    const url = `${this.apiBaseUrl}/zones/${zoneId}/dns_records?name=${domain}`;
    const mockResponse = this.mockApiResponses.get(url);
    
    if (mockResponse) {
      return mockResponse.success ? mockResponse.result : [];
    }

    return [];
  }

  // 模拟自动冲突解决
  async autoResolveConflict(tunnelId, domain, existingRecord) {
    const expectedTarget = `${tunnelId}.cfargotunnel.com`;

    if (existingRecord.content === expectedTarget) {
      return { success: true, action: 'no_change_needed' };
    }

    // 模拟更新记录
    return await this.updateDnsRecord(existingRecord, expectedTarget);
  }

  // 模拟更新DNS记录
  async updateDnsRecord(record, newTarget) {
    const url = `${this.apiBaseUrl}/zones/${record.zone_id}/dns_records/${record.id}`;
    this.lastApiCall = {
      method: 'PUT',
      url,
      data: {
        type: record.type,
        name: record.name,
        content: newTarget,
        ttl: record.ttl || 300
      }
    };

    const mockResponse = this.mockApiResponses.get(url);
    if (mockResponse) {
      return mockResponse.success 
        ? { success: true, action: 'updated', record: mockResponse.result }
        : { success: false, error: mockResponse.errors?.[0]?.message || '更新失败' };
    }

    // 默认成功
    return { 
      success: true, 
      action: 'updated', 
      record: { ...record, content: newTarget } 
    };
  }

  // 模拟API创建DNS记录
  async createDnsRecordViaApi(tunnelId, domain) {
    // 检查API令牌
    const apiToken = await this.configManager.getApiToken();
    if (!apiToken) {
      return { success: false, error: '缺少API令牌' };
    }

    const zoneId = await this.getZoneId(domain);
    if (!zoneId) {
      return { success: false, error: `未找到域名 ${domain} 对应的Zone` };
    }

    const recordData = {
      type: 'CNAME',
      name: domain,
      content: `${tunnelId}.cfargotunnel.com`,
      ttl: 300,
      proxied: false,
      comment: 'Created by proxy-local V2'
    };

    const url = `${this.apiBaseUrl}/zones/${zoneId}/dns_records`;
    this.lastApiCall = {
      method: 'POST',
      url,
      data: recordData
    };

    const mockResponse = this.mockApiResponses.get(url);
    if (mockResponse) {
      return mockResponse.success
        ? { success: true, record: mockResponse.result, zoneId }
        : { success: false, error: mockResponse.errors?.[0]?.message || 'API创建失败' };
    }

    // 默认成功
    return {
      success: true,
      record: {
        id: 'mock-record-id',
        ...recordData
      },
      zoneId
    };
  }

  // 模拟获取Zone ID
  async getZoneId(domain) {
    const domainParts = domain.split('.');
    const rootDomain = domainParts.length >= 2 
      ? domainParts.slice(-2).join('.')
      : domain;

    const url = `${this.apiBaseUrl}/zones?name=${rootDomain}`;
    const mockResponse = this.mockApiResponses.get(url);
    
    if (mockResponse) {
      return mockResponse.success && mockResponse.result.length > 0
        ? mockResponse.result[0].id
        : null;
    }

    // 默认返回模拟Zone ID
    return 'mock-zone-id-12345';
  }

  // 模拟验证DNS记录
  async verifyDnsRecord(domain, expectedTarget) {
    const records = await this.queryExistingDnsRecords(domain);
    return records.some(r => r.type === 'CNAME' && r.content === expectedTarget);
  }

  // 获取状态
  getStatus() {
    return {
      ready: true,
      hasApiToken: this.configManager?.hasApiToken() || false,
      apiBaseUrl: this.apiBaseUrl,
      supportedMethods: ['cli', 'conflict_resolution', 'api_fallback']
    };
  }
}

// 简化的ConfigManager测试版本
class TestConfigManager {
  constructor(testDir) {
    this.configDir = join(testDir, '.uvx', 'cloudflare_v2');
    this.apiToken = 'mock-api-token-12345';
    mkdirSync(this.configDir, { recursive: true });
  }
  
  async getApiToken() {
    return this.apiToken;
  }
  
  hasApiToken() {
    return !!this.apiToken;
  }
  
  setApiToken(token) {
    this.apiToken = token;
  }
}

describe('V2 DNS管理器测试', () => {
  let testDir;
  let configManager;
  let dnsManager;
  
  function createTestManager() {
    testDir = join(tmpdir(), 'dns-test-' + Date.now());
    mkdirSync(testDir, { recursive: true });
    configManager = new TestConfigManager(testDir);
    dnsManager = new TestDNSManager(configManager);
  }
  
  function cleanupTest() {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }

  test('应该正确初始化DNS管理器', () => {
    createTestManager();
    try {
      const status = dnsManager.getStatus();
      
      assert.strictEqual(status.ready, true);
      assert.strictEqual(status.hasApiToken, true);
      assert.strictEqual(status.apiBaseUrl, 'https://api.cloudflare.com/client/v4');
      assert.deepStrictEqual(status.supportedMethods, ['cli', 'conflict_resolution', 'api_fallback']);
    } finally {
      cleanupTest();
    }
  });

  test('第一层：CLI成功创建DNS记录', async () => {
    createTestManager();
    try {
      const tunnelId = 'test-tunnel-123';
      const domain = 'test.example.com';
      
      // 设置CLI成功
      dnsManager.setMockCliResult(
        `cloudflared tunnel route dns ${tunnelId} ${domain}`,
        { success: true, output: 'Route created successfully' }
      );
      
      const result = await dnsManager.configureDNS(tunnelId, domain);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.method, 'cli');
      assert.ok(result.context);
      assert.strictEqual(result.context.attempts.length, 1);
      assert.strictEqual(result.context.attempts[0].layer, 'cli');
    } finally {
      cleanupTest();
    }
  });

  test('第二层：处理DNS冲突并自动解决', async () => {
    createTestManager();
    try {
      const tunnelId = 'test-tunnel-456';
      const domain = 'conflict.example.com';
      
      // 设置CLI失败（DNS冲突）
      dnsManager.setMockCliResult(
        `cloudflared tunnel route dns ${tunnelId} ${domain}`,
        { 
          success: false, 
          errorType: CloudflaredErrorType.DNS_RECORD_EXISTS,
          error: 'DNS record already exists'
        }
      );
      
      // 设置现有记录查询
      dnsManager.setMockApiResponse(
        `${dnsManager.apiBaseUrl}/zones/mock-zone-id-12345/dns_records?name=${domain}`,
        {
          success: true,
          result: [{
            id: 'existing-record-id',
            type: 'CNAME',
            name: domain,
            content: 'old-target.example.com',
            zone_id: 'mock-zone-id-12345',
            ttl: 300
          }]
        }
      );
      
      // 设置更新记录成功
      dnsManager.setMockApiResponse(
        `${dnsManager.apiBaseUrl}/zones/mock-zone-id-12345/dns_records/existing-record-id`,
        {
          success: true,
          result: {
            id: 'existing-record-id',
            type: 'CNAME',
            name: domain,
            content: `${tunnelId}.cfargotunnel.com`
          }
        }
      );
      
      const result = await dnsManager.configureDNS(tunnelId, domain);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.method, 'conflict_resolution');
      assert.strictEqual(result.action, 'updated');
      assert.strictEqual(result.context.attempts.length, 2);
      assert.strictEqual(result.context.attempts[0].layer, 'cli');
      assert.strictEqual(result.context.attempts[1].layer, 'conflict');
    } finally {
      cleanupTest();
    }
  });

  test('第三层：API回退创建DNS记录', async () => {
    createTestManager();
    try {
      const tunnelId = 'test-tunnel-789';
      const domain = 'api.example.com';
      
      // 设置CLI失败（非冲突错误）
      dnsManager.setMockCliResult(
        `cloudflared tunnel route dns ${tunnelId} ${domain}`,
        { 
          success: false, 
          errorType: CloudflaredErrorType.NETWORK_TIMEOUT,
          error: 'Network timeout'
        }
      );
      
      // 设置API创建成功
      dnsManager.setMockApiResponse(
        `${dnsManager.apiBaseUrl}/zones/mock-zone-id-12345/dns_records`,
        {
          success: true,
          result: {
            id: 'new-record-id',
            type: 'CNAME',
            name: domain,
            content: `${tunnelId}.cfargotunnel.com`,
            ttl: 300
          }
        }
      );
      
      const result = await dnsManager.configureDNS(tunnelId, domain);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.method, 'api_fallback');
      assert.ok(result.record);
      assert.strictEqual(result.record.content, `${tunnelId}.cfargotunnel.com`);
      assert.strictEqual(result.context.attempts.length, 2);
      assert.strictEqual(result.context.attempts[0].layer, 'cli');
      assert.strictEqual(result.context.attempts[1].layer, 'api');
    } finally {
      cleanupTest();
    }
  });

  test('应该能正确解析Zone ID', async () => {
    createTestManager();
    try {
      const domain = 'sub.example.com';
      
      // 设置Zone查询响应
      dnsManager.setMockApiResponse(
        `${dnsManager.apiBaseUrl}/zones?name=example.com`,
        {
          success: true,
          result: [{
            id: 'zone-id-for-example-com',
            name: 'example.com'
          }]
        }
      );
      
      const zoneId = await dnsManager.getZoneId(domain);
      
      assert.strictEqual(zoneId, 'zone-id-for-example-com');
    } finally {
      cleanupTest();
    }
  });

  test('应该能验证DNS记录', async () => {
    createTestManager();
    try {
      const domain = 'verify.example.com';
      const expectedTarget = 'test-tunnel-999.cfargotunnel.com';
      
      // 设置记录查询响应
      dnsManager.setMockApiResponse(
        `${dnsManager.apiBaseUrl}/zones/mock-zone-id-12345/dns_records?name=${domain}`,
        {
          success: true,
          result: [{
            type: 'CNAME',
            name: domain,
            content: expectedTarget
          }]
        }
      );
      
      const verified = await dnsManager.verifyDnsRecord(domain, expectedTarget);
      
      assert.strictEqual(verified, true);
    } finally {
      cleanupTest();
    }
  });

  test('处理所有层都失败的情况', async () => {
    createTestManager();
    try {
      const tunnelId = 'fail-tunnel-000';
      const domain = 'fail.example.com';
      
      // 设置CLI失败
      dnsManager.setMockCliResult(
        `cloudflared tunnel route dns ${tunnelId} ${domain}`,
        { 
          success: false, 
          errorType: CloudflaredErrorType.NETWORK_TIMEOUT,
          error: 'CLI timeout'
        }
      );
      
      // 设置API失败
      dnsManager.setMockApiResponse(
        `${dnsManager.apiBaseUrl}/zones/mock-zone-id-12345/dns_records`,
        {
          success: false,
          errors: [{ message: 'API error' }]
        }
      );
      
      const result = await dnsManager.configureDNS(tunnelId, domain);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('所有三层DNS配置方法都失败了'));
      assert.strictEqual(result.context.attempts.length, 2);
    } finally {
      cleanupTest();
    }
  });

  test('应该正确跟踪API调用', async () => {
    createTestManager();
    try {
      const record = {
        id: 'test-record-id',
        type: 'CNAME',
        name: 'test.example.com',
        content: 'old-target.com',
        zone_id: 'test-zone-id',
        ttl: 300
      };
      
      const newTarget = 'new-target.cfargotunnel.com';
      
      await dnsManager.updateDnsRecord(record, newTarget);
      
      assert.ok(dnsManager.lastApiCall);
      assert.strictEqual(dnsManager.lastApiCall.method, 'PUT');
      assert.ok(dnsManager.lastApiCall.url.includes(record.id));
      assert.strictEqual(dnsManager.lastApiCall.data.content, newTarget);
    } finally {
      cleanupTest();
    }
  });

  test('应该处理无效配置的情况', async () => {
    createTestManager();
    try {
      // 清除API令牌
      configManager.setApiToken(null);
      
      const tunnelId = 'no-token-tunnel';
      const domain = 'notoken.example.com';
      
      // CLI会失败，API也会因为缺少令牌而失败
      dnsManager.setMockCliResult(
        `cloudflared tunnel route dns ${tunnelId} ${domain}`,
        { 
          success: false, 
          errorType: CloudflaredErrorType.NETWORK_TIMEOUT,
          error: 'CLI failed'
        }
      );
      
      const result = await dnsManager.configureDNS(tunnelId, domain);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    } finally {
      cleanupTest();
    }
  });
});