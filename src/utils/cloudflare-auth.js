import inquirer from 'inquirer';
import chalk from 'chalk';
import { CloudflareConfig } from './cloudflare-config.js';

/**
 * Cloudflare API 认证管理器
 * 处理交互式认证流程和令牌管理
 */
export class CloudflareAuth {
  constructor() {
    this.config = new CloudflareConfig();
    // 内存缓存：避免重复验证同一个令牌
    this.tokenCache = {
      token: null,
      isValid: false,
      lastValidated: 0,
      cacheTimeout: 30000 // 30秒缓存
    };
  }

  /**
   * 核心验证函数 - 验证给定的 API 令牌
   * @param {string} token - 要验证的令牌
   * @returns {Promise<boolean>} 令牌是否有效
   */
  async verifyCloudflareToken(token) {
    // 检查内存缓存
    const now = Date.now();
    if (this.tokenCache.token === token && 
        this.tokenCache.isValid && 
        (now - this.tokenCache.lastValidated) < this.tokenCache.cacheTimeout) {
      console.log(chalk.gray('🎯 使用缓存的令牌验证结果'));
      return true;
    }

    // 调用实际验证
    console.log(chalk.gray(`🔍 验证令牌: ${token ? token.substring(0, 8) + '...' : 'null'}`));
    const isValid = await this.config.verifyCloudflareToken(token);
    
    // 更新缓存
    this.tokenCache = {
      token: token,
      isValid: isValid,
      lastValidated: now,
      cacheTimeout: this.tokenCache.cacheTimeout
    };
    
    return isValid;
  }

  /**
   * 清除令牌验证缓存（在令牌更新后调用）
   */
  clearTokenCache() {
    this.tokenCache = {
      token: null,
      isValid: false,
      lastValidated: 0,
      cacheTimeout: this.tokenCache.cacheTimeout
    };
    console.log(chalk.gray('🗑️ 已清除令牌验证缓存'));
  }

  /**
   * 获取有效的 Cloudflare API 令牌（统一入口）
   * 实现完整的令牌获取与验证工作流
   * @returns {Promise<string|null>} 有效的令牌或 null
   */
  async getValidCloudflareToken() {
    try {
      // 1. 尝试从配置获取令牌（包括环境变量和配置文件）
      let token = this.config.loadToken();
      const tokenSource = process.env.CLOUDFLARE_API_TOKEN ? '环境变量' : '配置文件';
      
      if (token) {
        console.log(chalk.gray(`🔍 检查已保存的 API 令牌 (来源: ${tokenSource})...`));
        
        // 2. 验证令牌
        const isValid = await this.verifyCloudflareToken(token);
        
        if (isValid) {
          // 3. 如果令牌有效，返回该令牌
          console.log(chalk.green('✅ 使用已保存的有效令牌'));
          return token;
        } else {
          console.log(chalk.yellow(`⚠️ ${tokenSource}中的令牌已失效`));
          
          // 4. 如果环境变量中的令牌无效，尝试配置文件中的令牌
          if (process.env.CLOUDFLARE_API_TOKEN) {
            console.log(chalk.gray('🔄 尝试使用配置文件中的令牌...'));
            
            // 临时清除环境变量，从配置文件读取
            const envToken = process.env.CLOUDFLARE_API_TOKEN;
            delete process.env.CLOUDFLARE_API_TOKEN;
            
            const configToken = this.config.loadToken();
            
            if (configToken && configToken !== envToken) {
              console.log(chalk.gray('🔍 验证配置文件中的令牌...'));
              const configTokenValid = await this.verifyCloudflareToken(configToken);
              
              if (configTokenValid) {
                console.log(chalk.green('✅ 配置文件中的令牌有效，将使用该令牌'));
                return configToken;
              } else {
                console.log(chalk.yellow('⚠️ 配置文件中的令牌也已失效'));
              }
            }
            
            // 恢复环境变量
            process.env.CLOUDFLARE_API_TOKEN = envToken;
          }
        }
      }

      // 检查并提示旧认证方式废弃
      this.config.markLegacyAuthAsDeprecated();

      // 检查是否为非交互式环境
      if (process.env.CI || process.env.NON_INTERACTIVE || !process.stdin.isTTY) {
        console.log(chalk.red('❌ 在非交互式环境中缺少有效的 Cloudflare API 令牌'));
        console.log(chalk.yellow('请设置环境变量 CLOUDFLARE_API_TOKEN'));
        this.config.showTokenSetupGuide();
        return null;
      }

      // 4. 如果令牌不存在或无效，触发交互式提示
      console.log(chalk.blue('🔑 需要设置 Cloudflare API 令牌'));
      
      const setupSuccess = await this.startInteractiveTokenSetup();
      if (setupSuccess) {
        // 5. 获取新令牌后，重新加载并返回
        token = this.config.loadToken();
        if (token) {
          console.log(chalk.green('✅ 新令牌设置成功'));
        
        // 清除旧令牌的缓存
        this.clearTokenCache();
          return token;
        }
      }
      
      console.log(chalk.red('❌ 无法获取有效的 API 令牌'));
      return null;
      
    } catch (error) {
      console.error(chalk.red(`获取 API 令牌失败: ${error.message}`));
      return null;
    }
  }

