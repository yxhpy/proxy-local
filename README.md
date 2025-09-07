# uvx-proxy-local

🚀 多提供商内网穿透 CLI 工具，支持多种免费隧道服务，**无确认页面，直接访问！**

## ✨ 核心特性

- 🎯 **无确认页面** - 默认使用 Cloudflare，无需点击确认，直接访问
- 🚀 **Cloudflare 隧道** - 专业级隧道服务，支持自定义域名和持久连接
- 🔄 **智能回退机制** - 自动尝试多个提供商，确保连接成功  
- 🌐 **多提供商支持** - Cloudflare, Pinggy, Serveo, LocalTunnel
- 🎛️ **交互式 DNS 管理** - 智能处理域名冲突，提供用户友好的选择界面
- 🔧 **灵活配置系统** - 支持配置文件、环境变量、CLI参数多层配置
- 🛠️ **进程管理** - 支持后台运行、进程列表、状态监控和批量管理
- 🔒 **HTTPS 支持** - 所有隧道都支持安全连接
- 🇨🇳 **中文友好** - 完整的中文提示和说明

## 📦 安装

```bash
# 全局安装
npm install -g uvx-proxy-local

# 或临时使用
npx uvx-proxy-local proxy-local 8000
```

## ⚙️ 配置

### 配置文件

支持多种配置方式，按优先级：**CLI 参数 > 环境变量 > 用户配置文件 > 项目配置文件 > 默认值**

#### 配置文件位置

在项目目录或主目录创建配置文件：
- `.uvxrc`
- `.uvxrc.json` 
- `.uvxrc.yaml`
- `.uvx.config.js`
- `package.json` (uvx 字段)

#### 配置文件示例 (.uvxrc)
```yaml
# 默认提供商
defaultProvider: "cloudflare"

# 连接设置
timeout: 30000
retries: 3

# Cloudflare 设置
cloudflare:
  tempMode: true
  customDomain: "myapp"

# 界面设置
ui:
  verbose: false
  colors: true
  icons: true
```

### 环境变量

```bash
# 基本配置
export UVX_PROVIDER=pinggy
export UVX_TIMEOUT=45000
export UVX_RETRIES=5

# Cloudflare 配置
export UVX_CLOUDFLARE_TEMP_MODE=false
export UVX_CLOUDFLARE_CUSTOM_DOMAIN=myapp

# 界面配置
export UVX_VERBOSE=true
export UVX_NO_COLORS=true
export UVX_NO_ICONS=true
```

### 用户配置存储

Cloudflare 认证信息自动存储在 `~/.uvx/config.json`，无需手动配置。

### 查看当前配置

```bash
uvx-proxy-local --show-config
```

## 🚀 使用指南

### 基本使用
```bash
# 代理本地 8080 端口 (使用默认 Cloudflare 提供商)
uvx-proxy-local 8080
```

### Cloudflare 隧道功能

#### 快速开始
```bash
# 首次使用需要登录 Cloudflare (一次性设置)
uvx-proxy-local --cloudflare-login

# 创建隧道到端口 3000
uvx-proxy-local 3000

# 使用自定义隧道名称
uvx-proxy-local 3000 --cloudflare-custom=myapp
```

#### DNS 域名管理
项目提供智能化的域名冲突处理：
- 自动检测域名可用性
- 交互式域名选择菜单
- 支持固定域名配置
- 重置域名设置选项

```bash
# 重置域名配置，显示选择菜单
uvx-proxy-local --reset-domain
```

### 进程管理

```bash
# 后台运行隧道
uvx-proxy-local 8080 --daemon

# 查看所有运行的进程
uvx-proxy-local --list

# 查看详细状态
uvx-proxy-local --status

# 交互式停止进程
uvx-proxy-local --kill

# 停止指定进程
uvx-proxy-local --kill 12345

# 停止所有进程
uvx-proxy-local --kill-all
```

### 提供商选择

```bash
# 指定不同提供商
uvx-proxy-local 8080 --provider=cloudflare  # 推荐，无确认页面
uvx-proxy-local 8080 --provider=pinggy      # 快速，无确认页面
uvx-proxy-local 8080 --provider=serveo      # SSH隧道，无确认页面
uvx-proxy-local 8080 --provider=localtunnel # 经典服务，需确认页面

# 列出所有可用提供商
uvx-proxy-local --list-providers
```

### 其他选项

```bash
# 查看当前配置
uvx-proxy-local --show-config

# 设置超时和重试
uvx-proxy-local 8080 --timeout=60000 --retries=5

# 启用详细输出
uvx-proxy-local 8080 --verbose

# 禁用颜色和图标
uvx-proxy-local 8080 --no-colors --no-icons

# Cloudflare 账户管理
uvx-proxy-local --cloudflare-logout  

# 查看帮助
uvx-proxy-local --help
```

