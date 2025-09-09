import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
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
    
    console.log(chalk.gray(`配置文件已生成: ${this.configFile}`));
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
