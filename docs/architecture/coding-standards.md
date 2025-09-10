# 编码标准与规范

## 📋 核心编码原则

### 1. 代码组织原则
- **模块化设计**: 单一职责，高内聚低耦合
- **接口优先**: 通过抽象接口定义组件交互
- **依赖注入**: 避免硬编码依赖关系
- **错误处理**: 统一的错误处理和恢复机制

### 2. 文件和目录规范
- **命名约定**: 使用kebab-case命名文件和目录
- **功能分组**: 按功能模块组织代码结构
- **测试对应**: 每个源文件都应有对应的测试文件

## 🎯 JavaScript/Node.js 规范

### 1. ES模块规范
```javascript
// ✅ 推荐：使用ES6模块语法
import { createTunnel } from '../providers/cloudflare.js';
export { TunnelProvider } from './interfaces/tunnel-provider.js';

// ❌ 避免：CommonJS语法（除非必要）
const tunnel = require('./tunnel');
```

### 2. 异步编程规范
```javascript
// ✅ 推荐：使用async/await
async function createTunnel(port) {
    try {
        const result = await tunnelService.create(port);
        return result;
    } catch (error) {
        logger.error('隧道创建失败', error);
        throw error;
    }
}

// ❌ 避免：回调地狱
function createTunnel(port, callback) {
    tunnelService.create(port, (err, result) => {
        if (err) callback(err);
        else callback(null, result);
    });
}
```

### 3. 错误处理规范
```javascript
// ✅ 推荐：详细的错误上下文
class TunnelError extends Error {
    constructor(message, code, context = {}) {
        super(message);
        this.name = 'TunnelError';
        this.code = code;
        this.context = context;
        this.timestamp = new Date().toISOString();
    }
}

// ✅ 统一错误处理器
function handleError(error, context) {
    const errorInfo = {
        message: error.message,
        code: error.code || 'UNKNOWN',
        context,
        stack: error.stack
    };
    
    logger.error('操作失败', errorInfo);
    return new TunnelError(error.message, error.code, context);
}
```

## 🏗️ 架构模式规范

### 1. 提供商模式 (Provider Pattern)
```javascript
// 基础接口定义
export class TunnelProvider {
    async createTunnel(port) {
        throw new Error('子类必须实现 createTunnel 方法');
    }
    
    async closeTunnel(tunnelId) {
        throw new Error('子类必须实现 closeTunnel 方法');
    }
}

// 具体实现
export class CloudflareProvider extends TunnelProvider {
    async createTunnel(port) {
        // 具体实现逻辑
    }
}
```

### 2. 工厂模式 (Factory Pattern)
```javascript
export class ProviderFactory {
    static create(type, config) {
        switch (type) {
            case 'cloudflare':
                return new CloudflareProvider(config);
            case 'pinggy':
                return new PinggyProvider(config);
            default:
                throw new Error(`不支持的提供商类型: ${type}`);
        }
    }
}
```

### 3. 策略模式 (Strategy Pattern)
```javascript
export class FallbackStrategy {
    constructor(providers) {
        this.providers = providers;
        this.currentIndex = 0;
    }
    
    async execute(operation) {
        for (let i = this.currentIndex; i < this.providers.length; i++) {
            try {
                return await this.providers[i][operation]();
            } catch (error) {
                logger.warn(`提供商 ${i} 失败，尝试下一个`, error);
                continue;
            }
        }
        throw new Error('所有提供商都失败了');
    }
}
```

## 📝 命名约定

### 1. 变量和函数命名
```javascript
// ✅ 推荐：动词+名词的函数命名
const createTunnel = async (port) => { /* ... */ };
const validateConfiguration = (config) => { /* ... */ };
const formatOutput = (data) => { /* ... */ };

// ✅ 推荐：语义化的变量命名
const tunnelEndpoint = 'https://example.trycloudflare.com';
const maxRetryAttempts = 3;
const connectionTimeout = 30000;

// ❌ 避免：含糊的命名
const data = getStuff();
const temp = process();
```

