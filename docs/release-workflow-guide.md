# 发布工作流使用指南

## 📋 概述

本项目使用完全自动化的发布工作流，基于约定式提交、语义化版本控制和GitHub Actions实现自动版本管理和包发布。

## 🚀 快速发布

### 自动发布（推荐）

项目配置了自动发布工作流，当代码推送到master分支时会自动检查并发布：

```bash
# 1. 完成功能开发并提交（使用约定式提交格式）
git add .
git commit -m "feat: add new tunnel provider support"

# 2. 推送到master分支
git push origin master

# 3. GitHub Actions会自动：
#    - 运行测试
#    - 检查文档一致性  
#    - 分析提交类型决定版本号
#    - 生成CHANGELOG.md
#    - 创建Git标签
#    - 发布到npm
#    - 创建GitHub Release
```

### 手动发布

如果需要手动控制发布过程：

```bash
# 方式1：使用发布前检查和自动发布
npm run release

# 方式2：仅预览不实际发布
npm run release:dry

# 方式3：发布预发布版本
npm run release:beta
npm run release:alpha
```

## 🛠️ 发布前准备

### 1. 运行发布前检查

```bash
npm run pre-release
```

这会检查：
- ✅ 所有测试通过
- ✅ 文档与代码一致性
- ✅ 安全漏洞扫描
- ✅ Git工作区状态
- ✅ 版本信息一致性
- ✅ 必要文件存在

### 2. 更新文档（可选）

```bash
# 自动更新文档中的版本信息和CLI选项
npm run docs:update

# 验证文档一致性
npm run docs:verify
```

## 📝 提交规范

使用约定式提交格式，这决定了版本号的自动递增规则：

### 基本格式

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 提交类型和版本影响

| 提交类型 | 版本影响 | 示例 |
|---------|----------|------|
| `feat:` | MINOR (新功能) | `feat: add cloudflare v2 provider` |
| `fix:` | PATCH (bug修复) | `fix: resolve DNS validation timeout` |
| `BREAKING CHANGE:` | MAJOR (不兼容更改) | `feat!: redesign provider interface` |
| `docs:` | 无版本变化 | `docs: update README installation guide` |
| `chore:` | 无版本变化 | `chore: update dependencies` |

### 完整提交示例

```bash
# 新功能提交
git commit -m "feat(providers): add intelligent DNS management

- Implement smart domain conflict resolution
- Add interactive domain selection menu  
- Support fixed domain configuration

Closes #123"

# 修复bug提交
git commit -m "fix(cli): resolve timeout handling in tunnel creation

- Fix promise timeout not being respected
- Add proper error cleanup on timeout
- Improve error messaging for timeout scenarios

Fixes #456"

# 重大变更提交  
git commit -m "feat(api)!: redesign provider interface

BREAKING CHANGE: Provider interface now requires async init() method.

Migration guide:
- Update all custom providers to implement init() method
- Change synchronous provider creation to async
- See MIGRATION.md for detailed instructions"
```

## 🤖 GitHub Actions 工作流

### 自动CI/CD工作流

#### 持续集成 (CI)
- **触发条件**: 推送到任何分支、创建PR
- **测试矩阵**: Node.js 16, 18, 20
- **操作系统**: Ubuntu, Windows, macOS  
- **检查项目**: 测试、文档验证、安全审计

#### 自动发布 (Release)
- **触发条件**: 推送到master分支且有feat/fix提交
- **发布流程**: 测试 → 版本管理 → 发布npm → 创建GitHub Release
- **自动化程度**: 完全无人工干预

#### 手动发布 (Manual Release)
- **触发方式**: GitHub界面手动触发
- **选项配置**: 版本类型、预发布标识、是否跳过npm
- **支持预览**: Dry-run模式预览发布内容

### 工作流文件说明

```
.github/workflows/
├── ci.yml                 # 持续集成工作流
├── release.yml            # 自动发布工作流  
└── manual-release.yml     # 手动发布工作流
```

## 📊 版本发布策略

### 发布频率

