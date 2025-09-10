/**
 * 隧道结果接口
 */
export class TunnelResult {
  constructor(url, provider, features = {}) {
    this.url = url;
    this.provider = provider;
    this.features = features;
    this.createdAt = new Date();
  }
}

/**
 * 提供商特性接口
 */
export class ProviderFeatures {
  constructor({
    requiresConfirmation = false,
    speed = 'medium',
    httpsSupport = true,
    customDomain = false,
    description = '',
    benefits = [],
    maxConnections = '1',
    uptime = '90%',
    regions = []
  } = {}) {
    this.requiresConfirmation = requiresConfirmation;
    this.speed = speed; // 'fast', 'medium', 'slow'
    this.httpsSupport = httpsSupport;
    this.customDomain = customDomain;
    this.description = description;
    this.benefits = benefits;
    this.maxConnections = maxConnections;
    this.uptime = uptime;
    this.regions = regions;
  }
}

/**
 * 隧道提供商基础接口
 * 所有提供商都需要实现这个接口
 */
export class TunnelProvider {
  constructor(name, features) {
    if (new.target === TunnelProvider) {
      throw new Error('TunnelProvider is an abstract class and cannot be instantiated directly');
    }
    this.name = name;
    this.features = features || new ProviderFeatures();
  }

  /**
   * 创建隧道
   * @param {number} port - 本地端口号
   * @returns {Promise<TunnelResult>} 隧道结果
   */
  async createTunnel(port) {
    throw new Error('createTunnel method must be implemented by subclass');
  }

  /**
   * 检查提供商是否可用
   * @returns {Promise<boolean>} 是否可用
   */
  async isAvailable() {
    return true; // 默认实现
  }

  /**
   * 获取提供商特性
   * @returns {ProviderFeatures} 特性信息
   */
  getFeatures() {
    return this.features;
  }

  /**
   * 关闭隧道（可选实现）
   * @returns {Promise<void>}
   */
  async closeTunnel() {
    // 默认空实现
  }
}