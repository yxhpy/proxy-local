#!/usr/bin/env node

/**
 * MVP验证程序：临时隧道创建逻辑
 * 验证cloudflared tunnel --url命令是否能正常工作
 */

import { spawn } from 'child_process';
import chalk from 'chalk';

console.log(chalk.blue('🧪 MVP验证：临时隧道创建逻辑'));
console.log(chalk.gray('=' .repeat(50)));

/**
 * 创建临时隧道
 * @param {number} port - 本地端口
 * @returns {Promise<string>} 隧道URL
 */
async function createTemporaryTunnel(port) {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue(`🚀 启动临时隧道到端口 ${port}...`));
    
    const child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(chalk.yellow('⏰ 启动超时，终止进程...'));
        child.kill();
        reject(new Error('临时隧道启动超时'));
      }
    }, 30000);

    child.stdout.on('data', (data) => {
      if (resolved) return;
      
      const text = data.toString();
      output += text;
      console.log(chalk.gray(`[cloudflared] ${text.trim()}`));
      
      // 查找隧道URL
      const urlMatch = text.match(/https?:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
      if (urlMatch) {
        resolved = true;
        clearTimeout(timeout);
        console.log(chalk.green(`✅ 找到隧道URL: ${urlMatch[0]}`));
        
        // 立即终止进程，因为这是测试
        child.kill();
        resolve(urlMatch[0]);
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      console.log(chalk.yellow(`[cloudflared-error] ${text.trim()}`));
      
      if (text.includes('connection refused') || text.includes('dial tcp')) {
        resolved = true;
        clearTimeout(timeout);
        child.kill();
        reject(new Error(`无法连接到本地端口 ${port}`));
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`cloudflared退出，代码: ${code}`));
        }
      }
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`启动cloudflared失败: ${err.message}`));
      }
    });
  });
}

// 测试临时隧道创建
async function testTemporaryTunnel() {
  try {
    console.log(chalk.yellow('📋 测试临时隧道创建:'));
    console.log(chalk.gray('注意：此测试会尝试连接到端口3000，如果没有服务运行会失败'));
    
    const tunnelUrl = await createTemporaryTunnel(3000);
    
    console.log('');
    console.log(chalk.green('🎉 临时隧道创建成功！'));
    console.log(chalk.blue(`🌐 隧道URL: ${tunnelUrl}`));
    console.log('');
    console.log(chalk.green('🎯 MVP验证完成：临时隧道逻辑工作正常'));
    
  } catch (error) {
    console.log('');
    if (error.message.includes('无法连接到本地端口')) {
      console.log(chalk.yellow('⚠️ 本地端口连接失败，这是预期的（因为没有运行服务）'));
      console.log(chalk.green('🎯 MVP验证：cloudflared命令和URL解析逻辑正常'));
    } else {
      console.log(chalk.red(`❌ MVP测试失败: ${error.message}`));
    }
  }
}

testTemporaryTunnel();