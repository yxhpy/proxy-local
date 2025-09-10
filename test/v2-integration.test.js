import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// 导入V2模块
import { ConfigManager } from '../src/v2/config-manager.js';
import { ValidationEngine } from '../src/v2/validation-engine.js';
import { TunnelLifecycle } from '../src/v2/tunnel-lifecycle.js';
import { DNSManager } from '../src/v2/dns-manager.js';
import { ErrorHandler } from '../src/v2/error-handler.js';
import { UserGuidance } from '../src/v2/user-guidance.js';
import { CloudflareV2Provider } from '../src/v2/cloudflare-v2-provider.js';

describe('V2系统集成测试', () => {
  let testDir;
  
  function setupTestEnvironment() {
    testDir = join(tmpdir(), 'v2-integration-test-' + Date.now());
    mkdirSync(testDir, { recursive: true });
    
    // 设置测试环境变量
    process.env.HOME = testDir;
    process.env.UVX_TEST_MODE = 'true';
    process.env.NON_INTERACTIVE = 'true';
  }
  
  function cleanupTestEnvironment() {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    
    // 清理环境变量
    delete process.env.UVX_TEST_MODE;
    delete process.env.NON_INTERACTIVE;
    delete process.env.UVX_CUSTOM_DOMAIN;
  }

  test('所有V2模块应该能正确初始化', () => {
    setupTestEnvironment();
    try {
      // 测试ConfigManager
      const configManager = new ConfigManager();
      assert.ok(configManager, 'ConfigManager应该能初始化');
      
      // 测试ValidationEngine
      const validationEngine = new ValidationEngine();
      assert.ok(validationEngine, 'ValidationEngine应该能初始化');
      
      // 测试TunnelLifecycle
      const tunnelLifecycle = new TunnelLifecycle(configManager);
      assert.ok(tunnelLifecycle, 'TunnelLifecycle应该能初始化');
      
      // 测试DNSManager
      const dnsManager = new DNSManager(configManager);
      assert.ok(dnsManager, 'DNSManager应该能初始化');
      
      // 测试ErrorHandler
      const errorHandler = new ErrorHandler();
      assert.ok(errorHandler, 'ErrorHandler应该能初始化');
      
      // 测试UserGuidance
      const userGuidance = new UserGuidance();
      assert.ok(userGuidance, 'UserGuidance应该能初始化');
      
      // 测试CloudflareV2Provider
      const provider = new CloudflareV2Provider();
      assert.ok(provider, 'CloudflareV2Provider应该能初始化');
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('ConfigManager与其他模块的集成', async () => {
    setupTestEnvironment();
    try {
      const configManager = new ConfigManager();
      
      // 测试与TunnelLifecycle的集成
      const tunnelLifecycle = new TunnelLifecycle(configManager);
      const tunnelStatus = tunnelLifecycle.getStatus();
      assert.strictEqual(tunnelStatus.processStatus, 'stopped');
      
      // 测试与DNSManager的集成
      const dnsManager = new DNSManager(configManager);
      const dnsStatus = await dnsManager.getStatus();
      assert.strictEqual(dnsStatus.ready, true);
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('ErrorHandler应该能正确处理不同类型的错误', () => {
    setupTestEnvironment();
    try {
      const errorHandler = new ErrorHandler();
      
      // 测试认证错误处理
      const authError = new Error('cert.pem not found');
      const authResult = errorHandler.handleError(authError, { phase: 'authentication' });
      
      assert.strictEqual(authResult.phase, '认证阶段');
      assert.strictEqual(authResult.recoverable, true);
      assert.ok(authResult.solutions.length > 0);
      
      // 测试DNS错误处理
      const dnsError = new Error('DNS record already exists');
      const dnsResult = errorHandler.handleError(dnsError, { phase: 'dns' });
      
      assert.strictEqual(dnsResult.severity, 'warning');
      assert.strictEqual(dnsResult.autoFix, true);
      
      // 测试网络错误处理
      const networkError = new Error('Connection timeout');
      const networkResult = errorHandler.handleError(networkError);
      
      assert.ok(networkResult.solutions.length > 0);
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('UserGuidance应该能正确管理会话状态', () => {
    setupTestEnvironment();
    try {
      const userGuidance = new UserGuidance();
      
      // 检查初始状态
      const initialStatus = userGuidance.getStatus();
      assert.ok(initialStatus.sessionId);
      assert.strictEqual(initialStatus.currentStep, null);
      
      // 检查模块初始化状态
      assert.ok(initialStatus.modules);
      assert.strictEqual(initialStatus.modules.configManager, 'initialized');
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('CloudflareV2Provider应该提供正确的特性信息', () => {
    setupTestEnvironment();
    try {
      const provider = new CloudflareV2Provider();
      
      // 检查基本信息
      assert.strictEqual(provider.name, 'cloudflare-v2');
      assert.strictEqual(provider.displayName, 'Cloudflare V2 (推荐)');
      
      // 检查特性
      const features = provider.getFeatures();
      assert.strictEqual(features.supportsCustomDomains, true);
      assert.strictEqual(features.supportsHttps, true);
      assert.strictEqual(features.requiresAuth, false);
      assert.strictEqual(features.speed, 'fast');
      assert.strictEqual(features.reliability, 'excellent');
      
      // 检查提供商信息
      const info = provider.getInfo();
      assert.strictEqual(info.name, 'cloudflare-v2');
      assert.strictEqual(info.version, '2.0.0');
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('V2系统应该能处理预检失败的情况', async () => {
    setupTestEnvironment();
    try {
      const userGuidance = new UserGuidance();
      
      // 模拟预检失败的情况（通过设置无效环境）
      const originalPath = process.env.PATH;
      process.env.PATH = '/nonexistent';
      
      try {
        await userGuidance.performPreflightChecks();
        assert.fail('预检应该失败');
      } catch (error) {
        // 错误可能是字符串或对象，V2的错误处理器返回复杂对象
        let errorMessage = '';
        
        if (typeof error === 'string') {
          errorMessage = error;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (error.originalError) {
          errorMessage = error.originalError;
        } else if (error.title) {
          errorMessage = error.title;
        } else {
          errorMessage = JSON.stringify(error);
        }
        
        console.log('Caught error:', errorMessage); // 调试信息
        
        // 检查多种可能的错误消息
        const hasExpectedError = errorMessage.includes('预检失败') || 
                                errorMessage.includes('环境预检失败') ||
                                errorMessage.includes('未通过') ||
                                errorMessage.includes('failed') ||
                                error.phase === '环境预检';
        
        assert.ok(hasExpectedError || error.phase, `Expected error related to preflight checks, got: ${errorMessage}`);
      } finally {
        process.env.PATH = originalPath;
      }
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('V2系统的错误恢复机制', () => {
    setupTestEnvironment();
    try {
      const errorHandler = new ErrorHandler();
      
      // 测试可自动恢复的错误
      const autoFixableError = new Error('Config file invalid');
      const result = errorHandler.handleError(autoFixableError, { phase: 'configuration' });
      
      assert.strictEqual(result.autoFix, true);
      assert.ok(errorHandler.canAutoRecover(result.errorType || 'config_file_invalid'));
      
      // 测试不可自动恢复的错误
      const nonAutoFixableError = new Error('Zone not found');
      const nonAutoResult = errorHandler.handleError(nonAutoFixableError, { phase: 'dns' });
      
      assert.strictEqual(nonAutoResult.autoFix, false);
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('V2系统状态监控和清理', async () => {
    setupTestEnvironment();
    try {
      const userGuidance = new UserGuidance();
      
      // 检查初始状态
      const initialStatus = userGuidance.getStatus();
      assert.ok(initialStatus.sessionId);
      
      // 执行清理
      await userGuidance.cleanup();
      
      // 清理应该成功完成而不抛出错误
      assert.ok(true, '清理应该成功完成');
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('V2系统的兼容性接口', async () => {
    setupTestEnvironment();
    try {
      const provider = new CloudflareV2Provider();
      
      // 测试认证检查
      const isAuth = await provider.isAuthenticated();
      assert.strictEqual(typeof isAuth, 'boolean');
      
      // 测试认证模式设置
      provider.setAuthMode(true, 'test-domain');
      assert.strictEqual(process.env.UVX_CUSTOM_DOMAIN, 'test-domain');
      
      // 测试域名重置
      provider.resetDomainConfiguration();
      assert.strictEqual(process.env.UVX_CUSTOM_DOMAIN, undefined);
      
      // 测试状态获取
      const status = provider.getStatus();
      assert.strictEqual(status.status, 'inactive');
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('V2系统错误统计和监控', () => {
    setupTestEnvironment();
    try {
      const errorHandler = new ErrorHandler();
      
      // 处理几个错误
      errorHandler.handleError(new Error('Test error 1'), { phase: 'test' });
      errorHandler.handleError(new Error('Test error 2'), { phase: 'test' });
      
      // 检查错误统计
      const stats = errorHandler.getErrorStats();
      assert.strictEqual(stats.total, 2);
      assert.ok(stats.recent24h >= 0);
      assert.ok(stats.typeDistribution);
      
      // 检查支持的错误类型
      const supportedTypes = errorHandler.getSupportedErrorTypes();
      assert.ok(Array.isArray(supportedTypes));
      assert.ok(supportedTypes.length > 0);
      
      // 测试清理功能
      errorHandler.cleanupOldErrors();
      
    } finally {
      cleanupTestEnvironment();
    }
  });

  test('V2系统完整模块链路测试', async () => {
    setupTestEnvironment();
    try {
      const configManager = new ConfigManager();
      const errorHandler = new ErrorHandler();
      
      // 创建完整的模块链
      const tunnelLifecycle = new TunnelLifecycle(configManager);
      const dnsManager = new DNSManager(configManager);
      const userGuidance = new UserGuidance();
      const provider = new CloudflareV2Provider();
      
      // 验证模块间的依赖关系
      assert.ok(tunnelLifecycle.configManager === configManager);
      assert.ok(dnsManager.configManager === configManager);
      
      // 验证所有模块都能正常获取状态
      const tunnelStatus = tunnelLifecycle.getStatus();
      const dnsStatus = await dnsManager.getStatus();
      const guidanceStatus = userGuidance.getStatus();
      const providerStatus = provider.getStatus();
      
      assert.ok(tunnelStatus);
      assert.ok(dnsStatus);
      assert.ok(guidanceStatus);
      assert.ok(providerStatus);
      
    } finally {
      cleanupTestEnvironment();
    }
  });
});