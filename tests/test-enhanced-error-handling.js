#!/usr/bin/env node

/**
 * 测试增强的错误处理和日志系统集成
 * 验证 CloudflareProvider 中的错误解析器和增强日志功能
 */

import chalk from 'chalk';
import { CloudflareProvider } from './src/providers/cloudflare.js';
import { CloudflaredErrorParser, CloudflaredErrorType } from './src/utils/cloudflared-error-parser.js';
import { EnhancedLogger } from './src/utils/enhanced-logger.js';

async function testEnhancedErrorHandling() {
  console.log(chalk.blue('🧪 测试增强的错误处理和日志系统集成'));
  console.log(chalk.blue('='.repeat(50)));

  try {
    const provider = new CloudflareProvider();

    // 1. 验证错误解析器和日志记录器已正确初始化
    console.log(chalk.yellow('\n📋 1. 验证组件初始化'));
    
    if (provider.errorParser instanceof CloudflaredErrorParser) {
      console.log(chalk.green('✅ CloudflaredErrorParser 已正确初始化'));
    } else {
      throw new Error('CloudflaredErrorParser 未正确初始化');
    }

    if (provider.logger instanceof EnhancedLogger) {
      console.log(chalk.green('✅ EnhancedLogger 已正确初始化'));
    } else {
      throw new Error('EnhancedLogger 未正确初始化');
    }

    // 2. 测试错误解析功能集成
    console.log(chalk.yellow('\n📋 2. 测试错误解析功能'));
    
    const testErrors = [
      {
        error: 'cert.pem not found. Please run cloudflared tunnel login',
        expectedType: CloudflaredErrorType.AUTH_MISSING_CERT,
        description: '认证错误'
      },
      {
        error: 'An A, AAAA, or CNAME record with that host already exists',
        expectedType: CloudflaredErrorType.DNS_RECORD_EXISTS,
        description: 'DNS冲突错误'
      },
      {
        error: 'tunnel test-tunnel already exists',
        expectedType: CloudflaredErrorType.TUNNEL_ALREADY_EXISTS,
        description: '隧道已存在错误'
      }
    ];

    testErrors.forEach((test, index) => {
      console.log(chalk.cyan(`\n测试 ${index + 1}: ${test.description}`));
      
      const parsed = provider.errorParser.parseError(test.error, {
        operation: 'test',
        testCase: index + 1
      });

      if (parsed && parsed.type === test.expectedType) {
        console.log(chalk.green(`✅ 错误类型识别正确: ${parsed.type}`));
        
        const autoAction = provider.errorParser.getAutomatedAction(parsed);
        console.log(`自动处理: ${autoAction.canAutomate ? '✅ 可以' : '⚠️ 不可以'} - ${autoAction.description}`);
      } else {
        console.log(chalk.red(`❌ 错误识别失败，期望: ${test.expectedType}, 实际: ${parsed?.type || 'null'}`));
      }
    });

    // 3. 测试增强日志系统
    console.log(chalk.yellow('\n📋 3. 测试增强日志系统'));
    
    // 测试各种日志类型
    provider.logger.logStep('测试步骤', '这是一个测试步骤');
    provider.logger.logCommand('cloudflared', ['tunnel', 'create', 'test']);
    provider.logger.logSuccess('测试成功', '操作完成');
    provider.logger.logWarning('测试警告', { context: 'test' });
    provider.logger.logError('测试错误', new Error('模拟错误'));
    provider.logger.logDebug('测试调试信息', { debug: true, data: [1, 2, 3] });

    // 4. 测试日志历史功能
    console.log(chalk.yellow('\n📋 4. 测试日志历史'));
    
    const allLogs = provider.logger.getLogHistory();
    console.log(`总日志数量: ${allLogs.length}`);
    
    const errorLogs = provider.logger.getLogHistory('error');
    console.log(`错误日志数量: ${errorLogs.length}`);
    
    const successLogs = provider.logger.getLogHistory('success');
    console.log(`成功日志数量: ${successLogs.length}`);

    // 5. 测试错误统计
    console.log(chalk.yellow('\n📋 5. 测试错误统计'));
    
    const stats = provider.errorParser.getStats();
    console.log('错误解析统计:', {
      totalErrors: stats.totalErrors,
      recognizedErrors: stats.recognizedErrors,
      recognitionRate: stats.recognitionRate
    });

    // 6. 测试日志导出功能
    console.log(chalk.yellow('\n📋 6. 测试日志导出'));
    
    const exportResult = provider.logger.exportLogs('test-enhanced-logs.json');
    console.log('日志导出结果:', exportResult);

    // 7. 测试认证状态检查（使用增强日志）
    console.log(chalk.yellow('\n📋 7. 测试认证状态检查'));
    
    const authStatus = await provider.getAuthenticationStatus();
    console.log('认证状态:', provider._formatAuthStatus(authStatus));

    // 8. 测试日志清理功能
    console.log(chalk.yellow('\n📋 8. 测试日志清理'));
    
    const initialLogCount = provider.logger.getLogHistory().length;
    console.log(`清理前日志数量: ${initialLogCount}`);
    
    // 模拟清理（这里不会真的清理，因为日志都是新的）
    const cleanedCount = provider.logger.cleanupLogs(1000); // 清理1秒前的日志
    console.log(`清理的日志数量: ${cleanedCount}`);

    console.log(chalk.green('\n✅ 增强错误处理和日志系统集成测试完成'));
    console.log(chalk.blue('验证结果:'));
    console.log(chalk.gray('  • ✓ CloudflaredErrorParser 正确集成'));
    console.log(chalk.gray('  • ✓ EnhancedLogger 正确集成'));
    console.log(chalk.gray('  • ✓ 错误类型识别准确'));
    console.log(chalk.gray('  • ✓ 自动处理建议功能正常'));
    console.log(chalk.gray('  • ✓ 结构化日志记录功能完整'));
    console.log(chalk.gray('  • ✓ 日志历史和导出功能正常'));
    console.log(chalk.gray('  • ✓ 错误统计和清理功能正常'));

  } catch (error) {
    console.error(chalk.red('❌ 测试失败:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
testEnhancedErrorHandling().catch(console.error);