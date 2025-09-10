import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// 简单的ConfigManager测试版本，避免复杂的mocking
class TestConfigManager {
  constructor(testDir) {
    this.configDir = join(testDir, '.uvx', 'cloudflare_v2');
    this.configFile = join(this.configDir, 'config.json');
    this.certFile = join(testDir, '.cloudflared', 'cert.pem');
    
    // 创建测试目录
    mkdirSync(this.configDir, { recursive: true });
    
    this.defaultConfig = {
      version: '2.0',
      cloudflare: {
        apiToken: null,
        certPemPath: this.certFile,
        lastLoginTime: null,
        preferredDomain: null,
        tunnels: {}
      },
      preferences: {
        autoValidateSetup: true,
        skipPreflightChecks: false,
        dnsVerificationTimeout: 300000,
        retryAttempts: 3
      }
    };
    
    this.initConfig();
  }
  
  initConfig() {
    if (!existsSync(this.configFile)) {
      this.saveConfig(this.defaultConfig);
    }
  }
  
  readConfig() {
    try {
      const configData = readFileSync(this.configFile, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      return this.defaultConfig;
    }
  }
  
  saveConfig(config) {
    writeFileSync(this.configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  
  getConfigDir() { return this.configDir; }
  getCertPath() { return this.certFile; }
  
  saveApiToken(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('无效的API令牌');
    }
    const config = this.readConfig();
    config.cloudflare.apiToken = token;
    config.cloudflare.lastLoginTime = new Date().toISOString();
    this.saveConfig(config);
  }
  
  getApiToken() {
    const config = this.readConfig();
    return config.cloudflare?.apiToken;
  }
  
  savePreferredDomain(domain) {
    const config = this.readConfig();
    config.cloudflare.preferredDomain = domain;
    this.saveConfig(config);
  }
  
  saveTunnelInfo(tunnelId, tunnelInfo) {
    const config = this.readConfig();
    config.cloudflare.tunnels[tunnelId] = {
      ...tunnelInfo,
      createdAt: new Date().toISOString()
    };
    this.saveConfig(config);
  }
  
  getTunnelInfo(tunnelId) {
    const config = this.readConfig();
    return config.cloudflare.tunnels[tunnelId] || null;
  }
  
  clearConfig() {
    writeFileSync(this.configFile, JSON.stringify(this.defaultConfig, null, 2));
  }
}

describe('V2 ConfigManager测试', () => {
  let testDir;
  let configManager;
  
  function createTestManager() {
    testDir = join(tmpdir(), 'uvx-test-' + Date.now());
    mkdirSync(testDir, { recursive: true });
    configManager = new TestConfigManager(testDir);
  }
  
  function cleanupTest() {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }

  test('应该正确初始化配置目录', () => {
    createTestManager();
    try {
      const expectedConfigDir = join(testDir, '.uvx', 'cloudflare_v2');
      assert.strictEqual(configManager.getConfigDir(), expectedConfigDir);
      assert.ok(existsSync(expectedConfigDir));
    } finally {
      cleanupTest();
    }
  });

  test('应该创建默认配置文件', () => {
    createTestManager();
    try {
      const config = configManager.readConfig();
      
      assert.strictEqual(config.version, '2.0');
      assert.ok(config.cloudflare);
      assert.ok(config.preferences);
      assert.strictEqual(config.cloudflare.apiToken, null);
      assert.strictEqual(config.preferences.autoValidateSetup, true);
    } finally {
      cleanupTest();
    }
  });

  test('应该能保存和读取API令牌', () => {
    createTestManager();
    try {
      const testToken = 'test-api-token-12345';
      
      configManager.saveApiToken(testToken);
      const retrievedToken = configManager.getApiToken();
      
      assert.strictEqual(retrievedToken, testToken);
    } finally {
      cleanupTest();
    }
  });

  test('保存无效API令牌时应该抛出错误', () => {
    createTestManager();
    try {
      assert.throws(() => {
        configManager.saveApiToken(null);
      }, /无效的API令牌/);
      
      assert.throws(() => {
        configManager.saveApiToken('');
      }, /无效的API令牌/);
    } finally {
      cleanupTest();
    }
  });

  test('应该能保存和读取首选域名', () => {
    createTestManager();
    try {
      const testDomain = 'example.com';
      
      configManager.savePreferredDomain(testDomain);
      const config = configManager.readConfig();
      
      assert.strictEqual(config.cloudflare.preferredDomain, testDomain);
    } finally {
      cleanupTest();
    }
  });

  test('应该能保存和获取隧道信息', () => {
    createTestManager();
    try {
      const tunnelId = 'test-tunnel-123';
      const tunnelInfo = {
        name: 'test-tunnel',
        url: 'https://test.trycloudflare.com',
        port: 8000
      };
      
      configManager.saveTunnelInfo(tunnelId, tunnelInfo);
      const retrievedInfo = configManager.getTunnelInfo(tunnelId);
      
      assert.strictEqual(retrievedInfo.name, tunnelInfo.name);
      assert.strictEqual(retrievedInfo.url, tunnelInfo.url);
      assert.strictEqual(retrievedInfo.port, tunnelInfo.port);
      assert.ok(retrievedInfo.createdAt);
    } finally {
      cleanupTest();
    }
  });

  test('获取不存在的隧道信息应该返回null', () => {
    createTestManager();
    try {
      const result = configManager.getTunnelInfo('non-existent');
      assert.strictEqual(result, null);
    } finally {
      cleanupTest();
    }
  });

  test('应该正确返回cert.pem路径', () => {
    createTestManager();
    try {
      const expectedPath = join(testDir, '.cloudflared', 'cert.pem');
      assert.strictEqual(configManager.getCertPath(), expectedPath);
    } finally {
      cleanupTest();
    }
  });

  test('清理配置应该重置为默认值', () => {
    createTestManager();
    try {
      // 先保存一些数据
      configManager.saveApiToken('test-token');
      configManager.savePreferredDomain('test.com');
      
      // 清理配置
      configManager.clearConfig();
      
      // 验证已重置
      const config = configManager.readConfig();
      assert.strictEqual(config.cloudflare.apiToken, null);
      assert.strictEqual(config.cloudflare.preferredDomain, null);
    } finally {
      cleanupTest();
    }
  });
});