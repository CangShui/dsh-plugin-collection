# Changelog

## 1.0.0 — 2026-01-01

首个版本。

- `/continue on` / `/continue 1` 开启自动续跑，`/continue off` / `/continue 0` 关闭。
- `/continue N`（N>1）与 `/continue on N` 支持单次开启的轮数上限。
- `/continue` / `/continue status` 查看开关、已补发次数与上限。
- `source.kind === "user"` 的续跑消息，走 `agent.followup()`，与用户手敲回车同一条路径。
- 自动刹车：用户手动停止、连续错误、不可恢复错误码、轮数上限、inbox 排队、
  turn 之后有真人插话。
- 自动关闭时写入 `command/run` + `command/done` 可见提示，不消耗模型轮次。
- 配置项：`enabled` / `text` / `delayMs` / `maxRounds` / `maxConsecutiveErrors` /
  `continueOnError` / `stopOnUserAbort` / `maxSessionStates`。
- `lib/index.js` 不依赖任何 `@deepseek-ai/*` 包，可离线单测。
- 28 个离线单测（`node test/run.mjs`）+ profile 组合校验（`scripts/verify-profile.mjs`）。
