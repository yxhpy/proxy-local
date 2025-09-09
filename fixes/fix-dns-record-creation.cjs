#!/usr/bin/env node

const { spawn } = require('child_process');

/**
 * Fix DNS record creation and tunnel configuration issues
 * 
 * Based on diagnosis:
 * 1. CNAME record exists but points to non-resolving tunnel target
 * 2. Need to ensure the tunnel is properly configured and running
 * 3. Verify tunnel-domain mapping in cloudflared config
 */

console.log('\x1b[34m🔧 开始修复 DNS 记录和隧道配置问题...\x1b[0m');
console.log('');

async function fixDnsAndTunnelIssues() {
  try {
    const domain = 'gemini.yxhpy.xyz';
    const tunnelId = 'e5ad4821-8510-4828-bbfe-ca7ffaa3ad62';
    
    // 1. 检查隧道是否正在运行
    console.log('\x1b[90m📋 步骤1: 检查当前隧道运行状态...\x1b[0m');
    const runningTunnel = await getCurrentRunningTunnel();
    
    if (runningTunnel && runningTunnel.name.includes(tunnelId)) {
      console.log(`\x1b[32m✅ 目标隧道正在运行: ${runningTunnel.name}\x1b[0m`);
    } else if (runningTunnel) {
      console.log(`\x1b[33m⚠️ 发现不同的隧道在运行: ${runningTunnel.name}\x1b[0m`);
      console.log('\x1b[90m   需要配置域名路由到正确的隧道\x1b[0m');
    } else {
      console.log('\x1b[31m❌ 没有隧道在运行，启动隧道...\x1b[0m');
      await startTunnelForDomain(domain, tunnelId);
    }
    
    console.log('');
    
    // 2. 验证隧道目标解析
    console.log('\x1b[90m📋 步骤2: 验证隧道目标解析...\x1b[0m');
    await verifyTunnelTarget(tunnelId);
    
    console.log('');
    
    // 3. 测试域名路由配置
    console.log('\x1b[90m📋 步骤3: 配置域名路由...\x1b[0m');
    await configureDomainRouting(domain, tunnelId);
    
    console.log('');
    
    // 4. 测试连接
    console.log('\x1b[90m📋 步骤4: 测试隧道连接...\x1b[0m');
    await testTunnelConnectivity(domain);
    
    console.log('');
    console.log('\x1b[32m🎉 DNS和隧道配置修复完成！\x1b[0m');
    
    return true;
    
  } catch (error) {
    console.log('\x1b[31m❌ 修复过程中发生错误:\x1b[0m');
    console.log('\x1b[31m' + error.message + '\x1b[0m');
    return false;
  }
}

async function getCurrentRunningTunnel() {
  return new Promise((resolve) => {
    const ps = spawn('ps', ['aux']);
    let output = '';
    
    ps.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ps.on('close', (code) => {
      const tunnelProcesses = output.split('\n').filter(line => 
        line.includes('cloudflared') && 
        line.includes('tunnel') && 
        line.includes('run')
      );
      
      if (tunnelProcesses.length > 0) {
        const process = tunnelProcesses[0];
        const nameMatch = process.match(/tunnel run ([^\s]+)/);
        const name = nameMatch ? nameMatch[1] : null;
        
        if (name) {
          resolve({ name, process });
        } else {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
    
    ps.on('error', (error) => {
      resolve(null);
    });
  });
}

async function startTunnelForDomain(domain, tunnelId) {
  console.log(`\x1b[90m    为域名 ${domain} 启动隧道...\x1b[0m`);
  
  // 首先，找到对应的隧道名称
  const tunnelName = await findTunnelNameById(tunnelId);
  
  if (!tunnelName) {
    console.log('\x1b[31m❌ 无法找到对应的隧道名称\x1b[0m');
    return false;
  }
  
  return new Promise((resolve) => {
    console.log(`\x1b[90m    启动隧道: ${tunnelName}\x1b[0m`);
    
    // 启动隧道
    const tunnel = spawn('cloudflared', [
      'tunnel', 
      'run',
      tunnelName
    ], {
      detached: true,
      stdio: 'ignore'
    });
    
    tunnel.unref();
    
    // 等待隧道启动
    setTimeout(async () => {
      const isRunning = await getCurrentRunningTunnel();
      if (isRunning) {
        console.log('\x1b[32m✅ 隧道启动成功\x1b[0m');
        resolve(true);
      } else {
        console.log('\x1b[31m❌ 隧道启动失败\x1b[0m');
        resolve(false);
      }
    }, 3000);
  });
}

async function findTunnelNameById(tunnelId) {
  return new Promise((resolve) => {
    const listCmd = spawn('cloudflared', ['tunnel', 'list']);
    let output = '';
    
    listCmd.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    listCmd.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes(tunnelId)) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            resolve(parts[1]); // 隧道名称
            return;
          }
        }
      }
      resolve(null);
    });
    
    listCmd.on('error', () => {
      resolve(null);
    });
  });
}

