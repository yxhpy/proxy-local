#!/usr/bin/env node

/**
 * 诊断快速隧道问题的脚本
 */

import { createServer } from 'http';
import { spawn } from 'child_process';

const testPort = 8007;

// 1. 创建本地测试服务器
const server = createServer((req, res) => {
  console.log(`📨 收到请求: ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>快速隧道测试</title>
        <meta charset="utf-8">
    </head>
    <body>
        <h1>🎉 快速隧道连接成功!</h1>
        <p>时间: ${new Date().toLocaleString()}</p>
        <p>这证明快速隧道工作正常!</p>
    </body>
    </html>
  `);
});

console.log('🌐 启动本地测试服务器...');
server.listen(testPort, 'localhost', () => {
  console.log(`✅ 本地服务器启动成功: http://localhost:${testPort}`);
  
  // 2. 测试本地服务器是否可访问
  console.log('\\n🧪 测试本地服务器连接...');
  fetch(`http://localhost:${testPort}`)
    .then(res => res.text())
    .then(body => {
      if (body.includes('快速隧道连接成功')) {
        console.log('✅ 本地服务器响应正常');
        startTunnelTest();
      } else {
        console.error('❌ 本地服务器响应异常');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ 本地服务器连接失败:', error.message);
      process.exit(1);
    });
});

function startTunnelTest() {
  console.log('\\n🚇 启动cloudflared快速隧道...');
  
  const tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${testPort}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let tunnelUrl = null;
  let isConnected = false;
  
  // 监听stdout
  tunnelProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('📋 STDOUT:', output.trim());
    
    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (urlMatch && !tunnelUrl) {
      tunnelUrl = urlMatch[0];
      console.log(`🎯 发现隧道URL: ${tunnelUrl}`);
    }
  });
  
  // 监听stderr（隧道URL通常在这里）
  tunnelProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.log('📋 STDERR:', output.trim());
    
    // 解析URL
    if (!tunnelUrl) {
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (urlMatch) {
        tunnelUrl = urlMatch[0];
        console.log(`🎯 发现隧道URL: ${tunnelUrl}`);
      }
    }
    
    // 检测连接状态
    if (output.includes('Registered tunnel connection')) {
      isConnected = true;
      console.log('✅ 隧道连接已注册');
      
      if (tunnelUrl) {
        setTimeout(() => testTunnelConnection(tunnelUrl), 3000); // 等待3秒后测试
      }
    }
  });
  
  // 错误处理
  tunnelProcess.on('error', (error) => {
    console.error('❌ cloudflared启动失败:', error.message);
    cleanup();
  });
  
  tunnelProcess.on('close', (code) => {
    console.log(`🛑 cloudflared进程退出，代码: ${code}`);
    cleanup();
  });
  
  // 15秒后如果没有URL就报错
  setTimeout(() => {
    if (!tunnelUrl) {
      console.error('❌ 15秒内未获取到隧道URL');
      tunnelProcess.kill();
      cleanup();
    }
  }, 15000);
  
  function cleanup() {
    server.close(() => {
      console.log('🛑 测试服务器已关闭');
      process.exit(0);
    });
  }
}

async function testTunnelConnection(url) {
  console.log(`\\n🔗 测试隧道连接: ${url}`);
  
  try {
    const response = await fetch(url, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TunnelTest/1.0)'
      }
    });
    
    console.log(`📊 响应状态: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const body = await response.text();
      if (body.includes('快速隧道连接成功')) {
        console.log('🎉 隧道连接测试成功！');
        console.log(`\\n✅ 快速隧道工作正常: ${url}`);
      } else {
        console.log('⚠️  隧道连接成功，但内容不正确');
        console.log('响应内容:', body.substring(0, 200) + '...');
      }
    } else {
      console.error(`❌ 隧道连接失败: HTTP ${response.status}`);
    }
    
  } catch (error) {
    console.error('❌ 隧道连接测试失败:', error.message);
    
    // 额外的诊断信息
    console.log('\\n🔍 诊断信息:');
    console.log(`- 隧道URL: ${url}`);
    console.log(`- 本地服务: http://localhost:${testPort}`);
    console.log('- 可能原因: 隧道未完全建立，或cloudflared进程异常');
  }
  
  console.log('\\n⏰ 隧道将继续运行，按Ctrl+C退出...');
}

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\\n🛑 正在退出...');
  server.close();
  process.exit(0);
});