#!/usr/bin/env node

/**
 * 发布前检查脚本
 * 确保项目状态符合发布要求
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
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
 * 执行命令检查
 */
function runCheck(name, command, options = {}) {
  const { required = true, timeout = 30000 } = options;
  
  console.log(`📋 ${name}...`);
  
  try {
    const result = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout,
      stdio: 'pipe'
    });
    
    log.success(`${name} 通过`);
    return { success: true, output: result };
  } catch (error) {
    log.error(`${name} 失败`);
    if (error.stdout) {
      console.log(`   输出: ${error.stdout.slice(0, 500)}...`);
    }
    if (error.stderr) {
      console.log(`   错误: ${error.stderr.slice(0, 500)}...`);
    }
    
    return { 
      success: false, 
      error: error.message,
      required 
    };
  }
}

/**
 * 文件存在性检查
 */
function checkFileExists(filePath, description) {
  console.log(`📋 检查 ${description}...`);
  
  const fullPath = path.join(projectRoot, filePath);
  if (fs.existsSync(fullPath)) {
    log.success(`${description} 存在`);
    return true;
  } else {
    log.error(`${description} 不存在: ${filePath}`);
    return false;
  }
}

/**
 * Git状态检查
 */
function checkGitStatus() {
  console.log(`📋 检查Git状态...`);
  
  try {
    // 检查是否有未提交的更改
    const status = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf8'
    });
    
    if (status.trim()) {
      log.warn('发现未提交的更改:');
      console.log(status);
      return { clean: false, hasChanges: true };
    }
    
    // 检查是否与远程同步
    const unpushed = execSync('git log @{u}.. --oneline', {
      cwd: projectRoot,
      encoding: 'utf8'
    }).trim();
    
    if (unpushed) {
      log.warn('发现未推送的提交:');
      console.log(unpushed);
      return { clean: false, hasUnpushed: true };
    }
    
    log.success('Git工作区干净且与远程同步');
    return { clean: true };
  } catch (error) {
    log.error(`Git状态检查失败: ${error.message}`);
    return { clean: false, error: error.message };
  }
}

/**
 * 版本一致性检查
 */
function checkVersionConsistency() {
  console.log(`📋 检查版本一致性...`);
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const version = packageJson.version;
    
    // 检查CHANGELOG中是否有当前版本
    const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      const changelog = fs.readFileSync(changelogPath, 'utf8');
      const versionPattern = new RegExp(`## \\[${version}\\]`);
      
      if (!versionPattern.test(changelog)) {
        log.warn(`CHANGELOG.md 中没有版本 ${version} 的条目`);
        return { consistent: false, reason: 'CHANGELOG missing version entry' };
      }
    }
    
    // 检查CLI帮助中的版本
    try {
      const helpOutput = execSync('node bin/index.js --version', {
        cwd: projectRoot,
        encoding: 'utf8'
      });
      
      if (!helpOutput.includes(version)) {
        log.error(`CLI版本输出与package.json不一致`);
        return { consistent: false, reason: 'CLI version mismatch' };
      }
    } catch (error) {
      log.warn('无法验证CLI版本');
    }
    
    log.success('版本一致性检查通过');
    return { consistent: true, version };
  } catch (error) {
    log.error(`版本检查失败: ${error.message}`);
    return { consistent: false, error: error.message };
  }
}

/**
 * 安全检查
 */
