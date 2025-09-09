import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import dns from 'dns/promises';
import { CloudflaredCommandBuilder } from './cloudflared-command-builder.js';

/**
 * 原子化隧道生命周期管理器
 * 确保隧道操作要么完全成功要么安全回滚
 * 集成任务65和75的关键修复：API回退和权威DNS验证
 */
export class AtomicTunnelLifecycle {
  constructor(options = {}) {
    this.commandBuilder = new CloudflaredCommandBuilder();
    this.transactionLog = new Map(); // 事务日志
    this.rollbackStack = []; // 回滚栈
    
    // 集成外部依赖（用于API回退和DNS验证）
    this.authManager = options.authManager;
    this.domainManager = options.domainManager;
    this.errorParser = options.errorParser;
    this.logger = options.logger;
  }

  /**
   * 原子化创建命名隧道的完整流程
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
   * 集成任务65的API回退逻辑
   */
  async configureDnsWithRollback(tunnelId, domain, transactionId) {
    this.logger?.logStep('DNS路由配置', `${domain} -> ${tunnelId}.cfargotunnel.com`);

    // 步骤1: 尝试使用cloudflared tunnel route dns命令
    const routeCommandSuccess = await this.tryRouteCommand(tunnelId, domain);
    
    if (routeCommandSuccess) {
      // 成功：添加回滚动作
      this.addRollbackAction(transactionId, 'cleanup-dns', { tunnelId, domain });
      this.logger?.logSuccess('DNS路由配置', '使用cloudflared tunnel route dns成功');
      
      // 验证DNS配置（任务75的修复）
      const verified = await this.verifyDnsWithMultipleServers(domain, `${tunnelId}.cfargotunnel.com`);
      return verified;
    }

    // 步骤2: cloudflared命令失败，尝试API回退（任务65的修复）
    this.logger?.logWarning('cloudflared route dns失败，尝试API回退');
    console.log(chalk.yellow('⚠️ cloudflared tunnel route dns 失败，尝试使用API创建DNS记录...'));
    
    if (!this.domainManager || !this.authManager) {
      this.logger?.logError('API回退失败', new Error('缺少必要的依赖管理器'));
      console.log(chalk.red('❌ API回退失败：缺少域名管理器或认证管理器'));
      return false;
    }

    const apiSuccess = await this.createDnsRecordViaAPI(tunnelId, domain, transactionId);
    return apiSuccess;
  }

  /**
   * 尝试使用cloudflared tunnel route dns命令
   * @private
   */
  async tryRouteCommand(tunnelId, domain) {
    return new Promise((resolve) => {
      console.log(chalk.gray(`尝试cloudflared路由: ${domain} -> ${tunnelId}`));
      
      const routeCommand = this.commandBuilder.buildRouteCommand(tunnelId, domain);
      this.logger?.logCommand(routeCommand[0], routeCommand.slice(1));
      
      const routeProcess = spawn(routeCommand[0], routeCommand.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderrOutput = '';

      routeProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      routeProcess.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green(`✅ cloudflared DNS路由配置成功`));
          resolve(true);
        } else {
          // 使用错误解析器解析错误
          if (this.errorParser) {
            const parsedError = this.errorParser.parseError(stderrOutput, {
              operation: 'tunnel-route-dns',
              tunnelId,
              domain
            });
            
            if (parsedError) {
              this.errorParser.displayError(parsedError);
              this.logger?.logError('DNS路由失败', new Error(parsedError.userMessage?.description || stderrOutput));
            }
          }
          
          console.log(chalk.red(`❌ cloudflared DNS路由配置失败: ${stderrOutput}`));
          resolve(false);
        }
      });

