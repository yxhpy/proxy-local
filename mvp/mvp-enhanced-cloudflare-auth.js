#!/usr/bin/env node

/**
 * MVP: Enhanced Cloudflare Authentication Manager
 * 增强的 Cloudflare 认证管理器 - 统一 cert.pem 和 API Token 认证
 * 基于任务76分析报告的要求实现
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { CloudflareAuth } from './src/utils/cloudflare-auth.js';
import { CloudflaredCommandBuilder } from './mvp-unified-cloudflared-command-builder.js';

class EnhancedCloudflareAuth {
  constructor() {
    this.certPath = join(homedir(), '.cloudflared', 'cert.pem');
    this.apiAuth = new CloudflareAuth(); // 现有的API Token认证
    this.commandBuilder = new CloudflaredCommandBuilder();
  }

  /**
   * 检查证书文件是否存在
   */
  hasCertificate() {
    return existsSync(this.certPath);
  }

  /**
   * 检查API Token是否有效
   */
  async hasValidApiToken() {
    try {
      const token = await this.apiAuth.getValidCloudflareToken();
      return !!token;
    } catch (error) {
      return false;
    }
  }

  /**
   * 综合认证状态检查
   * 按照官方指南要求，优先检查cert.pem，API Token作为补充
   */
  async getAuthenticationStatus() {
    const hasCert = this.hasCertificate();
    const hasApiToken = await this.hasValidApiToken();

    const status = {
      hasCertificate: hasCert,
      hasApiToken: hasApiToken,
      canUseNamedTunnels: hasCert, // 命名隧道必须有证书
      canUseApi: hasApiToken, // API操作需要Token
      isFullyAuthenticated: hasCert && hasApiToken, // 完全认证状态
      authenticationLevel: this._determineAuthLevel(hasCert, hasApiToken)
    };

    return status;
  }

  /**
   * 确定认证级别
   */
  _determineAuthLevel(hasCert, hasApiToken) {
    if (hasCert && hasApiToken) return 'full';
    if (hasCert && !hasApiToken) return 'cert-only';
    if (!hasCert && hasApiToken) return 'api-only';
    return 'none';
  }

  /**
   * 执行登录流程
   * 根据官方指南，首先执行 cloudflared tunnel login
   */
  async performLogin(options = {}) {
    const { forceApiSetup = true } = options;

    console.log(chalk.blue('🔐 开始 Cloudflare 认证流程...'));

    // 步骤1: 检查现有认证状态
    const currentStatus = await this.getAuthenticationStatus();
    console.log(chalk.gray('当前认证状态:'), this._formatAuthStatus(currentStatus));

    // 步骤2: 执行 cloudflared tunnel login（如果没有证书）
    if (!currentStatus.hasCertificate) {
      console.log(chalk.yellow('📋 步骤1: 执行 cloudflared tunnel login...'));
      const loginSuccess = await this._performCertificateLogin();
      
      if (!loginSuccess) {
        console.log(chalk.red('❌ 证书登录失败'));
        if (!forceApiSetup) {
          throw new Error('证书登录失败，无法继续');
        }
      }
    } else {
      console.log(chalk.green('✅ 证书文件已存在，跳过登录步骤'));
    }

    // 步骤3: 设置 API Token（如果需要且用户允许）
    if (forceApiSetup && !currentStatus.hasApiToken) {
      console.log(chalk.yellow('📋 步骤2: 设置 API Token...'));
      try {
        await this.apiAuth.ensureValidToken();
        console.log(chalk.green('✅ API Token 设置成功'));
      } catch (error) {
        console.log(chalk.yellow(`⚠️ API Token 设置失败: ${error.message}`));
        console.log(chalk.gray('某些功能（如DNS API调用）可能不可用'));
      }
    }

    // 步骤4: 验证最终认证状态
    const finalStatus = await this.getAuthenticationStatus();
    console.log(chalk.blue('最终认证状态:'), this._formatAuthStatus(finalStatus));

    return finalStatus;
  }

  /**
   * 执行证书登录
   */
  async _performCertificateLogin() {
    return new Promise((resolve) => {
      console.log(chalk.blue('🌐 启动浏览器进行 Cloudflare 认证...'));
      console.log(chalk.gray('请在浏览器中完成授权流程'));

      const loginCmd = this.commandBuilder.buildLoginCommand();
      const loginProcess = spawn(loginCmd[0], loginCmd.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let hasResolved = false;
      let stdoutOutput = '';
      let stderrOutput = '';

      loginProcess.stdout.on('data', (data) => {
        stdoutOutput += data.toString();
        process.stdout.write(data); // 实时显示输出
      });

      loginProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
        process.stderr.write(data); // 实时显示错误
      });

      loginProcess.on('close', (code) => {
        if (hasResolved) return;
        hasResolved = true;

        if (code === 0) {
          // 验证证书文件是否真的创建了
          if (this.hasCertificate()) {
            console.log(chalk.green('✅ 证书登录成功，证书文件已生成'));
            resolve(true);
          } else {
            console.log(chalk.red('❌ 登录命令成功但证书文件未生成'));
            resolve(false);
          }
        } else {
          console.log(chalk.red(`❌ 登录失败，退出代码: ${code}`));
          if (stderrOutput.trim()) {
            console.log(chalk.red('错误详情:'), stderrOutput.trim());
          }
          resolve(false);
        }
      });

      loginProcess.on('error', (err) => {
        if (hasResolved) return;
        hasResolved = true;
        console.log(chalk.red(`❌ 启动登录进程失败: ${err.message}`));
        resolve(false);
      });

      // 设置超时
      setTimeout(() => {
        if (!hasResolved) {
          console.log(chalk.yellow('⏰ 登录超时，终止进程...'));
          loginProcess.kill();
          hasResolved = true;
          resolve(false);
        }
      }, 60000); // 60秒超时
    });
  }

  /**
   * 格式化认证状态显示
   */
  _formatAuthStatus(status) {
    const parts = [];
    
    if (status.hasCertificate) {
      parts.push(chalk.green('证书✓'));
    } else {
      parts.push(chalk.red('证书✗'));
    }

    if (status.hasApiToken) {
      parts.push(chalk.green('API令牌✓'));
    } else {
      parts.push(chalk.red('API令牌✗'));
    }

    parts.push(`级别:${chalk.cyan(status.authenticationLevel)}`);

    return parts.join(' ');
  }

  /**
   * 获取适用于不同操作的认证配置
   */
  async getAuthConfigForOperation(operation) {
    const status = await this.getAuthenticationStatus();

    const configs = {
      'named-tunnel': {
        required: status.hasCertificate,
        available: status.hasCertificate,
        message: status.hasCertificate ? '可以使用命名隧道' : '需要证书文件才能使用命名隧道'
      },
      'dns-api': {
        required: status.hasApiToken,
        available: status.hasApiToken,
        message: status.hasApiToken ? '可以使用DNS API' : '需要API令牌才能使用DNS API'
      },
      'full-integration': {
        required: status.isFullyAuthenticated,
        available: status.isFullyAuthenticated,
        message: status.isFullyAuthenticated ? '完全认证，所有功能可用' : '需要证书和API令牌才能使用所有功能'
      }
    };

    return configs[operation] || {
      required: false,
      available: true,
      message: '未知操作'
    };
  }

  /**
   * 确保指定操作所需的认证
   */
  async ensureAuthenticationForOperation(operation) {
    const config = await this.getAuthConfigForOperation(operation);
    
    if (!config.available) {
      console.log(chalk.yellow(`⚠️ ${config.message}`));
      
      // 尝试自动设置认证
      const loginResult = await this.performLogin();
      
      // 重新检查
      const newConfig = await this.getAuthConfigForOperation(operation);
      if (!newConfig.available) {
        throw new Error(`操作 ${operation} 需要的认证设置失败`);
      }
    }

    console.log(chalk.green(`✅ ${config.message}`));
    return true;
  }
}