function checkSecurity() {
  console.log(`📋 安全漏洞扫描...`);
  
  try {
    const auditOutput = execSync('npm audit --audit-level moderate --json', {
      cwd: projectRoot,
      encoding: 'utf8'
    });
    
    const auditResult = JSON.parse(auditOutput);
    
    if (auditResult.metadata.vulnerabilities.moderate > 0 || 
        auditResult.metadata.vulnerabilities.high > 0 || 
        auditResult.metadata.vulnerabilities.critical > 0) {
      log.warn('发现安全漏洞（仅警告，不阻止发布）');
      console.log(`   中等风险: ${auditResult.metadata.vulnerabilities.moderate}`);
      console.log(`   高风险: ${auditResult.metadata.vulnerabilities.high}`);
      console.log(`   严重: ${auditResult.metadata.vulnerabilities.critical}`);
      return { secure: true, vulnerabilities: auditResult.metadata.vulnerabilities, warning: true };
    }
    
    log.success('安全检查通过');
    return { secure: true };
  } catch (error) {
    if (error.status === 0) {
      log.success('安全检查通过');
      return { secure: true };
    } else {
      log.warn('安全检查出现问题，建议手动运行 npm audit');
      return { secure: true, warning: 'audit check failed' };
    }
  }
}

/**
 * 主检查函数
 */
async function main() {
  console.log('🚀 发布前检查开始...\n');
  
  const checks = [
    // 文件存在性检查
    () => checkFileExists('package.json', 'package.json'),
    () => checkFileExists('README.md', 'README.md'),
    () => checkFileExists('CHANGELOG.md', 'CHANGELOG.md'),
    () => checkFileExists('bin/index.js', '主程序文件'),
    
    // 代码质量检查
    () => runCheck('运行测试套件', 'npm test'),
    () => runCheck('验证文档一致性', 'npm run docs:verify'),
    () => runCheck('检查包内容', 'npm pack --dry-run'),
    
    // 可选检查
    () => runCheck('ESLint检查', 'npx eslint . --ext .js', { required: false }),
    () => runCheck('Prettier格式检查', 'npx prettier --check .', { required: false }),
    
    // Git和版本检查
    checkGitStatus,
    checkVersionConsistency,
    checkSecurity
  ];
  
  let failed = 0;
  let warnings = 0;
  const results = [];
  
  for (const check of checks) {
    console.log('');
    
    try {
      const result = check();
      results.push(result);
      
      if (typeof result === 'object' && result !== null) {
        if ('success' in result && !result.success && result.required === true) {
          failed++;
        } else if ('clean' in result && !result.clean) {
          warnings++;
        } else if ('consistent' in result && !result.consistent) {
          failed++;
        } else if ('secure' in result && !result.secure) {
          failed++;
        }
      } else if (result === false) {
        failed++;
      }
    } catch (error) {
      log.error(`检查执行失败: ${error.message}`);
      failed++;
    }
  }
  
  // 输出总结
  console.log('\n📊 检查总结');
  console.log('═'.repeat(50));
  
  if (failed === 0 && warnings === 0) {
    log.success('🎉 所有检查通过，可以安全发布！');
    
    console.log('\n💡 建议的发布步骤:');
    console.log('  1. 运行 npm run release 进行自动发布');
    console.log('  2. 或使用 GitHub Actions 手动触发发布');
    console.log('  3. 发布后验证包的可用性');
    
    process.exit(0);
  } else {
    if (failed > 0) {
      log.error(`💥 有 ${failed} 项关键检查失败，必须修复后再发布`);
    }
    
    if (warnings > 0) {
      log.warn(`⚠️  有 ${warnings} 项警告，建议修复后再发布`);
    }
    
    console.log('\n🛠️  修复建议:');
    
    // 提供具体的修复建议
    if (failed > 0) {
      console.log('  关键问题:');
      console.log('  - 运行失败的测试并修复');
      console.log('  - 修复文档一致性问题');
      console.log('  - 解决安全漏洞');
      console.log('  - 确保版本信息一致');
    }
    
    if (warnings > 0) {
      console.log('  警告问题:');
      console.log('  - 提交并推送所有更改');
      console.log('  - 运行代码格式化');
      console.log('  - 更新文档');
    }
    
    console.log('\n🔄 修复后重新运行此检查脚本');
    
    process.exit(failed > 0 ? 1 : 0);
  }
}

// 运行检查
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log.error(`检查过程出错: ${error.message}`);
    process.exit(1);
  });
}

export { main as preReleaseCheck };