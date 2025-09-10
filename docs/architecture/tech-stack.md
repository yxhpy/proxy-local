# 技术栈规范

## 🚀 核心技术栈

### 1. 运行时环境
- **Node.js**: v18.0+ (LTS版本推荐)
- **npm**: v8.0+ (包管理工具)
- **ES Modules**: 使用ES6模块系统

### 2. 核心依赖

#### 命令行界面
```json
{
    "commander": "^14.0.0",    // CLI参数解析
    "inquirer": "^12.9.4",     // 交互式命令行界面
    "chalk": "^5.6.0"          // 终端颜色输出
}
```

#### 隧道服务集成
```json
{
    "@pinggy/pinggy": "^0.1.4",  // Pinggy官方SDK
    "localtunnel": "^2.0.2"       // LocalTunnel客户端
}
```

#### 配置管理
```json
{
    "cosmiconfig": "^9.0.0"       // 配置文件加载器
}
```

### 3. 开发工具依赖
```json
{
    "standard-version": "^9.5.0"  // 语义化版本控制
}
```

## 🏗️ 架构设计原则

### 1. 模块化架构
```
uvx-proxy-local/
├── bin/                    # CLI入口点
├── src/
│   ├── providers/          # 隧道提供商实现
│   ├── utils/              # 通用工具模块
│   ├── managers/           # 业务逻辑管理器
│   └── interfaces/         # 抽象接口定义
├── test/                   # 测试套件
└── docs/                   # 项目文档
```

### 2. 提供商插件系统
```javascript
// 标准提供商接口
export class TunnelProvider {
    async createTunnel(port, options) { /* 抽象方法 */ }
    async closeTunnel(tunnelId) { /* 抽象方法 */ }
    async getTunnelStatus(tunnelId) { /* 抽象方法 */ }
}

// 具体提供商实现
export class CloudflareProvider extends TunnelProvider {
    // 实现具体逻辑
}
```

### 3. 智能回退机制
```javascript
export class FallbackManager {
    constructor(providers) {
        this.providers = providers;          // 按优先级排序的提供商列表
        this.currentIndex = 0;              // 当前使用的提供商索引
    }
    
    async executeWithFallback(operation) {
        // 自动尝试下一个可用提供商
    }
}
```

## 🛠️ 开发工具栈

### 1. 测试框架
- **原生Node.js测试**: 使用Node.js内置测试功能
- **集成测试**: 端到端用户场景测试
- **单元测试**: 各模块独立功能测试

### 2. 代码质量工具
- **ESLint**: 代码静态分析（推荐）
- **Prettier**: 代码格式化（推荐）
- **JSDoc**: API文档生成

### 3. 版本控制
- **Git**: 源码版本控制
- **Semantic Versioning**: 版本号规范
- **Conventional Commits**: 提交信息规范

## 🔧 外部工具集成

### 1. Cloudflare 工具链
```bash
# cloudflared CLI工具
cloudflared tunnel create <name>    # 创建隧道
cloudflared tunnel route dns        # 配置DNS路由
cloudflared tunnel run             # 运行隧道
```

### 2. API客户端
- **Cloudflare API**: DNS记录管理
- **HTTP客户端**: 内置fetch API

### 3. 系统工具
- **SSH客户端**: Serveo隧道连接
- **子进程管理**: Node.js child_process
- **文件系统**: Node.js fs模块

## 📦 包管理策略

### 1. 依赖管理原则
```json
{
    "engines": {
        "node": ">=18.0.0",
        "npm": ">=8.0.0"
    }
}
```

### 2. 依赖分类
- **运行时依赖**: 生产环境必需的包
- **开发依赖**: 仅开发阶段使用的包
- **可选依赖**: 增强功能但非必需的包

### 3. 安全考虑
- 定期更新依赖到安全版本
- 使用npm audit检查漏洞
- 锁定版本号避免意外更新

## 🌐 支持的隧道服务

### 1. Cloudflare Tunnel
```javascript
// 特点：企业级稳定性，自定义域名支持
const CloudflareProvider = {
    type: 'cloudflare',
    features: ['custom-domain', 'authentication', 'dns-management'],
    priority: 1,                    // 最高优先级
    authRequired: true
};
```

### 2. Pinggy
```javascript
// 特点：免费，无需确认页面
const PinggyProvider = {
    type: 'pinggy',
    features: ['instant-access', 'http-https'],
    priority: 2,
    authRequired: false
};
```

### 3. Serveo
```javascript
// 特点：SSH隧道，稳定性好
const ServeoProvider = {
    type: 'serveo',
    features: ['ssh-tunnel', 'custom-subdomain'],
    priority: 3,
    authRequired: false
};
```

### 4. LocalTunnel
```javascript
// 特点：经典解决方案，有确认页面
const LocalTunnelProvider = {
    type: 'localtunnel',
    features: ['legacy-support'],
    priority: 4,                    // 备选方案
    authRequired: false
};
```

## 🎯 性能优化策略

### 1. 启动性能
- 延迟加载非关键模块
- 缓存配置文件解析结果
- 优化依赖导入路径

### 2. 运行时性能
- 连接池管理隧道连接
- 智能重试机制避免无效尝试
- 内存使用监控和优化

### 3. 网络优化
- DNS解析缓存
- HTTP连接复用
- 超时机制防止阻塞

## 🔒 安全实施标准

### 1. 凭证管理
```javascript
// ✅ 安全存储API令牌
const credentialsPath = path.join(os.homedir(), '.uvx', 'credentials.json');
await fs.writeFile(credentialsPath, JSON.stringify(tokens), { mode: 0o600 });

// ❌ 避免在代码中硬编码密钥
const API_KEY = "sk-1234567890abcdef"; // 禁止
```

### 2. 输入验证
```javascript
// ✅ 验证端口号范围
function validatePort(port) {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error(`无效端口号: ${port}`);
    }
    return portNum;
}
```

### 3. 错误信息安全
```javascript
// ✅ 避免泄露敏感信息
function sanitizeError(error) {
    const publicError = new Error(error.message);
    // 不暴露内部实现细节
    delete publicError.stack;
    return publicError;
}
```

## 📊 监控和诊断

### 1. 日志框架
```javascript
export class Logger {
    info(message, context = {}) {
        console.log(JSON.stringify({
            level: 'info',
            timestamp: new Date().toISOString(),
            message,
            context
        }));
    }
    
    error(message, error, context = {}) {
        console.error(JSON.stringify({
            level: 'error',
            timestamp: new Date().toISOString(),
            message,
            error: error.message,
            context
        }));
    }
}
```

### 2. 性能指标
- 隧道建立时间
- 连接成功率
- 错误分类统计
- 提供商可用性

### 3. 健康检查
```javascript
export class HealthChecker {
    async checkTunnelHealth(tunnelUrl) {
        try {
            const response = await fetch(tunnelUrl, { timeout: 5000 });
            return { status: 'healthy', statusCode: response.status };
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }
}
```

## 🔄 持续集成与部署

### 1. CI/CD 流水线
```yaml
# GitHub Actions 示例
name: CI/CD Pipeline
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm audit
```

### 2. 发布流程
```bash
# 自动化发布脚本
npm run test           # 运行测试套件
npm run release        # 创建新版本标签
npm publish           # 发布到npm registry
```

### 3. 质量门禁
- 所有测试必须通过
- 代码覆盖率 ≥ 80%
- 无安全漏洞
- 文档已更新

---

*本技术栈文档定义了项目使用的核心技术和工具，确保开发团队在一致的技术基础上协作开发。*