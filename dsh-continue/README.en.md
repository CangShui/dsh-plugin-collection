# dsh-continue

Auto-continuation for **DeepSeek Harness**.

Turn it on once, and every time the session goes quiet the plugin appends one more
`继续` ("keep going") on your behalf. Turn it off just as easily.

```
/continue 1        ← on  (same as /continue on)
/continue 0        ← off (same as /continue off)
```

Chinese docs: [README.md](README.md).

---

## What it does

| You type | Behaviour |
| --- | --- |
| `/continue` / `/continue status` | Show arming state, how many messages were sent, the cap |
| `/continue 1` / `/continue on` | Arm, unlimited rounds |
| `/continue 0` / `/continue off` | Disarm |
| `/continue 5` | Arm, at most 5 messages this arming |
| `/continue on 5` | Same |

After arming, each time the turn ends the plugin:

1. waits **500 ms** (default) — a window for "you were typing too";
2. re-checks that the agent is really idle and the inbox holds nothing queued;
3. delivers a `user` message whose text is `继续`, through **exactly the same
   inbox path** as pressing Enter yourself.

So it keeps rolling turn after turn until you disarm it or a safety stop fires.

## Safety stops

| Situation | Behaviour |
| --- | --- |
| You press the Stop button | **Auto-disarms**, leaving a visible note in the session |
| 2 consecutive error turns | Auto-disarms |
| Unrecoverable error (`QUOTA` / `AUTH` / `INVALID_REQUEST` / context overflow …) | Auto-disarms immediately |
| Round cap reached | Auto-disarms |
| Inbox still has queued input / agent still running | Does nothing |
| A human spoke after the turn ended | Does nothing |
| Aborted by parent or host (not by you) | Skips this round, **stays armed** |

On auto-disarm the plugin appends a `command/run` + `command/done` pair, which the
front end renders as a command-result card. **No model turn is spent on it.**

## Install

```bash
dsh plugin --profile <name> add "C:\path\to\dsh-continue"
```

Then restart. (The `desktop` profile is owned exclusively by the Electron app, so its
CLI path is blocked — use `scripts/install.ps1` for that one, or the in-app plugin manager.)

Verify:

```bash
dsh --profile <name> --dump-config | grep dsh-continue
```

or, offline:

```bash
node scripts/extract-asar.mjs    # once: unpacks the dsh installation as the resolution anchor
node scripts/verify-profile.mjs  # prints VERIFY OK when the profile composition is sound
```

## Config

Edit the `config:` block in `cordis.patch.yml`, or override by id from the profile's
own `cordis.patch.yml`:

```yaml
- id: dsh-continue
  config:
    text: "接着做"
    delayMs: 800
    maxRounds: 20
```

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | `false` mounts nothing |
| `text` | `"继续"` | What gets sent |
| `delayMs` | `500` | Wait after idle before sending |
| `maxRounds` | `0` | Cap per arming, `0` = unlimited |
| `maxConsecutiveErrors` | `2` | Error turns before auto-disarm |
| `continueOnError` | `true` | Continue after a single error turn |
| `stopOnUserAbort` | `true` | Auto-disarm when you press Stop |
| `maxSessionStates` | `200` | In-memory session-state cap |

## Implementation

Only public plugin surface from dsh 0.1.7 — no private hooks, no host patching:

- **Command**: `ctx.commands.register({ name: "continue", … })` at the root context,
  so it shows up in the slash menu and its input is never sent to the model as a prompt.
- **"Stopped"**: the `status === "idle"` transition on `ctx.on("agent/status", …)`.
  dsh only emits on real transitions, so a turn triggers it at most once.
- **Delivery**: `agent.followup(message)` — the same path as pressing Enter.
- **Should we continue?** reads only the session log tail; `session.snapshotEvents()`
  is a cached frozen array, so reading it costs no copy and keeps no shadow transcript.
- **Message shape**: `source.kind === "user"`, so it is treated like human input in
  history, title generation, and turn outlines — that is the point. The plugin tells
  its own messages apart by id.

`lib/index.js` imports **no `@deepseek-ai/*` package**, so it cannot fail on the
profile module-resolution layer and can be unit-tested with plain Node.

## Tests

```bash
node test/run.mjs
```

28 scenarios over a fake cordis context and fake agent driving the real plugin code.

## Known limits

- Only live agents in the current process. A recycled session, or a historical
  session you just opened, needs a fresh `/continue on`.
- Hooked on the `idle` transition. If a tool parks the agent in `running` waiting
  for your approval or an answer (`ask_user_question`, permission prompts), it will
  **not** fire — correct, that is when you should be talking.
- Arming marks the current last `turn/end` as already handled, so flipping the switch
  never immediately re-sends for the previous turn.

## License

MIT
