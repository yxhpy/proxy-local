import { spawn } from 'child_process';
import { createRequire } from 'module';
import chalk from 'chalk';

const require = createRequire(import.meta.url);

/**
 * 隧道健康检查器
 * 负责检查隧道连接的健康状态并执行自动恢复
 */
export class TunnelHealthChecker {
  constructor(provider) {
    this.provider = provider;
    this.checkInterval = null;
    this.healthCheckEnabled = false;
    this.retryAttempts = 0;
    this.maxRetries = 3;
    this.checkIntervalMs = 30000; // 30秒检查一次
    this.connectionTimeout = 15000; // 15秒连接超时
    this.lastSuccessfulCheck = Date.now();
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 3;
    
    // 健康检查回调
    this.onHealthy = null;
    this.onUnhealthy = null;
    this.onRecovering = null;
    this.onRecovered = null;
    this.onMaxRetriesReached = null;
  }

  /**
   * 启动健康检查
   * @param {string} tunnelUrl - 隧道URL
   * @param {number} localPort - 本地端口
   */
  startHealthCheck(tunnelUrl, localPort) {
    if (this.healthCheckEnabled) {
      this.stopHealthCheck();
    }

    this.healthCheckEnabled = true;
    this.tunnelUrl = tunnelUrl;
    this.localPort = localPort;
    this.consecutiveFailures = 0;
    this.retryAttempts = 0;

    console.log(chalk.blue('🔍 启动隧道健康检查...'));
    
    // 立即执行一次检查
    this.performHealthCheck();
    
    // 设置定期检查
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.checkIntervalMs);
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck() {
    this.healthCheckEnabled = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log(chalk.gray('⏹️ 隧道健康检查已停止'));
  }

  /**
   * 执行健康检查
   * @private
   */
  async performHealthCheck() {
    if (!this.healthCheckEnabled) return;

    try {
      const startTime = Date.now();
      
      // 检查本地服务
      const localHealthy = await this.checkLocalService();
      if (!localHealthy) {
        console.log(chalk.yellow('⚠️ 本地服务不可用'));
        this.handleUnhealthyStatus('本地服务不可用');
        return;
      }

      // 检查隧道连接
      const tunnelHealthy = await this.checkTunnelConnection();
      const responseTime = Date.now() - startTime;

      if (tunnelHealthy) {
        this.handleHealthyStatus(responseTime);
      } else {
        this.handleUnhealthyStatus('隧道连接失败');
      }
    } catch (error) {
      console.log(chalk.red(`❌ 健康检查出错: ${error.message}`));
      this.handleUnhealthyStatus(`检查出错: ${error.message}`);
    }
  }

