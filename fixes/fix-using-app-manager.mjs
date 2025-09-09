#!/usr/bin/env node

import { CloudflareDomainManager } from './src/utils/cloudflare-domain-manager.js';

/**
 * 使用应用的域名管理器修复DNS记录
 */

console.log('\x1b[34m🔧 使用应用域名管理器修复DNS记录...\x1b[0m');
console.log('');

const domain = 'gemini.yxhpy.xyz';
const oldTunnelId = 'e5ad4821-8510-4828-bbfe-ca7ffaa3ad62';
const correctTunnelId = '13365483-5ef8-46fa-bf2a-2211ec1977cd';
const newTarget = `${correctTunnelId}.cfargotunnel.com`;

async function fixDnsUsingAppManager() {
  try {
    console.log('\x1b[90m📋 步骤1: 初始化域名管理器...\x1b[0m');
    const domainManager = new CloudflareDomainManager();
    
    console.log(`\x1b[90m   目标域名: ${domain}\x1b[0m`);
    console.log(`\x1b[90m   当前目标: ${oldTunnelId}.cfargotunnel.com\x1b[0m`);
    console.log(`\x1b[90m   新目标: ${newTarget}\x1b[0m`);
    console.log('');

    console.log('\x1b[90m📋 步骤2: 更新DNS记录...\x1b[0m');
    console.log('\x1b[90m   使用域名管理器的upsertDnsRecord方法...\x1b[0m');
    
    // 使用域名管理器的方法更新DNS记录
    const result = await domainManager.upsertDnsRecord(domain, newTarget, {
      type: 'CNAME',
      proxied: false // 确保隧道不被代理
    });
    
    if (result) {
      console.log('\x1b[32m✅ DNS记录更新成功！\x1b[0m');
      console.log('');
      
      console.log('\x1b[90m📋 步骤3: 验证更新...\x1b[0m');
      await verifyDnsUpdate(domain, correctTunnelId);
      
      return true;
    } else {
      console.log('\x1b[31m❌ DNS记录更新失败\x1b[0m');
      return false;
    }
    
  } catch (error) {
    console.log('\x1b[31m❌ 修复过程中出现错误:\x1b[0m');
    console.log('\x1b[31m' + error.message + '\x1b[0m');
    console.log('\x1b[90m   错误堆栈:\x1b[0m', error.stack);
    return false;
  }
}

async function verifyDnsUpdate(domain, tunnelId) {
  const { spawn } = require('child_process');
  
  console.log('\x1b[90m   等待DNS传播和验证...\x1b[0m');
  
  return new Promise((resolve) => {
    setTimeout(() => {
      const dig = spawn('dig', [domain, 'CNAME']);
      let output = '';
      
      dig.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      dig.on('close', (code) => {
        if (output.includes(`${tunnelId}.cfargotunnel.com`)) {
          console.log('\x1b[32m✅ DNS记录验证成功 - 指向正确的隧道\x1b[0m');
        } else if (output.includes('cfargotunnel.com')) {
          console.log('\x1b[33m⚠️ DNS记录存在但可能需要更多时间传播\x1b[0m');
          console.log('\x1b[90m   当前解析结果:\x1b[0m');
          const lines = output.split('\n').filter(line => 
            line.includes('cfargotunnel.com') && !line.startsWith(';')
          );
          lines.forEach(line => {
            console.log(`\x1b[90m   ${line.trim()}\x1b[0m`);
          });
        } else {
          console.log('\x1b[33m⚠️ DNS记录需要更多时间传播\x1b[0m');
        }
        resolve();
      });
      
      dig.on('error', () => {
        console.log('\x1b[33m⚠️ 无法验证DNS记录\x1b[0m');
        resolve();
      });
    }, 3000);
  });
}

// 运行修复
fixDnsUsingAppManager().then((success) => {
  console.log('');
  if (success) {
    console.log('\x1b[32m🎉 DNS记录修复完成！\x1b[0m');
    console.log('');
    console.log('\x1b[33m💡 下一步操作:\x1b[0m');
    console.log('\x1b[90m1. 等待 5-10 分钟让DNS完全传播\x1b[0m');
    console.log('\x1b[90m2. 测试访问: curl -I https://gemini.yxhpy.xyz\x1b[0m');
    console.log('\x1b[90m3. 确保隧道配置了正确的ingress规则\x1b[0m');
    console.log('\x1b[90m4. 检查本地服务是否在运行\x1b[0m');
  } else {
    console.log('\x1b[31m❌ 自动修复失败\x1b[0m');
    console.log('');
    console.log('\x1b[33m💡 手动修复步骤:\x1b[0m');
    console.log('\x1b[90m1. 访问 https://dash.cloudflare.com\x1b[0m');
    console.log('\x1b[90m2. 选择域名 yxhpy.xyz\x1b[0m');
    console.log('\x1b[90m3. 进入 DNS 管理页面\x1b[0m');
    console.log(`\x1b[90m4. 找到记录 ${domain} 并编辑\x1b[0m`);
    console.log(`\x1b[90m5. 将目标改为: ${newTarget}\x1b[0m`);
    console.log('\x1b[90m6. 确保代理状态为"仅DNS"（灰色云朵）\x1b[0m');
    console.log('\x1b[90m7. 保存更改\x1b[0m');
  }
});