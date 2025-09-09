#!/usr/bin/env node

/**
 * Fix CNAME Cross-User Banned error by deleting the problematic DNS record
 * This allows the tunnel program to recreate it with the correct tunnel URL
 */

import { CloudflareDomainManager } from './src/utils/cloudflare-domain-manager.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

async function fixCnameIssue() {
  console.log(chalk.blue('🛠️ 修复 CNAME Cross-User Banned 错误'));
  console.log(chalk.yellow('此脚本将删除现有的有问题的 DNS 记录，让隧道程序重新创建正确的记录'));
  console.log();

  const manager = new CloudflareDomainManager();
  
  try {
    // 1. 查找现有记录
    console.log(chalk.gray('1. 查找现有 DNS 记录...'));
    const record = await manager.findDnsRecordByDomain('gemini.yxhpy.xyz');
    
    if (!record) {
      console.log(chalk.yellow('⚠️ 未找到现有 DNS 记录，可能已经修复'));
      return;
    }

    console.log(chalk.cyan('找到现有记录:'));
    console.log(chalk.gray(`  类型: ${record.type}`));
    console.log(chalk.gray(`  名称: ${record.name}`));  
    console.log(chalk.gray(`  内容: ${record.content}`));
    console.log(chalk.gray(`  记录ID: ${record.id}`));
    console.log();

    // 2. 测试当前隧道URL是否可用
    console.log(chalk.gray('2. 测试隧道URL可用性...'));
    try {
      const response = await fetch(`https://${record.content}`);
      if (response.status === 404) {
        console.log(chalk.red('❌ 隧道URL返回404，确认记录有问题'));
      } else {
        console.log(chalk.green('✅ 隧道URL正常响应'));
        console.log(chalk.yellow('⚠️ 可能是其他原因导致的Cross-User错误'));
      }
    } catch (error) {
      console.log(chalk.red(`❌ 隧道URL无法访问: ${error.message}`));
    }

    console.log();

    // 3. 确认删除
    const { confirmDelete } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmDelete',
        message: '是否删除现有的 DNS 记录？(这将允许隧道程序重新创建正确的记录)',
        default: true
      }
    ]);

    if (!confirmDelete) {
      console.log(chalk.yellow('取消操作'));
      return;
    }

    // 4. 删除记录
    console.log(chalk.gray('3. 删除DNS记录...'));
    const zoneId = await manager.getZoneId('gemini.yxhpy.xyz');
    await manager.deleteDnsRecord(zoneId, record.id);
    
    console.log();
    console.log(chalk.green('✅ DNS记录删除成功！'));
    console.log();
    console.log(chalk.blue('下一步操作:'));
    console.log(chalk.gray('1. 重新启动隧道程序: npx uvx-proxy-local 8000'));
    console.log(chalk.gray('2. 隧道程序会自动检测到记录缺失并重新创建'));
    console.log(chalk.gray('3. 等待DNS传播(通常1-2分钟)'));
    console.log(chalk.gray('4. 测试访问 https://gemini.yxhpy.xyz'));

  } catch (error) {
    console.error(chalk.red(`操作失败: ${error.message}`));
    console.log();
    console.log(chalk.yellow('备选方案:'));
    console.log(chalk.gray('1. 运行隧道时使用 --reset-domain 参数'));
    console.log(chalk.gray('2. 选择随机域名模式避免冲突'));
    console.log(chalk.gray('3. 或手动在 Cloudflare 控制台删除 DNS 记录'));
  }
}

// 检查是否有必要的依赖
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(chalk.blue('CNAME Cross-User Banned 错误修复工具'));
  console.log();
  console.log(chalk.yellow('用法:'));
  console.log('  node fix-cname-cross-user.js     # 交互式修复');
  console.log();
  console.log(chalk.yellow('错误说明:'));
  console.log('CNAME Cross-User Banned 错误通常发生在:');
  console.log('1. DNS记录指向已过期或无效的隧道URL');
  console.log('2. 隧道URL属于不同的Cloudflare账户');
  console.log('3. DNS记录缓存导致的时序问题');
  console.log();
  console.log(chalk.yellow('解决方案:'));
  console.log('删除现有的有问题的DNS记录，让隧道程序重新创建正确的记录');
} else {
  fixCnameIssue().catch(console.error);
}