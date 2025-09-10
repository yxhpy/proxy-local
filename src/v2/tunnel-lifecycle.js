import { spawn } from 'child_process';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { EnhancedLogger } from '../utils/enhanced-logger.js';
import { CloudflaredCommandBuilder } from '../utils/cloudflared-command-builder.js';
import { CloudflaredErrorParser } from '../utils/cloudflared-error-parser.js';

/**
 * V2隧道生命周期管理器
 * 专门负责cloudflared进程的完整生命周期管理
 * 基于任务73的成功经验，提供健壮的进程监控和自动恢复
 */
export class TunnelLifecycle {
  constructor(configManager) {
    this.configManager = configManager;
    this.logger = new EnhancedLogger('TunnelLifecycle-V2');
    this.commandBuilder = new CloudflaredCommandBuilder();
    this.errorParser = new CloudflaredErrorParser();
    
    // 进程管理状态
    this.tunnelProcess = null;
    this.currentTunnel = null;
    this.processStatus = 'stopped'; // stopped, starting, running, stopping, error
    
    // 配置信息
    this.configFile = null;
    this.tunnelConfig = null;
    
    // 监控和恢复机制
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.restartDelay = 5000; // 5秒
    this.healthCheckInterval = null;
    this.lastHealthCheck = null;
    
    // 清理处理器
    this.cleanupHandlers = new Set();
    
    this.setupProcessExitHandlers();
  }

