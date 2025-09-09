#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Fix script for cfargotunnel.com startup issues
 * 
 * This script will:
 * 1. Identify orphaned tunnel configurations (configs without running processes)
 * 2. Start the most recent tunnel configuration
 * 3. Clean up old/stale tunnel configurations
 * 4. Verify tunnel connectivity
 */

console.log('\x1b[34m🔧 开始修复 cfargotunnel.com 启动问题...\x1b[0m');
console.log('');

async function fixTunnelStartup() {
  try {
    // 1. 获取最新的隧道配置
    console.log('\x1b[90m📋 步骤1: 识别最新的隧道配置...\x1b[0m');
    const latestTunnel = await getLatestTunnelConfig();
    
    if (!latestTunnel) {
      console.log('\x1b[31m❌ 未找到有效的隧道配置\x1b[0m');
      return false;
    }
    
    console.log(`\x1b[32m✅ 找到最新隧道: ${latestTunnel.name} (ID: ${latestTunnel.id})\x1b[0m`);
    console.log('');
    
    // 2. 检查是否已有运行的进程
    console.log('\x1b[90m📋 步骤2: 检查隧道进程状态...\x1b[0m');
    const isRunning = await checkTunnelProcess(latestTunnel.name);
    
    if (isRunning) {
      console.log('\x1b[32m✅ 隧道进程已在运行\x1b[0m');
      return true;
    }
    
    console.log('\x1b[33m⚠️ 隧道进程未运行，准备启动...\x1b[0m');
    console.log('');
    
    // 3. 启动隧道
    console.log('\x1b[90m📋 步骤3: 启动隧道进程...\x1b[0m');
    const started = await startTunnel(latestTunnel.name);
    
    if (!started) {
      console.log('\x1b[31m❌ 隧道启动失败\x1b[0m');
      return false;
    }
    
    console.log('\x1b[32m✅ 隧道启动成功\x1b[0m');
    console.log('');
    
    // 4. 验证连接
    console.log('\x1b[90m📋 步骤4: 验证隧道连接...\x1b[0m');
    const verified = await verifyTunnelConnection(latestTunnel.name);
    
    if (verified) {
      console.log('\x1b[32m✅ 隧道连接验证成功\x1b[0m');
    } else {
      console.log('\x1b[33m⚠️ 隧道连接验证失败，但进程已启动\x1b[0m');
    }
    
    console.log('');
    
    // 5. 清理旧配置（可选）
    console.log('\x1b[90m📋 步骤5: 清理旧的隧道配置...\x1b[0m');
    await cleanupOldTunnels(latestTunnel.id);
    
    return true;
    
  } catch (error) {
    console.log('\x1b[31m❌ 修复过程中发生错误:\x1b[0m');
    console.log('\x1b[31m' + error.message + '\x1b[0m');
    return false;
  }
}

async function getLatestTunnelConfig() {
  return new Promise(async (resolve) => {
    try {
      // 获取隧道列表
      const listTunnels = spawn('cloudflared', ['tunnel', 'list']);
      let output = '';
      let error = '';
      
      listTunnels.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      listTunnels.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      listTunnels.on('close', (code) => {
        if (code !== 0) {
          console.log('\x1b[31m❌ 获取隧道列表失败:\x1b[0m');
          console.log('\x1b[31m' + error + '\x1b[0m');
          resolve(null);
          return;
        }
        
        // 解析隧道列表，找到最新的
        const lines = output.split('\n').filter(line => 
          line.trim() && 
          line.match(/^[a-f0-9\-]{36}/) &&
          (line.includes('tunnel-') || line.includes('temp-'))
        );
        
        if (lines.length === 0) {
          resolve(null);
          return;
        }
        
        // 获取最后一个隧道（最新创建的）
        const tunnelLines = lines;
        
        if (tunnelLines.length === 0) {
          resolve(null);
          return;
        }
        
        const latestLine = tunnelLines[tunnelLines.length - 1];
        const parts = latestLine.trim().split(/\s+/);
        
        if (parts.length >= 2) {
          resolve({
            id: parts[0],
            name: parts[1]
          });
        } else {
          resolve(null);
        }
      });
      
    } catch (err) {
      resolve(null);
    }
  });
}

