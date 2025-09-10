import { cosmiconfigSync } from 'cosmiconfig';
import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * 配置加载器
 * 负责加载和管理应用配置，支持多种来源：
 * 1. CLI 参数 (最高优先级)
 * 2. 环境变量
 * 3. 配置文件 (.uvxrc, .uvxrc.json, .uvxrc.yaml, etc.)
 * 4. 程序默认值 (最低优先级)
 */
export class ConfigLoader {
  constructor() {
    this.moduleName = 'uvx';
    this.configDir = path.join(os.homedir(), '.uvx');
    this.configFile = path.join(this.configDir, 'config.json');
    
    // 初始化 cosmiconfig
    this.explorer = cosmiconfigSync(this.moduleName, {
      searchPlaces: [
        'package.json',
        `.${this.moduleName}rc`,
        `.${this.moduleName}rc.json`,
        `.${this.moduleName}rc.yaml`,
        `.${this.moduleName}rc.yml`,
        `.${this.moduleName}rc.js`,
        `.${this.moduleName}.config.js`,
        `.${this.moduleName}.config.json`,
        `${this.moduleName}.config.js`
      ]
    });
    
    // 默认配置
    this.defaultConfig = {
      defaultProvider: 'cloudflare',
      timeout: 30000,
      retries: 3,
      cloudflare: {
        tempMode: true,
        customDomain: null,
        authToken: null
      },
      ui: {
        verbose: false,
        colors: true,
        icons: true
      }
    };
    
    // 确保配置目录存在
    this.ensureConfigDir();
  }

