# 通过 cloudflared 设置 Cloudflare Tunnel 自定义域名访问

本文档旨在指导您如何使用 `cloudflared` 命令行工具，将您的本地服务（如一个在 `localhost:8000` 上运行的网站）通过一个安全的隧道暴露到公网，并绑定到您的自定义域名。

## 准备工作

在开始之前，请确保您已具备：
1.  一个 Cloudflare 账户。
2.  一个已经添加到您 Cloudflare 账户中的有效域名（例如 `yourdomain.com`）。
3.  一个在本地运行的 Web 服务，并知晓其端口号（例如 `8000`）。
4.  在您的电脑上已经安装了 `cloudflared` 命令行工具。

---

## 操作步骤

### 第 1 步：授权 `cloudflared`

此步骤会将 `cloudflared` 工具与您的 Cloudflare 账户关联。它只会执行一次。

在您的终端中运行以下命令，它会打开一个浏览器窗口，需要您手动登录并授权您要使用的域名。

```bash
cloudflared tunnel login
```

### 第 2 步：创建隧道

为您的连接创建一个永久的、命名的隧道。这个名字仅用于您自己识别。

```bash
# 将 <TUNNEL_NAME> 替换为您想用的隧道名称，例如 my-app-tunnel
cloudflared tunnel create <TUNNEL_NAME>
```

执行后，系统会返回一段重要的信息，包含隧道的 **UUID** 和一个凭证文件的路径。**请记下这个 UUID**，后续步骤会用到。

> Created tunnel <TUNNEL_NAME> with id **3c087205-95a4-47d8-a0db-82f40d056288**

### 第 3 步：创建配置文件

创建一个配置文件，告诉 `cloudflared` 流量应该如何转发。

1.  创建一个名为 `config.yml` 的文件。
2.  将以下内容复制到文件中，并根据您的实际情况修改占位符：

```yaml
# 填写您在第 2 步中获得的隧道 UUID
tunnel: <YOUR_TUNNEL_ID>

# ingress 规则定义了流量如何从公网进入您的隧道
ingress:
  # 规则一：将您的域名指向本地服务
  - hostname: <YOUR_CUSTOM_DOMAIN>  # 例如：app.yourdomain.com
    service: http://localhost:<PORT>   # 例如：http://localhost:8000
  
  # 规则二（必须有）：捕获所有其他不匹配的请求，并返回 404 错误
  - service: http_status:404
```

### 第 4 步：为隧道设置 DNS 记录

此步骤会在您的 Cloudflare DNS 中自动创建一个 CNAME 记录，将您的自定义域名指向刚刚创建的隧道。

```bash
# 将 <TUNNEL_ID_OR_NAME> 替换为第 2 步的隧道 UUID 或名称
# 将 <YOUR_CUSTOM_DOMAIN> 替换为您的域名
cloudflared tunnel route dns <TUNNEL_ID_OR_NAME> <YOUR_CUSTOM_DOMAIN>
```
**强烈建议**使用 **UUID** 而不是名称，以确保精确无误。

### 第 5 步：运行隧道

现在，启动隧道。`cloudflared` 会读取您的配置文件并开始转发流量。

```bash
# 如果您的 config.yml 不在当前目录下，请提供完整路径
# 在 Linux/macOS 上，使用 `&` 可以让它在后台运行
cloudflared tunnel --config /path/to/your/config.yml run &
```

至此，您的本地服务应该已经可以通过 `https://<YOUR_CUSTOM_DOMAIN>` 访问了。

---

## 故障排除

### 如何处理重复的 DNS 记录？

**问题**：在执行第 4 步 `route dns` 命令时，出现 `An A, AAAA, or CNAME record with that host already exists` 错误。

**原因**：这表示您的 Cloudflare DNS 中已经存在一个同名的记录，这会阻止 `cloudflared` 创建新的 CNAME 记录。

#### 方法一：手动删除 (推荐)

1.  登录到您的 **Cloudflare 账户**。
2.  选择您的域名（例如 `yourdomain.com`）。
3.  在左侧菜单中，进入 **"DNS"** -> **"Records"** 页面。
4.  在 DNS 记录列表中，找到与您的自定义域名冲突的记录。
5.  点击该记录右侧的 **"Edit"** (编辑)，然后点击 **"Delete"** (删除)。
6.  确认删除。

删除后，回到您的终端，**重新执行第 4 步的 `cloudflared tunnel route dns ...` 命令**，此时应该就可以成功创建了。

#### 方法二：通过 API 自动删除 (高级)

对于需要自动化的场景，您可以使用 Cloudflare API 来删除记录。

**1. 准备工作**
   - **创建 API Token**:
     - 在 Cloudflare 账户中，进入 **"My Profile"** -> **"API Tokens"** -> **"Create Token"**。
     - 使用 **"Edit zone DNS"** 模板。
     - 在 **"Zone Resources"** 中选择您的域名，完成创建并**保存好生成的 Token**。
   - **安装 `jq`**: 这是一个命令行 JSON 处理工具，脚本需要用它来解析 API 返回的数据。 (例如 `sudo apt-get install jq`)

**2. 使用脚本删除**
   我们已经创建了一个名为 `delete_dns_record.sh` 的脚本来自动化此过程。
   - **配置脚本**: 打开 `delete_dns_record.sh` 文件，将文件顶部的 `<...>` 占位符替换为您的 API Token、域名和要删除的记录全名。
   - **授予权限**: `chmod +x delete_dns_record.sh`
   - **执行删除**: `./delete_dns_record.sh`

脚本会自动查找并删除指定的 DNS 记录。成功后，您就可以重新执行第 4 步的 `route dns` 命令了。
