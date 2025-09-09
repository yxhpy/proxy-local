import chalk from 'chalk';

/**
 * 增强的日志记录器
 */
export class EnhancedLogger {
  constructor(component = 'CloudflareProvider') {
    this.component = component;
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logHistory = [];
  }

  /**
   * 记录操作步骤
   */
  logStep(step, message, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      component: this.component,
      level: 'info',
      step,
      message,
      data
    };

    this.logHistory.push(logEntry);
    
    console.log(chalk.blue(`📋 ${step}: ${message}`));
    
    if (data && (this.logLevel === 'debug' || process.env.DEBUG_CLOUDFLARED)) {
      console.log(chalk.gray(`   数据: ${JSON.stringify(data, null, 2)}`));
    }
  }

  /**
   * 记录成功操作
   */
  logSuccess(operation, details = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      component: this.component,
      level: 'success',
      operation,
      details
    };

    this.logHistory.push(logEntry);
    console.log(chalk.green(`✅ ${operation}`));
    
    if (details) {
      console.log(chalk.gray(`   ${details}`));
    }
  }

  /**
   * 记录错误
   */
  logError(operation, error, context = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      component: this.component,
      level: 'error',
      operation,
      error: error.message || error,
      context
    };

    this.logHistory.push(logEntry);
    console.log(chalk.red(`❌ ${operation}`));
    
    if (error.message || typeof error === 'string') {
      console.log(chalk.red(`   ${error.message || error}`));
    }
  }

  /**
   * 记录警告
   */
  logWarning(message, context = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      component: this.component,
      level: 'warning',
      message,
      context
    };

    this.logHistory.push(logEntry);
    console.log(chalk.yellow(`⚠️ ${message}`));
  }

  /**
   * 记录调试信息
   */
  logDebug(message, data = null) {
    if (this.logLevel !== 'debug' && !process.env.DEBUG_CLOUDFLARED) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      component: this.component,
      level: 'debug',
      message,
      data
    };

    this.logHistory.push(logEntry);
    console.log(chalk.gray(`🔍 [DEBUG] ${message}`));
    
    if (data) {
      console.log(chalk.gray(`   ${JSON.stringify(data, null, 2)}`));
    }
  }

  /**
   * 记录命令执行
   */
  logCommand(command, args = [], options = {}) {
    const commandString = [command, ...args].join(' ');
    
    this.logDebug('执行命令', { 
      command: commandString,
      options,
      cwd: process.cwd()
    });

    console.log(chalk.cyan(`🔧 执行: ${commandString}`));
  }

  /**
   * 记录事务操作
   */
  logTransaction(transactionId, operation, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      component: this.component,
      level: 'transaction',
      transactionId,
      operation,
      data
    };

    this.logHistory.push(logEntry);
    console.log(chalk.blue(`🏁 [${transactionId}] ${operation}`));
    
    if (data && (this.logLevel === 'debug' || process.env.DEBUG_CLOUDFLARED)) {
      console.log(chalk.gray(`   ${JSON.stringify(data, null, 2)}`));
    }
  }

  /**
   * 获取日志历史
   */
  getLogHistory(level = null, limit = 50) {
    let filtered = this.logHistory;
    
    if (level) {
      filtered = this.logHistory.filter(log => log.level === level);
    }

    return filtered.slice(-limit);
  }

  /**
   * 导出日志到文件（模拟）
   */
  exportLogs(filename = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `cloudflare-logs-${timestamp}.json`;
    const outputFile = filename || defaultFilename;

    const logData = {
      exportTime: new Date().toISOString(),
      component: this.component,
      totalLogs: this.logHistory.length,
      logs: this.logHistory
    };

    try {
      console.log(chalk.blue(`📝 日志导出模拟: ${outputFile}`));
      console.log(chalk.gray(`   包含 ${this.logHistory.length} 条记录`));
      
      return {
        success: true,
        filename: outputFile,
        logCount: this.logHistory.length
      };
    } catch (error) {
      console.error(chalk.red(`❌ 日志导出失败: ${error.message}`));
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 清理旧日志
   */
  cleanupLogs(maxAge = 24 * 60 * 60 * 1000) { // 默认24小时
    const cutoffTime = new Date(Date.now() - maxAge);
    const initialCount = this.logHistory.length;
    
    this.logHistory = this.logHistory.filter(log => 
      new Date(log.timestamp) > cutoffTime
    );

    const removedCount = initialCount - this.logHistory.length;
    if (removedCount > 0) {
      console.log(chalk.gray(`🗑️ 清理了 ${removedCount} 条过期日志`));
    }
    
    return removedCount;
  }
}