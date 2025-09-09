#!/usr/bin/env node

/**
 * MVP: Unified Cloudflared Command Builder
 * 统一的 cloudflared 命令构建器 - 确保所有命令都使用 --config 参数
 * 基于任务76分析报告的要求实现
 */

import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';

class CloudflaredCommandBuilder {
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
      console.log(chalk.gray(`📁 创建配置目录: ${this.configDir}`));
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
   * @param {Object} options 配置选项
   * @param {string} options.tunnelId 隧道ID（可选）
   * @param {Array} options.ingress Ingress规则（可选）
   */
  generateConfigFile(options = {}) {
    this.ensureConfigDirectory();

    const config = {};

    // 添加隧道ID（如果提供）
    if (options.tunnelId) {
      config.tunnel = options.tunnelId;
    }

    // 添加凭据文件路径
    if (this.hasCertificate()) {
      config.credentials_file = this.certPath;
    }

    // 添加ingress规则（如果提供）
    if (options.ingress && options.ingress.length > 0) {
      config.ingress = options.ingress;
    } else if (options.tunnelId) {
      // 默认的ingress规则
      config.ingress = [
        {
          service: 'http_status:404'
        }
      ];
    }

    // 写入配置文件
    const yamlContent = yaml.dump(config, { indent: 2 });
    writeFileSync(this.configFile, yamlContent);
    
    console.log(chalk.green(`✅ 配置文件已生成: ${this.configFile}`));
    console.log(chalk.gray('配置内容:'));
    console.log(chalk.gray(yamlContent));

    return this.configFile;
  }

  /**
   * 构建统一的cloudflared命令
   * @param {Array} baseCommand 基础命令数组，如 ['tunnel', 'create', 'my-tunnel']
   * @param {Object} options 选项
   */
  buildCommand(baseCommand, options = {}) {
    const command = ['cloudflared'];

    // 总是添加 --config 参数（如果配置文件存在）
    if (existsSync(this.configFile)) {
      command.push('--config', this.configFile);
    }

    // 添加基础命令
    command.push(...baseCommand);

    console.log(chalk.blue(`🔧 构建命令: ${command.join(' ')}`));
    return command;
  }

  /**
   * 构建登录命令
   */
  buildLoginCommand() {
    // 登录命令不需要配置文件，因为它是生成配置文件的前置步骤
    const command = ['cloudflared', 'tunnel', 'login'];
    console.log(chalk.blue(`🔧 构建登录命令: ${command.join(' ')}`));
    return command;
  }

  /**
   * 构建隧道创建命令
   * @param {string} tunnelName 隧道名称
   */
  buildCreateCommand(tunnelName) {
    return this.buildCommand(['tunnel', 'create', tunnelName]);
  }

  /**
   * 构建DNS路由命令
   * @param {string} tunnelId 隧道ID
   * @param {string} domain 域名
   */
  buildRouteCommand(tunnelId, domain) {
    return this.buildCommand(['tunnel', 'route', 'dns', tunnelId, domain]);
  }

  /**
   * 构建隧道运行命令
   * @param {string} tunnelId 隧道ID（可选，如果配置文件中已指定）
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
   * @param {string} tunnelId 隧道ID
   */
  buildDeleteCommand(tunnelId) {
    return this.buildCommand(['tunnel', 'delete', tunnelId]);
  }

  /**
   * 构建隧道列表命令
   */
  buildListCommand() {
    return this.buildCommand(['tunnel', 'list']);
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath() {
    return this.configFile;
  }

  /**
   * 清理配置文件
   */
  cleanupConfig() {
    if (existsSync(this.configFile)) {
      unlinkSync(this.configFile);
      console.log(chalk.yellow(`🗑️  已删除配置文件: ${this.configFile}`));
    }
  }
}

// MVP测试代码
async function testCommandBuilder() {
  console.log(chalk.blue('🧪 测试统一的 Cloudflared 命令构建器'));
  console.log(chalk.blue('='.repeat(50)));

  const builder = new CloudflaredCommandBuilder();

  // 1. 测试登录命令
  console.log(chalk.yellow('\n📋 1. 测试登录命令构建'));
  const loginCmd = builder.buildLoginCommand();
  console.log(chalk.cyan(`命令: ${loginCmd.join(' ')}`));

  // 2. 测试配置文件生成
  console.log(chalk.yellow('\n📋 2. 测试配置文件生成'));
  const configPath = builder.generateConfigFile({
    tunnelId: 'test-tunnel-id-12345',
    ingress: [
      { hostname: 'app.example.com', service: 'http://localhost:8000' },
      { service: 'http_status:404' }
    ]
  });

  // 3. 测试各种命令构建
  console.log(chalk.yellow('\n📋 3. 测试各种命令构建'));
  
  const createCmd = builder.buildCreateCommand('my-test-tunnel');
  console.log(chalk.cyan(`创建命令: ${createCmd.join(' ')}`));

  const routeCmd = builder.buildRouteCommand('tunnel-id-123', 'app.example.com');
  console.log(chalk.cyan(`路由命令: ${routeCmd.join(' ')}`));

  const runCmd = builder.buildRunCommand();
  console.log(chalk.cyan(`运行命令: ${runCmd.join(' ')}`));

  const deleteCmd = builder.buildDeleteCommand('tunnel-id-123');
  console.log(chalk.cyan(`删除命令: ${deleteCmd.join(' ')}`));

  const listCmd = builder.buildListCommand();
  console.log(chalk.cyan(`列表命令: ${listCmd.join(' ')}`));

  // 4. 验证配置文件内容
  console.log(chalk.yellow('\n📋 4. 验证配置文件'));
  console.log(chalk.green(`配置文件位置: ${configPath}`));

  // 5. 清理测试配置
  console.log(chalk.yellow('\n📋 5. 清理测试配置'));
  builder.cleanupConfig();

  console.log(chalk.green('\n✅ 统一命令构建器测试完成'));
  console.log(chalk.blue('主要特性:'));
  console.log(chalk.gray('  • 所有cloudflared命令统一使用--config参数'));
  console.log(chalk.gray('  • 自动生成包含tunnel ID和ingress规则的config.yml'));
  console.log(chalk.gray('  • 检查cert.pem存在性并自动添加credentials_file'));
  console.log(chalk.gray('  • 提供标准化的命令构建接口'));
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testCommandBuilder().catch(console.error);
}

export { CloudflaredCommandBuilder };