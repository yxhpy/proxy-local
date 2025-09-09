#!/usr/bin/env node

const { spawn } = require('child_process');
const https = require('https');
const { promisify } = require('util');
const dns = require('dns');

/**
 * Comprehensive DNS diagnosis script for gemini.yxhpy.xyz
 */

console.log('\x1b[34m🔍 开始诊断 gemini.yxhpy.xyz DNS配置问题...\x1b[0m');
console.log('');

const dnsLookup = promisify(dns.lookup);
const dnsResolveCname = promisify(dns.resolveCname);

async function diagnoseDNSConfiguration() {
  const domain = 'gemini.yxhpy.xyz';
  const tunnelId = 'e5ad4821-8510-4828-bbfe-ca7ffaa3ad62';
  const expectedTarget = `${tunnelId}.cfargotunnel.com`;
  
  try {
    // 1. 基础域名解析检查
    console.log('\x1b[90m📋 步骤1: 基础域名解析检查...\x1b[0m');
    await checkBasicDomainResolution(domain);
    console.log('');
    
    // 2. 检查域名的nameserver配置
    console.log('\x1b[90m📋 步骤2: 检查域名的nameserver配置...\x1b[0m');
    await checkNameservers(domain);
    console.log('');
    
    // 3. 检查现有DNS记录
    console.log('\x1b[90m📋 步骤3: 检查现有DNS记录...\x1b[0m');
    await checkExistingDnsRecords(domain);
    console.log('');
    
    // 4. 测试直接DNS查询
    console.log('\x1b[90m📋 步骤4: 测试多种DNS查询方法...\x1b[0m');
    await testDnsQueries(domain, expectedTarget);
    console.log('');
    
    // 5. 生成诊断报告
    console.log('\x1b[34m📊 生成诊断报告...\x1b[0m');
    generateDnsReport(domain, expectedTarget);
    
  } catch (error) {
    console.log('\x1b[31m❌ 诊断过程中发生错误:\x1b[0m');
    console.log('\x1b[31m' + error.message + '\x1b[0m');
  }
}

async function checkBasicDomainResolution(domain) {
  try {
    // 检查根域名
    const rootDomain = domain.split('.').slice(-2).join('.');
    console.log(`\x1b[90m    检查根域名: ${rootDomain}\x1b[0m`);
    
    try {
      const addresses = await dnsLookup(rootDomain);
      console.log(`\x1b[32m    ✅ 根域名解析成功: ${addresses.address}\x1b[0m`);
    } catch (err) {
      console.log(`\x1b[31m    ❌ 根域名解析失败: ${err.message}\x1b[0m`);
    }
    
    // 检查子域名
    console.log(`\x1b[90m    检查子域名: ${domain}\x1b[0m`);
    try {
      const addresses = await dnsLookup(domain);
      console.log(`\x1b[32m    ✅ 子域名解析成功: ${addresses.address}\x1b[0m`);
    } catch (err) {
      console.log(`\x1b[33m    ⚠️ 子域名解析失败: ${err.message}\x1b[0m`);
      
      // 检查CNAME记录
      try {
        const cnames = await dnsResolveCname(domain);
        console.log(`\x1b[32m    ✅ CNAME记录找到: ${cnames.join(', ')}\x1b[0m`);
      } catch (cnameErr) {
        console.log(`\x1b[31m    ❌ CNAME记录不存在: ${cnameErr.message}\x1b[0m`);
      }
    }
    
  } catch (error) {
    console.log(`\x1b[31m    ❌ 域名解析检查失败: ${error.message}\x1b[0m`);
  }
}

async function checkNameservers(domain) {
  return new Promise((resolve) => {
    const rootDomain = domain.split('.').slice(-2).join('.');
    const whois = spawn('dig', ['NS', rootDomain]);
    let output = '';
    
    whois.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    whois.on('close', (code) => {
      if (code === 0) {
        const nsRecords = output.split('\n')
          .filter(line => line.includes('NS') && line.includes('.'))
          .map(line => line.trim());
        
        if (nsRecords.length > 0) {
          console.log('\x1b[32m    ✅ 找到nameserver记录:\x1b[0m');
          nsRecords.forEach(record => {
            console.log(`\x1b[90m      ${record}\x1b[0m`);
            if (record.includes('cloudflare.com')) {
              console.log('\x1b[32m      💡 使用Cloudflare nameserver\x1b[0m');
            }
          });
        } else {
          console.log('\x1b[31m    ❌ 未找到nameserver记录\x1b[0m');
        }
      } else {
        console.log('\x1b[31m    ❌ 无法查询nameserver记录\x1b[0m');
      }
      resolve();
    });
    
    whois.on('error', (error) => {
      console.log(`\x1b[31m    ❌ dig命令失败: ${error.message}\x1b[0m`);
      resolve();
    });
  });
}

