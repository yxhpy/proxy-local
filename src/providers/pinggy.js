import { pinggy } from '@pinggy/pinggy';
import { TunnelProvider, TunnelResult, ProviderFeatures } from './interface.js';

/**
 * Pinggy 提供商实现
 * 无确认页面的免费内网穿透服务
 */
export class PinggyProvider extends TunnelProvider {
  constructor() {
    const features = new ProviderFeatures({
      requiresConfirmation: false, // 关键优势：无确认页面
      speed: 'fast',
      httpsSupport: true,
      customDomain: false,
      description: '无确认页面，直接访问的免费隧道服务'
    });
    
    super('pinggy', features);
    this.currentTunnel = null;
  }

  /**
   * 检查 Pinggy 是否可用
   */
  async isAvailable() {
    try {
      // 简单检查：尝试访问 pinggy 模块
      return typeof pinggy?.forward === 'function';
    } catch (error) {
      console.warn(`Pinggy availability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 使用 Pinggy 创建隧道
   */
  async createTunnel(port) {
    try {
      console.log(`正在使用 Pinggy 创建隧道到端口 ${port}...`);
      
      // 使用 Pinggy SDK 创建隧道
      const tunnel = await pinggy.forward({ 
        forwardTo: `localhost:${port}`,
        type: 'http' // 明确指定 HTTP 类型
      });

      // 获取隧道 URLs
      const urls = tunnel.urls();
      
      if (!urls || urls.length === 0) {
        throw new Error('Pinggy 未返回有效的隧道 URL');
      }

      // 选择第一个可用的 URL（通常是 HTTPS）
      const publicUrl = urls.find(url => url.startsWith('https://')) || urls[0];
      
      // 保存隧道实例用于后续清理
      this.currentTunnel = tunnel;

      // 返回标准的隧道结果
      return new TunnelResult(publicUrl, this.name, this.features);

    } catch (error) {
      // 处理各种可能的错误
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error(`无法连接到本地端口 ${port}，请确保服务已启动`);
      } else if (error.message.includes('timeout')) {
        throw new Error(`Pinggy 连接超时，请检查网络连接`);
      } else {
        throw new Error(`Pinggy 隧道创建失败: ${error.message}`);
      }
    }
  }

  /**
   * 关闭当前隧道
   */
  async closeTunnel() {
    try {
      if (this.currentTunnel) {
        // Pinggy SDK 可能提供关闭方法
        if (typeof this.currentTunnel.close === 'function') {
          await this.currentTunnel.close();
        }
        this.currentTunnel = null;
        console.log('Pinggy 隧道已关闭');
      }
    } catch (error) {
      console.warn(`关闭 Pinggy 隧道时出错: ${error.message}`);
    }
  }

  /**
   * 获取详细的特性信息
   */
  getFeatures() {
    return {
      ...super.getFeatures(),
      // Pinggy 特有的额外信息
      maxConnections: '无限制',
      dataTransfer: '无限制',
      uptime: '99.9%',
      regions: ['全球']
    };
  }
}