  /**
   * 确保有有效的 API 令牌（交互式流程）
   * 如果没有有效令牌，会引导用户输入
   * @returns {Promise<boolean>} 是否成功获得有效令牌
   */
  async ensureValidToken() {
    const token = await this.getValidCloudflareToken();
    return !!token;
  }

  /**
   * 交互式令牌设置流程
   * @returns {Promise<boolean>} 是否成功设置有效令牌
   */
  async startInteractiveTokenSetup() {
    console.log(chalk.blue('🔑 Cloudflare API 令牌设置'));
    console.log(chalk.gray('需要 API 令牌来管理您的 Cloudflare DNS 记录'));
    console.log('');

    // 询问用户是否需要查看设置指南
    const { showGuide } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'showGuide',
        message: '是否需要查看 API 令牌创建指南？',
        default: true
      }
    ]);

    if (showGuide) {
      console.log('');
      this.config.showTokenSetupGuide();
    }

    // 令牌输入循环，最多尝试3次
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log('');
      console.log(chalk.blue(`🔐 请输入您的 Cloudflare API 令牌 (尝试 ${attempt}/3):`));
      
      const { apiToken } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiToken',
          message: 'API 令牌:',
          mask: '*',
          validate: (input) => {
            if (!input || !input.trim()) {
              return '令牌不能为空';
            }
            if (input.trim().length < 10) {
              return '令牌长度似乎太短，请检查是否完整';
            }
            return true;
          }
        }
      ]);

      console.log('');
      console.log(chalk.gray('🔍 验证令牌...'));

      // 验证令牌
      const isValid = await this.verifyCloudflareToken(apiToken.trim());
      
      if (isValid) {
        // 询问是否保存令牌
        const { shouldSave } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldSave',
            message: '是否保存此令牌到本地配置文件？(推荐)',
            default: true
          }
        ]);

        if (shouldSave) {
          this.config.saveToken(apiToken.trim());
          console.log(chalk.green('✅ 令牌已保存，下次将自动使用'));
        } else {
          console.log(chalk.yellow('⚠️ 令牌未保存，仅在本次会话中有效'));
          // 临时存储在内存中
          process.env.CLOUDFLARE_API_TOKEN = apiToken.trim();
        }

        console.log('');
        console.log(chalk.green('🎉 Cloudflare API 认证设置完成！'));
        return true;
      } else {
        if (attempt < 3) {
          console.log(chalk.red('❌ 令牌验证失败，请检查令牌是否正确'));
          console.log(chalk.yellow('💡 常见问题:'));
          console.log(chalk.gray('  • 令牌是否完整（没有多余空格）'));
          console.log(chalk.gray('  • 是否具有必要权限 (Zone:Zone:Read + Zone:DNS:Edit)'));
          console.log(chalk.gray('  • 令牌是否已过期'));
          
          const { tryAgain } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'tryAgain',
              message: '是否要重新输入令牌？',
              default: true
            }
          ]);
          
          if (!tryAgain) {
            break;
          }
        } else {
          console.log(chalk.red('❌ 已达到最大尝试次数'));
        }
      }
    }

    console.log('');
    console.log(chalk.red('❌ 令牌设置失败'));
    console.log(chalk.blue('💡 您可以:'));
    console.log(chalk.gray('  1. 稍后重新运行此命令'));
    console.log(chalk.gray('  2. 设置环境变量: export CLOUDFLARE_API_TOKEN=your_token'));
    console.log(chalk.gray('  3. 检查令牌权限和有效性'));
    
    return false;
  }

  /**
   * 重置令牌配置（清除令牌并可选择重新设置）
   * @param {boolean} interactive - 是否启动交互式重新设置
   * @returns {Promise<boolean>} 操作是否成功
   */
  async resetToken(interactive = false) {
    try {
      console.log(chalk.blue('🔄 重置 Cloudflare API 令牌配置...'));
      
      // 清除现有令牌
      this.config.clearToken();
      
      // 清除环境变量（如果存在）
      delete process.env.CLOUDFLARE_API_TOKEN;
      
      console.log(chalk.green('✅ 令牌配置已重置'));
      
      if (interactive) {
        console.log('');
        const { setupNew } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'setupNew',
            message: '是否要立即设置新的令牌？',
            default: true
          }
        ]);
        
        if (setupNew) {
          return await this.startInteractiveTokenSetup();
        }
      }
      
      return true;
    } catch (error) {
      console.error(chalk.red(`重置令牌配置失败: ${error.message}`));
      return false;
    }
  }

  /**
   * 获取当前认证状态信息
   * @returns {Promise<Object>} 认证状态对象
   */
  async getAuthStatus() {
    const token = this.config.loadToken();
    const hasToken = !!token;
    const isValid = hasToken ? await this.verifyCloudflareToken(token) : false;
    const hasLegacyAuth = this.config.hasLegacyAuth();

    return {
      hasToken,
      isValid,
      tokenSource: token === process.env.CLOUDFLARE_API_TOKEN ? 'environment' : 'config',
      hasLegacyAuth,
      configFile: this.config.configFile,
      authMethod: 'api-token'
    };
  }

  /**
   * 显示当前认证状态
   */
  async showAuthStatus() {
    const status = await this.getAuthStatus();
    
    console.log(chalk.blue('🔐 Cloudflare 认证状态:'));
    console.log('');
    
    if (status.hasToken) {
      console.log(chalk.green('✅ API 令牌: 已配置'));
      console.log(chalk.gray(`   来源: ${status.tokenSource === 'environment' ? '环境变量' : '配置文件'}`));
      
      if (status.isValid) {
        console.log(chalk.green('✅ 令牌状态: 有效'));
      } else {
        console.log(chalk.red('❌ 令牌状态: 无效或已过期'));
      }
    } else {
      console.log(chalk.red('❌ API 令牌: 未配置'));
    }
    
    console.log(chalk.gray(`   配置文件: ${status.configFile}`));
    console.log(chalk.gray(`   认证方式: ${status.authMethod}`));
    
    if (status.hasLegacyAuth) {
      console.log('');
      console.log(chalk.yellow('⚠️ 检测到旧的认证方式 (cloudflared 证书)'));
      console.log(chalk.gray('   建议迁移到 API 令牌认证'));
    }
    
    console.log('');
  }

  /**
   * 获取 API 请求头（用于其他模块）
   * @returns {Object|null} 请求头或 null
   */
  getApiHeaders() {
    return this.config.getApiHeaders();
  }
}