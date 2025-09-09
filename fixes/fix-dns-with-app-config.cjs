#!/usr/bin/env node

const { readFileSync, existsSync } = require('fs');
const { homedir } = require('os');
const { join } = require('path');
const https = require('https');

/**
 * 使用应用配置修复DNS记录的隧道ID不匹配问题
 */

console.log('\x1b[34m🔧 使用应用配置修复DNS记录隧道ID不匹配...\x1b[0m');
console.log('');

const domain = 'gemini.yxhpy.xyz';
const oldTunnelId = 'e5ad4821-8510-4828-bbfe-ca7ffaa3ad62';
const correctTunnelId = '13365483-5ef8-46fa-bf2a-2211ec1977cd';
const newTarget = `${correctTunnelId}.cfargotunnel.com`;

async function fixDnsWithAppConfig() {
  try {
    // 1. 读取应用配置中的API令牌
    console.log('\x1b[90m📋 步骤1: 读取应用配置...\x1b[0m');
    const apiToken = getApiTokenFromConfig();
    
    if (!apiToken) {
      console.log('\x1b[31m❌ 在应用配置中未找到Cloudflare API令牌\x1b[0m');
      console.log('\x1b[90m   配置文件位置: ~/.uvx/config.json\x1b[0m');
      return false;
    }
    
    console.log(`\x1b[32m✅ 找到API令牌: ${apiToken.substring(0, 8)}...\x1b[0m`);
    console.log('');

    // 2. 获取zone信息
    console.log('\x1b[90m📋 步骤2: 获取Cloudflare zone信息...\x1b[0m');
    const zoneId = await getZoneId('yxhpy.xyz', apiToken);
    if (!zoneId) {
      console.log('\x1b[31m❌ 无法获取zone信息\x1b[0m');
      return false;
    }
    console.log(`\x1b[32m✅ Zone ID: ${zoneId}\x1b[0m`);
    console.log('');

    // 3. 查找现有DNS记录
    console.log('\x1b[90m📋 步骤3: 查找现有DNS记录...\x1b[0m');
    const record = await findDnsRecord(zoneId, domain, apiToken);
    if (!record) {
      console.log('\x1b[31m❌ 找不到现有DNS记录\x1b[0m');
      return false;
    }
    console.log(`\x1b[32m✅ 找到DNS记录\x1b[0m`);
    console.log(`\x1b[90m   记录ID: ${record.id}\x1b[0m`);
    console.log(`\x1b[90m   当前目标: ${record.content}\x1b[0m`);
    console.log('');

    // 4. 检查是否需要更新
    if (record.content === newTarget) {
      console.log('\x1b[32m✅ DNS记录已指向正确的隧道，无需更新\x1b[0m');
      return true;
    }

    // 5. 更新DNS记录
    console.log('\x1b[90m📋 步骤4: 更新DNS记录...\x1b[0m');
    console.log(`\x1b[90m   从: ${record.content}\x1b[0m`);
    console.log(`\x1b[90m   到: ${newTarget}\x1b[0m`);

    const updated = await updateDnsRecord(zoneId, record.id, domain, newTarget, apiToken);
    if (!updated) {
      console.log('\x1b[31m❌ DNS记录更新失败\x1b[0m');
      return false;
    }

    console.log('\x1b[32m✅ DNS记录更新成功！\x1b[0m');
    console.log('');

    // 6. 验证更新
    console.log('\x1b[90m📋 步骤5: 验证DNS记录更新...\x1b[0m');
    await verifyDnsUpdate(domain, correctTunnelId);

    return true;

  } catch (error) {
    console.log('\x1b[31m❌ 修复过程中出现错误:\x1b[0m');
    console.log('\x1b[31m' + error.message + '\x1b[0m');
    return false;
  }
}

