import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { EnhancedLogger } from '../utils/enhanced-logger.js';

/**
 * V2配置管理器
 * 专为Cloudflare CLI V2功能设计的配置管理
 * 负责安全存储cert.pem文件和API令牌，并提供智能加载机制
 */
export class ConfigManager {
  constructor() {
    this.logger = new EnhancedLogger('ConfigManager-V2');
    
    // V2专用配置目录
    this.configDir = join(homedir(), '.uvx', 'cloudflare_v2');
    this.configFile = join(this.configDir, 'config.json');
    
    // Cloudflare相关路径
    this.cloudflaredDir = join(homedir(), '.cloudflared');
    this.certFile = join(this.cloudflaredDir, 'cert.pem');
    
    // API相关配置
    this.apiBaseUrl = 'https://api.cloudflare.com/client/v4';
    
    this.initConfig();
  }

  /**
   * 初始化V2配置目录和文件
   */
  initConfig() {
    this.logger.logDebug('初始化V2配置目录', { configDir: this.configDir });
    
    // 创建V2配置目录
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
      chmodSync(this.configDir, 0o700); // 仅所有者可访问
      this.logger.logStep('创建配置目录', '创建V2配置目录', { path: this.configDir });
    }
    
    // 创建默认配置文件
    if (!existsSync(this.configFile)) {
      const defaultConfig = {
        version: '2.0',
        cloudflare: {
          apiToken: null,
          certPemPath: this.certFile,
          lastLoginTime: null,
          preferredDomain: null,
          tunnels: {} // 存储创建的隧道信息
        },
        preferences: {
          autoValidateSetup: true,
          skipPreflightChecks: false,
          dnsVerificationTimeout: 300000, // 5分钟
          retryAttempts: 3
        }
      };
      this.saveConfig(defaultConfig);
      this.logger.logStep('创建配置文件', '创建V2默认配置文件');
    }
  }

  /**
   * 读取配置文件
   * @returns {Object} 配置对象
   */
  readConfig() {
    try {
      const configData = readFileSync(this.configFile, 'utf8');
      const config = JSON.parse(configData);
      this.logger.logDebug('读取V2配置文件成功');
      return config;
    } catch (error) {
      this.logger.logError('读取V2配置文件失败', error);
      // 返回默认配置
      return this.getDefaultConfig();
    }
  }

  /**
   * 保存配置文件
   * @param {Object} config - 配置对象
   */
  saveConfig(config) {
    try {
      const configJson = JSON.stringify(config, null, 2);
      writeFileSync(this.configFile, configJson, { mode: 0o600 });
      this.logger.logDebug('保存V2配置文件成功');
    } catch (error) {
      this.logger.logError('保存V2配置文件失败', error);
      throw new Error(`无法保存V2配置文件: ${error.message}`);
    }
  }

  /**
   * 获取默认配置
   * @returns {Object} 默认配置对象
   */
  getDefaultConfig() {
    return {
      version: '2.0',
      cloudflare: {
        apiToken: null,
        certPemPath: this.certFile,
        lastLoginTime: null,
        preferredDomain: null,
        tunnels: {}
      },
      preferences: {
        autoValidateSetup: true,
        skipPreflightChecks: false,
        dnsVerificationTimeout: 300000,
        retryAttempts: 3
      }
    };
  }

  /**
   * 检查cert.pem文件是否存在且有效
   * @returns {Promise<boolean>} cert.pem文件状态
   */
  async checkCertPem() {
    this.logger.logDebug('检查cert.pem文件状态', { certFile: this.certFile });
    
    if (!existsSync(this.certFile)) {
      this.logger.logStep('检查证书', 'cert.pem文件不存在');
      return false;
    }

    try {
      const certContent = readFileSync(this.certFile, 'utf8');
      
      // 基本验证：检查是否包含有效的Cloudflare隧道格式标记
      if (!certContent.includes('-----BEGIN ARGO TUNNEL TOKEN-----') && 
          !certContent.includes('-----BEGIN CERTIFICATE-----') && 
          !certContent.includes('-----BEGIN PRIVATE KEY-----')) {
        this.logger.logWarning('cert.pem文件格式无效');
        return false;
      }

      // 检查文件修改时间（可选：如果文件太旧可能需要重新登录）
      const stats = existsSync(this.certFile) ? statSync(this.certFile) : null;
      if (stats) {
        const fileAge = Date.now() - stats.mtime.getTime();
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
        
        if (fileAge > maxAge) {
          this.logger.logWarning('cert.pem文件较旧，建议重新登录', { 
            ageInDays: Math.floor(fileAge / (24 * 60 * 60 * 1000)) 
          });
        }
      }

      this.logger.logStep('验证证书', 'cert.pem文件有效');
      return true;
    } catch (error) {
      this.logger.logError('验证cert.pem文件时发生错误', error);
      return false;
    }
  }

  /**
   * 获取API令牌
   * @returns {string|null} API令牌或null
   */
  getApiToken() {
    const config = this.readConfig();
    const token = config.cloudflare?.apiToken;
    
    if (token) {
      this.logger.logDebug('找到存储的API令牌');
    } else {
      this.logger.logStep('检查令牌', '未找到存储的API令牌');
    }
    
    return token;
  }

  /**
   * 保存API令牌
   * @param {string} token - API令牌
   */
  async setApiToken(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('无效的API令牌');
    }

    // 验证令牌有效性
    const isValid = await this.verifyApiToken(token);
    if (!isValid) {
      throw new Error('API令牌无效或无权限');
    }

    const config = this.readConfig();
    config.cloudflare.apiToken = token;
    config.cloudflare.lastLoginTime = new Date().toISOString();
    
    this.saveConfig(config);
    this.logger.logStep('保存令牌', 'API令牌保存成功');
  }

  /**
   * 保存API令牌（兼容旧版本）
   * @param {string} token - API令牌
   */
  saveApiToken(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('无效的API令牌');
    }

    const config = this.readConfig();
    config.cloudflare.apiToken = token;
    config.cloudflare.lastLoginTime = new Date().toISOString();
    
    this.saveConfig(config);
    this.logger.logStep('保存令牌', 'API令牌保存成功');
  }

  /**
   * 验证API令牌的有效性
   * @param {string} token - 要验证的令牌
   * @returns {Promise<boolean>} 令牌是否有效
   */
  async verifyApiToken(token) {
    if (!token) {
      return false;
    }

    try {
      this.logger.logDebug('验证API令牌有效性');
      
      const response = await fetch(`${this.apiBaseUrl}/user/tokens/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        this.logger.logStep('验证令牌', 'API令牌验证成功');
        return true;
      } else {
        this.logger.logWarning('API令牌验证失败', { 
          status: response.status, 
          message: result.errors?.[0]?.message || 'Unknown error' 
        });
        return false;
      }
    } catch (error) {
      this.logger.logError('验证API令牌时发生网络错误', error);
      return false;
    }
  }

  /**
   * 智能加载现有凭证
   * 按优先级检查cert.pem和API令牌的可用性
   * @returns {Promise<Object>} 凭证状态信息
   */
  async loadExistingCredentials() {
    this.logger.logStep('加载凭证', '开始智能加载现有凭证');
    
    const status = {
      hasCertPem: false,
      hasValidApiToken: false,
      requiresLogin: false,
      preferredDomain: null
    };

    // 检查cert.pem文件
    status.hasCertPem = await this.checkCertPem();
    
    // 检查API令牌
    const apiToken = this.getApiToken();
    if (apiToken) {
      status.hasValidApiToken = await this.verifyApiToken(apiToken);
    }

    // 获取首选域名
    const config = this.readConfig();
    status.preferredDomain = config.cloudflare?.preferredDomain;

    // 决定是否需要登录
    status.requiresLogin = !status.hasCertPem && !status.hasValidApiToken;

    this.logger.logStep('加载完成', '凭证加载完成', status);
    return status;
  }

  /**
   * 保存首选域名设置
   * @param {string} domain - 首选域名
   */
  savePreferredDomain(domain) {
    const config = this.readConfig();
    config.cloudflare.preferredDomain = domain;
    this.saveConfig(config);
    this.logger.logStep('保存域名', '保存首选域名', { domain });
  }

  /**
   * 记录隧道信息
   * @param {string} tunnelId - 隧道ID
   * @param {Object} tunnelInfo - 隧道详细信息
   */
  saveTunnelInfo(tunnelId, tunnelInfo) {
    const config = this.readConfig();
    config.cloudflare.tunnels[tunnelId] = {
      ...tunnelInfo,
      createdAt: new Date().toISOString()
    };
    this.saveConfig(config);
    this.logger.logDebug('保存隧道信息', { tunnelId });
  }

  /**
   * 获取隧道信息
   * @param {string} tunnelId - 隧道ID
   * @returns {Object|null} 隧道信息
   */
  getTunnelInfo(tunnelId) {
    const config = this.readConfig();
    return config.cloudflare.tunnels[tunnelId] || null;
  }

  /**
   * 清理配置（用于测试或重置）
   */
  clearConfig() {
    this.logger.logWarning('清理V2配置');
    if (existsSync(this.configFile)) {
      writeFileSync(this.configFile, JSON.stringify(this.getDefaultConfig(), null, 2));
    }
  }

  /**
   * 获取配置目录路径
   * @returns {string} 配置目录路径
   */
  getConfigDir() {
    return this.configDir;
  }

  /**
   * 获取cert.pem文件路径
   * @returns {string} cert.pem文件路径
   */
  getCertPath() {
    return this.certFile;
  }

  /**
   * 获取用户的Cloudflare DNS区域列表
   * @returns {Promise<Array>} DNS区域列表
   */
  async getCloudflareZones() {
    this.logger.logDebug('获取Cloudflare DNS区域列表');
    
    // 优先尝试API令牌方式
    const apiToken = this.getApiToken();
    if (apiToken) {
      return await this.getZonesViaApiToken(apiToken);
    }

    // 如果没有API令牌，但有cert.pem文件，建议用户先完成认证
    const hasCert = await this.checkCertPem();
    if (hasCert) {
      this.logger.logStep('DNS区域', '检测到cert.pem文件，但需要API令牌才能获取DNS区域列表');
      this.logger.logStep('建议', '可以选择"🔑 使用API令牌"选项来获取DNS区域列表');
      return [];
    }

    this.logger.logStep('DNS区域', '未找到认证凭据，将在登录后获取DNS区域');
    return [];
  }

  /**
   * 通过API令牌获取DNS区域
   * @param {string} apiToken - API令牌
   * @returns {Promise<Array>} DNS区域列表
   */
  async getZonesViaApiToken(apiToken) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/zones?status=active&per_page=50`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        this.logger.logStep('获取DNS区域', `成功获取${result.result.length}个DNS区域`);
        return result.result.map(zone => ({
          id: zone.id,
          name: zone.name,
          status: zone.status,
          paused: zone.paused
        }));
      } else {
        this.logger.logWarning('获取DNS区域失败', { 
          status: response.status, 
          message: result.errors?.[0]?.message || 'Unknown error' 
        });
        return [];
      }
    } catch (error) {
      this.logger.logError('获取DNS区域时发生网络错误', error);
      return [];
    }
  }
}