      routeProcess.on('error', (err) => {
        console.log(chalk.red(`❌ DNS路由进程启动失败: ${err.message}`));
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
   * 使用CloudFlare API创建DNS记录（API回退，任务65）
   * @private
   */
  async createDnsRecordViaAPI(tunnelId, domain, transactionId) {
    try {
      console.log(chalk.blue(`🔧 使用API为隧道 ${tunnelId} 创建CNAME记录: ${domain}`));
      this.logger?.logStep('API DNS创建', `${domain} -> ${tunnelId}.cfargotunnel.com`);
      
      // 检查认证状态
      const hasValidToken = await this.authManager.ensureValidToken();
      if (!hasValidToken) {
        throw new Error('缺少有效的 CloudFlare API 令牌');
      }
      
      // 构建CNAME记录内容
      const cnameTarget = `${tunnelId}.cfargotunnel.com`;
      console.log(chalk.gray(`📝 CNAME记录: ${domain} -> ${cnameTarget}`));
      
      // 使用域名管理器创建DNS记录
      const result = await this.domainManager.upsertDnsRecord(domain, cnameTarget, {
        type: 'CNAME',
        ttl: 300,
        proxied: false,
        comment: `Created by atomic tunnel lifecycle for tunnel ${tunnelId}`
      });
      
      if (result && (result.action === 'created' || result.action === 'updated')) {
        console.log(chalk.green(`✅ DNS记录${result.action === 'created' ? '创建' : '更新'}成功: ${result.message}`));
        this.logger?.logSuccess('API DNS创建', result.message);
        
        // 添加回滚动作
        this.addRollbackAction(transactionId, 'cleanup-dns', { tunnelId, domain, method: 'api' });
        
        // 使用强化的DNS验证（任务75的修复）
        console.log(chalk.blue('🔍 开始强制性DNS记录验证...'));
        const verified = await this.verifyDnsWithMultipleServers(domain, cnameTarget);
        
        if (verified) {
          console.log(chalk.green('✅ DNS记录创建并验证成功'));
          return true;
        } else {
          console.log(chalk.red('❌ DNS记录创建但验证失败'));
          throw new Error('DNS记录验证失败，隧道无法正常工作');
        }
      } else {
        throw new Error(`DNS记录操作失败: ${result?.message || '未知错误'}`);
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ API创建DNS记录失败: ${error.message}`));
      this.logger?.logError('API DNS创建失败', error);
      return false;
    }
  }

  /**
   * 多DNS服务器验证（任务75的修复）
   * @private
   */
  async verifyDnsWithMultipleServers(domain, expectedTarget, maxRetries = 6, retryInterval = 5000) {
    console.log(chalk.blue(`🔍 开始强制性DNS记录验证: ${domain} -> ${expectedTarget}`));
    this.logger?.logStep('DNS多服务器验证', `${domain} -> ${expectedTarget}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(chalk.gray(`📋 验证轮次 ${attempt}/${maxRetries}: 多DNS服务器查询`));
        
        // 1. 使用多个DNS服务器进行验证
        const dnsServers = [
          { name: 'Cloudflare', server: '1.1.1.1' },
          { name: 'Google', server: '8.8.8.8' },
          { name: '系统默认', server: null }
        ];
        
        let successCount = 0;
        
        for (const { name, server } of dnsServers) {
          try {
            console.log(chalk.gray(`  🔍 查询${name}DNS服务器...`));
            
            let result;
            if (server) {
              const { Resolver } = await import('dns/promises');
              const resolver = new Resolver();
              resolver.setServers([server]);
              const cnameRecords = await resolver.resolveCname(domain);
              result = cnameRecords?.[0];
            } else {
              const cnameRecords = await dns.resolveCname(domain);
              result = cnameRecords?.[0];
            }
            
            if (result && result === expectedTarget) {
              console.log(chalk.green(`    ✅ ${name}: ${domain} -> ${result}`));
              successCount++;
            } else {
              console.log(chalk.yellow(`    ⚠️ ${name}: 记录不匹配或未找到`));
              console.log(chalk.gray(`       期望: ${expectedTarget}`));
              console.log(chalk.gray(`       实际: ${result || '未找到'}`));
            }
          } catch (dnsError) {
            console.log(chalk.yellow(`    ❌ ${name}: DNS查询失败 - ${dnsError.message}`));
          }
        }
        
        // 2. 如果至少2个DNS服务器验证成功，则认为成功
        if (successCount >= 2) {
          console.log(chalk.green(`✅ DNS记录验证成功！(${successCount}/3 DNS服务器确认)`));
          this.logger?.logSuccess('DNS验证', `${successCount}/3 DNS服务器确认成功`);
          
          // 3. 额外进行HTTP连通性测试
          console.log(chalk.blue('🌐 执行额外的HTTP连通性测试...'));
          const httpTest = await this.testHttpConnectivity(`https://${domain}`);
          
          if (httpTest.success) {
            console.log(chalk.green(`🎉 端到端连通性测试成功！响应时间: ${httpTest.responseTime}ms`));
            this.logger?.logSuccess('HTTP连通性测试', `响应时间: ${httpTest.responseTime}ms`);
            return true;
          } else {
            console.log(chalk.yellow(`⚠️ DNS已传播但HTTP连通性测试失败: ${httpTest.error}`));
            console.log(chalk.gray('这可能是因为隧道尚未完全建立，但DNS记录已正确创建'));
            this.logger?.logWarning('HTTP连通性测试失败', { error: httpTest.error });
            return true; // DNS记录验证成功，HTTP可能需要更长时间
          }
        }
        
        // 4. 如果验证失败且还有重试机会
        if (attempt < maxRetries) {
          const delay = retryInterval * attempt; // 递增延迟
          console.log(chalk.yellow(`⏳ DNS记录验证失败 (${successCount}/3)，${delay/1000}秒后重试...`));
          await this.sleep(delay);
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ 验证过程异常 (第${attempt}次): ${error.message}`));
        this.logger?.logError(`DNS验证异常 (第${attempt}次)`, error);
        
        if (attempt < maxRetries) {
          await this.sleep(retryInterval);
        }
      }
    }
    
    console.log(chalk.red(`❌ DNS记录验证最终失败，经过${maxRetries}次尝试`));
    console.log(chalk.yellow('💡 可能的原因:'));
    console.log(chalk.gray('   1. DNS记录未能成功创建'));
    console.log(chalk.gray('   2. API权限不足'));
    console.log(chalk.gray('   3. 域名配置错误'));
    console.log(chalk.gray('   4. DNS传播延迟过长'));
    
    this.logger?.logError('DNS验证最终失败', new Error(`经过${maxRetries}次尝试验证失败`));
    return false;
  }

  /**
   * 测试HTTP连通性
   * @private
   */
  async testHttpConnectivity(url) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const timeout = 10000; // 10秒超时
      
      const modules = import('https').then(({ default: https }) => {
        const req = https.get(url, { timeout }, (res) => {
          const responseTime = Date.now() - startTime;
          resolve({
            success: true,
            responseTime,
            statusCode: res.statusCode
          });
        });

        req.on('error', (error) => {
          resolve({
            success: false,
            error: error.message,
            responseTime: Date.now() - startTime
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            success: false,
            error: '连接超时',
            responseTime: Date.now() - startTime
          });
        });
      });

      modules.catch((error) => {
        resolve({
          success: false,
          error: `模块加载失败: ${error.message}`,
          responseTime: Date.now() - startTime
        });
      });
    });
  }

  /**
   * 睡眠函数
   * @private
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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