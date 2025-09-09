# Debug Files

此目录包含用于调试和分析Cloudflare隧道问题的脚本文件。

## 文件分类

### 分析类
- `debug-cloudflare-implementation-analysis.cjs` - 官方指南与现有代码差异分析
- `debug-named-tunnel-timeout-analysis.cjs` - 命名隧道超时问题分析
- `debug-real-log-analysis.cjs` - 真实日志分析

### DNS相关调试
- `debug-cloudflared-dns-route-conflict.cjs` - DNS路由冲突调试
- `debug-dns-*.cjs` - 各种DNS配置和回调错误调试
- `debug-cname-mismatch.js` - CNAME记录不匹配调试

### 隧道连接调试
- `debug-cloudflared-tunnel-connection.cjs` - 隧道连接问题调试
- `debug-tunnel-*.js` - 隧道流程和代理连接问题调试
- `debug-wait-tunnel-startup-issue.cjs` - 隧道启动等待问题调试

### 配置和认证调试
- `debug-cloudflare-tunnel-access-fix.cjs` - 隧道访问修复调试
- `debug-spawn-cloudflared.cjs` - cloudflared进程启动调试

## 使用说明

这些文件主要用于：
1. 问题诊断和根因分析
2. 验证修复方案的有效性
3. 理解Cloudflare隧道的内部工作机制
4. 开发期间的快速调试

大多数文件包含详细的日志输出和错误分析，可以单独运行来重现和分析特定问题。