/**
 * dsh-continue — DeepSeek Harness 自动续跑插件
 *
 * `/continue on`（或 `/continue 1`）之后，只要这一条会话停下来，就自动往
 * 里面补发一条「继续」，让 agent 接着干；`/continue off`（或 `/continue 0`）
 * 结束。
 *
 * 设计要点（全部基于 dsh 0.1.7 的公开插件面，没有私有 hook）：
 *
 *  - 命令注册走 `ctx.commands.register()`，所以 `/continue` 会出现在斜杠菜单里，
 *    并且不会作为 prompt 送给模型。
 *  - 「停下来」= `agent/status` 的 `status === "idle"` 转换。dsh 只在状态真的变了
 *    才 emit，所以一次 turn 结束最多触发一次。
 *  - 续跑消息用 `agent.followup()` 投递，走的是和用户在输入框敲字完全一样的
 *    inbox 路径（next-turn + 唤醒 driver）。
 *  - 判断「这一轮是不是该续跑」只读 session 日志尾巴（`snapshotEvents()` 是缓存
 *    的冻结数组，读它不产生拷贝），不维护影子 transcript。
 *
 * 本文件不 import 任何 `@deepseek-ai/*` 包，纯 ESM + node 内置模块，
 * 方便离线单测，也不会因为包解析层出问题而加载失败。
 *
 * @module dsh-continue
 */

import { randomUUID } from "node:crypto";

/** Cordis 插件名。 */
export const name = "dsh-continue";

/** 需要在 `apply` 之前就绪的服务。 */
export const inject = ["commands", "agents"];

/** 默认配置；bundle patch 里的 `config:` 会覆盖同名键。 */
export const DEFAULT_CONFIG = Object.freeze({
  /** 总开关。false 时插件完全不挂载。 */
  enabled: true,
  /** 自动补发的内容。 */
  text: "继续",
  /** idle 之后再等多久才发，给「用户刚好也在敲字」留出观察窗口。 */
  delayMs: 500,
  /** 每次开启后的最多发送次数，0 = 不限。 */
  maxRounds: 0,
  /** 连续多少轮以 error 结束后自动关闭，防止对着一个坏 key 死循环。 */
  maxConsecutiveErrors: 2,
  /** 单轮以 error 结束时是否也续跑。 */
  continueOnError: true,
  /** 用户手动点停止时是否自动关闭。用户按了停止，就别再跟他抢。 */
  stopOnUserAbort: true,
  /** 内存里最多保留多少条会话的状态（超出按插入顺序淘汰）。 */
  maxSessionStates: 200,
});

/**
 * 一轮结束后「不值得再试」的错误码：换一轮「继续」也治不好，只会白烧 token。
 * 和 dsh-purge 的同名名单保持一致的思路。
 */
const PERMANENT_CODES = new Set([
  "AUTH",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID",
  "INVALID_REQUEST",
  "QUOTA",
  "ACCOUNT_QUOTA",
  "BILLING",
  "MODEL_NOT_FOUND",
  "NO_ADAPTER",
  "MISSING_CREDENTIAL",
  "INVALID_CREDENTIAL",
  "CONTEXT_OVERFLOW",
  "CONTEXT_LENGTH",
  "CONTEXT_WINDOW_EXCEEDED",
]);

/** 认为「这一轮正常收工，可以接着跑」的 turn/end reason。 */
const CONTINUABLE_KINDS = new Set(["completed", "max-tokens"]);

/** `ownIds` 的软上限：只留最近这么多条自己发的消息 id。 */
const OWN_ID_CAP = 64;

// ─────────────────────────────────────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────────────────────────────────────

/** 截断到整数并夹在 [min, max] 内。 */
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * 把任意输入收敛成一份完整配置。
 * @param raw patch 里的 `config:`，可能是 undefined。
 * @returns 冻结的配置对象。
 */
