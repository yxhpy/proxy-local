# uvx-proxy-local

🚀 多提供商内网穿透 CLI 工具，支持多种免费隧道服务，**无确认页面，直接访问！**

## ✨ 特性

- 🎯 **无确认页面** - 默认使用 Pinggy，无需点击确认，直接访问
- 🔄 **智能回退** - 自动尝试多个提供商，确保连接成功  
- 🌐 **多提供商支持** - Pinggy, Serveo, LocalTunnel 等
- ⚡ **高速连接** - 智能选择最快的服务
- 🛠️ **简单易用** - 一行命令即可使用
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

## 🚀 使用

### 基本使用
```bash
# 代理本地 8080 端口 (使用默认最佳提供商)
uvx proxy-local 8080
```

### 高级选项
```bash
# 指定提供商
uvx-proxy-local 8080 --provider=pinggy

# 列出所有可用提供商
uvx-proxy-local --list-providers

# 查看当前配置
uvx-proxy-local --show-config

# 设置超时和重试
uvx-proxy-local 8080 --timeout=60000 --retries=5

# 启用详细输出
uvx-proxy-local 8080 --verbose

# 禁用颜色和图标
uvx-proxy-local 8080 --no-colors --no-icons

# Cloudflare 特定命令
uvx-proxy-local --cloudflare-login
uvx-proxy-local --cloudflare-logout  
uvx-proxy-local 8080 --cloudflare-custom=myapp

# 查看帮助
uvx-proxy-local --help
```

## 📋 支持的提供商

| 提供商 | 确认页面 | 速度 | HTTPS | 特点 |
|--------|----------|------|--------|------|
| ⭐ **Pinggy** | ✅ 无需确认 | 快速 | 支持 | 默认推荐，直接访问 |
| LocalTunnel | ⚠️ 需要确认 | 中等 | 支持 | 备用选择 |

## 💡 使用示例

```bash
$ uvx proxy-local 3000
✓ Registered provider: pinggy
🔄 Attempting to create tunnel using pinggy...
✅ Successfully created tunnel using pinggy

✅ 隧道创建成功！ (提供商: pinggy)
🌐 公共 URL: https://abc-123.pinggy.online

📋 特性信息:
   ⚡ 速度: fast
   🔒 HTTPS: 支持
   ✅ 无确认页面，直接访问！

💡 无确认页面，直接访问的免费隧道服务

按 Ctrl+C 关闭隧道
```

## 🔧 常见问题

**Q: 为什么选择这个工具？**
A: 我们解决了传统内网穿透工具需要点击确认页面的痛点，提供直接访问的体验。

**Q: 如果 Pinggy 不可用怎么办？**
A: 工具会自动尝试其他提供商，确保连接成功。

**Q: 支持哪些协议？**
A: 主要支持 HTTP/HTTPS 协议，适合 Web 开发调试。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License