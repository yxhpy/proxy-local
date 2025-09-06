import localtunnel from 'localtunnel';
import { TunnelProvider, TunnelResult, ProviderFeatures } from './interface.js';

/**
 * LocalTunnel 提供商实现
 * 经典的内网穿透服务 (需要确认页面)
 */
export class LocalTunnelProvider extends TunnelProvider {
  constructor() {
    const features = new ProviderFeatures({
      requiresConfirmation: true, // 需要点击确认页面
      speed: 'medium',
      httpsSupport: true,
      customDomain: false,
      description: '经典的免费隧道服务，需要点击确认页面'
    });
    
    super('localtunnel', features);
    this.currentTunnel = null;
  }

  /**
   * 检查 LocalTunnel 是否可用
   */
  async isAvailable() {
    try {
      return typeof localtunnel === 'function';
    } catch (error) {
      console.warn(`LocalTunnel availability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 使用 LocalTunnel 创建隧道
   */
  async createTunnel(port) {
    try {
      console.log(`正在使用 LocalTunnel 创建隧道到端口 ${port}...`);
      
      // 使用 LocalTunnel 创建隧道
      const tunnel = await localtunnel({ port });
      
      if (!tunnel || !tunnel.url) {
        throw new Error('LocalTunnel 未返回有效的隧道 URL');
      }

      // 保存隧道实例用于后续清理
      this.currentTunnel = tunnel;

      // 返回标准的隧道结果
      return new TunnelResult(tunnel.url, this.name, this.features);

    } catch (error) {
      // 处理各种可能的错误
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error(`无法连接到本地端口 ${port}，请确保服务已启动`);
      } else if (error.message.includes('timeout')) {
        throw new Error(`LocalTunnel 连接超时，请检查网络连接`);
      } else {
        throw new Error(`LocalTunnel 隧道创建失败: ${error.message}`);
      }
    }
  }

  /**
   * 关闭当前隧道
   */
  async closeTunnel() {
    try {
      if (this.currentTunnel) {
        this.currentTunnel.close();
        this.currentTunnel = null;
        console.log('LocalTunnel 隧道已关闭');
      }
    } catch (error) {
      console.warn(`关闭 LocalTunnel 隧道时出错: ${error.message}`);
    }
  }

  /**
   * 获取详细的特性信息
   */
  getFeatures() {
    return {
      ...super.getFeatures(),
      // LocalTunnel 特有的额外信息
      maxConnections: '无限制',
      dataTransfer: '无限制',
      uptime: '99%',
      regions: ['全球']
    };
  }
}