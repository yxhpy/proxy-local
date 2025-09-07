import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

/**
 * Cloudflare API 令牌配置管理器
 * 实现安全的 API 令牌存储、验证和管理
 */
export class CloudflareConfig {
  constructor() {
    this.configDir = join(homedir(), '.uvx');
    this.configFile = join(this.configDir, 'config.json');
    this.apiBaseUrl = 'https://api.cloudflare.com/client/v4';
    this.initConfig();
  }

  /**
   * 初始化配置目录和文件
   */
  initConfig() {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
      // 设置目录权限为 700 (仅所有者可读写执行)
      chmodSync(this.configDir, 0o700);
    }
    
    if (!existsSync(this.configFile)) {
      const defaultConfig = {
        cloudflare: {
          apiToken: null,
          email: null, // 废弃：仅为向后兼容保留
          apiKey: null, // 废弃：仅为向后兼容保留
          fixedDomain: null,
          lastUsedDomain: null,
          authMethod: 'api-token' // 新增：标记使用的认证方式
        }
      };
      this.saveConfig(defaultConfig);
    }
  }

  /**
   * 读取配置文件
   */
  readConfig() {
    try {
      const configData = readFileSync(this.configFile, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn(chalk.yellow(`读取配置文件失败: ${error.message}`));
      return {
        cloudflare: {
          apiToken: null,
          fixedDomain: null,
          lastUsedDomain: null,
          authMethod: 'api-token'
        }
      };
    }
  }

  /**
   * 安全保存配置文件
   * 确保文件权限为 600 (仅所有者可读写)
   */
  saveConfig(config) {
    try {
      writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      // 设置文件权限为 600 (仅所有者可读写)
      chmodSync(this.configFile, 0o600);
      console.log(chalk.gray(`配置已保存到: ${this.configFile}`));
    } catch (error) {
      console.error(chalk.red(`保存配置文件失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 保存 API 令牌
   * @param {string} token - Cloudflare API 令牌
   */
  saveToken(token) {
    const config = this.readConfig();
    if (!config.cloudflare) {
      config.cloudflare = {};
    }
    
    config.cloudflare.apiToken = token;
    config.cloudflare.authMethod = 'api-token';
    
    // 清除旧的认证信息（如果存在）
    delete config.cloudflare.email;
    delete config.cloudflare.apiKey;
    
    this.saveConfig(config);
    console.log(chalk.green('✅ API 令牌已安全保存'));
  }

  /**
   * 加载 API 令牌
   * @returns {string|null} 保存的 API 令牌或 null
   */
  loadToken() {
    try {
      // 优先检查环境变量
      if (process.env.CLOUDFLARE_API_TOKEN) {
        return process.env.CLOUDFLARE_API_TOKEN;
      }

      // 从配置文件读取
      const config = this.readConfig();
      return config.cloudflare?.apiToken || null;
    } catch (error) {
      console.warn(chalk.yellow(`加载 API 令牌失败: ${error.message}`));
      return null;
    }
  }

  /**
   * 验证 Cloudflare API 令牌
   * @param {string} token - 要验证的令牌
   * @returns {Promise<boolean>} 令牌是否有效
   */
  async verifyCloudflareToken(token) {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      console.error(chalk.red('❌ API 令牌不能为空'));
      return false;
    }

    try {
      console.log(chalk.gray('🔍 验证 Cloudflare API 令牌...'));
      console.log(chalk.gray(`   令牌长度: ${token.trim().length}`));
      console.log(chalk.gray(`   令牌前缀: ${token.trim().substring(0, 8)}...`));
      
      const response = await fetch(`${this.apiBaseUrl}/user/tokens/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(chalk.gray(`   API 响应状态: ${response.status} ${response.statusText}`));

      if (!response.ok) {
        // 获取更详细的错误信息
        try {
          const errorBody = await response.text();
          console.error(chalk.red(`❌ API 请求失败: ${response.status} ${response.statusText}`));
          console.error(chalk.red(`   错误详情: ${errorBody}`));
        } catch (bodyError) {
          console.error(chalk.red(`❌ API 请求失败: ${response.status} ${response.statusText}`));
        }
        return false;
      }

      const data = await response.json();
      
      if (!data.success) {
        console.error(chalk.red(`❌ 令牌验证失败: ${data.errors?.map(e => e.message).join(', ') || '未知错误'}`));
        return false;
      }

      // 检查令牌状态
      if (data.result && data.result.status === 'active') {
        console.log(chalk.green('✅ API 令牌验证成功'));
        console.log(chalk.gray(`令牌ID: ${data.result.id || '未知'}`));
        
        // 检查权限（如果API返回了权限信息）
        if (data.result.policies) {
          const hasZoneRead = data.result.policies.some(p => 
            p.resources?.['zone:*'] && p.permission_groups?.some(pg => pg.name === 'Zone:Read')
          );
          const hasDnsEdit = data.result.policies.some(p => 
            p.resources?.['zone:*'] && p.permission_groups?.some(pg => pg.name === 'Zone:DNS:Edit')
          );
          
          if (!hasZoneRead || !hasDnsEdit) {
            console.warn(chalk.yellow('⚠️ 令牌可能缺少必要权限：'));
            console.warn(chalk.yellow('   需要权限：Zone:Zone:Read 和 Zone:DNS:Edit'));
          }
        }
        
        return true;
      } else {
        console.error(chalk.red(`❌ 令牌状态异常: ${data.result?.status || '未知状态'}`));
        return false;
      }
    } catch (error) {
      console.error(chalk.red(`❌ 令牌验证过程出错: ${error.message}`));
      console.error(chalk.red(`   错误类型: ${error.constructor.name}`));
      console.error(chalk.gray(`   错误堆栈: ${error.stack}`));
      return false;
    }
  }

  /**
   * 检查是否有有效的 API 令牌
   * @returns {Promise<boolean>} 是否有有效令牌
   */
  async hasValidToken() {
    const token = this.loadToken();
    if (!token) {
      return false;
    }
    
    return await this.verifyCloudflareToken(token);
  }

  /**
   * 清除保存的 API 令牌
   */
  clearToken() {
    try {
      const config = this.readConfig();
      if (config.cloudflare) {
        delete config.cloudflare.apiToken;
        // 也清除旧的认证信息
        delete config.cloudflare.email;
        delete config.cloudflare.apiKey;
      }
      
      this.saveConfig(config);
      console.log(chalk.green('✅ API 令牌已清除'));
    } catch (error) {
      console.error(chalk.red(`清除令牌失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 获取 API 请求头
   * @returns {Object|null} 请求头对象或 null
   */
  getApiHeaders() {
    const token = this.loadToken();
    if (!token) {
      return null;
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 检查旧的认证方式是否存在（用于迁移提示）
   * @returns {boolean} 是否检测到旧认证方式
   */
  hasLegacyAuth() {
    try {
      // 检查 cloudflared 凭据文件
      const cloudflaredDir = join(homedir(), '.cloudflared');
      const certPath = join(cloudflaredDir, 'cert.pem');
      
      if (existsSync(certPath)) {
        return true;
      }

      // 检查配置文件中的旧认证信息
      const config = this.readConfig();
      return !!(config.cloudflare?.email && config.cloudflare?.apiKey);
    } catch (error) {
      return false;
    }
  }

  /**
   * 标记旧认证方式为废弃（不删除文件，只添加警告）
   */
  markLegacyAuthAsDeprecated() {
    if (this.hasLegacyAuth()) {
      console.log(chalk.yellow('⚠️ 检测到旧的 Cloudflare 认证方式'));
      console.log(chalk.yellow('   建议使用新的 API 令牌认证方式以获得更好的安全性'));
      console.log(chalk.gray('   旧的认证文件将被保留但不再使用'));
    }
  }

  /**
   * 生成 API 令牌创建链接和说明
   */
  getTokenCreationGuide() {
    return {
      url: 'https://dash.cloudflare.com/profile/api-tokens',
      instructions: [
        '1. 访问 Cloudflare 仪表板的 API 令牌页面',
        '2. 点击 "创建令牌" 按钮',
        '3. 选择 "自定义令牌" 模板',
        '4. 设置权限：',
        '   - Zone:Zone:Read (用于列出域名)',
        '   - Zone:DNS:Edit (用于管理 DNS 记录)',
        '5. 选择要管理的区域（域名）',
        '6. 可选：设置 IP 限制和 TTL',
        '7. 点击 "继续以显示摘要"',
        '8. 确认并创建令牌',
        '9. 复制生成的令牌（只显示一次）'
      ]
    };
  }

  /**
   * 显示令牌设置指南
   */
  showTokenSetupGuide() {
    const guide = this.getTokenCreationGuide();
    
    console.log(chalk.blue('🔑 Cloudflare API 令牌设置指南:'));
    console.log('');
    console.log(chalk.cyan(`📍 令牌创建页面: ${guide.url}`));
    console.log('');
    console.log(chalk.yellow('📋 创建步骤:'));
    guide.instructions.forEach((step, index) => {
      console.log(chalk.gray(`  ${step}`));
    });
    console.log('');
    console.log(chalk.green('💡 创建完成后，请使用以下方式之一配置令牌:'));
    console.log(chalk.gray('  方式1: 设置环境变量 CLOUDFLARE_API_TOKEN=your_token'));
    console.log(chalk.gray('  方式2: 运行命令时交互式输入'));
    console.log('');
  }
}