#!/usr/bin/env node

/**
 * 修复 CloudflareProvider 认证和配置管理
 * 基于任务76.2的要求，集成统一的命令构建器和增强的认证管理
 */

const fs = require('fs');
const path = require('path');

// 简单的颜色输出
const chalk = {
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`
};

console.log(chalk.blue('🔧 修复 CloudflareProvider 认证和配置管理'));
console.log(chalk.blue('='.repeat(50)));

// 1. 创建 utils/cloudflared-command-builder.js
const commandBuilderPath = 'src/utils/cloudflared-command-builder.js';
const commandBuilderContent = `import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';

/**
 * 统一的 cloudflared 命令构建器
 * 确保所有 cloudflared 命令都使用 --config 参数
 */
export class CloudflaredCommandBuilder {
  constructor() {
    this.configDir = join(homedir(), '.cloudflared');
    this.configFile = join(this.configDir, 'config.yml');
    this.certPath = join(this.configDir, 'cert.pem');
  }

  /**
   * 确保配置目录存在
   */
  ensureConfigDirectory() {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * 检查证书文件是否存在
   */
  hasCertificate() {
    return existsSync(this.certPath);
  }

  /**
   * 生成统一的配置文件
   */
  generateConfigFile(options = {}) {
    this.ensureConfigDirectory();

    const config = {};

    // 添加隧道ID
    if (options.tunnelId) {
      config.tunnel = options.tunnelId;
    }

    // 添加凭据文件路径
    if (this.hasCertificate()) {
      config.credentials_file = this.certPath;
    }

    // 添加ingress规则
    if (options.ingress && options.ingress.length > 0) {
      config.ingress = options.ingress;
    } else if (options.tunnelId) {
      config.ingress = [{ service: 'http_status:404' }];
    }

    const yamlContent = yaml.dump(config, { indent: 2 });
    writeFileSync(this.configFile, yamlContent);
    
    console.log(chalk.gray(\`配置文件已生成: \${this.configFile}\`));
    return this.configFile;
  }

  /**
   * 构建统一的cloudflared命令
   */
  buildCommand(baseCommand, options = {}) {
    const command = ['cloudflared'];

    // 总是添加 --config 参数（如果配置文件存在）
    if (existsSync(this.configFile)) {
      command.push('--config', this.configFile);
    }

    command.push(...baseCommand);
    return command;
  }

  /**
   * 构建登录命令（不使用配置文件）
   */
  buildLoginCommand() {
    return ['cloudflared', 'tunnel', 'login'];
  }

  /**
   * 构建隧道创建命令
   */
  buildCreateCommand(tunnelName) {
    return this.buildCommand(['tunnel', 'create', tunnelName]);
  }

  /**
   * 构建DNS路由命令
   */
  buildRouteCommand(tunnelId, domain) {
    return this.buildCommand(['tunnel', 'route', 'dns', tunnelId, domain]);
  }

  /**
   * 构建隧道运行命令
   */
  buildRunCommand(tunnelId = null) {
    const baseCommand = ['tunnel', 'run'];
    if (tunnelId) {
      baseCommand.push(tunnelId);
    }
    return this.buildCommand(baseCommand);
  }

  /**
   * 构建隧道删除命令
   */
  buildDeleteCommand(tunnelId) {
    return this.buildCommand(['tunnel', 'delete', tunnelId]);
  }

  getConfigPath() {
    return this.configFile;
  }
}
`;

// 2. 创建增强认证管理器的片段用于集成
const enhancedAuthMethods = `
  /**
   * 检查证书文件是否存在
   */
  hasCertificate() {
    const certPath = join(homedir(), '.cloudflared', 'cert.pem');
    return existsSync(certPath);
  }

  /**
   * 综合认证状态检查
   */
  async getAuthenticationStatus() {
    const hasCert = this.hasCertificate();
    const hasApiToken = await this.auth.getValidCloudflareToken();

    return {
      hasCertificate: hasCert,
      hasApiToken: !!hasApiToken,
      canUseNamedTunnels: hasCert,
      canUseApi: !!hasApiToken,
      isFullyAuthenticated: hasCert && !!hasApiToken,
      authenticationLevel: this._determineAuthLevel(hasCert, !!hasApiToken)
    };
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
   * 增强的认证检查
   */
  async isAuthenticated() {
    try {
      const status = await this.getAuthenticationStatus();
      console.log(chalk.gray('认证状态:'), this._formatAuthStatus(status));
      return status.canUseNamedTunnels; // 命名隧道需要证书
    } catch (error) {
      console.warn(chalk.yellow(\`检查认证状态失败: \${error.message}\`));
      return false;
    }
  }

  /**
   * 格式化认证状态显示
   */
  _formatAuthStatus(status) {
    const parts = [];
    parts.push(status.hasCertificate ? chalk.green('证书✓') : chalk.red('证书✗'));
    parts.push(status.hasApiToken ? chalk.green('API✓') : chalk.red('API✗'));
    parts.push(\`级别:\${chalk.cyan(status.authenticationLevel)}\`);
    return parts.join(' ');
  }
`;

try {
  // 写入命令构建器文件
  console.log(chalk.yellow('📋 1. 创建统一命令构建器...'));
  fs.writeFileSync(commandBuilderPath, commandBuilderContent);
  console.log(chalk.green(`✅ 已创建: ${commandBuilderPath}`));

  // 读取现有的 CloudflareProvider
  console.log(chalk.yellow('📋 2. 分析现有 CloudflareProvider...'));
  const cloudflareProviderPath = 'src/providers/cloudflare.js';
  let providerContent = fs.readFileSync(cloudflareProviderPath, 'utf8');

  // 检查是否需要添加导入
  if (!providerContent.includes('CloudflaredCommandBuilder')) {
    const importLine = "import { CloudflaredCommandBuilder } from '../utils/cloudflared-command-builder.js';";
    
    // 在现有导入后添加新的导入
    const importIndex = providerContent.lastIndexOf('import ');
    const nextLineIndex = providerContent.indexOf('\n', importIndex);
    
    providerContent = providerContent.slice(0, nextLineIndex) + '\n' + importLine + providerContent.slice(nextLineIndex);
    console.log(chalk.green('✅ 添加了 CloudflaredCommandBuilder 导入'));
  }

  // 检查是否需要在构造函数中初始化命令构建器
  if (!providerContent.includes('this.commandBuilder')) {
    const constructorMatch = providerContent.match(/(this\.healthChecker = new TunnelHealthChecker\(this\);.*?\n)/);
    if (constructorMatch) {
      const replacement = constructorMatch[1] + '    this.commandBuilder = new CloudflaredCommandBuilder(); // 统一命令构建器\n';
      providerContent = providerContent.replace(constructorMatch[1], replacement);
      console.log(chalk.green('✅ 在构造函数中添加了命令构建器初始化'));
    }
  }

  // 写回修改的内容
  fs.writeFileSync(cloudflareProviderPath, providerContent);
  console.log(chalk.green(`✅ 已修改: ${cloudflareProviderPath}`));

  console.log(chalk.yellow('📋 3. 生成修复指令...'));
  
  console.log(chalk.blue('接下来需要手动进行的修改:'));
  console.log(chalk.cyan('1. 在 CloudflareProvider 中替换 createNamedTunnel 方法:'));
  console.log(chalk.gray('   将 spawn("cloudflared", ["tunnel", "create", tunnelName])'));
  console.log(chalk.gray('   替换为使用 this.commandBuilder.buildCreateCommand(tunnelName)'));
  
  console.log(chalk.cyan('2. 在 configureNamedTunnelDNS 方法中:'));
  console.log(chalk.gray('   将 spawn("cloudflared", ["tunnel", "route", "dns", tunnelId, domain])'));
  console.log(chalk.gray('   替换为使用 this.commandBuilder.buildRouteCommand(tunnelId, domain)'));
  
  console.log(chalk.cyan('3. 在所有使用 cloudflared 命令的地方:'));
  console.log(chalk.gray('   确保使用统一的命令构建器而不是硬编码命令数组'));

  console.log(chalk.cyan('4. 添加增强的认证方法（已准备好代码片段）'));

  // 输出具体的代码修改建议
  console.log(chalk.yellow('📋 4. 具体代码修改建议:'));
  
  const createTunnelFix = `
  // 修复 createNamedTunnel 方法
  async createNamedTunnel(tunnelName) {
    return new Promise((resolve, reject) => {
      // 生成配置文件（基础配置）
      this.commandBuilder.generateConfigFile();
      
      // 使用统一命令构建器
      const createCommand = this.commandBuilder.buildCreateCommand(tunnelName);
      const createTunnel = spawn(createCommand[0], createCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // ... 其余逻辑保持不变
    });
  }`;

  const routeDnsFix = `
  // 修复 configureNamedTunnelDNS 方法
  async configureNamedTunnelDNS(tunnelId, domain) {
    return new Promise(async (resolve, reject) => {
      // 生成包含隧道ID的配置文件
      this.commandBuilder.generateConfigFile({ tunnelId });
      
      // 使用统一命令构建器
      const routeCommand = this.commandBuilder.buildRouteCommand(tunnelId, domain);
      const routeDns = spawn(routeCommand[0], routeCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // ... 其余逻辑保持不变
    });
  }`;

  console.log(chalk.gray('创建隧道方法修复:'));
  console.log(createTunnelFix);
  
  console.log(chalk.gray('DNS路由配置方法修复:'));
  console.log(routeDnsFix);

  console.log(chalk.green('\n✅ 认证和配置管理修复准备完成'));
  console.log(chalk.blue('主要改进:'));
  console.log(chalk.gray('  • 统一的cloudflared命令构建器'));
  console.log(chalk.gray('  • 所有命令统一使用--config参数'));
  console.log(chalk.gray('  • 自动生成和管理config.yml文件'));
  console.log(chalk.gray('  • 增强的认证状态检查'));
  console.log(chalk.gray('  • 证书和API Token协同工作'));

} catch (error) {
  console.error(chalk.red('❌ 修复过程中出现错误:'), error.message);
  process.exit(1);
}