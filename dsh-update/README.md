# dsh-update

DSH（DeepSeek Harness）Web 界面的「关于」插件：在设置面板新增 **「关于」** 区块，
显示**当前安装版本**与 **npm 最新发布版本**，并提供**一键升级**按钮
（宿主端执行 `npm install -g @deepseek-ai/dsh@latest`）。

## 功能

- 设置页新增「关于」区块（`settings.section` 插槽，排在最后）：
  - 当前版本 / 最新发布版本卡片，附「已是最新版本 / 有新版本可用」徽标
    （prerelease 感知的 semver 比较，`0.1.0-rc.10 > 0.1.0-rc.9`）；
  - 「重新检查」按钮（registry 结果默认缓存 5 分钟，可强制刷新）；
  - 「一键升级到 <版本>」按钮：宿主端后台执行 npm 安装，面板实时滚动 npm 输出日志；
  - 安装位置 / Node 版本 / Registry 等信息。
- 升级完成后提示**重启 dsh 生效**；升级过程不影响运行中的会话。
  npm 结束时的 `EPERM … .dsh-xxxx` 清理警告可忽略（运行中的旧进程锁定文件所致），
  重启后残留目录可手动删除。
- 按钮与配色使用 DSH 自带的主题令牌（`--dsw-alias-button-info-fill` 等），
  自动适配浅色 / 深色主题。

## 安全边界

- 版本信息（`GET /api/about/status`）任何来源可读；
- **升级动作（`POST /api/about/upgrade`）仅限本机回环（127.0.0.1 / ::1）触发**，
  其他来源一律 403；
- 插件不收集、不上传任何数据，不包含任何密钥；除查询 npm registry 外无外部网络请求。

## 环境要求

- 已安装 dsh 0.1.x（`dsh web` 可正常启动）
- Node ≥ 20（dsh 自身要求；插件使用全局 `fetch`）
- npm（升级按钮的实际执行者，需在 PATH 中）
- pnpm（`dsh plugin` 命令会转发给它）

## 安装（适用于任意电脑）

**第 1 步 — 安装插件包**（首次执行会自动初始化 web profile）：

```powershell
dsh plugin --profile web add github:CangShui/dsh-update
```

> 也可以先 `git clone https://github.com/CangShui/dsh-update.git`，
> 再执行 `dsh plugin --profile web add <克隆到本地的路径>`。

**第 2 步 — 挂载插件行**：编辑 `~/.dsh/profiles/web/cordis.patch.yml`
（Windows 即 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`），
在文件末尾追加；**若文件末尾有一行单独的 `[]`，先删掉它再追加**：

```yaml
- insert:
    - id: about
      name: 'dsh-plugin-about'
```

**第 3 步 — 生效**：

- dsh 正在运行：保存上一步文件后插件**立即热挂载**，浏览器刷新页面即可；
- dsh 未运行：执行 `dsh web` 启动，打开设置面板。

**验证**：设置面板出现「关于」区块；或访问
`http://127.0.0.1:3080/api/about/status` 返回 JSON 即为成功。

## 更新插件本身

```powershell
dsh plugin --profile web update dsh-plugin-about
```

（本地 clone 安装的：`git pull` 后刷新页面即可；宿主端有改动时需重启 dsh。）

## 卸载

1. 删除 `cordis.patch.yml` 中第 2 步追加的那段 `- insert: …`；
2. 执行 `dsh plugin --profile web remove dsh-plugin-about`。

## API

| 路由 | 说明 |
| --- | --- |
| `GET /api/about/status?refresh=1` | 当前版本 + 最新版本 + 升级状态（`refresh=1` 强制重新检查） |
| `POST /api/about/upgrade` | 启动升级；请求体 `{"dryRun":true}` 只跑 `npm --version` 自检，不改动安装 |

## 配置（insert 行的 config，均可选）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `registry` | npm 自身配置（`npm_config_registry` → `~/.npmrc` → npmjs 官方源） | 查询/升级用的 registry 基地址 |

```yaml
- insert:
    - id: about
      name: 'dsh-plugin-about'
      config:
        registry: 'https://registry.npmmirror.com'
```

## 文件结构

- `lib/index.js` — 宿主端：两个 API 路由 + 版本读取 + npm registry 查询 + 升级进程管理
- `lib/client.js` — 浏览器端：「关于」设置区块（React，`window.__ModuleLoader__` 工厂形式）
- `test-about.mjs` — 离线自检（`node test-about.mjs`）：semver / registry / 路由 mock /
  真实 spawn 自检，共 15+ 项断言，不修改 dsh 安装

## 开发说明

- 客户端 bundle（`lib/client.js`）改动会被 dsh 的 client-hmr 链热更新（无需重启，
  页面自动重载该插件）；宿主端（`lib/index.js`）改动需重启 dsh 生效。
- 兼容 DSH 0.1.x（`dsh web`）；依赖 webserver 路由注册（`ctx.webServer.register`）与
  客户端模块系统（`window.__ModuleLoader__`）。
- 支持 Windows（shell 方式解析 npm.cmd）/ macOS / Linux。

## License

MIT
