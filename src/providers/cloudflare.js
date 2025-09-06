import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { TunnelProvider, TunnelResult, ProviderFeatures } from './interface.js';
import { CloudflaredInstaller } from '../utils/cloudflared-installer.js';
import { CloudflareDomainManager } from '../utils/cloudflare-domain-manager.js';

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
  }

  /**
   * 检查用户是否已登录 Cloudflare 账户
   */
  async isAuthenticated() {
    try {
      // 检查 cloudflared 凭据文件是否存在
      const cloudflaredDir = join(homedir(), '.cloudflared');
      const certPath = join(cloudflaredDir, 'cert.pem');
      
      if (!existsSync(certPath)) {
        return false;
      }

      // 尝试运行 cloudflared service install 来验证认证状态
      // 这个命令在未认证时会失败
      return new Promise((resolve) => {
        const child = spawn('cloudflared', ['tunnel', 'list'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let hasValidOutput = false;

        child.stdout.on('data', (data) => {
          const output = data.toString();
          // 如果能列出隧道或显示空列表，说明已认证
          if (output.includes('NAME') || output.includes('No tunnels') || output.includes('ID')) {
            hasValidOutput = true;
          }
        });

        child.on('close', (code) => {
          resolve(hasValidOutput || code === 0);
        });

        child.on('error', () => {
          resolve(false);
        });

        // 超时处理
        setTimeout(() => {
          if (!child.killed) {
            child.kill();
            resolve(false);
          }
        }, 5000);
      });
    } catch (error) {
      console.warn(`检查认证状态失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 登录 Cloudflare 账户
   */
  async login() {
    try {
      console.log('🔐 开始 Cloudflare 登录流程...');
      
      // 检查 cloudflared 是否可用
      const available = await this.isAvailable();
      if (!available) {
        throw new Error('cloudflared 工具不可用，请先安装');
      }

      // 启动登录进程
      const child = spawn('cloudflared', ['tunnel', 'login'], {
        stdio: 'inherit' // 继承父进程的输入输出，允许用户交互
      });

      return new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Cloudflare 登录成功！');
            resolve(true);
          } else {
            reject(new Error(`登录失败，退出代码: ${code}`));
          }
        });

        child.on('error', (err) => {
          reject(new Error(`启动登录进程失败: ${err.message}`));
        });
      });
    } catch (error) {
      throw new Error(`Cloudflare 登录失败: ${error.message}`);
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
        // DNS 配置失败，但检查是否需要手动配置
        if (this.requiresManualDnsSetup) {
          console.log(chalk.blue('💡 隧道保持运行，等待手动 DNS 配置'));
        } else {
          // 真正的配置失败，清理隧道
          await this.cleanupTempTunnel(tunnelId);
          throw new Error('DNS 路由配置失败');
        }
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
      
      createTunnel.stdout.on('data', (data) => {
        const text = data.toString();
        const idMatch = text.match(/Created tunnel .* with id ([a-f0-9-]+)/);
        if (idMatch) {
          tunnelId = idMatch[1];
        }
      });

      createTunnel.on('close', (code) => {
        if (code === 0 && tunnelId) {
          resolve(tunnelId);
        } else {
          resolve(null);
        }
      });

      createTunnel.on('error', () => {
        resolve(null);
      });

      setTimeout(() => {
        if (!createTunnel.killed) {
          createTunnel.kill();
          resolve(null);
        }
      }, 15000);
    });
  }

  /**
   * 为命名隧道配置 DNS
   */
  async configureNamedTunnelDNS(tunnelId, domain) {
    return new Promise((resolve, reject) => {
      const routeDns = spawn('cloudflared', ['tunnel', 'route', 'dns', tunnelId, domain], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      routeDns.on('close', (code) => {
        resolve(code === 0);
      });

      routeDns.on('error', () => {
        resolve(false);
      });

      setTimeout(() => {
        if (!routeDns.killed) {
          routeDns.kill();
          resolve(false);
        }
      }, 10000);
    });
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
          if (code === 0 && tunnelId) {
            // 创建 DNS 记录
            console.log(`🌐 为域名 ${domain} 创建 DNS 记录...`);
            
            const routeDns = spawn('cloudflared', ['tunnel', 'route', 'dns', tunnelId, domain], {
              stdio: ['ignore', 'pipe', 'pipe']
            });

            routeDns.on('close', (dnsCode) => {
              if (dnsCode === 0) {
                console.log(`✅ 域名 ${domain} DNS 记录配置成功`);
                resolve({ tunnelId, tunnelName });
              } else {
                console.log(chalk.yellow(`⚠️  DNS 记录配置可能失败，将尝试直接使用域名`));
                resolve({ tunnelId, tunnelName });
              }
            });

            routeDns.on('error', () => {
              resolve({ tunnelId, tunnelName });
            });
          } else {
            reject(new Error('创建隧道失败'));
          }
        });

        createTunnel.on('error', (err) => {
          reject(new Error(`创建隧道失败: ${err.message}`));
        });

        // 超时处理
        setTimeout(() => {
          createTunnel.kill();
          reject(new Error('创建隧道超时'));
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
        console.log(chalk.yellow(`💡 将创建临时隧道并自动配置 DNS 记录`));
        
        // 首先创建命名隧道并配置 DNS
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
          console.log(chalk.yellow('回退到临时隧道模式...'));
          
          // 回退到临时隧道
          args = ['tunnel', '--url', `http://localhost:${port}`];
          tunnelMode = `临时模式 (请手动配置 DNS)`;
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
        return new TunnelResult(finalUrl, this.name, this.features, tunnelUrl);
      }
      
      // 如果是回退模式（使用临时隧道但用户想要自定义域名）
      if (this.customDomainRequested && !this.namedTunnelConfig) {
        const tunnelHostname = new URL(tunnelUrl).hostname;
        
        console.log('');
        console.log(chalk.yellow('⚠️ 已回退到临时隧道模式'));
        console.log(chalk.blue('📋 要使用自定义域名，请手动添加以下 DNS 记录：'));
        console.log('');
        console.log(chalk.cyan(`记录类型: CNAME`));
        console.log(chalk.cyan(`名称: ${this.customDomainRequested}`));
        console.log(chalk.cyan(`值: ${tunnelHostname}`));
        console.log('');
        console.log(chalk.yellow('配置完成后，您就可以通过以下地址访问：'));
        console.log(chalk.green(`https://${this.customDomainRequested}`));
        console.log('');
        
        // 返回用户期望的域名
        const finalUrl = `https://${this.customDomainRequested}`;
        return new TunnelResult(finalUrl, this.name, this.features, tunnelUrl);
      }

      // 显示域名管理提示
      if (domainSelection && domainSelection.type !== 'random') {
        this.domainManager.showResetInstructions();
      }

      // 返回标准的隧道结果
      return new TunnelResult(tunnelUrl, this.name, this.features);

    } catch (error) {
      // 清理进程
      await this.closeTunnel();
      
      // 处理各种可能的错误
      if (error.message.includes('connection refused')) {
        throw new Error(`无法连接到本地端口 ${port}，请确保服务已启动`);
      } else if (error.message.includes('cloudflared 工具不可用')) {
        throw new Error('cloudflared 工具未安装，请手动安装或重试自动安装');
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
          reject(new Error('cloudflared 启动超时'));
        }
      }, 45000); // 45秒超时

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
        if (text.includes('failed to connect to origin')) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('无法连接到本地服务，请确保指定端口上有服务运行'));
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
        console.log(`🗑️  清理命名隧道: ${this.namedTunnelConfig.tunnelName}`);
        try {
          const deleteTunnel = spawn('cloudflared', ['tunnel', 'delete', this.namedTunnelConfig.tunnelId], {
            stdio: 'ignore'
          });
          
          deleteTunnel.on('close', (code) => {
            if (code === 0) {
              console.log(`✅ 命名隧道已清理: ${this.namedTunnelConfig.tunnelName}`);
              console.log(`📝 域名 ${this.namedTunnelConfig.domain} 的 DNS 记录也会被自动清理`);
            }
          });
        } catch (error) {
          // 忽略清理错误
        }
        
        this.namedTunnelConfig = null;
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
}