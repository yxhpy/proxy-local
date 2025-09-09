#!/usr/bin/env node

/**
 * MVP验证程序：cloudflared tunnel login 登录流程
 * 验证登录命令启动和cert.pem文件监控逻辑
 */

import { spawn } from 'child_process';
import { existsSync, watch } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

console.log(chalk.blue('🧪 MVP验证：cloudflared login登录流程'));
console.log(chalk.gray('=' .repeat(50)));

/**
 * 启动cloudflared登录并等待认证完成
 * @returns {Promise<boolean>} 登录是否成功
 */
async function performCloudflaredLogin() {
  const certPath = join(homedir(), '.cloudflared', 'cert.pem');
  
  console.log(chalk.blue('🔐 启动 cloudflared tunnel login...'));
  console.log(chalk.yellow('💡 这将打开浏览器进行 Cloudflare 认证'));
  console.log(chalk.gray('请在浏览器中完成登录，然后返回此终端'));
  
  return new Promise((resolve, reject) => {
    // 检查初始状态
    if (existsSync(certPath)) {
      console.log(chalk.green('✅ 检测到现有认证文件，登录已完成'));
      resolve(true);
      return;
    }
    
    // 启动登录进程
    const loginProcess = spawn('cloudflared', ['tunnel', 'login'], {
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let resolved = false;
    
    // 设置超时
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(chalk.yellow('⏰ 登录超时，请重试'));
        loginProcess.kill();
        resolve(false);
      }
    }, 120000); // 2分钟超时
    
    // 监控输出
    loginProcess.stdout.on('data', (data) => {
      const text = data.toString();
      console.log(chalk.gray(`[cloudflared] ${text.trim()}`));
    });
    
    loginProcess.stderr.on('data', (data) => {
      const text = data.toString();
      console.log(chalk.yellow(`[cloudflared-error] ${text.trim()}`));
    });
    
    // 监控cert.pem文件创建
    const cloudflaredDir = join(homedir(), '.cloudflared');
    
    // 确保目录存在后再监控
    if (existsSync(cloudflaredDir)) {
      const watcher = watch(cloudflaredDir, (eventType, filename) => {
        if (filename === 'cert.pem' && existsSync(certPath)) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            watcher.close();
            loginProcess.kill();
            console.log(chalk.green('✅ 检测到认证文件创建，登录成功！'));
            resolve(true);
          }
        }
      });
      
      // 清理监控器
      setTimeout(() => watcher.close(), 120000);
    }
    
    // 处理进程退出
    loginProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        
        if (code === 0 && existsSync(certPath)) {
          console.log(chalk.green('✅ 登录进程正常退出，认证成功'));
          resolve(true);
        } else {
          console.log(chalk.red(`❌ 登录进程退出，代码: ${code}`));
          resolve(false);
        }
      }
    });
    
    loginProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log(chalk.red(`❌ 启动登录进程失败: ${err.message}`));
        resolve(false);
      }
    });
  });
}

// 测试登录流程
async function testLoginPath() {
  try {
    console.log(chalk.yellow('📋 测试 cloudflared login 流程:'));
    console.log(chalk.gray('注意：如果已经登录过，将直接检测到现有认证'));
    
    const loginSuccess = await performCloudflaredLogin();
    
    console.log('');
    if (loginSuccess) {
      console.log(chalk.green('🎉 登录流程验证成功！'));
      console.log(chalk.blue('  → 可以进入认证后流程'));
    } else {
      console.log(chalk.yellow('⚠️ 登录流程未完成'));
      console.log(chalk.blue('  → 用户可能取消了登录或发生错误'));
    }
    
    console.log('');
    console.log(chalk.green('🎯 MVP验证完成：登录流程逻辑正常'));
    
  } catch (error) {
    console.log('');
    console.log(chalk.red(`❌ MVP测试失败: ${error.message}`));
  }
}

// 运行测试（用户可以选择是否执行）
console.log(chalk.yellow('⚠️ 此测试将尝试启动 cloudflared tunnel login'));
console.log(chalk.gray('如果您不想执行实际登录，请按 Ctrl+C 取消'));
console.log(chalk.gray('否则将在3秒后开始...'));

setTimeout(() => {
  testLoginPath();
}, 3000);