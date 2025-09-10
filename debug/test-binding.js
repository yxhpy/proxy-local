#!/usr/bin/env node

import { createServer } from 'http';
import { spawn } from 'child_process';

const testPort = 8008;

// 创建服务器，监听所有接口（0.0.0.0）而不是localhost
const server = createServer((req, res) => {
  console.log(`📨 收到请求: ${req.method} ${req.url} from ${req.headers.host}`);
  console.log(`🔗 User-Agent: ${req.headers['user-agent']}`);
  console.log(`🔗 Headers:`, JSON.stringify(req.headers, null, 2));
  
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>隧道连接测试</title>
        <meta charset="utf-8">
    </head>
    <body>
        <h1>🎉 隧道连接成功!</h1>
        <p>时间: ${new Date().toLocaleString()}</p>
        <p>请求地址: ${req.url}</p>
        <p>来源: ${req.headers.host}</p>
    </body>
    </html>
  `);
});

console.log('🌐 启动测试服务器（监听所有接口）...');
server.listen(testPort, '0.0.0.0', () => {
  console.log(`✅ 服务器启动: http://0.0.0.0:${testPort}`);
  console.log(`✅ 本地访问: http://localhost:${testPort}`);
  console.log(`✅ 网络访问: http://192.168.x.x:${testPort}`);
  
  // 测试本地连接
  setTimeout(async () => {
    try {
      const response = await fetch(`http://localhost:${testPort}`);
      if (response.ok) {
        console.log('✅ 本地连接测试成功');
        startTunnel();
      } else {
        console.error('❌ 本地连接测试失败');
      }
    } catch (error) {
      console.error('❌ 本地连接错误:', error.message);
    }
  }, 1000);
});

function startTunnel() {
  console.log('\\n🚇 启动cloudflared隧道（指向localhost）...');
  
  const tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${testPort}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let tunnelUrl = null;
  let testStarted = false;
  
  tunnelProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.log('📋 STDERR:', output.trim());
    
    if (!tunnelUrl) {
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (urlMatch) {
        tunnelUrl = urlMatch[0];
        console.log(`🎯 隧道URL: ${tunnelUrl}`);
      }
    }
    
    if (output.includes('Registered tunnel connection') && !testStarted) {
      testStarted = true;
      console.log('✅ 隧道连接已注册');
      
      if (tunnelUrl) {
        // 等待更长时间确保隧道完全准备好
        setTimeout(() => testTunnelAccess(tunnelUrl), 8000);
      }
    }
  });
  
  tunnelProcess.on('error', (error) => {
    console.error('❌ cloudflared错误:', error.message);
    cleanup();
  });
  
  tunnelProcess.on('close', (code) => {
    console.log(`🛑 cloudflared退出: ${code}`);
    cleanup();
  });
  
  function cleanup() {
    server.close();
    process.exit(0);
  }
}

async function testTunnelAccess(url) {
  console.log(`\\n🔗 测试隧道访问: ${url}`);
  
  for (let i = 1; i <= 5; i++) {
    console.log(`\\n📡 尝试 ${i}/5...`);
    
    try {
      const response = await fetch(url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      console.log(`📊 状态: ${response.status} ${response.statusText}`);
      console.log(`📊 Headers:`, JSON.stringify([...response.headers.entries()], null, 2));
      
      if (response.ok) {
        const body = await response.text();
        console.log('🎉 隧道访问成功!');
        console.log('📄 内容预览:', body.substring(0, 200));
        break;
      } else if (response.status === 404) {
        console.log('❌ 404错误 - 隧道路由可能未完成');
        if (i < 5) {
          console.log('⏰ 等待5秒后重试...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } else {
        console.log(`❌ HTTP错误: ${response.status}`);
      }
      
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
      if (i < 5) {
        console.log('⏰ 等待3秒后重试...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  console.log('\\n⏰ 测试完成，隧道继续运行。按Ctrl+C退出...');
}

process.on('SIGINT', () => {
  console.log('\\n🛑 退出测试');
  server.close();
  process.exit(0);
});