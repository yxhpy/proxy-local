#!/usr/bin/env node

/**
 * Debug文件：分析ES模块中的require错误
 * 
 * 问题：在_verifyDnsRecordCreation方法中出现"require is not defined"错误
 * 原因：项目使用ES模块，但代码中使用了CommonJS的require语句
 * 
 * 错误位置：
 * 1. _verifyDnsRecordCreation方法中：const dns = require('dns').promises;
 * 2. _testHttpConnectivity方法中：const https = require('https');
 */

console.log('🔍 Debug: ES模块require错误分析');
console.log('='.repeat(50));

// 检查package.json中的模块类型
const fs = require('fs');
const path = require('path');

try {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  console.log('📦 Package.json分析:');
  console.log(`   type: ${packageJson.type || 'commonjs'}`);
  
  if (packageJson.type === 'module') {
    console.log('✅ 项目确实使用ES模块');
    console.log('❌ 这解释了为什么require语句失败');
  } else {
    console.log('⚠️ 项目应该使用CommonJS，但仍出现require错误');
  }
  
} catch (error) {
  console.log(`❌ 无法读取package.json: ${error.message}`);
}

// 分析源代码中的require使用
console.log('\n🔍 源代码分析:');

try {
  const sourcePath = path.join(process.cwd(), 'src/providers/cloudflare.js');
  const sourceCode = fs.readFileSync(sourcePath, 'utf8');
  
  // 查找所有require语句
  const requireMatches = sourceCode.match(/require\s*\(['"]([^'"]*)['"]\)/g) || [];
  
  console.log(`找到 ${requireMatches.length} 个require语句:`);
  requireMatches.forEach((match, index) => {
    console.log(`${index + 1}. ${match}`);
  });
  
  // 查找文件顶部的import语句
  const importMatches = sourceCode.match(/^import\s+.*?from\s+['"][^'"]*['"];?$/gm) || [];
  
  console.log(`\n找到 ${importMatches.length} 个import语句:`);
  importMatches.slice(0, 5).forEach((match, index) => {
    console.log(`${index + 1}. ${match}`);
  });
  
  if (importMatches.length > 0 && requireMatches.length > 0) {
    console.log('\n❌ 混合使用了import和require语句');
    console.log('💡 需要将所有require转换为import');
  }
  
} catch (error) {
  console.log(`❌ 无法分析源代码: ${error.message}`);
}

// 提供修复建议
console.log('\n🔧 修复建议:');
console.log('1. 将 const dns = require("dns").promises; 改为:');
console.log('   import { promises as dns } from "dns";');
console.log('2. 将 const https = require("https"); 改为:');
console.log('   import https from "https";');
console.log('3. 确保所有Node.js内置模块使用import语法');
console.log('4. 检查是否有其他require语句需要转换');

console.log('\n📝 注意事项:');
console.log('- ES模块中的import必须在文件顶部');
console.log('- 不能在函数内部使用import（需要用动态import()）');
console.log('- Node.js内置模块支持ES模块导入');