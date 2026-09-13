# dsh-web-search-brave

Brave Search API 驱动的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`ctx.web`) 搜索 provider 插件。

调用 Brave 的 REST 接口:

```
GET https://api.search.brave.com/res/v1/web/search?q=<query>&count=<n>
X-Subscription-Token: <BRAVE_API_KEY>
```

与 `@deepseek-ai/dsh-web-search-deepseek`(Anthropic Messages 协议,POST + Bearer)不同,Brave 是纯 REST GET + `X-Subscription-Token` 头,协议不兼容,无法通过改 `baseURL` 复用 DeepSeek provider,因此需要独立插件。

## 特性

- 注册 `brave` 搜索 provider 到 `ctx.web`,`web_search` 工具直接走 Brave
- 设置页自带独立的 **「Brave 搜索」配置卡片**(host 端 `installSettingsSection` + 客户端卡片组件)
- API key 存入 Harness **凭据域**(`BRAVE_API_KEY`),不在 settings 段明文存储
- 每搜索实时解析凭据,改 key 无需重启

## 安装

### 方式一:通过 dsh plugin 命令(本地路径)

```sh
dsh plugin --profile web add /path/to/dsh-web-search-brave
```

### 方式二:手动接入 profile

编辑 `$DSH_HOME/profiles/web/package.json`:

```json
{
  "dependencies": {
    "dsh-web-search-brave": "link:/path/to/dsh-web-search-brave"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-web-search-brave"
      ]
    }
  }
}
```

然后在 profile 目录执行 `pnpm install`,重启 `dsh --profile web`。

### 方式三:发布版(npm 安装后)

```sh
npm install -g dsh-web-search-brave
dsh plugin --profile web add dsh-web-search-brave
```

插件的 `cordis.patch.yml`(bundle 层)会自动:

- 插入 `web-search-brave` 插件行
- 把 `web.searchProvider` 钉为 `brave`(覆盖其他 bundle 的设置)
- 停用 `web-search-deepseek`(其 Anthropic 协议无法对接 Brave)

> 若你的 profile 使用了用户层 `cordis.patch.yml`,也可以直接把上述三条 patch 写进用户层(最后写入生效),效果相同。

## 配置 key

设置页 → **插件配置** → **「Brave 搜索」卡片**:

| 控件 | 说明 |
|---|---|
| API Key | 写入 `BRAVE_API_KEY` 凭据(显示「已设置/未设置」徽章;留空保持现有 key 不变) |
| 接口地址 | `baseURL`,默认 `https://api.search.brave.com/res/v1` |
| 默认结果条数 | `maxUses` → Brave 的 `count`,默认 8 |

也可以直接写凭据文件:

```yaml
# $DSH_HOME/.credentials.yaml
BRAVE_API_KEY: BSA...
```

或环境变量 `BRAVE_API_KEY`。

Key 解析顺序(每次搜索实时解析,无需重启):

1. Harness 凭据服务里 `apiKeyEnv` 指向的引用(默认 `BRAVE_API_KEY`)
2. 环境变量 `BRAVE_API_KEY`

## 验证

安装后启动 DSH,直接问一个问题让 `web_search` 执行,或确认组合:

```sh
dsh --profile web --dump-config | grep -A3 searchProvider
# 应输出: searchProvider: brave
```

## 移除

```sh
dsh plugin --profile web remove dsh-web-search-brave
# 并确认 dsh.profile.bundles 里不再有它;重启后 web 接缝回到默认 provider。
```

## License

MIT