function getApiTokenFromConfig() {
  try {
    const configDir = join(homedir(), '.uvx');
    const configFile = join(configDir, 'config.json');
    
    if (!existsSync(configFile)) {
      console.log('\x1b[31m   配置文件不存在\x1b[0m');
      return null;
    }
    
    const configData = readFileSync(configFile, 'utf8');
    const config = JSON.parse(configData);
    
    return config?.cloudflare?.apiToken || null;
  } catch (error) {
    console.log(`\x1b[31m   读取配置文件失败: ${error.message}\x1b[0m`);
    return null;
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

    req.setTimeout(15000, () => {
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
    } else {
      console.log('\x1b[31m   API错误:\x1b[0m', response.errors || 'zone不存在');
      return null;
    }
  } catch (error) {
    console.log(`\x1b[31m   获取zone失败: ${error.message}\x1b[0m`);
    return null;
  }
}

async function findDnsRecord(zoneId, name, apiToken) {
  try {
    const response = await makeApiCall('GET', `/zones/${zoneId}/dns_records?name=${name}&type=CNAME`, apiToken);
    
    if (response.success && response.result.length > 0) {
      return response.result[0];
    } else {
      console.log('\x1b[31m   未找到DNS记录或API错误:\x1b[0m', response.errors || 'no records');
      return null;
    }
  } catch (error) {
    console.log(`\x1b[31m   查找DNS记录失败: ${error.message}\x1b[0m`);
    return null;
  }
}

async function updateDnsRecord(zoneId, recordId, name, content, apiToken) {
  try {
    const data = {
      type: 'CNAME',
      name: name,
      content: content,
      ttl: 1, // Auto TTL
      proxied: false // 确保不开启代理，否则隧道可能不工作
    };
    
    const response = await makeApiCall('PUT', `/zones/${zoneId}/dns_records/${recordId}`, apiToken, data);
    
    if (response.success) {
      console.log(`\x1b[32m   ✅ 记录已更新: ${response.result.name} -> ${response.result.content}\x1b[0m`);
      return true;
    } else {
      console.log(`\x1b[31m   API错误:\x1b[0m`, response.errors);
      return false;
    }
    
  } catch (error) {
    console.log(`\x1b[31m   更新DNS记录失败: ${error.message}\x1b[0m`);
    return false;
  }
}

async function verifyDnsUpdate(domain, tunnelId) {
  const { spawn } = require('child_process');
  
  console.log('\x1b[90m   等待DNS传播和验证...\x1b[0m');
  
  return new Promise((resolve) => {
    setTimeout(() => {
      // 使用多个DNS服务器验证
      const dnsServers = ['1.1.1.1', '8.8.8.8'];
      let successCount = 0;
      let totalChecks = dnsServers.length;
      
      dnsServers.forEach((server, index) => {
        const dig = spawn('dig', [`@${server}`, domain, 'CNAME']);
        let output = '';
        
        dig.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        dig.on('close', (code) => {
          if (output.includes(`${tunnelId}.cfargotunnel.com`)) {
            console.log(`\x1b[32m   ✅ ${server} DNS验证成功\x1b[0m`);
            successCount++;
          } else {
            console.log(`\x1b[33m   ⚠️ ${server} DNS尚未传播\x1b[0m`);
          }
          
          totalChecks--;
          if (totalChecks === 0) {
            if (successCount > 0) {
              console.log(`\x1b[32m✅ DNS验证完成 (${successCount}/${dnsServers.length} 服务器确认)\x1b[0m`);
            } else {
              console.log('\x1b[33m⚠️ DNS传播中，请等待几分钟后测试\x1b[0m');
            }
            resolve();
          }
        });
        
        dig.on('error', () => {
          totalChecks--;
          if (totalChecks === 0) {
            resolve();
          }
        });
      });
    }, 2000);
  });
}

// 运行修复
fixDnsWithAppConfig().then((success) => {
  console.log('');
  if (success) {
    console.log('\x1b[32m🎉 DNS记录隧道ID修复完成！\x1b[0m');
    console.log('');
    console.log('\x1b[33m💡 下一步:\x1b[0m');
    console.log('\x1b[90m1. 等待 5-10 分钟让DNS完全传播到所有服务器\x1b[0m');
    console.log('\x1b[90m2. 测试访问: curl -I https://gemini.yxhpy.xyz\x1b[0m');
    console.log('\x1b[90m3. 确保本地服务（如端口3000）正在运行\x1b[0m');
    console.log('\x1b[90m4. 检查隧道ingress配置是否正确\x1b[0m');
  } else {
    console.log('\x1b[31m❌ 修复失败\x1b[0m');
    console.log('\x1b[33m备选方案:\x1b[0m');
    console.log('\x1b[90m- 手动在Cloudflare控制面板更新DNS记录\x1b[0m');
    console.log(`\x1b[90m- 将 ${domain} 的CNAME记录改为: ${newTarget}\x1b[0m`);
  }
});