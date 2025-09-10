# 版本管理与发布规范指南

## 📋 概述

本指南基于2024年最佳实践，融合了语义化版本控制、Git工作流、npm发布流程和自动化CI/CD的标准规范，为本项目提供完整的版本管理和发布解决方案。

## 🎯 核心原则

- **语义化版本控制 (Semantic Versioning)**：遵循 MAJOR.MINOR.PATCH 格式
- **约定式提交 (Conventional Commits)**：标准化提交消息格式
- **自动化优先**：减少手动操作，防止人为错误
- **文档驱动**：确保所有变更都有完整记录
- **向后兼容**：保证API稳定性和用户体验

## 📦 版本管理策略

### 版本号规则

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]

示例：
3.4.0          # 正式版本
3.5.0-beta.1   # 预发布版本
3.4.1          # 补丁版本
```

#### 版本递增规则

| 版本类型 | 场景 | 示例 |
|---------|------|------|
| **MAJOR** | 不兼容的API修改 | 2.5.0 → 3.0.0 |
| **MINOR** | 向后兼容的功能新增 | 2.5.0 → 2.6.0 |
| **PATCH** | 向后兼容的问题修复 | 2.5.0 → 2.5.1 |
| **PRERELEASE** | 预发布版本 | 2.5.0 → 2.6.0-beta.1 |

### 分支策略

```
main/master     # 生产分支，只接受经过测试的代码
develop         # 开发分支，功能集成
feature/*       # 功能开发分支
release/*       # 发布准备分支
hotfix/*        # 紧急修复分支
```

## 🔄 提交规范

### 约定式提交格式

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 提交类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add cloudflare tunnel support` |
| `fix` | 问题修复 | `fix: resolve DNS validation error` |
| `docs` | 文档更新 | `docs: update README installation guide` |
| `style` | 代码格式化 | `style: format provider manager code` |
| `refactor` | 代码重构 | `refactor: extract tunnel lifecycle logic` |
| `test` | 测试相关 | `test: add integration tests for providers` |
| `chore` | 构建维护 | `chore: update dependencies` |
| `perf` | 性能优化 | `perf: optimize tunnel connection speed` |
| `ci` | CI/CD相关 | `ci: add automated release workflow` |
| `build` | 构建系统 | `build: configure webpack for production` |

### 提交示例

```bash
# 功能新增
git commit -m "feat(providers): add intelligent DNS management for cloudflare

- Implement smart domain conflict resolution
- Add interactive domain selection menu
- Support fixed domain configuration
- Include domain reset functionality

Closes #123"

# 问题修复
git commit -m "fix(cli): resolve timeout handling in tunnel creation

- Fix promise timeout not being respected
- Add proper error cleanup on timeout
- Improve error messaging for timeout scenarios

Fixes #456"

# 重大变更
git commit -m "feat(api): redesign provider interface

BREAKING CHANGE: Provider interface now requires async init() method.
Migration guide available in MIGRATION.md"
```

## 🚀 发布流程

### 1. 发布前检查清单

```bash
# 1. 确保所有测试通过
npm test

# 2. 检查依赖安全性
npm audit

# 3. 验证构建
npm run build  # 如果有构建步骤

# 4. 验证包内容
npm pack --dry-run

# 5. 检查文档一致性
npm run docs:verify  # 自定义脚本
```

### 2. 版本发布命令

#### 标准发布
```bash
# 自动版本管理和发布 (推荐)
npm run release

# 预览发布内容
npm run release:dry

# 手动版本控制
npm version patch   # 补丁版本
npm version minor   # 次要版本
npm version major   # 主要版本
```

#### 预发布
```bash
# Beta版本发布
npm run release:beta

# 或手动
npm version prerelease --preid=beta
npm publish --tag=beta
```

### 3. package.json 脚本配置

```json
{
  "scripts": {
    "prepublishOnly": "npm run test && npm run build",
    "version": "npm run docs:update && conventional-changelog -p angular -i CHANGELOG.md -s && git add CHANGELOG.md docs/",
    "postversion": "git push --follow-tags origin master",
    "release": "npm test && standard-version && git push --follow-tags origin master && npm publish",
    "release:dry": "npm test && standard-version --dry-run",
    "release:beta": "npm test && standard-version --prerelease beta && git push --follow-tags origin master && npm publish --tag beta",
    "release:alpha": "npm test && standard-version --prerelease alpha && git push --follow-tags origin master && npm publish --tag alpha",
    "docs:update": "node scripts/update-docs.js",
    "docs:verify": "node scripts/verify-docs.js"
  }
}
```

## 📝 文档管理

### 自动化文档更新

#### CHANGELOG.md 管理
```bash
# 基于提交生成变更日志
conventional-changelog -p angular -i CHANGELOG.md -s

# 或使用 standard-version (自动)
standard-version
```

#### README.md 版本同步
```javascript
// scripts/update-docs.js
const fs = require('fs');
const { version } = require('../package.json');

// 更新安装命令中的版本号
let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace(
  /npm install -g uvx-proxy-local@[\d\.]*/g,
  `npm install -g uvx-proxy-local@${version}`
);

fs.writeFileSync('README.md', readme);
```

### 文档一致性验证

```javascript
// scripts/verify-docs.js
const { execSync } = require('child_process');
const { version } = require('../package.json');

// 验证README中的版本信息
// 验证功能描述与实际代码一致性
// 验证配置选项文档
// 验证示例代码可执行性

