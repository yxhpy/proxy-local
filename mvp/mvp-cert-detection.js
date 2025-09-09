#!/usr/bin/env node

/**
 * MVP验证程序：cert.pem文件检测逻辑
 * 验证新的入口逻辑是否能正确检测cloudflared认证状态
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

console.log(chalk.blue('🧪 MVP验证：cert.pem文件检测逻辑'));
console.log(chalk.gray('=' .repeat(50)));

/**
 * 核心函数：检查用户是否已通过cloudflared认证
 * @returns {boolean} 是否存在cert.pem文件
 */
function isCloudflaredAuthenticated() {
  const certPath = join(homedir(), '.cloudflared', 'cert.pem');
  console.log(chalk.gray(`检查路径: ${certPath}`));
  
  const exists = existsSync(certPath);
  console.log(chalk.gray(`文件存在: ${exists}`));
  
  return exists;
}

// 测试当前状态
console.log('');
console.log(chalk.yellow('📋 当前认证状态测试:'));

const isAuthenticated = isCloudflaredAuthenticated();

if (isAuthenticated) {
  console.log(chalk.green('✅ 用户已登录（发现cert.pem文件）'));
  console.log(chalk.blue('  → 应进入认证后流程'));
} else {
  console.log(chalk.red('❌ 用户未登录（未发现cert.pem文件）'));
  console.log(chalk.blue('  → 应显示双路径选择菜单'));
}

console.log('');
console.log(chalk.green('🎯 MVP验证完成：cert.pem检测逻辑工作正常'));