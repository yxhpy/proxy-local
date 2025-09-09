import { spawn } from 'child_process';
import { existsSync, watch, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { promises as dns } from 'dns';
import https from 'https';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TunnelProvider, TunnelResult, ProviderFeatures } from './interface.js';
import { CloudflaredInstaller } from '../utils/cloudflared-installer.js';
import { CloudflareDomainManager } from '../utils/cloudflare-domain-manager.js';
import { CloudflareAuth } from '../utils/cloudflare-auth.js';
import { CloudflareDnsDebug } from '../utils/cloudflare-dns-debug.js';
import { TunnelHealthChecker } from '../utils/tunnel-health-checker.js';
import { CloudflaredCommandBuilder } from '../utils/cloudflared-command-builder.js';
import { AtomicTunnelLifecycle } from '../utils/atomic-tunnel-lifecycle.js';
import { CloudflaredErrorParser, CloudflaredErrorType } from '../utils/cloudflared-error-parser.js';
import { EnhancedLogger } from '../utils/enhanced-logger.js';

/**
 * Cloudflare Tunnel 提供商实现
 * 使用 cloudflared 工具创建临时隧道，无需登录
 */
export class CloudflareProvider extends TunnelProvider {
  constructor() {
    const features = new ProviderFeatures({
      requiresConfirmation: false, // 无确认页面
      speed: 'fast',
      httpsSupport: true,
      customDomain: true, // 现在支持自定义域名
      description: 'Cloudflare 快速隧道，支持域名选择和固定功能'
    });
    
    super('cloudflare', features);
    this.currentProcess = null;
    this.tunnelUrl = null;
    this.authMode = false; // 是否使用认证模式
    this.domainManager = new CloudflareDomainManager();
    this.auth = new CloudflareAuth(); // 添加新的认证管理器
    this.dnsDebugger = new CloudflareDnsDebug(this.auth); // DNS 冲突处理工具（共享auth实例）
    this.healthChecker = new TunnelHealthChecker(this); // 健康检查器
    this.commandBuilder = new CloudflaredCommandBuilder(); // 统一命令构建器
    this.errorParser = new CloudflaredErrorParser(); // 错误解析器
    this.logger = new EnhancedLogger('CloudflareProvider'); // 增强日志记录器
    
    // 原子化生命周期管理器（集成任务65和75的修复）
    this.atomicLifecycle = new AtomicTunnelLifecycle({
      authManager: this.auth,
      domainManager: this.domainManager,
      errorParser: this.errorParser,
      logger: this.logger
    });
  }

  /**
   * 检查证书文件是否存在
   */
  hasCertificate() {
    const certPath = join(homedir(), '.cloudflared', 'cert.pem');
    return existsSync(certPath);
  }

  /**
   * 综合认证状态检查
   */
  async getAuthenticationStatus() {
    const hasCert = this.hasCertificate();
    let hasApiToken = false;
    
    try {
      const token = await this.auth.getValidCloudflareToken();
      hasApiToken = !!token;
    } catch (error) {
      hasApiToken = false;
    }

    return {
      hasCertificate: hasCert,
      hasApiToken: hasApiToken,
      canUseNamedTunnels: hasCert,
      canUseApi: hasApiToken,
      isFullyAuthenticated: hasCert && hasApiToken,
      authenticationLevel: this._determineAuthLevel(hasCert, hasApiToken)
    };
  }

  /**
   * 确定认证级别
   */
  _determineAuthLevel(hasCert, hasApiToken) {
    if (hasCert && hasApiToken) return 'full';
    if (hasCert && !hasApiToken) return 'cert-only';
    if (!hasCert && hasApiToken) return 'api-only';
    return 'none';
  }

  /**
   * 格式化认证状态显示
   */
  _formatAuthStatus(status) {
    const parts = [];
    parts.push(status.hasCertificate ? chalk.green('证书✓') : chalk.red('证书✗'));
    parts.push(status.hasApiToken ? chalk.green('API✓') : chalk.red('API✗'));
    parts.push(`级别:${chalk.cyan(status.authenticationLevel)}`);
    return parts.join(' ');
  }

  /**
   * 检查用户是否已通过 API 令牌认证（重构后）
   * @returns {Promise<boolean>} 是否有有效认证
   */
  async isAuthenticated() {
    try {
      const status = await this.getAuthenticationStatus();
      console.log(chalk.gray('认证状态:'), this._formatAuthStatus(status));
      return status.canUseNamedTunnels; // 命名隧道需要证书
    } catch (error) {
      console.warn(chalk.yellow(`检查认证状态失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 登录 Cloudflare 账户（重构为 API 令牌认证）
   */
  async login() {
    try {
      console.log(chalk.blue('🔐 开始 Cloudflare API 令牌认证流程...'));
      console.log(chalk.yellow('⚠️ 已废弃 cloudflared 浏览器登录方式'));
      
      const success = await this.auth.ensureValidToken();
      if (success) {
        console.log(chalk.green('✅ Cloudflare API 令牌认证成功！'));
        return true;
      } else {
        throw new Error('API 令牌认证失败');
      }
    } catch (error) {
      throw new Error(`Cloudflare 认证失败: ${error.message}`);
    }
  }

  /**
   * 登出 Cloudflare 账户
   */
  async logout() {
    try {
      console.log('🚪 正在清除 Cloudflare 认证信息...');
      
      // 删除认证文件
      const cloudflaredDir = join(homedir(), '.cloudflared');
      const certPath = join(cloudflaredDir, 'cert.pem');
      
      if (existsSync(certPath)) {
        // 使用 rm 命令删除认证文件
        return new Promise((resolve, reject) => {
          const child = spawn('rm', ['-f', certPath], {
            stdio: 'pipe'
          });
          
          child.on('close', (code) => {
            if (code === 0) {
              console.log('✅ Cloudflare 登出成功');
              resolve(true);
            } else {
              reject(new Error(`删除认证文件失败，退出代码: ${code}`));
            }
          });
          
          child.on('error', (err) => {
            reject(new Error(`删除认证文件失败: ${err.message}`));
          });
        });
      } else {
        console.log('ℹ️  未找到认证信息，可能已经登出');
        return true;
      }
    } catch (error) {
      throw new Error(`Cloudflare 登出失败: ${error.message}`);
    }
  }

  /**
   * 检查 cloudflared 是否可用，如果不可用则尝试自动安装
   */
  async isAvailable(options = {}) {
    const { autoInstall = false } = options;
    
    const installed = await CloudflaredInstaller.isInstalled();
    
    if (!installed && autoInstall) {
      // 尝试自动安装
      const installSuccess = await CloudflaredInstaller.autoInstall();
      return installSuccess;
    }
    
    if (!installed && !autoInstall) {
      // 显示手动安装说明
      CloudflaredInstaller.showManualInstallInstructions();
      return false;
    }
    
    return installed;
  }

  /**
   * 设置认证模式
   */
  setAuthMode(authMode, customName = null) {
    this.authMode = authMode;
    this.customTunnelName = customName;
  }

  /**
   * 重置固定域名设置
   */
  resetDomainConfiguration() {
    this.domainManager.clearFixedDomain();
    console.log('✅ 已清除固定域名设置，下次将重新选择');
  }

  /**
   * 获取当前固定域名
   */
  getFixedDomain() {
    return this.domainManager.getFixedDomain();
  }

  /**
   * 创建命名隧道并配置 DNS（原子化方法）
   * 使用原子化生命周期管理器确保要么完全成功要么安全回滚
   */
  async setupNamedTunnelWithDNS(domain, localPort = 8000) {
    try {
      const tunnelName = `tunnel-${domain.replace(/\./g, '-')}-${Date.now()}`;
      
      console.log(chalk.blue('🔄 使用原子化生命周期管理器创建命名隧道...'));
      
      // 使用原子化生命周期管理器
      const result = await this.atomicLifecycle.createNamedTunnelAtomic(tunnelName, domain, localPort);
      
      if (result.success) {
        console.log(chalk.green('✅ 原子化隧道创建成功'));
        return {
          tunnelId: result.tunnelId,
          tunnelName: result.tunnelName,
          domain: result.domain,
          configPath: result.configPath,
          transactionId: result.transactionId
        };
      } else {
        console.log(chalk.yellow(`⚠️ 原子化隧道创建失败: ${result.error}`));
        return null; // 回退到临时隧道模式
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ 命名隧道设置失败: ${error.message}`));
      return null;
    }
  }

  /**
   * 创建命名隧道（增强版错误处理）
   */
  async createNamedTunnel(tunnelName) {
    return new Promise((resolve, reject) => {
      this.logger.logStep('创建命名隧道', `隧道名称: ${tunnelName}`);
      
      // 生成基础配置文件
      this.commandBuilder.generateConfigFile();
      
      // 使用统一命令构建器
      const createCommand = this.commandBuilder.buildCreateCommand(tunnelName);
      this.logger.logCommand(createCommand[0], createCommand.slice(1));
      
      const createTunnel = spawn(createCommand[0], createCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let tunnelId = '';
      let errorOutput = '';
      let resolved = false;
      
      createTunnel.stdout.on('data', (data) => {
        const text = data.toString();
        this.logger.logDebug('cloudflared stdout', text.trim());
        
        const idMatch = text.match(/Created tunnel .* with id ([a-f0-9-]+)/);
        if (idMatch) {
          tunnelId = idMatch[1];
          this.logger.logDebug('提取隧道ID', tunnelId);
        }
      });

      createTunnel.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        this.logger.logDebug('cloudflared stderr', text.trim());
        
        // 使用增强的错误解析器
        const parsedError = this.errorParser.parseError(text, {
          operation: 'create_tunnel',
          tunnelName: tunnelName,
          command: createCommand.join(' ')
        });

        if (parsedError) {
          this.errorParser.displayError(parsedError);
          
          // 检查是否可以自动处理
          const autoAction = this.errorParser.getAutomatedAction(parsedError);
          if (autoAction.canAutomate) {
            this.logger.logDebug('可自动处理的错误', autoAction.description);
          }
        }
      });

      createTunnel.on('close', (code) => {
        if (resolved) return;
        resolved = true;
        
        if (code === 0 && tunnelId) {
          this.logger.logSuccess('隧道创建成功', `ID: ${tunnelId}`);
          resolve(tunnelId);
        } else {
          this.logger.logError('隧道创建失败', `退出代码: ${code}`, { errorOutput });
          
          // 对整个错误输出进行最终解析
          if (errorOutput) {
            const finalError = this.errorParser.parseError(errorOutput, {
              operation: 'create_tunnel',
              tunnelName: tunnelName,
              exitCode: code
            });
            
            if (finalError) {
              // 已经在stderr处理中显示过了，这里记录到日志
              this.logger.logDebug('最终错误分析', finalError);
            }
          }
          resolve(null);
        }
      });

      createTunnel.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        this.logger.logError('cloudflared 进程启动失败', err);
        resolve(null);
      });

