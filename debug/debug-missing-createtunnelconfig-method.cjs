#!/usr/bin/env node

/**
 * Debug脚本：分析CloudflareProvider缺少createTunnelConfig方法的问题
 * 
 * 错误信息：this.createTunnelConfig is not a function
 * 
 * 分析步骤：
 * 1. 查找createTunnelConfig方法的调用位置
 * 2. 分析该方法应该实现的功能
 * 3. 查找相关的配置文件创建逻辑
 * 4. 提供修复方案
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Debug: 分析CloudflareProvider缺少createTunnelConfig方法的问题');
console.log('=' .repeat(60));

const filePath = './src/providers/cloudflare.js';

// 1. 查找createTunnelConfig方法调用位置
console.log('\n📍 步骤1: 查找createTunnelConfig方法调用位置');
try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const callMatches = [];
  lines.forEach((line, index) => {
    if (line.includes('createTunnelConfig') && !line.trim().startsWith('//') && !line.includes('* ')) {
      callMatches.push({
        lineNumber: index + 1,
        content: line.trim(),
        context: lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3))
      });
    }
  });
  
  if (callMatches.length > 0) {
    console.log(`✅ 找到 ${callMatches.length} 处调用：`);
    callMatches.forEach(match => {
      console.log(`\n📍 第 ${match.lineNumber} 行:`);
      console.log(`   ${match.content}`);
      console.log(`\n🔍 上下文:`);
      match.context.forEach((contextLine, idx) => {
        const actualLineNum = match.lineNumber - 2 + idx;
        const marker = actualLineNum === match.lineNumber ? '>>>' : '   ';
        console.log(`   ${marker} ${actualLineNum}: ${contextLine}`);
      });
    });
  } else {
    console.log('❌ 未找到createTunnelConfig方法调用');
  }
} catch (error) {
  console.error(`❌ 读取文件失败: ${error.message}`);
}

// 2. 查找方法定义
console.log('\n📍 步骤2: 检查createTunnelConfig方法是否已定义');
try {
  const content = fs.readFileSync(filePath, 'utf8');
  const methodPattern = /(async\s+)?createTunnelConfig\s*\(/;
  
  if (methodPattern.test(content)) {
    console.log('✅ 找到createTunnelConfig方法定义');
  } else {
    console.log('❌ 未找到createTunnelConfig方法定义 - 这就是问题所在！');
  }
} catch (error) {
  console.error(`❌ 检查方法定义失败: ${error.message}`);
}

// 3. 分析cloudflared配置文件格式
console.log('\n📍 步骤3: 分析cloudflared配置文件格式');
const configPath = require('os').homedir() + '/.cloudflared/config.yml';
if (fs.existsSync(configPath)) {
  console.log('✅ 找到现有的cloudflared配置文件:');
  console.log(`📂 位置: ${configPath}`);
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    console.log('\n📄 现有配置内容:');
    console.log(configContent);
  } catch (error) {
    console.log(`⚠️ 无法读取配置文件: ${error.message}`);
  }
} else {
  console.log('⚠️ 未找到现有的cloudflared配置文件');
}

// 4. 查找相关的隧道配置逻辑
console.log('\n📍 步骤4: 查找相关的隧道配置逻辑');
try {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 查找隧道配置相关的关键词
  const keywords = ['config.yml', 'tunnel.*config', 'ingress', 'credentials'];
  const configRelatedLines = [];
  
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'i');
      if (regex.test(line) && !line.trim().startsWith('//') && !line.includes('* ')) {
        configRelatedLines.push({
          lineNumber: index + 1,
          content: line.trim(),
          keyword: keyword
        });
      }
    });
  });
  
  if (configRelatedLines.length > 0) {
    console.log(`✅ 找到 ${configRelatedLines.length} 处配置相关代码:`);
    configRelatedLines.forEach(item => {
      console.log(`   第 ${item.lineNumber} 行 [${item.keyword}]: ${item.content}`);
    });
  } else {
    console.log('⚠️ 未找到明显的配置相关代码');
  }
} catch (error) {
  console.error(`❌ 分析配置逻辑失败: ${error.message}`);
}

// 5. 提供修复建议
console.log('\n📍 步骤5: 修复建议');
console.log('=' .repeat(40));
console.log('✅ 问题诊断完成！');
console.log('\n🔧 需要创建的方法:');
console.log('   - createTunnelConfig(tunnelId, port, domain)');
console.log('\n📝 方法功能:');
console.log('   - 创建cloudflared配置文件 (~/.cloudflared/config.yml)');
console.log('   - 配置隧道ID、凭据文件路径和流量路由规则');
console.log('   - 支持HTTP/HTTPS流量转发到本地端口');
console.log('\n🎯 配置文件格式示例:');
console.log('   tunnel: <tunnel-id>');
console.log('   credentials-file: ~/.cloudflared/<tunnel-id>.json');
console.log('   ingress:');
console.log('     - hostname: <domain>');
console.log('       service: http://localhost:<port>');
console.log('     - service: http_status:404');
console.log('\n🚀 下一步: 实现createTunnelConfig方法');