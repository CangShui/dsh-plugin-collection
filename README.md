# dsh-plugins (CangShui)

DSH（DeepSeek Harness）插件集合仓库。根目录每个文件夹是一个独立插件项目，各自维护自己的 `package.json` 与版本。

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| [`dsh-opencode-go-usage/`](./dsh-opencode-go-usage) | `dsh-plugin-opencode-go` | OpenCode Go 套餐用量与剩余额度实时展示（侧边栏 + 设置页） |
| [`history/`](./history) | `dsh-plugin-prompt-history` | 对话大纲/输入历史导航，右侧悬浮目录 + 一键加载全部历史 |
| [`dsh-update/`](./dsh-update) | `dsh-plugin-about` | 设置页「关于」区块：版本检测与一键升级 |
| [`barave/`](./barave) | `dsh-web-search-brave` | Brave Search API 驱动的 `ctx.web` 搜索 provider |

## 安装

各插件的安装方式见对应目录下的 `README.md`。一般流程是把包放到
`~/.dsh/profiles/web/node_modules/<包名>`，并在 profile 的 bundle 中启用。

## 历史

本仓库由原先四个独立仓库合并而来，合并前的提交历史与 tag 全部保留：

- `dsh-history` → `history/`（tag: `history@v1.0.x`）
- `dsh-update` → `dsh-update/`（tag: `dsh-update@v1.x.x`）
- `dsh-barave` → `barave/`（tag: `barave@v0.1.x`）
- `dsh-opencode-go-usage` → `dsh-opencode-go-usage/`