  /**
   * 创建并启动隧道的完整流程
   * @param {Object} options - 隧道配置选项
   * @param {number} options.port - 本地端口
   * @param {string} options.tunnelName - 隧道名称（可选）
   * @param {string} options.domain - 自定义域名（可选）
   * @returns {Promise<Object>} 隧道信息
   */
  async createAndStartTunnel(options) {
    const { port, tunnelName, domain } = options;
    
    this.logger.logStep('创建隧道', `开始创建隧道流程`, { port, tunnelName, domain });
    
    try {
      this.processStatus = 'starting';
      
      // 检查是否已有隧道在运行
      if (this.tunnelProcess && !this.tunnelProcess.killed) {
        this.logger.logWarning('检测到现有隧道进程，将先停止');
        await this.stopTunnel();
      }
      
      let tunnel;
      
      if (tunnelName && domain) {
        // 创建命名隧道（持久化）
        tunnel = await this.createNamedTunnel(tunnelName, domain, port);
      } else {
        // 创建临时隧道
        tunnel = await this.createQuickTunnel(port);
      }
      
      if (!tunnel) {
        throw new Error('隧道创建失败');
      }
      
      this.currentTunnel = tunnel;
      this.processStatus = 'running';
      
      // 启动健康检查
      this.startHealthCheck();
      
      this.logger.logStep('隧道启动成功', `隧道已成功启动`, tunnel);
      
      return tunnel;
      
    } catch (error) {
      this.processStatus = 'error';
      this.logger.logError('隧道创建失败', error);
      
      // 清理失败的创建尝试
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 创建命名隧道（持久化）
   * @param {string} tunnelName - 隧道名称
   * @param {string} domain - 域名
   * @param {number} port - 本地端口
   * @returns {Promise<Object>} 隧道信息
   */
  async createNamedTunnel(tunnelName, domain, port) {
    this.logger.logStep('创建命名隧道', `${tunnelName} -> ${domain}:${port}`);
    
    // 步骤1: 创建隧道
    const tunnelId = await this.createTunnelId(tunnelName);
    if (!tunnelId) {
      throw new Error(`无法创建隧道: ${tunnelName}`);
    }
    
    // 步骤2: 生成配置文件
    this.configFile = await this.generateTunnelConfig(tunnelId, domain, port);
    
    // 步骤3: 启动隧道进程（使用--config参数，任务73的关键修复）
    const process = await this.startTunnelProcess(tunnelId, { useConfig: true });
    
    const tunnelInfo = {
      type: 'named',
      tunnelId,
      tunnelName,
      domain,
      port,
      url: `https://${domain}`,
      configFile: this.configFile,
      process,
      createdAt: new Date().toISOString()
    };
    
    // 保存隧道信息到配置管理器
    this.configManager.saveTunnelInfo(tunnelId, tunnelInfo);
    
    return tunnelInfo;
  }

  /**
   * 创建临时隧道（快速隧道）
   * @param {number} port - 本地端口
   * @returns {Promise<Object>} 隧道信息
   */
  async createQuickTunnel(port) {
    this.logger.logStep('创建临时隧道', `端口: ${port}`);
    
    // 临时备份配置文件以避免干扰快速隧道
    const configBackup = await this.backupConfigForQuickTunnel();
    
    return new Promise((resolve, reject) => {
      const quickCommand = ['cloudflared', 'tunnel', '--url', `http://localhost:${port}`];
      
      this.logger.logCommand(quickCommand[0], quickCommand.slice(1));
      
      const process = spawn(quickCommand[0], quickCommand.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });
      
      this.tunnelProcess = process;
      let tunnelUrl = null;
      let resolved = false;
      
      // 监听stdout获取隧道URL
      process.stdout.on('data', (data) => {
        const output = data.toString();
        this.logger.logDebug('cloudflared stdout', output);
        
        // 解析隧道URL
        const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !tunnelUrl) {
          tunnelUrl = urlMatch[0];
          
          if (!resolved) {
            resolved = true;
            const tunnelInfo = {
              type: 'quick',
              tunnelId: randomUUID(),
              port,
              url: tunnelUrl,
              process,
              createdAt: new Date().toISOString()
            };
            
            // 恢复配置文件后再解析
            this.restoreConfigAfterQuickTunnel(configBackup).finally(() => {
              resolve(tunnelInfo);
            });
          }
        }
      });
      
      // 监听stderr获取错误信息和隧道URL
      process.stderr.on('data', (data) => {
        const output = data.toString();
        this.logger.logDebug('cloudflared stderr', output);
        
        // 在stderr中也尝试解析隧道URL（快速隧道URL通常在stderr输出）
        if (!tunnelUrl) {
          const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (urlMatch) {
            tunnelUrl = urlMatch[0];
            
            if (!resolved) {
              resolved = true;
              const tunnelInfo = {
                type: 'quick',
                tunnelId: randomUUID(),
                port,
                url: tunnelUrl,
                process,
                createdAt: new Date().toISOString()
              };
              
              resolve(tunnelInfo);
              return; // 找到URL后直接返回，避免错误处理
            }
          }
        }
        
        // 使用错误解析器分析错误
        const parsedError = this.errorParser.parseError(output, {
          operation: 'create_quick_tunnel',
          port
        });
        
        if (parsedError && parsedError.severity === 'fatal' && !resolved) {
          resolved = true;
          // 恢复配置文件后再拒绝
          this.restoreConfigAfterQuickTunnel(configBackup).finally(() => {
            reject(new Error(`临时隧道创建失败: ${parsedError.userMessage}`));
          });
        }
      });
      
      // 进程退出处理
      process.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          // 恢复配置文件后再拒绝
          this.restoreConfigAfterQuickTunnel(configBackup).finally(() => {
            if (code === 0) {
              reject(new Error('隧道进程意外退出'));
            } else {
              reject(new Error(`隧道创建失败，退出代码: ${code}`));
            }
          });
        }
      });
      
