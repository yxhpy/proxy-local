# Test Files

此目录包含各种测试脚本，用于验证Cloudflare隧道功能的正确性。

## 主要测试文件

### 集成测试
- `test-enhanced-error-handling.js` - 增强错误处理和日志系统测试
- `test-integrated-fixes-compatibility.js` - 任务65和75修复兼容性测试
- `test-atomic-lifecycle-integration.js` - 原子生命周期集成测试

### 核心功能测试
- `test-complete-cloudflare-flow.js` - 完整Cloudflare流程测试
- `test-refactored-cloudflare-provider.js` - 重构后的CloudflareProvider测试
- `test-cloudflare-tunnel-fix.cjs` - Cloudflare隧道修复验证

### DNS相关测试
- `test-dns-*.js` - DNS记录创建、冲突处理和验证测试
- `test-smart-dns-conflict.js` - 智能DNS冲突处理测试

### 隧道生命周期测试
- `test-tunnel-*.js` - 隧道启动、超时和进程管理测试
- `test-corrected-tunnel-startup.cjs` - 修复后的隧道启动测试

### 错误处理测试
- `test-enhanced-error-feedback.cjs` - 增强错误反馈测试
- `test-es-module-fix.cjs` - ES模块兼容性测试

## 运行方式

```bash
# 运行单个测试
node tests/test-enhanced-error-handling.js

# 运行集成测试
node tests/test-integrated-fixes-compatibility.js
```

## 测试覆盖

- ✅ 错误解析和处理 (100%识别率)
- ✅ 原子化事务管理
- ✅ DNS配置和验证
- ✅ 多服务器DNS验证
- ✅ API回退机制
- ✅ HTTP连通性测试
- ✅ 日志记录和导出

## 注意事项

- 某些测试需要有效的Cloudflare认证
- 部分测试会创建真实的隧道和DNS记录
- 建议在测试环境中运行