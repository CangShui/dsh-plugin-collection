/**
 * dsh-continue 离线单测：用一个假 cordis ctx + 假 agent 跑真实的插件代码。
 *
 * 目的不是覆盖率，而是把「什么时候该补发、什么时候该住手」这几十个分支
 * 在装进 DSH 之前先钉死。跑法：
 *
 *   node test/run.mjs
 */

import assert from "node:assert/strict";
import {
  apply,
  decide,
  inspectTail,
  normalizeConfig,
  parseContinueInput,
} from "../lib/index.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
const failures = [];

async function test(title, body) {
  try {
    await body();
    passed += 1;
    process.stdout.write(`  ok   ${title}\n`);
  } catch (error) {
    failures.push({ title, error });
    process.stdout.write(`  FAIL ${title}\n        ${String(error?.message ?? error).split("\n").join("\n        ")}\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 假 DSH
// ─────────────────────────────────────────────────────────────────────────────

function makeAgent(id = "session-1") {
  const agent = {
    id,
    status: "idle",
    sent: [],
    session: {
      id,
      events: [],
      /** 和真 Session 一样：返回冻结的信号（这里直接给数组，调用方只读） */
      snapshotEvents() {
        return this.events;
      },
      append(type, data) {
        const event = Object.freeze({ type, data, seq: this.events.length, time: this.events.length });
        this.events.push(event);
        return event;
      },
    },
    inbox: { hasPending: false },
    followup(message) {
      agent.sent.push(message);
      // 真实路径：followup → inbox splice → 下一 turn 开头落成 user/message
      agent.session.append("user/message", message);
    },
  };
  return agent;
}

function mount(rawConfig = {}) {
  const commands = new Map();
  const listeners = new Map();
  const disposers = [];
  const live = new Map();
  const logs = [];

  const ctx = {
    logger: {
      info: (...args) => logs.push(["info", ...args]),
      warn: (...args) => logs.push(["warn", ...args]),
    },
    commands: {
      register(definition) {
        assert.equal(typeof definition.name, "string");
        assert.equal(typeof definition.description, "string");
        assert.ok(definition.description.trim().length > 0, "description 不能为空");
        assert.equal(typeof definition.handler, "function");
        assert.ok(definition.input && typeof definition.input.hint === "string");
        assert.ok(definition.input.hint.trim().length > 0, "input.hint 不能为空");
        assert.match(definition.name, /^[a-z][a-z0-9_-]*$/u);
        commands.set(definition.name, definition);
        return () => commands.delete(definition.name);
      },
    },
    agents: {
      get: (id) => live.get(id),
      list: () => [...live.values()],
    },
    on(event, fn) {
      const set = listeners.get(event) ?? new Set();
      set.add(fn);
      listeners.set(event, set);
      return () => set.delete(fn);
    },
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === "function") disposers.push(dispose);
      return dispose;
    },
  };

  apply(ctx, { delayMs: 5, ...rawConfig });

  return {
    commands,
    logs,
    live,
    /** 起一条会话并让插件认识它。 */
    open(agent) {
      live.set(agent.id, agent);
      return agent;
    },
    /** 触发一次 agent/status 转换。 */
    status(agent, status) {
      agent.status = status;
      for (const fn of listeners.get("agent/status") ?? []) fn({ agent, status });
    },
    /** 让 agent 变成 idle，并等过插件那层 debounce。 */
    async idle(agent) {
      this.status(agent, "idle");
      await sleep(40);
    },
    run(text, agent) {
      const definition = commands.get("continue");
      assert.ok(definition, "/continue 没有注册上");
      return definition.handler({
        agent,
        rawInput: text,
        attachments: [],
        commandId: "test",
      });
    },
    teardown() {
      for (const dispose of disposers.reverse()) dispose();
    },
  };
}

/** 往假 session 里写一轮完整的 turn。 */
function appendTurn(agent, { reason = { kind: "completed" }, prompt = null } = {}) {
  const events = agent.session;
  const turn = events.events.filter((e) => e.type === "turn/start").length + 1;
  events.append("turn/start", { turn });
  if (prompt !== null) {
    events.append("user/message", {
      id: `human-${turn}`,
      role: "user",
      content: [{ type: "text", text: prompt }],
      source: { kind: "user" },
    });
  }
  events.append("step/start", { turn, step: 1 });
  events.append("step/end", { turn, step: 1 });
  events.append("turn/end", { turn, reason });
  return turn;
}

// ─────────────────────────────────────────────────────────────────────────────
// 文法
// ─────────────────────────────────────────────────────────────────────────────

await test("/continue 没参数 = 看状态", () => {
  assert.deepEqual(parseContinueInput(""), { kind: "status" });
  assert.deepEqual(parseContinueInput("   "), { kind: "status" });
  assert.deepEqual(parseContinueInput(" status "), { kind: "status" });
  assert.deepEqual(parseContinueInput("状态"), { kind: "status" });
});

await test("/continue 1 和 on 都当开启", () => {
  for (const token of ["1", "on", "ON", "true", "yes", "开", "开启"]) {
    assert.deepEqual(parseContinueInput(` ${token}`), { kind: "on", maxRounds: 0 }, token);
  }
});

await test("/continue 0 和 off 都当关闭", () => {
  for (const token of ["0", "off", "OFF", "false", "no", "关", "关闭", "停"]) {
    assert.deepEqual(parseContinueInput(` ${token}`), { kind: "off" }, token);
  }
});

await test("N>1 开启并带上限，on 后面也可以跟轮数", () => {
  assert.deepEqual(parseContinueInput(" 12"), { kind: "on", maxRounds: 12 });
  assert.deepEqual(parseContinueInput(" on 5"), { kind: "on", maxRounds: 5 });
  assert.deepEqual(parseContinueInput(" 1 5"), { kind: "on", maxRounds: 5 });
  assert.equal(parseContinueInput(" on abc").kind, "invalid");
  assert.equal(parseContinueInput(" on 1 2").kind, "invalid");
  assert.equal(parseContinueInput(" 12 3").kind, "invalid");
  assert.equal(parseContinueInput(" 胡乱输入").kind, "invalid");
});

// ─────────────────────────────────────────────────────────────────────────────
// 纯决策
// ─────────────────────────────────────────────────────────────────────────────

const CFG = normalizeConfig({});

function baseState(over = {}) {
  return {
    id: "s",
    armed: true,
    maxRounds: 0,
    sent: 0,
    consecutiveErrors: 0,
    lastHandledEndSeq: -1,
    lastCountedEndSeq: -1,
    ownIds: new Set(),
    timer: null,
    ...over,
  };
}

await test("decide：正常收工就补发", () => {
  const outcome = decide({
    config: CFG,
    state: baseState(),
    tail: { hasTurn: true, endSeq: 7, reasonKind: "completed", reason: { kind: "completed" }, humanAfter: false },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(outcome.action, "send");
});

await test("decide：同一个 turn/end 只处理一次", () => {
  const outcome = decide({
    config: CFG,
    state: baseState({ lastHandledEndSeq: 7 }),
    tail: { hasTurn: true, endSeq: 7, reasonKind: "completed", reason: { kind: "completed" }, humanAfter: false },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(outcome.action, "keep");
});

await test("decide：用户按了停止就自动关闭", () => {
  const outcome = decide({
    config: CFG,
    state: baseState(),
    tail: {
      hasTurn: true,
      endSeq: 9,
      reasonKind: "aborted",
      reason: { kind: "aborted", reason: { kind: "user" } },
      humanAfter: false,
    },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(outcome.action, "disarm");
});

await test("decide：被父级/销毁中止不续跑但保持开启", () => {
  const outcome = decide({
    config: CFG,
    state: baseState(),
    tail: {
      hasTurn: true,
      endSeq: 9,
      reasonKind: "aborted",
      reason: { kind: "aborted", reason: { kind: "parent" } },
      humanAfter: false,
    },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(outcome.action, "wait");
});

await test("decide：不可恢复错误立刻关闭，可恢复错误先重试", () => {
  const permanent = decide({
    config: CFG,
    state: baseState(),
    tail: {
      hasTurn: true,
      endSeq: 3,
      reasonKind: "error",
      reason: { kind: "error", error: { code: "QUOTA" } },
      humanAfter: false,
    },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(permanent.action, "disarm");

  const transient = decide({
    config: CFG,
    state: baseState(),
    tail: {
      hasTurn: true,
      endSeq: 3,
      reasonKind: "error",
      reason: { kind: "error", error: { code: "TRANSPORT" } },
      humanAfter: false,
    },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(transient.action, "send");
});

await test("decide：连续错误到顶就关闭", () => {
  const outcome = decide({
    config: CFG,
    state: baseState({ consecutiveErrors: 2 }),
    tail: {
      hasTurn: true,
      endSeq: 3,
      reasonKind: "error",
      reason: { kind: "error", error: { code: "TRANSPORT" } },
      humanAfter: false,
    },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(outcome.action, "disarm");
});

await test("decide：inbox 里还有货 / agent 还在跑 都不动手", () => {
  const tail = { hasTurn: true, endSeq: 4, reasonKind: "completed", reason: { kind: "completed" }, humanAfter: false };
  assert.equal(decide({ config: CFG, state: baseState(), tail, agentStatus: "idle", inboxBusy: true }).action, "keep");
  assert.equal(decide({ config: CFG, state: baseState(), tail, agentStatus: "running", inboxBusy: false }).action, "keep");
});

await test("decide：turn 之后有真人发言就不动手", () => {
  const outcome = decide({
    config: CFG,
    state: baseState(),
    tail: { hasTurn: true, endSeq: 4, reasonKind: "completed", reason: { kind: "completed" }, humanAfter: true },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(outcome.action, "keep");
});

await test("decide：达到轮数上限就关闭", () => {
  const outcome = decide({
    config: normalizeConfig({ maxRounds: 3 }),
    state: baseState({ sent: 3 }),
    tail: { hasTurn: true, endSeq: 4, reasonKind: "completed", reason: { kind: "completed" }, humanAfter: false },
    agentStatus: "idle",
    inboxBusy: false,
  });
  assert.equal(outcome.action, "disarm");
});

await test("inspectTail：认得出自己发的消息，不算真人发言", () => {
  const events = [
    { type: "turn/start", seq: 0, data: { turn: 1 } },
    { type: "turn/end", seq: 1, data: { turn: 1, reason: { kind: "completed" } } },
    { type: "user/message", seq: 2, data: { id: "mine", source: { kind: "user" } } },
  ];
  assert.equal(inspectTail(events, new Set(["mine"])).humanAfter, false);
  assert.equal(inspectTail(events, new Set()).humanAfter, true);
  assert.equal(inspectTail([], new Set()).hasTurn, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 端到端（假 ctx）
// ─────────────────────────────────────────────────────────────────────────────

await test("装上之后 /continue 立刻可用，默认是关的", () => {
  const h = mount();
  assert.ok(h.commands.has("continue"));
  const agent = h.open(makeAgent());
  const result = h.run("", agent);
  assert.equal(result.kind, "success");
  assert.match(result.text, /自动续跑：关闭/u);
  h.teardown();
});

await test("开启前的旧 turn 不会被补发", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  appendTurn(agent, { reason: { kind: "completed" } });
  h.run(" on", agent);
  await h.idle(agent);
  assert.equal(agent.sent.length, 0, "开关一拨就对上一轮补发，等于没听指令");
  h.teardown();
});

await test("开启后：跑完一轮 → 自动补发「继续」→ 再跑完 → 继续补发", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" 1", agent);

  appendTurn(agent, { prompt: "把活干完" });
  await h.idle(agent);
  assert.equal(agent.sent.length, 1);
  assert.equal(agent.sent[0].content[0].text, "继续");
  assert.equal(agent.sent[0].role, "user");
  assert.equal(agent.sent[0].source.kind, "user");
  assert.equal(typeof agent.sent[0].id, "string");

  appendTurn(agent);
  await h.idle(agent);
  assert.equal(agent.sent.length, 2);

  appendTurn(agent);
  await h.idle(agent);
  assert.equal(agent.sent.length, 3);
  h.teardown();
});

await test("/continue off 之后彻底闭嘴", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" on", agent);
  appendTurn(agent);
  await h.idle(agent);
  assert.equal(agent.sent.length, 1);

  const off = h.run(" 0", agent);
  assert.equal(off.kind, "success");
  assert.match(off.text, /已关闭/u);

  appendTurn(agent);
  await h.idle(agent);
  appendTurn(agent);
  await h.idle(agent);
  assert.equal(agent.sent.length, 1, "关掉之后还在发");
  h.teardown();
});

await test("用户手动停止 → 自动关闭并留下可见提示", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" on", agent);
  appendTurn(agent, { reason: { kind: "completed" } });
  await h.idle(agent);
  assert.equal(agent.sent.length, 1);

  appendTurn(agent, { reason: { kind: "aborted", reason: { kind: "user" } } });
  await h.idle(agent);
  assert.equal(agent.sent.length, 1, "用户按了停止还在补发");

  const notice = agent.session.events.filter((event) => event.type === "command/done").at(-1);
  assert.ok(notice, "没有写入自动关闭提示");
  assert.match(notice.data.text, /自动续跑已关闭/u);
  assert.match(notice.data.text, /用户手动停止/u);

  const status = h.run("", agent);
  assert.match(status.text, /自动续跑：关闭/u);
  h.teardown();
});

await test("轮数上限 N 会真的停手", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" 2", agent);
  for (let i = 0; i < 5; i += 1) {
    appendTurn(agent);
    await h.idle(agent);
  }
  assert.equal(agent.sent.length, 2);
  assert.match(h.run("", agent).text, /自动续跑：关闭/u);
  h.teardown();
});

await test("连续两轮 error 之后自动关闭", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" on", agent);

  appendTurn(agent, { reason: { kind: "error", error: { code: "TRANSPORT" } } });
  await h.idle(agent);
  assert.equal(agent.sent.length, 1, "第一轮瞬时错误应该再试一次");

  appendTurn(agent, { reason: { kind: "error", error: { code: "TRANSPORT" } } });
  await h.idle(agent);
  assert.equal(agent.sent.length, 1, "错误已经到顶还在发");

  appendTurn(agent, { reason: { kind: "error", error: { code: "TRANSPORT" } } });
  await h.idle(agent);
  assert.equal(agent.sent.length, 1);
  assert.match(h.run("", agent).text, /自动续跑：关闭/u);
  h.teardown();
});

await test("不可恢复错误（QUOTA）第一次就关闭", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" on", agent);
  appendTurn(agent, { reason: { kind: "error", error: { code: "QUOTA" } } });
  await h.idle(agent);
  assert.equal(agent.sent.length, 0);
  assert.match(h.run("", agent).text, /自动续跑：关闭/u);
  h.teardown();
});

await test("inbox 里还有排队输入时不插队", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" on", agent);
  agent.inbox.hasPending = true;
  appendTurn(agent);
  await h.idle(agent);
  assert.equal(agent.sent.length, 0);

  agent.inbox.hasPending = false;
  await h.idle(agent);
  assert.equal(agent.sent.length, 1);
  h.teardown();
});

await test("turn 之后有人插话就不补发", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" on", agent);
  appendTurn(agent);
  agent.session.append("user/message", {
    id: "human-late",
    role: "user",
    content: [{ type: "text", text: "等一下" }],
    source: { kind: "user" },
  });
  await h.idle(agent);
  assert.equal(agent.sent.length, 0);
  h.teardown();
});

await test("`/continue on N` 的单次上限优先于配置的 maxRounds", async () => {
  const h = mount({ maxRounds: 0 });
  const agent = h.open(makeAgent());
  h.run(" on 1", agent);
  for (let i = 0; i < 4; i += 1) {
    appendTurn(agent);
    await h.idle(agent);
  }
  assert.equal(agent.sent.length, 1);
  assert.match(h.run("", agent).text, /自动续跑：关闭/u);

  // 重新用配置的默认值（不限）开启，应该又能跑起来
  h.run(" on", agent);
  appendTurn(agent);
  await h.idle(agent);
  appendTurn(agent);
  await h.idle(agent);
  assert.equal(agent.sent.length, 3);
  h.teardown();
});

await test("配置的 maxRounds 兜底生效", async () => {
  const h = mount({ maxRounds: 2 });
  const agent = h.open(makeAgent());
  h.run(" on", agent);
  for (let i = 0; i < 5; i += 1) {
    appendTurn(agent);
    await h.idle(agent);
  }
  assert.equal(agent.sent.length, 2);
  h.teardown();
});

await test("拆插件之后不再有任何动作", async () => {
  const h = mount();
  const agent = h.open(makeAgent());
  h.run(" on", agent);
  h.teardown();
  appendTurn(agent);
  await h.idle(agent);
  assert.equal(agent.sent.length, 0);
});

await test("enabled:false 时完全不挂载", () => {
  const h = mount({ enabled: false });
  assert.equal(h.commands.size, 0);
  h.teardown();
});

// ─────────────────────────────────────────────────────────────────────────────

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const { title, error } of failures) {
    process.stdout.write(`\n${title}\n${error?.stack ?? error}\n`);
  }
  process.exitCode = 1;
}