## 📋 支持的提供商

| 提供商 | 确认页面 | 速度 | HTTPS | 特点 |
|--------|----------|------|--------|------|
| ⭐ **Cloudflare** | ✅ 无需确认 | 极速 | 支持 | 专业级隧道，自定义域名，DNS管理 |
| **Pinggy** | ✅ 无需确认 | 快速 | 支持 | 免费服务，直接访问 |
| **Serveo** | ✅ 无需确认 | 快速 | 支持 | SSH隧道，稳定可靠 |
| LocalTunnel | ⚠️ 需要确认 | 中等 | 支持 | 经典服务，备用选择 |

### 提供商选择建议

1. **🥇 Cloudflare (推荐)**: 专业级服务，支持自定义域名和持久连接
2. **🥈 Pinggy**: 快速免费服务，无需确认页面
3. **🥉 Serveo**: 基于SSH的稳定服务
4. **LocalTunnel**: 需要确认页面，作为最后备选

## 💡 使用示例

### Cloudflare 隧道示例
```bash
$ uvx-proxy-local 3000
✓ Registered provider: cloudflare
✓ Registered provider: pinggy
✓ Registered provider: serveo
✓ Registered provider: localtunnel
🔄 Attempting to create tunnel using cloudflare...
✅ Successfully created tunnel using cloudflare

✅ 隧道创建成功！ (提供商: cloudflare)
🌐 公共 URL: https://myapp-abc123.trycloudflare.com

📋 特性信息:
   ⚡ 速度: fast
   🔒 HTTPS: 支持
   ✅ 无确认页面，直接访问！

💡 Cloudflare 快速隧道，支持域名选择和固定功能

按 Ctrl+C 关闭隧道
```

### 进程管理示例
```bash
$ uvx-proxy-local 8080 --daemon
✅ 隧道已在后台启动
🔍 进程 ID: 12345
🌐 URL: https://myapp-xyz789.trycloudflare.com

$ uvx-proxy-local --status
📊 运行中的隧道进程:

🔄 PID: 12345 | 端口: 8080 | 提供商: cloudflare
🌐 URL: https://myapp-xyz789.trycloudflare.com
⏰ 运行时间: 5分30秒
✅ 状态: 正常运行
```

## 🔧 常见问题

**Q: 为什么选择这个工具？**
A: 我们解决了传统内网穿透工具需要点击确认页面的痛点，提供直接访问的体验。

**Q: 如果 Pinggy 不可用怎么办？**
A: 工具会自动尝试其他提供商，确保连接成功。

**Q: 支持哪些协议？**
A: 主要支持 HTTP/HTTPS 协议，适合 Web 开发调试。

## 🔧 常见问题与故障排除

### DNS 冲突处理

当遇到域名冲突时，项目提供智能化解决方案：

```bash
# 如果遇到域名冲突，系统会自动显示交互式菜单
$ uvx-proxy-local 3000 --provider=cloudflare

🔍 检测到域名冲突，请选择处理方式:
1. 使用新的随机域名
2. 覆盖现有域名配置  
3. 重新选择其他域名
4. 取消操作

请选择操作 (1-4): 
```

### Cloudflare 设置

#### 首次使用 Cloudflare

```bash
# 第一步：登录 Cloudflare 账户
uvx-proxy-local --cloudflare-login

# 第二步：创建隧道
uvx-proxy-local 8080

# 使用自定义域名前缀
uvx-proxy-local 8080 --cloudflare-custom=myproject
```

#### 域名管理

```bash
# 查看当前域名配置
uvx-proxy-local --show-config

# 重置域名设置，重新选择
uvx-proxy-local --reset-domain

# 登出当前账户
uvx-proxy-local --cloudflare-logout
```

### 常见问题解答

**Q: 为什么选择这个工具？**
A: 提供专业级 Cloudflare 隧道支持、智能 DNS 管理、进程管理和无确认页面的流畅体验。

**Q: Cloudflare 隧道有什么优势？**
A: 更快的速度、更稳定的连接、支持自定义域名、专业级安全性和无流量限制。

**Q: 如果 Cloudflare 不可用怎么办？**
A: 工具会自动回退到 Pinggy、Serveo 等其他提供商，确保隧道服务不中断。

**Q: 支持哪些协议？**
A: 主要支持 HTTP/HTTPS 协议，适合 Web 开发、API 测试和演示。

**Q: 如何后台运行隧道？**
A: 使用 `--daemon` 参数后台运行，用 `--list` 查看状态，用 `--kill` 管理进程。

## 🤝 贡献

我们欢迎所有形式的贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详细的贡献指南，包括：

- 开发环境设置
- 代码风格规范  
- 提交消息格式（约定式提交）
- 测试指南
- 发布流程

### 快速贡献

1. Fork 项目
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'feat: add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

## 📄 许可证

MIT License