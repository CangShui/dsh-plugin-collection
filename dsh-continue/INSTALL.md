# 安装 dsh-continue

三种装法，任选一种。装完**必须重启 DeepSeek Harness**才会加载。

---

## 一、一键脚本（Windows，推荐）

```powershell
git clone https://github.com/CangShui/dsh-plugin-collection.git
cd dsh-plugin-collection\dsh-continue
pwsh -File scripts\install.ps1
```

脚本会做三件事，做完自动校验 sha256：

1. 把工程同步到 `%USERPROFILE%\.dsh\plugins\dsh-continue`
2. 在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 里加依赖 + 登记 `dsh.profile.bundles`
3. 用 profile 自带的 pnpm 安装，并落地到 `profiles\desktop\node_modules\dsh-continue`

装到别的 profile 就加参数：

```powershell
pwsh -File scripts\install.ps1 -Profile web
```

装载路径和 `$DSH_HOME` 不一样时：

```powershell
pwsh -File scripts\install.ps1 -DshHome "D:\dsh-home"
```

---

## 二、官方命令（非 desktop profile）

`desktop` profile 由 Electron 宿主独占，CLI 会拒绝；其他 profile 直接用官方命令：

```bash
dsh plugin --profile web add "C:\path\to\dsh-plugin-collection\dsh-continue"
```

`dsh` 会自动把它加进 `dsh.profile.bundles`。重启即可。

---

## 三、手工安装

1. 把整个 `dsh-continue` 目录放到 `~/.dsh/plugins/dsh-continue`。

2. 编辑 `~/.dsh/profiles/desktop/package.json`：

```json
{
  "dependencies": {
    "dsh-continue": "file:../../plugins/dsh-continue"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-continue"
      ]
    }
  }
}
```

> `bundles` 里请保留你原本就有的行，只往后追加 `dsh-continue`。

3. 在 profile 目录里装一次：

```bash
cd ~/.dsh/profiles/desktop
pnpm install
```

4. 目录存在但内容可能没更新时，直接把 `dsh-continue` 复制到
   `~/.dsh/profiles/desktop/node_modules/dsh-continue`（pnpm 对 `file:` 目录依赖
   内容变了照样会报 *Already up to date*，别被它骗了）。

5. 重启 DeepSeek Harness。

---

## 验证装上了

**A. 看组合结果**（需要 `dsh` 在 PATH 上）

```bash
dsh --profile desktop --dump-config | grep dsh-continue
```

打印出 `id: dsh-continue` 那一行就说明 bundle patch 被吃进去了。

**B. 离线核对**（不需要启动宿主，会用 dsh 自己的 `loadProfileDirectory` 跑一遍）

```bash
node scripts/extract-asar.mjs     # 首次：解出 dsh 安装当解析锚点（约 100MB，落在 %LOCALAPPDATA%）
node scripts/verify-profile.mjs
```

全绿输出 `VERIFY OK`。它逐项确认：bundle 没被跳过、entry 存在、`config` 对、
`inject` 对、模块能从 profile 真 import 出来、loader 的运行时解析认这个包名。

**C. 界面里看**

重启后在输入框敲 `/`，斜杠菜单里应该有 `continue`。直接敲 `/continue` 回车，
会回一张状态卡片：

```
自动续跑：关闭
已补发：0 次
上限：不限
内容：「继续」
开启：/continue on
```

看到这张卡就说明插件活了。

---

## 卸载

```powershell
# 1. 从 profile manifest 里删掉 dsh-continue 的依赖和 bundles 条目
notepad $env:USERPROFILE\.dsh\profiles\desktop\package.json

# 2. 删文件
Remove-Item $env:USERPROFILE\.dsh\plugins\dsh-continue -Recurse -Force
Remove-Item $env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-continue -Recurse -Force
```

重启即可。插件不写任何持久状态，删掉就干净了。

---

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `/` 菜单里没有 `continue` | 没重启，或者 profile manifest 的 `bundles` 里没加 `dsh-continue` |
| `dsh plugin --profile desktop add` 被拒 | desktop profile 由 Electron 独占，用 `scripts\install.ps1` |
| 重启后宿主起不来 | 看 `dsh --profile desktop --dump-config` 的报错；多半是 `cordis.patch.yml` 缩进坏了 |
| 改了源码没生效 | pnpm 的 `file:` 依赖不会自动同步，重跑 `scripts\install.ps1` |
| 敲 `/continue` 回「拿不到当前会话 id」 | 命令没在会话上下文里执行，重开一个会话 |