async function checkExistingDnsRecords(domain) {
  return new Promise((resolve) => {
    console.log(`\x1b[90m    检查 ${domain} 的DNS记录...\x1b[0m`);
    
    // 使用dig查询所有类型的DNS记录
    const dig = spawn('dig', [domain, 'ANY']);
    let output = '';
    
    dig.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    dig.on('close', (code) => {
      if (code === 0) {
        if (output.includes('ANSWER SECTION')) {
          console.log('\x1b[32m    ✅ 找到DNS记录:\x1b[0m');
          const answerSection = output.split('ANSWER SECTION:')[1]?.split('AUTHORITY SECTION:')[0];
          if (answerSection) {
            answerSection.split('\n').forEach(line => {
              if (line.trim() && !line.includes(';')) {
                console.log(`\x1b[90m      ${line.trim()}\x1b[0m`);
              }
            });
          }
        } else {
          console.log('\x1b[33m    ⚠️ 未找到DNS记录\x1b[0m');
        }
      } else {
        console.log('\x1b[31m    ❌ DNS记录查询失败\x1b[0m');
      }
      resolve();
    });
    
    dig.on('error', (error) => {
      console.log(`\x1b[31m    ❌ dig命令失败: ${error.message}\x1b[0m`);
      resolve();
    });
  });
}

async function testDnsQueries(domain, expectedTarget) {
  const dnsServers = [
    { name: 'Cloudflare', server: '1.1.1.1' },
    { name: 'Google', server: '8.8.8.8' },
    { name: 'Quad9', server: '9.9.9.9' }
  ];
  
  for (const dnsServer of dnsServers) {
    console.log(`\x1b[90m    测试 ${dnsServer.name} DNS (${dnsServer.server}):\x1b[0m`);
    
    await new Promise((resolve) => {
      const dig = spawn('dig', [`@${dnsServer.server}`, domain, 'CNAME']);
      let output = '';
      
      dig.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      dig.on('close', (code) => {
        if (code === 0 && output.includes('ANSWER SECTION')) {
          const answerSection = output.split('ANSWER SECTION:')[1];
          if (answerSection && answerSection.includes('CNAME')) {
            console.log('\x1b[32m      ✅ CNAME记录查询成功\x1b[0m');
            const cnameMatch = answerSection.match(new RegExp(`${domain}.*?CNAME\\s+(\\S+)`));
            if (cnameMatch) {
              const target = cnameMatch[1].replace(/\.$/, '');
              console.log(`\x1b[90m        目标: ${target}\x1b[0m`);
              if (target === expectedTarget) {
                console.log('\x1b[32m        ✅ 目标匹配期望值\x1b[0m');
              } else {
                console.log('\x1b[33m        ⚠️ 目标不匹配期望值\x1b[0m');
              }
            }
          } else {
            console.log('\x1b[33m      ⚠️ 未找到CNAME记录\x1b[0m');
          }
        } else {
          console.log('\x1b[31m      ❌ DNS查询失败或无结果\x1b[0m');
        }
        resolve();
      });
      
      dig.on('error', (error) => {
        console.log(`\x1b[31m      ❌ dig命令失败: ${error.message}\x1b[0m`);
        resolve();
      });
    });
  }
}

function generateDnsReport(domain, expectedTarget) {
  console.log('\x1b[34m📋 DNS诊断报告:\x1b[0m');
  console.log('\x1b[33m可能的问题原因:\x1b[0m');
  const possibleCauses = [
    '1. 域名未正确配置Cloudflare nameserver',
    '2. Cloudflare zone状态不是active', 
    '3. DNS记录创建失败但API返回成功',
    '4. DNS传播延迟（通常需要几分钟到几小时）',
    '5. API权限不足，无法创建DNS记录',
    '6. 域名本身不存在或已过期'
  ];
  
  possibleCauses.forEach(cause => {
    console.log(`\x1b[90m  ${cause}\x1b[0m`);
  });
  
  console.log('');
  console.log('\x1b[33m建议解决步骤:\x1b[0m');
  const solutions = [
    '检查域名注册商，确保域名使用Cloudflare nameserver',
    '在Cloudflare控制面板确认zone状态为active',
    '手动在Cloudflare控制面板创建CNAME记录进行测试',
    '等待DNS传播完成（建议等待至少30分钟）',
    '验证API Token具有Zone:Edit权限',
    '检查域名是否已正确添加到Cloudflare账户'
  ];
  
  solutions.forEach(solution => {
    console.log(`\x1b[90m  • ${solution}\x1b[0m`);
  });
}

// 运行诊断
diagnoseDNSConfiguration().then(() => {
  console.log('');
  console.log('\x1b[34m🔍 DNS诊断完成\x1b[0m');
  console.log('\x1b[90m建议：如果是DNS传播问题，请等待几分钟后重试\x1b[0m');
});