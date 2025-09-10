# 项目文档总览

欢迎查看uvx-proxy-local项目的完整文档集合。本目录包含了项目开发、部署、使用和维护的所有相关文档。

## 📁 文档结构

```
docs/
├── README.md                          # 本文件 - 文档总览
├── version-management-release-guide.md  # 版本管理与发布规范指南  
├── release-workflow-guide.md          # 发布工作流使用指南
└── architecture.md                    # 系统架构设计文档
```

## 🎯 快速导航

### 🚀 开发者入门

- **[架构设计文档](architecture.md)** - 了解系统架构和设计原则
- **[版本管理规范](version-management-release-guide.md)** - 掌握版本控制和发布最佳实践
- **[发布工作流指南](release-workflow-guide.md)** - 学习如何进行项目发布

### 📋 工作流程

#### 日常开发流程
1. 阅读 [架构设计文档](architecture.md) 了解项目结构
2. 遵循 [版本管理规范](version-management-release-guide.md) 进行提交
3. 使用 [发布工作流指南](release-workflow-guide.md) 进行版本发布

#### 发布准备流程
1. 运行 `npm run docs:verify` 验证文档一致性
2. 运行 `npm run pre-release` 进行发布前检查
3. 按照 [发布工作流指南](release-workflow-guide.md) 执行发布

### 🛠️ 实用工具

#### 文档管理
- `npm run docs:update` - 自动更新文档中的版本信息
- `npm run docs:verify` - 验证文档与代码的一致性

#### 发布管理
- `npm run pre-release` - 发布前完整检查
- `npm run release` - 完整发布流程
- `npm run release:dry` - 预览发布内容

## 📚 详细文档说明

### [版本管理与发布规范指南](version-management-release-guide.md)

**适用对象**: 开发者、维护者
**重要程度**: ⭐⭐⭐⭐⭐

这是最重要的规范文档，涵盖：
- 语义化版本控制规则
- 约定式提交规范
- 自动化发布流程
- Git工作流最佳实践
- 质量保证标准

**核心内容**:
- 📝 提交消息格式规范
- 🔢 版本号递增规则
- 🚀 发布前检查清单
- 🤖 CI/CD工作流配置
- 📋 文档维护标准

### [发布工作流使用指南](release-workflow-guide.md)

**适用对象**: 所有参与发布的人员
**重要程度**: ⭐⭐⭐⭐

实用的操作指南，包含：
- 快速发布步骤
- GitHub Actions工作流说明
- 手动发布选项
- 应急处理方案
- 发布后验证步骤

**核心内容**:
- 🔄 自动发布流程
- 📱 手动发布选项
- 🚨 紧急修复流程
- 📊 发布统计分析
- 🔧 故障排除指南

### [系统架构设计文档](architecture.md)

**适用对象**: 开发者、架构师
**重要程度**: ⭐⭐⭐

技术实现和设计理念文档。

## 🎯 使用场景指南

### 场景1: 新开发者入职
```bash
# 1. 了解项目架构
cat docs/architecture.md

# 2. 学习开发规范  
cat docs/version-management-release-guide.md

# 3. 验证开发环境
npm run docs:verify
npm test
```

### 场景2: 准备发布新版本
```bash
# 1. 阅读发布指南
cat docs/release-workflow-guide.md

# 2. 执行发布前检查
npm run pre-release

# 3. 进行版本发布
npm run release
```

### 场景3: 文档更新维护
```bash
# 1. 自动更新文档
npm run docs:update

# 2. 验证文档一致性
npm run docs:verify

# 3. 提交文档更改
git add docs/
git commit -m "docs: update project documentation"
```

### 场景4: 问题排查
```bash
# 1. 检查发布配置
cat docs/version-management-release-guide.md | grep -A5 "问题排查"

# 2. 运行诊断命令
npm run pre-release

# 3. 查看GitHub Actions状态
# 访问 .github/workflows/ 查看工作流
```

## 📊 文档维护

### 更新频率
- **版本管理规范**: 每次重大流程变更时更新
- **发布工作流指南**: 每次工具或流程升级时更新  
- **架构文档**: 每次重大架构变更时更新
- **本README**: 每次添加新文档时更新

### 质量保证
- 所有文档变更都需要通过 `npm run docs:verify` 验证
- 重要操作步骤需要实际测试验证
- 保持文档与代码实现的同步更新

### 贡献指南
1. 修改文档前先阅读现有内容，保持风格一致
2. 重要变更建议先提Issue讨论
3. 提交时使用规范的commit message格式
4. 大型文档重组建议分阶段进行

## 🔗 相关资源

### 项目文件
- [CHANGELOG.md](../CHANGELOG.md) - 版本变更历史
- [README.md](../README.md) - 项目主要说明文档  
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 贡献指南
- [package.json](../package.json) - 项目配置

### 开发工具
- [scripts/](../scripts/) - 自动化脚本集合
- [.github/workflows/](../.github/workflows/) - CI/CD工作流
- [tests/](../tests/) - 测试套件

### 外部参考
- [Conventional Commits](https://conventionalcommits.org/) - 约定式提交规范
- [Semantic Versioning](https://semver.org/) - 语义化版本规范
- [GitHub Actions文档](https://docs.github.com/en/actions) - CI/CD工作流
- [npm发布指南](https://docs.npmjs.com/cli/publish) - 包发布最佳实践

---

📝 **文档维护**: 本文档随项目发展持续更新，最后更新时间: 2024-09-10

💡 **反馈建议**: 如发现文档问题或有改进建议，请创建Issue或提交PR