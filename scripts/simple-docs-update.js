#!/usr/bin/env node

/**
 * 简化的文档更新脚本
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 读取 package.json
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const version = packageJson.version;

console.log('🔄 正在更新文档中的版本信息...');

// 更新 README.md 中的版本信息
try {
  const readmePath = join(projectRoot, 'README.md');
  const readmeContent = readFileSync(readmePath, 'utf8');
  
  // 简单的版本替换逻辑
  const updatedContent = readmeContent.replace(
    /npm install -g uvx-proxy-local@[\d.]+/g,
    `npm install -g uvx-proxy-local@${version}`
  );
  
  if (updatedContent !== readmeContent) {
    writeFileSync(readmePath, updatedContent, 'utf8');
    console.log('✅ README.md 版本信息已更新');
  } else {
    console.log('ℹ️  README.md 版本信息无需更新');
  }
} catch (error) {
  console.log('⚠️  README.md 更新失败:', error.message);
}

console.log('✅ 文档更新完成');