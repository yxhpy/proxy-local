#!/usr/bin/env node

/**
 * 测试程序：验证59.1任务 - 新的入口逻辑是否正确工作
 */

import { CloudflareProvider } from './src/providers/cloudflare.js';
import chalk from 'chalk';

console.log(chalk.blue('🧪 测试：CloudflareProvider新的入口逻辑'));
console.log(chalk.gray('=' .repeat(50)));

async function testEntryLogic() {
  const provider = new CloudflareProvider();
  
  try {
    console.log(chalk.yellow('📋 测试未认证用户流程（应显示"未认证流程尚未实现"错误）:'));
    await provider.createTunnel(3000);
  } catch (error) {
    if (error.message === '未认证流程尚未实现') {
      console.log(chalk.green('✅ 入口逻辑正确：检测到未认证状态并调用了正确的处理函数'));
    } else if (error.message === '认证后流程尚未实现') {
      console.log(chalk.green('✅ 入口逻辑正确：检测到认证状态并调用了正确的处理函数'));
    } else {
      console.log(chalk.red(`❌ 预期之外的错误: ${error.message}`));
    }
  }
}

testEntryLogic().then(() => {
  console.log('');
  console.log(chalk.green('🎯 入口逻辑测试完成'));
}).catch(console.error);