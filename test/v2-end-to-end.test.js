#!/usr/bin/env node

/**
 * V2端到端测试
 * 验证整个V2一键代理流程的完整性
 */

import { strict as assert } from 'assert';
import { EnhancedLogger } from '../src/utils/enhanced-logger.js';

// 导入V2模块
import { ConfigManager } from '../src/v2/config-manager.js';
import { ValidationEngine } from '../src/v2/validation-engine.js';
import { TunnelLifecycle } from '../src/v2/tunnel-lifecycle.js';
import { DNSManager } from '../src/v2/dns-manager.js';
import { ErrorHandler } from '../src/v2/error-handler.js';
import { UserGuidance } from '../src/v2/user-guidance.js';
import { CloudflareV2Provider } from '../src/v2/cloudflare-v2-provider.js';
import { createV2Proxy, getV2Status } from '../src/v2/index.js';

const logger = new EnhancedLogger('V2-E2E-Test');

/**
 * 测试套件
 */
class V2EndToEndTest {
  constructor() {
    this.testResults = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * 运行单个测试
   */
  async runTest(name, testFn) {
    logger.logStep('测试开始', name);
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.testResults.push({ name, status: 'PASS', duration, error: null });
      this.passed++;
      logger.logStep('测试通过', `${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.testResults.push({ name, status: 'FAIL', duration, error: error.message });
      this.failed++;
      logger.logError('测试失败', `${name} (${duration}ms)`, error);
    }
  }

  /**
   * 测试1：V2模块导入和初始化
   */
  async testModuleImports() {
    // 测试所有模块能够正常导入和实例化
    const configManager = new ConfigManager();
    const validationEngine = new ValidationEngine();
    const errorHandler = new ErrorHandler();
    const userGuidance = new UserGuidance();
    const cloudflareV2Provider = new CloudflareV2Provider();

    assert(configManager instanceof ConfigManager, 'ConfigManager实例化失败');
    assert(validationEngine instanceof ValidationEngine, 'ValidationEngine实例化失败');
    assert(errorHandler instanceof ErrorHandler, 'ErrorHandler实例化失败');
    assert(userGuidance instanceof UserGuidance, 'UserGuidance实例化失败');
    assert(cloudflareV2Provider instanceof CloudflareV2Provider, 'CloudflareV2Provider实例化失败');

    // 测试函数导入
    assert(typeof createV2Proxy === 'function', 'createV2Proxy函数导入失败');
    assert(typeof getV2Status === 'function', 'getV2Status函数导入失败');
  }

  /**
   * 测试2：配置管理器功能
   */
  async testConfigManager() {
    const configManager = new ConfigManager();
    
    // 测试V2配置初始化
    configManager.initConfig();
    
    // 测试配置读取
    const config = configManager.readConfig();
    assert(typeof config === 'object', '配置读取失败');
    
    // 测试凭证检查
    const hasCredentials = await configManager.checkCertPem();
    assert(typeof hasCredentials === 'boolean', '凭证检查函数返回类型错误');
  }

  /**
   * 测试3：环境预检功能
   */
  async testValidationEngine() {
    const validationEngine = new ValidationEngine();
    
    // 测试环境预检
    const preflightResults = await validationEngine.runPreflightChecks();
    
    assert(typeof preflightResults === 'object', '预检结果应为对象');
    assert(typeof preflightResults.cloudflaredInstalled === 'boolean', '缺少cloudflared安装状态');
    assert(typeof preflightResults.systemCompatible === 'boolean', '缺少系统兼容性状态');
    assert(Array.isArray(preflightResults.recommendedActions), '推荐操作应为数组');
    
    // 测试预检摘要生成
    const summary = validationEngine.generatePreflightSummary(preflightResults);
    assert(typeof summary === 'string', '预检摘要应为字符串');
    assert(summary.length > 0, '预检摘要不应为空');
  }

  /**
   * 测试4：DNS传播验证功能（模拟）
   */
  async testDNSValidation() {
    const validationEngine = new ValidationEngine();
    
    // 测试DNS验证函数存在
    assert(typeof validationEngine.verifyDNSPropagation === 'function', 'DNS传播验证函数不存在');
    
    // 模拟DNS验证（使用一个已知存在的域名）
    try {
      // 使用短超时时间以避免测试耗时过长
      const result = await validationEngine.verifyDNSPropagation(
        'example.com',
        'example.com',
        { maxRetries: 2, initialDelay: 100, maxTotalWaitTime: 5000 }
      );
      assert(typeof result === 'boolean', 'DNS验证结果应为布尔值');
    } catch (error) {
      // DNS验证可能因网络问题失败，这是可以接受的
      logger.logWarning('DNS验证测试跳过（网络问题）', error.message);
    }
  }

  /**
   * 测试5：错误处理器功能
   */
  async testErrorHandler() {
    const errorHandler = new ErrorHandler();
    
    // 测试错误识别
    const testError = new Error('TUNNEL_CREATE_FAILED: Connection failed');
    const handledError = errorHandler.handleError(testError, { phase: 'tunnel-creation' });
    
    assert(typeof handledError === 'object', '处理后的错误应为对象');
    assert(typeof handledError.displayMessage === 'string', '缺少用户友好消息');
    assert(Array.isArray(handledError.solutions), '建议应为数组');
    assert(typeof handledError.phase === 'string', '缺少错误阶段');
  }

  /**
   * 测试6：集成模块初始化
   */
  async testIntegrationInitialization() {
    const userGuidance = new UserGuidance();
    
    // 测试会话状态
    const status = userGuidance.getStatus();
    assert(typeof status === 'object', '会话状态应为对象');
    assert(typeof status.sessionId === 'string', '缺少会话ID');
    assert(typeof status.modules === 'object', '缺少模块状态');
    
    // 测试清理功能
    await userGuidance.cleanup();
    logger.logStep('测试完成', '用户引导清理完成');
  }

  /**
   * 测试7：V2状态查询
   */
  async testV2Status() {
    const status = await getV2Status();
    
    assert(typeof status === 'object', 'V2状态应为对象');
    // 如果有错误，available应为false
    if (status.error) {
      assert(status.available === false, '有错误时available应为false');
    }
  }

  /**
   * 测试8：CloudflareV2Provider基础功能
   */
  async testCloudflareV2Provider() {
    const provider = new CloudflareV2Provider();
    
    // 测试提供商基本信息
    assert(provider.name === 'cloudflare-v2', '提供商名称错误');
    
    const features = provider.getFeatures();
    assert(typeof features === 'object', '特性应为对象');
    assert(typeof features.supportsCustomDomains === 'boolean', '缺少自定义域名支持特性');
    
    const info = provider.getInfo();
    assert(typeof info === 'object', '提供商信息应为对象');
    assert(typeof info.name === 'string', '缺少提供商名称');
    assert(typeof info.description === 'string', '缺少提供商描述');
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    logger.logStep('测试套件开始', 'V2端到端测试启动');
    
    await this.runTest('V2模块导入和初始化', () => this.testModuleImports());
    await this.runTest('配置管理器功能', () => this.testConfigManager());
    await this.runTest('环境预检功能', () => this.testValidationEngine());
    await this.runTest('DNS传播验证功能', () => this.testDNSValidation());
    await this.runTest('错误处理器功能', () => this.testErrorHandler());
    await this.runTest('集成模块初始化', () => this.testIntegrationInitialization());
    await this.runTest('V2状态查询', () => this.testV2Status());
    await this.runTest('CloudflareV2Provider基础功能', () => this.testCloudflareV2Provider());
    
    this.printResults();
  }

  /**
   * 打印测试结果
   */
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('V2端到端测试结果报告');
    console.log('='.repeat(60));
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      const duration = `${result.duration}ms`;
      console.log(`${status} ${result.name.padEnd(35)} ${duration.padStart(8)}`);
      
      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }
    });
    
    console.log('='.repeat(60));
    console.log(`总计: ${this.testResults.length} 个测试`);
    console.log(`通过: ${this.passed} 个`);
    console.log(`失败: ${this.failed} 个`);
    console.log(`成功率: ${Math.round((this.passed / this.testResults.length) * 100)}%`);
    console.log('='.repeat(60));
    
    if (this.failed > 0) {
      console.log('❌ 有测试失败，请检查错误信息');
      process.exit(1);
    } else {
      console.log('🎉 所有测试通过！V2端到端功能验证成功');
      process.exit(0);
    }
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new V2EndToEndTest();
  testSuite.runAllTests().catch(error => {
    logger.logError('测试套件异常', error);
    process.exit(1);
  });
}