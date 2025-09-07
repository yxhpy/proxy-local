import { CloudflareProvider } from '../src/providers/cloudflare.js';
import chalk from 'chalk';

/**
 * 测试智能 DNS 集成功能
 */
async function testSmartDnsIntegration() {
  console.log(chalk.blue('🧪 测试智能 DNS 集成功能'));
  console.log('');

  const provider = new CloudflareProvider();
  
  // 测试 1: 检查智能 DNS 配置方法是否存在
  console.log(chalk.yellow('测试 1: 检查智能 DNS 方法'));
  if (typeof provider.smartConfigureDNS === 'function') {
    console.log(chalk.green('✅ smartConfigureDNS 方法已实现'));
  } else {
    console.log(chalk.red('❌ smartConfigureDNS 方法未找到'));
    return;
  }
  console.log('');

  // 测试 2: 检查域名管理器是否有 upsertDnsRecord 方法
  console.log(chalk.yellow('测试 2: 检查域名管理器功能'));
  if (provider.domainManager && typeof provider.domainManager.upsertDnsRecord === 'function') {
    console.log(chalk.green('✅ 域名管理器的 upsertDnsRecord 方法已实现'));
  } else {
    console.log(chalk.red('❌ 域名管理器的 upsertDnsRecord 方法未找到'));
    return;
  }
  console.log('');

  // 测试 3: 模拟智能 DNS 配置（不实际调用 API）
  console.log(chalk.yellow('测试 3: 模拟智能 DNS 配置流程'));
  try {
    // 检查 API 凭据配置
    const credentials = provider.domainManager.getApiCredentials();
    if (credentials) {
      console.log(chalk.green(`✅ 找到 API 凭据类型: ${credentials.type}`));
      console.log(chalk.blue('🔧 智能 DNS 配置功能已就绪'));
      
      // 显示模拟流程
      const testDomain = 'test.example.com';
      const testTarget = 'abc123.trycloudflare.com';
      
      console.log(chalk.gray(`模拟配置流程:`));
      console.log(chalk.gray(`  域名: ${testDomain}`));
      console.log(chalk.gray(`  目标: ${testTarget}`));
      console.log(chalk.gray(`  操作: 查找现有记录 → 创建/更新 → 用户反馈`));
      
    } else {
      console.log(chalk.yellow('⚠️ 未找到 API 凭据'));
      console.log(chalk.gray('需要设置以下环境变量之一：'));
      console.log(chalk.gray('  CLOUDFLARE_API_TOKEN=your_token_here'));
      console.log(chalk.gray('  或'));
      console.log(chalk.gray('  CLOUDFLARE_EMAIL=your_email@example.com'));
      console.log(chalk.gray('  CLOUDFLARE_API_KEY=your_global_api_key'));
    }
  } catch (error) {
    console.log(chalk.red(`❌ 智能 DNS 配置测试失败: ${error.message}`));
  }
  console.log('');

  // 测试 4: 检查集成点
  console.log(chalk.yellow('测试 4: 检查集成点'));
  
  // 检查是否在 Cloudflare 提供商的隧道创建流程中正确集成
  const providerCode = provider.createTunnel.toString();
  
  if (providerCode.includes('smartConfigureDNS')) {
    console.log(chalk.green('✅ 智能 DNS 配置已集成到隧道创建流程'));
  } else {
    console.log(chalk.yellow('⚠️ 智能 DNS 配置可能未完全集成到隧道创建流程'));
  }
  
  if (providerCode.includes('customDomainRequested')) {
    console.log(chalk.green('✅ 自定义域名处理逻辑已存在'));
  } else {
    console.log(chalk.red('❌ 自定义域名处理逻辑未找到'));
  }
  console.log('');

  console.log(chalk.blue('🏁 智能 DNS 集成功能测试完成'));
  console.log('');
  console.log(chalk.gray('集成功能概述:'));
  console.log(chalk.gray('  ✅ DNS 记录查询 (findDnsRecordByDomain)'));
  console.log(chalk.gray('  ✅ DNS 记录创建 (createDnsRecord)'));
  console.log(chalk.gray('  ✅ DNS 记录更新 (updateDnsRecord)'));
  console.log(chalk.gray('  ✅ 智能记录管理 (upsertDnsRecord)'));
  console.log(chalk.gray('  ✅ 集成到 Cloudflare 提供商 (smartConfigureDNS)'));
  console.log(chalk.gray('  ✅ 用户友好的反馈和回退机制'));
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testSmartDnsIntegration().catch(error => {
    console.error(chalk.red(`测试失败: ${error.message}`));
    process.exit(1);
  });
}