  /**
   * 检查本地服务是否可用
   * @private
   */
  async checkLocalService() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000);

      try {
        const http = require('http');
        const request = http.get(
          `http://localhost:${this.localPort}`,
          { timeout: 5000 },
          (response) => {
            clearTimeout(timeout);
            // 任何HTTP响应都表示服务可用（包括404等）
            resolve(true);
          }
        );

        request.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });

        request.on('timeout', () => {
          clearTimeout(timeout);
          request.destroy();
          resolve(false);
        });
      } catch (error) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  /**
   * 检查隧道连接是否可用
   * @private
   */
  async checkTunnelConnection() {
    if (!this.tunnelUrl) return false;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.connectionTimeout);

      try {
        const https = this.tunnelUrl.startsWith('https://') 
          ? require('https') 
          : require('http');

        const request = https.get(
          this.tunnelUrl,
          { 
            timeout: this.connectionTimeout,
            headers: {
              'User-Agent': 'TunnelHealthChecker/1.0'
            }
          },
          (response) => {
            clearTimeout(timeout);
            // 任何HTTP响应都表示隧道可用
            resolve(true);
          }
        );

        request.on('error', (error) => {
          clearTimeout(timeout);
          // DNS解析错误可能表示隧道域名无效
          if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            resolve(false);
          } else {
            // 其他错误可能是临时的
            resolve(false);
          }
        });

        request.on('timeout', () => {
          clearTimeout(timeout);
          request.destroy();
          resolve(false);
        });
      } catch (error) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  /**
   * 处理健康状态
   * @private
   */
  handleHealthyStatus(responseTime) {
    this.lastSuccessfulCheck = Date.now();
    this.consecutiveFailures = 0;
    
    if (this.retryAttempts > 0) {
      console.log(chalk.green('✅ 隧道连接已恢复！'));
      this.retryAttempts = 0;
      if (this.onRecovered) {
        this.onRecovered(responseTime);
      }
    }
    
    if (this.onHealthy) {
      this.onHealthy(responseTime);
    }
  }

  /**
   * 处理不健康状态
   * @private
   */
  async handleUnhealthyStatus(reason) {
    this.consecutiveFailures++;
    console.log(chalk.yellow(`⚠️ 隧道健康检查失败 (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${reason}`));

    if (this.onUnhealthy) {
      this.onUnhealthy(reason, this.consecutiveFailures);
    }

    // 如果连续失败次数达到阈值，尝试自动恢复
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      await this.attemptRecovery();
    }
  }

  /**
   * 尝试自动恢复
   * @private
   */
  async attemptRecovery() {
    if (this.retryAttempts >= this.maxRetries) {
      console.log(chalk.red(`❌ 已达到最大重试次数 (${this.maxRetries})`));
      console.log(chalk.yellow('🚨 隧道可能需要手动干预'));
      
      if (this.onMaxRetriesReached) {
        this.onMaxRetriesReached();
      }
      return;
    }

    this.retryAttempts++;
    console.log(chalk.blue(`🔄 尝试自动恢复 (${this.retryAttempts}/${this.maxRetries})...`));

    if (this.onRecovering) {
      this.onRecovering(this.retryAttempts);
    }

    try {
      // 尝试重启隧道
      await this.restartTunnel();
    } catch (error) {
      console.log(chalk.red(`❌ 自动恢复失败: ${error.message}`));
    }
  }

  /**
   * 重启隧道
   * @private
   */
  async restartTunnel() {
    console.log(chalk.yellow('🔄 正在重启隧道...'));
    
    try {
      // 关闭当前隧道
      if (this.provider && typeof this.provider.closeTunnel === 'function') {
        await this.provider.closeTunnel();
      }
      
      // 等待一段时间让进程完全关闭
      await this.sleep(5000);
      
      // 检查本地服务是否可用
      const localHealthy = await this.checkLocalService();
      if (!localHealthy) {
        throw new Error(`本地端口 ${this.localPort} 无服务响应，无法重启隧道`);
      }
      
      // 重新创建隧道
      const result = await this.provider.createTunnel(this.localPort, {
        skipDomainSelection: true, // 跳过域名选择，使用之前的配置
        autoInstall: false // 不自动安装，避免重复安装检查
      });
      
      if (result && result.url) {
        this.tunnelUrl = result.url;
        console.log(chalk.green('✅ 隧道重启成功'));
        console.log(chalk.blue(`🌐 新的隧道URL: ${result.url}`));
        
        // 重置失败计数器
        this.consecutiveFailures = 0;
        
        return true;
      } else {
        throw new Error('重启后未获得有效的隧道URL');
      }
    } catch (error) {
      console.log(chalk.red(`❌ 隧道重启失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 检查隧道域名解析状态
   * @param {string} domain - 要检查的域名
   */
  async checkDomainResolution(domain) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ resolved: false, reason: '解析超时' });
      }, 10000);

      try {
        const { lookup } = require('dns');
        lookup(domain, (err, address) => {
          clearTimeout(timeout);
          if (err) {
            resolve({ 
              resolved: false, 
              reason: err.code === 'ENOTFOUND' ? '域名未解析' : err.message 
            });
          } else {
            resolve({ resolved: true, address });
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        resolve({ resolved: false, reason: error.message });
      }
    });
  }

  /**
   * 强制触发健康检查
   */
  async forceCheck() {
    console.log(chalk.blue('🔍 强制执行健康检查...'));
    await this.performHealthCheck();
  }

  /**
   * 获取健康状态报告
   */
  getHealthReport() {
    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulCheck;
    const isHealthy = this.consecutiveFailures === 0;
    
    return {
      isHealthy,
      consecutiveFailures: this.consecutiveFailures,
      retryAttempts: this.retryAttempts,
      timeSinceLastSuccess,
      lastSuccessfulCheck: new Date(this.lastSuccessfulCheck).toISOString(),
      tunnelUrl: this.tunnelUrl,
      localPort: this.localPort,
      maxRetries: this.maxRetries,
      healthCheckEnabled: this.healthCheckEnabled
    };
  }

  /**
   * 设置健康检查回调函数
   */
  setCallbacks({
    onHealthy = null,
    onUnhealthy = null,
    onRecovering = null,
    onRecovered = null,
    onMaxRetriesReached = null
  } = {}) {
    this.onHealthy = onHealthy;
    this.onUnhealthy = onUnhealthy;
    this.onRecovering = onRecovering;
    this.onRecovered = onRecovered;
    this.onMaxRetriesReached = onMaxRetriesReached;
  }

  /**
   * 更新配置
   */
  updateConfig({
    maxRetries = null,
    checkIntervalMs = null,
    connectionTimeout = null,
    maxConsecutiveFailures = null
  } = {}) {
    if (maxRetries !== null) this.maxRetries = maxRetries;
    if (checkIntervalMs !== null) {
      this.checkIntervalMs = checkIntervalMs;
      if (this.healthCheckEnabled) {
        // 重启检查间隔
        this.stopHealthCheck();
        this.startHealthCheck(this.tunnelUrl, this.localPort);
      }
    }
    if (connectionTimeout !== null) this.connectionTimeout = connectionTimeout;
    if (maxConsecutiveFailures !== null) this.maxConsecutiveFailures = maxConsecutiveFailures;
  }

  /**
   * 睡眠函数
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}