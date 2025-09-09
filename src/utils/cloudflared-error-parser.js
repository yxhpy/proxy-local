import chalk from 'chalk';

/**
 * Cloudflared错误类型枚举
 */
export const CloudflaredErrorType = {
  // 认证相关错误
  AUTH_MISSING_CERT: 'auth_missing_cert',
  AUTH_INVALID_CERT: 'auth_invalid_cert',
  AUTH_EXPIRED_CERT: 'auth_expired_cert',
  AUTH_PERMISSION_DENIED: 'auth_permission_denied',

  // DNS相关错误
  DNS_RECORD_EXISTS: 'dns_record_exists',
  DNS_ZONE_NOT_FOUND: 'dns_zone_not_found',
  DNS_PERMISSION_DENIED: 'dns_permission_denied',
  DNS_INVALID_DOMAIN: 'dns_invalid_domain',

  // 隧道相关错误
  TUNNEL_ALREADY_EXISTS: 'tunnel_already_exists',
  TUNNEL_NOT_FOUND: 'tunnel_not_found',
  TUNNEL_DELETION_FAILED: 'tunnel_deletion_failed',
  TUNNEL_CONNECTION_FAILED: 'tunnel_connection_failed',

  // 网络相关错误
  NETWORK_TIMEOUT: 'network_timeout',
  NETWORK_CONNECTION_FAILED: 'network_connection_failed',
  NETWORK_DNS_RESOLUTION: 'network_dns_resolution',

  // 配置相关错误
  CONFIG_FILE_MISSING: 'config_file_missing',
  CONFIG_FILE_INVALID: 'config_file_invalid',
  CONFIG_INGRESS_INVALID: 'config_ingress_invalid',

  // 进程相关错误
  PROCESS_STARTUP_FAILED: 'process_startup_failed',
  PROCESS_UNEXPECTED_EXIT: 'process_unexpected_exit',
  PROCESS_KILLED: 'process_killed',

  // 未知错误
  UNKNOWN: 'unknown'
};

/**
 * 错误模式匹配规则
 */
const ERROR_PATTERNS = [
  // 认证错误
  {
    pattern: /cert\.pem|origin cert|origincert/i,
    type: CloudflaredErrorType.AUTH_MISSING_CERT,
    severity: 'error',
    action: 'run_cloudflared_login'
  },
  {
    pattern: /certificate.*expired|cert.*expired/i,
    type: CloudflaredErrorType.AUTH_EXPIRED_CERT,
    severity: 'error',
    action: 'renew_certificate'
  },
  {
    pattern: /authentication.*failed|unauthorized|permission denied.*auth/i,
    type: CloudflaredErrorType.AUTH_PERMISSION_DENIED,
    severity: 'error',
    action: 'check_credentials'
  },

  // DNS错误
  {
    pattern: /An A, AAAA, or CNAME record with that host already exists|record.*already exists/i,
    type: CloudflaredErrorType.DNS_RECORD_EXISTS,
    severity: 'warning',
    action: 'resolve_dns_conflict'
  },
  {
    pattern: /zone.*not found|domain.*not found/i,
    type: CloudflaredErrorType.DNS_ZONE_NOT_FOUND,
    severity: 'error',
    action: 'verify_domain_ownership'
  },
  {
    pattern: /permission denied.*dns|dns.*permission/i,
    type: CloudflaredErrorType.DNS_PERMISSION_DENIED,
    severity: 'error',
    action: 'check_dns_permissions'
  },

  // 隧道错误
  {
    pattern: /tunnel.*already exists|duplicate tunnel/i,
    type: CloudflaredErrorType.TUNNEL_ALREADY_EXISTS,
    severity: 'warning',
    action: 'use_existing_tunnel'
  },
  {
    pattern: /tunnel.*not found|no tunnel.*found/i,
    type: CloudflaredErrorType.TUNNEL_NOT_FOUND,
    severity: 'error',
    action: 'create_tunnel'
  },
  {
    pattern: /failed to delete tunnel|deletion.*failed/i,
    type: CloudflaredErrorType.TUNNEL_DELETION_FAILED,
    severity: 'warning',
    action: 'retry_deletion'
  },

  // 网络错误
  {
    pattern: /timeout|timed out/i,
    type: CloudflaredErrorType.NETWORK_TIMEOUT,
    severity: 'warning',
    action: 'retry_with_timeout'
  },
  {
    pattern: /connection.*failed|failed to connect/i,
    type: CloudflaredErrorType.NETWORK_CONNECTION_FAILED,
    severity: 'error',
    action: 'check_network'
  },

  // 配置错误
  {
    pattern: /config.*not found|configuration.*missing/i,
    type: CloudflaredErrorType.CONFIG_FILE_MISSING,
    severity: 'error',
    action: 'generate_config'
  },
  {
    pattern: /invalid.*config|config.*invalid|malformed.*config/i,
    type: CloudflaredErrorType.CONFIG_FILE_INVALID,
    severity: 'error',
    action: 'fix_config'
  }
];

/**
 * 用户友好的错误消息映射
 */