async function checkTunnelProcess(tunnelName) {
  return new Promise((resolve) => {
    const ps = spawn('ps', ['aux']);
    let output = '';
    
    ps.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ps.on('close', (code) => {
      const hasProcess = output.includes('cloudflared') && 
                        output.includes('tunnel') && 
                        output.includes('run') &&
                        output.includes(tunnelName);
      resolve(hasProcess);
    });
    
    ps.on('error', (error) => {
      resolve(false);
    });
  });
}

async function startTunnel(tunnelName) {
  return new Promise((resolve) => {
    console.log(`\x1b[90m    启动命令: cloudflared tunnel run ${tunnelName}\x1b[0m`);
    
    // 使用 spawn 以分离模式启动隧道
    const tunnel = spawn('cloudflared', ['tunnel', 'run', tunnelName], {
      detached: true,
      stdio: 'ignore'
    });
    
    // 让子进程独立运行
    tunnel.unref();
    
    // 等待几秒钟让进程启动
    setTimeout(async () => {
      const isRunning = await checkTunnelProcess(tunnelName);
      resolve(isRunning);
    }, 3000);
  });
}

async function verifyTunnelConnection(tunnelName) {
  return new Promise((resolve) => {
    // 使用 cloudflared tunnel info 验证连接
    const info = spawn('cloudflared', ['tunnel', 'info', tunnelName]);
    let output = '';
    
    info.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    info.on('close', (code) => {
      // 如果能成功获取隧道信息，说明配置正确
      const isHealthy = code === 0 && output.includes('NAME');
      resolve(isHealthy);
    });
    
    info.on('error', (error) => {
      resolve(false);
    });
  });
}

async function cleanupOldTunnels(currentTunnelId) {
  try {
    const homeDir = require('os').homedir();
    const configDir = path.join(homeDir, '.cloudflared');
    
    if (!fs.existsSync(configDir)) {
      return;
    }
    
    const configFiles = fs.readdirSync(configDir);
    const tunnelConfigs = configFiles.filter(file => 
      file.endsWith('.json') && file !== 'config.json'
    );
    
    let cleanedCount = 0;
    
    for (const configFile of tunnelConfigs) {
      const tunnelId = configFile.replace('.json', '');
      
      // 保留当前隧道的配置
      if (tunnelId === currentTunnelId) {
        continue;
      }
      
      // 检查是否有对应的active隧道
      const isActive = await isTunnelActive(tunnelId);
      
      if (!isActive) {
        try {
          const configPath = path.join(configDir, configFile);
          fs.unlinkSync(configPath);
          cleanedCount++;
          console.log(`\x1b[90m    清理配置文件: ${configFile}\x1b[0m`);
        } catch (err) {
          console.log(`\x1b[33m    ⚠️ 无法删除配置文件 ${configFile}: ${err.message}\x1b[0m`);
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`\x1b[32m✅ 清理了 ${cleanedCount} 个旧配置文件\x1b[0m`);
    } else {
      console.log('\x1b[90m    没有需要清理的配置文件\x1b[0m');
    }
    
  } catch (error) {
    console.log(`\x1b[33m⚠️ 清理过程中出现错误: ${error.message}\x1b[0m`);
  }
}

async function isTunnelActive(tunnelId) {
  return new Promise((resolve) => {
    const listCmd = spawn('cloudflared', ['tunnel', 'list']);
    let output = '';
    
    listCmd.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    listCmd.on('close', (code) => {
      if (code !== 0) {
        resolve(false);
        return;
      }
      
      const isActive = output.includes(tunnelId);
      resolve(isActive);
    });
    
    listCmd.on('error', () => {
      resolve(false);
    });
  });
}

// 运行修复
fixTunnelStartup().then((success) => {
  console.log('');
  if (success) {
    console.log('\x1b[32m🎉 cfargotunnel.com 启动问题修复成功！\x1b[0m');
    console.log('\x1b[90m提示: 隧道现在应该可以正常工作了\x1b[0m');
  } else {
    console.log('\x1b[31m❌ 修复失败，请检查以下项目:\x1b[0m');
    console.log('\x1b[90m  1. Cloudflare API Token 是否有效\x1b[0m');
    console.log('\x1b[90m  2. 网络连接是否正常\x1b[0m');
    console.log('\x1b[90m  3. cloudflared 是否正确安装\x1b[0m');
    console.log('\x1b[90m  4. 隧道配置是否有效\x1b[0m');
  }
  
  console.log('\x1b[90m如需更多帮助，请运行: cloudflared tunnel --help\x1b[0m');
});