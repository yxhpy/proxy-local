#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Debug script for investigating cfargotunnel.com startup failures
 */

console.log('\x1b[34m🔍 开始调试 cfargotunnel.com 启动问题...\x1b[0m');
console.log('');

async function debugTunnelStartup() {
  try {
    // 1. 检查现有隧道配置文件
    console.log('\x1b[90m📋 步骤1: 检查隧道配置文件...\x1b[0m');
    const homeDir = require('os').homedir();
    const tunnelConfigDir = path.join(homeDir, '.cloudflared');
    
    if (fs.existsSync(tunnelConfigDir)) {
      const configFiles = fs.readdirSync(tunnelConfigDir);
      console.log(`\x1b[32m✅ 找到 .cloudflared 目录，包含 ${configFiles.length} 个文件\x1b[0m`);
      
      configFiles.forEach(file => {
        console.log(`\x1b[90m  - ${file}\x1b[0m`);
        if (file.endsWith('.json') || file.endsWith('.yml') || file.endsWith('.yaml')) {
          try {
            const filePath = path.join(tunnelConfigDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            if (content.includes('cfargotunnel.com')) {
              console.log(`\x1b[33m    💡 发现隧道配置: ${file}\x1b[0m`);
              
              // 提取隧道ID
              const tunnelIdMatch = content.match(/([a-f0-9\-]{36})\.cfargotunnel\.com/);
              if (tunnelIdMatch) {
                console.log(`\x1b[34m    🔗 隧道ID: ${tunnelIdMatch[1]}\x1b[0m`);
              }
            }
          } catch (err) {
            console.log(`\x1b[31m    ❌ 无法读取文件 ${file}: ${err.message}\x1b[0m`);
          }
        }
      });
    } else {
      console.log('\x1b[31m❌ 未找到 .cloudflared 配置目录\x1b[0m');
    }
    
    console.log('');
    
    // 2. 检查cloudflared进程状态
    console.log('\x1b[90m📋 步骤2: 检查cloudflared进程状态...\x1b[0m');
    await checkCloudflaredProcess();
    
    console.log('');
    
    // 3. 测试cloudflared连接
    console.log('\x1b[90m📋 步骤3: 测试cloudflared连接...\x1b[0m');
    await testTunnelConnectivity();
    
    console.log('');
    
    // 4. 生成诊断报告
    console.log('\x1b[34m📊 生成诊断报告...\x1b[0m');
    generateDiagnosticsReport();
    
  } catch (error) {
    console.log('\x1b[31m❌ 调试过程中发生错误:\x1b[0m');
    console.log('\x1b[31m' + error.message + '\x1b[0m');
    console.log('\x1b[90m' + error.stack + '\x1b[0m');
  }
}

async function checkCloudflaredProcess() {
  return new Promise((resolve) => {
    const ps = spawn('ps', ['aux']);
    let output = '';
    
    ps.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ps.on('close', (code) => {
      const cloudflaredProcesses = output.split('\n').filter(line => 
        line.includes('cloudflared') && !line.includes('grep')
      );
      
      if (cloudflaredProcesses.length > 0) {
        console.log(`\x1b[32m✅ 发现 ${cloudflaredProcesses.length} 个 cloudflared 进程:\x1b[0m`);
        cloudflaredProcesses.forEach((process, index) => {
          console.log(`\x1b[90m  ${index + 1}. ${process.trim()}\x1b[0m`);
        });
      } else {
        console.log('\x1b[33m⚠️ 未发现运行中的 cloudflared 进程\x1b[0m');
      }
      
      resolve();
    });
    
    ps.on('error', (error) => {
      console.log(`\x1b[31m❌ 检查进程时出错: ${error.message}\x1b[0m`);
      resolve();
    });
  });
}

async function testTunnelConnectivity() {
  return new Promise((resolve) => {
    // 测试cloudflared版本
    const versionCheck = spawn('cloudflared', ['--version']);
    let versionOutput = '';
    
    versionCheck.stdout.on('data', (data) => {
      versionOutput += data.toString();
    });
    
    versionCheck.on('close', (code) => {
      if (code === 0) {
        console.log(`\x1b[32m✅ cloudflared 已安装: ${versionOutput.trim()}\x1b[0m`);
        
        // 测试隧道列表
        const listTunnels = spawn('cloudflared', ['tunnel', 'list']);
        let listOutput = '';
        let listError = '';
        
        listTunnels.stdout.on('data', (data) => {
          listOutput += data.toString();
        });
        
        listTunnels.stderr.on('data', (data) => {
          listError += data.toString();
        });
        
        listTunnels.on('close', (listCode) => {
          if (listCode === 0) {
            console.log('\x1b[32m✅ 隧道列表查询成功:\x1b[0m');
            console.log('\x1b[90m' + listOutput + '\x1b[0m');
          } else {
            console.log('\x1b[31m❌ 隧道列表查询失败:\x1b[0m');
            console.log('\x1b[31m' + listError + '\x1b[0m');
          }
          resolve();
        });
        
      } else {
        console.log('\x1b[31m❌ cloudflared 未正确安装或无法访问\x1b[0m');
        resolve();
      }
    });
    
    versionCheck.on('error', (error) => {
      console.log(`\x1b[31m❌ 无法执行 cloudflared: ${error.message}\x1b[0m`);
      console.log('\x1b[33m💡 请确保 cloudflared 已正确安装并在PATH中\x1b[0m');
      resolve();
    });
  });
}

function generateDiagnosticsReport() {
  console.log('\x1b[34m📋 诊断报告:\x1b[0m');
  console.log('\x1b[33m常见原因:\x1b[0m');
  const commonCauses = [
    '1. cloudflared 进程未正确启动',
    '2. 隧道配置文件损坏或缺失', 
    '3. DNS记录配置错误',
    '4. Cloudflare API认证问题',
    '5. 网络连接问题',
    '6. 隧道ID与配置不匹配'
  ];
  
  commonCauses.forEach(cause => {
    console.log(`\x1b[90m  ${cause}\x1b[0m`);
  });
  
  console.log('');
  console.log('\x1b[33m建议排查步骤:\x1b[0m');
  const troubleshootingSteps = [
    '检查 ~/.cloudflared/ 目录下的配置文件',
    '验证 Cloudflare API Token 权限',
    '重启 cloudflared 进程', 
    '清理旧的隧道配置',
    '检查本地网络连接',
    '验证域名DNS配置'
  ];
  
  troubleshootingSteps.forEach(step => {
    console.log(`\x1b[90m  • ${step}\x1b[0m`);
  });
  
  console.log('');
  console.log('\x1b[33m下一步操作:\x1b[0m');
  const nextActions = [
    '运行 cloudflared tunnel list 查看现有隧道',
    '运行 cloudflared tunnel delete [tunnel-name] 清理旧隧道',
    '重新创建隧道配置',
    '检查系统日志中的详细错误信息'
  ];
  
  nextActions.forEach(action => {
    console.log(`\x1b[90m  → ${action}\x1b[0m`);
  });
}

// 运行调试
debugTunnelStartup().then(() => {
  console.log('');
  console.log('\x1b[34m🔍 调试完成\x1b[0m');
  console.log('\x1b[90m如需更详细的日志，请运行: cloudflared tunnel run --log-level debug [tunnel-name]\x1b[0m');
});