- **补丁版本 (PATCH)**: 每1-2周，主要是bug修复
- **次要版本 (MINOR)**: 每月一次，新功能发布
- **主要版本 (MAJOR)**: 每6-12个月，重大架构变更

### 预发布管理

```bash
# Beta版本（功能测试）
npm run release:beta
# 生成: 3.4.1-beta.1

# Alpha版本（早期测试）  
npm run release:alpha
# 生成: 3.5.0-alpha.1

# RC版本（发布候选）
npm version prerelease --preid=rc
npm publish --tag=rc
# 生成: 3.5.0-rc.1
```

### 版本标签策略

- `latest`: 最新稳定版本（默认安装）
- `beta`: Beta测试版本
- `alpha`: Alpha测试版本  
- `rc`: 发布候选版本
- `next`: 下一个主要版本的预览

## 🔧 本地发布脚本

### 完整发布流程

```bash
# scripts/release.sh
#!/bin/bash

echo "🚀 开始发布流程..."

# 1. 发布前检查
echo "📋 运行发布前检查..."
npm run pre-release || exit 1

# 2. 更新文档
echo "📝 更新文档..."  
npm run docs:update

# 3. 选择发布类型
echo "请选择发布类型:"
echo "1) patch - 补丁版本"  
echo "2) minor - 次要版本"
echo "3) major - 主要版本"
echo "4) beta - Beta版本"
read -p "选择 (1-4): " choice

case $choice in
  1) npm run release ;;
  2) npm run release -- --release-as minor ;;  
  3) npm run release -- --release-as major ;;
  4) npm run release:beta ;;
  *) echo "无效选择" && exit 1 ;;
esac

echo "✅ 发布完成!"
```

## 📋 发布检查清单

### 发布前必检项目

- [ ] 所有测试通过 (`npm test`)
- [ ] 文档与代码一致 (`npm run docs:verify`)
- [ ] 无安全漏洞 (`npm audit`)
- [ ] Git工作区干净
- [ ] 所有更改已推送到远程
- [ ] CHANGELOG.md包含新版本条目
- [ ] 版本号符合语义化版本规范

### 发布后验证项目

- [ ] npm包已成功发布
- [ ] GitHub Release已创建  
- [ ] 安装测试: `npm install -g uvx-proxy-local@latest`
- [ ] 功能测试: `uvx-proxy-local --help`
- [ ] 文档网站已更新（如果有）
- [ ] 社区通知已发出（如果需要）

## 🚨 应急处理

### 回滚发布

如果发布出现问题，可以使用以下方法回滚：

```bash
# 1. 从npm撤回版本（发布后24小时内）
npm unpublish uvx-proxy-local@3.4.1

# 2. 删除Git标签
git tag -d v3.4.1
git push origin :refs/tags/v3.4.1

# 3. 删除GitHub Release
# 在GitHub界面手动删除

# 4. 重置到上一个版本
git reset --hard v3.4.0
```

### 紧急修复发布

```bash
# 1. 从master创建hotfix分支
git checkout master
git checkout -b hotfix/critical-fix

# 2. 修复问题并测试
# ... 修复代码 ...
npm test

# 3. 提交修复
git commit -m "fix: resolve critical security vulnerability"

# 4. 合并并立即发布
git checkout master  
git merge hotfix/critical-fix
npm run release

# 5. 通知用户立即升级
```

## 📚 相关资源

### 工具文档
- [standard-version](https://github.com/conventional-changelog/standard-version)
- [Conventional Commits](https://conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Actions](https://docs.github.com/en/actions)

### 项目脚本
- `npm run pre-release` - 发布前检查
- `npm run docs:verify` - 文档验证
- `npm run docs:update` - 文档更新  
- `npm run release` - 完整发布流程
- `npm run release:dry` - 发布预览

### 监控和分析
- [npm包统计](https://www.npmjs.com/package/uvx-proxy-local)
- [GitHub Insights](../../insights)
- [下载统计](https://npm-stat.com/charts.html?package=uvx-proxy-local)

---

*本指南会随着工作流的优化持续更新。最后更新: 2024-09-10*