import chalk from 'chalk';
import { EnhancedLogger } from '../utils/enhanced-logger.js';
import { CloudflaredErrorType } from '../utils/cloudflared-error-parser.js';

/**
 * V2上下文感知错误处理器
 * 能够精确识别失败阶段并提供清晰的用户指引
 */
export class ErrorHandler {
  constructor() {
    this.logger = new EnhancedLogger('ErrorHandler-V2');
    this.errorContexts = new Map();
    this.recoveryStrategies = this.initializeRecoveryStrategies();
  }

  /**
   * 初始化恢复策略映射
   * @returns {Map} 错误类型到恢复策略的映射
   */
  initializeRecoveryStrategies() {
    const strategies = new Map();

    // 认证相关错误
    strategies.set(CloudflaredErrorType.AUTH_MISSING_CERT, {
      phase: '认证阶段',
      title: '缺少Cloudflare认证证书',
      description: '需要通过浏览器登录获取证书文件',
      solutions: [
        '运行浏览器登录: cloudflared tunnel login',
        '或使用API令牌模式进行认证'
      ],
      severity: 'error',
      recoverable: true,
      autoFix: false
    });

    strategies.set(CloudflaredErrorType.AUTH_EXPIRED_CERT, {
      phase: '认证阶段',
      title: 'Cloudflare认证证书已过期',
      description: '现有证书已过期，需要重新认证',
      solutions: [
        '重新运行浏览器登录: cloudflared tunnel login',
        '检查系统时间是否正确'
      ],
      severity: 'error',
      recoverable: true,
      autoFix: false
    });

    // DNS相关错误
    strategies.set(CloudflaredErrorType.DNS_RECORD_EXISTS, {
      phase: 'DNS配置阶段',
      title: 'DNS记录冲突',
      description: '域名已存在同名的DNS记录',
      solutions: [
        'DNS管理器将自动处理冲突',
        '选择更新现有记录或使用不同域名'
      ],
      severity: 'warning',
      recoverable: true,
      autoFix: true
    });

    strategies.set(CloudflaredErrorType.DNS_ZONE_NOT_FOUND, {
      phase: 'DNS配置阶段',
      title: '域名Zone未找到',
      description: '指定域名未在Cloudflare中找到',
      solutions: [
        '确认域名已添加到Cloudflare账户',
        '检查域名拼写是否正确',
        '确保使用根域名或其子域名'
      ],
      severity: 'error',
      recoverable: false,
      autoFix: false
    });

    // 隧道相关错误
    strategies.set(CloudflaredErrorType.TUNNEL_ALREADY_EXISTS, {
      phase: '隧道创建阶段',
      title: '隧道名称已存在',
      description: '同名隧道已存在',
      solutions: [
        '使用不同的隧道名称',
        '删除现有隧道后重新创建',
        '直接使用现有隧道'
      ],
      severity: 'warning',
      recoverable: true,
      autoFix: true
    });

    strategies.set(CloudflaredErrorType.TUNNEL_NOT_FOUND, {
      phase: '隧道管理阶段',
      title: '隧道未找到',
      description: '指定的隧道不存在',
      solutions: [
        '检查隧道名称或ID是否正确',
        '创建新的隧道',
        '查看现有隧道列表'
      ],
      severity: 'error',
      recoverable: true,
      autoFix: true
    });

    // 网络相关错误
    strategies.set(CloudflaredErrorType.NETWORK_TIMEOUT, {
      phase: '网络连接阶段',
      title: '网络操作超时',
      description: '请求超时，可能是网络问题',
      solutions: [
        '检查网络连接',
        '稍后重试',
        '检查防火墙设置'
      ],
      severity: 'warning',
      recoverable: true,
      autoFix: false
    });

    strategies.set(CloudflaredErrorType.NETWORK_CONNECTION_FAILED, {
      phase: '网络连接阶段',
      title: '网络连接失败',
      description: '无法连接到远程服务',
      solutions: [
        '检查网络连接',
        '检查代理设置',
        '确认防火墙允许连接'
      ],
      severity: 'error',
      recoverable: true,
      autoFix: false
    });

    // 配置相关错误
    strategies.set(CloudflaredErrorType.CONFIG_FILE_INVALID, {
      phase: '配置阶段',
      title: '配置文件无效',
      description: '配置文件格式错误或内容无效',
      solutions: [
        '检查YAML语法',
        '重新生成配置文件',
        '删除损坏的配置文件'
      ],
      severity: 'error',
      recoverable: true,
      autoFix: true
    });

    // 进程相关错误
    strategies.set(CloudflaredErrorType.PROCESS_STARTUP_FAILED, {
      phase: '进程启动阶段',
      title: '进程启动失败',
      description: 'cloudflared进程无法启动',
      solutions: [
        '检查cloudflared是否正确安装',
        '检查系统权限',
        '查看详细错误日志'
      ],
      severity: 'error',
      recoverable: true,
      autoFix: false
    });

    return strategies;
  }

