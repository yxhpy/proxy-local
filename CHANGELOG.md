# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [3.5.0](https://github.com/yxhpy/proxy-local/compare/v3.4.0...v3.5.0) (2025-09-10)


### Features

* 完善发布工作流和测试套件 ([626bdec](https://github.com/yxhpy/proxy-local/commit/626bdec36038ab4a225f348571004a5f0d3ad849))


### Bug Fixes

* 修复安全漏洞和发布前检查逻辑 ([a74cfbe](https://github.com/yxhpy/proxy-local/commit/a74cfbe2a737b755a3bb32fe6e7ac861a55542c2))
* 更新CLI版本号到3.4.0 ([4d60191](https://github.com/yxhpy/proxy-local/commit/4d6019108682ec349a46971d09d39a5d641b9406))

## [3.3.0](https://github.com/yxhpy/proxy-local/compare/v3.2.1...v3.3.0) (2025-09-07)


### Features

* add version management and release scripts ([84ea3b6](https://github.com/yxhpy/proxy-local/commit/84ea3b6b1fc36ae5ba38fcad26aee11ee8112921))

## [3.2.0] - 2025-09-06

### 🎉 新功能 (Features)

- **配置文件支持** - 新增完整的配置管理系统
  - 支持多种配置文件格式：`.uvxrc`, `.uvxrc.json`, `.uvxrc.yaml`, `.uvx.config.js`
  - 支持 `package.json` 中的 `uvx` 字段配置
  - 配置优先级：CLI 参数 > 环境变量 > 用户配置文件 > 项目配置文件 > 默认值
  - 新增 `--show-config` 命令查看当前有效配置

- **多提供商集成** - 扩展隧道提供商支持
  - 新增 Cloudflare Tunnel 提供商支持
  - 完善 Pinggy 提供商集成
  - 优化 Serveo 提供商实现
  - 重构 LocalTunnel 提供商以符合新架构

- **优化输出格式** - 全面提升用户体验
  - 新增彩色输出和图标支持，提升可读性
  - 智能输出格式化器 (`OutputFormatter`)
  - 支持 `--no-colors` 和 `--no-icons` 选项
  - 优化错误信息和警告显示
  - 新增详细的隧道状态信息展示

### 🔧 改进 (Improvements)

- **架构重构** - 提升系统可维护性
  - 实现抽象的 `TunnelProvider` 接口
  - 新增 `ProviderManager` 统一管理提供商
  - 完善依赖注入和接口解耦
  - 优化错误处理和重试机制

- **智能回退机制** - 增强连接可靠性
  - 改进提供商选择策略
  - 优化失败检测和自动切换逻辑
  - 新增提供商可用性检测

- **配置管理优化**
  - Cloudflare 认证信息自动存储在 `~/.uvx/config.json`
  - 支持环境变量配置所有选项
  - 配置文件热加载和验证

### 🛠️ 技术改进

- **测试覆盖** - 完善测试体系
  - 新增 7 个完整的测试套件
  - 覆盖提供商管理、接口验证、CLI 解析等
  - 新增 Cloudflare 提供商专项测试
  - 完善回退机制和输出格式化测试

- **代码质量** - 提升代码标准
  - 统一错误处理模式
  - 改进代码结构和模块化设计
  - 优化异步操作和资源管理

### 🚀 性能优化

- 提升隧道建立速度
- 优化内存使用和资源释放
- 改进网络连接超时处理

### 📚 文档更新

- 完善 README.md 使用说明
- 新增配置文件详细说明和示例
- 更新 CLI 命令参考文档
- 新增故障排除指南

### 🏗️ 架构变更

- 重构提供商架构，采用插件化设计
- 统一配置管理接口
- 改进错误处理和日志系统

---

## [3.1.0] - Previous Version

### 基础功能
- 基本的内网穿透功能
- 初始的提供商支持
- 简单的 CLI 接口

---

*更多历史版本信息请参考 Git 提交历史*