// MVP测试代码
async function testEnhancedAuth() {
  console.log(chalk.blue('🧪 测试增强的 Cloudflare 认证管理器'));
  console.log(chalk.blue('='.repeat(50)));

  const auth = new EnhancedCloudflareAuth();

  try {
    // 1. 检查当前认证状态
    console.log(chalk.yellow('\n📋 1. 检查当前认证状态'));
    const status = await auth.getAuthenticationStatus();
    console.log('认证状态:', auth._formatAuthStatus(status));
    console.log('详细信息:', {
      hasCertificate: status.hasCertificate,
      hasApiToken: status.hasApiToken,
      canUseNamedTunnels: status.canUseNamedTunnels,
      canUseApi: status.canUseApi,
      authenticationLevel: status.authenticationLevel
    });

    // 2. 测试不同操作的认证需求
    console.log(chalk.yellow('\n📋 2. 测试操作认证需求'));
    
    const operations = ['named-tunnel', 'dns-api', 'full-integration'];
    for (const operation of operations) {
      const config = await auth.getAuthConfigForOperation(operation);
      console.log(`${operation}: ${config.available ? chalk.green('✓') : chalk.red('✗')} ${config.message}`);
    }

    // 3. 认证建议
    console.log(chalk.yellow('\n📋 3. 认证建议'));
    if (!status.hasCertificate) {
      console.log(chalk.cyan('• 运行 cloudflared tunnel login 获取证书文件'));
    }
    if (!status.hasApiToken) {
      console.log(chalk.cyan('• 设置 Cloudflare API Token 以使用 DNS API'));
    }
    if (status.isFullyAuthenticated) {
      console.log(chalk.green('• 认证完整，所有功能可用'));
    }

  } catch (error) {
    console.error(chalk.red('❌ 测试失败:'), error.message);
  }

  console.log(chalk.green('\n✅ 增强认证管理器测试完成'));
  console.log(chalk.blue('主要特性:'));
  console.log(chalk.gray('  • 统一管理证书和API Token认证'));
  console.log(chalk.gray('  • 按操作类型检查认证需求'));
  console.log(chalk.gray('  • 自动化认证流程'));
  console.log(chalk.gray('  • 详细的认证状态报告'));
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testEnhancedAuth().catch(console.error);
}

export { EnhancedCloudflareAuth };