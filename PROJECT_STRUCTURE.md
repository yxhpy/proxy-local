# 项目结构说明

此文档说明项目的目录结构和文件组织方式。

## 📁 主要目录结构

```
project/
├── 📂 src/                    # 生产代码
│   ├── providers/             # 隧道提供商实现
│   ├── utils/                 # 工具类和辅助函数
│   ├── managers/              # 管理器类
│   └── interfaces/            # 接口定义
├── 📂 tests/                  # 测试文件
├── 📂 debug/                  # 调试脚本
├── 📂 mvp/                    # MVP原型实现
├── 📂 fixes/                  # 问题修复脚本
├── 📂 .taskmaster/           # 任务管理
│   ├── tasks/                # 任务数据
│   ├── docs/                 # 项目文档
│   └── reports/              # 分析报告
├── 📂 .claude/               # Claude Code配置
│   └── commands/             # 自定义命令
└── 📂 bin/                   # 可执行文件
```

## 🎯 核心生产代码 (`src/`)

### Providers
- `cloudflare.js` - Cloudflare隧道提供商主实现

### Utils (核心工具类)
- `atomic-tunnel-lifecycle.js` - 原子化隧道生命周期管理
- `cloudflared-command-builder.js` - 统一cloudflared命令构建
- `cloudflared-error-parser.js` - 智能错误解析器
- `enhanced-logger.js` - 增强日志记录器
- `cloudflare-domain-manager.js` - 域名管理器

## 🧪 开发和测试文件

### Tests (`tests/`)
包含完整的测试套件：
- 集成测试
- 单元测试  
- 兼容性测试
- 端到端测试

### Debug (`debug/`)
调试和分析工具：
- 问题诊断脚本
- 性能分析工具
- 日志分析器
- 根因分析工具

### MVP (`mvp/`)
最小可行产品原型：
- 概念验证实现
- 快速原型开发
- 架构设计验证

### Fixes (`fixes/`)
问题修复脚本：
- 特定Bug修复
- 集成修复
- 性能优化
- 安全修复

## 📋 任务管理 (`.taskmaster/`)

### Tasks
- `tasks.json` - 主任务数据库
- `task-*.md` - 个别任务文档

### Docs
- `Cloudflare隧道设置指南.md` - 官方指南参考
- `research/` - 研究文档和分析

### Reports
- `task-complexity-report.json` - 任务复杂度分析

## ⚙️ 配置文件

### Claude Code (`.claude/`)
- `settings.json` - Claude Code工具配置
- `commands/` - 自定义工作流命令

### 项目配置
- `package.json` - Node.js项目配置
- `.env` - 环境变量配置
- `.mcp.json` - MCP服务器配置

## 🚀 主要功能模块

### 1. 原子化隧道管理
- 事务性操作
- 完整回滚支持
- 状态一致性保证

### 2. 智能错误处理
- 15种错误类型识别
- 自动化处理建议
- 用户友好错误消息

### 3. 多重DNS验证
- 多DNS服务器验证
- HTTP连通性测试
- API回退机制

### 4. 统一命令构建
- 官方指南合规
- 配置文件统一管理
- 参数标准化

## 📈 开发工作流

1. **需求分析** → `.taskmaster/docs/`
2. **MVP开发** → `mvp/`
3. **调试验证** → `debug/`
4. **问题修复** → `fixes/`
5. **测试验证** → `tests/`
6. **生产实现** → `src/`

## 🎯 关键成就

✅ **任务76完成**: 基于官方指南的全面重构
- 原子化生命周期管理
- 智能错误处理 (100%识别率)
- 任务65/75修复集成
- 完整测试覆盖

✅ **架构优化**: 
- 模块化设计
- 依赖注入
- 事务性操作
- 可测试性

✅ **用户体验提升**:
- 智能错误处理
- 自动回退机制
- 详细日志记录
- 友好错误消息

## 📚 文档索引

- 各目录的`README.md` - 详细功能说明
- `CLAUDE.md` - Claude Code集成指南
- `CONTRIBUTING.md` - 贡献指南
- `CHANGELOG.md` - 版本变更记录