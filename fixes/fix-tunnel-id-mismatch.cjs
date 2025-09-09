#!/usr/bin/env node

const https = require('https');

/**
 * Fix tunnel ID mismatch issue
 * 
 * Update DNS record to point to the correct running tunnel
 */

console.log('\x1b[34m🔧 修复隧道ID不匹配问题...\x1b[0m');
console.log('');

const domain = 'gemini.yxhpy.xyz';
const oldTunnelId = 'e5ad4821-8510-4828-bbfe-ca7ffaa3ad62';
const correctTunnelId = '13365483-5ef8-46fa-bf2a-2211ec1977cd';
const newTarget = `${correctTunnelId}.cfargotunnel.com`;

async function fixTunnelIdMismatch() {
  try {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!apiToken) {
      console.log('\x1b[31m❌ 请设置 CLOUDFLARE_API_TOKEN 环境变量\x1b[0m');
      return false;
    }

    console.log('\x1b[90m📋 步骤1: 获取zone信息...\x1b[0m');
    const zoneId = await getZoneId('yxhpy.xyz', apiToken);
    if (!zoneId) {
      console.log('\x1b[31m❌ 无法获取zone信息\x1b[0m');
      return false;
    }
    console.log(`\x1b[32m✅ Zone ID: ${zoneId}\x1b[0m`);
    
    console.log('');
    console.log('\x1b[90m📋 步骤2: 查找现有DNS记录...\x1b[0m');
    const recordId = await findDnsRecord(zoneId, domain, apiToken);
    if (!recordId) {
      console.log('\x1b[31m❌ 找不到现有DNS记录\x1b[0m');
      return false;
    }
    console.log(`\x1b[32m✅ DNS记录ID: ${recordId}\x1b[0m`);
    
    console.log('');
    console.log('\x1b[90m📋 步骤3: 更新DNS记录...\x1b[0m');
    console.log(`\x1b[90m   从: ${oldTunnelId}.cfargotunnel.com\x1b[0m`);
    console.log(`\x1b[90m   到: ${newTarget}\x1b[0m`);
    
    const updated = await updateDnsRecord(zoneId, recordId, domain, newTarget, apiToken);
    if (!updated) {
      console.log('\x1b[31m❌ DNS记录更新失败\x1b[0m');
      return false;
    }
    
    console.log('\x1b[32m✅ DNS记录更新成功\x1b[0m');
    
    console.log('');
    console.log('\x1b[90m📋 步骤4: 验证更新...\x1b[0m');
    await verifyDnsUpdate(domain, correctTunnelId);
    
    return true;
    
  } catch (error) {
    console.log('\x1b[31m❌ 修复过程中出现错误:\x1b[0m');
    console.log('\x1b[31m' + error.message + '\x1b[0m');
    return false;
  }
}

function makeApiCall(method, endpoint, apiToken, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      port: 443,
      path: `/client/v4${endpoint}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (err) {
          reject(new Error(`JSON解析失败: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function getZoneId(zoneName, apiToken) {
  try {
    const response = await makeApiCall('GET', `/zones?name=${zoneName}`, apiToken);
    
    if (response.success && response.result.length > 0) {
      return response.result[0].id;
    }
    
    return null;
  } catch (error) {
    console.log(`\x1b[31m获取zone失败: ${error.message}\x1b[0m`);
    return null;
  }
}

async function findDnsRecord(zoneId, name, apiToken) {
  try {
    const response = await makeApiCall('GET', `/zones/${zoneId}/dns_records?name=${name}&type=CNAME`, apiToken);
    
    if (response.success && response.result.length > 0) {
      const record = response.result[0];
      console.log(`\x1b[90m   当前记录: ${record.name} -> ${record.content}\x1b[0m`);
      return record.id;
    }
    
    return null;
  } catch (error) {
    console.log(`\x1b[31m查找DNS记录失败: ${error.message}\x1b[0m`);
    return null;
  }
}

async function updateDnsRecord(zoneId, recordId, name, content, apiToken) {
  try {
    const data = {
      type: 'CNAME',
      name: name,
      content: content,
      ttl: 1 // Auto TTL
    };
    
    const response = await makeApiCall('PUT', `/zones/${zoneId}/dns_records/${recordId}`, apiToken, data);
    
    if (response.success) {
      console.log(`\x1b[32m   更新后记录: ${response.result.name} -> ${response.result.content}\x1b[0m`);
      return true;
    } else {
      console.log(`\x1b[31m   API错误: ${JSON.stringify(response.errors)}\x1b[0m`);
      return false;
    }
    
  } catch (error) {
    console.log(`\x1b[31m更新DNS记录失败: ${error.message}\x1b[0m`);
    return false;
  }
}

async function verifyDnsUpdate(domain, tunnelId) {
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    console.log('\x1b[90m   等待DNS传播...\x1b[0m');
    
    setTimeout(() => {
      const dig = spawn('dig', [domain, 'CNAME']);
      let output = '';
      
      dig.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      dig.on('close', (code) => {
        if (output.includes(`${tunnelId}.cfargotunnel.com`)) {
          console.log('\x1b[32m✅ DNS记录验证成功 - 指向正确的隧道\x1b[0m');
        } else {
          console.log('\x1b[33m⚠️ DNS可能需要更多时间传播\x1b[0m');
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
fixTunnelIdMismatch().then((success) => {
  console.log('');
  if (success) {
    console.log('\x1b[32m🎉 隧道ID不匹配问题修复完成！\x1b[0m');
    console.log('');
    console.log('\x1b[33m💡 下一步:\x1b[0m');
    console.log('\x1b[90m1. 等待 5-10 分钟让DNS完全传播\x1b[0m');
    console.log('\x1b[90m2. 测试访问: https://gemini.yxhpy.xyz\x1b[0m');
    console.log('\x1b[90m3. 检查隧道是否配置了正确的ingress规则\x1b[0m');
  } else {
    console.log('\x1b[31m❌ 修复失败\x1b[0m');
    console.log('\x1b[90m请手动在Cloudflare控制面板更新DNS记录\x1b[0m');
  }
});