  /**
   * 确保配置目录存在
   */
  ensureConfigDir() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
    } catch (error) {
      console.warn(`警告: 无法创建配置目录 ${this.configDir}: ${error.message}`);
    }
  }

  /**
   * 加载完整配置
   * 按优先级合并：CLI 参数 > 环境变量 > 配置文件 > 默认值
   */
  loadConfig(cliOptions = {}) {
    const config = { ...this.defaultConfig };
    
    // 1. 加载配置文件
    const fileConfig = this.loadConfigFile();
    if (fileConfig) {
      this.mergeConfig(config, fileConfig);
    }
    
    // 2. 加载环境变量
    const envConfig = this.loadEnvironmentVariables();
    this.mergeConfig(config, envConfig);
    
    // 3. 加载用户配置文件 (存储在 ~/.uvx/config.json)
    const userConfig = this.loadUserConfig();
    if (userConfig) {
      this.mergeConfig(config, userConfig);
    }
    
    // 4. 应用 CLI 参数 (最高优先级)
    this.mergeConfig(config, cliOptions);
    
    return config;
  }

  /**
   * 加载项目配置文件 (.uvxrc 等)
   */
  loadConfigFile() {
    try {
      const result = this.explorer.search();
      if (result) {
        return result.config;
      }
    } catch (error) {
      console.warn(`警告: 加载配置文件失败: ${error.message}`);
    }
    return null;
  }

  /**
   * 加载环境变量配置
   */
  loadEnvironmentVariables() {
    const envConfig = {};
    
    // 主要配置
    if (process.env.UVX_PROVIDER) {
      envConfig.defaultProvider = process.env.UVX_PROVIDER.toLowerCase();
    }
    
    if (process.env.UVX_TIMEOUT) {
      const timeout = parseInt(process.env.UVX_TIMEOUT, 10);
      if (!isNaN(timeout) && timeout > 0) {
        envConfig.timeout = timeout;
      }
    }
    
    if (process.env.UVX_RETRIES) {
      const retries = parseInt(process.env.UVX_RETRIES, 10);
      if (!isNaN(retries) && retries >= 0) {
        envConfig.retries = retries;
      }
    }
    
    // Cloudflare 特定配置
    const cloudflareConfig = {};
    
    if (process.env.UVX_CLOUDFLARE_TOKEN) {
      cloudflareConfig.authToken = process.env.UVX_CLOUDFLARE_TOKEN;
    }
    
    if (process.env.UVX_CLOUDFLARE_CUSTOM_DOMAIN) {
      cloudflareConfig.customDomain = process.env.UVX_CLOUDFLARE_CUSTOM_DOMAIN;
    }
    
    if (process.env.UVX_CLOUDFLARE_TEMP_MODE) {
      cloudflareConfig.tempMode = process.env.UVX_CLOUDFLARE_TEMP_MODE.toLowerCase() === 'true';
    }
    
    if (Object.keys(cloudflareConfig).length > 0) {
      envConfig.cloudflare = cloudflareConfig;
    }
    
    // UI 配置
    const uiConfig = {};
    
    if (process.env.UVX_VERBOSE) {
      uiConfig.verbose = process.env.UVX_VERBOSE.toLowerCase() === 'true';
    }
    
    if (process.env.UVX_NO_COLORS) {
      uiConfig.colors = process.env.UVX_NO_COLORS.toLowerCase() !== 'true';
    }
    
    if (process.env.UVX_NO_ICONS) {
      uiConfig.icons = process.env.UVX_NO_ICONS.toLowerCase() !== 'true';
    }
    
    if (Object.keys(uiConfig).length > 0) {
      envConfig.ui = uiConfig;
    }
    
    return envConfig;
  }

  /**
   * 加载用户配置文件 (~/.uvx/config.json)
   */
  loadUserConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const content = fs.readFileSync(this.configFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`警告: 读取用户配置文件失败: ${error.message}`);
    }
    return null;
  }

  /**
   * 保存用户配置到 ~/.uvx/config.json
   */
  saveUserConfig(config) {
    try {
      this.ensureConfigDir();
      const content = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configFile, content, 'utf-8');
      return true;
    } catch (error) {
      console.error(`错误: 保存用户配置失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 更新用户配置的特定字段
   */
  updateUserConfig(updates) {
    const current = this.loadUserConfig() || {};
    const updated = { ...current };
    
    this.mergeConfig(updated, updates);
    return this.saveUserConfig(updated);
  }

  /**
   * 深度合并配置对象
   */
  mergeConfig(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.mergeConfig(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  /**
   * 验证提供商名称
   */
  validateProvider(provider) {
    const validProviders = ['cloudflare', 'cloudflare-v2', 'pinggy', 'serveo', 'localtunnel'];
    return validProviders.includes(provider.toLowerCase());
  }

  /**
   * 验证配置对象
   */
  validateConfig(config) {
    const errors = [];
    
    // 验证默认提供商
    if (config.defaultProvider && !this.validateProvider(config.defaultProvider)) {
      errors.push(`无效的默认提供商: ${config.defaultProvider}`);
    }
    
    // 验证超时时间
    if (config.timeout && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
      errors.push(`无效的超时时间: ${config.timeout}`);
    }
    
    // 验证重试次数
    if (config.retries && (typeof config.retries !== 'number' || config.retries < 0)) {
      errors.push(`无效的重试次数: ${config.retries}`);
    }
    
    return errors;
  }

  /**
   * 获取 Cloudflare 认证信息
   */
  getCloudflareAuth() {
    const userConfig = this.loadUserConfig();
    return userConfig?.cloudflare || {};
  }

  /**
   * 保存 Cloudflare 认证信息
   */
  saveCloudflareAuth(authData) {
    return this.updateUserConfig({
      cloudflare: {
        ...this.getCloudflareAuth(),
        ...authData,
        lastUpdated: new Date().toISOString()
      }
    });
  }

  /**
   * 清除 Cloudflare 认证信息
   */
  clearCloudflareAuth() {
    const current = this.loadUserConfig() || {};
    if (current.cloudflare) {
      current.cloudflare.authToken = null;
      current.cloudflare.lastUpdated = new Date().toISOString();
      return this.saveUserConfig(current);
    }
    return true;
  }

  /**
   * 获取配置文件示例
   */
  getConfigExample() {
    return {
      // 基本配置
      defaultProvider: 'cloudflare',
      timeout: 30000,
      retries: 3,
      
      // Cloudflare 特定配置
      cloudflare: {
        tempMode: false,  // 使用持久模式
        customDomain: 'myapp'  // 自定义域名前缀
      },
      
      // UI 配置
      ui: {
        verbose: false,
        colors: true,
        icons: true
      }
    };
  }
}

// 导出单例实例
export const configLoader = new ConfigLoader();