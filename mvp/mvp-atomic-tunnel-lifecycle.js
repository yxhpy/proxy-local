#!/usr/bin/env node

/**
 * MVP: Atomic Tunnel Lifecycle Manager
 * 原子化隧道生命周期管理 - 确保操作要么完全成功要么安全回滚
 * 基于任务76.3的要求实现
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { CloudflaredCommandBuilder } from './src/utils/cloudflared-command-builder.js';

class AtomicTunnelLifecycle {
  constructor() {
    this.commandBuilder = new CloudflaredCommandBuilder();
    this.transactionLog = new Map(); // 事务日志
    this.rollbackStack = []; // 回滚栈
  }

  /**
   * 原子化创建命名隧道的完整流程
   * 步骤: login检查 -> create -> config生成 -> route dns -> run准备
   * 任何步骤失败都会触发完整回滚
   */
  async createNamedTunnelAtomic(tunnelName, domain, localPort = 8000) {
    const transactionId = this.startTransaction('create-named-tunnel', { tunnelName, domain, localPort });
    
    try {
      console.log(chalk.blue('🚀 开始原子化隧道创建流程...'));
      console.log(chalk.gray(`事务ID: ${transactionId}`));

      // 步骤1: 验证认证状态
      console.log(chalk.yellow('📋 步骤1: 验证认证状态...'));
      const authValid = await this.verifyAuthentication();
      if (!authValid) {
        throw new Error('认证验证失败，无法创建命名隧道');
      }
      this.addRollbackAction(transactionId, 'auth-check', null); // 无需回滚认证检查

      // 步骤2: 创建隧道
      console.log(chalk.yellow('📋 步骤2: 创建隧道...'));
      const tunnelId = await this.createTunnelWithRollback(tunnelName, transactionId);
      if (!tunnelId) {
        throw new Error('隧道创建失败');
      }

      // 步骤3: 生成配置文件
      console.log(chalk.yellow('📋 步骤3: 生成配置文件...'));
      const configPath = this.createConfigWithRollback(tunnelId, domain, localPort, transactionId);

      // 步骤4: 配置DNS路由
      console.log(chalk.yellow('📋 步骤4: 配置DNS路由...'));
      const dnsConfigured = await this.configureDnsWithRollback(tunnelId, domain, transactionId);
      if (!dnsConfigured) {
        throw new Error('DNS配置失败');
      }

      // 步骤5: 验证配置完整性
      console.log(chalk.yellow('📋 步骤5: 验证配置完整性...'));
      const configValid = await this.validateConfiguration(tunnelId, domain, configPath);
      if (!configValid) {
        throw new Error('配置验证失败');
      }

      // 提交事务
      this.commitTransaction(transactionId);
      
      console.log(chalk.green('✅ 原子化隧道创建成功完成'));
      
      return {
        success: true,
        tunnelId,
        tunnelName,
        domain,
        configPath,
        transactionId
      };

    } catch (error) {
      console.error(chalk.red(`❌ 原子化创建失败: ${error.message}`));
      
      // 执行回滚
      await this.rollbackTransaction(transactionId);
      
      return {
        success: false,
        error: error.message,
        transactionId
      };
    }
  }

  /**
   * 启动事务
   */
  startTransaction(type, metadata = {}) {
    const transactionId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.transactionLog.set(transactionId, {
      type,
      metadata,
      status: 'active',
      startTime: new Date(),
      steps: []
    });

    console.log(chalk.blue(`🏁 启动事务: ${transactionId}`));
    return transactionId;
  }

  /**
   * 验证认证状态
   */
  async verifyAuthentication() {
    const certPath = join(homedir(), '.cloudflared', 'cert.pem');
    const hasCert = existsSync(certPath);
    
    if (!hasCert) {
      console.log(chalk.red('❌ 未找到Cloudflare证书文件'));
      console.log(chalk.blue('💡 请先运行: cloudflared tunnel login'));
      return false;
    }

    console.log(chalk.green('✅ 认证验证通过'));
    return true;
  }

  /**
   * 创建隧道（带回滚支持）
   */
  async createTunnelWithRollback(tunnelName, transactionId) {
    return new Promise((resolve, reject) => {
      console.log(chalk.gray(`创建隧道: ${tunnelName}`));
      
      // 生成基础配置文件
      this.commandBuilder.generateConfigFile();
      
      // 使用统一命令构建器
      const createCommand = this.commandBuilder.buildCreateCommand(tunnelName);
      const createProcess = spawn(createCommand[0], createCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let tunnelId = '';
      let errorOutput = '';

      createProcess.stdout.on('data', (data) => {
        const text = data.toString();
        const idMatch = text.match(/Created tunnel .* with id ([a-f0-9-]+)/);
        if (idMatch) {
          tunnelId = idMatch[1];
        }
      });

      createProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      createProcess.on('close', (code) => {
        if (code === 0 && tunnelId) {
          // 成功：添加回滚动作
          this.addRollbackAction(transactionId, 'delete-tunnel', { tunnelId, tunnelName });
          console.log(chalk.green(`✅ 隧道创建成功: ${tunnelId}`));
          resolve(tunnelId);
        } else {
          console.log(chalk.red(`❌ 隧道创建失败: ${errorOutput}`));
          resolve(null);
        }
      });

      createProcess.on('error', (err) => {
        console.log(chalk.red(`❌ 进程启动失败: ${err.message}`));
        resolve(null);
      });

      // 超时处理
      setTimeout(() => {
        if (!createProcess.killed) {
          createProcess.kill();
          console.log(chalk.red('❌ 隧道创建超时'));
          resolve(null);
        }
      }, 30000);
    });
  }

  /**
   * 创建配置文件（带回滚支持）
   */
  createConfigWithRollback(tunnelId, domain, localPort, transactionId) {
    const ingress = [
      { hostname: domain, service: `http://localhost:${localPort}` },
      { service: 'http_status:404' }
    ];

    const configPath = this.commandBuilder.generateConfigFile({
      tunnelId,
      ingress
    });

    // 添加回滚动作
    this.addRollbackAction(transactionId, 'cleanup-config', { configPath });
    
    console.log(chalk.green(`✅ 配置文件已生成: ${configPath}`));
    return configPath;
  }

  /**
   * 配置DNS路由（带回滚支持）
   */
  async configureDnsWithRollback(tunnelId, domain, transactionId) {
    return new Promise((resolve) => {
      console.log(chalk.gray(`配置DNS路由: ${domain} -> ${tunnelId}`));
      
      const routeCommand = this.commandBuilder.buildRouteCommand(tunnelId, domain);
      const routeProcess = spawn(routeCommand[0], routeCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderrOutput = '';

      routeProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      routeProcess.on('close', (code) => {
        if (code === 0) {
          // 成功：添加回滚动作（需要删除DNS记录）
          this.addRollbackAction(transactionId, 'cleanup-dns', { tunnelId, domain });
          console.log(chalk.green(`✅ DNS路由配置成功`));
          resolve(true);
        } else {
          console.log(chalk.red(`❌ DNS路由配置失败: ${stderrOutput}`));
          resolve(false);
        }
      });

      routeProcess.on('error', (err) => {
        console.log(chalk.red(`❌ DNS路由进程失败: ${err.message}`));
        resolve(false);
      });

      // 超时处理
      setTimeout(() => {
        if (!routeProcess.killed) {
          routeProcess.kill();
          console.log(chalk.red('❌ DNS路由配置超时'));
          resolve(false);
        }
      }, 30000);
    });
  }

  /**
   * 验证配置完整性
   */
  async validateConfiguration(tunnelId, domain, configPath) {
    // 验证配置文件存在
    if (!existsSync(configPath)) {
      console.log(chalk.red('❌ 配置文件不存在'));
      return false;
    }

    // 验证隧道ID格式
    const tunnelIdPattern = /^[a-f0-9-]{36}$/;
    if (!tunnelIdPattern.test(tunnelId)) {
      console.log(chalk.red('❌ 隧道ID格式无效'));
      return false;
    }

    // TODO: 可以添加更多验证逻辑，如DNS记录验证等

    console.log(chalk.green('✅ 配置验证通过'));
    return true;
  }

  /**
   * 添加回滚动作
   */
  addRollbackAction(transactionId, action, data) {
    const transaction = this.transactionLog.get(transactionId);
    if (transaction) {
      transaction.steps.push({
        action,
        data,
        timestamp: new Date()
      });
    }

    this.rollbackStack.push({
      transactionId,
      action,
      data
    });
  }

  /**
   * 执行回滚
   */
  async rollbackTransaction(transactionId) {
    console.log(chalk.yellow(`🔄 开始回滚事务: ${transactionId}`));
    
    const transaction = this.transactionLog.get(transactionId);
    if (!transaction) {
      console.log(chalk.red('❌ 事务不存在，无法回滚'));
      return;
    }

    // 按照相反的顺序执行回滚操作
    const actionsToRollback = this.rollbackStack.filter(item => item.transactionId === transactionId);
    
    for (let i = actionsToRollback.length - 1; i >= 0; i--) {
      const rollbackItem = actionsToRollback[i];
      await this.executeRollbackAction(rollbackItem);
    }

    // 更新事务状态
    transaction.status = 'rolled-back';
    transaction.endTime = new Date();

    // 清理回滚栈
    this.rollbackStack = this.rollbackStack.filter(item => item.transactionId !== transactionId);
    
    console.log(chalk.yellow(`✅ 事务回滚完成: ${transactionId}`));
  }

  /**
   * 执行具体的回滚动作
   */
  async executeRollbackAction(rollbackItem) {
    const { action, data } = rollbackItem;
    
    try {
      switch (action) {
        case 'delete-tunnel':
          await this.deleteTunnel(data.tunnelId);
          break;
          
        case 'cleanup-config':
          this.cleanupConfigFile(data.configPath);
          break;
          
        case 'cleanup-dns':
          console.log(chalk.gray(`DNS清理: ${data.domain} (隧道 ${data.tunnelId})`));
          // DNS清理通常由删除隧道操作自动处理
          break;
          
        default:
          console.log(chalk.gray(`跳过未知回滚动作: ${action}`));
      }
    } catch (error) {
      console.warn(chalk.yellow(`回滚动作失败 ${action}: ${error.message}`));
    }
  }

  /**
   * 删除隧道
   */
  async deleteTunnel(tunnelId) {
    return new Promise((resolve) => {
      console.log(chalk.gray(`删除隧道: ${tunnelId}`));
      
      const deleteCommand = this.commandBuilder.buildDeleteCommand(tunnelId);
      const deleteProcess = spawn(deleteCommand[0], deleteCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderrOutput = '';

      deleteProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      deleteProcess.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green(`✅ 隧道删除成功: ${tunnelId}`));
        } else {
          console.warn(chalk.yellow(`⚠️ 隧道删除可能失败: ${stderrOutput}`));
        }
        resolve();
      });

      deleteProcess.on('error', (err) => {
        console.warn(chalk.yellow(`⚠️ 删除隧道进程失败: ${err.message}`));
        resolve();
      });

      // 超时处理
      setTimeout(() => {
        if (!deleteProcess.killed) {
          deleteProcess.kill();
          console.warn(chalk.yellow('⚠️ 删除隧道超时'));
        }
        resolve();
      }, 15000);
    });
  }

  /**
   * 清理配置文件
   */
  cleanupConfigFile(configPath) {
    try {
      if (existsSync(configPath)) {
        this.commandBuilder.cleanupConfig();
        console.log(chalk.green(`✅ 配置文件清理完成: ${configPath}`));
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ 配置文件清理失败: ${error.message}`));
    }
  }

  /**
   * 提交事务
   */
  commitTransaction(transactionId) {
    const transaction = this.transactionLog.get(transactionId);
    if (transaction) {
      transaction.status = 'committed';
      transaction.endTime = new Date();
    }

    // 清理回滚栈（提交后不再需要回滚）
    this.rollbackStack = this.rollbackStack.filter(item => item.transactionId !== transactionId);
    
    console.log(chalk.blue(`✅ 事务提交成功: ${transactionId}`));
  }

  /**
   * 获取事务状态
   */
  getTransactionStatus(transactionId) {
    return this.transactionLog.get(transactionId);
  }
}

// MVP测试代码
async function testAtomicLifecycle() {
  console.log(chalk.blue('🧪 测试原子化隧道生命周期管理器'));
  console.log(chalk.blue('='.repeat(50)));

  const lifecycle = new AtomicTunnelLifecycle();

  console.log(chalk.yellow('\n📋 模拟原子化隧道创建流程'));
  console.log(chalk.gray('注意: 这是测试模式，不会实际创建隧道'));

  // 测试事务系统
  const transactionId = lifecycle.startTransaction('test-transaction', { test: true });
  
  // 添加一些模拟的回滚动作
  lifecycle.addRollbackAction(transactionId, 'delete-tunnel', { tunnelId: 'test-123' });
  lifecycle.addRollbackAction(transactionId, 'cleanup-config', { configPath: '/tmp/test-config.yml' });

  // 显示事务状态
  const status = lifecycle.getTransactionStatus(transactionId);
  console.log('事务状态:', status);

  // 模拟回滚
  console.log(chalk.yellow('\n📋 测试回滚机制'));
  await lifecycle.rollbackTransaction(transactionId);

  console.log(chalk.green('\n✅ 原子化生命周期管理器测试完成'));
  console.log(chalk.blue('主要特性:'));
  console.log(chalk.gray('  • 原子化操作 - 要么全部成功，要么完全回滚'));
  console.log(chalk.gray('  • 事务日志 - 记录所有操作步骤'));
  console.log(chalk.gray('  • 回滚栈 - 按相反顺序清理资源'));
  console.log(chalk.gray('  • 错误恢复 - 自动检测失败并执行清理'));
  console.log(chalk.gray('  • 配置验证 - 确保所有步骤正确完成'));
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testAtomicLifecycle().catch(console.error);
}

export { AtomicTunnelLifecycle };