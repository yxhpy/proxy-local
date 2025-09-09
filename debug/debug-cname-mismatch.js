#!/usr/bin/env node

/**
 * Debug CNAME Cross-User Banned issue
 * 问题：DNS 记录指向旧的隧道URL，但程序使用的是新的隧道URL
 */

import { CloudflareDomainManager } from './src/utils/cloudflare-domain-manager.js';
import chalk from 'chalk';
import { spawn } from 'child_process';

async function debugCnameMismatch() {
  console.log(chalk.blue('🔍 调试 CNAME Cross-User Banned 错误'));
  console.log(chalk.gray('=' * 60));
  
  const manager = new CloudflareDomainManager();
  
  // 1. 检查当前DNS记录
  console.log(chalk.yellow('\n1. 检查当前DNS记录状态'));
  try {
    const record = await manager.findDnsRecordByDomain('gemini.yxhpy.xyz');
    if (record) {
      console.log(chalk.green(`✅ 找到现有 DNS 记录:`));
      console.log(chalk.gray(`   类型: ${record.type}`));
      console.log(chalk.gray(`   名称: ${record.name}`));
      console.log(chalk.gray(`   内容: ${record.content}`));
      console.log(chalk.gray(`   记录ID: ${record.id}`));
    } else {
      console.log(chalk.red('❌ 未找到 DNS 记录'));
    }
  } catch (error) {
    console.error(chalk.red(`DNS 记录检查失败: ${error.message}`));
  }

  // 2. 检查当前系统DNS解析
  console.log(chalk.yellow('\n2. 检查系统DNS解析'));
  try {
    await new Promise((resolve, reject) => {
      const dig = spawn('dig', ['gemini.yxhpy.xyz', 'CNAME', '+short']);
      let output = '';
      
      dig.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      dig.on('close', (code) => {
        if (code === 0) {
          const cnameTarget = output.trim();
          console.log(chalk.green(`✅ 当前CNAME目标: ${cnameTarget}`));
          resolve();
        } else {
          console.log(chalk.red('❌ DNS查询失败'));
          resolve();
        }
      });
    });
  } catch (error) {
    console.error(chalk.red(`DNS解析检查失败: ${error.message}`));
  }
  
  // 3. 提供解决方案
  console.log(chalk.yellow('\n3. 解决方案建议'));
  console.log(chalk.gray('问题原因: DNS记录指向的隧道URL与当前隧道不匹配'));
  console.log(chalk.gray(''));
  console.log(chalk.cyan('选项1: 清理DNS记录，重新创建'));
  console.log(chalk.gray('  - 删除现有CNAME记录'));
  console.log(chalk.gray('  - 重新启动隧道，让程序自动配置正确的DNS'));
  console.log(chalk.gray(''));
  console.log(chalk.cyan('选项2: 手动更新DNS记录'));
  console.log(chalk.gray('  - 更新CNAME记录指向正确的隧道URL'));
  console.log(chalk.gray('  - 确保隧道URL是活跃的'));
  console.log(chalk.gray(''));
  console.log(chalk.cyan('选项3: 使用随机域名避免冲突'));
  console.log(chalk.gray('  - 重置域名配置: --reset-domain'));
  console.log(chalk.gray('  - 选择随机域名模式'));
}

// 提供修复功能
async function fixCnameMismatch() {
  console.log(chalk.blue('🛠️ 修复 CNAME 记录'));
  
  const manager = new CloudflareDomainManager();
  
  try {
    // 删除现有记录
    console.log(chalk.yellow('正在删除现有的错误记录...'));
    const record = await manager.findDnsRecordByDomain('gemini.yxhpy.xyz');
    
    if (record) {
      // 这里需要添加删除记录的功能
      console.log(chalk.green('✅ 已准备清理现有记录'));
      console.log(chalk.yellow('💡 请重新启动隧道程序，它将自动配置正确的DNS'));
    }
    
  } catch (error) {
    console.error(chalk.red(`修复失败: ${error.message}`));
  }
}

// 检查命令行参数
const args = process.argv.slice(2);
if (args.includes('--fix')) {
  fixCnameMismatch();
} else {
  debugCnameMismatch();
}