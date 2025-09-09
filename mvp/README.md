# MVP (Minimum Viable Product) Files

此目录包含各个功能模块的最小可行产品原型实现。

## 核心MVP组件

### 原子化生命周期管理
- `mvp-atomic-tunnel-lifecycle.js` - 事务性隧道操作的原型实现

### 错误解析和处理  
- `mvp-cloudflared-error-parser.js` - 智能错误识别和处理的原型

### 认证和配置管理
- `mvp-enhanced-cloudflare-auth.js` - 增强认证管理器原型
- `mvp-unified-cloudflared-command-builder.js` - 统一命令构建器原型

### DNS和隧道管理
- `mvp-smart-dns-conflict.js` - 智能DNS冲突处理原型
- `mvp-cloudflare-tunnel-access-fix.cjs` - 隧道访问修复原型

### 用户界面和流程
- `mvp-dual-path-menu.js` - 双路径菜单原型
- `mvp-login-path.js` - 登录路径原型
- `mvp-temporary-tunnel.js` - 临时隧道原型

### 实用工具
- `mvp-cert-detection.js` - 证书检测原型

## MVP开发理念

这些文件遵循MVP开发原则：
1. **快速验证** - 快速实现核心功能验证可行性
2. **最小复杂度** - 减少依赖和复杂逻辑
3. **概念验证** - 验证技术方案和架构设计
4. **迭代基础** - 为最终实现提供基础代码

## 使用方式

```bash
# 运行单个MVP原型
node mvp/mvp-enhanced-cloudflare-auth.js

# 测试错误解析器原型
node mvp/mvp-cloudflared-error-parser.js
```

## 开发流程

1. **MVP开发** - 在此目录创建功能原型
2. **测试验证** - 使用tests/目录中的测试验证
3. **调试优化** - 使用debug/目录中的工具调试
4. **生产实现** - 迁移到src/目录作为正式实现

## 注意事项

- MVP文件可能包含简化逻辑和硬编码值
- 仅用于概念验证，不建议直接用于生产环境
- 部分MVP可能依赖外部服务或配置