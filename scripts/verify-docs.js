#!/usr/bin/env node

/**
 * 文档一致性验证脚本
 * 确保 README.md 和其他文档与实际代码功能保持一致
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// 颜色输出工具
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`)
};

/**
 * 读取文件内容
 */
function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(projectRoot, filePath), 'utf8');
  } catch (error) {
    throw new Error(`无法读取文件 ${filePath}: ${error.message}`);
  }
}

/**
 * 获取package.json信息
 */
function getPackageInfo() {
  const packageJson = JSON.parse(readFile('package.json'));
  return {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    scripts: packageJson.scripts,
    bin: packageJson.bin
  };
}

/**
 * 执行CLI命令获取实际输出
 */
function execCLI(command) {
  try {
    return execSync(`node bin/index.js ${command}`, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 10000
    });
  } catch (error) {
    return error.stdout || error.message;
  }
}

/**
 * 验证版本号一致性
 */
function verifyVersionConsistency() {
  log.info('验证版本号一致性...');
  
  const packageInfo = getPackageInfo();
  const readme = readFile('README.md');
  const cliHelp = execCLI('--help');
  
  const errors = [];
  
  // 检查CLI帮助中的版本
  if (cliHelp.includes('多提供商内网穿透 CLI 工具')) {
    log.success('CLI描述与package.json一致');
  } else {
    errors.push('CLI描述与package.json不一致');
  }
  
  // 检查README中的安装命令
  const installCommands = [
    `npm install -g ${packageInfo.name}`,
    `npx ${packageInfo.name}`
  ];
  
  let installConsistent = true;
  installCommands.forEach(cmd => {
    if (!readme.includes(cmd)) {
      installConsistent = false;
      errors.push(`README中缺少安装命令: ${cmd}`);
    }
  });
  
  if (installConsistent) {
    log.success('README中的安装命令一致');
  }
  
  return errors;
}

/**
 * 验证CLI选项一致性
 */
function verifyCLIOptionsConsistency() {
  log.info('验证CLI选项一致性...');
  
  const readme = readFile('README.md');
  const cliHelp = execCLI('--help');
  const binFile = readFile('bin/index.js');
  
  const errors = [];
  
  // 提取CLI帮助中的选项
  const helpOptions = [];
  const helpLines = cliHelp.split('\n');
  helpLines.forEach(line => {
    const optMatch = line.match(/^\s*(-[a-zA-Z], )?(--[a-zA-Z-]+)/);
    if (optMatch) {
      helpOptions.push(optMatch[2]);
    }
  });
  
  // 关键选项列表（应该在README中有文档）
  const keyOptions = [
    '--provider',
    '--list-providers',
    '--show-config',
    '--cloudflare-login',
    '--cloudflare-logout',
    '--cloudflare-custom',
    '--reset-domain',
    '--timeout',
    '--retries',
    '--verbose',
    '--no-colors',
    '--no-icons',
    '--daemon',
    '--list',
    '--kill',
    '--kill-all',
    '--status'
  ];
  
  // 检查每个关键选项是否在README中有说明
  keyOptions.forEach(option => {
    if (!readme.includes(option)) {
      errors.push(`README中缺少选项说明: ${option}`);
    } else {
      log.success(`选项 ${option} 在README中有说明`);
    }
  });
  
  return errors;
}

/**
 * 验证提供商信息一致性
 */
function verifyProvidersConsistency() {
  log.info('验证提供商信息一致性...');
  
  const readme = readFile('README.md');
  const providersOutput = execCLI('--list-providers');
  
  const errors = [];
  
  // 从CLI输出中提取提供商信息
  const providerPattern = /^⭐?\s*([a-zA-Z0-9-]+)$/gm;
  const providers = [];
  let match;
  while ((match = providerPattern.exec(providersOutput)) !== null) {
    providers.push(match[1]);
  }
  
  // 检查README中的提供商表格
  const expectedProviders = ['cloudflare', 'pinggy', 'serveo', 'localtunnel'];
  expectedProviders.forEach(provider => {
    if (readme.includes(provider)) {
      log.success(`提供商 ${provider} 在README中有说明`);
    } else {
      errors.push(`README中缺少提供商说明: ${provider}`);
    }
  });
  
  // 检查是否有新增提供商未在README中更新
  providers.forEach(provider => {
    if (!expectedProviders.includes(provider) && provider !== 'cloudflare-v2') {
      errors.push(`发现新提供商 ${provider} 但README未更新`);
    }
  });
  
  return errors;
}

/**
 * 验证配置示例有效性
 */