      // 进程错误处理
      process.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          // 恢复配置文件后再拒绝
          this.restoreConfigAfterQuickTunnel(configBackup).finally(() => {
            reject(new Error(`启动cloudflared失败: ${error.message}`));
          });
        }
      });
      
      // 超时处理
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          process.kill();
          // 恢复配置文件后再拒绝
          this.restoreConfigAfterQuickTunnel(configBackup).finally(() => {
            reject(new Error('隧道创建超时'));
          });
        }
      }, 30000); // 30秒超时
    });
  }

  /**
   * 创建隧道ID
   * @param {string} tunnelName - 隧道名称
   * @returns {Promise<string|null>} 隧道ID
   */
  async createTunnelId(tunnelName) {
    return new Promise((resolve) => {
      const createCommand = ['cloudflared', 'tunnel', 'create', tunnelName];
      
      this.logger.logCommand(createCommand[0], createCommand.slice(1));
      
      const createProcess = spawn(createCommand[0], createCommand.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let tunnelId = null;
      let errorOutput = '';
      
      createProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.logger.logDebug('tunnel create stdout', output);
        
        // 解析隧道ID
        const idMatch = output.match(/Created tunnel [\w-]+ with id ([a-f0-9-]{36})/);
        if (idMatch) {
          tunnelId = idMatch[1];
        }
      });
      
      createProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      createProcess.on('close', (code) => {
        if (code === 0 && tunnelId) {
          this.logger.logStep('隧道创建成功', `ID: ${tunnelId}`);
          resolve(tunnelId);
        } else {
          this.logger.logError('隧道ID创建失败', `退出代码: ${code}`);
          
          if (errorOutput) {
            const parsedError = this.errorParser.parseError(errorOutput, {
              operation: 'create_tunnel',
              tunnelName
            });
            
            if (parsedError) {
              this.logger.logError('创建失败详情', parsedError);
            }
          }
          
          resolve(null);
        }
      });
      
      createProcess.on('error', (error) => {
        this.logger.logError('cloudflared启动失败', error);
        resolve(null);
      });
    });
  }

  /**
   * 生成隧道配置文件
   * @param {string} tunnelId - 隧道ID
   * @param {string} domain - 域名
   * @param {number} port - 本地端口
   * @returns {Promise<string>} 配置文件路径
   */
  async generateTunnelConfig(tunnelId, domain, port) {
    const configDir = this.configManager.getConfigDir();
    const configPath = join(configDir, `tunnel-${tunnelId}.yml`);
    
    // 构建隧道凭证文件路径 (JSON文件，不是cert.pem)
    const credentialsPath = join(homedir(), '.cloudflared', `${tunnelId}.json`);
    
    const config = {
      tunnel: tunnelId,
      'credentials-file': credentialsPath,
      ingress: []
    };
    
    // 如果有域名，使用hostname规则；否则使用catch-all规则
    if (domain) {
      config.ingress.push({
        hostname: domain,
        service: `http://localhost:${port}`
      });
      // 添加catch-all规则
      config.ingress.push({
        service: 'http_status:404'
      });
    } else {
      // 临时隧道：只有一个规则，将所有流量路由到本地服务
      config.ingress.push({
        service: `http://localhost:${port}`
      });
    }
    
    // 将配置写入YAML文件
    const yamlContent = this.objectToYaml(config);
    
    this.logger.logDebug('生成隧道配置文件', { configPath, config });
    
    try {
      writeFileSync(configPath, yamlContent, 'utf8');
      this.configFile = configPath;
      
      this.logger.logStep('配置文件生成', `路径: ${configPath}`);
      return configPath;
      
    } catch (error) {
      this.logger.logError('配置文件生成失败', error);
      throw new Error(`无法生成配置文件: ${error.message}`);
    }
  }

  /**
   * 启动隧道进程
   * @param {string} tunnelId - 隧道ID
   * @param {Object} options - 启动选项
   * @returns {Promise<Object>} 进程对象
   */
  async startTunnelProcess(tunnelId, options = {}) {
    const { useConfig = false } = options;
    
    let runCommand;
    if (useConfig && this.configFile) {
      // 使用配置文件启动（任务73的关键修复）
      runCommand = ['cloudflared', 'tunnel', '--config', this.configFile, 'run'];
    } else {
      // 直接启动
      runCommand = ['cloudflared', 'tunnel', 'run', tunnelId];
    }
    
    this.logger.logCommand(runCommand[0], runCommand.slice(1));
    
    return new Promise((resolve, reject) => {
      const process = spawn(runCommand[0], runCommand.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });
      
      this.tunnelProcess = process;
      let processReady = false;
      
      // 监听stdout
      process.stdout.on('data', (data) => {
        const output = data.toString();
        this.logger.logDebug('tunnel run stdout', output.trim());
        
        // 检查隧道是否已准备就绪 - 匹配实际的cloudflared输出
        if ((output.includes('Registered tunnel connection') || 
             output.includes('Starting tunnel') ||
             (output.includes('Connection') && output.includes('registered'))) && !processReady) {
          processReady = true;
          this.logger.logStep('隧道连接就绪', '隧道进程已成功启动并注册');
          resolve(process);
        }
      });
      
      // 监听stderr
      process.stderr.on('data', (data) => {
        const output = data.toString();
        this.logger.logDebug('tunnel run stderr', output.trim());
        
        // 也在stderr中检查启动成功信号（cloudflared可能将日志输出到stderr）
        if ((output.includes('Registered tunnel connection') || 
             output.includes('Starting tunnel') ||
             (output.includes('Connection') && output.includes('registered'))) && !processReady) {
          processReady = true;
          this.logger.logStep('隧道连接就绪', '隧道进程已成功启动并注册（从stderr）');
          resolve(process);
          return;
        }
        
        const parsedError = this.errorParser.parseError(output, {
          operation: 'run_tunnel',
          tunnelId
        });
        
        if (parsedError && parsedError.severity === 'fatal') {
          if (!processReady) {
            reject(new Error(`隧道启动失败: ${parsedError.userMessage}`));
          }
        }
      });
      
      // 进程退出处理
      process.on('close', (code) => {
        this.processStatus = 'stopped';
        this.logger.logStep('进程退出', `隧道进程退出，代码: ${code}`);
        
        if (!processReady) {
          reject(new Error(`隧道进程启动失败，退出代码: ${code}`));
        } else if (code !== 0) {
          // 非正常退出，触发重启逻辑
          this.handleProcessCrash(code);
        }
      });
      
      // 进程错误处理
      process.on('error', (error) => {
        this.processStatus = 'error';
        this.logger.logError('隧道进程错误', error);
        
        if (!processReady) {
          reject(error);
        }
      });
      
      // 启动超时
      setTimeout(() => {
        if (!processReady) {
          process.kill();
          reject(new Error('隧道进程启动超时'));
        }
      }, 45000); // 45秒超时
    });
  }

  /**
   * 停止隧道
   * @returns {Promise<void>}
   */
  async stopTunnel() {
    this.logger.logStep('停止隧道', '开始停止隧道进程');
    
    this.processStatus = 'stopping';
    
    // 停止健康检查
    this.stopHealthCheck();
    
    if (this.tunnelProcess && !this.tunnelProcess.killed) {
      return new Promise((resolve) => {
        const process = this.tunnelProcess;
        
        // 设置退出监听器
        const onExit = () => {
          this.logger.logStep('隧道已停止', '进程已成功终止');
          resolve();
        };
        
        process.once('close', onExit);
        process.once('exit', onExit);
        
        // 首先尝试优雅关闭
        process.kill('SIGTERM');
        
        // 如果5秒内没有关闭，强制杀死
        setTimeout(() => {
          if (!process.killed) {
            this.logger.logWarning('强制终止隧道进程');
            process.kill('SIGKILL');
          }
        }, 5000);
      });
    } else {
      this.logger.logStep('隧道停止', '没有运行的隧道进程');
    }
    
    this.processStatus = 'stopped';
    this.tunnelProcess = null;
    this.currentTunnel = null;
  }

  /**
   * 处理进程崩溃
   * @param {number} exitCode - 退出代码
   */
  handleProcessCrash(exitCode) {
    this.logger.logError('检测到隧道进程崩溃', `退出代码: ${exitCode}`);
    
    if (this.restartAttempts < this.maxRestartAttempts) {
      this.restartAttempts++;
      const delay = this.restartDelay * this.restartAttempts;
      
      this.logger.logStep('自动重启', `尝试第${this.restartAttempts}次重启，延迟${delay}ms`);
      
      setTimeout(async () => {
        try {
          if (this.currentTunnel) {
            await this.restartTunnel();
          }
        } catch (error) {
          this.logger.logError('自动重启失败', error);
        }
      }, delay);
    } else {
      this.logger.logError('超过最大重启尝试次数', `已尝试${this.maxRestartAttempts}次`);
      this.processStatus = 'error';
    }
  }

  /**
   * 重启隧道
   * @returns {Promise<void>}
   */
  async restartTunnel() {
    if (!this.currentTunnel) {
      throw new Error('没有可重启的隧道');
    }
    
    this.logger.logStep('重启隧道', '开始重启流程');
    
    const originalTunnel = { ...this.currentTunnel };
    
    try {
      // 停止当前进程
      if (this.tunnelProcess && !this.tunnelProcess.killed) {
        this.tunnelProcess.kill();
      }
      
      // 根据隧道类型重新创建
      let newTunnel;
      if (originalTunnel.type === 'named') {
        const process = await this.startTunnelProcess(originalTunnel.tunnelId, { useConfig: true });
        newTunnel = { ...originalTunnel, process };
      } else {
        newTunnel = await this.createQuickTunnel(originalTunnel.port);
      }
      
      this.currentTunnel = newTunnel;
      this.processStatus = 'running';
      this.restartAttempts = 0; // 重置重启计数
      
      this.logger.logStep('重启成功', '隧道已成功重启');
      
    } catch (error) {
      this.processStatus = 'error';
      this.logger.logError('重启失败', error);
      throw error;
    }
  }

  /**
   * 启动健康检查
   */
  startHealthCheck() {
    if (this.healthCheckInterval) {
      return;
    }
    
    this.logger.logDebug('启动健康检查', '间隔: 30秒');
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // 每30秒检查一次
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.logDebug('健康检查已停止');
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    if (!this.tunnelProcess || this.tunnelProcess.killed) {
      this.logger.logWarning('健康检查失败', '隧道进程不存在或已被杀死');
      this.handleProcessCrash(-1);
      return;
    }
    
    // 检查进程是否还在运行
    try {
      process.kill(this.tunnelProcess.pid, 0);
      this.lastHealthCheck = new Date().toISOString();
      this.logger.logDebug('健康检查通过', { pid: this.tunnelProcess.pid });
    } catch (error) {
      this.logger.logWarning('健康检查失败', '进程不存在');
      this.handleProcessCrash(-1);
    }
  }

  /**
   * 清理资源
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.logger.logStep('资源清理', '开始清理隧道资源');
    
    try {
      // 停止隧道
      await this.stopTunnel();
      
      // 清理配置文件
      if (this.configFile && existsSync(this.configFile)) {
        rmSync(this.configFile, { force: true });
        this.logger.logDebug('配置文件已清理', { configFile: this.configFile });
      }
      
      // 运行清理处理器
      for (const handler of this.cleanupHandlers) {
        try {
          await handler();
        } catch (error) {
          this.logger.logError('清理处理器执行失败', error);
        }
      }
      
      this.cleanupHandlers.clear();
      this.configFile = null;
      this.tunnelConfig = null;
      this.currentTunnel = null;
      
      this.logger.logStep('清理完成', '所有资源已清理');
      
    } catch (error) {
      this.logger.logError('清理过程中出错', error);
      throw error;
    }
  }

  /**
   * 添加清理处理器
   * @param {Function} handler - 清理处理函数
   */
  addCleanupHandler(handler) {
    this.cleanupHandlers.add(handler);
  }

  /**
   * 设置进程退出处理器
   */
  setupProcessExitHandlers() {
    const handleExit = async () => {
      this.logger.logStep('程序退出', '开始清理隧道资源');
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
    process.on('beforeExit', handleExit);
  }

  /**
   * 获取隧道状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      processStatus: this.processStatus,
      tunnel: this.currentTunnel ? {
        type: this.currentTunnel.type,
        tunnelId: this.currentTunnel.tunnelId,
        url: this.currentTunnel.url,
        port: this.currentTunnel.port
      } : null,
      process: this.tunnelProcess ? {
        pid: this.tunnelProcess.pid,
        killed: this.tunnelProcess.killed
      } : null,
      restartAttempts: this.restartAttempts,
      lastHealthCheck: this.lastHealthCheck,
      configFile: this.configFile
    };
  }

  /**
   * 将对象转换为YAML字符串
   * @param {Object} obj - 对象
   * @returns {string} YAML字符串
   */
  objectToYaml(obj, depth = 0) {
    const indent = '  '.repeat(depth);
    let yaml = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        yaml += `${indent}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            yaml += `${indent}  -`;
            let isFirst = true;
            for (const [itemKey, itemValue] of Object.entries(item)) {
              if (isFirst) {
                yaml += ` ${itemKey}: ${itemValue}\n`;
                isFirst = false;
              } else {
                yaml += `${indent}    ${itemKey}: ${itemValue}\n`;
              }
            }
          } else {
            yaml += `${indent}  - ${item}\n`;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        yaml += `${indent}${key}:\n`;
        yaml += this.objectToYaml(value, depth + 1);
      } else {
        yaml += `${indent}${key}: ${value}\n`;
      }
    }
    
    return yaml;
  }

  /**
   * 为快速隧道备份配置文件
   * 快速隧道不支持存在config.yaml文件，需要临时重命名
   * @returns {Promise<Object>} 备份信息
   */
  async backupConfigForQuickTunnel() {
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs/promises');
    
    const homeDir = os.homedir();
    const cloudflaredDir = path.join(homeDir, '.cloudflared');
    
    const configPaths = [
      path.join(cloudflaredDir, 'config.yml'),
      path.join(cloudflaredDir, 'config.yaml')
    ];
    
    const backupInfo = {
      backedUp: [],
      originalPaths: []
    };
    
    for (const configPath of configPaths) {
      try {
        await fs.access(configPath);
        
        // 文件存在，需要备份
        const backupPath = `${configPath}.quick-tunnel-backup`;
        await fs.rename(configPath, backupPath);
        
        backupInfo.backedUp.push(backupPath);
        backupInfo.originalPaths.push(configPath);
        
        this.logger.logDebug('配置文件备份', `${configPath} → ${backupPath}`);
        
      } catch (error) {
        // 文件不存在，忽略
        this.logger.logDebug('配置文件检查', `${configPath} 不存在，跳过备份`);
      }
    }
    
    if (backupInfo.backedUp.length > 0) {
      this.logger.logStep('配置文件备份', `已备份 ${backupInfo.backedUp.length} 个配置文件以避免快速隧道干扰`);
    }
    
    return backupInfo;
  }

  /**
   * 恢复快速隧道的配置文件备份
   * @param {Object} backupInfo - 备份信息
   * @returns {Promise<void>}
   */
  async restoreConfigAfterQuickTunnel(backupInfo) {
    if (!backupInfo || backupInfo.backedUp.length === 0) {
      return;
    }
    
    const fs = await import('fs/promises');
    
    for (let i = 0; i < backupInfo.backedUp.length; i++) {
      const backupPath = backupInfo.backedUp[i];
      const originalPath = backupInfo.originalPaths[i];
      
      try {
        await fs.rename(backupPath, originalPath);
        this.logger.logDebug('配置文件恢复', `${backupPath} → ${originalPath}`);
      } catch (error) {
        this.logger.logWarning('配置文件恢复失败', `${backupPath}: ${error.message}`);
      }
    }
    
    this.logger.logStep('配置文件恢复', `已恢复 ${backupInfo.backedUp.length} 个配置文件`);
  }
}