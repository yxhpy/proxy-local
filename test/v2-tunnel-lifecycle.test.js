import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// 模拟TunnelLifecycle的简化测试版本
class TestTunnelLifecycle {
  constructor(configManager) {
    this.configManager = configManager;
    this.processStatus = 'stopped';
    this.currentTunnel = null;
    this.tunnelProcess = null;
    this.configFile = null;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.cleanupHandlers = new Set();
  }

  getStatus() {
    return {
      processStatus: this.processStatus,
      tunnel: this.currentTunnel ? {
        type: this.currentTunnel.type,
        tunnelId: this.currentTunnel.tunnelId,
        url: this.currentTunnel.url,
        port: this.currentTunnel.port
      } : null,
      process: this.tunnelProcess ? {
        pid: this.tunnelProcess.pid || 12345,
        killed: this.tunnelProcess.killed || false
      } : null,
      restartAttempts: this.restartAttempts,
      configFile: this.configFile
    };
  }

  async generateTunnelConfig(tunnelId, domain, port) {
    const configDir = this.configManager.getConfigDir();
    const configPath = join(configDir, `tunnel-${tunnelId}.yml`);
    
    const config = {
      tunnel: tunnelId,
      'credentials-file': this.configManager.getCertPath(),
      ingress: [
        {
          hostname: domain,
          service: `http://localhost:${port}`
        },
        {
          service: 'http_status:404'
        }
      ]
    };

    const yamlContent = this.objectToYaml(config);
    writeFileSync(configPath, yamlContent, 'utf8');
    this.configFile = configPath;
    
    return configPath;
  }

  objectToYaml(obj, depth = 0) {
    const indent = '  '.repeat(depth);
    let yaml = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        yaml += `${indent}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${indent}- \n`;
            yaml += this.objectToYaml(item, depth + 1).replace(/^/gm, `${indent}  `);
          } else {
            yaml += `${indent}- ${item}\n`;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        yaml += `${indent}${key}:\n`;
        yaml += this.objectToYaml(value, depth + 1);
      } else {
        yaml += `${indent}${key}: ${value}\n`;
      }
    }
    
    return yaml;
  }

  addCleanupHandler(handler) {
    this.cleanupHandlers.add(handler);
  }

  async cleanup() {
    this.processStatus = 'stopped';
    this.currentTunnel = null;
    this.tunnelProcess = null;
    
    if (this.configFile && existsSync(this.configFile)) {
      rmSync(this.configFile, { force: true });
      this.configFile = null;
    }
    
    for (const handler of this.cleanupHandlers) {
      try {
        await handler();
      } catch (error) {
        // 忽略清理错误
      }
    }
    
    this.cleanupHandlers.clear();
  }

  // 模拟隧道创建（不启动真实进程）
  async mockCreateQuickTunnel(port) {
    this.processStatus = 'starting';
    
    // 模拟进程启动延迟
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const mockTunnel = {
      type: 'quick',
      tunnelId: 'mock-tunnel-123',
      port,
      url: `https://mock-tunnel-${port}.trycloudflare.com`,
      process: { pid: 12345, killed: false },
      createdAt: new Date().toISOString()
    };
    
    this.currentTunnel = mockTunnel;
    this.tunnelProcess = mockTunnel.process;
    this.processStatus = 'running';
    
    return mockTunnel;
  }

  async mockCreateNamedTunnel(tunnelName, domain, port) {
    this.processStatus = 'starting';
    
    const tunnelId = `mock-${tunnelName}-id`;
    
    // 生成配置文件
    const configPath = await this.generateTunnelConfig(tunnelId, domain, port);
    
    const mockTunnel = {
      type: 'named',
      tunnelId,
      tunnelName,
      domain,
      port,
      url: `https://${domain}`,
      configFile: configPath,
      process: { pid: 12345, killed: false },
      createdAt: new Date().toISOString()
    };
    
    this.currentTunnel = mockTunnel;
    this.tunnelProcess = mockTunnel.process;
    this.processStatus = 'running';
    
    return mockTunnel;
  }
}

// 简化的ConfigManager测试版本
class TestConfigManager {
  constructor(testDir) {
    this.configDir = join(testDir, '.uvx', 'cloudflare_v2');
    this.certFile = join(testDir, '.cloudflared', 'cert.pem');
    mkdirSync(this.configDir, { recursive: true });
    mkdirSync(join(testDir, '.cloudflared'), { recursive: true });
  }
  
  getConfigDir() { return this.configDir; }
  getCertPath() { return this.certFile; }
  
  saveTunnelInfo(tunnelId, info) {
    // 模拟保存隧道信息
  }
}

