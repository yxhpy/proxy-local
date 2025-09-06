import { TunnelProvider, TunnelResult } from './interface.js';

/**
 * 提供商管理器
 * 负责注册、选择和管理不同的内网穿透提供商
 */
export class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.defaultProviders = []; // 按优先级排序的默认提供商列表
    this.currentProvider = null;
  }

  /**
   * 注册一个提供商
   * @param {TunnelProvider} provider - 提供商实例
   * @param {boolean} setAsDefault - 是否设为默认提供商
   */
  register(provider, setAsDefault = false) {
    if (!(provider instanceof TunnelProvider)) {
      throw new Error('Provider must extend TunnelProvider class');
    }

    this.providers.set(provider.name, provider);
    
    if (setAsDefault || this.defaultProviders.length === 0) {
      // 将新提供商添加到默认列表的开头（最高优先级）
      this.defaultProviders.unshift(provider.name);
    } else {
      // 添加到末尾
      this.defaultProviders.push(provider.name);
    }

    console.log(`✓ Registered provider: ${provider.name}`);
  }

  /**
   * 获取指定名称的提供商
   * @param {string} name - 提供商名称
   * @returns {TunnelProvider|null} 提供商实例
   */
  getProvider(name) {
    return this.providers.get(name) || null;
  }

  /**
   * 获取所有已注册的提供商
   * @returns {TunnelProvider[]} 提供商数组
   */
  getAllProviders() {
    return Array.from(this.providers.values());
  }

  /**
   * 获取默认提供商列表（按优先级排序）
   * @returns {string[]} 提供商名称数组
   */
  getDefaultProviders() {
    return [...this.defaultProviders];
  }

  /**
   * 选择提供商（如果指定名称，则使用指定的；否则使用默认优先级）
   * @param {string|null} preferredName - 首选提供商名称
   * @returns {TunnelProvider|null} 选中的提供商
   */
  selectProvider(preferredName = null) {
    if (preferredName) {
      const provider = this.getProvider(preferredName);
      if (provider) {
        this.currentProvider = provider;
        return provider;
      }
      console.warn(`Warning: Provider "${preferredName}" not found, falling back to default`);
    }

    // 使用默认优先级选择
    for (const name of this.defaultProviders) {
      const provider = this.getProvider(name);
      if (provider) {
        this.currentProvider = provider;
        return provider;
      }
    }

    console.error('No available providers found');
    return null;
  }

  /**
   * 智能隧道创建 - 支持自动回退
   * @param {number} port - 本地端口
   * @param {string|null} preferredProvider - 首选提供商
   * @returns {Promise<TunnelResult>} 隧道结果
   */
  async createTunnelWithFallback(port, preferredProvider = null) {
    const providersToTry = preferredProvider 
      ? [preferredProvider, ...this.defaultProviders.filter(p => p !== preferredProvider)]
      : this.defaultProviders;

    const errors = [];

    for (const providerName of providersToTry) {
      const provider = this.getProvider(providerName);
      if (!provider) {
        const error = `Provider "${providerName}" not found`;
        errors.push({ provider: providerName, error });
        console.warn(`⚠️  ${error}`);
        continue;
      }

      try {
        // 检查提供商是否可用
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          const error = `Provider "${providerName}" is not available`;
          errors.push({ provider: providerName, error });
          console.warn(`⚠️  ${error}`);
          continue;
        }

        console.log(`🔄 Attempting to create tunnel using ${providerName}...`);
        const result = await provider.createTunnel(port);
        
        this.currentProvider = provider;
        console.log(`✅ Successfully created tunnel using ${providerName}`);
        return result;

      } catch (error) {
        const errorMsg = `Provider "${providerName}" failed: ${error.message}`;
        errors.push({ provider: providerName, error: errorMsg });
        console.warn(`⚠️  ${errorMsg}`);
        continue;
      }
    }

    // 所有提供商都失败了
    const errorSummary = `All tunnel providers failed:\n${errors.map(e => `  - ${e.provider}: ${e.error}`).join('\n')}`;
    throw new Error(errorSummary);
  }

  /**
   * 获取当前使用的提供商
   * @returns {TunnelProvider|null} 当前提供商
   */
  getCurrentProvider() {
    return this.currentProvider;
  }

  /**
   * 列出所有提供商及其特性（用于 --list-providers）
   * @returns {Array} 提供商信息数组
   */
  listProvidersInfo() {
    return this.getAllProviders().map(provider => ({
      name: provider.name,
      features: provider.getFeatures(),
      isDefault: this.defaultProviders[0] === provider.name
    }));
  }

  /**
   * 设置默认提供商优先级
   * @param {string[]} providers - 按优先级排序的提供商名称数组
   */
  setDefaultPriority(providers) {
    // 验证所有提供商都已注册
    const invalidProviders = providers.filter(name => !this.providers.has(name));
    if (invalidProviders.length > 0) {
      throw new Error(`Unknown providers: ${invalidProviders.join(', ')}`);
    }
    
    this.defaultProviders = [...providers];
  }
}