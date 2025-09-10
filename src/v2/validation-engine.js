import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';
import dns from 'dns/promises';
import chalk from 'chalk';
import { EnhancedLogger } from '../utils/enhanced-logger.js';
import { CloudflaredInstaller } from '../utils/cloudflared-installer.js';

/**
 * V2验证引擎
 * 负责环境预检和DNS验证功能
 */
export class ValidationEngine {
  constructor() {
    this.logger = new EnhancedLogger('ValidationEngine-V2');
    this.installer = new CloudflaredInstaller();
  }

  /**
   * 执行完整的环境预检
   * @returns {Promise<Object>} 预检结果
   */
  async runPreflightChecks() {
    this.logger.logStep('预检开始', '开始执行V2环境预检');
    
    const results = {
      cloudflaredInstalled: false,
      cloudflaredVersion: null,
      systemCompatible: true,
      networkConnectivity: false,
      recommendedActions: []
    };

    try {
      // 检查系统兼容性
      results.systemCompatible = await this.checkSystemCompatibility();
      if (!results.systemCompatible) {
        results.recommendedActions.push('当前系统不支持Cloudflare Tunnel功能');
      }

      // 检查cloudflared安装状态
      const cloudflaredCheck = await this.checkCloudflaredInstallation();
      results.cloudflaredInstalled = cloudflaredCheck.installed;
      results.cloudflaredVersion = cloudflaredCheck.version;
      
      if (!results.cloudflaredInstalled) {
        results.recommendedActions.push('需要安装cloudflared命令行工具');
      } else if (cloudflaredCheck.needsUpdate) {
        results.recommendedActions.push(`建议更新cloudflared到最新版本 (当前: ${cloudflaredCheck.version})`);
      }

      // 检查网络连接性
      results.networkConnectivity = await this.checkNetworkConnectivity();
      if (!results.networkConnectivity) {
        results.recommendedActions.push('无法连接到Cloudflare服务，请检查网络连接');
      }

      // 判断整体预检是否通过
      const passed = results.cloudflaredInstalled && 
                    results.systemCompatible && 
                    results.networkConnectivity;

      this.logger.logStep('预检完成', 'V2环境预检完成', { 
        passed, 
        issues: results.recommendedActions.length 
      });

      return {
        ...results,
        passed,
        summary: this.generatePreflightSummary(results)
      };

    } catch (error) {
      this.logger.logError('执行环境预检时发生错误', error);
      return {
        ...results,
        passed: false,
        error: error.message,
        summary: '预检过程中发生未知错误'
      };
    }
  }

  /**
   * 检查系统兼容性
   * @returns {Promise<boolean>} 系统是否兼容
   */
  async checkSystemCompatibility() {
    this.logger.logDebug('检查系统兼容性');
    
    const currentPlatform = platform();
    const supportedPlatforms = ['linux', 'darwin', 'win32'];
    
    const compatible = supportedPlatforms.includes(currentPlatform);
    
    if (compatible) {
      this.logger.logDebug('系统兼容性检查通过', { platform: currentPlatform });
    } else {
      this.logger.logWarning('系统不兼容', { platform: currentPlatform, supported: supportedPlatforms });
    }
    
    return compatible;
  }

