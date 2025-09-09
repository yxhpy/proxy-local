#!/usr/bin/env node

/**
 * 修复 cloudflare.js 中的语法错误
 * 
 * 问题：修复脚本导致了重复的代码片段，需要清理
 */

import fs from 'fs';

console.log('🔧 修复cloudflare.js语法错误...');

const filePath = './src/providers/cloudflare.js';
let content = fs.readFileSync(filePath, 'utf8');

// 查找并移除重复的代码段
console.log('📍 查找重复代码段...');

// 查找第一个重复片段开始位置
const duplicateStart1 = content.indexOf('\n          \n          // 检查是否为DNS记录冲突');
if (duplicateStart1 !== -1) {
  // 查找第一个重复片段结束位置 (下一个方法开始)
  const duplicateEnd1 = content.indexOf('\n  /**\n   * 检查错误输出是否表示 DNS 记录冲突', duplicateStart1);
  
  if (duplicateEnd1 !== -1) {
    console.log(`📍 找到第一个重复代码段: ${duplicateStart1} - ${duplicateEnd1}`);
    // 移除重复代码段
    content = content.substring(0, duplicateStart1) + content.substring(duplicateEnd1);
    console.log('✅ 已移除第一个重复代码段');
  }
}

// 检查是否还有其他重复片段
const duplicateCheck = content.match(/^\s+\/\/ 检查是否为DNS记录冲突/gm);
if (duplicateCheck && duplicateCheck.length > 1) {
  console.log('⚠️  发现更多重复代码，需要手动清理');
}

// 写入修复后的内容
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ 语法错误修复完成');

// 验证修复
try {
  // 尝试简单的语法检查
  const { spawn } = require('child_process');
  const checkSyntax = spawn('node', ['-c', filePath], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  checkSyntax.on('close', (code) => {
    if (code === 0) {
      console.log('✅ 语法检查通过');
    } else {
      console.log('❌ 语法检查失败，可能还有其他问题');
    }
  });
  
  checkSyntax.stderr.on('data', (data) => {
    console.log('❌ 语法错误:', data.toString());
  });
  
} catch (error) {
  console.log('⚠️  无法进行语法检查:', error.message);
}