const ERROR_MESSAGES = {
  [CloudflaredErrorType.AUTH_MISSING_CERT]: {
    title: '缺少Cloudflare认证证书',
    description: '需要通过浏览器登录获取证书文件',
    solution: '请运行: cloudflared tunnel login'
  },
  [CloudflaredErrorType.AUTH_EXPIRED_CERT]: {
    title: 'Cloudflare认证证书已过期',
    description: '现有证书已过期，需要重新认证',
    solution: '请重新运行: cloudflared tunnel login'
  },
  [CloudflaredErrorType.DNS_RECORD_EXISTS]: {
    title: 'DNS记录冲突',
    description: '域名已存在同名的DNS记录',
    solution: '请删除现有DNS记录或选择不同的域名'
  },
  [CloudflaredErrorType.DNS_ZONE_NOT_FOUND]: {
    title: '域名Zone未找到',
    description: '指定域名未在Cloudflare中找到',
    solution: '请确认域名已添加到Cloudflare账户'
  },
  [CloudflaredErrorType.TUNNEL_ALREADY_EXISTS]: {
    title: '隧道名称已存在',
    description: '同名隧道已存在',
    solution: '使用不同的隧道名称或删除现有隧道'
  },
  [CloudflaredErrorType.NETWORK_TIMEOUT]: {
    title: '网络操作超时',
    description: '请求超时，可能是网络问题',
    solution: '请检查网络连接后重试'
  }
};

/**
 * 增强的错误解析器类
 */
export class CloudflaredErrorParser {
  constructor() {
    this.errorLog = [];
    this.parseStats = {
      totalErrors: 0,
      recognizedErrors: 0,
      unknownErrors: 0
    };
  }

  /**
   * 解析cloudflared错误输出
   */
  parseError(errorOutput, context = {}) {
    if (!errorOutput || typeof errorOutput !== 'string') {
      return null;
    }

    this.parseStats.totalErrors++;

    // 遍历所有错误模式
    for (const rule of ERROR_PATTERNS) {
      if (rule.pattern.test(errorOutput)) {
        this.parseStats.recognizedErrors++;
        
        const parsedError = {
          type: rule.type,
          severity: rule.severity,
          recommendedAction: rule.action,
          rawOutput: errorOutput.trim(),
          context: context,
          timestamp: new Date().toISOString(),
          userMessage: ERROR_MESSAGES[rule.type] || null,
          matchedPattern: rule.pattern.toString()
        };

        this.errorLog.push(parsedError);
        return parsedError;
      }
    }

    // 未识别的错误
    this.parseStats.unknownErrors++;
    
    const unknownError = {
      type: CloudflaredErrorType.UNKNOWN,
      severity: 'error',
      recommendedAction: 'manual_investigation',
      rawOutput: errorOutput.trim(),
      context: context,
      timestamp: new Date().toISOString(),
      userMessage: {
        title: '未知错误',
        description: '遇到未能识别的错误',
        solution: '请查看错误详情进行手动处理'
      }
    };

    this.errorLog.push(unknownError);
    return unknownError;
  }

  /**
   * 格式化错误消息供用户显示
   */
  displayError(parsedError) {
    if (!parsedError) return;

    const { userMessage, severity, type } = parsedError;
    
    const colorFn = severity === 'error' ? chalk.red : 
                   severity === 'warning' ? chalk.yellow : 
                   chalk.blue;

    console.log(colorFn(`\n❌ ${userMessage?.title || '错误'}`));
    
    if (userMessage?.description) {
      console.log(chalk.gray(`   ${userMessage.description}`));
    }

    if (userMessage?.solution) {
      console.log(chalk.cyan(`💡 建议解决方案: ${userMessage.solution}`));
    }

    // 显示技术详情（调试模式）
    if (process.env.DEBUG_CLOUDFLARED || process.env.NODE_ENV === 'development') {
      console.log(chalk.gray(`🔧 错误类型: ${type}`));
      console.log(chalk.gray(`🔧 推荐动作: ${parsedError.recommendedAction}`));
      console.log(chalk.gray(`🔧 原始输出: ${parsedError.rawOutput}`));
    }
  }

  /**
   * 获取推荐的自动化处理动作
   */
  getAutomatedAction(parsedError) {
    if (!parsedError) return null;

    const actionMap = {
      'resolve_dns_conflict': {
        canAutomate: true,
        function: 'resolveDnsConflict',
        description: '自动解决DNS记录冲突'
      },
      'run_cloudflared_login': {
        canAutomate: false,
        function: null,
        description: '需要用户手动执行登录'
      },
      'retry_with_timeout': {
        canAutomate: true,
        function: 'retryOperation',
        description: '增加超时时间后重试'
      },
      'generate_config': {
        canAutomate: true,
        function: 'generateConfig',
        description: '自动生成配置文件'
      }
    };

    return actionMap[parsedError.recommendedAction] || {
      canAutomate: false,
      function: null,
      description: '需要手动处理'
    };
  }

  /**
   * 获取错误统计信息
   */
  getStats() {
    return {
      ...this.parseStats,
      recognitionRate: this.parseStats.totalErrors > 0 ? 
        (this.parseStats.recognizedErrors / this.parseStats.totalErrors * 100).toFixed(1) + '%' : '0%',
      recentErrors: this.errorLog.slice(-5)
    };
  }

  /**
   * 清理错误日志
   */
  clearErrorLog() {
    this.errorLog = [];
    this.parseStats = {
      totalErrors: 0,
      recognizedErrors: 0,
      unknownErrors: 0
    };
  }
}