  /**
   * 检查cloudflared安装状态
   * @returns {Promise<Object>} 安装状态信息
   */
  async checkCloudflaredInstallation() {
    this.logger.logDebug('检查cloudflared安装状态');
    
    return new Promise((resolve) => {
      const child = spawn('cloudflared', ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          // 解析版本信息
          const versionMatch = output.match(/cloudflared version ([\d.]+)/);
          const version = versionMatch ? versionMatch[1] : 'unknown';
          
          this.logger.logStep('检查工具', 'cloudflared已安装', { version });
          
          resolve({
            installed: true,
            version,
            needsUpdate: this.shouldUpdateVersion(version)
          });
        } else {
          this.logger.logStep('检查工具', 'cloudflared未安装或不在PATH中');
          resolve({
            installed: false,
            version: null,
            needsUpdate: false
          });
        }
      });

      child.on('error', (error) => {
        this.logger.logDebug('cloudflared命令执行失败', { error: error.message });
        resolve({
          installed: false,
          version: null,
          needsUpdate: false
        });
      });
    });
  }

  /**
   * 判断是否需要更新版本
   * @param {string} currentVersion - 当前版本
   * @returns {boolean} 是否需要更新
   */
  shouldUpdateVersion(currentVersion) {
    // 简单的版本检查逻辑
    // 在实际项目中可能需要更复杂的版本比较
    if (!currentVersion || currentVersion === 'unknown') {
      return true;
    }
    
    // 如果版本太旧（例如小于2024年的版本）则建议更新
    const versionParts = currentVersion.split('.');
    const year = parseInt(versionParts[0]);
    
    return year && year < 2024;
  }

  /**
   * 检查网络连接性
   * @returns {Promise<boolean>} 网络是否正常
   */
  async checkNetworkConnectivity() {
    this.logger.logDebug('检查Cloudflare网络连接性');
    
    const testUrls = [
      'https://api.cloudflare.com/client/v4/user/tokens/verify',
      'https://one.one.one.one', // Cloudflare的DNS服务
    ];

    for (const url of testUrls) {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          timeout: 10000
        });
        
        if (response.ok || response.status === 401) { // 401 是预期的，因为没有认证
          this.logger.logDebug('网络连接性检查通过', { url });
          return true;
        }
      } catch (error) {
        this.logger.logDebug('网络连接测试失败', { url, error: error.message });
        continue;
      }
    }
    
    this.logger.logWarning('所有网络连接测试都失败了');
    return false;
  }

  /**
   * 生成预检摘要信息
   * @param {Object} results - 预检结果
   * @returns {string} 格式化的摘要信息
   */
  generatePreflightSummary(results) {
    const lines = [];
    
    lines.push('🔍 V2环境预检结果:');
    lines.push('');
    
    // cloudflared状态
    if (results.cloudflaredInstalled) {
      lines.push(`✅ cloudflared已安装 (版本: ${results.cloudflaredVersion})`);
    } else {
      lines.push('❌ cloudflared未安装');
    }
    
    // 系统兼容性
    if (results.systemCompatible) {
      lines.push('✅ 系统兼容性检查通过');
    } else {
      lines.push('❌ 系统不兼容');
    }
    
    // 网络连接
    if (results.networkConnectivity) {
      lines.push('✅ Cloudflare网络连接正常');
    } else {
      lines.push('❌ 无法连接到Cloudflare服务');
    }
    
    // 推荐操作
    if (results.recommendedActions.length > 0) {
      lines.push('');
      lines.push('📋 推荐操作:');
      results.recommendedActions.forEach((action, index) => {
        lines.push(`${index + 1}. ${action}`);
      });
    }
    
    return lines.join('\n');
  }

  /**
   * 自动修复预检问题
   * @param {Object} preflightResults - 预检结果
   * @returns {Promise<boolean>} 是否成功修复
   */
  async autoFixPreflightIssues(preflightResults) {
    this.logger.logStep('自动修复', '尝试自动修复预检问题');
    
    let fixAttempted = false;
    let fixSuccess = false;
    
    // 自动安装cloudflared
    if (!preflightResults.cloudflaredInstalled) {
      this.logger.logStep('安装工具', '尝试自动安装cloudflared');
      fixAttempted = true;
      
      try {
        const installed = await this.installer.ensureCloudflaredInstalled();
        if (installed) {
          this.logger.logStep('安装成功', 'cloudflared自动安装成功');
          fixSuccess = true;
        }
      } catch (error) {
        this.logger.logError('cloudflared自动安装失败', error);
      }
    }
    
    return fixAttempted && fixSuccess;
  }

  /**
   * 显示预检失败的用户指引
   * @param {Object} preflightResults - 预检结果
   */
  displayPreflightGuidance(preflightResults) {
    console.log('\n' + chalk.red('❌ 环境预检未通过'));
    console.log('\n' + preflightResults.summary);
    
    if (!preflightResults.cloudflaredInstalled) {
      console.log('\n' + chalk.yellow('💡 安装cloudflared:'));
      console.log('   方式1: 运行 uvx proxy-local --install-cloudflared');
      console.log('   方式2: 访问 https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/');
      console.log('   方式3: 使用包管理器安装（如 brew install cloudflared）');
    }
  }

  /**
   * 验证DNS记录传播状态
   * 借鉴任务75的先进策略：权威DNS查询 + 指数退避重试
   * @param {string} domain - 要验证的域名
   * @param {string} expectedTarget - 期望的CNAME目标
   * @param {Object} options - 验证选项
   * @returns {Promise<boolean>} 验证是否成功
   */
  async verifyDNSPropagation(domain, expectedTarget, options = {}) {
    const {
      maxRetries = 8,
      initialDelay = 2000,
      maxTotalWaitTime = 120000, // 2分钟最大等待时间
      useAuthoritative = true
    } = options;

    this.logger.logStep('DNS传播验证', `开始验证 ${domain} -> ${expectedTarget}`);

    let authoritativeServers = [];
    
    // 1. 如果启用权威DNS查询，获取权威名称服务器
    if (useAuthoritative) {
      try {
        authoritativeServers = await this.getAuthoritativeNameServers(domain);
        this.logger.logDebug('获取权威DNS服务器', { domain, servers: authoritativeServers });
      } catch (error) {
        this.logger.logWarning('获取权威DNS服务器失败，将使用公共DNS服务器', { error: error.message });
      }
    }

    // 2. 设置验证参数
    const startTime = Date.now();
    let currentDelay = initialDelay;
    let attempt = 0;

    // 3. 开始验证循环
    while (attempt < maxRetries && (Date.now() - startTime) < maxTotalWaitTime) {
      attempt++;
      const attemptStartTime = Date.now();
      
      this.logger.logStep(`DNS验证尝试 ${attempt}/${maxRetries}`, `正在验证域名 ${domain}`, {
        expectedTarget,
        currentDelay: currentDelay
      });

      try {
        // 优先尝试权威DNS服务器
        if (authoritativeServers.length > 0) {
          for (const server of authoritativeServers.slice(0, 2)) { // 仅尝试前两个权威服务器
            try {
              const result = await this.queryDNSRecord(domain, 'CNAME', server);
              if (this.validateDNSResult(result, expectedTarget)) {
                this.logger.logStep('DNS验证成功', `通过权威服务器 ${server} 验证成功`);
                return true;
              }
            } catch (error) {
              this.logger.logDebug(`权威服务器 ${server} 查询失败`, { error: error.message });
            }
          }
        }

        // 回退到公共DNS服务器
        const publicServers = ['1.1.1.1', '8.8.8.8', '8.8.4.4'];
        for (const server of publicServers) {
          try {
            const result = await this.queryDNSRecord(domain, 'CNAME', server);
            if (this.validateDNSResult(result, expectedTarget)) {
              this.logger.logStep('DNS验证成功', `通过公共服务器 ${server} 验证成功`);
              return true;
            }
          } catch (error) {
            this.logger.logDebug(`公共服务器 ${server} 查询失败`, { error: error.message });
          }
        }

        // 如果所有服务器都失败了，等待后重试
        if (attempt < maxRetries) {
          this.logger.logStep('等待重试', 'DNS记录尚未传播，等待重试', {
            waitTime: `${currentDelay}ms`,
            nextAttempt: attempt + 1
          });
          
          await this.sleep(currentDelay);
          currentDelay = Math.min(currentDelay * 2, 30000); // 指数退避，最大30秒间隔
        }

      } catch (error) {
        this.logger.logError(`DNS验证尝试 ${attempt} 异常`, error);
        
        if (attempt < maxRetries) {
          await this.sleep(currentDelay);
          currentDelay = Math.min(currentDelay * 2, 30000);
        }
      }
    }

    // 验证失败
    const totalWaitTime = Date.now() - startTime;
    this.logger.logError('DNS传播验证失败', {
      domain,
      expectedTarget,
      totalAttempts: attempt,
      totalWaitTime: `${totalWaitTime}ms`,
      reason: 'DNS记录在规定时间内未传播或未指向正确目标'
    });

    return false;
  }

  /**
   * 获取域名的权威名称服务器
   * @param {string} domain - 域名
   * @returns {Promise<Array<string>>} 权威DNS服务器列表
   */
  async getAuthoritativeNameServers(domain) {
    // 提取根域名（例如：从 sub.example.com 提取 example.com）
    const domainParts = domain.split('.');
    let rootDomain = domain;
    
    if (domainParts.length > 2) {
      rootDomain = domainParts.slice(-2).join('.');
    }

    try {
      const nsRecords = await dns.resolveNs(rootDomain);
      this.logger.logDebug('解析NS记录成功', { rootDomain, nsRecords });
      return nsRecords;
    } catch (error) {
      this.logger.logWarning('解析NS记录失败', { rootDomain, error: error.message });
      return [];
    }
  }

  /**
   * 查询指定DNS服务器的记录
   * @param {string} domain - 域名
   * @param {string} type - 记录类型 (A, CNAME, etc.)
   * @param {string} server - DNS服务器地址
   * @returns {Promise<Array>} DNS查询结果
   */
  async queryDNSRecord(domain, type, server) {
    const resolver = new dns.Resolver();
    resolver.setServers([server]);

    try {
      let result;
      switch (type.toLowerCase()) {
        case 'cname':
          result = await resolver.resolveCname(domain);
          break;
        case 'a':
          result = await resolver.resolve4(domain);
          break;
        default:
          throw new Error(`不支持的DNS记录类型: ${type}`);
      }
      
      this.logger.logDebug('DNS查询成功', { domain, type, server, result });
      return result;
    } catch (error) {
      this.logger.logDebug('DNS查询失败', { domain, type, server, error: error.message });
      throw error;
    }
  }

  /**
   * 验证DNS查询结果是否符合预期
   * @param {Array} result - DNS查询结果
   * @param {string} expectedTarget - 期望的目标
   * @returns {boolean} 是否匹配
   */
  validateDNSResult(result, expectedTarget) {
    if (!Array.isArray(result) || result.length === 0) {
      return false;
    }

    // 对于CNAME记录，检查是否包含期望的目标
    const actualTarget = result[0];
    const isMatch = actualTarget.includes(expectedTarget) || 
                   expectedTarget.includes(actualTarget.replace(/\.$/, ''));
    
    this.logger.logDebug('DNS结果验证', {
      result,
      actualTarget,
      expectedTarget,
      isMatch
    });

    return isMatch;
  }

  /**
   * 等待指定毫秒数
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}