#!/usr/bin/env node

/**
 * 测试文件：验证ES模块兼容性修复
 * 
 * 测试内容：
 * 1. 检查require语句是否已全部转换为import
 * 2. 验证import语句的正确性
 * 3. 检查cleanupTempTunnel方法是否存在
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 ES模块兼容性修复验证测试');
console.log('='.repeat(50));

async function runTests() {
  const sourcePath = path.join(process.cwd(), 'src/providers/cloudflare.js');
  
  try {
    const sourceCode = fs.readFileSync(sourcePath, 'utf8');
    
    // 测试1：检查require语句
    console.log('=== 测试1: 检查require语句 ===');
    const requireMatches = sourceCode.match(/require\s*\(['"]([^'"]*)['"]\)/g) || [];
    
    if (requireMatches.length === 0) {
      console.log('✅ 没有找到require语句');
    } else {
      console.log(`❌ 仍有 ${requireMatches.length} 个require语句:`);
      requireMatches.forEach((match, index) => {
        console.log(`  ${index + 1}. ${match}`);
      });
      return false;
    }
    
    // 测试2：检查import语句
    console.log('\n=== 测试2: 检查import语句 ===');
    const importMatches = sourceCode.match(/^import\s+.*?from\s+['"][^'"]*['"];?$/gm) || [];
    
    // 检查必需的import
    const requiredImports = [
      'dns',
      'https',
      'child_process',
      'fs',
      'os',
      'path',
      'chalk'
    ];
    
    let allImportsFound = true;
    for (const requiredImport of requiredImports) {
      const found = importMatches.some(imp => imp.includes(requiredImport));
      if (found) {
        console.log(`✅ 找到 ${requiredImport} import`);
      } else {
        console.log(`❌ 缺少 ${requiredImport} import`);
        allImportsFound = false;
      }
    }
    
    // 测试3：检查cleanupTempTunnel方法
    console.log('\n=== 测试3: 检查cleanupTempTunnel方法 ===');
    
    if (sourceCode.includes('async cleanupTempTunnel(')) {
      console.log('✅ cleanupTempTunnel方法存在');
      
      // 检查方法内容
      if (sourceCode.includes('正在清理命名隧道') && 
          (sourceCode.includes('tunnel\', \'delete') || sourceCode.includes('tunnel delete'))) {
        console.log('✅ cleanupTempTunnel方法实现完整');
      } else {
        console.log('❌ cleanupTempTunnel方法实现不完整');
        console.log('   检查项：');
        console.log(`   - 包含清理消息: ${sourceCode.includes('正在清理命名隧道')}`);
        console.log(`   - 包含删除命令: ${sourceCode.includes('tunnel\', \'delete') || sourceCode.includes('tunnel delete')}`);
        allImportsFound = false;
      }
    } else {
      console.log('❌ cleanupTempTunnel方法不存在');
      allImportsFound = false;
    }
    
    // 测试4：检查动态import使用
    console.log('\n=== 测试4: 检查动态import ===');
    
    if (sourceCode.includes('await import(\'dns\')')) {
      console.log('✅ 使用了正确的动态import语法');
    } else {
      console.log('❌ 未找到动态import或语法不正确');
      allImportsFound = false;
    }
    
    // 测试5：语法检查
    console.log('\n=== 测试5: 基本语法检查 ===');
    
    // 检查是否有明显的语法错误
    const syntaxIssues = [];
    
    if (sourceCode.includes('const dns = require')) {
      syntaxIssues.push('仍使用require导入dns模块');
    }
    
    if (sourceCode.includes('const https = require')) {
      syntaxIssues.push('仍使用require导入https模块');
    }
    
    if (syntaxIssues.length === 0) {
      console.log('✅ 没有发现明显语法问题');
    } else {
      console.log('❌ 发现语法问题:');
      syntaxIssues.forEach(issue => console.log(`  - ${issue}`));
      allImportsFound = false;
    }
    
    // 总结
    console.log('\n' + '='.repeat(50));
    if (allImportsFound && requireMatches.length === 0) {
      console.log('🎉 ES模块兼容性修复验证通过！');
      console.log('✅ 所有require已转换为import');
      console.log('✅ cleanupTempTunnel方法已添加');
      console.log('✅ 语法检查通过');
      return true;
    } else {
      console.log('❌ ES模块兼容性修复验证失败');
      console.log('需要进一步修复上述问题');
      return false;
    }
    
  } catch (error) {
    console.log(`❌ 测试过程出错: ${error.message}`);
    return false;
  }
}

// 运行测试
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };