# dsh-continue

DeepSeek Harness（DSH）自动续跑插件。

**一句命令打开，之后这条会话只要停下来，就自动补发一条「继续」；再一句关掉。**

```
/continue 1        ← 开启（等价 /continue on）
/continue 0        ← 关闭（等价 /continue off）
```

- 安装：[INSTALL.md](./INSTALL.md)
- 使用：[USAGE.md](./USAGE.md)
- English: [README.en.md](./README.en.md)

---

## 它做了什么

| 你在输入框敲的 | 行为 |
| --- | --- |
| `/continue 1` / `on` / `开` | 开启，不限轮数 |
| `/continue 0` / `off` / `关` | 关闭 |
| `/continue 5`、`/continue on 5` | 开启，本次最多补发 5 次 |
| `/continue`、`/continue status` | 查状态、已补发次数、上限 |

开启后，每次这一轮收工：

1. 等 **500ms**（默认）—— 给「你刚好也在敲字」留观察窗口；
2. 复查 agent 真的空闲、inbox 里没有排队的消息；
3. 投递一条内容为 `继续` 的 user 消息，走的是和你手敲回车**完全一样**的 inbox 路径。

于是它一轮接一轮自己跑下去，直到你关掉，或者撞上安全闸。

## 自动刹车

| 情况 | 行为 |
| --- | --- |
| 你点了「停止」按钮 | **立刻自动关闭**，并在会话里留一张可见的关闭说明 |
| 连续 2 轮以错误结束 | 自动关闭 |
| 不可恢复的错误（`QUOTA` / `AUTH` / `INVALID_REQUEST` / 上下文超限 …） | 立刻自动关闭 |
| 到了轮数上限 | 自动关闭 |
| inbox 里还有排队的输入 / agent 其实还在跑 | 这一轮不动手 |
| 这一轮跑完后你插了话 | 不动手 |
| 被父级或宿主中止（不是你按的停止） | 这一轮不续，但**保持开启** |

自动关闭时插件会往会话日志里写一对 `command/run` + `command/done`，前端把它渲染成
一张命令结果卡片 —— **不消耗模型的那一轮**。

## 配置

改 `cordis.patch.yml` 的 `config:`，或在 profile 的 `cordis.patch.yml` 里按 id 覆盖：

```yaml
- id: dsh-continue
  config:
    text: "接着做"
    delayMs: 800
    maxRounds: 20
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | `false` 时插件完全不挂载 |
| `text` | `"继续"` | 自动补发的内容 |
| `delayMs` | `500` | idle 之后等多久才发 |
| `maxRounds` | `0` | 每次开启后的补发上限，`0` = 不限 |
| `maxConsecutiveErrors` | `2` | 连续多少轮以 error 结束后自动关闭 |
| `continueOnError` | `true` | 单轮 error 结束后是否也续跑 |
| `stopOnUserAbort` | `true` | 用户点停止时是否自动关闭 |
| `maxSessionStates` | `200` | 内存里最多保留多少条会话的状态 |

---

## 目录结构

```
dsh-continue/
├── lib/
│   └── index.js            插件主体（命令 + idle 驱动的自动续跑）
├── cordis.patch.yml        bundle patch：往 profile 根上下文 insert 一行
├── package.json            dsh.bundle.patch 指向上面的 yml
├── test/
│   └── run.mjs             28 个离线单测，假 cordis ctx + 假 agent 跑真实插件代码
├── scripts/
│   ├── install.ps1         同步进 DSH + 写 profile manifest + pnpm 安装 + 落地校验
│   ├── verify-profile.mjs  用 dsh 自己的组合代码核对安装结果
│   └── extract-asar.mjs    解 app.asar 取 dsh 安装，给 verify 当解析锚点
├── README.md / README.en.md
├── INSTALL.md              安装方法
├── USAGE.md                使用方法
└── CHANGELOG.md
```

## 实现说明

全部基于 dsh 0.1.7 的**公开插件面**，没有私有 hook、没有补丁宿主文件：

- **命令**：`ctx.commands.register({ name: "continue", … })`。注册在根上下文，
  所以斜杠菜单里有它，而且它的输入**永远不会被当成 prompt 送给模型**。
- **「停下来」**：`ctx.on("agent/status", …)` 里 `status === "idle"` 的那次转换。
  dsh 只在状态真正变化时 emit，所以一轮最多触发一次。
- **投递**：`agent.followup(message)` —— 和用户按回车同一条路径
  （inbox `next-turn` + 唤醒 driver）。
- **判断这一轮该不该续**：只读 session 日志尾巴。`session.snapshotEvents()` 返回的
  是缓存的冻结数组，读它不产生拷贝，也不维护影子 transcript。
- **消息形状**：`source.kind === "user"`，所以它在历史、标题生成、turn outline 里
  和真人发言待遇一致 —— 这正是「自动输入发送继续」要的效果。插件靠自持的消息 id
  集合把它和真人发言区分开。

`lib/index.js` **不 import 任何 `@deepseek-ai/*` 包**，纯 ESM + node 内置模块，所以：

- 不会因为 profile 的模块解析层出问题而加载失败；
- 可以 `node test/run.mjs` 直接离线跑单测。

## 测试

```bash
node test/run.mjs
```

28 个场景：参数文法、每个决策分支、开关幂等、错误刹车、轮数上限、用户中止、
inbox 插队、拆插件后静默。

在线核对安装（需要一份解开的 dsh 安装当锚点）：

```bash
node scripts/extract-asar.mjs   # 首次，解到 %LOCALAPPDATA%\dsh-continue-cache
node scripts/verify-profile.mjs # 全绿输出 VERIFY OK
```

## 已知边界

- 只对**当前进程里活着**的 agent 生效。会话被回收、或者你刚从历史里打开一条会话，
  都需要重新 `/continue on`。
- 状态存在**进程内存**，重启宿主即清空 —— 刻意的，避免重启后旧会话自己开始烧 token。
- 钩在 `agent/status` 的 `idle` 上。如果某个工具把 agent 卡在 `running` 等你审批
  （`ask_user_question`、权限弹窗），它**不会**触发 —— 那种时候该说话的是你。
- `/continue on` 会把「当前最后一个 turn/end」直接标记成已处理，所以拨开关的那一刻
  不会立刻对上一轮补发一次。

## License

MIT
