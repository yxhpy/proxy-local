import { spawn } from 'child_process';
import chalk from 'chalk';
import { CloudflareAuth } from './cloudflare-auth.js';

/**
 * Cloudflare DNS 调试工具
 * 用于诊断命名隧道 DNS 路由配置失败的具体原因
 */
export class CloudflareDnsDebug {
  constructor(auth = null) {
    this.auth = auth || new CloudflareAuth();
  }

  /**
   * 增强的 DNS 路由配置函数（带详细日志）
   */
  async debugConfigureNamedTunnelDNS(tunnelId, domain) {
    console.log(chalk.blue('🔍 开始 DNS 路由配置调试...'));
    console.log(chalk.gray(`隧道 ID: ${tunnelId}`));
    console.log(chalk.gray(`目标域名: ${domain}`));
    console.log('');

    return new Promise((resolve, reject) => {
      const command = 'cloudflared';
      const args = ['tunnel', 'route', 'dns', tunnelId, domain];
      
      console.log(chalk.cyan(`执行命令: ${command} ${args.join(' ')}`));
      console.log('');

      const routeDns = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';

      // 捕获标准输出
      routeDns.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutData += text;
        console.log(chalk.green('[STDOUT]'), text.trim());
      });

      // 捕获标准错误
      routeDns.stderr.on('data', (data) => {
        const text = data.toString();
        stderrData += text;
        console.log(chalk.red('[STDERR]'), text.trim());
      });

      routeDns.on('close', (code) => {
        console.log('');
        console.log(chalk.yellow(`进程退出码: ${code}`));
        console.log(chalk.gray('--- 输出总结 ---'));
        console.log(chalk.gray(`STDOUT: ${stdoutData.trim() || '(无输出)'}`));
        console.log(chalk.gray(`STDERR: ${stderrData.trim() || '(无输出)'}`));
        console.log('');

        if (code === 0) {
          console.log(chalk.green('✅ DNS 路由配置成功'));
          resolve({
            success: true,
            code,
            stdout: stdoutData,
            stderr: stderrData
          });
        } else {
          console.log(chalk.red(`❌ DNS 路由配置失败 (退出码: ${code})`));
          
          // 分析具体错误
          const errorAnalysis = this.analyzeError(code, stdoutData, stderrData);
          console.log(chalk.yellow('🔍 错误分析:'));
          console.log(chalk.gray(`  问题类型: ${errorAnalysis.type}`));
          console.log(chalk.gray(`  可能原因: ${errorAnalysis.reason}`));
          console.log(chalk.gray(`  建议解决: ${errorAnalysis.suggestion}`));
          
          resolve({
            success: false,
            code,
            stdout: stdoutData,
            stderr: stderrData,
            analysis: errorAnalysis
          });
        }
      });

      routeDns.on('error', (err) => {
        console.error(chalk.red(`❌ 进程启动失败: ${err.message}`));
        resolve({
          success: false,
          error: err.message,
          analysis: {
            type: 'process_error',
            reason: '无法启动 cloudflared 进程',
            suggestion: '检查 cloudflared 是否正确安装'
          }
        });
      });

      // 超时处理
      setTimeout(() => {
        if (!routeDns.killed) {
          console.log(chalk.yellow('⏰ 命令执行超时，正在终止...'));
          routeDns.kill();
          resolve({
            success: false,
            code: -1,
            stdout: stdoutData,
            stderr: stderrData,
            analysis: {
              type: 'timeout',
              reason: '命令执行超时',
              suggestion: '检查网络连接或增加超时时间'
            }
          });
        }
      }, 30000); // 30秒超时
    });
  }

  /**
   * 分析错误输出并提供诊断信息
   */
  analyzeError(exitCode, stdout, stderr) {
    const combinedOutput = (stdout + stderr).toLowerCase();

    // DNS 记录冲突 - 优先检查，因为这是最常见的问题
    if (combinedOutput.includes('already exists') ||
        combinedOutput.includes('record exists') ||
        combinedOutput.includes('duplicate') ||
        combinedOutput.includes('record with that host already exists')) {
      return {
        type: 'conflict_error',
        reason: 'DNS 记录冲突：该域名已存在 A、AAAA 或 CNAME 记录',
        suggestion: '需要删除现有 DNS 记录或更新现有记录指向新的隧道'
      };
    }

    // Zone 不存在错误
    if (combinedOutput.includes('zone not found') ||
        combinedOutput.includes('invalid zone') ||
        combinedOutput.includes('zone does not exist')) {
      return {
        type: 'zone_error',
        reason: '域名对应的 Cloudflare Zone 不存在',
        suggestion: '检查域名是否已添加到 Cloudflare 账户'
      };
    }

    // 权限相关错误
    if (combinedOutput.includes('unauthorized') || 
        combinedOutput.includes('permission denied') ||
        combinedOutput.includes('forbidden')) {
      return {
        type: 'permission_error',
        reason: 'API 令牌权限不足',
        suggestion: '确保 API 令牌具有 Zone:DNS:Edit 权限'
      };
    }

    // 认证相关错误
    if (combinedOutput.includes('login required') ||
        combinedOutput.includes('not authenticated') ||
        combinedOutput.includes('cert.pem')) {
      return {
        type: 'auth_error',
        reason: '认证信息缺失或过期',
        suggestion: '检查 API 令牌配置或重新设置认证'
      };
    }

    // 网络错误
    if (combinedOutput.includes('connection refused') ||
        combinedOutput.includes('timeout') ||
        combinedOutput.includes('context deadline exceeded') ||
        combinedOutput.includes('network')) {
      return {
        type: 'network_error',
        reason: '网络连接超时或不稳定',
        suggestion: '检查网络连接，稍后重试，或尝试使用 Cloudflare API 直接创建记录'
      };
    }

    // 隧道相关错误
    if (combinedOutput.includes('tunnel not found') ||
        combinedOutput.includes('invalid tunnel')) {
      return {
        type: 'tunnel_error',
        reason: '隧道 ID 无效或隧道不存在',
        suggestion: '验证隧道 ID 是否正确'
      };
    }

    // 通用错误
    return {
      type: 'unknown_error',
      reason: '未知错误',
      suggestion: '查看完整的错误输出日志以获取更多信息'
    };
  }

  /**
   * 验证 API 令牌权限
   */
  async checkApiTokenPermissions(domain) {
    try {
      console.log(chalk.blue('🔍 检查 API 令牌权限...'));
      
      const token = await this.auth.getValidCloudflareToken();
      if (!token) {
        return {
          valid: false,
          reason: '未找到有效的 API 令牌'
        };
      }

      // 尝试获取域名对应的 Zone 信息
      const domainParts = domain.split('.');
      const rootDomain = domainParts.length >= 2 
        ? domainParts.slice(-2).join('.')
        : domain;

      console.log(chalk.gray(`检查根域名: ${rootDomain}`));

      const response = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return {
          valid: false,
          reason: `API 请求失败: ${response.status} ${response.statusText}`
        };
      }

      const data = await response.json();
      
      if (!data.success) {
        return {
          valid: false,
          reason: `API 错误: ${data.errors?.map(e => e.message).join(', ') || '未知错误'}`
        };
      }

      if (!data.result || data.result.length === 0) {
        return {
          valid: false,
          reason: `域名 ${rootDomain} 未在当前 Cloudflare 账户中找到`
        };
      }

      const zone = data.result[0];
      console.log(chalk.green(`✅ 找到 Zone: ${zone.name} (ID: ${zone.id})`));

      return {
        valid: true,
        zone: zone,
        rootDomain: rootDomain
      };

    } catch (error) {
      return {
        valid: false,
        reason: `权限检查失败: ${error.message}`
      };
    }
  }

  /**
   * 完整的诊断流程
   */
  async diagnoseTunnelDnsIssue(tunnelId, domain) {
    console.log(chalk.blue('🔍 开始完整的 DNS 路由诊断...'));
    console.log(chalk.gray('=' .repeat(50)));
    console.log('');

    // 步骤1: 检查 API 令牌权限
    console.log(chalk.yellow('📋 步骤 1: 检查 API 令牌权限'));
    const permissionCheck = await this.checkApiTokenPermissions(domain);
    
    if (!permissionCheck.valid) {
      console.log(chalk.red(`❌ 权限检查失败: ${permissionCheck.reason}`));
      return { success: false, step: 'permission_check', reason: permissionCheck.reason };
    }
    
    console.log(chalk.green('✅ API 令牌权限检查通过'));
    console.log('');

    // 步骤2: 尝试执行 DNS 路由配置
    console.log(chalk.yellow('📋 步骤 2: 执行 DNS 路由配置'));
    const dnsResult = await this.debugConfigureNamedTunnelDNS(tunnelId, domain);
    
    return {
      success: dnsResult.success,
      permissionCheck,
      dnsResult,
      recommendation: this.generateRecommendation(permissionCheck, dnsResult)
    };
  }

  /**
   * 检查并处理现有 DNS 记录
   */
  async handleExistingDnsRecord(domain) {
    try {
      console.log(chalk.blue(`🔍 检查域名 ${domain} 的现有 DNS 记录...`));
      
      const token = await this.auth.getValidCloudflareToken();
      if (!token) {
        throw new Error('无法获取有效的 API 令牌');
      }

      // 获取根域名和Zone ID
      const domainParts = domain.split('.');
      const rootDomain = domainParts.length >= 2 ? domainParts.slice(-2).join('.') : domain;
      
      // 获取Zone信息
      const zoneResponse = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!zoneResponse.ok) {
        throw new Error(`API 请求失败: ${zoneResponse.status} ${zoneResponse.statusText}`);
      }
      
      const zoneData = await zoneResponse.json();
      if (!zoneData.success || !zoneData.result.length) {
        return { found: false, reason: `域名 ${rootDomain} 未在 Cloudflare 账户中找到` };
      }
      
      const zoneId = zoneData.result[0].id;
      console.log(chalk.gray(`找到 Zone: ${rootDomain} (ID: ${zoneId})`));
      
      // 查找现有的DNS记录
      const recordResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${domain}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!recordResponse.ok) {
        throw new Error(`API 请求失败: ${recordResponse.status} ${recordResponse.statusText}`);
      }
      
      const recordData = await recordResponse.json();
      if (!recordData.success) {
        throw new Error(`查询 DNS 记录失败: ${recordData.errors?.map(e => e.message).join(', ')}`);
      }
      
      if (recordData.result.length > 0) {
        const existingRecord = recordData.result[0];
        console.log(chalk.yellow(`⚠️ 发现现有记录: ${existingRecord.type} ${existingRecord.name} → ${existingRecord.content}`));
        
        return {
          found: true,
          record: existingRecord,
          zoneId: zoneId,
          canUpdate: existingRecord.type === 'CNAME' || existingRecord.type === 'A' || existingRecord.type === 'AAAA'
        };
      } else {
        console.log(chalk.green(`✅ 域名 ${domain} 无现有记录，可以创建新记录`));
        return { found: false, zoneId: zoneId };
      }
      
    } catch (error) {
      console.error(chalk.red(`检查现有记录时出错: ${error.message}`));
      return { found: false, error: error.message };
    }
  }

  /**
   * 更新现有 DNS 记录指向新隧道
   */
  async updateExistingRecord(record, zoneId, tunnelId) {
    try {
      console.log(chalk.blue('🔄 更新现有 DNS 记录指向新隧道...'));
      
      const token = await this.auth.getValidCloudflareToken();
      const tunnelHostname = `${tunnelId}.cfargotunnel.com`;
      
      const updateData = {
        type: 'CNAME',
        name: record.name,
        content: tunnelHostname,
        ttl: 300,
        comment: `Updated by uvx-proxy-local - ${new Date().toISOString()}`
      };
      
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      if (result.success) {
        console.log(chalk.green(`✅ 成功更新 DNS 记录: ${record.name} → ${tunnelHostname}`));
        return { success: true, record: result.result };
      } else {
        throw new Error(`更新记录失败: ${result.errors?.map(e => e.message).join(', ')}`);
      }
      
    } catch (error) {
      console.error(chalk.red(`更新 DNS 记录失败: ${error.message}`));
      return { success: false, error: error.message };
    }
  }

  /**
   * 智能处理 DNS 记录冲突
   */
  async handleDnsConflict(tunnelId, domain) {
    console.log(chalk.blue('🛠️ 开始智能处理 DNS 记录冲突...'));
    
    const existingRecord = await this.handleExistingDnsRecord(domain);
    
    if (existingRecord.error) {
      return { success: false, reason: existingRecord.error };
    }
    
    if (!existingRecord.found) {
      return { success: false, reason: '未发现现有记录，但仍然出现冲突错误' };
    }
    
    if (existingRecord.canUpdate) {
      console.log(chalk.yellow('🔄 尝试更新现有记录...'));
      const updateResult = await this.updateExistingRecord(existingRecord.record, existingRecord.zoneId, tunnelId);
      return updateResult;
    } else {
      return {
        success: false,
        reason: `现有记录类型 ${existingRecord.record.type} 无法自动更新，需要手动处理`
      };
    }
  }

  /**
   * 生成修复建议
   */
  generateRecommendation(permissionCheck, dnsResult) {
    if (dnsResult.success) {
      return '✅ DNS 路由配置成功，无需进一步操作';
    }

    const recommendations = ['❌ DNS 路由配置失败，建议采取以下措施：'];
    
    if (dnsResult.analysis) {
      recommendations.push(`• ${dnsResult.analysis.suggestion}`);
      
      if (dnsResult.analysis.type === 'conflict_error') {
        recommendations.push('• 🔧 可以尝试以下解决方案：');
        recommendations.push('  1. 使用 Cloudflare 仪表板删除现有记录');
        recommendations.push('  2. 运行智能修复工具自动更新现有记录');
        recommendations.push('  3. 使用不同的子域名（如 gemini2.yxhpy.xyz）');
      }
      
      if (dnsResult.analysis.type === 'permission_error') {
        recommendations.push('• 检查 API 令牌是否包含以下权限：');
        recommendations.push('  - Zone:Zone:Read');
        recommendations.push('  - Zone:DNS:Edit');
        recommendations.push('  - Account:Cloudflare Tunnel:Edit');
      }
      
      if (dnsResult.analysis.type === 'zone_error') {
        recommendations.push(`• 确认域名 ${permissionCheck?.rootDomain} 已添加到 Cloudflare`);
        recommendations.push('• 检查域名 NS 记录是否指向 Cloudflare');
      }
    }

    recommendations.push('• 如问题持续，可以尝试使用 Cloudflare API 直接创建 CNAME 记录');
    
    return recommendations.join('\n');
  }
}