### 2. 类和接口命名
```javascript
// ✅ 推荐：PascalCase 用于类名
class TunnelLifecycleManager { }
class CloudflareProvider { }
class ErrorHandler { }

// ✅ 推荐：接口名称以I前缀或Interface后缀
class ITunnelProvider { }
class TunnelProviderInterface { }
```

### 3. 常量命名
```javascript
// ✅ 推荐：SCREAMING_SNAKE_CASE 用于常量
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TUNNEL_TIMEOUT = 30000;
const SUPPORTED_PROVIDERS = ['cloudflare', 'pinggy', 'serveo'];

// ✅ 推荐：错误代码定义
const ERROR_CODES = {
    TUNNEL_CREATE_FAILED: 'TUNNEL_CREATE_FAILED',
    AUTH_FAILED: 'AUTH_FAILED',
    DNS_CONFIG_FAILED: 'DNS_CONFIG_FAILED'
};
```

## 🧪 测试规范

### 1. 测试文件组织
```
src/
├── providers/
│   ├── cloudflare.js
│   └── pinggy.js
test/
├── providers/
│   ├── cloudflare.test.js
│   └── pinggy.test.js
└── integration/
    └── end-to-end.test.js
```

### 2. 测试命名规范
```javascript
describe('CloudflareProvider', () => {
    describe('createTunnel', () => {
        it('应该成功创建隧道并返回URL', async () => {
            // 测试实现
        });
        
        it('应该在认证失败时抛出错误', async () => {
            // 测试实现
        });
        
        it('应该在超时后重试创建隧道', async () => {
            // 测试实现
        });
    });
});
```

### 3. 测试覆盖率要求
- **单元测试**: 覆盖率 ≥ 80%
- **集成测试**: 覆盖主要用例流程
- **端到端测试**: 覆盖用户关键路径

## 📚 文档规范

### 1. JSDoc 注释规范
```javascript
/**
 * 创建并启动隧道连接
 * @param {number} port - 本地服务端口号
 * @param {Object} options - 隧道配置选项
 * @param {string} [options.subdomain] - 自定义子域名
 * @param {string} [options.provider='cloudflare'] - 隧道提供商
 * @returns {Promise<TunnelInfo>} 隧道信息对象
 * @throws {TunnelError} 当隧道创建失败时抛出错误
 * 
 * @example
 * const tunnel = await createTunnel(3000, {
 *   subdomain: 'my-app',
 *   provider: 'cloudflare'
 * });
 * console.log(`隧道URL: ${tunnel.url}`);
 */
async function createTunnel(port, options = {}) {
    // 实现代码
}
```

### 2. README 文档结构
```markdown
# 模块名称

## 功能简介
简要描述模块的核心功能

## 安装使用
提供安装和基础使用示例

## API 参考
详细的API文档

## 配置选项
可用的配置参数说明

## 故障排除
常见问题和解决方案

## 贡献指南
如何参与开发的指导
```

## 🔧 工具和自动化

### 1. 代码格式化
- 使用 Prettier 进行代码格式化
- 配置 ESLint 进行代码质量检查
- Git hooks 确保提交代码符合规范

### 2. 持续集成
- 自动运行测试套件
- 代码覆盖率检查
- 依赖安全性扫描

### 3. 版本管理
- 遵循语义化版本控制 (SemVer)
- 使用 conventional commits 规范提交信息
- 自动生成 CHANGELOG

## ✅ 代码审查清单

### 提交前检查
- [ ] 代码符合命名约定
- [ ] 有适当的错误处理
- [ ] 包含必要的测试用例
- [ ] 文档已更新
- [ ] 通过所有自动化检查

### 审查重点
- [ ] 代码逻辑正确性
- [ ] 性能优化机会
- [ ] 安全性考虑
- [ ] 可维护性评估
- [ ] 架构设计合理性

---

*此文档定义了项目的编码标准，所有团队成员都应遵循这些规范以确保代码质量和一致性。*