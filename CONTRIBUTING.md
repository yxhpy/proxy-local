# 贡献指南

感谢您对 uvx-proxy-local 项目的关注！我们欢迎任何形式的贡献，包括功能请求、错误报告、代码改进和文档完善。

## 📋 开发环境设置

### 1. 环境要求

- **Node.js**: v18.0.0 或更高版本
- **npm**: v8.0.0 或更高版本
- **Git**: 用于版本控制

### 2. 项目设置

```bash
# 克隆项目
git clone https://github.com/yxhpy/proxy-local.git
cd proxy-local

# 安装依赖
npm install

# 测试项目是否运行正常
npm test
```

### 3. 开发工具

项目使用以下工具链：
- **测试框架**: 自定义测试套件
- **版本管理**: standard-version (约定式提交)
- **代码结构**: ES modules
- **进程管理**: 内置进程管理器

## 🎯 项目架构

### 核心组件

- **`bin/index.js`**: 主入口文件，CLI 解析和命令处理
- **`src/providers/`**: 隧道提供商实现
  - `interface.js`: 提供商接口定义
  - `manager.js`: 提供商管理器
  - `cloudflare.js`, `pinggy.js`, `serveo.js`, `localtunnel.js`: 各提供商实现
- **`src/config/`**: 配置系统
- **`src/utils/`**: 工具函数和辅助模块
- **`test/`**: 测试文件

### 设计原则

1. **提供商抽象**: 所有隧道提供商遵循统一接口
2. **回退机制**: 智能提供商选择和故障转移
3. **配置分层**: 支持多种配置方式的优先级系统
4. **进程管理**: 支持后台运行和进程监控

## 🔧 开发流程

### 1. 创建功能分支

```bash
git checkout -b feature/your-feature-name
```

### 2. 开发和测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm run test:provider-manager
npm run test:cloudflare
npm run test:fallback

# 本地测试 CLI
node bin/index.js --help
node bin/index.js 8080 --provider=pinggy
```

### 3. 提交代码

我们使用 **约定式提交** (Conventional Commits) 规范：

#### 提交消息格式

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

#### 类型 (Type)

- **feat**: 新功能
- **fix**: 错误修复
- **docs**: 文档更新
- **style**: 代码格式调整（不影响功能）
- **refactor**: 代码重构
- **test**: 测试相关
- **chore**: 构建过程或辅助工具的变动

#### 作用域 (Scope) - 可选

- `provider`: 提供商相关
- `config`: 配置系统
- `cli`: CLI 接口
- `process`: 进程管理
- `dns`: DNS 管理
- `auth`: 认证相关

#### 示例提交消息

```bash
# 新功能
git commit -m "feat(provider): add Cloudflare tunnel support with custom domains"

# 错误修复
git commit -m "fix(dns): resolve domain conflict handling in interactive menu"

# 文档更新
git commit -m "docs: update README with Cloudflare setup instructions"

# 重构
git commit -m "refactor(provider): extract common tunnel validation logic"
```

## 🧪 测试指南

### 测试架构

项目包含 7 个主要测试套件：

1. **ProviderManager Tests**: 提供商注册和管理
2. **Interface Validation Tests**: 接口合规性验证
3. **CLI Argument Parsing Tests**: 命令行参数解析
4. **Cloudflare Provider Tests**: Cloudflare 提供商功能
5. **Fallback Mechanism Tests**: 智能回退机制
6. **Output Formatter Tests**: 输出格式化
7. **Configuration Loader Tests**: 配置加载

### 添加新测试

如果您添加新功能，请确保：

1. **单元测试**: 为核心逻辑添加单元测试
2. **集成测试**: 测试功能与现有系统的集成
3. **错误场景**: 测试错误处理和边缘情况

示例测试结构：
```javascript
// test/your-feature.test.js
export class YourFeatureTests {
    static async run() {
        console.log('🧪 Running Your Feature Tests...');
        
        await this.testBasicFunctionality();
        await this.testErrorHandling();
        await this.testEdgeCases();
        
        console.log('✅ All Your Feature tests passed!');
    }
    
    static async testBasicFunctionality() {
        // 测试基本功能
    }
}
```

## 🚀 发布流程

### 版本管理

项目使用 `standard-version` 进行自动化版本管理：

```bash
# 预览下一个版本（不做实际更改）
npm run release:dry

# 发布新版本（自动确定版本号）
npm run release

# 发布 beta 版本
npm run release:beta
```

### 发布步骤

1. **确保所有测试通过**: `npm test`
2. **预览版本**: `npm run release:dry`
3. **发布版本**: `npm run release`

发布过程会自动：
- 分析提交历史确定版本号
- 更新 `package.json` 版本
- 生成/更新 `CHANGELOG.md`
- 创建 Git 标签
- 推送到远程仓库
- 发布到 npm

## 📝 代码风格

### JavaScript 规范

- 使用 **ES modules** (`import`/`export`)
- 使用 **async/await** 处理异步操作
- 优先使用 **const**，需要重赋值时使用 **let**
- 函数和变量使用 **驼峰命名**
- 类名使用 **大驼峰命名**

### 文件组织

```
src/
├── providers/          # 提供商实现
├── config/            # 配置管理
├── utils/             # 工具函数
└── tunnel.js          # 主要 API 入口

test/
├── provider-manager.test.js
├── interface-validation.test.js
└── ...                # 对应的测试文件
```

### 错误处理

- 使用有意义的错误消息
- 实现适当的错误恢复机制
- 记录足够的调试信息

## 🐛 报告问题

### 错误报告

在创建 Issue 时，请包含：

1. **问题描述**: 清晰描述遇到的问题
2. **重现步骤**: 详细的重现步骤
3. **期望行为**: 您期望的正确行为
4. **环境信息**: 
   - Node.js 版本
   - npm 版本
   - 操作系统
   - uvx-proxy-local 版本
5. **错误日志**: 包含相关的错误消息或日志

### 功能请求

1. **用例说明**: 描述您想要解决的问题
2. **建议方案**: 您认为的解决方案
3. **备选方案**: 其他可能的实现方式
4. **相关资料**: 相关文档或参考资料

## 🔍 代码审查

### 提交 Pull Request

1. **创建清晰的 PR 标题**: 简要描述您的更改
2. **详细的描述**: 解释您的更改和原因
3. **关联 Issue**: 如果解决了某个 Issue，请关联
4. **测试通过**: 确保所有测试通过
5. **文档更新**: 如有必要，更新相关文档

### 审查标准

- **功能正确性**: 代码是否解决了预期问题
- **测试覆盖**: 是否有足够的测试覆盖
- **代码质量**: 代码是否清晰、可维护
- **性能影响**: 是否对性能有不利影响
- **向后兼容**: 是否破坏了现有 API

## 🤝 社区行为准则

- **尊重他人**: 保持友善和专业的态度
- **建设性反馈**: 提供有帮助的建议和批评
- **包容性**: 欢迎所有背景的贡献者
- **学习导向**: 分享知识，帮助他人成长

## 📞 联系我们

- **GitHub Issues**: 项目相关问题和讨论
- **Pull Requests**: 代码贡献
- **文档改进**: 通过 PR 提交文档更新

感谢您为 uvx-proxy-local 做出贡献！🎉