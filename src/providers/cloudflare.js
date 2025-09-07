import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TunnelProvider, TunnelResult, ProviderFeatures } from './interface.js';
import { CloudflaredInstaller } from '../utils/cloudflared-installer.js';
import { CloudflareDomainManager } from '../utils/cloudflare-domain-manager.js';
import { CloudflareAuth } from '../utils/cloudflare-auth.js';
import { CloudflareDnsDebug } from '../utils/cloudflare-dns-debug.js';
import { TunnelHealthChecker } from '../utils/tunnel-health-checker.js';

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
  }

  /**
   * 检查用户是否已通过 API 令牌认证（重构后）
   * @returns {Promise<boolean>} 是否有有效认证
   */
  async isAuthenticated() {
    try {
      return await this.auth.ensureValidToken();
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
   * 创建命名隧道并配置 DNS（一体化方法）
   */
  async setupNamedTunnelWithDNS(domain) {
    try {
      const tunnelName = `tunnel-${domain.replace(/\./g, '-')}-${Date.now()}`;
      
      console.log(chalk.gray(`🔧 创建命名隧道: ${tunnelName}`));
      
      // 检查认证状态
      const authenticated = await this.isAuthenticated();
      if (!authenticated) {
        console.log(chalk.yellow('🔑 需要先登录 Cloudflare 账户才能创建命名隧道'));
        console.log(chalk.blue('🚀 正在尝试自动登录...'));
        
        try {
          await this.login();
          console.log(chalk.green('✅ 登录成功，继续创建隧道...'));
        } catch (loginError) {
          console.log(chalk.red(`❌ 自动登录失败: ${loginError.message}`));
          console.log(chalk.blue('💡 请手动运行以下命令登录后重试：'));
          console.log(chalk.cyan('  cloudflared tunnel login'));
          throw new Error('需要登录 Cloudflare 账户');
        }
      }
      
      // 创建隧道
      const tunnelId = await this.createNamedTunnel(tunnelName);
      if (!tunnelId) {
        throw new Error('无法创建命名隧道');
      }
      
      console.log(chalk.gray(`✅ 隧道创建成功: ${tunnelId}`));
      
      // 配置 DNS 路由
      console.log(chalk.gray(`🌐 配置 DNS 路由: ${domain}`));
      const dnsConfigured = await this.configureNamedTunnelDNS(tunnelId, domain);
      
      if (!dnsConfigured) {
        // DNS 配置失败，清理隧道并回退到临时模式
        console.log(chalk.yellow('⚠️ DNS 配置失败，将回退到临时隧道模式'));
        await this.cleanupTempTunnel(tunnelId);
        return null; // 返回 null 触发回退逻辑
      }
      
      console.log(chalk.green(`✅ 命名隧道和 DNS 配置完成`));
      
      return {
        tunnelId,
        tunnelName,
        domain
      };
    } catch (error) {
      console.log(chalk.red(`❌ 命名隧道设置失败: ${error.message}`));
      return null;
    }
  }

  /**
   * 创建命名隧道
   */
  async createNamedTunnel(tunnelName) {
    return new Promise((resolve, reject) => {
      const createTunnel = spawn('cloudflared', ['tunnel', 'create', tunnelName], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let tunnelId = '';
      let errorOutput = '';
      let resolved = false; // 添加resolved状态管理
      
      createTunnel.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(chalk.gray(`[cloudflared] ${text.trim()}`));
        const idMatch = text.match(/Created tunnel .* with id ([a-f0-9-]+)/);
        if (idMatch) {
          tunnelId = idMatch[1];
        }
      });

      createTunnel.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.log(chalk.yellow(`[cloudflared-error] ${text.trim()}`));
        
        // 检查常见的认证错误
        if (text.includes('cert.pem') || text.includes('origin cert') || text.includes('origincert')) {
          console.log(chalk.red('❌ 检测到认证问题：缺少 Cloudflare 证书'));
          console.log(chalk.blue('💡 请先运行以下命令登录：'));
          console.log(chalk.cyan('  cloudflared tunnel login'));
        }
      });

      createTunnel.on('close', (code) => {
        if (resolved) return;
        resolved = true;
        
        if (code === 0 && tunnelId) {
          console.log(chalk.green(`✅ 隧道创建成功，ID: ${tunnelId}`));
          resolve(tunnelId);
        } else {
          console.log(chalk.red(`❌ 隧道创建失败，退出代码: ${code}`));
          if (errorOutput) {
            console.log(chalk.red(`错误详情: ${errorOutput.trim()}`));
          }
          resolve(null);
        }
      });

      createTunnel.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        console.log(chalk.red(`❌ 启动 cloudflared 进程失败: ${err.message}`));
        resolve(null);
      });

      setTimeout(() => {
        if (!createTunnel.killed && !resolved) {
          console.log(chalk.yellow('⏰ 创建隧道超时，正在终止进程...'));
          createTunnel.kill();
          resolved = true;
          resolve(null);
        }
      }, 30000); // 增加超时时间到30秒
    });
  }

  /**
   * 为命名隧道配置 DNS（增强版，支持冲突处理）
   */
  async configureNamedTunnelDNS(tunnelId, domain) {
    return new Promise((resolve, reject) => {
      const routeDns = spawn('cloudflared', ['tunnel', 'route', 'dns', tunnelId, domain], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let routeDnsTimeout; // 超时句柄，用于在交互式处理时清除

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
          console.log(chalk.green(`✅ DNS 路由配置成功: ${domain}`));
          resolve(true);
        } else {
          // DNS 配置失败，检查是否为 DNS 记录冲突
          console.log(chalk.yellow(`⚠️ DNS 路由配置失败 (exit code: ${code})`));
          
          // 检查特定的 DNS 冲突错误模式
          const isDnsConflict = this._isDnsConflictError(stderrOutput);
          
          if (isDnsConflict) {
            console.log(chalk.blue('🔍 检测到 DNS 记录冲突，尝试自动更新...'));
            
            try {
              // 清除原有超时，避免超时消息干扰
              clearTimeout(routeDnsTimeout);
              
              // 尝试自动更新现有记录而不是交互式处理
              const autoUpdateResult = await this._autoUpdateDnsRecord(tunnelId, domain);
              
              if (autoUpdateResult) {
                console.log(chalk.green('✅ DNS 记录自动更新成功'));
                resolve(true);
              } else {
                console.log(chalk.yellow('⚠️ 自动更新失败，回退到临时隧道模式'));
                resolve(false);
              }
            } catch (error) {
              console.log(chalk.red(`❌ DNS 冲突处理失败: ${error.message}`));
              resolve(false);
            }
          } else {
            // 其他类型的 DNS 配置错误
            if (stderrOutput.trim()) {
              console.log(chalk.red(`DNS 配置错误: ${stderrOutput.trim()}`));
            }
            resolve(false);
          }
        }
      });

      routeDns.on('error', () => {
        console.log(chalk.red('❌ cloudflared DNS 路由命令执行失败'));
        resolve(false);
      });

      // 设置初始超时（可被交互式处理清除）
      routeDnsTimeout = setTimeout(() => {
        if (!routeDns.killed) {
          console.log(chalk.yellow('⏰ DNS 配置超时，正在终止...'));
          routeDns.kill();
          resolve(false);
        }
      }, 10000);
    });
  }

  /**
   * 智能更新或创建 DNS 记录（新方法）
   */
  async smartConfigureDNS(domain, targetHostname) {
    try {
      console.log(chalk.blue(`🧠 智能配置域名 ${domain} 的 DNS 记录...`));
      
      // 使用域名管理器的智能更新功能
      const result = await this.domainManager.upsertDnsRecord(
        domain, 
        targetHostname,
        {
          type: 'CNAME',
          ttl: 300,
          proxied: false,
          comment: `由 uvx-proxy-local 自动创建/更新 - ${new Date().toISOString()}`
        }
      );
      
      console.log(chalk.green(`✅ ${result.message}`));
      
      return {
        success: true,
        action: result.action,
        record: result.record,
        message: result.message
      };
      
    } catch (error) {
      console.error(chalk.red(`❌ DNS 智能配置失败: ${error.message}`));
      
      // 如果智能配置失败，回退到原有方法
      console.log(chalk.yellow('⚠️ 回退到传统配置方法...'));
      return this.autoConfigureDNS(domain, targetHostname);
    }
  }

  /**
   * 自动配置 DNS CNAME 记录（备用方法）
   */
  async autoConfigureDNS(domain, targetHostname) {
    try {
      console.log(chalk.gray(`🔍 为域名 ${domain} 添加 CNAME 记录指向 ${targetHostname}`));
      
      // 解析域名以获取根域名和子域名
      const domainParts = domain.split('.');
      let zoneName, recordName;
      
      if (domainParts.length >= 2) {
        // 假设最后两个部分是根域名，前面的是子域名
        zoneName = domainParts.slice(-2).join('.');
        recordName = domainParts.length > 2 ? domainParts.slice(0, -2).join('.') : '@';
      } else {
        zoneName = domain;
        recordName = '@';
      }
      
      console.log(chalk.gray(`🌐 检测到区域: ${zoneName}, 记录名: ${recordName}`));
      
      return new Promise((resolve, reject) => {
        // 创建一个临时命名隧道来支持 DNS 路由
        // 首先创建隧道
        const tunnelName = `temp-${domain.replace(/\./g, '-')}-${Date.now()}`;
        const createTunnel = spawn('cloudflared', ['tunnel', 'create', tunnelName], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let tunnelId = '';
        
        createTunnel.stdout.on('data', (data) => {
          const text = data.toString();
          // 提取隧道 ID
          const idMatch = text.match(/Created tunnel .* with id ([a-f0-9-]+)/);
          if (idMatch) {
            tunnelId = idMatch[1];
            console.log(chalk.gray(`✅ 创建临时隧道: ${tunnelName} (${tunnelId})`));
          }
        });

        createTunnel.on('close', (code) => {
          if (code === 0 && tunnelId) {
            // 隧道创建成功，现在添加 DNS 路由
            console.log(chalk.gray(`🌐 为隧道添加 DNS 路由: ${domain}`));
            
            const routeDns = spawn('cloudflared', ['tunnel', 'route', 'dns', tunnelId, domain], {
              stdio: ['ignore', 'pipe', 'pipe']
            });

            let dnsError = '';
            routeDns.stderr.on('data', (data) => {
              dnsError += data.toString();
            });
            
            routeDns.on('close', (dnsCode) => {
              if (dnsCode === 0) {
                console.log(chalk.green('✅ DNS 路由配置成功'));
                console.log(chalk.yellow('⚠️ 注意：需要保持命名隧道运行以维持 DNS 路由'));
                console.log(chalk.gray(`隧道 ID: ${tunnelId} 需要保持活跃状态`));
                
                // 不删除隧道！DNS 路由需要它保持运行
                // this.cleanupTempTunnel(tunnelId);
                
                // 保存隧道信息以便后续管理
                this.dnsRouteTunnelId = tunnelId;
                this.dnsRouteTunnelName = tunnelName;
                
                resolve(true);
              } else {
                console.log(chalk.yellow(`⚠️ DNS 路由配置失败`));
                
                // 检查是否是因为DNS记录冲突
                if (dnsError.includes('already exists') || dnsError.includes('record with that host already exists')) {
                  console.log(chalk.yellow('🔄 检测到现有 DNS 记录，需要手动更新'));
                  console.log(chalk.gray('请在 Cloudflare 控制台中：'));
                  console.log(chalk.gray(`1. 删除或更新域名 ${domain} 的现有 A/AAAA/CNAME 记录`));
                  console.log(chalk.gray('2. 或者选择使用不同的子域名'));
                  console.log(chalk.gray('3. 然后重新运行此命令'));
                  
                  // 保留隧道但标记为需要手动配置
                  this.dnsRouteTunnelId = tunnelId;
                  this.dnsRouteTunnelName = tunnelName;
                  this.requiresManualDnsSetup = domain;
                  
                  console.log(chalk.blue('💡 隧道已创建但需要手动 DNS 配置'));
                  console.log(chalk.gray(`隧道 ID: ${tunnelId}`));
                  console.log(chalk.gray(`需要配置的域名: ${domain}`));
                  
                  resolve(true); // 视为成功，但需要手动配置
                } else {
                  console.log(chalk.red(`DNS 配置错误: ${dnsError.trim()}`));
                  this.cleanupTempTunnel(tunnelId);
                  resolve(false);
                }
              }
            });

            routeDns.on('error', () => {
              this.cleanupTempTunnel(tunnelId);
              resolve(false);
            });
          } else {
            console.log(chalk.yellow(`⚠️ 创建临时隧道失败`));
            resolve(false);
          }
        });

        createTunnel.on('error', (err) => {
          console.log(chalk.yellow(`⚠️ DNS 配置命令执行失败: ${err.message}`));
          resolve(false);
        });

        // 超时处理
        setTimeout(() => {
          if (!createTunnel.killed) {
            createTunnel.kill();
            resolve(false);
          }
        }, 30000);
      });
    } catch (error) {
      console.log(chalk.yellow(`⚠️ DNS 自动配置出错: ${error.message}`));
      return false;
    }
  }

  /**
   * 创建隧道配置文件
   */
  async createTunnelConfig(tunnelId, port, domain) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { homedir } = await import('os');
      
      const configDir = path.join(homedir(), '.cloudflared');
      const configFile = path.join(configDir, `config.yml`);
      
      const configContent = `
tunnel: ${tunnelId}
credentials-file: ${path.join(configDir, tunnelId + '.json')}

ingress:
  - hostname: ${domain}
    service: http://localhost:${port}
  - service: http_status:404
`;
      
      // 确保目录存在
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(configFile, configContent.trim());
      console.log(chalk.gray(`✅ 隧道配置文件已创建: ${configFile}`));
      
      return true;
    } catch (error) {
      console.log(chalk.yellow(`⚠️ 创建配置文件失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 清理临时隧道
   */
  cleanupTempTunnel(tunnelId) {
    try {
      const deleteTunnel = spawn('cloudflared', ['tunnel', 'delete', tunnelId], {
        stdio: 'ignore'
      });
      
      deleteTunnel.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.gray(`🗑️ 已清理临时隧道: ${tunnelId}`));
        }
      });
    } catch (error) {
      // 忽略清理错误
    }
  }

  /**
   * 尝试使用 wrangler 添加 DNS 记录（备用方法）
   */
  async tryWranglerDNS(domain, targetHostname) {
    return new Promise((resolve, reject) => {
      // 检查 wrangler 是否可用
      const checkWrangler = spawn('wrangler', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      checkWrangler.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.blue('🔧 尝试使用 wrangler 添加 DNS 记录...'));
          // wrangler 可用，尝试添加 DNS 记录
          // 注意：这需要适当的 API 令牌配置
          resolve(false); // 暂时返回 false，因为需要更复杂的配置
        } else {
          resolve(false);
        }
      });

      checkWrangler.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * 自动配置自定义域名的 DNS 记录（旧版本，保留备用）
   */
  async configureDomainDNS(domain) {
    try {
      console.log(`🔧 尝试为域名 ${domain} 自动配置 DNS 记录...`);
      
      // 尝试使用 cloudflared tunnel route dns 命令
      return new Promise((resolve, reject) => {
        // 首先需要创建一个命名隧道
        const tunnelName = `tunnel-${Date.now()}`;
        let resolved = false; // 添加resolved状态管理
        
        const createTunnel = spawn('cloudflared', ['tunnel', 'create', tunnelName], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let tunnelId = '';
        
        createTunnel.stdout.on('data', (data) => {
          const output = data.toString();
          // 提取隧道 ID
          const idMatch = output.match(/Created tunnel .* with id ([a-f0-9-]+)/);
          if (idMatch) {
            tunnelId = idMatch[1];
            console.log(`✅ 创建隧道成功，ID: ${tunnelId}`);
          }
        });

        createTunnel.on('close', (code) => {
          if (resolved) return;
          
          if (code === 0 && tunnelId) {
            // 创建 DNS 记录
            console.log(`🌐 为域名 ${domain} 创建 DNS 记录...`);
            
            const routeDns = spawn('cloudflared', ['tunnel', 'route', 'dns', tunnelId, domain], {
              stdio: ['ignore', 'pipe', 'pipe']
            });

            routeDns.on('close', (dnsCode) => {
              if (resolved) return;
              resolved = true;
              
              if (dnsCode === 0) {
                console.log(`✅ 域名 ${domain} DNS 记录配置成功`);
                resolve({ tunnelId, tunnelName });
              } else {
                console.log(chalk.yellow(`⚠️  DNS 记录配置可能失败，将尝试直接使用域名`));
                resolve({ tunnelId, tunnelName });
              }
            });

            routeDns.on('error', () => {
              if (resolved) return;
              resolved = true;
              resolve({ tunnelId, tunnelName });
            });
          } else {
            resolved = true;
            reject(new Error('创建隧道失败'));
          }
        });

        createTunnel.on('error', (err) => {
          if (resolved) return;
          resolved = true;
          reject(new Error(`创建隧道失败: ${err.message}`));
        });

        // 超时处理
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            createTunnel.kill();
            reject(new Error('创建隧道超时'));
          }
        }, 30000);
      });
    } catch (error) {
      console.log(chalk.yellow(`⚠️  自动配置 DNS 失败: ${error.message}`));
      return null;
    }
  }

  /**
   * 使用 cloudflared 创建隧道，支持域名选择和自动安装
   */
  async createTunnel(port, options = {}) {
    try {
      console.log(`正在使用 Cloudflare Tunnel 创建隧道到端口 ${port}...`);
      
      // 检查是否可用，如果不可用则尝试自动安装
      const available = await this.isAvailable({ autoInstall: options.autoInstall !== false });
      if (!available) {
        throw new Error('cloudflared 工具不可用，请先安装');
      }

      // 域名选择逻辑
      let domainSelection = null;
      if (!options.skipDomainSelection) {
        domainSelection = await this.domainManager.showDomainSelectionMenu({
          resetDomain: options.resetDomain || false
        });
      }

      // 根据域名选择和选项决定使用模式
      const useCustomDomain = domainSelection && domainSelection.domain;
      // 自定义域名不再需要认证，使用 CNAME 方式
      const useAuthMode = this.authMode || options.useAuth;
      
      let args;
      let tunnelMode = '临时模式';

      if (useCustomDomain) {
        // 处理自定义域名（优先级最高）
        console.log(chalk.blue(`🔧 为自定义域名 ${domainSelection.domain} 配置隧道...`));
        console.log(chalk.yellow(`💡 将尝试创建命名隧道，如失败则回退到临时隧道`));
        
        // 首先尝试创建命名隧道并配置 DNS
        console.log(chalk.gray('🛠️ 正在创建命名隧道和 DNS 配置...'));
        
        try {
          const tunnelConfig = await this.setupNamedTunnelWithDNS(domainSelection.domain);
          if (tunnelConfig) {
            // 创建隧道配置文件
            await this.createTunnelConfig(tunnelConfig.tunnelId, port, domainSelection.domain);
            
            // 使用创建的命名隧道
            args = ['tunnel', 'run', tunnelConfig.tunnelId];
            tunnelMode = `命名隧道模式 (域名: ${domainSelection.domain})`;
            this.namedTunnelConfig = tunnelConfig;
            this.customDomainRequested = domainSelection.domain;
          } else {
            throw new Error('命名隧道创建失败');
          }
        } catch (error) {
          console.log(chalk.red(`❌ 命名隧道创建失败: ${error.message}`));
          console.log(chalk.blue('🔄 自动回退到临时隧道模式 + API DNS 配置...'));
          
          // 检查是否有 API 凭据可用于 DNS 管理
          const hasApiCredentials = this.domainManager.getApiCredentials() !== null;
          
          if (hasApiCredentials) {
            console.log(chalk.green('✅ 检测到 Cloudflare API 凭据，将使用智能 DNS 配置'));
            tunnelMode = `临时隧道 + 智能 DNS 配置 (域名: ${domainSelection.domain})`;
          } else {
            console.log(chalk.yellow('⚠️ 未检测到 Cloudflare API 凭据，需要手动 DNS 配置'));
            tunnelMode = `临时隧道 (需要手动 DNS 配置)`;
          }
          
          // 回退到临时隧道
          args = ['tunnel', '--url', `http://localhost:${port}`];
          this.customDomainRequested = domainSelection.domain;
        }
      } else if (useAuthMode) {
        // 需要认证的持久模式
        const authenticated = await this.isAuthenticated();
        if (!authenticated) {
          console.log(chalk.red('❌ 持久模式需要先登录 Cloudflare 账户'));
          console.log(chalk.blue('请运行以下命令登录：'));
          console.log(chalk.cyan('  node ./bin/index.js --cloudflare-login'));
          throw new Error('需要先登录 Cloudflare 账户才能使用持久模式');
        }
        
        console.log(chalk.green('✅ 已检测到 Cloudflare 登录状态'));
        args = ['tunnel', '--url', `http://localhost:${port}`];
        tunnelMode = '持久模式';
      } else {
        // 使用临时模式（随机域名，无需登录）
        args = ['tunnel', '--url', `http://localhost:${port}`];
        tunnelMode = '临时模式 (随机 *.trycloudflare.com 域名)';
      }

      console.log(`📋 使用模式: ${tunnelMode}`);

      // 启动 cloudflared 子进程
      const child = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.currentProcess = child;
      
      // 解析输出获取隧道 URL
      const tunnelUrl = await this._parseCloudflaredOutput(child, useCustomDomain ? domainSelection.domain : null);
      
      if (!tunnelUrl) {
        throw new Error('未能从 cloudflared 获取隧道 URL');
      }

      this.tunnelUrl = tunnelUrl;

      // 如果使用了命名隧道（自定义域名），直接返回自定义域名
      if (this.namedTunnelConfig) {
        console.log('');
        console.log(chalk.green('✅ 命名隧道运行成功！'));
        console.log(chalk.green(`🌐 您的自定义域名：https://${this.namedTunnelConfig.domain}`));
        console.log(chalk.yellow('⏳ DNS 传播可能需要几分钟时间'));
        console.log('');
        
        // 返回用户的自定义域名
        const finalUrl = `https://${this.namedTunnelConfig.domain}`;
        
        // 验证并启动健康监控
        console.log(chalk.blue('🔍 验证自定义域名连接...'));
        const validationResult = await this.validateTunnelConnection(finalUrl, port, 2, 3000);
        
        if (validationResult.success) {
          console.log(chalk.green('✅ 自定义域名连接验证成功'));
        } else {
          console.log(chalk.yellow('⚠️ 自定义域名验证失败，可能需要等待DNS传播'));
          console.log(chalk.gray(`直接访问隧道: ${tunnelUrl}`));
        }
        
        this.startTunnelMonitoring(finalUrl, port);
        return new TunnelResult(finalUrl, this.name, this.features, tunnelUrl);
      }
      
      // 如果是回退模式（使用临时隧道但用户想要自定义域名）
      if (this.customDomainRequested && !this.namedTunnelConfig) {
        const tunnelHostname = new URL(tunnelUrl).hostname;
        
        console.log('');
        console.log(chalk.yellow('⚠️ 已回退到临时隧道模式'));
        
        // 尝试智能配置 DNS 记录
        try {
          console.log(chalk.blue('🤖 尝试自动配置 DNS 记录...'));
          
          const dnsResult = await this.smartConfigureDNS(this.customDomainRequested, tunnelHostname);
          
          if (dnsResult && dnsResult.success) {
            console.log('');
            console.log(chalk.green('🎉 DNS 记录配置成功！'));
            console.log(chalk.green(`✅ ${dnsResult.message}`));
            console.log(chalk.blue(`🌐 您的自定义域名: https://${this.customDomainRequested}`));
            console.log(chalk.gray('💡 DNS 传播可能需要几分钟时间'));
            
            if (dnsResult.action === 'updated') {
              console.log(chalk.yellow('📝 已更新现有 DNS 记录'));
            } else if (dnsResult.action === 'created') {
              console.log(chalk.green('📝 已创建新的 DNS 记录'));
            }
          } else {
            throw new Error('自动 DNS 配置失败');
          }
          
        } catch (dnsError) {
          console.log(chalk.yellow(`⚠️ 自动 DNS 配置失败: ${dnsError.message}`));
          console.log(chalk.blue('📋 请手动添加以下 DNS 记录：'));
          console.log('');
          console.log(chalk.cyan(`记录类型: CNAME`));
          console.log(chalk.cyan(`名称: ${this.customDomainRequested}`));
          console.log(chalk.cyan(`值: ${tunnelHostname}`));
          console.log('');
          console.log(chalk.yellow('配置完成后，您就可以通过以下地址访问：'));
          console.log(chalk.green(`https://${this.customDomainRequested}`));
        }
        
        console.log('');
        
        // 返回用户期望的域名
        const finalUrl = `https://${this.customDomainRequested}`;
        
        // 验证并启动健康监控
        console.log(chalk.blue('🔍 验证回退模式连接...'));
        const validationResult = await this.validateTunnelConnection(finalUrl, port, 1, 2000);
        
        if (validationResult.success) {
          console.log(chalk.green('✅ 回退模式连接验证成功'));
        } else {
          console.log(chalk.yellow('⚠️ 自定义域名可能需要更多时间生效'));
          console.log(chalk.gray(`临时访问地址: ${tunnelUrl}`));
        }
        
        this.startTunnelMonitoring(finalUrl, port);
        return new TunnelResult(finalUrl, this.name, this.features, tunnelUrl);
      }

      // 显示域名管理提示
      if (domainSelection && domainSelection.type !== 'random') {
        this.domainManager.showResetInstructions();
      }

      // 启动隧道验证和健康监控
      console.log(chalk.blue('🔍 正在验证隧道连接...'));
      const validationResult = await this.validateTunnelConnection(tunnelUrl, port, 2, 3000);
      
      if (validationResult.success) {
        console.log(chalk.green('✅ 隧道连接验证成功，启动健康监控'));
        this.startTunnelMonitoring(tunnelUrl, port);
      } else {
        console.log(chalk.yellow('⚠️ 隧道连接验证失败，但仍启动监控（可能需要等待DNS传播）'));
        this.startTunnelMonitoring(tunnelUrl, port);
      }
      
      // 返回标准的隧道结果
      return new TunnelResult(tunnelUrl, this.name, this.features);

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
   * 解析 cloudflared 输出获取隧道 URL
   */
  _parseCloudflaredOutput(child, expectedDomain = null) {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log(chalk.yellow('⏰ cloudflared 启动超时，终止进程...'));
          if (child && !child.killed) {
            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            }, 5000);
          }
          reject(new Error('cloudflared 启动超时'));
        }
      }, 60000); // 增加到60秒超时

      child.stdout.on('data', (data) => {
        if (resolved) return;
        
        const text = data.toString();
        output += text;
        
        // 如果使用自定义域名，优先查找该域名
        if (expectedDomain) {
          // 检查是否包含自定义域名的 URL
          if (text.includes(expectedDomain)) {
            const customUrlMatch = text.match(new RegExp(`https?://[^\\s]*${expectedDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s]*`));
            if (customUrlMatch) {
              resolved = true;
              clearTimeout(timeout);
              resolve(customUrlMatch[0].trim());
              return;
            }
          }
          
          // 检查 cloudflared 是否报告隧道已准备好（即使没有看到 URL）
          if (text.includes('Registered tunnel connection') || 
              text.includes('connection established') ||
              text.includes('Tunnel connection curve preferences') ||
              text.includes('connection=') && text.includes('event=0')) {
            console.log(`✅ 隧道连接已建立，使用域名: https://${expectedDomain}`);
            resolved = true;
            clearTimeout(timeout);
            resolve(`https://${expectedDomain}`);
            return;
          }
        }
        
        // 查找随机隧道 URL (格式: https://xxx.trycloudflare.com)
        const urlMatch = text.match(/https?:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
        if (urlMatch) {
          // 如果期望自定义域名但得到了随机域名，说明自定义域名配置有问题
          if (expectedDomain) {
            console.log(chalk.yellow(`⚠️  指定的域名 ${expectedDomain} 配置有问题，cloudflared 创建了随机域名作为回退`));
            console.log(chalk.gray('建议检查域名的 DNS 配置或 Cloudflare 隧道设置'));
          }
          resolved = true;
          clearTimeout(timeout);
          resolve(urlMatch[0]);
          return;
        }
        
        // 查找其他 Cloudflare 相关的 URL 格式
        const altUrlMatch = text.match(/https?:\/\/[a-zA-Z0-9\-\.]+\.cloudflare\.com/);
        if (altUrlMatch) {
          resolved = true;
          clearTimeout(timeout);
          resolve(altUrlMatch[0]);
          return;
        }
      });

      child.stderr.on('data', (data) => {
        if (resolved) return;
        
        const text = data.toString();
        errorOutput += text;
        
        // 在 stderr 中也检查连接建立的信号
        if (expectedDomain && (
            text.includes('Registered tunnel connection') || 
            text.includes('connection established') ||
            text.includes('Tunnel connection curve preferences') ||
            (text.includes('connection=') && text.includes('event=0')))) {
          console.log(`✅ 隧道连接已建立 (via stderr)，使用域名: https://${expectedDomain}`);
          resolved = true;
          clearTimeout(timeout);
          resolve(`https://${expectedDomain}`);
          return;
        }
        
        // 在 stderr 中查找随机隧道 URL
        const stderrUrlMatch = text.match(/https?:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
        if (stderrUrlMatch) {
          if (expectedDomain) {
            console.log(chalk.yellow(`⚠️  指定的域名 ${expectedDomain} 配置有问题，cloudflared 创建了随机域名作为回退`));
            console.log(chalk.gray('建议检查域名的 DNS 配置或 Cloudflare 隧道设置'));
          }
          resolved = true;
          clearTimeout(timeout);
          resolve(stderrUrlMatch[0]);
          return;
        }
        
        // 检查是否有错误信息
        if (text.includes('failed to connect to origin') || text.includes('connection refused') || text.includes('dial tcp')) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`无法连接到本地端口 ${this.localPort}，请确保该端口上有服务运行`));
          return;
        }
        
        if (text.includes('login required') || text.includes('not logged in')) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('需要登录 Cloudflare 账户，请运行 cloudflared tunnel login'));
          return;
        }
      });

      child.on('exit', (code) => {
        if (resolved) return;
        
        resolved = true;
        clearTimeout(timeout);
        
        if (code !== 0) {
          reject(new Error(`cloudflared 进程异常退出 (代码: ${code}): ${errorOutput}`));
        } else {
          reject(new Error('cloudflared 进程意外结束'));
        }
      });

      child.on('error', (err) => {
        if (resolved) return;
        
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`启动 cloudflared 失败: ${err.message}`));
      });
    });
  }

  /**
   * 关闭当前隧道
   */
  async closeTunnel() {
    try {
      // 停止健康检查
      this.healthChecker.stopHealthCheck();
      
      if (this.currentProcess) {
        // 发送 SIGTERM 信号优雅关闭
        this.currentProcess.kill('SIGTERM');
        
        // 等待一段时间后强制关闭
        setTimeout(() => {
          if (this.currentProcess && !this.currentProcess.killed) {
            this.currentProcess.kill('SIGKILL');
          }
        }, 5000);
        
        this.currentProcess = null;
        this.tunnelUrl = null;
        console.log('Cloudflare Tunnel 隧道已关闭');
      }

      // 如果使用了命名隧道（自定义域名），清理它
      if (this.namedTunnelConfig) {
        // Store values before nullifying to avoid race condition
        const { tunnelName, tunnelId, domain } = this.namedTunnelConfig;
        console.log(`🗑️  清理命名隧道: ${tunnelName}`);
        
        // Nullify immediately after storing values
        this.namedTunnelConfig = null;
        
        try {
          const deleteTunnel = spawn('cloudflared', ['tunnel', 'delete', tunnelId], {
            stdio: 'ignore'
          });
          
          deleteTunnel.on('close', (code) => {
            if (code === 0) {
              console.log(`✅ 命名隧道已清理: ${tunnelName}`);
              console.log(`📝 域名 ${domain} 的 DNS 记录也会被自动清理`);
            }
          });
        } catch (error) {
          // 忽略清理错误
        }
      }
    } catch (error) {
      console.warn(`关闭 Cloudflare Tunnel 隧道时出错: ${error.message}`);
    }
  }

  /**
   * 获取详细的特性信息
   */
  getFeatures() {
    return {
      ...super.getFeatures(),
      // Cloudflare 特有的额外信息
      maxConnections: '无限制',
      dataTransfer: '无限制',
      uptime: '99.9%+',
      regions: ['全球 CDN'],
      benefits: [
        '无需注册账户',
        '自动 HTTPS',
        'DDoS 保护',
        '全球 CDN 加速',
        '无确认页面'
      ]
    };
  }

  /**
   * 获取当前隧道状态
   */
  getStatus() {
    return {
      isActive: this.currentProcess !== null && !this.currentProcess.killed,
      tunnelUrl: this.tunnelUrl,
      processId: this.currentProcess?.pid
    };
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
           errorText.includes('api error code 81057') ||
           errorText.includes('record already exists') ||
           errorText.includes('a, aaaa, or cname record with that host already exists');
  }

  /**
   * 自动更新 DNS 记录指向新隧道
   * @private
   */
  async _autoUpdateDnsRecord(tunnelId, domain) {
    try {
      console.log(chalk.blue('🔄 自动更新 DNS 记录...'));
      
      // 检查现有 DNS 记录
      const existingRecord = await this.dnsDebugger.handleExistingDnsRecord(domain);
      
      if (!existingRecord.found || !existingRecord.canUpdate) {
        console.log(chalk.yellow('⚠️ 无法自动更新现有记录'));
        return false;
      }
      
      // 执行更新
      const result = await this.dnsDebugger.updateExistingRecord(
        existingRecord.record, 
        existingRecord.zoneId, 
        tunnelId
      );
      
      if (result.success) {
        console.log(chalk.green(`✅ DNS 记录已自动更新: ${domain} → ${tunnelId}.cfargotunnel.com`));
        return true;
      } else {
        console.log(chalk.yellow(`⚠️ 自动更新失败: ${result.error}`));
        return false;
      }
    } catch (error) {
      console.log(chalk.red(`❌ 自动更新出错: ${error.message}`));
      return false;
    }
  }

  /**
   * 处理 DNS 记录冲突的交互式菜单
   * @private
   */
  async _handleDnsConflict(tunnelId, domain) {
    console.log('');
    console.log(chalk.blue('🛠️ DNS 记录冲突处理'));
    console.log(chalk.gray('=' .repeat(40)));
    console.log('');

    try {
      // 检查现有 DNS 记录
      console.log(chalk.yellow('📋 正在检查现有 DNS 记录...'));
      const existingRecord = await this.dnsDebugger.handleExistingDnsRecord(domain);
      
      if (existingRecord.error) {
        console.log(chalk.red(`❌ 无法检查现有记录: ${existingRecord.error}`));
        return false;
      }

      if (existingRecord.found) {
        console.log(chalk.yellow('⚠️ 发现冲突的 DNS 记录:'));
        console.log(chalk.gray(`  类型: ${existingRecord.record.type}`));
        console.log(chalk.gray(`  名称: ${existingRecord.record.name}`));
        console.log(chalk.gray(`  内容: ${existingRecord.record.content}`));
        console.log('');
      }

      // 显示交互式选项菜单
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '检测到 DNS 记录冲突，请选择处理方式：',
          choices: [
            {
              name: `🔄 更新现有记录指向新隧道 (${tunnelId}.cfargotunnel.com)`,
              value: 'update',
              short: '更新记录'
            },
            {
              name: '🏷️ 输入新的子域名',
              value: 'rename',
              short: '新域名'
            },
            {
              name: '🎲 使用随机 trycloudflare.com 域名',
              value: 'random',
              short: '随机域名'
            },
            {
              name: '❌ 退出',
              value: 'exit',
              short: '退出'
            }
          ]
        }
      ]);

      console.log('');

      switch (action) {
        case 'update':
          return await this._handleUpdateExistingRecord(existingRecord, tunnelId);
          
        case 'rename':
          return await this._handleRenameSubdomain(tunnelId);
          
        case 'random':
          return await this._handleUseRandomDomain();
          
        case 'exit':
          console.log(chalk.yellow('操作已取消，程序退出'));
          process.exit(0);
          
        default:
          return false;
      }

    } catch (error) {
      console.log(chalk.red(`❌ DNS 冲突处理过程失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 处理更新现有记录的选项
   * @private
   */
  async _handleUpdateExistingRecord(existingRecord, tunnelId) {
    if (!existingRecord || !existingRecord.found) {
      console.log(chalk.red('❌ 找不到现有记录信息'));
      return false;
    }

    if (!existingRecord.canUpdate) {
      console.log(chalk.red(`❌ 记录类型 ${existingRecord.record.type} 不支持自动更新`));
      return false;
    }

    console.log(chalk.blue('🔄 正在更新 DNS 记录...'));
    console.log(chalk.gray(`从: ${existingRecord.record.content}`));
    console.log(chalk.gray(`到: ${tunnelId}.cfargotunnel.com`));
    
    try {
      const result = await this.dnsDebugger.updateExistingRecord(existingRecord.record, existingRecord.zoneId, tunnelId);
      
      if (result.success) {
        console.log('');
        console.log(chalk.green('🎉 DNS 记录更新成功！'));
        console.log(chalk.blue('📋 更新后的记录:'));
        console.log(chalk.gray(`  类型: ${result.record.type}`));
        console.log(chalk.gray(`  名称: ${result.record.name}`));
        console.log(chalk.gray(`  内容: ${result.record.content}`));
        console.log('');
        return true;
      } else {
        console.log(chalk.red(`❌ 更新失败: ${result.error}`));
        return false;
      }
    } catch (error) {
      console.log(chalk.red(`❌ 更新记录时出错: ${error.message}`));
      return false;
    }
  }

  /**
   * 处理重命名子域名的选项
   * @private
   */
  async _handleRenameSubdomain(tunnelId) {
    try {
      const { newDomain } = await inquirer.prompt([
        {
          type: 'input',
          name: 'newDomain',
          message: '请输入新的域名（完整域名，如 new-subdomain.example.com）:',
          validate: (input) => {
            if (!input || input.trim().length === 0) {
              return '请输入有效的域名';
            }
            if (!input.includes('.')) {
              return '请输入完整域名（包含点符号）';
            }
            return true;
          }
        }
      ]);

      const domain = newDomain.trim();
      console.log(chalk.blue(`🔧 正在为域名 ${domain} 配置 DNS 路由...`));
      
      // 递归调用配置 DNS，如果新域名也有冲突则继续处理
      const success = await this.configureNamedTunnelDNS(tunnelId, domain);
      
      if (success) {
        console.log(chalk.green(`✅ 新域名 ${domain} 配置成功！`));
        // 更新当前配置的域名信息
        if (this.namedTunnelConfig) {
          this.namedTunnelConfig.domain = domain;
        }
        this.customDomainRequested = domain;
        return true;
      } else {
        console.log(chalk.red(`❌ 新域名 ${domain} 配置失败`));
        return false;
      }
    } catch (error) {
      console.log(chalk.red(`❌ 域名重命名过程失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 处理使用随机域名的选项
   * @private
   */
  async _handleUseRandomDomain() {
    console.log(chalk.blue('🎲 切换到随机 trycloudflare.com 域名模式'));
    console.log(chalk.yellow('💡 此模式不需要 DNS 配置，将生成临时域名'));
    
    // 标记使用临时模式，清除自定义域名配置
    this.customDomainRequested = null;
    if (this.namedTunnelConfig) {
      this.namedTunnelConfig = null;
    }
    
    console.log(chalk.green('✅ 已切换到临时模式，隧道将使用随机 *.trycloudflare.com 域名'));
    
    // 返回 true 表示"配置成功"（虽然实际上是跳过了 DNS 配置）
    return true;
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
}