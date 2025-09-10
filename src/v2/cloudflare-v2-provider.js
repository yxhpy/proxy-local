import { UserGuidance } from './user-guidance.js';
import { EnhancedLogger } from '../utils/enhanced-logger.js';
import { TunnelProvider, ProviderFeatures, TunnelResult } from '../providers/interface.js';

/**
 * Cloudflare V2 Provider
 * 新的V2架构的Cloudflare提供商实现
 */
export class CloudflareV2Provider extends TunnelProvider {
  constructor() {
    // 调用父类构造函数
    super('cloudflare-v2', new ProviderFeatures({
      requiresConfirmation: false,
      speed: 'fast',
      httpsSupport: true,
      customDomain: true,
      description: '全新重构的Cloudflare隧道服务，提供一键式代理体验'
    }));
    
    this.displayName = 'Cloudflare V2 (推荐)';
    this.logger = new EnhancedLogger('CloudflareV2Provider');
    
    // 延迟初始化用户指导系统
    this.userGuidance = null;
    this.currentSession = null;
  }

  /**
   * 获取提供商特性
   * @returns {Object} 特性信息
   */
  getFeatures() {
    return {
      supportsCustomDomains: true,
      requiresAuth: false, // 可选认证
      supportsHttps: true,
      hasFallback: true,
      confirmationPage: false,
      persistentUrls: true,
      speed: 'fast',
      reliability: 'excellent',
      description: 'Cloudflare隧道V2版本，支持一键式自动DNS配置和智能错误处理'
    };
  }

  /**
   * 检查是否已认证
   * @returns {Promise<boolean>} 认证状态
   */
  async isAuthenticated() {
    try {
      if (!this.userGuidance) {
        this.userGuidance = new UserGuidance();
      }
      
      return await this.userGuidance.configManager.hasValidAuth();
    } catch (error) {
      this.logger.logWarning('检查认证状态失败', error.message);
      return false;
    }
  }

  /**
   * 创建隧道 - 主要入口方法
   * @param {number} port - 本地端口
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 隧道结果
   */
  async createTunnel(port, options = {}) {
    this.logger.logStep('V2创建开始', '开始V2隧道创建流程', { port, options });

    try {
      // 初始化用户指导系统
      if (!this.userGuidance) {
        this.userGuidance = new UserGuidance();
      }

      // 执行一键代理流程
      const result = await this.userGuidance.createOneClickProxy(port, {
        ...options,
        provider: 'cloudflare-v2'
      });

      if (!result.success) {
        const errorMessage = result.error?.originalError || result.error?.displayMessage || '代理创建失败';
        throw new Error(errorMessage);
      }

      this.currentSession = result;

      // 转换为标准的提供商返回格式
      return {
        url: result.url,
        originalUrl: result.url,
        port: port,
        provider: this.name,
        success: true,
        sessionId: result.sessionId,
        tunnelInfo: {
          type: result.tunnel?.type,
          tunnelId: result.tunnel?.tunnelId,
          tunnelName: result.tunnel?.tunnelName,
          domain: result.tunnel?.domain
        },
        dnsInfo: result.dns,
        validationInfo: result.validation,
        metadata: {
          duration: result.duration,
          method: result.dns?.method || 'quick'
        }
      };

    } catch (error) {
      this.logger.logError('V2隧道创建失败', error);
      throw error;
    }
  }

  /**
   * 关闭隧道
   * @returns {Promise<void>}
   */
  async closeTunnel() {
    this.logger.logStep('V2关闭', '开始关闭V2隧道');

    try {
      if (this.userGuidance) {
        await this.userGuidance.cleanup();
      }

      this.currentSession = null;
      this.logger.logStep('V2关闭', 'V2隧道关闭成功');

    } catch (error) {
      this.logger.logWarning('V2隧道关闭失败', error.message);
      throw error;
    }
  }

  /**
   * 获取当前隧道状态
   * @returns {Object} 隧道状态
   */
  getStatus() {
    if (!this.currentSession) {
      return { status: 'inactive', session: null };
    }

    return {
      status: 'active',
      session: this.currentSession,
      guidance: this.userGuidance ? this.userGuidance.getStatus() : null
    };
  }

  /**
   * 登录方法（兼容接口）
   * @returns {Promise<void>}
   */
  async login() {
    this.logger.logStep('V2登录', '开始V2登录流程');

    try {
      if (!this.userGuidance) {
        this.userGuidance = new UserGuidance();
      }

      // 强制执行交互式认证
      await this.userGuidance.handleAuthentication({ skipAuth: false });
      
      this.logger.logStep('V2登录', 'V2登录成功');

    } catch (error) {
      this.logger.logError('V2登录失败', error);
      throw error;
    }
  }

  /**
   * 登出方法（兼容接口）
   * @returns {Promise<void>}
   */
  async logout() {
    this.logger.logStep('V2登出', '开始V2登出流程');

    try {
      if (!this.userGuidance) {
        this.userGuidance = new UserGuidance();
      }

      // 清除认证信息
      await this.userGuidance.configManager.clearAuth();
      await this.userGuidance.configManager.clearApiToken();
      
      this.logger.logStep('V2登出', 'V2登出成功');

    } catch (error) {
      this.logger.logError('V2登出失败', error);
      throw error;
    }
  }

  /**
   * 设置认证模式（兼容接口）
   * @param {boolean} authMode - 是否启用认证
   * @param {string} customName - 自定义名称
   */
  setAuthMode(authMode, customName = null) {
    this.logger.logDebug('设置认证模式', { authMode, customName });
    
    // V2版本通过用户指导系统自动处理认证模式
    // 这个方法主要用于兼容现有接口
    if (customName) {
      process.env.UVX_CUSTOM_DOMAIN = customName;
    }
  }

  /**
   * 重置域名配置（兼容接口）
   */
  resetDomainConfiguration() {
    this.logger.logDebug('重置域名配置');
    
    // 清除环境变量中的自定义域名
    delete process.env.UVX_CUSTOM_DOMAIN;
    
    if (this.userGuidance) {
      // 可以添加更多重置逻辑
      this.logger.logStep('域名重置', '域名配置已重置');
    }
  }

  /**
   * 显示隧道指引（兼容接口）
   * @param {string} url - 隧道URL
   */
  showTunnelGuidance(url) {
    console.log('\n🎯 V2隧道已就绪！');
    console.log(`   访问地址: ${url}`);
    console.log('   • V2版本提供增强的稳定性和错误处理');
    console.log('   • 支持自动DNS配置和智能故障恢复');
    console.log('   • 按 Ctrl+C 停止隧道\n');
  }

  /**
   * 获取提供商信息
   * @returns {Object} 提供商信息
   */
  getInfo() {
    return {
      name: this.name,
      displayName: this.displayName,
      version: '2.0.0',
      features: this.getFeatures(),
      status: this.getStatus().status,
      description: '全新重构的Cloudflare隧道服务，提供一键式代理体验'
    };
  }
}