export function normalizeConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const text = typeof src.text === "string" ? src.text.trim() : "";
  return Object.freeze({
    enabled: src.enabled !== false,
    text: text || DEFAULT_CONFIG.text,
    delayMs: clampInt(src.delayMs, DEFAULT_CONFIG.delayMs, 0, 60_000),
    maxRounds: clampInt(src.maxRounds, DEFAULT_CONFIG.maxRounds, 0, 100_000),
    maxConsecutiveErrors: clampInt(
      src.maxConsecutiveErrors,
      DEFAULT_CONFIG.maxConsecutiveErrors,
      1,
      100,
    ),
    continueOnError: src.continueOnError !== false,
    stopOnUserAbort: src.stopOnUserAbort !== false,
    maxSessionStates: clampInt(
      src.maxSessionStates,
      DEFAULT_CONFIG.maxSessionStates,
      1,
      10_000,
    ),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// `/continue` 参数文法
// ─────────────────────────────────────────────────────────────────────────────

const USAGE =
  "用法：/continue [on|off|status] [轮数]\n"
  + "  1 / on / 开     开启自动续跑（不限轮数）\n"
  + "  0 / off / 关    关闭自动续跑\n"
  + "  N（N>1）        开启自动续跑，最多补发 N 次\n"
  + "  留空 / status   查看当前状态";

const ON_WORDS = new Set(["1", "on", "true", "yes", "start", "开", "开启", "启动"]);
const OFF_WORDS = new Set(["0", "off", "false", "no", "stop", "关", "关闭", "停", "停止"]);
const STATUS_WORDS = new Set(["status", "state", "?", "状态"]);

/**
 * 解析 `/continue` 后面的裸参数。
 * @param rawInput CommandRuntime 切出来的 rawInput（保留前导空格）。
 * @returns 解析结果；`{ kind: "invalid", message }` 表示文法错误。
 */
export function parseContinueInput(rawInput) {
  const input = String(rawInput == null ? "" : rawInput).trim();
  if (input === "") return { kind: "status" };
  const tokens = input.split(/\s+/u);
  const head = tokens[0].toLowerCase();
  const rest = tokens.slice(1);
  if (STATUS_WORDS.has(head)) return { kind: "status" };
  if (OFF_WORDS.has(head)) return { kind: "off" };
  // 第二个 token 只对 "on" 形式生效：/continue on 5
  const trailing = rest.length > 0 ? Number(rest[0]) : undefined;
  if (ON_WORDS.has(head)) {
    if (rest.length > 1) return { kind: "invalid", message: "on 只接受一个轮数参数。" };
    if (rest.length === 1 && (!Number.isFinite(trailing) || trailing < 0)) {
      return { kind: "invalid", message: `轮数必须是正整数，收到 ${JSON.stringify(rest[0])}。` };
    }
    return { kind: "on", maxRounds: rest.length === 1 ? Math.trunc(trailing) : 0 };
  }
  if (/^\d+$/u.test(head)) {
    if (rest.length > 0) return { kind: "invalid", message: "数字形式后面不再接受参数。" };
    const n = Number(head);
    if (n === 0) return { kind: "off" };
    return { kind: "on", maxRounds: n };
  }
  return { kind: "invalid", message: `看不懂 ${JSON.stringify(tokens[0])}。` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 读 session 尾巴
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 取一条 session 的事件数组。`snapshotEvents()` 返回的是缓存的冻结数组，
 * 读它不产生拷贝；没有这个方法时退回 `session.events`。
 * @param session Agent 的 session。
 * @returns 事件数组，读不到时返回空数组。
 */
export function sessionEventsOf(session) {
  if (!session) return [];
  try {
    if (typeof session.snapshotEvents === "function") {
      const events = session.snapshotEvents();
      if (Array.isArray(events)) return events;
    }
  } catch {
    /* 落到下面的兜底读法 */
  }
  try {
    if (Array.isArray(session.events)) return session.events;
  } catch {
    /* 读不到就当空日志 */
  }
  return [];
}

/**
 * 这一轮的 turn/end 是不是「用户自己按的停止」。
 * @param reason `turn/end` 的 data.reason。
 */
export function isUserAbort(reason) {
  if (!reason || reason.kind !== "aborted") return false;
  const cause = reason.reason;
  if (cause === "user" || cause === "cancel") return true;
  if (cause && typeof cause === "object") {
    return cause.kind === "user" || cause.kind === "cancel";
  }
  return false;
}

/**
 * 错误码，大写。`turn/end` 的 error reason 形如 `{ kind: "error", error: { code } }`。
 * @param reason `turn/end` 的 data.reason。
 */
export function failureCodeOf(reason) {
  const raw = reason?.error?.code ?? reason?.failure?.code ?? reason?.code;
  return String(raw == null ? "" : raw).toUpperCase();
}

/**
 * 扫日志尾巴：最后一个 `turn/end`，以及它之后有没有「真人」再敲过字。
 * @param events 事件数组（时间正序）。
 * @param ownIds 本插件自己投递过的消息 id 集合；这些不算真人发言。
 * @returns 尾巴摘要。
 */
export function inspectTail(events, ownIds) {
  const list = Array.isArray(events) ? events : [];
  let endIndex = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.type === "turn/end") {
      endIndex = i;
      break;
    }
  }
  const end = endIndex >= 0 ? list[endIndex] : null;
  const reason = end?.data?.reason ?? null;

  let humanAfter = false;
  for (let i = endIndex + 1; i < list.length; i += 1) {
    const event = list[i];
    if (event?.type !== "user/message") continue;
    const id = event.data?.id;
    if (id && ownIds?.has?.(id)) continue;
    // source.kind === "user" 是 dsh 给「输入框里敲出来的话」打的标。
    if (event.data?.source?.kind === "user") {
      humanAfter = true;
      break;
    }
  }

  return {
    hasTurn: end !== null,
    endSeq: end?.seq ?? -1,
    turn: end?.data?.turn ?? 0,
    reason,
    reasonKind: typeof reason?.kind === "string" ? reason.kind : "",
    humanAfter,
  };
}

/** inbox 里还有没有排队的活儿。 */
export function inboxBusy(agent) {
  try {
    const inbox = agent?.inbox;
    if (!inbox) return false;
    if (typeof inbox.hasPending === "boolean") return inbox.hasPending;
    if (typeof inbox.hasPending === "function") return inbox.hasPending();
    if (Array.isArray(inbox.nextTurn) && inbox.nextTurn.length > 0) return true;
    if (Array.isArray(inbox.nextStep) && inbox.nextStep.length > 0) return true;
  } catch {
    /* 读不到就不当成 busy */
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 决策
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 本次开启生效的补发上限。`/continue on N` 只为这一次开启设上限；
 * 没设（0）才回落到插件配置。
 * @param state 该会话状态。
 * @param config 归一化配置。
 * @returns 上限，0 表示不限。
 */
export function effectiveRounds(state, config) {
  const bound = Number(state?.maxRounds) || 0;
  return bound > 0 ? bound : config.maxRounds;
}

/**
 * 纯决策函数：给定当前状态，这一轮的 idle 该怎么处理。
 *
 * @param input.config 归一化后的配置。
 * @param input.state  该会话的插件状态。
 * @param input.tail   {@link inspectTail} 的结果。
 * @param input.agentStatus `agent.status`。
 * @param input.inboxBusy  inbox 是否还有排队。
 * @returns `{ action: "send" | "keep" | "wait" | "disarm", note }`
 *   - `send`  发一条续跑；
 *   - `keep`  什么都不做，也不改 lastHandledEndSeq（等真正的时机）；
 *   - `wait`  这一轮不续跑，但保持开启，并记下已处理；
 *   - `disarm` 自动关闭，并记下已处理。
 */
export function decide(input) {
  const { config, state, tail, agentStatus, inboxBusy: busy } = input;

  if (!state.armed) return { action: "keep", note: "未开启" };
  if (!tail.hasTurn) return { action: "keep", note: "还没有跑完的 turn" };
  if (tail.endSeq === state.lastHandledEndSeq) {
    return { action: "keep", note: "这个 turn 已经处理过" };
  }
  if (agentStatus !== "idle") return { action: "keep", note: "agent 仍在跑" };
  if (busy) return { action: "keep", note: "inbox 还有待处理的输入" };
  if (tail.humanAfter) return { action: "keep", note: "turn 之后有真人发言" };

  const kind = tail.reasonKind;

  if (kind === "aborted") {
    if (config.stopOnUserAbort && isUserAbort(tail.reason)) {
      return { action: "disarm", note: "用户手动停止了这一轮" };
    }
    return { action: "wait", note: "这一轮被中止（非用户操作），保持开启" };
  }
  if (kind === "blocked") {
    return { action: "wait", note: "这一轮被拦截，保持开启" };
  }
  if (kind === "error") {
    if (!config.continueOnError) {
      return { action: "wait", note: "这一轮以错误结束，continueOnError=false" };
    }
    const code = failureCodeOf(tail.reason);
    if (code && PERMANENT_CODES.has(code)) {
      return { action: "disarm", note: `遇到不可恢复的错误 ${code}` };
    }
    if (state.consecutiveErrors >= config.maxConsecutiveErrors) {
      return {
        action: "disarm",
        note: `连续 ${state.consecutiveErrors} 轮以错误结束`,
      };
    }
    return { action: "send", note: code ? `错误 ${code} 后重试` : "错误后重试" };
  }
  if (!CONTINUABLE_KINDS.has(kind)) {
    return { action: "keep", note: `未知的 turn 结束原因 ${JSON.stringify(kind)}` };
  }
  const limit = effectiveRounds(state, config);
  if (limit > 0 && state.sent >= limit) {
    return { action: "disarm", note: `已达到 ${limit} 轮上限` };
  }
  return { action: "send", note: kind === "max-tokens" ? "上一轮被 token 用尽截断" : "上一轮正常收工" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 消息
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 造一条和用户手敲完全同形的 user 消息。
 *
 * `source.kind === "user"` 是刻意的：这样它在 transcript、标题生成、turn outline
 * 里的待遇和真人发言一致（也就是用户要的「自动输入发送继续」）。插件靠自持的
 * 消息 id 集合把它和真人发言区分开。
 *
 * @param text 发送内容。
 * @returns 可交给 `agent.followup()` 的消息。
 */
export function createContinueMessage(text) {
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 插件主体
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 挂载插件。
 * @param ctx Cordis 上下文。
 * @param rawConfig bundle patch 里 `config:` 的内容。
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  if (!config.enabled) return;

  /** sessionId → 状态。语义上的 key 就是 agent.id（两者恒等）。 */
  const states = new Map();
  /** 所有未触发的定时器，拆插件时统一清掉。 */
  const timers = new Set();
  let stopped = false;

  const log = (level, message, ...rest) => {
    try {
      const logger = ctx.logger;
      const fn = logger && typeof logger[level] === "function" ? logger[level].bind(logger) : console[level];
      fn(`[dsh-continue] ${message}`, ...rest);
    } catch {
      /* 日志失败不影响主流程 */
    }
  };

  // ── 状态 ────────────────────────────────────────────────────────────────

  function stateFor(sessionId) {
    const id = String(sessionId || "");
    if (!id) return null;
    let state = states.get(id);
    if (state) return state;
    if (states.size >= config.maxSessionStates) {
      const oldest = states.keys().next().value;
      if (oldest !== undefined) {
        const stale = states.get(oldest);
        if (stale?.timer) clearTimeout(stale.timer);
        states.delete(oldest);
      }
    }
    state = {
      id,
      armed: false,
      maxRounds: config.maxRounds,
      sent: 0,
      consecutiveErrors: 0,
      lastHandledEndSeq: -1,
      lastCountedEndSeq: -1,
      ownIds: new Set(),
      timer: null,
    };
    states.set(id, state);
    return state;
  }

  function boundRounds(state) {
    // `/continue on N` 可以给本次开启单独设上限；0 表示跟随配置。
    return effectiveRounds(state, config);
  }

  // ── 可见提示 ─────────────────────────────────────────────────────────────
  //
  // 自动关闭时不能默默无声。往日志里塞一对 command/run + command/done，
  // 前端会把它渲染成一条命令结果卡片——和用户真的敲了 `/continue` 一样，
  // 但完全不消耗模型的那一轮。

  function appendNotice(session, text) {
    if (!session || typeof session.append !== "function") return;
    const commandId = `dsh-continue-auto-${randomUUID()}`;
    try {
      session.append("command/run", {
        commandId,
        name: "continue",
        source: { kind: "user" },
      });
      session.append("command/done", { commandId, kind: "success", text });
    } catch (error) {
      log("warn", `写入自动关闭提示失败：${String(error && error.message ? error.message : error)}`);
    }
  }

  function disarm(agent, state, note) {
    if (!state.armed) return;
    state.armed = false;
    state.maxRounds = config.maxRounds;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    const summary = state.sent > 0 ? `已自动补发 ${state.sent} 次「${config.text}」。` : "";
    appendNotice(agent?.session, `自动续跑已关闭：${note}。${summary}`);
    log("info", `会话 ${state.id} 自动续跑关闭：${note}`);
  }

  // ── 投递 ────────────────────────────────────────────────────────────────

  function sendContinue(agent, state) {
    if (typeof agent?.followup !== "function") {
      return { ok: false, error: "当前 agent 不支持 followup()" };
    }
    const message = createContinueMessage(config.text);
    try {
      agent.followup(message);
    } catch (error) {
      return { ok: false, error: String(error && error.message ? error.message : error) };
    }
    state.sent += 1;
    state.ownIds.add(message.id);
    if (state.ownIds.size > OWN_ID_CAP) {
      const oldest = state.ownIds.values().next().value;
      if (oldest !== undefined) state.ownIds.delete(oldest);
    }
    return { ok: true, id: message.id };
  }

  // ── idle 处理 ───────────────────────────────────────────────────────────

  function evaluate(agent) {
    if (stopped) return;
    const state = stateFor(agent?.id);
    if (!state || !state.armed) return;
    // 长开进程里 session 会被回收，registry 里的那一份才是活的。
    if (typeof ctx.agents?.get === "function" && ctx.agents.get(agent.id) !== agent) return;

    const tail = inspectTail(sessionEventsOf(agent.session), state.ownIds);
    // 同一个 turn/end 只计一次账：keep 分支不改 lastHandledEndSeq，
    // 不加这个 guard 的话一次「inbox busy」就能把错误计数刷成两倍。
    if (tail.endSeq !== state.lastCountedEndSeq) {
      state.lastCountedEndSeq = tail.endSeq;
      if (tail.reasonKind === "error") state.consecutiveErrors += 1;
      else state.consecutiveErrors = 0;
    }

    const outcome = decide({
      config,
      state,
      tail,
      agentStatus: agent.status,
      inboxBusy: inboxBusy(agent),
    });

    if (outcome.action === "keep") return;
    state.lastHandledEndSeq = tail.endSeq;

    if (outcome.action === "disarm") {
      disarm(agent, state, outcome.note);
      return;
    }
    if (outcome.action === "wait") return;

    const limit = boundRounds(state);
    if (limit > 0 && state.sent >= limit) {
      disarm(agent, state, `已达到 ${limit} 轮上限`);
      return;
    }

    const sent = sendContinue(agent, state);
    if (!sent.ok) {
      log("warn", `会话 ${state.id} 补发失败：${sent.error}`);
      return;
    }
    log("info", `会话 ${state.id} 已补发第 ${state.sent} 次「${config.text}」（${outcome.note}）`);
  }

  function scheduleIdle(agent) {
    const state = stateFor(agent?.id);
    if (!state || !state.armed || stopped) return;
    if (state.timer) clearTimeout(state.timer);
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (state.timer === timer) state.timer = null;
      try {
        evaluate(agent);
      } catch (error) {
        log("warn", `idle 处理异常：${String(error && error.message ? error.message : error)}`);
      }
    }, config.delayMs);
    state.timer = timer;
    timers.add(timer);
  }

  // ── `/continue` 命令 ────────────────────────────────────────────────────

  function describe(state) {
    const limit = boundRounds(state);
    return [
      `自动续跑：${state.armed ? "开启" : "关闭"}`,
      `已补发：${state.sent} 次`,
      `上限：${limit > 0 ? `${limit} 轮` : "不限"}`,
      `内容：「${config.text}」`,
      state.armed ? "关闭：/continue off" : "开启：/continue on",
    ].join("\n");
  }

  function runCommand(invocation) {
    const agent = invocation?.agent;
    const state = stateFor(agent?.id);
    if (!state) {
      return { kind: "error", text: "拿不到当前会话 id，/continue 无法生效。" };
    }
    const parsed = parseContinueInput(invocation?.rawInput);
    switch (parsed.kind) {
      case "status":
        return { kind: "success", text: describe(state) };
      case "invalid":
        return { kind: "error", text: `${parsed.message}\n${USAGE}` };
      case "off": {
        const before = state.armed;
        state.armed = false;
        state.maxRounds = config.maxRounds;
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        return {
          kind: "success",
          text: [
            before ? "自动续跑：已关闭" : "自动续跑：本来就是关闭的",
            `本次共补发 ${state.sent} 次。`,
            "重新开启：/continue on",
          ].join("\n"),
        };
      }
      case "on": {
        const reopened = state.armed;
        state.armed = true;
        state.sent = 0;
        state.consecutiveErrors = 0;
        state.maxRounds = parsed.maxRounds;
        // 打开时把当前 turn/end 标记成已处理：否则开关一拨立刻对「上一轮」补发一次，
        // 用户体验上像是它没听指令。
        const tail = inspectTail(sessionEventsOf(agent?.session), state.ownIds);
        state.lastHandledEndSeq = tail.endSeq;
        state.lastCountedEndSeq = tail.endSeq;
        const limit = boundRounds(state);
        return {
          kind: "success",
          text: [
            reopened ? "自动续跑：已重新开启" : "自动续跑：已开启",
            `会话停下来 ${config.delayMs}ms 后自动发送「${config.text}」。`,
            `上限：${limit > 0 ? `${limit} 轮` : "不限"}`,
            "关闭：/continue off",
          ].join("\n"),
        };
      }
      /* v8 ignore next 3 -- parseContinueInput 的返回值是封闭集合 */
      default:
        return { kind: "error", text: USAGE };
    }
  }

  // ── 挂载 ────────────────────────────────────────────────────────────────

  ctx.effect(
    () => ctx.commands.register({
      definitionId: "dsh-continue",
      name: "continue",
      description: "自动续跑：会话停下来就自动补发一条续跑消息",
      input: { hint: "[on|off|status] [轮数]" },
      handler: runCommand,
    }),
    "dsh-continue.command",
  );

  ctx.on("agent/status", ({ agent, status }) => {
    if (stopped || !agent) return;
    if (status !== "idle") return;
    scheduleIdle(agent);
  });

  ctx.on("agent/disposed", ({ agent }) => {
    const state = agent ? states.get(String(agent.id)) : undefined;
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    states.delete(state.id);
  });

  ctx.effect(() => () => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const state of states.values()) state.timer = null;
    states.clear();
  }, "dsh-continue.teardown");

  log("info", `已挂载（内容「${config.text}」，延迟 ${config.delayMs}ms）`);
}

export default { name, inject, apply };
