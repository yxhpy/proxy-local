import { spawn } from 'child_process';
import { TunnelProvider, TunnelResult, ProviderFeatures } from './interface.js';

/**
 * Serveo 提供商实现
 * 通过 SSH 隧道实现内网穿透 (无确认页面)
 */
export class ServeoProvider extends TunnelProvider {
  constructor() {
    const features = new ProviderFeatures({
      requiresConfirmation: false, // 无确认页面
      speed: 'fast',
      httpsSupport: true,
      customDomain: false,
      description: '基于 SSH 的免费隧道服务，无需确认页面'
    });
    
    super('serveo', features);
    this.currentProcess = null;
  }

  /**
   * 检查 Serveo 是否可用（检查 SSH 命令是否存在）
   */
  async isAvailable() {
    return new Promise((resolve) => {
      const testProcess = spawn('ssh', ['-V'], { stdio: 'pipe' });
      
      testProcess.on('error', () => {
        resolve(false);
      });
      
      testProcess.on('close', (code) => {
        resolve(code !== 127); // 127 = command not found
      });
      
      // 设置超时避免进程挂起
      setTimeout(() => {
        testProcess.kill();
        resolve(false);
      }, 3000);
    });
  }

  /**
   * 使用 Serveo 创建隧道
   */
  async createTunnel(port) {
    return new Promise((resolve, reject) => {
      console.log(`正在使用 Serveo 创建隧道到端口 ${port}...`);
      
      // 执行 SSH 命令创建隧道
      const sshProcess = spawn('ssh', [
        '-R', `80:localhost:${port}`,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=30',
        '-o', 'ServerAliveCountMax=3',
        'serveo.net'
      ], { stdio: 'pipe' });

      let tunnelUrl = null;
      let errorOutput = '';
      let resolved = false;

      // 监听 stdout 获取隧道 URL
      sshProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`Serveo 输出: ${output.trim()}`);
        
        // 解析隧道 URL - Serveo 返回格式如: "Forwarding HTTP traffic from https://xyz.serveo.net"
        const urlMatch = output.match(/Forwarding HTTP traffic from (https?:\/\/[^\s]+)/);
        if (urlMatch && !resolved) {
          tunnelUrl = urlMatch[1];
          resolved = true;
          
          // 保存进程实例用于后续清理
          this.currentProcess = sshProcess;
          
          resolve(new TunnelResult(tunnelUrl, this.name, this.features));
        }
      });

      // 监听错误输出
      sshProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.warn(`Serveo 错误: ${data.toString().trim()}`);
      });

      // 处理进程退出
      sshProcess.on('close', (code) => {
        if (!resolved) {
          let errorMessage = `Serveo SSH 进程退出 (code: ${code})`;
          
          if (errorOutput.includes('Connection refused')) {
            errorMessage = `无法连接到本地端口 ${port}，请确保服务已启动`;
          } else if (errorOutput.includes('Permission denied')) {
            errorMessage = 'Serveo SSH 连接被拒绝，请检查网络连接';
          } else if (errorOutput.includes('timeout') || errorOutput.includes('Timeout')) {
            errorMessage = 'Serveo 连接超时，请检查网络连接';
          } else if (errorOutput.trim()) {
            errorMessage = `Serveo 错误: ${errorOutput.trim()}`;
          }
          
          reject(new Error(errorMessage));
        }
      });

      // 处理进程启动错误
      sshProcess.on('error', (error) => {
        if (!resolved) {
          if (error.code === 'ENOENT') {
            reject(new Error('SSH 命令未找到，请确保已安装 SSH 客户端'));
          } else {
            reject(new Error(`Serveo 进程启动失败: ${error.message}`));
          }
        }
      });

      // 设置超时（30秒内如果没有获取到 URL 就认为失败）
      setTimeout(() => {
        if (!resolved) {
          sshProcess.kill();
          reject(new Error('Serveo 隧道创建超时 (30秒)'));
        }
      }, 30000);
    });
  }

  /**
   * 关闭当前隧道
   */
  async closeTunnel() {
    try {
      if (this.currentProcess && !this.currentProcess.killed) {
        this.currentProcess.kill('SIGTERM');
        
        // 给进程一些时间优雅退出
        setTimeout(() => {
          if (this.currentProcess && !this.currentProcess.killed) {
            this.currentProcess.kill('SIGKILL');
          }
        }, 2000);
        
        this.currentProcess = null;
        console.log('Serveo 隧道已关闭');
      }
    } catch (error) {
      console.warn(`关闭 Serveo 隧道时出错: ${error.message}`);
    }
  }

  /**
   * 获取详细的特性信息
   */
  getFeatures() {
    return {
      ...super.getFeatures(),
      // Serveo 特有的额外信息
      maxConnections: '有限制',
      dataTransfer: '适度使用',
      uptime: '95%',
      regions: ['美国'],
      requirements: ['SSH 客户端']
    };
  }
}