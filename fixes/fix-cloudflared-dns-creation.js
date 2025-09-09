#!/usr/bin/env node

/**
 * 修复CloudFlare DNS记录创建缺失问题
 * 
 * 问题分析：
 * - debug脚本显示DNS解析失败，gemini.yxhpy.xyz域名无法解析
 * - 分析代码发现问题出在cloudflare.js第283-365行的configureNamedTunnelDNS方法
 * - 该方法只使用了cloudflared tunnel route dns命令，但没有使用API直接创建DNS记录
 * - 当cloudflared tunnel route dns失败时，虽然有智能冲突解决，但没有确保DNS记录被正确创建
 * 
 * 修复方案：
 * 1. 在configureNamedTunnelDNS方法中添加DNS记录创建逻辑
 * 2. 当cloudflared命令失败后，使用CloudFlare API直接创建CNAME记录
 * 3. 确保DNS记录指向正确的tunnel ID
 */

import fs from 'fs';
import path from 'path';

const CLOUDFLARE_JS_PATH = './src/providers/cloudflare.js';

console.log('🔧 修复CloudFlare DNS记录创建逻辑...');

// 读取原始文件
const originalContent = fs.readFileSync(CLOUDFLARE_JS_PATH, 'utf8');

// 查找需要修复的方法
const methodStart = originalContent.indexOf('async configureNamedTunnelDNS(tunnelId, domain)');
const methodEnd = originalContent.indexOf('}\n', originalContent.indexOf('});', methodStart)) + 1;

if (methodStart === -1 || methodEnd === -1) {
  console.error('❌ 无法找到configureNamedTunnelDNS方法');
  process.exit(1);
}

console.log(`📍 找到方法位置: ${methodStart} - ${methodEnd}`);