      setTimeout(() => {
        if (!createTunnel.killed && !resolved) {
          this.logger.logWarning('创建隧道操作超时，终止进程');
          createTunnel.kill();
          resolved = true;
          resolve(null);
        }
      }, 30000);
    });
  }

  /**
   * 为命名隧道配置 DNS（增强版，支持冲突处理）
   */
  /**
   * 为命名隧道配置 DNS（增强版，支持冲突处理和API直接创建）
   */
  async configureNamedTunnelDNS(tunnelId, domain) {
    return new Promise(async (resolve, reject) => {
      console.log(chalk.blue(`🌐 为隧道 ${tunnelId} 配置DNS: ${domain}`));
      
      // 生成包含隧道ID的配置文件
      this.commandBuilder.generateConfigFile({ tunnelId });
      
      // 第一步：尝试使用 cloudflared tunnel route dns 命令
      console.log(chalk.gray('🔄 步骤1：尝试 cloudflared tunnel route dns...'));
      
      // 使用统一命令构建器
      const routeCommand = this.commandBuilder.buildRouteCommand(tunnelId, domain);
      const routeDns = spawn(routeCommand[0], routeCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let routeDnsTimeout;
      let stdoutOutput = '';
      let stderrOutput = '';

      // 收集输出信息用于错误分析
      routeDns.stdout.on('data', (data) => {
        stdoutOutput += data.toString();
      });

      routeDns.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      routeDns.on('close', async (code) => {
        if (code === 0) {
          console.log(chalk.green(`✅ cloudflared DNS 路由命令执行成功: ${domain}`));
          
          // 关键修复：不再立即返回success，而是验证DNS记录是否真的创建成功
          console.log(chalk.blue('🔍 步骤1.1：验证DNS记录是否成功创建...'));
          
          try {
            const cnameTarget = `${tunnelId}.cfargotunnel.com`;
            const verified = await this._verifyDnsRecordCreation(domain, cnameTarget);
            
            if (verified) {
              console.log(chalk.green('✅ DNS记录创建并验证成功'));
              resolve(true);
              return;
            } else {
              console.log(chalk.yellow('⚠️ cloudflared命令成功但DNS记录验证失败，尝试API创建...'));
              // 继续执行API创建流程
            }
          } catch (verifyError) {
            console.log(chalk.yellow(`⚠️ DNS记录验证异常: ${verifyError.message}，尝试API创建...`));
            // 继续执行API创建流程
          }
          
          // 如果验证失败，继续执行API创建
          console.log(chalk.blue('🔄 步骤2：使用 CloudFlare API 直接创建DNS记录...'));
          
          try {
            const apiSuccess = await this._createDnsRecordViaAPI(tunnelId, domain);
            if (apiSuccess) {
              console.log(chalk.green('✅ API DNS记录创建成功'));
              resolve(true);
            } else {
              console.log(chalk.red('❌ API DNS记录创建失败'));
              resolve(false);
            }
          } catch (apiError) {
            console.log(chalk.red(`❌ API DNS记录创建异常: ${apiError.message}`));
            resolve(false);
          }
        } else {
          console.log(chalk.yellow(`⚠️ cloudflared DNS 路由配置失败 (exit code: ${code})`));
          
          if (stderrOutput.trim()) {
            console.log(chalk.yellow(`错误详情: ${stderrOutput.trim()}`));
          }
          
          // 第二步：尝试智能解决DNS冲突
          const isDnsConflict = this._isDnsConflictError(stderrOutput);
          
          if (isDnsConflict) {
            console.log(chalk.blue('🔍 检测到 DNS 记录冲突，尝试智能解决...'));
            
            try {
              clearTimeout(routeDnsTimeout);
              const smartResolveResult = await this._smartResolveDnsConflict(tunnelId, domain);
              
              if (smartResolveResult) {
                console.log(chalk.green('✅ DNS 冲突智能解决成功'));
                
                // 修复：智能解决后也需要验证DNS记录
                const cnameTarget = `${tunnelId}.cfargotunnel.com`;
                const verified = await this._verifyDnsRecordCreation(domain, cnameTarget);
                
                if (verified) {
                  console.log(chalk.green('✅ 冲突解决后DNS记录验证成功'));
                  resolve(true);
                  return;
                } else {
                  console.log(chalk.yellow('⚠️ 冲突解决但DNS记录验证失败，继续API创建'));
                }
              }
            } catch (error) {
              console.log(chalk.red(`❌ DNS 冲突智能解决失败: ${error.message}`));
            }
          }
          
          // 第三步：直接使用API创建DNS记录（修复关键点）
          console.log(chalk.blue('🔄 步骤3：使用 CloudFlare API 直接创建DNS记录...'));
          
          try {
            const apiSuccess = await this._createDnsRecordViaAPI(tunnelId, domain);
            if (apiSuccess) {
              console.log(chalk.green('✅ API DNS记录创建成功'));
              resolve(true);
            } else {
              console.log(chalk.red('❌ API DNS记录创建失败'));
              resolve(false);
            }
          } catch (apiError) {
            console.log(chalk.red(`❌ API DNS记录创建异常: ${apiError.message}`));
            resolve(false);
          }
        }
      });

      routeDns.on('error', async () => {
        console.log(chalk.red('❌ cloudflared DNS 路由命令执行失败'));
        
        // 直接尝试API创建
        console.log(chalk.blue('🔄 回退：使用 CloudFlare API 创建DNS记录...'));
        try {
          const apiSuccess = await this._createDnsRecordViaAPI(tunnelId, domain);
          resolve(apiSuccess);
        } catch (apiError) {
          console.log(chalk.red(`❌ API回退失败: ${apiError.message}`));
          resolve(false);
        }
      });

      // 设置初始超时
      routeDnsTimeout = setTimeout(async () => {
        if (!routeDns.killed) {
          console.log(chalk.yellow('⏰ cloudflared DNS 配置超时，尝试API创建...'));
          routeDns.kill();
          
          try {
            const apiSuccess = await this._createDnsRecordViaAPI(tunnelId, domain);
            resolve(apiSuccess);
          } catch (apiError) {
            console.log(chalk.red(`❌ API超时回退失败: ${apiError.message}`));
            resolve(false);
          }
        }
      }, 15000); // 增加到15秒超时
    });
  }

  /**
   * 使用CloudFlare API直接创建DNS记录（新增方法）
   * @private
   */
  async _createDnsRecordViaAPI(tunnelId, domain) {
    try {
      console.log(chalk.blue(`🔧 使用API为隧道 ${tunnelId} 创建CNAME记录: ${domain}`));
      
      // 检查是否有有效的API令牌
      const hasValidToken = await this.auth.ensureValidToken();
      if (!hasValidToken) {
        throw new Error('缺少有效的 CloudFlare API 令牌');
      }
      
      // 构建CNAME记录内容
      const cnameTarget = `${tunnelId}.cfargotunnel.com`;
      console.log(chalk.gray(`📝 CNAME记录: ${domain} -> ${cnameTarget}`));
      
      // 使用域名管理器的upsertDnsRecord方法
      const result = await this.domainManager.upsertDnsRecord(domain, cnameTarget, {
        type: 'CNAME',
        ttl: 300,
        proxied: false, // 重要：隧道记录不能开启代理
        comment: `Created by uvx for tunnel ${tunnelId}`
      });
      
      if (result && (result.action === 'created' || result.action === 'updated')) {
        console.log(chalk.green(`✅ DNS记录${result.action === 'created' ? '创建' : '更新'}成功: ${result.message}`));
        
        // 使用强制性DNS验证
        console.log(chalk.blue('🔍 开始强制性DNS记录验证...'));
        const verified = await this._verifyDnsRecordCreation(domain, cnameTarget);
        
        if (verified) {
          console.log(chalk.green('✅ DNS记录创建并验证成功'));
          return true;
        } else {
          console.log(chalk.red('❌ DNS记录创建但验证失败'));
          throw new Error('DNS记录验证失败，隧道无法正常工作');
        }
      } else {
        throw new Error(`DNS记录操作失败: ${result?.message || '未知错误'}`);
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ API创建DNS记录失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 验证DNS记录是否正确创建
   * @private
   */
  async _verifyDnsRecord(domain, expectedTarget, maxRetries = 3) {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(chalk.gray(`🔍 验证DNS记录 (第${attempt}次): ${domain}`));
        
        const cnameRecords = await dns.resolveCname(domain);
        
        if (cnameRecords && cnameRecords.length > 0) {
          const actualTarget = cnameRecords[0];
          
          if (actualTarget === expectedTarget) {
            console.log(chalk.green(`✅ DNS记录验证成功: ${domain} -> ${actualTarget}`));
            return true;
          } else {
            console.log(chalk.yellow(`⚠️ DNS记录不匹配：期望 ${expectedTarget}，实际 ${actualTarget}`));
          }
        } else {
          console.log(chalk.yellow(`⚠️ 未找到CNAME记录 (第${attempt}次)`));
        }
        
        if (attempt < maxRetries) {
          console.log(chalk.blue(`⏳ 等待2秒后重试...`));
          await this._sleep(2000);
        }
        
      } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
          console.log(chalk.yellow(`⚠️ DNS解析失败 (第${attempt}次): 域名未找到或无记录`));
        } else {
          console.log(chalk.yellow(`⚠️ DNS验证失败 (第${attempt}次): ${error.message}`));
        }
        
        if (attempt < maxRetries) {
          await this._sleep(2000);
        }
      }
    }
    
    console.log(chalk.red(`❌ 经过${maxRetries}次尝试，DNS记录验证失败`));
    return false;
  }

  /**
   * 设置隧道进程生命周期管理
   * 包括日志捕获、错误监听和异常处理
   * @param {ChildProcess} child - 隧道子进程
   * @param {string} domain - 域名（用于日志标识）
   * @private
   */
  _setupProcessLifecycleManagement(child, domain) {
    console.log(chalk.blue(`🔧 设置隧道进程生命周期管理: PID ${child.pid}`));
    
    // 捕获标准输出并记录日志
    child.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        console.log(chalk.gray(`[隧道-stdout] ${text}`));
      }
    });
    
    // 捕获标准错误并记录日志（关键：cloudflared主要日志在stderr）
    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        // 根据日志内容选择不同的颜色
        if (text.includes('ERR') || text.includes('failed')) {
          console.log(chalk.red(`[隧道-stderr] ${text}`));
        } else if (text.includes('WRN') || text.includes('WARN')) {
          console.log(chalk.yellow(`[隧道-stderr] ${text}`));
        } else if (text.includes('INF') || text.includes('Registered tunnel connection')) {
          console.log(chalk.cyan(`[隧道-stderr] ${text}`));
        } else {
          console.log(chalk.gray(`[隧道-stderr] ${text}`));
        }
      }
    });
    
    // 监听进程错误事件
    child.on('error', (error) => {
      console.log(chalk.red(`❌ 隧道进程发生错误 (${domain}): ${error.message}`));
      console.log(chalk.gray(`错误详情: ${error.stack || 'N/A'}`));
      
      // 尝试重启逻辑（可选，根据需要）
      if (!child.killed) {
        console.log(chalk.yellow('⚠️ 进程错误但未终止，继续监控...'));
      }
    });
    
    // 监听进程退出事件
    child.on('exit', (code, signal) => {
      const exitInfo = signal ? `信号: ${signal}` : `退出码: ${code}`;
      
      if (code === 0) {
        console.log(chalk.blue(`ℹ️ 隧道进程正常退出 (${domain}) - ${exitInfo}`));
      } else {
        console.log(chalk.red(`❌ 隧道进程异常退出 (${domain}) - ${exitInfo}`));
        
        // 提供诊断信息
        if (code === 1) {
          console.log(chalk.yellow('💡 退出码1通常表示配置错误或权限问题'));
        } else if (signal === 'SIGTERM') {
          console.log(chalk.gray('💡 进程被正常终止（SIGTERM）'));
        } else if (signal === 'SIGKILL') {
          console.log(chalk.red('💡 进程被强制终止（SIGKILL）'));
        }
      }
      
      // 清理当前进程引用
      if (this.currentProcess === child) {
        this.currentProcess = null;
        console.log(chalk.gray('🧹 清理当前进程引用'));
      }
    });
    
    // 监听进程spawn事件
    child.on('spawn', () => {
      console.log(chalk.green(`✅ 隧道进程启动成功 (${domain}): PID ${child.pid}`));
    });
    
    // 设置进程清理处理
    const cleanup = () => {
      if (child && !child.killed) {
        console.log(chalk.yellow(`🧹 清理隧道进程 (${domain}): PID ${child.pid}`));
        child.kill('SIGTERM');
        
        // 如果5秒后还没退出，强制终止
        setTimeout(() => {
          if (child && !child.killed) {
            console.log(chalk.red(`🔨 强制终止隧道进程: PID ${child.pid}`));
            child.kill('SIGKILL');
          }
        }, 5000);
      }
    };
    
    // 注册清理处理器
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('exit', cleanup);
  }

  /**
   * 执行启动后验证
   * 同时检查进程存活状态和DNS记录正确性
   * @param {ChildProcess} child - 隧道进程
   * @param {string} domain - 域名
   * @param {string} tunnelId - 隧道ID
   * @returns {Promise<{processAlive: boolean, dnsConfigured: boolean}>} 验证结果
   * @private
   */
  async _performPostStartupValidation(child, domain, tunnelId) {
    console.log(chalk.blue('🔍 开始启动后完整性验证...'));
    
    const result = {
      processAlive: false,
      dnsConfigured: false
    };
    
    try {
      // 1. 检查进程存活状态
      console.log(chalk.gray('📋 检查1/2: 验证隧道进程存活状态'));
      result.processAlive = await this._verifyProcessAlive(child);
      
      if (result.processAlive) {
        console.log(chalk.green('  ✅ 隧道进程存活正常'));
      } else {
        console.log(chalk.red('  ❌ 隧道进程未存活或已退出'));
      }
      
      // 2. 检查DNS记录配置状态
      console.log(chalk.gray('📋 检查2/2: 验证DNS记录配置状态'));
      const expectedTarget = `${tunnelId}.cfargotunnel.com`;
      result.dnsConfigured = await this._verifyDnsRecordCreation(domain, expectedTarget, 3, 2000);
      
      if (result.dnsConfigured) {
        console.log(chalk.green('  ✅ DNS记录配置正确'));
      } else {
        console.log(chalk.yellow('  ⚠️ DNS记录未配置或传播中'));
      }
      
      // 3. 综合评估
      const overallStatus = result.processAlive && result.dnsConfigured ? 'SUCCESS' : 'PARTIAL';
      console.log(chalk.blue(`📊 验证结果: ${overallStatus}`));
      
      return result;
      
    } catch (error) {
      console.log(chalk.red(`❌ 启动后验证过程发生错误: ${error.message}`));
      return result;
    }
  }

  /**
   * 验证进程存活状态
   * @param {ChildProcess} child - 要检查的子进程
   * @returns {Promise<boolean>} 进程是否存活
   * @private
   */
  async _verifyProcessAlive(child) {
    try {
      // 检查进程对象状态
      if (!child || child.killed) {
        return false;
      }
      
      // 检查PID是否存在
      if (!child.pid) {
        return false;
      }
      
      // 使用signal 0检查进程是否真实存在（不会杀死进程）
      try {
        process.kill(child.pid, 0);
        return true;
      } catch (killError) {
        // ESRCH表示进程不存在，EPERM表示权限不足但进程存在
        if (killError.code === 'EPERM') {
          return true; // 权限问题但进程存在
        }
        return false; // 进程不存在
      }
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️ 进程存活检查异常: ${error.message}`));
      return false;
    }
  }

  /**
   * 强制性DNS记录创建验证（增强版）
   * 使用多种方法验证DNS记录是否真的创建成功
   * @private
   * @param {string} domain - 域名
   * @param {string} expectedTarget - 期望的CNAME目标
   * @param {number} maxRetries - 最大重试次数（默认6次）
   * @param {number} retryInterval - 重试间隔毫秒（默认5000ms）
   * @returns {Promise<boolean>} 验证是否成功
   */
  async _verifyDnsRecordCreation(domain, expectedTarget, maxRetries = 6, retryInterval = 5000) {
    console.log(chalk.blue(`🔍 开始强制性DNS记录验证: ${domain} -> ${expectedTarget}`));
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(chalk.gray(`📋 验证轮次 ${attempt}/${maxRetries}: 多DNS服务器查询`));
        
        // 1. 使用多个DNS服务器进行验证
        const dnsServers = [
          { name: 'Cloudflare', server: '1.1.1.1' },
          { name: 'Google', server: '8.8.8.8' },
          { name: '系统默认', server: null }
        ];
        
        let successCount = 0;
        
        for (const { name, server } of dnsServers) {
          try {
            console.log(chalk.gray(`  🔍 查询${name}DNS服务器...`));
            
            let result;
            if (server) {
              const { Resolver } = await import('dns/promises');
              const resolver = new Resolver();
              resolver.setServers([server]);
              const cnameRecords = await resolver.resolveCname(domain);
              result = cnameRecords?.[0];
            } else {
              const cnameRecords = await dns.resolveCname(domain);
              result = cnameRecords?.[0];
            }
            
            if (result && result === expectedTarget) {
              console.log(chalk.green(`    ✅ ${name}: ${domain} -> ${result}`));
              successCount++;
            } else {
              console.log(chalk.yellow(`    ⚠️ ${name}: 记录不匹配或未找到`));
              console.log(chalk.gray(`       期望: ${expectedTarget}`));
              console.log(chalk.gray(`       实际: ${result || '未找到'}`));
            }
          } catch (dnsError) {
            console.log(chalk.yellow(`    ❌ ${name}: DNS查询失败 - ${dnsError.message}`));
          }
        }
        
        // 2. 如果至少2个DNS服务器验证成功，则认为成功
        if (successCount >= 2) {
          console.log(chalk.green(`✅ DNS记录验证成功！(${successCount}/3 DNS服务器确认)`));
          
          // 3. 额外进行HTTP连通性测试
          console.log(chalk.blue('🌐 执行额外的HTTP连通性测试...'));
          const httpTest = await this._testHttpConnectivity(`https://${domain}`);
          
          if (httpTest.success) {
            console.log(chalk.green(`🎉 端到端连通性测试成功！响应时间: ${httpTest.responseTime}ms`));
            return true;
          } else {
            console.log(chalk.yellow(`⚠️ DNS已传播但HTTP连通性测试失败: ${httpTest.error}`));
            console.log(chalk.gray('这可能是因为隧道尚未完全建立，但DNS记录已正确创建'));
            return true; // DNS记录验证成功，HTTP可能需要更长时间
          }
        }
        
        // 4. 如果验证失败且还有重试机会
        if (attempt < maxRetries) {
          const delay = retryInterval * attempt; // 递增延迟
          console.log(chalk.yellow(`⏳ DNS记录验证失败 (${successCount}/3)，${delay/1000}秒后重试...`));
          await this._sleep(delay);
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ 验证过程异常 (第${attempt}次): ${error.message}`));
        
        if (attempt < maxRetries) {
          await this._sleep(retryInterval);
        }
      }
    }
    
    console.log(chalk.red(`❌ DNS记录验证最终失败，经过${maxRetries}次尝试`));
    console.log(chalk.yellow('💡 可能的原因:'));
    console.log(chalk.gray('   1. DNS记录未能成功创建'));
    console.log(chalk.gray('   2. API权限不足'));
    console.log(chalk.gray('   3. 域名配置错误'));
    console.log(chalk.gray('   4. DNS传播延迟过长'));
    
    return false;
  }

  /**
   * 测试HTTP连通性
   * @private
   * @param {string} url - 要测试的URL
   * @returns {Promise<Object>} 测试结果
   */
  async _testHttpConnectivity(url) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const req = https.request(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'CloudflareTunnelValidator/1.0',
          'Accept': '*/*'
        }
      }, (res) => {
        const responseTime = Date.now() - startTime;
        
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 500,
          statusCode: res.statusCode,
          responseTime,
          headers: res.headers
        });
      });
      
      req.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        resolve({
          success: false,
          error: error.message,
          code: error.code,
          responseTime
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: '连接超时',
          responseTime: 10000
        });
      });
      
      req.end();
    });
  }

  /**
   * 创建隧道 - TunnelProvider接口实现
   * @param {number} port - 本地端口号
   * @param {Object} options - 创建选项
   * @returns {Promise<TunnelResult>} 隧道结果
   */
  async createTunnel(port, options = {}) {
    try {
      console.log(`正在使用 Cloudflare Tunnel 创建隧道到端口 ${port}...`);
      
      // 检查是否可用，如果不可用则尝试自动安装
      const available = await this.isAvailable({ autoInstall: options.autoInstall !== false });
      if (!available) {
        throw new Error('cloudflared 工具不可用，请先安装');
      }

      // 新的入口逻辑：以cert.pem文件作为登录状态的唯一判断依据
      const certPath = join(homedir(), '.cloudflared', 'cert.pem');
      const isAuthenticated = existsSync(certPath);
      
      console.log(chalk.blue('🔐 检查用户认证状态...'));
      
      if (isAuthenticated) {
        console.log(chalk.green('✅ 检测到cloudflared认证（发现cert.pem文件）'));
        console.log(chalk.blue('  → 进入认证后流程'));
        // 进入认证后流程
        return await this.handleAuthenticatedFlow(port, options);
      } else {
        console.log(chalk.yellow('❌ 未检测到cloudflared认证（未发现cert.pem文件）'));
        console.log(chalk.blue('  → 显示用户选择菜单'));
        // 显示双路径选择菜单
        return await this.handleUnauthenticatedFlow(port, options);
      }

    } catch (error) {
      // 清理进程
      await this.closeTunnel();
      
      console.log(chalk.red('❌ 隧道创建失败'));
      
      // 提供详细的错误诊断和解决方案
      this.provideErrorDiagnostics(error, port);
      
      // 处理各种可能的错误
      if (error.message.includes('connection refused')) {
        throw new Error(`无法连接到本地端口 ${port}，请确保服务已启动`);
      } else if (error.message.includes('cloudflared 工具不可用')) {
        throw new Error('cloudflared 工具未安装，请手动安装或重试自动安装');
      } else if (error.message.includes('login required') || error.message.includes('not logged in')) {
        throw new Error('需要登录 Cloudflare 账户，请运行: cloudflared tunnel login');
      } else if (error.message.includes('DNS')) {
        throw new Error(`DNS 配置失败: ${error.message}，请检查域名配置`);
      } else {
        throw new Error(`Cloudflare Tunnel 创建失败: ${error.message}`);
      }
    }
  }

  /**
   * 检查错误输出是否表示 DNS 记录冲突
   * @private
   */
  _isDnsConflictError(stderrOutput) {
    const errorText = stderrOutput.toLowerCase();
    return errorText.includes('cname record with that name already exists') ||
           errorText.includes('record with that host already exists') ||
           errorText.includes('dns record already exists') ||
           errorText.includes('api error code 1003') ||
           errorText.includes('record already exists') ||
           errorText.includes('a, aaaa, or cname record with that host already exists');
  }

  /**
   * 智能解决DNS冲突
   * @private
   */
  async _smartResolveDnsConflict(tunnelId, domain) {
    console.log(chalk.blue('🧠 启动智能DNS冲突解决机制...'));
    console.log(chalk.gray(`域名: ${domain}`));
    console.log(chalk.gray(`新隧道ID: ${tunnelId}`));
    
    try {
      // 检查是否有DNS管理权限
      const hasValidToken = await this.auth.ensureValidToken();
      if (!hasValidToken) {
        console.log(chalk.red('❌ 缺少有效的API令牌，无法自动解决DNS冲突'));
        return false;
      }
      
      // 查询现有DNS记录
      console.log(chalk.blue('🔍 查询现有DNS记录...'));
      const existingRecords = await this._queryExistingDnsRecords(domain);
      
      if (!existingRecords || existingRecords.length === 0) {
        console.log(chalk.yellow('⚠️ 未找到冲突的DNS记录'));
        return false;
      }
      
      // 分析冲突记录并确定解决策略
      for (const record of existingRecords) {
        console.log(chalk.yellow(`🔍 发现冲突记录: ${record.type} -> ${record.content}`));
        
        const strategy = this._determineDnsResolutionStrategy(record, tunnelId);
        console.log(chalk.blue(`📋 解决策略: ${strategy.action}`));
        
        // 执行解决策略
        const success = await this._executeDnsResolutionStrategy(record, strategy, tunnelId, domain);
        
        if (!success) {
          console.log(chalk.red(`❌ 策略执行失败: ${strategy.action}`));
          return false;
        }
      }
      
      // 等待DNS传播后重试
      console.log(chalk.blue('⏳ 等待DNS记录更新传播...'));
      await this._sleep(3000); // 等待3秒
      
      // 重试创建DNS路由
      console.log(chalk.blue('🔄 重试DNS路由创建...'));
      return await this._retryDnsRouteCreation(tunnelId, domain);
      
    } catch (error) {
      console.log(chalk.red(`❌ 智能解决过程失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 查询现有DNS记录
   * @private
   */
  async _queryExistingDnsRecords(domain) {
    try {
      // 使用现有的域名管理器查询DNS记录
      const result = await this.domainManager.queryDnsRecords(domain);
      return result.records || [];
    } catch (error) {
      console.log(chalk.yellow(`⚠️ 查询DNS记录失败: ${error.message}`));
      return [];
    }
  }

  /**
   * 确定DNS解决策略
   * @private
   */
  _determineDnsResolutionStrategy(record, tunnelId) {
    const newContent = `${tunnelId}.cfargotunnel.com`;
    
    if (record.type === 'CNAME') {
      // 如果是指向旧隧道的CNAME记录
      if (record.content.includes('.cfargotunnel.com')) {
        return {
          action: 'UPDATE_CNAME',
          description: '更新过期的隧道CNAME记录',
          newContent
        };
      }
      // 如果是指向外部服务的CNAME记录
      else {
        return {
          action: 'UPDATE_CNAME',
          description: '更新现有CNAME记录指向新隧道',
          newContent
        };
      }
    }
    // 如果是A或AAAA记录
    else if (record.type === 'A' || record.type === 'AAAA') {
      return {
        action: 'DELETE_AND_CREATE_CNAME',
        description: `删除现有${record.type}记录并创建CNAME`,
        newContent
      };
    }
    // 其他类型记录
    else {
      return {
        action: 'DELETE_AND_CREATE_CNAME',
        description: `删除现有${record.type}记录并创建CNAME`,
        newContent
      };
    }
  }

  /**
   * 执行DNS解决策略
   * @private
   */
  async _executeDnsResolutionStrategy(record, strategy, tunnelId, domain) {
    console.log(chalk.blue(`🔧 执行策略: ${strategy.description}`));
    
    try {
      if (strategy.action === 'UPDATE_CNAME') {
        // 修复：删除现有CNAME记录而不是更新，因为cloudflared route dns只能创建新记录
        console.log(chalk.yellow('🔄 改为删除现有记录，然后让cloudflared创建新记录...'));
        const deleteSuccess = await this.domainManager.deleteDnsRecord(record.zone_id, record.id);
        
        if (deleteSuccess) {
          console.log(chalk.green(`✅ CNAME记录已删除: ${domain} -> ${record.content}`));
          
          // 轮询确认删除成功
          const deletionConfirmed = await this._waitForDnsRecordDeletion(domain);
          if (deletionConfirmed) {
            console.log(chalk.blue('💡 cloudflared现在可以成功创建新的CNAME记录'));
            return true;
          } else {
            console.log(chalk.red('❌ DNS记录删除未确认，可能仍存在传播延迟'));
            return false;
          }
        }
        
      } else if (strategy.action === 'DELETE_AND_CREATE_CNAME') {
        // 删除现有记录
        const deleteSuccess = await this.domainManager.deleteDnsRecord(record.zone_id, record.id);
        
        if (deleteSuccess) {
          console.log(chalk.green(`✅ 已删除现有${record.type}记录`));
          
          // 轮询确认删除成功
          const deletionConfirmed = await this._waitForDnsRecordDeletion(domain);
          if (deletionConfirmed) {
            console.log(chalk.blue('💡 cloudflared现在可以成功创建新的CNAME记录'));
            return true;
          } else {
            console.log(chalk.red('❌ DNS记录删除未确认，可能仍存在传播延迟'));
            return false;
          }
        }
      }
      
      return false;
      
    } catch (error) {
      console.log(chalk.red(`❌ 策略执行失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 轮询确认DNS记录删除成功
   * @private
   * @param {string} domain - 要检查的域名
   * @param {number} maxRetries - 最大重试次数 (默认5次)
   * @param {number} interval - 轮询间隔毫秒数 (默认1000ms)
   * @returns {Promise<boolean>} - 删除确认结果
   */
  async _waitForDnsRecordDeletion(domain, maxRetries = 5, interval = 1000) {
    console.log(chalk.blue(`⏳ 轮询确认DNS记录删除: ${domain}`));
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(chalk.gray(`🔍 第${attempt}次检查DNS记录...`));
        
        // 查询DNS记录
        const result = await this.domainManager.queryDnsRecords(domain);
        const records = result.records || [];
        
        if (records.length === 0) {
          console.log(chalk.green(`✅ DNS记录删除确认成功 (第${attempt}次检查)`));
          return true;
        }
        
        console.log(chalk.yellow(`⏳ 仍发现 ${records.length} 条记录，等待${interval}ms后重试...`));
        
        if (attempt < maxRetries) {
          await this._sleep(interval);
        }
        
      } catch (error) {
        console.log(chalk.yellow(`⚠️ 第${attempt}次检查失败: ${error.message}`));
        if (attempt < maxRetries) {
          await this._sleep(interval);
        }
      }
    }
    
    console.log(chalk.red(`❌ 轮询超时：经过${maxRetries}次尝试仍检测到DNS记录存在`));
    return false;
  }

  /**
   * 重试DNS路由创建
   * @private
   */
  async _retryDnsRouteCreation(tunnelId, domain) {
    return new Promise((resolve, reject) => {
      console.log(chalk.blue(`🔄 重新尝试DNS路由: ${domain}`));
      
      // 使用统一命令构建器
      const routeCommand = this.commandBuilder.buildRouteCommand(tunnelId, domain);
      const routeDns = spawn(routeCommand[0], routeCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let retryStderr = '';
      
      routeDns.stderr.on('data', (data) => {
        retryStderr += data.toString();
      });

      routeDns.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ DNS路由重试成功'));
          resolve(true);
        } else {
          console.log(chalk.red(`❌ DNS路由重试失败 (code: ${code})`));
          if (retryStderr.trim()) {
            console.log(chalk.red(`重试错误: ${retryStderr.trim()}`));
          }
          resolve(false);
        }
      });

      routeDns.on('error', (err) => {
        console.log(chalk.red(`❌ 重试进程错误: ${err.message}`));
        resolve(false);
      });

      // 重试超时
      setTimeout(() => {
        if (!routeDns.killed) {
          routeDns.kill();
          resolve(false);
        }
      }, 15000);
    });
  }

  /**
   * 睡眠函数
   * @private
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 启动隧道监控和健康检查
   * @param {string} tunnelUrl - 隧道URL
   * @param {number} localPort - 本地端口
   */
  startTunnelMonitoring(tunnelUrl, localPort) {
    console.log(chalk.blue('🔍 启动隧道健康监控...'));
    
    // 设置健康检查回调
    this.healthChecker.setCallbacks({
      onHealthy: (responseTime) => {
        // 健康状态不需要频繁输出，避免干扰用户
        if (responseTime > 5000) {
          console.log(chalk.yellow(`⚠️ 隧道响应较慢: ${responseTime}ms`));
        }
      },
      
      onUnhealthy: (reason, failures) => {
        console.log(chalk.yellow(`⚠️ 隧道连接异常 (${failures}/3): ${reason}`));
      },
      
      onRecovering: (attempt) => {
        console.log(chalk.blue(`🔄 正在自动恢复隧道连接 (第${attempt}次尝试)...`));
      },
      
      onRecovered: () => {
        console.log(chalk.green('✅ 隧道连接已自动恢复！'));
        console.log(chalk.blue(`🌐 隧道URL: ${this.tunnelUrl}`));
      },
      
      onMaxRetriesReached: () => {
        console.log(chalk.red('❌ 隧道自动恢复失败，已达到最大重试次数'));
        console.log(chalk.yellow('💡 建议手动检查：'));
        console.log(chalk.gray('  1. 本地服务是否正常运行'));
        console.log(chalk.gray('  2. 网络连接是否稳定'));
        console.log(chalk.gray('  3. DNS 配置是否正确'));
        console.log(chalk.gray(`  4. 访问 ${tunnelUrl} 查看状态`));
      }
    });
    
    // 启动健康检查
    this.healthChecker.startHealthCheck(tunnelUrl, localPort);
  }

  /**
   * 验证隧道连接是否正常工作
   * @param {string} tunnelUrl - 隧道URL
   * @param {number} localPort - 本地端口
   * @param {number} maxRetries - 最大重试次数
   * @param {number} retryDelay - 重试延迟（毫秒）
   */
  async validateTunnelConnection(tunnelUrl, localPort, maxRetries = 3, retryDelay = 5000) {
    console.log(chalk.blue('🔍 验证隧道连接...'));
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(chalk.gray(`尝试 ${attempt}/${maxRetries}: 检查隧道连接...`));
        
        // 检查本地服务
        const localHealthy = await this.healthChecker.checkLocalService();
        if (!localHealthy) {
          throw new Error(`本地端口 ${localPort} 无服务响应`);
        }
        
        // 检查隧道连接
        const tunnelHealthy = await this.healthChecker.checkTunnelConnection();
        if (!tunnelHealthy) {
          throw new Error('隧道连接不可用');
        }
        
        // 如果是自定义域名，检查DNS解析
        if (this.customDomainRequested || this.namedTunnelConfig) {
          const domain = this.customDomainRequested || this.namedTunnelConfig?.domain;
          if (domain) {
            const dnsResult = await this.healthChecker.checkDomainResolution(domain);
            if (!dnsResult.resolved) {
              console.log(chalk.yellow(`⚠️ DNS 解析问题: ${dnsResult.reason}`));
              console.log(chalk.gray('这可能是DNS传播延迟造成的，隧道仍可能正常工作'));
            } else {
              console.log(chalk.green(`✅ DNS 解析正常: ${domain} -> ${dnsResult.address}`));
            }
          }
        }
        
        console.log(chalk.green('✅ 隧道连接验证成功'));
        return { success: true, attempt };
        
      } catch (error) {
        console.log(chalk.yellow(`❌ 验证失败 (${attempt}/${maxRetries}): ${error.message}`));
        
        if (attempt < maxRetries) {
          console.log(chalk.blue(`⏳ ${retryDelay/1000}秒后重试...`));
          await this.sleep(retryDelay);
        }
      }
    }
    
    console.log(chalk.red(`❌ 隧道连接验证失败，已重试 ${maxRetries} 次`));
    return { success: false, maxRetries };
  }

  /**
   * 获取隧道健康状态报告
   */
  getTunnelHealthReport() {
    return this.healthChecker.getHealthReport();
  }

  /**
   * 强制执行隧道健康检查
   */
  async forceTunnelHealthCheck() {
    return await this.healthChecker.forceCheck();
  }

  /**
   * 睡眠函数
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 识别失败阶段并提供阶段性指导
   * @param {string} errorMessage - 错误消息（小写）
   * @private
   */
  _identifyFailureStage(errorMessage) {
    console.log(chalk.blue('📋 失败阶段分析：'));
    
    if (errorMessage.includes('cert.pem') || errorMessage.includes('认证') || errorMessage.includes('login')) {
      console.log(chalk.red('  阶段: 🔐 用户认证阶段'));
      console.log(chalk.gray('  说明: Cloudflare认证凭据无效或缺失'));
      console.log(chalk.blue('  解决: 运行 cloudflared tunnel login 获取认证'));
    }
    else if (errorMessage.includes('api') || errorMessage.includes('令牌') || errorMessage.includes('token')) {
      console.log(chalk.red('  阶段: 🔑 API令牌验证阶段'));
      console.log(chalk.gray('  说明: Cloudflare API令牌无效或权限不足'));
      console.log(chalk.blue('  解决: 检查API令牌权限，需要Zone:Read和DNS:Edit权限'));
    }
    else if (errorMessage.includes('隧道创建') || errorMessage.includes('tunnel create') || errorMessage.includes('命名隧道')) {
      console.log(chalk.red('  阶段: 🔧 隧道创建阶段'));
      console.log(chalk.gray('  说明: 无法创建Cloudflare隧道'));
      console.log(chalk.blue('  解决: 检查网络连接和Cloudflare服务状态'));
    }
    else if (errorMessage.includes('配置文件') || errorMessage.includes('config') || errorMessage.includes('凭证文件')) {
      console.log(chalk.red('  阶段: 📝 配置文件创建阶段'));
      console.log(chalk.gray('  说明: 隧道配置文件创建失败'));
      console.log(chalk.blue('  解决: 检查~/.cloudflared/目录权限'));
    }
    else if (errorMessage.includes('dns') || errorMessage.includes('验证失败') || errorMessage.includes('记录')) {
      console.log(chalk.red('  阶段: 🌐 DNS配置阶段'));
      console.log(chalk.gray('  说明: DNS记录创建或验证失败'));
      console.log(chalk.blue('  解决: 检查DNS权限或手动创建CNAME记录'));
    }
    else if (errorMessage.includes('进程') || errorMessage.includes('启动') || errorMessage.includes('连接建立')) {
      console.log(chalk.red('  阶段: 🚀 隧道进程启动阶段'));
      console.log(chalk.gray('  说明: cloudflared进程启动或连接建立失败'));
      console.log(chalk.blue('  解决: 检查网络连接和防火墙设置'));
    }
    else if (errorMessage.includes('验证') || errorMessage.includes('检查') || errorMessage.includes('存活')) {
      console.log(chalk.red('  阶段: ✅ 启动后验证阶段'));
      console.log(chalk.gray('  说明: 隧道启动成功但验证失败'));
      console.log(chalk.blue('  解决: 等待DNS传播或检查进程状态'));
    }
    else {
      console.log(chalk.yellow('  阶段: ❓ 未知阶段'));
      console.log(chalk.gray('  说明: 无法确定具体失败阶段'));
      console.log(chalk.blue('  解决: 查看完整错误信息进行排查'));
    }
    
    console.log('');
  }

  /**
   * 提供详细的错误分析和解决方案
   * @private
   * @param {Error} error - 错误对象
   * @param {string} domain - 相关域名
   * @param {number} port - 相关端口
   */
  _provideDetailedErrorAnalysis(error, domain, port) {
    console.log('');
    console.log(chalk.blue('🔍 详细错误分析：'));
    
    const errorMessage = error.message.toLowerCase();
    
    // 关键修复：根据错误内容判断失败阶段
    this._identifyFailureStage(errorMessage);
    
    // DNS相关错误
    if (errorMessage.includes('dns') || errorMessage.includes('验证失败')) {
      console.log(chalk.yellow('❌ DNS配置问题'));
      console.log(chalk.gray('可能的原因：'));
      console.log(chalk.gray('  1. Cloudflare API令牌权限不足（需要DNS:Edit权限）'));
      console.log(chalk.gray('  2. 域名未正确添加到Cloudflare管理'));
      console.log(chalk.gray('  3. 存在冲突的DNS记录'));
      console.log(chalk.gray('  4. DNS传播延迟过长'));
      
      console.log(chalk.blue('💡 解决方案：'));
      console.log(chalk.gray('  1. 检查API令牌权限：https://dash.cloudflare.com/profile/api-tokens'));
      console.log(chalk.gray('  2. 确保域名已添加到Cloudflare并状态为"Active"'));
      if (domain) {
        console.log(chalk.gray(`  3. 手动删除现有的 ${domain} DNS记录后重试`));
        console.log(chalk.gray(`  4. 或手动创建CNAME记录：${domain} -> [tunnel-id].cfargotunnel.com`));
      }
    }
    
    // 本地服务相关错误
    else if (errorMessage.includes('连接') && errorMessage.includes('本地')) {
      console.log(chalk.yellow('❌ 本地服务连接问题'));
      console.log(chalk.gray('可能的原因：'));
      console.log(chalk.gray(`  1. 端口 ${port} 上没有服务在运行`));
      console.log(chalk.gray('  2. 本地服务启动失败'));
      console.log(chalk.gray('  3. 防火墙阻止了连接'));
      
      console.log(chalk.blue('💡 解决方案：'));
      console.log(chalk.gray(`  1. 确保本地服务正在端口 ${port} 上运行`));
      console.log(chalk.gray(`  2. 测试本地访问：curl http://localhost:${port}`));
      console.log(chalk.gray('  3. 检查防火墙设置'));
      console.log(chalk.gray('  4. 尝试使用其他端口'));
    }
    
    // API令牌相关错误
    else if (errorMessage.includes('api') || errorMessage.includes('令牌') || errorMessage.includes('token')) {
      console.log(chalk.yellow('❌ API认证问题'));
      console.log(chalk.gray('可能的原因：'));
      console.log(chalk.gray('  1. API令牌无效或已过期'));
      console.log(chalk.gray('  2. API令牌权限不足'));
      console.log(chalk.gray('  3. 网络连接问题'));
      
      console.log(chalk.blue('💡 解决方案：'));
      console.log(chalk.gray('  1. 重新生成Cloudflare API令牌'));
      console.log(chalk.gray('  2. 确保令牌具有Zone:Zone:Read和DNS:DNS:Edit权限'));
      console.log(chalk.gray('  3. 检查网络连接'));
    }
    
    // 隧道进程相关错误
    else if (errorMessage.includes('cloudflared') || errorMessage.includes('进程')) {
      console.log(chalk.yellow('❌ 隧道进程问题'));
      console.log(chalk.gray('可能的原因：'));
      console.log(chalk.gray('  1. cloudflared工具未正确安装'));
      console.log(chalk.gray('  2. 隧道进程异常退出'));
      console.log(chalk.gray('  3. 系统资源不足'));
      
      console.log(chalk.blue('💡 解决方案：'));
      console.log(chalk.gray('  1. 重新安装cloudflared'));
      console.log(chalk.gray('  2. 检查系统资源使用情况'));
      console.log(chalk.gray('  3. 查看cloudflared进程日志'));
    }
    
    // 通用错误
    else {
      console.log(chalk.yellow('❌ 未知错误'));
      console.log(chalk.gray('错误详情：' + error.message));
      console.log(chalk.blue('💡 通用解决方案：'));
      console.log(chalk.gray('  1. 重新运行命令'));
      console.log(chalk.gray('  2. 检查网络连接'));
      console.log(chalk.gray('  3. 尝试使用临时隧道模式'));
    }
    
    console.log('');
  }

  /**
   * 判断是否应该尝试回退到临时隧道
   * @private
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该回退
   */
  _shouldAttemptFallback(error) {
    const errorMessage = error.message.toLowerCase();
    
    // 用户主动取消不回退
    if (errorMessage.includes('用户取消') || errorMessage.includes('取消')) {
      return false;
    }
    
    // 工具不可用不回退
    if (errorMessage.includes('不可用') || errorMessage.includes('未安装')) {
      return false;
    }
    
    // DNS问题、API问题、隧道启动问题都可以回退
    return errorMessage.includes('dns') ||
           errorMessage.includes('api') ||
           errorMessage.includes('验证失败') ||
           errorMessage.includes('隧道') ||
           errorMessage.includes('连接') ||
           errorMessage.includes('超时');
  }

  /**
   * 提供详细的错误诊断和解决方案
   * @private
   */
  provideErrorDiagnostics(error, port) {
    console.log('');
    console.log(chalk.blue('🔍 错误诊断：'));
    
    // 本地端口检查
    if (error.message.includes('connection refused') || error.message.includes('ECONNREFUSED')) {
      console.log(chalk.yellow('❌ 本地服务连接失败'));
      console.log(chalk.gray('解决方案：'));
      console.log(chalk.gray(`  1. 确保端口 ${port} 上有服务在运行`));
      console.log(chalk.gray(`  2. 使用 netstat -tlnp | grep :${port} 检查端口状态`));
      console.log(chalk.gray('  3. 检查防火墙或安全软件是否阻止连接'));
      console.log(chalk.gray('  4. 尝试使用 curl http://localhost:' + port + ' 测试本地服务'));
    }
    
    // cloudflared 安装问题
    if (error.message.includes('cloudflared') && error.message.includes('不可用')) {
      console.log(chalk.yellow('❌ cloudflared 工具不可用'));
      console.log(chalk.gray('解决方案：'));
      console.log(chalk.gray('  1. 自动安装: 重新运行命令，程序会尝试自动安装'));
      console.log(chalk.gray('  2. 手动安装 (Ubuntu/Debian):'));
      console.log(chalk.gray('     wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb'));
      console.log(chalk.gray('     sudo dpkg -i cloudflared-linux-amd64.deb'));
      console.log(chalk.gray('  3. 其他系统请访问: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/'));
    }
    
    // 认证问题
    if (error.message.includes('login') || error.message.includes('auth') || error.message.includes('cert.pem')) {
      console.log(chalk.yellow('❌ Cloudflare 认证问题'));
      console.log(chalk.gray('解决方案：'));
      console.log(chalk.gray('  1. 登录 Cloudflare: cloudflared tunnel login'));
      console.log(chalk.gray('  2. 或者配置 API 令牌环境变量'));
      console.log(chalk.gray('  3. 检查 ~/.cloudflared/ 目录权限'));
    }
    
    // DNS 配置问题
    if (error.message.includes('DNS') || error.message.includes('domain')) {
      console.log(chalk.yellow('❌ DNS 配置问题'));
      console.log(chalk.gray('解决方案：'));
      console.log(chalk.gray('  1. 检查域名是否正确配置到 Cloudflare'));
      console.log(chalk.gray('  2. 验证 DNS 记录是否存在冲突'));
      console.log(chalk.gray('  3. 等待 DNS 传播（可能需要几分钟）'));
      console.log(chalk.gray('  4. 尝试使用随机域名模式作为临时解决方案'));
    }
    
    // 网络连接问题
    if (error.message.includes('timeout') || error.message.includes('network')) {
      console.log(chalk.yellow('❌ 网络连接问题'));
      console.log(chalk.gray('解决方案：'));
      console.log(chalk.gray('  1. 检查网络连接是否稳定'));
      console.log(chalk.gray('  2. 尝试切换网络（如使用手机热点）'));
      console.log(chalk.gray('  3. 检查代理或VPN设置'));
      console.log(chalk.gray('  4. 稍后重试'));
    }
    
    // 权限问题
    if (error.message.includes('permission') || error.message.includes('EACCES')) {
      console.log(chalk.yellow('❌ 权限问题'));
      console.log(chalk.gray('解决方案：'));
      console.log(chalk.gray('  1. 检查当前用户权限'));
      console.log(chalk.gray('  2. 确保有权限访问 ~/.cloudflared/ 目录'));
      console.log(chalk.gray('  3. 检查端口是否需要管理员权限'));
    }
    
    console.log('');
    console.log(chalk.blue('💡 通用解决方案：'));
    console.log(chalk.gray('  1. 重新运行命令，程序会自动重试'));
    console.log(chalk.gray('  2. 查看详细错误信息以获得具体指导'));
    console.log(chalk.gray('  3. 访问官方文档: https://developers.cloudflare.com/cloudflare-one/'));
    console.log('');
  }

  /**
   * 处理已认证用户的流程
   * @private
   */
  async handleAuthenticatedFlow(port, options) {
    console.log(chalk.blue('🔑 进入认证后流程...'));
    console.log(chalk.green('✅ cloudflared 认证已完成（cert.pem 存在）'));
    
    try {
      // 步骤1: 检查并获取API令牌
      console.log(chalk.blue('🔐 检查 Cloudflare API 令牌...'));
      const hasValidToken = await this.auth.ensureValidToken();
      
      if (!hasValidToken) {
        console.log(chalk.red('❌ API 令牌验证失败'));
        console.log(chalk.yellow('⚠️ 无法创建命名隧道，回退到临时隧道模式'));
        return await this.handleTemporaryPath(port, options);
      }
      
      console.log(chalk.green('✅ API 令牌验证成功'));
      
      // 步骤2: 获取或生成隧道域名
      let domain = options.domain;
      if (!domain) {
        // 如果没有指定域名，询问用户
        const { customDomain } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customDomain',
            message: '请输入您要使用的自定义域名 (如: my-app.example.com):',
            validate: (input) => {
              if (!input || !input.trim()) {
                return '请输入有效的域名';
              }
              if (!input.includes('.')) {
                return '请输入完整的域名（包含点符号）';
              }
              return true;
            }
          }
        ]);
        domain = customDomain.trim();
      }
      
      console.log(chalk.blue(`🌐 使用域名: ${domain}`));
      
      // 步骤3: 创建命名隧道并配置DNS
      console.log(chalk.blue('🔧 创建命名隧道和 DNS 配置...'));
      const tunnelConfig = await this.setupNamedTunnelWithDNS(domain);
      
      if (!tunnelConfig) {
        console.log(chalk.yellow('⚠️ 命名隧道创建失败，回退到临时隧道模式'));
        return await this.handleTemporaryPath(port, options);
      }
      
      // 步骤4: 创建隧道配置文件并启动隧道
      await this.createTunnelConfig(tunnelConfig.tunnelId, port, domain);
      
      // 使用配置文件运行命名隧道（关键修复：使用--config参数）
      const configPath = join(homedir(), '.cloudflared', 'config.yml');
      const args = ['tunnel', '--config', configPath, 'run', tunnelConfig.tunnelId];
      console.log(chalk.gray(`执行命令: cloudflared ${args.join(' ')}`));

      const child = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.currentProcess = child;
      this.namedTunnelConfig = tunnelConfig;
      this.customDomainRequested = domain;
      
      // 添加进程生命周期管理（关键修复：完善错误处理和日志捕获）
      this._setupProcessLifecycleManagement(child, domain);
      
      // 等待隧道启动确认
      await this.waitForNamedTunnelStartup(child, domain);
      
      const finalUrl = `https://${domain}`;
      this.tunnelUrl = finalUrl;

      console.log('');
      console.log(chalk.green('🎉 命名隧道运行成功！'));
      console.log(chalk.green(`🌐 您的自定义域名：${finalUrl}`));
      console.log(chalk.yellow('⏳ DNS 传播可能需要几分钟时间'));
      console.log(chalk.blue('💡 隧道已成功建立，如果域名暂时无法访问，请稍后重试'));
      console.log('');
      
      // 关键修复：添加启动后验证机制
      console.log(chalk.blue('🔍 执行启动后完整性验证...'));
      const validationResult = await this._performPostStartupValidation(child, domain, tunnelConfig.tunnelId);
      
      if (validationResult.processAlive && validationResult.dnsConfigured) {
        console.log(chalk.green('✅ 启动后验证完全通过'));
        console.log(chalk.gray(`  • 进程存活状态: ✅`));
        console.log(chalk.gray(`  • DNS记录配置: ✅`));
      } else {
        console.log(chalk.yellow('⚠️ 启动后验证部分通过'));
        console.log(chalk.gray(`  • 进程存活状态: ${validationResult.processAlive ? '✅' : '❌'}`));
        console.log(chalk.gray(`  • DNS记录配置: ${validationResult.dnsConfigured ? '✅' : '❌'}`));
        
        if (!validationResult.processAlive) {
          console.log(chalk.red('❌ 隧道进程意外退出，这可能导致服务不可用'));
        }
        if (!validationResult.dnsConfigured) {
          console.log(chalk.yellow('⚠️ DNS记录未完全配置，域名可能暂时无法访问'));
          console.log(chalk.blue('💡 您可以手动在Cloudflare控制面板创建CNAME记录'));
          console.log(chalk.gray(`   记录类型: CNAME`));
          console.log(chalk.gray(`   记录名称: ${domain.split('.')[0]}`));
          console.log(chalk.gray(`   记录值: ${tunnelConfig.tunnelId}.cfargotunnel.com`));
        }
      }
      
      console.log('');
      console.log(chalk.blue('🔍 启动隧道健康监控...'));
      console.log(chalk.gray('提示：健康监控将自动检测DNS传播状态和连接可用性'));
      
      this.startTunnelMonitoring(finalUrl, port);
      
      // 返回隧道结果
      return new TunnelResult(finalUrl, this.name, this.features);

    } catch (error) {
      console.log(chalk.red(`❌ 认证后流程失败: ${error.message}`));
      
      // 提供详细的错误分析和解决方案
      this._provideDetailedErrorAnalysis(error, domain, port);
      
      // 清理进程
      await this.closeTunnel();
      
      // 如果是DNS验证失败或其他非致命错误，尝试回退到临时隧道
      if (this._shouldAttemptFallback(error)) {
        console.log(chalk.yellow('🔄 尝试回退到临时隧道模式...'));
        try {
          return await this.handleTemporaryPath(port, options);
        } catch (fallbackError) {
          console.log(chalk.red('❌ 临时隧道回退也失败了'));
          this._provideDetailedErrorAnalysis(fallbackError, null, port);
          throw new Error(`命名隧道和临时隧道都失败: 主要错误=${error.message}, 回退错误=${fallbackError.message}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * 等待命名隧道启动确认
   * @private
   */
  async waitForNamedTunnelStartup(child, domain) {
    return new Promise((resolve, reject) => {
      let resolved = false;
      let timeoutRef = null;
      
      // 增强的清理函数
      const cleanup = () => {
        if (timeoutRef) {
          clearTimeout(timeoutRef);
          timeoutRef = null;
        }
      };
      
      // 安全的resolve函数，防止竞态条件
      const safeResolve = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          console.log(chalk.green('✅ 命名隧道连接已建立'));
          console.log(chalk.blue('🔍 [DEBUG] safeResolve() 成功执行，resolved = true'));
          resolve();
        } else {
          console.log(chalk.yellow('⚠️ [DEBUG] safeResolve() 被调用但已经 resolved'));
        }
      };
      
      // 安全的reject函数，防止竞态条件
      const safeReject = (error) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          console.log(chalk.red(`🔍 [DEBUG] safeReject() 被调用: ${error.message}`));
          reject(error);
        } else {
          console.log(chalk.yellow(`⚠️ [DEBUG] safeReject() 被调用但已经 resolved: ${error.message}`));
        }
      };
      
      timeoutRef = setTimeout(() => {
        console.log(chalk.red('🔍 [DEBUG] 60秒超时触发，调用 safeReject()'));
        safeReject(new Error('命名隧道启动超时'));
      }, 60000);
      
      console.log(chalk.blue('🔍 [DEBUG] waitForNamedTunnelStartup 已启动，等待连接建立...'));

      child.stdout.on('data', (data) => {
        if (resolved) return;
        
        const text = data.toString();
        console.log(chalk.gray(`[cloudflared] ${text.trim()}`));
        
        // 添加调试日志
        if (text.includes('Registered tunnel connection')) {
          console.log(chalk.blue('🔍 [DEBUG] 检测到 Registered tunnel connection, 调用 safeResolve()'));
          safeResolve();
        } else if (text.includes('connection established')) {
          console.log(chalk.blue('🔍 [DEBUG] 检测到 connection established, 调用 safeResolve()'));
          safeResolve();
        } else if (text.includes('INF') && text.includes('connection=')) {
          console.log(chalk.blue('🔍 [DEBUG] 检测到 INF + connection=, 调用 safeResolve()'));
          safeResolve();
        }
      });

      child.stderr.on('data', (data) => {
        if (resolved) return;
        
        const text = data.toString();
        console.log(chalk.yellow(`[cloudflared] ${text.trim()}`));
        
        // 同时在 stderr 中检查成功连接信号
        if (text.includes('Registered tunnel connection')) {
          console.log(chalk.blue('🔍 [DEBUG] 在STDERR中检测到 Registered tunnel connection, 调用 safeResolve()'));
          safeResolve();
        } else if (text.includes('connection established')) {
          console.log(chalk.blue('🔍 [DEBUG] 在STDERR中检测到 connection established, 调用 safeResolve()'));
          safeResolve();
        } else if (text.includes('INF') && text.includes('connection=')) {
          console.log(chalk.blue('🔍 [DEBUG] 在STDERR中检测到 INF + connection=, 调用 safeResolve()'));
          safeResolve();
        }
        
        if (text.includes('failed to connect') || text.includes('connection refused')) {
          safeReject(new Error(`无法连接到本地端口 ${this.localPort}`));
        }
      });

      child.on('exit', (code) => {
        console.log(chalk.blue(`🔍 [DEBUG] 子进程退出，代码: ${code}, resolved: ${resolved}`));
        
        // 只有在未成功启动且异常退出时才视为错误
        if (code !== 0 && !resolved) {
          console.log(chalk.red(`🔍 [DEBUG] 异常退出且未resolved，调用 safeReject()`));
          safeReject(new Error(`命名隧道进程异常退出 (代码: ${code})`));
        } else {
          console.log(chalk.green(`🔍 [DEBUG] 进程正常退出或已resolved，不做处理`));
        }
        // 正常退出(code=0)不做处理，因为可能是外部信号导致的正常关闭
      });

      child.on('error', (err) => {
        safeReject(new Error(`启动命名隧道失败: ${err.message}`));
      });
    });
  }

  /**
   * 处理未认证用户的流程
   * @private
   */
  async handleUnauthenticatedFlow(port, options) {
    console.log('');
    console.log(chalk.blue('🔐 Cloudflare 隧道设置'));
    console.log(chalk.gray('检测到您尚未通过 cloudflared 登录'));
    console.log(chalk.gray('请选择您希望使用的隧道模式：'));
    console.log('');

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: '请选择隧道模式：',
        choices: [
          {
            name: '🔑 登录并使用自定义域名 (推荐)',
            value: 'login',
            short: '登录使用自定义域名'
          },
          {
            name: '🎲 获取一个临时随机域名',
            value: 'temporary',
            short: '使用临时随机域名'
          }
        ]
      }
    ]);

    console.log('');
    
    if (choice === 'login') {
      console.log(chalk.blue('🔑 您选择了：登录并使用自定义域名'));
      return await this.handleLoginPath(port, options);
    } else {
      console.log(chalk.blue('🎲 您选择了：使用临时随机域名'));
      return await this.handleTemporaryPath(port, options);
    }
  }

  /**
   * 处理登录路径：启动cloudflared tunnel login
   * @private
   */
  async handleLoginPath(port, options) {
    console.log(chalk.blue('🔑 启动 Cloudflare 登录流程...'));
    console.log(chalk.yellow('💡 这将打开浏览器进行 Cloudflare 认证'));
    console.log(chalk.gray('请在浏览器中完成登录，然后返回此终端'));
    console.log('');
    
    try {
      const loginSuccess = await this.performCloudflaredLogin();
      
      if (loginSuccess) {
        console.log(chalk.green('🎉 Cloudflare 登录成功！'));
        console.log(chalk.blue('  → 进入认证后流程'));
        
        // 登录成功后，进入认证后流程
        return await this.handleAuthenticatedFlow(port, options);
      } else {
        console.log(chalk.yellow('⚠️ 登录未完成或被取消'));
        console.log(chalk.blue('💡 您可以：'));
        console.log(chalk.gray('  1. 重新运行此命令再次尝试登录'));
        console.log(chalk.gray('  2. 选择使用临时随机域名模式'));
        
        throw new Error('用户取消登录或登录失败');
      }
    } catch (error) {
      console.log(chalk.red(`❌ 登录过程失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 执行cloudflared登录并等待认证完成
   * @private
   */
  async performCloudflaredLogin() {
    const certPath = join(homedir(), '.cloudflared', 'cert.pem');
    
    // 检查是否已经登录
    if (existsSync(certPath)) {
      console.log(chalk.green('✅ 检测到现有认证文件，登录已完成'));
      return true;
    }
    
    return new Promise((resolve, reject) => {
      console.log(chalk.blue('🚀 启动 cloudflared tunnel login...'));
      
      const loginProcess = spawn('cloudflared', ['tunnel', 'login'], {
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      let resolved = false;
      
      // 设置超时 (3分钟)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log(chalk.yellow('⏰ 登录超时，请重试'));
          loginProcess.kill();
          resolve(false);
        }
      }, 180000);
      
      // 监控输出
      loginProcess.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(chalk.gray(`[cloudflared] ${text.trim()}`));
      });
      
      loginProcess.stderr.on('data', (data) => {
        const text = data.toString();
        console.log(chalk.yellow(`[cloudflared] ${text.trim()}`));
      });
      
      // 监控cert.pem文件创建
      const cloudflaredDir = join(homedir(), '.cloudflared');
      let watcher = null;
      
      if (existsSync(cloudflaredDir)) {
        try {
          watcher = watch(cloudflaredDir, (eventType, filename) => {
            if (filename === 'cert.pem' && existsSync(certPath)) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                if (watcher) watcher.close();
                loginProcess.kill();
                console.log(chalk.green('✅ 检测到认证文件创建，登录成功！'));
                resolve(true);
              }
            }
          });
          
          // 清理监控器
          setTimeout(() => {
            if (watcher) watcher.close();
          }, 180000);
        } catch (watchError) {
          console.log(chalk.yellow('⚠️ 文件监控设置失败，将使用轮询检查'));
          // 使用轮询作为备选方案
          const pollInterval = setInterval(() => {
            if (existsSync(certPath)) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                clearInterval(pollInterval);
                loginProcess.kill();
                console.log(chalk.green('✅ 检测到认证文件，登录成功！'));
                resolve(true);
              }
            }
          }, 2000);
          
          setTimeout(() => clearInterval(pollInterval), 180000);
        }
      }
      
      // 处理进程退出
      loginProcess.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          if (watcher) watcher.close();
          
          if (code === 0 && existsSync(certPath)) {
            console.log(chalk.green('✅ 登录进程正常退出，认证成功'));
            resolve(true);
          } else {
            console.log(chalk.yellow(`⚠️ 登录进程退出，代码: ${code}`));
            resolve(false);
          }
        }
      });
      
      loginProcess.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          if (watcher) watcher.close();
          console.log(chalk.red(`❌ 启动登录进程失败: ${err.message}`));
          resolve(false);
        }
      });
    });
  }

  /**
   * 处理临时域名路径：创建随机隧道
   * @private
   */
  async handleTemporaryPath(port, options) {
    console.log(chalk.blue('🎲 创建临时随机域名隧道...'));
    console.log(chalk.gray('此模式无需登录，将获得一个 *.trycloudflare.com 域名'));
    
    try {
      // 启动 cloudflared 临时隧道
      const args = ['tunnel', '--url', `http://localhost:${port}`];
      console.log(chalk.gray(`执行命令: cloudflared ${args.join(' ')}`));

      const child = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.currentProcess = child;
      
      // 解析输出获取隧道 URL
      const tunnelUrl = await this._parseCloudflaredOutput(child);
      
      if (!tunnelUrl) {
        throw new Error('未能从 cloudflared 获取隧道 URL');
      }

      this.tunnelUrl = tunnelUrl;

      console.log('');
      console.log(chalk.green('🎉 临时隧道创建成功！'));
      console.log(chalk.blue(`🌐 您的临时域名：${tunnelUrl}`));
      console.log(chalk.yellow('⚠️ 注意：此域名会在程序退出时失效'));
      console.log('');

      // 启动隧道验证和健康监控
      console.log(chalk.blue('🔍 正在验证隧道连接...'));
      const validationResult = await this.validateTunnelConnection(tunnelUrl, port, 2, 3000);
      
      if (validationResult.success) {
        console.log(chalk.green('✅ 隧道连接验证成功，启动健康监控'));
        this.startTunnelMonitoring(tunnelUrl, port);
      } else {
        console.log(chalk.yellow('⚠️ 隧道连接验证失败，但仍启动监控'));
        this.startTunnelMonitoring(tunnelUrl, port);
      }
      
      // 返回隧道结果
      return new TunnelResult(tunnelUrl, this.name, this.features);

    } catch (error) {
      // 清理进程
      await this.closeTunnel();
      
      console.log(chalk.red('❌ 临时隧道创建失败'));
      
      // 处理常见错误
      if (error.message.includes('connection refused')) {
        throw new Error(`无法连接到本地端口 ${port}，请确保服务已启动`);
      } else if (error.message.includes('cloudflared')) {
        throw new Error('cloudflared 工具执行失败，请检查是否正确安装');
      } else {
        throw new Error(`临时隧道创建失败: ${error.message}`);
      }
    }
  }

  /**
   * 提供隧道使用指南和故障排除建议
   */
  showTunnelGuidance(tunnelUrl) {
    console.log('');
    console.log(chalk.blue('📖 隧道使用指南：'));
    console.log(chalk.gray('=' .repeat(50)));
    console.log('');
    
    console.log(chalk.green('✅ 隧道已成功创建！'));
    console.log(chalk.blue(`🌐 公共访问地址: ${tunnelUrl}`));
    console.log('');
    
    console.log(chalk.yellow('🔧 功能特性：'));
    console.log(chalk.gray('  • 自动健康检查和故障恢复'));
    console.log(chalk.gray('  • 智能DNS配置和冲突处理'));
    console.log(chalk.gray('  • 实时连接监控'));
    console.log(chalk.gray('  • 自动重试机制'));
    console.log('');
    
    console.log(chalk.yellow('⚠️ 注意事项：'));
    console.log(chalk.gray('  • 保持本地服务运行，避免隧道中断'));
    console.log(chalk.gray('  • DNS传播可能需要几分钟时间'));
    console.log(chalk.gray('  • 程序会自动处理连接问题'));
    console.log(chalk.gray('  • 按 Ctrl+C 安全关闭隧道'));
    console.log('');
    
    console.log(chalk.yellow('🚨 如遇问题：'));
    console.log(chalk.gray('  • 程序会自动尝试恢复连接'));
    console.log(chalk.gray('  • 查看控制台输出获取详细信息'));
    console.log(chalk.gray('  • 检查本地服务状态'));
    console.log(chalk.gray('  • 验证网络连接稳定性'));
    console.log('');
  }

  /**
   * 解析 cloudflared 临时隧道输出获取隧道 URL
   * @private
   * @param {ChildProcess} process - cloudflared 子进程
   * @returns {Promise<string>} 隧道 URL
   */
  _parseCloudflaredOutput(process) {
    return new Promise((resolve, reject) => {
      let tunnelUrl = null;
      let errorOutput = '';
      let resolved = false;
      
      // 设置超时（30秒）
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          process.kill();
          reject(new Error('cloudflared 隧道创建超时 (30秒)'));
        }
      }, 30000);
      
      // 清理函数
      const cleanup = () => {
        clearTimeout(timeout);
      };
      
      // 安全的resolve函数
      const safeResolve = (url) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(url);
        }
      };
      
      // 安全的reject函数
      const safeReject = (error) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(error);
        }
      };
      
      // 监听 stdout 获取隧道 URL
      process.stdout.on('data', (data) => {
        if (resolved) return;
        
        const output = data.toString();
        console.log(chalk.gray(`[cloudflared] ${output.trim()}`));
        
        // 解析临时隧道 URL - cloudflared 返回格式如: "https://xyz.trycloudflare.com"
        const urlMatch = output.match(/(https?:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com)/);
        if (urlMatch) {
          tunnelUrl = urlMatch[1];
          console.log(chalk.green(`✅ 获取到隧道URL: ${tunnelUrl}`));
          safeResolve(tunnelUrl);
        }
      });
      
      // 监听 stderr 获取错误信息和可能的 URL
      process.stderr.on('data', (data) => {
        if (resolved) return;
        
        const output = data.toString();
        errorOutput += output;
        console.log(chalk.yellow(`[cloudflared] ${output.trim()}`));
        
        // 有时候 URL 也会出现在 stderr 中
        const urlMatch = output.match(/(https?:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com)/);
        if (urlMatch) {
          tunnelUrl = urlMatch[1];
          console.log(chalk.green(`✅ 获取到隧道URL: ${tunnelUrl}`));
          safeResolve(tunnelUrl);
        }
        
        // 检查错误情况
        if (output.includes('connection refused') || output.includes('ECONNREFUSED')) {
          safeReject(new Error('无法连接到本地端口，请确保服务已启动'));
        }
      });
      
      // 处理进程退出
      process.on('close', (code) => {
        if (!resolved) {
          let errorMessage = `cloudflared 进程退出 (code: ${code})`;
          
          if (code === 1 && errorOutput.includes('connection refused')) {
            errorMessage = '无法连接到本地端口，请确保服务已启动';
          } else if (errorOutput.includes('cloudflared')) {
            errorMessage = `cloudflared 错误: ${errorOutput.trim()}`;
          } else if (tunnelUrl) {
            // 如果已经获得了URL但进程退出，仍然返回URL
            safeResolve(tunnelUrl);
            return;
          }
          
          safeReject(new Error(errorMessage));
        }
      });
      
      // 处理进程启动错误
      process.on('error', (error) => {
        if (!resolved) {
          if (error.code === 'ENOENT') {
            safeReject(new Error('cloudflared 命令未找到，请确保已正确安装'));
          } else {
            safeReject(new Error(`cloudflared 进程启动失败: ${error.message}`));
          }
        }
      });
    });
  }

  /**
   * 清理命名隧道
   * @param {string} tunnelId - 隧道ID
   * @returns {Promise<boolean>} 清理是否成功
   */
  async cleanupTempTunnel(tunnelId) {
    try {
      console.log(chalk.blue(`🧹 正在清理命名隧道: ${tunnelId}`));
      
      // 停止当前进程
      if (this.currentProcess && !this.currentProcess.killed) {
        console.log(chalk.gray('🔄 停止隧道进程...'));
        this.currentProcess.kill();
        
        // 等待进程关闭
        await new Promise((resolve) => {
          if (this.currentProcess.killed) {
            resolve();
          } else {
            this.currentProcess.on('close', () => resolve());
            setTimeout(() => resolve(), 3000); // 3秒超时
          }
        });
      }
      
      // 尝试删除隧道（如果可能）
      try {
        console.log(chalk.gray('🗑️ 尝试删除命名隧道...'));
        
        return new Promise((resolve) => {
          const deleteTunnel = spawn('cloudflared', ['tunnel', 'delete', tunnelId], {
            stdio: ['ignore', 'pipe', 'pipe']
          });
          
          deleteTunnel.on('close', (code) => {
            if (code === 0) {
              console.log(chalk.green(`✅ 隧道 ${tunnelId} 删除成功`));
            } else {
              console.log(chalk.yellow(`⚠️ 隧道删除失败 (code: ${code})，但继续清理其他资源`));
            }
            resolve(true);
          });
          
          deleteTunnel.on('error', (error) => {
            console.log(chalk.yellow(`⚠️ 隧道删除命令失败: ${error.message}`));
            resolve(true); // 即使删除失败也继续
          });
          
          // 删除超时
          setTimeout(() => {
            deleteTunnel.kill();
            console.log(chalk.yellow('⚠️ 隧道删除超时，跳过'));
            resolve(true);
          }, 10000);
        });
        
      } catch (deleteError) {
        console.log(chalk.yellow(`⚠️ 隧道删除过程出错: ${deleteError.message}`));
      }
      
      console.log(chalk.green('✅ 隧道清理完成'));
      return true;
      
    } catch (error) {
      console.log(chalk.red(`❌ 清理隧道失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 创建cloudflared隧道配置文件
   * @param {string} tunnelId - 隧道ID
   * @param {number} port - 本地端口
   * @param {string} domain - 域名
   * @returns {Promise<string>} 配置文件路径
   */
  async createTunnelConfig(tunnelId, port, domain) {
    try {
      const cloudflaredDir = join(homedir(), '.cloudflared');
      const configFile = join(cloudflaredDir, 'config.yml');
      const credentialsFile = join(cloudflaredDir, `${tunnelId}.json`);
      
      console.log(chalk.blue(`🔧 创建隧道配置文件: ${configFile}`));
      
      // 确保目录存在
      if (!existsSync(cloudflaredDir)) {
        mkdirSync(cloudflaredDir, { recursive: true });
        console.log(chalk.green(`✅ 创建配置目录: ${cloudflaredDir}`));
      }
      
      // 手动构建YAML配置内容（避免额外依赖）
      const yamlContent = [
        `tunnel: ${tunnelId}`,
        `credentials-file: ${credentialsFile}`,
        ``,
        `ingress:`,
        `  - hostname: ${domain}`,
        `    service: http://localhost:${port}`,
        `  - service: http_status:404`
      ].join('\n');
      
      // 写入配置文件
      writeFileSync(configFile, yamlContent, 'utf8');
      
      console.log(chalk.green(`✅ 隧道配置文件已创建: ${configFile}`));
      console.log(chalk.gray(`   隧道ID: ${tunnelId}`));
      console.log(chalk.gray(`   域名: ${domain} -> localhost:${port}`));
      console.log(chalk.gray(`   凭据文件: ${credentialsFile}`));
      
      // 验证凭据文件是否存在
      if (!existsSync(credentialsFile)) {
        console.log(chalk.yellow(`⚠️ 凭据文件不存在: ${credentialsFile}`));
        console.log(chalk.yellow('   隧道可能无法正常启动'));
      } else {
        console.log(chalk.green(`✅ 凭据文件已找到: ${credentialsFile}`));
      }
      
      return configFile;
    } catch (error) {
      console.log(chalk.red(`❌ 创建隧道配置文件失败: ${error.message}`));
      throw new Error(`创建隧道配置文件失败: ${error.message}`);
    }
  }
}