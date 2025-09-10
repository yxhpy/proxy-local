#!/usr/bin/env node

/**
 * 文档自动更新脚本
 * 基于 package.json 和实际代码功能自动更新相关文档
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
 * 写入文件内容
 */
function writeFile(filePath, content) {
  try {
    fs.writeFileSync(path.join(projectRoot, filePath), content, 'utf8');
    return true;
  } catch (error) {
    log.error(`无法写入文件 ${filePath}: ${error.message}`);
    return false;
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
    keywords: packageJson.keywords || [],
    author: packageJson.author
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
 * 更新README.md中的版本信息
 */
function updateReadmeVersion() {
  log.info('更新 README.md 中的版本信息...');
  
  const packageInfo = getPackageInfo();
  let readme = readFile('README.md');
  let updated = false;
  
  // 更新全局安装命令中的版本号
  const globalInstallPattern = new RegExp(
    `npm install -g ${packageInfo.name}(@[\\d\\.]+)?`,
    'g'
  );
  if (globalInstallPattern.test(readme)) {
    readme = readme.replace(
      globalInstallPattern,
      `npm install -g ${packageInfo.name}`
    );
    updated = true;
  }
  
  // 更新npx命令示例
  const npxPattern = new RegExp(
    `npx ${packageInfo.name}(@[\\d\\.]+)?`,
    'g'
  );
  if (npxPattern.test(readme)) {
    readme = readme.replace(
      npxPattern,
      `npx ${packageInfo.name}`
    );
    updated = true;
  }
  
  // 更新项目描述（如果不一致）
  const descriptionPattern = /^# .+$/m;
  const currentTitle = readme.match(descriptionPattern);
  if (currentTitle && !currentTitle[0].includes(packageInfo.name)) {
    readme = readme.replace(
      descriptionPattern,
      `# ${packageInfo.name}\n\n${packageInfo.description}`
    );
    updated = true;
  }
  
  if (updated) {
    writeFile('README.md', readme);
    log.success('README.md 版本信息已更新');
  } else {
    log.info('README.md 版本信息已是最新');
  }
  
  return updated;
}

/**
 * 更新README.md中的CLI选项文档
 */
function updateReadmeCLIOptions() {
  log.info('更新 README.md 中的CLI选项文档...');
  
  let readme = readFile('README.md');
  const cliHelp = execCLI('--help');
  
  // 提取CLI帮助信息中的选项
  const options = [];
  const helpLines = cliHelp.split('\n');
  let inOptions = false;
  
  helpLines.forEach(line => {
    if (line.trim() === 'Options:') {
      inOptions = true;
      return;
    }
    
    if (inOptions && line.trim() && !line.startsWith('  -h, --help')) {
      const optMatch = line.match(/^\s*(-[a-zA-Z], )?(--[a-zA-Z-]+)(\s+<[^>]+>)?\s+(.+)$/);
      if (optMatch) {
        const [, shortOpt, longOpt, param, description] = optMatch;
        options.push({
          short: shortOpt ? shortOpt.replace(', ', '') : '',
          long: longOpt,
          param: param || '',
          description: description
        });
      }
    }
  });
  
  // 生成选项文档表格
  let optionsTable = '| 选项 | 说明 |\n|------|------|\n';
  options.forEach(opt => {
    const optionStr = opt.short ? `${opt.short}, ${opt.long}${opt.param}` : `${opt.long}${opt.param}`;
    optionsTable += `| \`${optionStr}\` | ${opt.description} |\n`;
  });
  
  // 查找并替换CLI选项表格（如果存在）
  const tablePattern = /\| 选项 \| 说明 \|[\s\S]*?\n(?=\n[^|])/;
  if (tablePattern.test(readme)) {
    readme = readme.replace(tablePattern, optionsTable);
    writeFile('README.md', readme);
    log.success('README.md CLI选项文档已更新');
    return true;
  } else {
    log.warn('未找到CLI选项表格，请手动添加');
    return false;
  }
}

/**
 * 更新README.md中的提供商信息
 */
function updateReadmeProviders() {
  log.info('更新 README.md 中的提供商信息...');
  
  let readme = readFile('README.md');
  const providersOutput = execCLI('--list-providers');
  
  // 解析提供商信息
  const providerBlocks = providersOutput.split(/^⭐?\s*[a-zA-Z0-9-]+$/m);
  const providers = [];
  
  const lines = providersOutput.split('\n');
  let currentProvider = null;
  
  lines.forEach(line => {
    const providerMatch = line.match(/^⭐?\s*([a-zA-Z0-9-]+)$/);
    if (providerMatch) {
      if (currentProvider) {
        providers.push(currentProvider);
      }
      currentProvider = {
        name: providerMatch[1],
        starred: line.startsWith('⭐'),
        needConfirm: '',
        speed: '',
        https: '',
        description: ''
      };
    } else if (currentProvider) {
      if (line.includes('确认页面:')) {
        currentProvider.needConfirm = line.includes('无需确认') ? '✅ 无需确认' : '⚠️ 需要确认';
      } else if (line.includes('速度:')) {
        currentProvider.speed = line.match(/速度: (\w+)/)?.[1] || '';
      } else if (line.includes('HTTPS:')) {
        currentProvider.https = line.includes('支持') ? '支持' : '不支持';
      } else if (line.includes('💡')) {
        currentProvider.description = line.replace(/.*💡\s*/, '');
      }
    }
  });
  
  if (currentProvider) {
    providers.push(currentProvider);
  }
  
  // 生成提供商表格
  let providerTable = '| 提供商 | 确认页面 | 速度 | HTTPS | 特点 |\n|--------|----------|------|-----------|------|\n';
  providers.forEach(provider => {
    const name = provider.starred ? `⭐ **${provider.name}**` : `**${provider.name}**`;
    providerTable += `| ${name} | ${provider.needConfirm} | ${provider.speed} | ${provider.https} | ${provider.description} |\n`;
  });
  
  // 查找并替换提供商表格（如果存在）
  const tablePattern = /\| 提供商 \| 确认页面 \| 速度 \| HTTPS \| 特点 \|[\s\S]*?\n(?=\n[^|])/;
  if (tablePattern.test(readme)) {
    readme = readme.replace(tablePattern, providerTable);
    writeFile('README.md', readme);
    log.success('README.md 提供商信息已更新');
    return true;
  } else {
    log.warn('未找到提供商表格，请手动添加');
    return false;
  }
}

/**
 * 更新package.json中的脚本
 */
function updatePackageScripts() {
  log.info('更新 package.json 中的脚本...');
  
  const packagePath = path.join(projectRoot, 'package.json');
  const packageContent = fs.readFileSync(packagePath, 'utf8');
  const packageJson = JSON.parse(packageContent);
  
  let updated = false;
  
  // 确保有必要的脚本
  const requiredScripts = {
    'docs:update': 'node scripts/update-docs.js',
    'docs:verify': 'node scripts/verify-docs.js',
    'prepublishOnly': 'npm run test && npm run docs:verify',
    'version': 'npm run docs:update && conventional-changelog -p angular -i CHANGELOG.md -s && git add CHANGELOG.md docs/ README.md',
    'postversion': 'git push --follow-tags origin master'
  };
  
  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }
  
  Object.entries(requiredScripts).forEach(([script, command]) => {
    if (!packageJson.scripts[script]) {
      packageJson.scripts[script] = command;
      updated = true;
      log.info(`添加脚本: ${script}`);
    } else if (packageJson.scripts[script] !== command) {
      log.warn(`脚本 ${script} 已存在但与推荐配置不同`);
    }
  });
  
  if (updated) {
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    log.success('package.json 脚本已更新');
  } else {
    log.info('package.json 脚本已是最新');
  }
  
  return updated;
}

/**
 * 生成或更新CHANGELOG.md
 */
function updateChangelog() {
  log.info('检查 CHANGELOG.md...');
  
  const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
  
  if (!fs.existsSync(changelogPath)) {
    log.warn('CHANGELOG.md 不存在，建议运行 standard-version 生成');
    return false;
  }
  
  const changelog = readFile('CHANGELOG.md');
  const packageInfo = getPackageInfo();
  
  // 检查是否有当前版本的条目
  const versionPattern = new RegExp(`## \\[${packageInfo.version}\\]`);
  if (!versionPattern.test(changelog)) {
    log.warn(`CHANGELOG.md 中没有当前版本 ${packageInfo.version} 的条目`);
    log.info('建议运行 npm run release 或 standard-version 生成变更日志');
    return false;
  } else {
    log.success('CHANGELOG.md 包含当前版本条目');
    return true;
  }
}

/**
 * 创建发布前检查脚本
 */
function createPreReleaseScript() {
  log.info('创建发布前检查脚本...');
  
  const scriptContent = `#!/usr/bin/env node

/**
 * 发布前检查脚本
 * 确保项目状态符合发布要求
 */

import { execSync } from 'child_process';

const checks = [
  {
    name: '运行测试套件',
    command: 'npm test',
    required: true
  },
  {
    name: '验证文档一致性',
    command: 'npm run docs:verify',
    required: true
  },
  {
    name: '检查安全漏洞',
    command: 'npm audit --audit-level moderate',
    required: true
  },
  {
    name: '检查代码格式',
    command: 'npm run lint',
    required: false
  }
];

console.log('🚀 发布前检查开始...\n');

let failed = 0;

for (const check of checks) {
  console.log(`📋 ${check.name}...`);
  
  try {
    execSync(check.command, { stdio: 'pipe', encoding: 'utf8' });
    console.log(`✅ ${check.name} 通过\n`);
  } catch (error) {
    console.log(`❌ ${check.name} 失败`);
    console.log(`   错误: ${error.message}\n`);
    
    if (check.required) {
      failed++;
    }
  }
}

if (failed === 0) {
  console.log('🎉 所有检查通过，可以发布！');
  process.exit(0);
} else {
  console.log(`💥 有 ${failed} 项必需检查失败，请修复后再发布。`);
  process.exit(1);
}
`;

  if (writeFile('scripts/pre-release-check.js', scriptContent)) {
    log.success('发布前检查脚本已创建');
    return true;
  }
  
  return false;
}

/**
 * 主更新函数
 */
async function main() {
  console.log('📝 开始文档自动更新...\n');
  
  const updates = [
    { name: 'README版本信息', fn: updateReadmeVersion },
    { name: 'README CLI选项', fn: updateReadmeCLIOptions },
    { name: 'README提供商信息', fn: updateReadmeProviders },
    { name: 'package.json脚本', fn: updatePackageScripts },
    { name: 'CHANGELOG检查', fn: updateChangelog },
    { name: '发布前检查脚本', fn: createPreReleaseScript }
  ];
  
  let totalUpdates = 0;
  
  for (const update of updates) {
    console.log(`\n📋 ${update.name}`);
    console.log('─'.repeat(50));
    
    try {
      const result = update.fn();
      if (result) {
        totalUpdates++;
      }
    } catch (error) {
      log.error(`更新 ${update.name} 时出错: ${error.message}`);
    }
  }
  
  // 输出总结
  console.log('\n📊 更新总结');
  console.log('═'.repeat(50));
  
  if (totalUpdates > 0) {
    log.success(`完成 ${totalUpdates} 项文档更新`);
    
    console.log('\n💡 建议下一步:');
    console.log('  - 运行 npm run docs:verify 验证文档一致性');
    console.log('  - 检查更新的内容是否正确');
    console.log('  - 提交变更到版本控制系统');
  } else {
    log.info('所有文档已是最新状态');
  }
  
  console.log('\\n🔍 运行验证检查...');
  try {
    execSync('node scripts/verify-docs.js', {
      cwd: projectRoot,
      stdio: 'inherit'
    });
  } catch (error) {
    log.warn('文档验证发现问题，请检查并修复');
  }
}

// 运行更新
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log.error(`更新过程出错: ${error.message}`);
    process.exit(1);
  });
}

export { main as updateDocs };`;

  if (writeFile('scripts/update-docs.js', scriptContent)) {
    log.success('文档更新脚本已创建');
    return true;
  }
  
  return false;
}

// 运行更新
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log.error(`更新过程出错: ${error.message}`);
    process.exit(1);
  });
}

export { main as updateDocs };