  /**
   * 处理错误并提供用户友好的指引
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @returns {Object} 处理后的错误信息
   */
  handleError(error, context = {}) {
    this.logger.logError('处理错误', error, context);

    // 保存错误上下文
    const errorId = this.generateErrorId();
    this.errorContexts.set(errorId, {
      error,
      context,
      timestamp: Date.now()
    });

    // 解析错误类型
    const errorType = this.identifyErrorType(error, context);
    const strategy = this.recoveryStrategies.get(errorType);

    if (!strategy) {
      return this.handleUnknownError(error, context, errorId);
    }

    return this.createErrorResponse(error, strategy, context, errorId);
  }

  /**
   * 识别错误类型
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @returns {string} 错误类型
   */
  identifyErrorType(error, context) {
    // 优先使用上下文中的错误类型
    if (context.errorType) {
      return context.errorType;
    }

    // 安全获取错误消息
    const errorMessage = error?.message || error?.toString() || '未知错误';
    const message = errorMessage.toLowerCase();

    // 认证错误
    if (message.includes('cert.pem') || message.includes('certificate')) {
      if (message.includes('expired')) {
        return CloudflaredErrorType.AUTH_EXPIRED_CERT;
      }
      return CloudflaredErrorType.AUTH_MISSING_CERT;
    }

    // DNS错误
    if (message.includes('dns') || message.includes('domain')) {
      if (message.includes('already exists') || message.includes('conflict')) {
        return CloudflaredErrorType.DNS_RECORD_EXISTS;
      }
      if (message.includes('zone') && message.includes('not found')) {
        return CloudflaredErrorType.DNS_ZONE_NOT_FOUND;
      }
    }

    // 隧道错误
    if (message.includes('tunnel')) {
      if (message.includes('already exists')) {
        return CloudflaredErrorType.TUNNEL_ALREADY_EXISTS;
      }
      if (message.includes('not found')) {
        return CloudflaredErrorType.TUNNEL_NOT_FOUND;
      }
    }

    // 网络错误
    if (message.includes('timeout') || message.includes('timed out')) {
      return CloudflaredErrorType.NETWORK_TIMEOUT;
    }
    if (message.includes('connection') && message.includes('failed')) {
      return CloudflaredErrorType.NETWORK_CONNECTION_FAILED;
    }

    // 配置错误
    if (message.includes('config') && message.includes('invalid')) {
      return CloudflaredErrorType.CONFIG_FILE_INVALID;
    }

    // 进程错误
    if (message.includes('spawn') || message.includes('process')) {
      return CloudflaredErrorType.PROCESS_STARTUP_FAILED;
    }

    // 根据阶段推断
    if (context.phase) {
      switch (context.phase) {
        case 'authentication':
          return CloudflaredErrorType.AUTH_MISSING_CERT;
        case 'dns':
          return CloudflaredErrorType.DNS_ZONE_NOT_FOUND;
        case 'tunnel':
          return CloudflaredErrorType.TUNNEL_NOT_FOUND;
        case 'network':
          return CloudflaredErrorType.NETWORK_CONNECTION_FAILED;
      }
    }

    return CloudflaredErrorType.UNKNOWN;
  }

  /**
   * 创建错误响应
   * @param {Error} error - 原始错误
   * @param {Object} strategy - 恢复策略
   * @param {Object} context - 错误上下文
   * @param {string} errorId - 错误ID
   * @returns {Object} 错误响应
   */
  createErrorResponse(error, strategy, context, errorId) {
    return {
      errorId,
      phase: strategy.phase,
      title: strategy.title,
      description: strategy.description,
      originalError: error.message,
      severity: strategy.severity,
      recoverable: strategy.recoverable,
      autoFix: strategy.autoFix,
      solutions: strategy.solutions,
      context,
      timestamp: Date.now(),
      displayMessage: this.formatUserMessage(strategy, context)
    };
  }

  /**
   * 处理未知错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @param {string} errorId - 错误ID
   * @returns {Object} 错误响应
   */
  handleUnknownError(error, context, errorId) {
    return {
      errorId,
      phase: context.phase || '未知阶段',
      title: '未知错误',
      description: '遇到了未识别的错误',
      originalError: error.message,
      severity: 'error',
      recoverable: false,
      autoFix: false,
      solutions: [
        '请记录错误信息并报告给开发者',
        '尝试重新运行命令',
        '检查系统环境和网络连接'
      ],
      context,
      timestamp: Date.now(),
      displayMessage: this.formatGenericErrorMessage(error, context)
    };
  }