// 修复后的方法实现
const fixedMethod = `
  /**
   * 为命名隧道配置 DNS（增强版，支持冲突处理和API直接创建）
   */
  async configureNamedTunnelDNS(tunnelId, domain) {
    return new Promise(async (resolve, reject) => {
      console.log(chalk.blue(\`🌐 为隧道 \${tunnelId} 配置DNS: \${domain}\`));
      
      // 第一步：尝试使用 cloudflared tunnel route dns 命令
      console.log(chalk.gray('🔄 步骤1：尝试 cloudflared tunnel route dns...'));
      
      const routeDns = spawn('cloudflared', ['tunnel', 'route', 'dns', tunnelId, domain], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let routeDnsTimeout;
      let stdoutOutput = '';
      let stderrOutput = '';

      // 收集输出信息用于错误分析
      routeDns.stdout.on('data', (data) => {
        stdoutOutput += data.toString();
      });

      routeDns.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      routeDns.on('close', async (code) => {
        if (code === 0) {
          console.log(chalk.green(\`✅ DNS 路由配置成功: \${domain}\`));
          resolve(true);
        } else {
          console.log(chalk.yellow(\`⚠️ cloudflared DNS 路由配置失败 (exit code: \${code})\`));
          
          if (stderrOutput.trim()) {
            console.log(chalk.yellow(\`错误详情: \${stderrOutput.trim()}\`));
          }
          
          // 第二步：尝试智能解决DNS冲突
          const isDnsConflict = this._isDnsConflictError(stderrOutput);
          
          if (isDnsConflict) {
            console.log(chalk.blue('🔍 检测到 DNS 记录冲突，尝试智能解决...'));
            
            try {
              clearTimeout(routeDnsTimeout);
              const smartResolveResult = await this._smartResolveDnsConflict(tunnelId, domain);
              
              if (smartResolveResult) {
                console.log(chalk.green('✅ DNS 冲突智能解决成功'));
                resolve(true);
                return;
              }
            } catch (error) {
              console.log(chalk.red(\`❌ DNS 冲突智能解决失败: \${error.message}\`));
            }
          }
          
          // 第三步：直接使用API创建DNS记录（修复关键点）
          console.log(chalk.blue('🔄 步骤3：使用 CloudFlare API 直接创建DNS记录...'));
          
          try {
            const apiSuccess = await this._createDnsRecordViaAPI(tunnelId, domain);
            if (apiSuccess) {
              console.log(chalk.green('✅ API DNS记录创建成功'));
              resolve(true);
            } else {
              console.log(chalk.red('❌ API DNS记录创建失败'));
              resolve(false);
            }
          } catch (apiError) {
            console.log(chalk.red(\`❌ API DNS记录创建异常: \${apiError.message}\`));
            resolve(false);
          }
        }
      });

      routeDns.on('error', async () => {
        console.log(chalk.red('❌ cloudflared DNS 路由命令执行失败'));
        
        // 直接尝试API创建
        console.log(chalk.blue('🔄 回退：使用 CloudFlare API 创建DNS记录...'));
        try {
          const apiSuccess = await this._createDnsRecordViaAPI(tunnelId, domain);
          resolve(apiSuccess);
        } catch (apiError) {
          console.log(chalk.red(\`❌ API回退失败: \${apiError.message}\`));
          resolve(false);
        }
      });

      // 设置初始超时
      routeDnsTimeout = setTimeout(async () => {
        if (!routeDns.killed) {
          console.log(chalk.yellow('⏰ cloudflared DNS 配置超时，尝试API创建...'));
          routeDns.kill();
          
          try {
            const apiSuccess = await this._createDnsRecordViaAPI(tunnelId, domain);
            resolve(apiSuccess);
          } catch (apiError) {
            console.log(chalk.red(\`❌ API超时回退失败: \${apiError.message}\`));
            resolve(false);
          }
        }
      }, 15000); // 增加到15秒超时
    });
  }

  /**
   * 使用CloudFlare API直接创建DNS记录（新增方法）
   * @private
   */
  async _createDnsRecordViaAPI(tunnelId, domain) {
    try {
      console.log(chalk.blue(\`🔧 使用API为隧道 \${tunnelId} 创建CNAME记录: \${domain}\`));
      
      // 检查是否有有效的API令牌
      const hasValidToken = await this.auth.ensureValidToken();
      if (!hasValidToken) {
        throw new Error('缺少有效的 CloudFlare API 令牌');
      }
      
      // 构建CNAME记录内容
      const cnameTarget = \`\${tunnelId}.cfargotunnel.com\`;
      console.log(chalk.gray(\`📝 CNAME记录: \${domain} -> \${cnameTarget}\`));
      
      // 使用域名管理器的upsertDnsRecord方法
      const result = await this.domainManager.upsertDnsRecord(domain, cnameTarget, {
        type: 'CNAME',
        ttl: 300,
        proxied: false, // 重要：隧道记录不能开启代理
        comment: \`Created by uvx for tunnel \${tunnelId}\`
      });
      
      if (result && (result.action === 'created' || result.action === 'updated')) {
        console.log(chalk.green(\`✅ DNS记录\${result.action === 'created' ? '创建' : '更新'}成功: \${result.message}\`));
        
        // 等待DNS传播
        console.log(chalk.blue('⏳ 等待DNS记录传播...'));
        await this._sleep(3000);
        
        // 验证DNS记录
        const verified = await this._verifyDnsRecord(domain, cnameTarget);
        if (verified) {
          console.log(chalk.green('✅ DNS记录验证成功'));
          return true;
        } else {
          console.log(chalk.yellow('⚠️ DNS记录创建但验证失败，可能需要更长传播时间'));
          return true; // 仍然返回true，因为记录已创建
        }
      } else {
        throw new Error(\`DNS记录操作失败: \${result?.message || '未知错误'}\`);
      }
      
    } catch (error) {
      console.log(chalk.red(\`❌ API创建DNS记录失败: \${error.message}\`));
      return false;
    }
  }

  /**
   * 验证DNS记录是否正确创建
   * @private
   */
  async _verifyDnsRecord(domain, expectedTarget, maxRetries = 3) {
    const dns = require('dns').promises;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(chalk.gray(\`🔍 验证DNS记录 (第\${attempt}次): \${domain}\`));
        
        const cnameRecords = await dns.resolveCname(domain);
        
        if (cnameRecords && cnameRecords.length > 0) {
          const actualTarget = cnameRecords[0];
          
          if (actualTarget === expectedTarget) {
            console.log(chalk.green(\`✅ DNS记录验证成功: \${domain} -> \${actualTarget}\`));
            return true;
          } else {
            console.log(chalk.yellow(\`⚠️ DNS记录不匹配：期望 \${expectedTarget}，实际 \${actualTarget}\`));
          }
        } else {
          console.log(chalk.yellow(\`⚠️ 未找到CNAME记录 (第\${attempt}次)\`));
        }
        
        if (attempt < maxRetries) {
          console.log(chalk.blue(\`⏳ 等待2秒后重试...\`));
          await this._sleep(2000);
        }
        
      } catch (error) {
        if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
          console.log(chalk.yellow(\`⚠️ DNS解析失败 (第\${attempt}次): 域名未找到或无记录\`));
        } else {
          console.log(chalk.yellow(\`⚠️ DNS验证失败 (第\${attempt}次): \${error.message}\`));
        }
        
        if (attempt < maxRetries) {
          await this._sleep(2000);
        }
      }
    }
    
    console.log(chalk.red(\`❌ 经过\${maxRetries}次尝试，DNS记录验证失败\`));
    return false;
  }
`;

// 替换原始方法
const beforeMethod = originalContent.substring(0, methodStart);
const afterMethod = originalContent.substring(methodEnd);
const newContent = beforeMethod + fixedMethod.trim() + '\n' + afterMethod;

// 写入修复后的文件
fs.writeFileSync(CLOUDFLARE_JS_PATH, newContent, 'utf8');

console.log('✅ CloudFlare DNS创建逻辑修复完成');

// 验证修复
const verifyContent = fs.readFileSync(CLOUDFLARE_JS_PATH, 'utf8');
if (verifyContent.includes('_createDnsRecordViaAPI')) {
  console.log('✅ 修复验证成功：新增API创建方法已添加');
} else {
  console.error('❌ 修复验证失败：未找到新增方法');
  process.exit(1);
}

if (verifyContent.includes('步骤3：使用 CloudFlare API 直接创建DNS记录')) {
  console.log('✅ 修复验证成功：增强的DNS配置逻辑已添加');
} else {
  console.error('❌ 修复验证失败：增强逻辑未正确添加');
  process.exit(1);
}

console.log('');
console.log('🎉 修复完成！现在隧道创建时会：');
console.log('1. 首先尝试 cloudflared tunnel route dns 命令');
console.log('2. 如失败，尝试智能解决DNS冲突');
console.log('3. 最后使用CloudFlare API直接创建DNS记录');
console.log('4. 验证DNS记录是否正确创建');
console.log('');
console.log('💡 建议现在重新测试隧道创建功能');