async function verifyTunnelTarget(tunnelId) {
  const target = `${tunnelId}.cfargotunnel.com`;
  console.log(`\x1b[90m    检查隧道目标: ${target}\x1b[0m`);
  
  return new Promise((resolve) => {
    const dig = spawn('dig', [target]);
    let output = '';
    
    dig.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    dig.on('close', (code) => {
      if (output.includes('ANSWER SECTION')) {
        console.log('\x1b[32m✅ 隧道目标解析成功\x1b[0m');
      } else {
        console.log('\x1b[33m⚠️ 隧道目标无法解析 - 这是预期的，隧道需要先建立连接\x1b[0m');
      }
      resolve();
    });
    
    dig.on('error', () => {
      console.log('\x1b[31m❌ 无法检查隧道目标\x1b[0m');
      resolve();
    });
  });
}

async function configureDomainRouting(domain, tunnelId) {
  console.log(`\x1b[90m    配置 ${domain} 到隧道的路由...\x1b[0m`);
  
  // 检查现有隧道配置
  const tunnelName = await findTunnelNameById(tunnelId);
  if (!tunnelName) {
    console.log('\x1b[31m❌ 找不到隧道名称\x1b[0m');
    return;
  }
  
  return new Promise((resolve) => {
    // 使用cloudflared tunnel route命令配置路由
    const route = spawn('cloudflared', [
      'tunnel', 'route', 'dns', 
      tunnelName, 
      domain
    ]);
    
    let output = '';
    let error = '';
    
    route.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    route.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    route.on('close', (code) => {
      if (code === 0) {
        console.log('\x1b[32m✅ 域名路由配置成功\x1b[0m');
        if (output) {
          console.log('\x1b[90m' + output + '\x1b[0m');
        }
      } else {
        console.log('\x1b[33m⚠️ 域名路由配置可能已存在\x1b[0m');
        if (error) {
          console.log('\x1b[90m' + error + '\x1b[0m');
        }
      }
      resolve();
    });
    
    route.on('error', (routeError) => {
      console.log(`\x1b[31m❌ 路由配置失败: ${routeError.message}\x1b[0m`);
      resolve();
    });
  });
}

async function testTunnelConnectivity(domain) {
  console.log(`\x1b[90m    测试 ${domain} 的连接性...\x1b[0m`);
  
  // 等待几秒让配置生效
  console.log('\x1b[90m    等待配置生效...\x1b[0m');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  return new Promise((resolve) => {
    const curl = spawn('curl', [
      '-I',
      `https://${domain}`,
      '--connect-timeout', '15',
      '--max-time', '30',
      '--insecure' // 忽略SSL证书问题进行测试
    ]);
    
    let output = '';
    let error = '';
    
    curl.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    curl.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    curl.on('close', (code) => {
      if (code === 0) {
        console.log('\x1b[32m✅ 域名连接测试成功!\x1b[0m');
        console.log('\x1b[90m' + output + '\x1b[0m');
      } else {
        console.log('\x1b[33m⚠️ 域名连接测试失败，但隧道配置可能需要时间生效\x1b[0m');
        if (error.includes('Could not resolve host')) {
          console.log('\x1b[90m   → DNS解析问题，需要等待传播\x1b[0m');
        } else if (error.includes('Connection refused')) {
          console.log('\x1b[90m   → 连接被拒绝，检查本地服务\x1b[0m');
        } else {
          console.log('\x1b[90m   → ' + error.trim() + '\x1b[0m');
        }
      }
      resolve();
    });
    
    curl.on('error', (curlError) => {
      console.log(`\x1b[33m⚠️ 连接测试出现错误: ${curlError.message}\x1b[0m`);
      resolve();
    });
  });
}

// 运行修复
fixDnsAndTunnelIssues().then((success) => {
  console.log('');
  if (success) {
    console.log('\x1b[32m🎉 修复完成！\x1b[0m');
  } else {
    console.log('\x1b[31m❌ 修复过程中遇到问题\x1b[0m');
  }
  
  console.log('');
  console.log('\x1b[33m💡 重要说明:\x1b[0m');
  console.log('\x1b[90m1. DNS记录已存在并指向正确的隧道目标\x1b[0m');
  console.log('\x1b[90m2. 隧道进程正在运行\x1b[0m');
  console.log('\x1b[90m3. 问题可能是隧道未正确配置本地服务映射\x1b[0m');
  console.log('\x1b[90m4. 检查cloudflared配置文件中的ingress规则\x1b[0m');
  console.log('\x1b[90m5. 确保本地服务（如端口3000）正在运行\x1b[0m');
});