  /**
   * 格式化用户友好的错误消息
   * @param {Object} strategy - 恢复策略
   * @param {Object} context - 错误上下文
   * @returns {string} 格式化的消息
   */
  formatUserMessage(strategy, context) {
    const lines = [];

    // 错误标题
    lines.push(`❌ ${strategy.title}`);
    lines.push('');

    // 阶段信息
    if (strategy.phase) {
      lines.push(`📍 ${chalk.yellow(`失败阶段: ${strategy.phase}`)}`);
    }

    // 描述
    lines.push(`💭 ${strategy.description}`);

    // 严重级别
    const severityIcon = strategy.severity === 'error' ? '🚨' : 
                        strategy.severity === 'warning' ? '⚠️' : 'ℹ️';
    lines.push(`${severityIcon} ${strategy.severity === 'error' ? '严重错误' : 
                                strategy.severity === 'warning' ? '警告' : '提示'}`);

    // 自动修复提示
    if (strategy.autoFix) {
      lines.push(`🔧 ${chalk.green('系统将尝试自动修复此问题')}`);
    }

    // 解决方案
    if (strategy.solutions.length > 0) {
      lines.push('');
      lines.push(`💡 ${chalk.blue('建议解决方案:')}`);
      strategy.solutions.forEach((solution, index) => {
        lines.push(`   ${index + 1}. ${solution}`);
      });
    }

    // 上下文信息
    if (context.domain) {
      lines.push('');
      lines.push(`🌍 涉及域名: ${context.domain}`);
    }

    if (context.tunnelId) {
      lines.push(`🚇 涉及隧道: ${context.tunnelId}`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化通用错误消息
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @returns {string} 格式化的消息
   */
  formatGenericErrorMessage(error, context) {
    const lines = [];

    lines.push(`❌ ${chalk.red('发生未知错误')}`);
    lines.push('');

    if (context.phase) {
      lines.push(`📍 ${chalk.yellow(`失败阶段: ${context.phase}`)}`);
    }

    lines.push(`💭 ${error.message}`);

    lines.push('');
    lines.push(`💡 ${chalk.blue('建议:')}`);
    lines.push('   1. 请记录以下错误信息');
    lines.push('   2. 检查网络连接和系统环境');
    lines.push('   3. 重试操作或联系技术支持');

    if (context.debug) {
      lines.push('');
      lines.push(`🔍 ${chalk.gray('调试信息:')}`);
      lines.push(chalk.gray(JSON.stringify(context, null, 2)));
    }

    return lines.join('\n');
  }

  /**
   * 显示错误信息给用户
   * @param {Object} errorResponse - 错误响应对象
   */
  displayError(errorResponse) {
    console.log('\n' + errorResponse.displayMessage);

    // 如果可恢复且不需要自动修复，显示手动操作提示
    if (errorResponse.recoverable && !errorResponse.autoFix) {
      console.log('\n' + chalk.cyan('请按照上述建议操作后重新运行命令。'));
    }
  }

  /**
   * 检查错误是否可以自动恢复
   * @param {string} errorType - 错误类型
   * @returns {boolean} 是否可自动恢复
   */
  canAutoRecover(errorType) {
    const strategy = this.recoveryStrategies.get(errorType);
    return strategy ? strategy.autoFix : false;
  }

  /**
   * 获取错误的严重级别
   * @param {string} errorType - 错误类型
   * @returns {string} 严重级别
   */
  getErrorSeverity(errorType) {
    const strategy = this.recoveryStrategies.get(errorType);
    return strategy ? strategy.severity : 'error';
  }

  /**
   * 生成唯一错误ID
   * @returns {string} 错误ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  /**
   * 获取错误统计信息
   * @returns {Object} 错误统计
   */
  getErrorStats() {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);

    const recentErrors = Array.from(this.errorContexts.values())
      .filter(ctx => ctx.timestamp > last24h);

    const typeStats = {};
    recentErrors.forEach(ctx => {
      const type = this.identifyErrorType(ctx.error, ctx.context);
      typeStats[type] = (typeStats[type] || 0) + 1;
    });

    return {
      total: this.errorContexts.size,
      recent24h: recentErrors.length,
      typeDistribution: typeStats
    };
  }

  /**
   * 清理过期的错误上下文
   */
  cleanupOldErrors() {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天

    for (const [id, context] of this.errorContexts.entries()) {
      if (now - context.timestamp > maxAge) {
        this.errorContexts.delete(id);
      }
    }
  }

  /**
   * 获取支持的错误类型列表
   * @returns {Array} 支持的错误类型
   */
  getSupportedErrorTypes() {
    return Array.from(this.recoveryStrategies.keys());
  }
}