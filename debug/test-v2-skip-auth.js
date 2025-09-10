#!/usr/bin/env node

/**
 * 测试V2跳过认证场景的调试脚本
 */

import { UserGuidance } from '../src/v2/user-guidance.js';
import { createServer } from 'http';

// 创建测试服务器
const testPort = 8002;
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>V2快速隧道测试</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .success { color: #2d5016; background: #d4edda; padding: 15px; border-radius: 5px; }
            .info { color: #1b4c5c; background: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="success">
            <h1>🚀 V2快速隧道测试成功!</h1>
        </div>
        <div class="info">
            <h2>📊 测试信息</h2>
            <p><strong>当前时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
            <p><strong>本地端口:</strong> ${testPort}</p>
            <p><strong>隧道类型:</strong> V2快速隧道（无需认证）</p>
            <p><strong>测试结果:</strong> 如果您能看到这个页面，说明V2快速隧道功能完全正常！</p>
        </div>
        <div class="info">
            <h2>🎯 功能特点</h2>
            <ul>
                <li>✅ 无需Cloudflare账户或认证</li>
                <li>✅ 自动生成随机域名</li>
                <li>✅ 即时可用，无需DNS配置</li>
                <li>⚠️ 临时隧道，重启后域名会变化</li>
            </ul>
        </div>
    </body>
    </html>
  `);
});

async function testV2SkipAuth() {
  console.log('🌐 启动测试服务器...');
  
  server.listen(testPort, async () => {
    console.log(`✅ 测试服务器已启动: http://localhost:${testPort}`);
    
    try {
      console.log('\\n🚇 开始测试V2跳过认证场景...');
      
      const userGuidance = new UserGuidance();
      
      // 模拟用户选择跳过认证的选项
      const options = { 
        skipAuth: true  // 直接跳过认证
      };
      
      console.log('⏭️  使用skipAuth选项，跳过交互式认证流程');
      
      const result = await userGuidance.createOneClickProxy(testPort, options);
      
      if (result.success) {
        console.log('\\n🎉 V2快速隧道测试成功!');
        console.log(`🌍 公网访问地址: ${result.url}`);
        console.log(`🏠 本地服务地址: http://localhost:${testPort}`);
        console.log(`🚇 隧道类型: ${result.tunnel.type}`);
        console.log(`⏱️  总耗时: ${Math.round(result.duration / 1000)}秒`);
        console.log('\\n💡 请在浏览器中访问公网地址测试连接');
        console.log('🔄 按 Ctrl+C 停止测试');
        
        // 保持运行
        process.on('SIGINT', async () => {
          console.log('\\n🛑 正在停止V2快速隧道测试...');
          await userGuidance.cleanup();
          server.close();
          process.exit(0);
        });
        
      } else {
        console.error('❌ V2快速隧道测试失败:', result.error);
        server.close();
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ 测试过程发生错误:', error.message);
      server.close();
      process.exit(1);
    }
  });
}

testV2SkipAuth();