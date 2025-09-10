#!/usr/bin/env node

/**
 * 测试临时隧道功能
 */

import { createServer } from 'http';
import { UserGuidance } from '../src/v2/user-guidance.js';

const testPort = 8009;

// 创建测试服务器
const server = createServer((req, res) => {
  console.log(`📨 收到请求: ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>临时隧道测试</title>
        <meta charset="utf-8">
    </head>
    <body>
        <h1>🎉 临时隧道连接成功!</h1>
        <p>时间: ${new Date().toLocaleString()}</p>
        <p>端口: ${testPort}</p>
        <p>隧道类型: 临时命名隧道</p>
    </body>
    </html>
  `);
});

async function testTempTunnel() {
  console.log('🌐 启动测试服务器...');
  
  server.listen(testPort, async () => {
    console.log(`✅ 测试服务器启动: http://localhost:${testPort}`);
    
    try {
      console.log('\\n🚇 开始测试V2临时隧道...');
      
      const userGuidance = new UserGuidance();
      const result = await userGuidance.createOneClickProxy(testPort, { 
        skipAuth: true 
      });
      
      if (result.success) {
        console.log('\\n🎉 临时隧道测试成功!');
        console.log(`🌍 访问地址: ${result.url}`);
        console.log(`🚇 隧道类型: ${result.tunnel.type}`);
        console.log(`🆔 隧道ID: ${result.tunnel.tunnelId}`);
        console.log(`⏱️  耗时: ${Math.round(result.duration / 1000)}秒`);
        
        // 测试访问
        setTimeout(async () => {
          try {
            console.log('\\n🔗 测试隧道访问...');
            const response = await fetch(result.url, { timeout: 15000 });
            
            if (response.ok) {
              console.log('✅ 隧道访问成功!');
              const body = await response.text();
              console.log('📄 内容确认:', body.includes('临时隧道连接成功') ? '正确' : '异常');
            } else {
              console.error(`❌ 访问失败: ${response.status} ${response.statusText}`);
            }
            
          } catch (error) {
            console.error('❌ 访问测试失败:', error.message);
          }
          
          console.log('\\n⏰ 隧道继续运行，按Ctrl+C退出...');
        }, 5000);
        
        // 优雅退出处理
        process.on('SIGINT', async () => {
          console.log('\\n🛑 正在停止临时隧道...');
          await userGuidance.cleanup();
          server.close();
          process.exit(0);
        });
        
      } else {
        console.error('❌ 临时隧道创建失败:', result.error);
        server.close();
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      server.close();
      process.exit(1);
    }
  });
}

testTempTunnel();