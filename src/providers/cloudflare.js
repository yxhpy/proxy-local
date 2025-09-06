import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { TunnelProvider, TunnelResult, ProviderFeatures } from './interface.js';

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
      customDomain: false,
      description: 'Cloudflare 快速隧道，无需登录的临时模式'
    });
    
    super('cloudflare', features);
    this.currentProcess = null;
    this.tunnelUrl = null;
    this.authMode = false; // 是否使用认证模式
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
   * 检查 cloudflared 是否可用
   */
  async isAvailable() {
    return new Promise((resolve) => {
      const child = spawn('cloudflared', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let hasOutput = false;

      child.stdout.on('data', () => {
        hasOutput = true;
      });

      child.stderr.on('data', () => {
        hasOutput = true;
      });

      child.on('close', (code) => {
        resolve(hasOutput && code !== null);
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
      }, 3000);
    });
  }

  /**
   * 设置认证模式
   */
  setAuthMode(authMode, customName = null) {
    this.authMode = authMode;
    this.customTunnelName = customName;
  }

  /**
   * 使用 cloudflared 创建隧道
   */
  async createTunnel(port, options = {}) {
    try {
      console.log(`正在使用 Cloudflare Tunnel 创建隧道到端口 ${port}...`);
      
      // 检查是否可用
      const available = await this.isAvailable();
      if (!available) {
        throw new Error('cloudflared 工具不可用，请安装 Cloudflare Tunnel CLI');
      }

      // 根据认证状态和选项决定使用哪种模式
      const useAuthMode = this.authMode || options.useAuth;
      const customName = this.customTunnelName || options.customName;

      let args;
      let tunnelMode = '临时模式';

      if (useAuthMode) {
        // 检查是否已认证
        const authenticated = await this.isAuthenticated();
        if (!authenticated) {
          throw new Error('持久模式需要登录，请先运行 --cloudflare-login');
        }

        if (customName) {
          // 使用自定义名称的持久隧道
          args = ['tunnel', 'run', '--url', `http://localhost:${port}`, customName];
          tunnelMode = `持久模式 (自定义名称: ${customName})`;
        } else {
          // 使用默认的持久隧道
          args = ['tunnel', '--url', `http://localhost:${port}`];
          tunnelMode = '持久模式';
        }
      } else {
        // 使用临时模式（无需登录）
        args = ['tunnel', '--url', `http://localhost:${port}`];
        tunnelMode = '临时模式';
      }

      console.log(`📋 使用模式: ${tunnelMode}`);

      // 启动 cloudflared 子进程
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

      // 返回标准的隧道结果
      return new TunnelResult(tunnelUrl, this.name, this.features);

    } catch (error) {
      // 清理进程
      await this.closeTunnel();
      
      // 处理各种可能的错误
      if (error.message.includes('connection refused')) {
        throw new Error(`无法连接到本地端口 ${port}，请确保服务已启动`);
      } else if (error.message.includes('cloudflared 工具不可用')) {
        throw new Error('cloudflared 工具未安装或不在 PATH 中，请访问 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ 下载安装');
      } else {
        throw new Error(`Cloudflare Tunnel 创建失败: ${error.message}`);
      }
    }
  }

  /**
   * 解析 cloudflared 输出获取隧道 URL
   */
  _parseCloudflaredOutput(child) {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('cloudflared 启动超时'));
        }
      }, 30000); // 30秒超时

      child.stdout.on('data', (data) => {
        if (resolved) return;
        
        const text = data.toString();
        output += text;
        
        // 查找隧道 URL (典型格式: https://xxx.trycloudflare.com)
        const urlMatch = text.match(/https?:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
        if (urlMatch) {
          resolved = true;
          clearTimeout(timeout);
          resolve(urlMatch[0]);
          return;
        }
        
        // 查找其他可能的 URL 格式
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