function verifyConfigExamples() {
  log.info('验证配置示例有效性...');
  
  const readme = readFile('README.md');
  const errors = [];
  
  // 检查配置文件示例是否存在
  const configExamples = [
    '.uvxrc',
    '.uvxrc.json',
    '.uvxrc.yaml',
    '.uvx.config.js'
  ];
  
  configExamples.forEach(configFile => {
    if (readme.includes(configFile)) {
      log.success(`配置文件 ${configFile} 在README中有说明`);
    } else {
      errors.push(`README中缺少配置文件说明: ${configFile}`);
    }
  });
  
  // 检查环境变量示例
  const envVars = [
    'UVX_PROVIDER',
    'UVX_TIMEOUT',
    'UVX_RETRIES',
    'UVX_CLOUDFLARE_TEMP_MODE',
    'UVX_VERBOSE'
  ];
  
  envVars.forEach(envVar => {
    if (readme.includes(envVar)) {
      log.success(`环境变量 ${envVar} 在README中有说明`);
    } else {
      errors.push(`README中缺少环境变量说明: ${envVar}`);
    }
  });
  
  return errors;
}

/**
 * 验证脚本命令一致性
 */
function verifyScriptsConsistency() {
  log.info('验证脚本命令一致性...');
  
  const packageInfo = getPackageInfo();
  const errors = [];
  
  // 检查必要的脚本是否存在
  const requiredScripts = ['test', 'start', 'release'];
  requiredScripts.forEach(script => {
    if (packageInfo.scripts[script]) {
      log.success(`脚本 ${script} 存在`);
    } else {
      errors.push(`package.json中缺少必要脚本: ${script}`);
    }
  });
  
  // 检查发布脚本是否完整
  if (packageInfo.scripts.release) {
    const releaseScript = packageInfo.scripts.release;
    const requiredCommands = [
      { cmd: 'npm test', alt: ['npm run pre-release', 'npm run test'] },
      { cmd: 'standard-version' },
      { cmd: 'git push' },
      { cmd: 'npm publish' }
    ];
    
    requiredCommands.forEach(({ cmd, alt }) => {
      const hasCmd = releaseScript.includes(cmd) || 
                    (alt && alt.some(altCmd => releaseScript.includes(altCmd)));
      
      if (hasCmd) {
        log.success(`发布脚本包含: ${cmd}`);
      } else {
        errors.push(`发布脚本缺少: ${cmd}`);
      }
    });
  }
  
  return errors;
}

/**
 * 验证文档链接有效性
 */
function verifyDocumentLinks() {
  log.info('验证文档链接有效性...');
  
  const readme = readFile('README.md');
  const errors = [];
  
  // 检查内部链接的文件是否存在
  const internalLinks = [
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'LICENSE'
  ];
  
  internalLinks.forEach(file => {
    if (readme.includes(file)) {
      try {
        readFile(file);
        log.success(`链接文件 ${file} 存在`);
      } catch (error) {
        errors.push(`README中引用的文件不存在: ${file}`);
      }
    }
  });
  
  return errors;
}

/**
 * 主验证函数
 */
async function main() {
  console.log('🔍 开始文档一致性验证...\n');
  
  const verifications = [
    { name: '版本号一致性', fn: verifyVersionConsistency },
    { name: 'CLI选项一致性', fn: verifyCLIOptionsConsistency },
    { name: '提供商信息一致性', fn: verifyProvidersConsistency },
    { name: '配置示例有效性', fn: verifyConfigExamples },
    { name: '脚本命令一致性', fn: verifyScriptsConsistency },
    { name: '文档链接有效性', fn: verifyDocumentLinks }
  ];
  
  let totalErrors = [];
  
  for (const verification of verifications) {
    console.log(`\n📋 ${verification.name}`);
    console.log('─'.repeat(50));
    
    try {
      const errors = verification.fn();
      totalErrors = totalErrors.concat(errors);
      
      if (errors.length === 0) {
        log.success(`${verification.name} 验证通过`);
      } else {
        errors.forEach(error => log.error(error));
      }
    } catch (error) {
      log.error(`验证 ${verification.name} 时出错: ${error.message}`);
      totalErrors.push(`验证 ${verification.name} 时出错`);
    }
  }
  
  // 输出总结
  console.log('\n📊 验证总结');
  console.log('═'.repeat(50));
  
  if (totalErrors.length === 0) {
    log.success('所有文档验证通过！文档与代码保持一致。');
    process.exit(0);
  } else {
    log.error(`发现 ${totalErrors.length} 个问题需要修复:`);
    totalErrors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
    
    console.log('\n💡 建议:');
    console.log('  - 更新 README.md 以反映最新的功能和选项');
    console.log('  - 确保所有CLI选项都有相应的文档说明');
    console.log('  - 检查配置示例的准确性');
    console.log('  - 验证内部链接文件的存在性');
    
    process.exit(1);
  }
}

// 运行验证
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log.error(`验证过程出错: ${error.message}`);
    process.exit(1);
  });
}

export { main as verifyDocs };