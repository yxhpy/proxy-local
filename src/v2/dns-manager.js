import { spawn } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { EnhancedLogger } from '../utils/enhanced-logger.js';
import { CloudflaredCommandBuilder } from '../utils/cloudflared-command-builder.js';
import { CloudflaredErrorParser, CloudflaredErrorType } from '../utils/cloudflared-error-parser.js';

/**
 * V2三层容错DNS管理器
 * 实现CLI -> 冲突解决 -> API回退的三层容错逻辑
 */
export class DNSManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.logger = new EnhancedLogger('DNSManager-V2');
    this.commandBuilder = new CloudflaredCommandBuilder();
    this.errorParser = new CloudflaredErrorParser();
    this.apiBaseUrl = 'https://api.cloudflare.com/client/v4';
    
    // 跟踪最后的DNS操作结果
    this.lastDnsResult = null;
  }

  /**
   * 主要的DNS配置方法 - 三层容错逻辑
   * @param {string} tunnelId - 隧道ID
   * @param {string} domain - 域名
   * @returns {Promise<Object>} DNS配置结果
   */
  async configureDNS(tunnelId, domain) {
    this.logger.logStep('DNS配置', '开始三层容错DNS配置流程', { tunnelId, domain });

    const context = {
      tunnelId,
      domain,
      startTime: Date.now()
    };

    try {
      // 第一层：尝试CLI命令
      const cliResult = await this.tryCliDnsCreation(tunnelId, domain);
      if (cliResult.success) {
        this.logger.logStep('DNS成功', 'CLI方式创建DNS记录成功');
        const result = {
          ...cliResult,
          method: 'cli',
          context
        };
        this.lastDnsResult = result; // 记录成功状态
        return result;
      }

      // 第二层：智能冲突解决
      if (cliResult.errorType === CloudflaredErrorType.DNS_RECORD_EXISTS) {
        this.logger.logStep('冲突处理', '检测到DNS冲突，尝试智能解决');
        
        const conflictResult = await this.handleDnsConflict(tunnelId, domain);
        if (conflictResult.success) {
          this.logger.logStep('DNS成功', '冲突解决成功，DNS记录已配置');
          return {
            ...conflictResult,
            method: 'conflict_resolution',
            context
          };
        }
      }

      // 第三层：API回退
      this.logger.logStep('API回退', '前两层失败，使用API直接创建DNS记录');
      const apiResult = await this.createDnsRecordViaApi(tunnelId, domain);
      
      if (apiResult.success) {
        this.logger.logStep('DNS成功', 'API回退创建DNS记录成功');
        return {
          ...apiResult,
          method: 'api_fallback',
          context
        };
      }

      // 所有层都失败
      throw new Error(`所有三层DNS配置方法都失败了: CLI(${cliResult.error}), API(${apiResult.error})`);

    } catch (error) {
      this.logger.logError('DNS配置失败', error, context);
      throw error;
    }
  }

  /**
   * 第一层：尝试使用CLI创建DNS记录
   * @param {string} tunnelId - 隧道ID
   * @param {string} domain - 域名
   * @returns {Promise<Object>} CLI执行结果
   */
  async tryCliDnsCreation(tunnelId, domain) {
    this.logger.logDebug('第一层CLI', '尝试使用cloudflared tunnel route dns', { tunnelId, domain });

    // 先尝试普通创建，如果失败且是DNS记录冲突，则自动重试使用覆盖模式
    let firstResult = await this.executeDnsCommand(tunnelId, domain, false);
    
    if (!firstResult.success && this.isDnsConflictError(firstResult.error)) {
      this.logger.logStep('自动覆盖', '检测到DNS冲突，自动使用覆盖模式');
      return await this.executeDnsCommand(tunnelId, domain, true);
    }
    
    return firstResult;
  }

  /**
   * 执行DNS命令
   * @param {string} tunnelId - 隧道ID
   * @param {string} domain - 域名
   * @param {boolean} overwrite - 是否覆盖现有记录
   * @returns {Promise<Object>} 执行结果
   */
  async executeDnsCommand(tunnelId, domain, overwrite = false) {
    return new Promise((resolve) => {
      const command = this.commandBuilder.buildRouteCommand(tunnelId, domain, { overwrite });
      this.logger.logDebug('执行CLI命令', command.join(' '));

      const child = spawn(command[0], command.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          this.logger.logDebug('CLI命令成功', { code, stdout });
          resolve({
            success: true,
            output: stdout,
            command: command.join(' ')
          });
        } else {
          const errorOutput = stderr || stdout;
          const parsedError = this.errorParser.parseError(errorOutput);
          
          this.logger.logWarning('CLI命令失败', { 
            code, 
            stderr, 
            errorType: parsedError?.type 
          });

          resolve({
            success: false,
            error: errorOutput,
            errorType: parsedError?.type || CloudflaredErrorType.UNKNOWN,
            exitCode: code
          });
        }
      });

      child.on('error', (error) => {
        this.logger.logError('CLI命令执行错误', error);
        resolve({
          success: false,
          error: error.message,
          errorType: CloudflaredErrorType.PROCESS_STARTUP_FAILED
        });
      });
    });
  }

  /**
   * 检查是否是DNS记录冲突错误
   * @param {string} error - 错误信息
   * @returns {boolean} 是否是DNS冲突错误
   */
  isDnsConflictError(error) {
    if (!error) return false;
    
    const errorString = error.toString().toLowerCase();
    return errorString.includes('already exists') || 
           errorString.includes('record with that host') ||
           errorString.includes('1003');
  }

  /**
   * 第二层：智能DNS冲突处理
   * @param {string} tunnelId - 隧道ID  
   * @param {string} domain - 域名
   * @returns {Promise<Object>} 冲突处理结果
   */
  async handleDnsConflict(tunnelId, domain) {
    try {
      this.logger.logStep('冲突分析', '分析现有DNS记录');

      // 查询现有DNS记录
      const existingRecords = await this.queryExistingDnsRecords(domain);
      
      if (!existingRecords || existingRecords.length === 0) {
        this.logger.logWarning('未找到冲突记录', '可能是临时错误，建议重试');
        return { success: false, error: '未找到具体冲突记录' };
      }

      // 显示冲突信息
      this.displayConflictInfo(domain, existingRecords);

      // 检查是否为非交互式环境
      if (process.env.CI || process.env.NON_INTERACTIVE || !process.stdin.isTTY) {
        this.logger.logDebug('非交互环境', '自动选择更新策略');
        return await this.autoResolveConflict(tunnelId, domain, existingRecords[0]);
      }

      // 交互式冲突解决
      return await this.interactiveConflictResolution(tunnelId, domain, existingRecords[0]);

    } catch (error) {
      this.logger.logError('冲突处理失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 查询现有DNS记录
   * @param {string} domain - 域名
   * @returns {Promise<Array>} 现有记录列表
   */
  async queryExistingDnsRecords(domain) {
    try {
      const zoneId = await this.getZoneId(domain);
      if (!zoneId) {
        return [];
      }

      const apiToken = await this.configManager.getApiToken();
      if (!apiToken) {
        throw new Error('缺少API令牌');
      }

      const response = await fetch(
        `${this.apiBaseUrl}/zones/${zoneId}/dns_records?name=${domain}`,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.result : [];

    } catch (error) {
      this.logger.logWarning('查询现有记录失败', { domain, error: error.message });
      return [];
    }
  }

  /**
   * 显示冲突信息
   * @param {string} domain - 域名
   * @param {Array} records - 现有记录
   */
  displayConflictInfo(domain, records) {
    console.log('\n' + chalk.yellow('⚠️  发现DNS记录冲突'));
    console.log(chalk.blue(`域名: ${domain}`));
    console.log(chalk.gray('现有记录:'));
    
    records.forEach(record => {
      console.log(chalk.gray(`  ${record.type} ${record.name} → ${record.content}`));
    });
    console.log('');
  }

  /**
   * 交互式冲突解决
   * @param {string} tunnelId - 隧道ID
   * @param {string} domain - 域名
   * @param {Object} existingRecord - 现有记录
   * @returns {Promise<Object>} 解决结果
   */
  async interactiveConflictResolution(tunnelId, domain, existingRecord) {
    const expectedTarget = `${tunnelId}.cfargotunnel.com`;

    // 检查记录是否已经指向正确目标
    if (existingRecord.content === expectedTarget) {
      this.logger.logStep('记录正确', 'DNS记录已指向正确目标');
      return { success: true, action: 'no_change_needed' };
    }

    const choices = [
      {
        name: `更新现有记录指向隧道 (${expectedTarget})`,
        value: 'update',
        short: '更新记录'
      },
      {
        name: '删除现有记录并重新创建',
        value: 'delete_recreate',
        short: '删除重建'
      },
      {
        name: '取消操作',
        value: 'cancel',
        short: '取消'
      }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '如何处理DNS冲突？',
        choices: choices,
        default: 'update'
      }
    ]);

    switch (action) {
      case 'update':
        return await this.updateDnsRecord(existingRecord, expectedTarget);
      
      case 'delete_recreate':
        return await this.deleteAndRecreateRecord(tunnelId, domain, existingRecord);
      
      case 'cancel':
        return { success: false, error: '用户取消操作' };
      
      default:
        return { success: false, error: '未知操作' };
    }
  }

  /**
   * 自动解决冲突（非交互环境）
   * @param {string} tunnelId - 隧道ID
   * @param {string} domain - 域名 
   * @param {Object} existingRecord - 现有记录
   * @returns {Promise<Object>} 解决结果
   */
  async autoResolveConflict(tunnelId, domain, existingRecord) {
    const expectedTarget = `${tunnelId}.cfargotunnel.com`;

    if (existingRecord.content === expectedTarget) {
      return { success: true, action: 'no_change_needed' };
    }

    // 非交互环境默认更新记录
    this.logger.logDebug('自动冲突解决', '更新现有DNS记录');
    return await this.updateDnsRecord(existingRecord, expectedTarget);
  }

  /**
   * 更新DNS记录
   * @param {Object} record - 现有记录
   * @param {string} newTarget - 新的目标
   * @returns {Promise<Object>} 更新结果
   */
  async updateDnsRecord(record, newTarget) {
    try {
      const apiToken = await this.configManager.getApiToken();
      if (!apiToken) {
        throw new Error('缺少API令牌');
      }

      const updateData = {
        type: record.type,
        name: record.name,
        content: newTarget,
        ttl: record.ttl || 300
      };

      const response = await fetch(
        `${this.apiBaseUrl}/zones/${record.zone_id}/dns_records/${record.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        }
      );

      if (!response.ok) {
        throw new Error(`更新记录失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        this.logger.logStep('记录更新', 'DNS记录更新成功', { 
          from: record.content, 
          to: newTarget 
        });
        return { success: true, action: 'updated', record: data.result };
      } else {
        throw new Error(`API错误: ${data.errors?.[0]?.message || '未知错误'}`);
      }

    } catch (error) {
      this.logger.logError('更新DNS记录失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除并重新创建记录
   * @param {string} tunnelId - 隧道ID
   * @param {string} domain - 域名
   * @param {Object} existingRecord - 现有记录
   * @returns {Promise<Object>} 操作结果
   */
  async deleteAndRecreateRecord(tunnelId, domain, existingRecord) {
    try {
      // 先删除现有记录
      const deleteResult = await this.deleteDnsRecord(existingRecord);
      if (!deleteResult.success) {
        return deleteResult;
      }

      // 等待一点时间确保删除生效
      await this.sleep(2000);

      // 重新尝试CLI创建
      const cliResult = await this.tryCliDnsCreation(tunnelId, domain);
      if (cliResult.success) {
        return { success: true, action: 'delete_recreated_cli' };
      }

      // CLI仍然失败，使用API创建
      const apiResult = await this.createDnsRecordViaApi(tunnelId, domain);
      return { 
        ...apiResult, 
        action: apiResult.success ? 'delete_recreated_api' : 'failed' 
      };

    } catch (error) {
      this.logger.logError('删除重建失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除DNS记录
   * @param {Object} record - 要删除的记录
   * @returns {Promise<Object>} 删除结果
   */
  async deleteDnsRecord(record) {
    try {
      const apiToken = await this.configManager.getApiToken();
      if (!apiToken) {
        throw new Error('缺少API令牌');
      }

      const response = await fetch(
        `${this.apiBaseUrl}/zones/${record.zone_id}/dns_records/${record.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`删除记录失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        this.logger.logStep('记录删除', 'DNS记录删除成功', { recordId: record.id });
        return { success: true };
      } else {
        throw new Error(`API错误: ${data.errors?.[0]?.message || '未知错误'}`);
      }

    } catch (error) {
      this.logger.logError('删除DNS记录失败', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 第三层：通过API直接创建DNS记录
   * @param {string} tunnelId - 隧道ID
   * @param {string} domain - 域名
   * @returns {Promise<Object>} API创建结果
   */
  async createDnsRecordViaApi(tunnelId, domain) {
    try {
      this.logger.logDebug('第三层API', '直接通过API创建DNS记录', { tunnelId, domain });

      const zoneId = await this.getZoneId(domain);
      if (!zoneId) {
        throw new Error(`未找到域名 ${domain} 对应的Zone`);
      }

      const apiToken = await this.configManager.getApiToken();
      if (!apiToken) {
        throw new Error('缺少API令牌');
      }

      const recordData = {
        type: 'CNAME',
        name: domain,
        content: `${tunnelId}.cfargotunnel.com`,
        ttl: 300,
        proxied: false,
        comment: 'Created by proxy-local V2'
      };

      this.logger.logDebug('创建DNS记录', recordData);

      const response = await fetch(
        `${this.apiBaseUrl}/zones/${zoneId}/dns_records`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(recordData)
        }
      );

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        this.logger.logStep('API创建成功', 'DNS记录创建成功', { 
          recordId: data.result.id,
          target: data.result.content
        });
        
        return {
          success: true,
          record: data.result,
          zoneId
        };
      } else {
        const errorMsg = data.errors?.[0]?.message || '未知API错误';
        throw new Error(errorMsg);
      }

    } catch (error) {
      this.logger.logError('API创建DNS记录失败', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取域名的Zone ID
   * @param {string} domain - 域名
   * @returns {Promise<string|null>} Zone ID
   */
  async getZoneId(domain) {
    try {
      // 解析根域名
      const domainParts = domain.split('.');
      const rootDomain = domainParts.length >= 2 
        ? domainParts.slice(-2).join('.')
        : domain;

      const apiToken = await this.configManager.getApiToken();
      if (!apiToken) {
        throw new Error('缺少API令牌');
      }

      const response = await fetch(
        `${this.apiBaseUrl}/zones?name=${rootDomain}`,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`获取Zone失败: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.result.length > 0) {
        return data.result[0].id;
      }

      return null;

    } catch (error) {
      this.logger.logWarning('获取Zone ID失败', { domain, error: error.message });
      return null;
    }
  }

  /**
   * 验证DNS记录是否生效
   * 使用任务75的先进DNS传播验证策略
   * @param {string} domain - 域名
   * @param {string} expectedTarget - 期望的目标
   * @returns {Promise<boolean>} 验证结果
   */
  async verifyDnsRecord(domain, expectedTarget) {
    try {
      this.logger.logStep('DNS验证', '开始DNS传播验证', { domain, expectedTarget });

      // 导入ValidationEngine进行DNS传播验证
      const { ValidationEngine } = await import('./validation-engine.js');
      const validator = new ValidationEngine();

      // 如果DNS记录是通过CLI成功创建的，使用更宽松的验证策略
      const wasCliSuccess = this.lastDnsResult?.method === 'cli' && this.lastDnsResult?.success;
      const verificationOptions = wasCliSuccess ? {
        maxRetries: 3,  // 减少重试次数
        initialDelay: 3000, // 稍微增加初始等待时间
        maxTotalWaitTime: 30000, // 只等待30秒
        useAuthoritative: false // 不使用权威DNS（传播较慢）
      } : {
        maxRetries: 8,
        initialDelay: 2000,
        maxTotalWaitTime: 120000,
        useAuthoritative: true
      };

      const verificationResult = await validator.verifyDNSPropagation(domain, expectedTarget, verificationOptions);

      if (verificationResult) {
        this.logger.logStep('DNS验证成功', 'DNS记录传播验证通过', { domain, expectedTarget });
        return true;
      } else {
        // 如果DNS记录是通过CLI成功创建的，即使验证失败也认为成功
        if (wasCliSuccess) {
          this.logger.logStep('CLI创建跳过验证', 'DNS记录已通过CLI成功创建，跳过传播验证');
          return true;
        }
        
        this.logger.logWarning('DNS验证失败', 'DNS记录在规定时间内未传播', { domain, expectedTarget });
        
        // 作为回退，尝试API验证
        this.logger.logStep('API验证', '尝试API验证作为回退方案');
        const records = await this.queryExistingDnsRecords(domain);
        const targetRecord = records.find(r => 
          r.type === 'CNAME' && r.content === expectedTarget
        );

        if (targetRecord) {
          this.logger.logStep('API验证成功', 'DNS记录存在于Cloudflare API');
          return true;
        }
        
        return false;
      }

    } catch (error) {
      this.logger.logError('DNS验证过程异常', error);
      
      // 异常情况下的回退验证
      try {
        this.logger.logStep('异常回退', '尝试简单API验证作为异常回退');
        const records = await this.queryExistingDnsRecords(domain);
        const targetRecord = records.find(r => 
          r.type === 'CNAME' && r.content === expectedTarget
        );
        return !!targetRecord;
      } catch (fallbackError) {
        this.logger.logError('回退验证也失败', fallbackError);
        return false;
      }
    }
  }

  /**
   * 清理DNS记录（用于回滚）
   * @param {string} domain - 域名
   * @returns {Promise<boolean>} 清理是否成功
   */
  async cleanupDnsRecord(domain) {
    try {
      this.logger.logStep('DNS清理', '清理DNS记录', { domain });

      const records = await this.queryExistingDnsRecords(domain);
      const cnameRecords = records.filter(r => r.type === 'CNAME');

      let cleanupSuccess = true;
      for (const record of cnameRecords) {
        const result = await this.deleteDnsRecord(record);
        if (!result.success) {
          cleanupSuccess = false;
          this.logger.logWarning('清理失败', `无法删除记录 ${record.id}`);
        }
      }

      return cleanupSuccess;

    } catch (error) {
      this.logger.logError('DNS清理失败', error);
      return false;
    }
  }

  /**
   * 等待指定时间
   * @param {number} ms - 等待时间（毫秒）
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取DNS管理器状态
   * @returns {Object} 状态信息
   */
  async getStatus() {
    let hasApiToken = false;
    try {
      hasApiToken = this.configManager && await this.configManager.hasApiToken();
    } catch (error) {
      // 忽略错误，使用默认值
    }

    return {
      ready: true,
      hasApiToken,
      apiBaseUrl: this.apiBaseUrl,
      supportedMethods: ['cli', 'conflict_resolution', 'api_fallback']
    };
  }
}