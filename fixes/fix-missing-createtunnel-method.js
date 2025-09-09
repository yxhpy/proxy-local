#!/usr/bin/env node

/**
 * 修复CloudflareProvider缺少createTunnel方法实现的问题
 * 
 * 问题：
 * - CloudflareProvider继承了TunnelProvider但没有实现必需的createTunnel方法
 * - 现有代码有handleAuthenticatedFlow和handleUnauthenticatedFlow等方法
 * - 需要创建一个符合接口规范的createTunnel方法作为统一入口
 * 
 * 修复：
 * - 添加createTunnel方法实现，整合现有的认证和未认证流程逻辑
 */

import fs from 'fs';

console.log('🔧 修复CloudflareProvider缺少createTunnel方法...');

const filePath = './src/providers/cloudflare.js';
let content = fs.readFileSync(filePath, 'utf8');

// 找到插入位置 - 在现有方法之后但在handleAuthenticatedFlow之前
const insertPosition = content.indexOf('  /**\n   * 处理已认证用户的流程');

if (insertPosition === -1) {
  console.error('❌ 无法找到合适的插入位置');
  process.exit(1);
}

console.log(`📍 找到插入位置: ${insertPosition}`);

// 创建createTunnel方法实现
const createTunnelMethod = `
  /**
   * 创建隧道 - TunnelProvider接口实现
   * @param {number} port - 本地端口号
   * @param {Object} options - 创建选项
   * @returns {Promise<TunnelResult>} 隧道结果
   */
  async createTunnel(port, options = {}) {
    try {
      console.log(\`正在使用 Cloudflare Tunnel 创建隧道到端口 \${port}...\`);
      
      // 检查是否可用，如果不可用则尝试自动安装
      const available = await this.isAvailable({ autoInstall: options.autoInstall !== false });
      if (!available) {
        throw new Error('cloudflared 工具不可用，请先安装');
      }

      // 新的入口逻辑：以cert.pem文件作为登录状态的唯一判断依据
      const certPath = join(homedir(), '.cloudflared', 'cert.pem');
      const isAuthenticated = existsSync(certPath);
      
      console.log(chalk.blue('🔐 检查用户认证状态...'));
      
      if (isAuthenticated) {
        console.log(chalk.green('✅ 检测到cloudflared认证（发现cert.pem文件）'));
        console.log(chalk.blue('  → 进入认证后流程'));
        // 进入认证后流程
        return await this.handleAuthenticatedFlow(port, options);
      } else {
        console.log(chalk.yellow('❌ 未检测到cloudflared认证（未发现cert.pem文件）'));
        console.log(chalk.blue('  → 显示用户选择菜单'));
        // 显示双路径选择菜单
        return await this.handleUnauthenticatedFlow(port, options);
      }

    } catch (error) {
      // 清理进程
      await this.closeTunnel();
      
      console.log(chalk.red('❌ 隧道创建失败'));
      
      // 提供详细的错误诊断和解决方案
      this.provideErrorDiagnostics(error, port);
      
      // 处理各种可能的错误
      if (error.message.includes('connection refused')) {
        throw new Error(\`无法连接到本地端口 \${port}，请确保服务已启动\`);
      } else if (error.message.includes('cloudflared 工具不可用')) {
        throw new Error('cloudflared 工具未安装，请手动安装或重试自动安装');
      } else if (error.message.includes('login required') || error.message.includes('not logged in')) {
        throw new Error('需要登录 Cloudflare 账户，请运行: cloudflared tunnel login');
      } else if (error.message.includes('DNS')) {
        throw new Error(\`DNS 配置失败: \${error.message}，请检查域名配置\`);
      } else {
        throw new Error(\`Cloudflare Tunnel 创建失败: \${error.message}\`);
      }
    }
  }

`;

// 插入新方法
const beforeInsert = content.substring(0, insertPosition);
const afterInsert = content.substring(insertPosition);
const newContent = beforeInsert + createTunnelMethod.trim() + '\n\n  ' + afterInsert;

// 写入修复后的文件
fs.writeFileSync(filePath, newContent, 'utf8');

console.log('✅ createTunnel方法添加完成');

// 验证修复
const verifyContent = fs.readFileSync(filePath, 'utf8');
if (verifyContent.includes('async createTunnel(port, options = {})')) {
  console.log('✅ 修复验证成功：createTunnel方法已正确添加');
} else {
  console.error('❌ 修复验证失败：方法未正确添加');
  process.exit(1);
}

console.log('');
console.log('🎉 修复完成！现在CloudflareProvider应该能正常工作了');
console.log('');
console.log('💡 修复内容：');
console.log('- 添加了createTunnel方法作为TunnelProvider接口的实现');
console.log('- 整合了现有的认证和非认证流程逻辑');
console.log('- 保持了错误处理和诊断功能');
console.log('');
console.log('🔄 现在可以重新测试: node ./bin/index.js 8000');