console.log('✅ 文档验证通过');
```

## 🔧 依赖管理

### package.json 配置最佳实践

```json
{
  "name": "uvx-proxy-local",
  "version": "3.4.0",
  "engines": {
    "node": ">=16.0.0",
    "npm": ">=8.0.0"
  },
  "files": [
    "bin/",
    "src/",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

### 依赖版本策略

```json
{
  "dependencies": {
    "commander": "^14.0.0",    // 兼容的次版本更新
    "chalk": "5.6.0"           // 锁定版本（重要依赖）
  },
  "devDependencies": {
    "standard-version": "^9.5.0"
  }
}
```

## 🤖 自动化工作流

### GitHub Actions 配置

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [ master, main ]
  pull_request:
    branches: [ master, main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16, 18, 20]
    
    steps:
    - uses: actions/checkout@v4
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - run: npm ci
    - run: npm test
    - run: npm run build --if-present

  release:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    
    steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
        token: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        registry-url: 'https://registry.npmjs.org/'
        cache: 'npm'
    
    - run: npm ci
    - run: npm test
    
    - name: Release
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      run: |
        git config user.name "github-actions[bot]"
        git config user.email "github-actions[bot]@users.noreply.github.com"
        npm run release
```

### 安全配置

```yaml
# 权限最小化原则
permissions:
  contents: write
  issues: write
  pull-requests: write
  packages: write
```

## 🔍 质量保证

### 发布前验证

```bash
# 1. 代码质量检查
npm run lint
npm run type-check  # TypeScript项目

# 2. 安全扫描
npm audit --audit-level moderate

# 3. 性能基准测试
npm run benchmark  # 如果有

# 4. 兼容性测试
npm run test:compatibility

# 5. 包大小检查
npm run size-check
```

### 版本兼容性矩阵

| Node.js版本 | 项目版本 | 状态 |
|------------|---------|------|
| 16.x | 3.4.0+ | ✅ 支持 |
| 18.x | 3.0.0+ | ✅ 推荐 |
| 20.x | 3.0.0+ | ✅ 推荐 |
| 14.x | < 3.0.0 | ⚠️ 已废弃 |

## 📊 发布统计

### 发布频率指标

- **补丁版本**: 每1-2周，修复关键问题
- **次要版本**: 每月，新增功能特性
- **主要版本**: 每6-12个月，重大架构变更

### 发布质量指标

- **测试覆盖率**: ≥ 80%
- **构建成功率**: ≥ 95%
- **回滚率**: ≤ 2%
- **用户反馈响应**: ≤ 24小时

## 🚨 紧急发布流程

### Hotfix 流程

```bash
# 1. 从master创建hotfix分支
git checkout master
git pull origin master
git checkout -b hotfix/critical-fix-v3.4.1

# 2. 修复问题并测试
# ... 代码修复 ...
npm test

# 3. 提交修复
git commit -m "fix: resolve critical security vulnerability

- Fix XSS vulnerability in tunnel URL display
- Add input sanitization
- Update security documentation

Security: Fixes CVE-2024-XXXX"

# 4. 合并到master并发布
git checkout master
git merge hotfix/critical-fix-v3.4.1
npm version patch
git push --follow-tags origin master
npm publish

# 5. 合并到develop分支
git checkout develop
git merge master
```

## 📋 发布检查清单

### 发布前 (Pre-Release)

- [ ] 所有测试通过
- [ ] 代码审查完成
- [ ] 文档已更新
- [ ] CHANGELOG.md 已生成
- [ ] 版本号已确定
- [ ] 依赖项已更新
- [ ] 安全扫描无问题
- [ ] 性能测试通过

### 发布时 (During Release)

- [ ] 创建发布分支
- [ ] 运行发布脚本
- [ ] 验证包发布成功
- [ ] 创建GitHub发布
- [ ] 标签已推送
- [ ] 通知相关团队

### 发布后 (Post-Release)

- [ ] 验证安装可用性
- [ ] 监控错误报告
- [ ] 更新下游项目
- [ ] 社区通告发布
- [ ] 收集用户反馈
- [ ] 准备下个版本规划

## 🎯 最佳实践总结

### DO (推荐做法)

1. **使用语义化版本控制**，让用户清楚了解变更影响
2. **自动生成CHANGELOG**，基于约定式提交
3. **保持小而频繁的发布**，降低风险
4. **全面的测试覆盖**，确保质量
5. **文档同步更新**，保持一致性
6. **使用预发布版本**，让用户提前测试

### DON'T (避免做法)

1. **不要跳过测试**直接发布
2. **不要手动编辑版本号**，使用工具管理
3. **不要忽略向后兼容性**
4. **不要在周五发布重大更新**
5. **不要忘记更新依赖项**
6. **不要发布未经验证的代码**

## 🔗 相关工具和资源

### 核心工具

- [standard-version](https://github.com/conventional-changelog/standard-version) - 自动版本管理
- [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog) - 变更日志生成
- [semantic-release](https://github.com/semantic-release/semantic-release) - 全自动发布
- [commitizen](https://github.com/commitizen/cz-cli) - 交互式提交工具

### 辅助工具

- [husky](https://typicode.github.io/husky/) - Git hooks 管理
- [lint-staged](https://github.com/okonet/lint-staged) - 暂存文件检查
- [npm-check-updates](https://github.com/raineorshine/npm-check-updates) - 依赖更新检查

### 参考文档

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Conventional Commits](https://conventionalcommits.org/)
- [npm-scripts Documentation](https://docs.npmjs.com/cli/v6/using-npm/scripts/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

*本指南将随着项目发展和最佳实践的变化持续更新。最后更新: 2024-09-10*