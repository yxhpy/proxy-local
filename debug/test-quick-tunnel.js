#!/usr/bin/env node

/**
 * 测试快速隧道功能的调试脚本
 */

import { spawn } from 'child_process';
import { createServer } from 'http';

// 创建一个简单的HTTP服务器用于测试
const testPort = 8001;
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>快速隧道测试</title>
    </head>
    <body>
        <h1>🚀 快速隧道测试成功!</h1>
        <p>当前时间: ${new Date().toLocaleString('zh-CN')}</p>
        <p>端口: ${testPort}</p>
        <p>如果您能看到这个页面，说明快速隧道工作正常！</p>
    </body>
    </html>
  `);
});

server.listen(testPort, () => {
  console.log(`🌐 测试服务器已启动: http://localhost:${testPort}`);
  
  // 启动快速隧道
  console.log('🚇 正在创建快速隧道...');
  
  const cloudflaredProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${testPort}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let tunnelUrl = null;
  
  // 监听stdout获取隧道URL
  cloudflaredProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('📋 cloudflared stdout:', output.trim());
    
    // 解析隧道URL
    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (urlMatch && !tunnelUrl) {
      tunnelUrl = urlMatch[0];
      console.log('🎉 快速隧道创建成功!');
      console.log(`🌍 访问地址: ${tunnelUrl}`);
      console.log('');
      console.log('💡 请在浏览器中访问上述地址测试连接');
      console.log('🔄 按 Ctrl+C 停止测试');
    }
  });
  
  // 监听stderr
  cloudflaredProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.log('📋 cloudflared stderr:', output.trim());
  });
  
  // 进程退出处理
  cloudflaredProcess.on('close', (code) => {
    console.log(`🛑 cloudflared进程退出，代码: ${code}`);
    server.close();
    process.exit(code);
  });
  
  // 错误处理
  cloudflaredProcess.on('error', (error) => {
    console.error('❌ cloudflared启动失败:', error.message);
    server.close();
    process.exit(1);
  });
  
  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\\n🛑 正在停止快速隧道测试...');
    cloudflaredProcess.kill();
    server.close();
    process.exit(0);
  });
});