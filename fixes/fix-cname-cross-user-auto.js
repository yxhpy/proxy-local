#!/usr/bin/env node

/**
 * Automatically fix CNAME Cross-User Banned error by deleting the problematic DNS record
 */

import { CloudflareDomainManager } from './src/utils/cloudflare-domain-manager.js';
import chalk from 'chalk';

async function autoFixCnameIssue() {
  console.log(chalk.blue('🛠️ 自动修复 CNAME Cross-User Banned 错误'));
  
  const manager = new CloudflareDomainManager();
  
  try {
    // 查找现有记录
    console.log(chalk.gray('查找现有 DNS 记录...'));
    const record = await manager.findDnsRecordByDomain('gemini.yxhpy.xyz');
    
    if (!record) {
      console.log(chalk.yellow('⚠️ 未找到现有 DNS 记录'));
      return;
    }

    console.log(chalk.cyan(`找到记录: ${record.type} ${record.name} → ${record.content}`));

    // 测试隧道URL
    console.log(chalk.gray('测试隧道URL可用性...'));
    try {
      const response = await fetch(`https://${record.content}`, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.status === 404) {
        console.log(chalk.red('❌ 隧道URL返回404，确认需要删除记录'));
        
        // 自动删除记录
        console.log(chalk.gray('正在删除有问题的DNS记录...'));
        const zoneId = await manager.getZoneId('gemini.yxhpy.xyz');
        await manager.deleteDnsRecord(zoneId, record.id);
        
        console.log();
        console.log(chalk.green('✅ 修复完成！DNS记录已删除'));
        console.log(chalk.blue('现在重新启动隧道程序，它将自动创建正确的记录'));
        
      } else {
        console.log(chalk.yellow(`⚠️ 隧道URL返回状态: ${response.status}`));
        console.log(chalk.yellow('可能是其他原因导致的错误'));
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ 隧道URL无法访问: ${error.message}`));
      console.log(chalk.gray('正在删除无效的DNS记录...'));
      
      const zoneId = await manager.getZoneId('gemini.yxhpy.xyz');
      await manager.deleteDnsRecord(zoneId, record.id);
      
      console.log();
      console.log(chalk.green('✅ 修复完成！无效的DNS记录已删除'));
      console.log(chalk.blue('现在重新启动隧道程序，它将自动创建正确的记录'));
    }

  } catch (error) {
    console.error(chalk.red(`修复失败: ${error.message}`));
  }
}

autoFixCnameIssue();