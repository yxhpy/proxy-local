#!/usr/bin/env node

import { createServer } from 'http';

const port = 8001;

const server = createServer((req, res) => {
  console.log(`📨 收到请求: ${req.method} ${req.url} from ${req.headers.host}`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>修复测试服务器</title>
        <meta charset="utf-8">
    </head>
    <body>
        <h1>🎉 隧道修复验证成功!</h1>
        <p>时间: ${new Date().toLocaleString()}</p>
        <p>端口: ${port}</p>
        <p>请求URL: ${req.url}</p>
        <p>来源: ${req.headers.host}</p>
        <div style="margin-top: 20px; padding: 10px; background: #e8f5e8; border-radius: 5px;">
            <strong>✅ Cloudflare快速隧道404问题已修复！</strong>
            <p>解决方案: 临时备份config.yml配置文件以避免干扰</p>
        </div>
    </body>
    </html>
  `);
});

server.listen(port, () => {
  console.log(`✅ 测试服务器启动: http://localhost:${port}`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 关闭测试服务器');
  server.close();
  process.exit(0);
});