describe('V2 TunnelLifecycle测试', () => {
  let testDir;
  let configManager;
  let tunnelLifecycle;
  
  function createTestManager() {
    testDir = join(tmpdir(), 'tunnel-test-' + Date.now());
    mkdirSync(testDir, { recursive: true });
    configManager = new TestConfigManager(testDir);
    tunnelLifecycle = new TestTunnelLifecycle(configManager);
  }
  
  function cleanupTest() {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }

  test('应该正确初始化TunnelLifecycle', () => {
    createTestManager();
    try {
      const status = tunnelLifecycle.getStatus();
      
      assert.strictEqual(status.processStatus, 'stopped');
      assert.strictEqual(status.tunnel, null);
      assert.strictEqual(status.process, null);
      assert.strictEqual(status.restartAttempts, 0);
      assert.strictEqual(status.configFile, null);
    } finally {
      cleanupTest();
    }
  });

  test('应该能生成有效的隧道配置文件', async () => {
    createTestManager();
    try {
      const tunnelId = 'test-tunnel-123';
      const domain = 'test.example.com';
      const port = 8000;
      
      const configPath = await tunnelLifecycle.generateTunnelConfig(tunnelId, domain, port);
      
      assert.ok(existsSync(configPath));
      assert.ok(configPath.includes(`tunnel-${tunnelId}.yml`));
      
      const status = tunnelLifecycle.getStatus();
      assert.strictEqual(status.configFile, configPath);
    } finally {
      cleanupTest();
    }
  });

  test('YAML转换应该生成正确格式', () => {
    createTestManager();
    try {
      const testObj = {
        tunnel: 'test-id',
        ingress: [
          {
            hostname: 'test.com',
            service: 'http://localhost:8000'
          },
          {
            service: 'http_status:404'
          }
        ]
      };
      
      const yaml = tunnelLifecycle.objectToYaml(testObj);
      
      assert.ok(yaml.includes('tunnel: test-id'));
      assert.ok(yaml.includes('ingress:'));
      assert.ok(yaml.includes('hostname: test.com'));
      assert.ok(yaml.includes('service: http://localhost:8000'));
      assert.ok(yaml.includes('service: http_status:404'));
    } finally {
      cleanupTest();
    }
  });

  test('应该能创建模拟的快速隧道', async () => {
    createTestManager();
    try {
      const port = 8000;
      const tunnel = await tunnelLifecycle.mockCreateQuickTunnel(port);
      
      assert.strictEqual(tunnel.type, 'quick');
      assert.strictEqual(tunnel.port, port);
      assert.ok(tunnel.url.includes('trycloudflare.com'));
      assert.ok(tunnel.tunnelId);
      assert.ok(tunnel.createdAt);
      
      const status = tunnelLifecycle.getStatus();
      assert.strictEqual(status.processStatus, 'running');
      assert.ok(status.tunnel);
      assert.strictEqual(status.tunnel.port, port);
    } finally {
      cleanupTest();
    }
  });

  test('应该能创建模拟的命名隧道', async () => {
    createTestManager();
    try {
      const tunnelName = 'test-tunnel';
      const domain = 'test.example.com';
      const port = 3000;
      
      const tunnel = await tunnelLifecycle.mockCreateNamedTunnel(tunnelName, domain, port);
      
      assert.strictEqual(tunnel.type, 'named');
      assert.strictEqual(tunnel.tunnelName, tunnelName);
      assert.strictEqual(tunnel.domain, domain);
      assert.strictEqual(tunnel.port, port);
      assert.strictEqual(tunnel.url, `https://${domain}`);
      assert.ok(tunnel.configFile);
      assert.ok(existsSync(tunnel.configFile));
      
      const status = tunnelLifecycle.getStatus();
      assert.strictEqual(status.processStatus, 'running');
      assert.strictEqual(status.tunnel.type, 'named');
    } finally {
      cleanupTest();
    }
  });

  test('应该能添加和执行清理处理器', async () => {
    createTestManager();
    try {
      let handlerExecuted = false;
      
      tunnelLifecycle.addCleanupHandler(async () => {
        handlerExecuted = true;
      });
      
      await tunnelLifecycle.cleanup();
      
      assert.ok(handlerExecuted);
      
      const status = tunnelLifecycle.getStatus();
      assert.strictEqual(status.processStatus, 'stopped');
      assert.strictEqual(status.tunnel, null);
      assert.strictEqual(status.process, null);
    } finally {
      cleanupTest();
    }
  });

  test('清理应该删除配置文件', async () => {
    createTestManager();
    try {
      const tunnelId = 'test-cleanup';
      const domain = 'cleanup.test.com';
      const port = 9000;
      
      const configPath = await tunnelLifecycle.generateTunnelConfig(tunnelId, domain, port);
      assert.ok(existsSync(configPath));
      
      await tunnelLifecycle.cleanup();
      
      assert.ok(!existsSync(configPath));
      assert.strictEqual(tunnelLifecycle.getStatus().configFile, null);
    } finally {
      cleanupTest();
    }
  });

  test('状态信息应该正确反映隧道状态', async () => {
    createTestManager();
    try {
      // 初始状态
      let status = tunnelLifecycle.getStatus();
      assert.strictEqual(status.processStatus, 'stopped');
      
      // 创建隧道后的状态
      await tunnelLifecycle.mockCreateQuickTunnel(8080);
      status = tunnelLifecycle.getStatus();
      
      assert.strictEqual(status.processStatus, 'running');
      assert.ok(status.tunnel);
      assert.ok(status.process);
      assert.strictEqual(status.tunnel.port, 8080);
      assert.ok(status.process.pid);
      
      // 清理后的状态
      await tunnelLifecycle.cleanup();
      status = tunnelLifecycle.getStatus();
      
      assert.strictEqual(status.processStatus, 'stopped');
      assert.strictEqual(status.tunnel, null);
      assert.strictEqual(status.process, null);
    } finally {
      cleanupTest();
    }
  });
});