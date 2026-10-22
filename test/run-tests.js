"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseNdjsonText } = require("../src/adapters/opencode");
const { unwrapJsonish } = require("../src/adapters/hermes");
const { synthesize } = require("../src/synthesizer");
const { dispatch, CircuitBreaker } = require("../src/dispatcher");

const sleep = (ms) => new Promise((r) => {
  const t = setTimeout(r, ms);
  if (typeof t.unref === "function") t.unref();
});

function stubAdapter({ ready = true, reason = "no", delayMs = 0, text = "answer", fail = false, hang = false } = {}) {
  return {
    preflight: async () => ({ ready, reason: ready ? null : reason }),
    run: async (brief, lane, hooks = {}) => {
      if (hang) return new Promise(() => {});
      if (delayMs) await sleep(delayMs);
      if (hooks && typeof hooks.registerChild === "function") hooks.registerChild({ kill() {}, exitCode: null });
      if (fail) return { ok: false, error: "stub failure", durationMs: delayMs, text: "" };
      return { ok: true, text, durationMs: delayMs, raw: "" };
    },
  };
}

function task(id, adapter, timeoutMs = 5000) {
  return { id, adapter, lane: { label: id, timeoutMs } };
}

test("opencode ndjson: extracts every text part and ignores noise", () => {
  const raw = [
    JSON.stringify({ type: "step_start", part: { id: "p1" } }),
    "not json at all",
    "",
    JSON.stringify({ type: "text", part: { text: "FIRST" } }),
    JSON.stringify({ type: "text", part: { text: "SECOND" } }),
    JSON.stringify({ type: "step_finish", part: { tokens: { total: 10 } } }),
  ].join("\n");
  assert.equal(parseNdjsonText(raw), "FIRST\nSECOND");
});

test("opencode ndjson: empty and garbage input produce empty string", () => {
  assert.equal(parseNdjsonText(""), "");
  assert.equal(parseNdjsonText("plain text no braces"), "");
  assert.equal(parseNdjsonText(undefined), "");
});

test("hermes unwrap: single-key JSON object is unwrapped", () => {
  assert.equal(unwrapJsonish('{"name": "AOS_OLLAMA_OK"}'), "AOS_OLLAMA_OK");
});

test("hermes unwrap: multi-key JSON and plain prose are left intact", () => {
  const multi = '{"a": "one", "b": "two"}';
  assert.equal(unwrapJsonish(multi), multi);
  const prose = "Here is the plan.\nStep 1: do the thing.";
  assert.equal(unwrapJsonish(prose), prose);
});

test("synthesizer: no winners yields no deliverable and reports failures", () => {
  const out = synthesize([{ laneId: "a", status: "error", error: "boom", durationMs: 5, text: "" }], {}, "req");
  assert.equal(out.deliverable, null);
  assert.equal(out.failures.length, 1);
  assert.equal(out.failures[0].lane, "a");
});

test("synthesizer: single winner renders the answer and no cross-lane section", () => {
  const out = synthesize([{ laneId: "a", status: "ok", error: null, durationMs: 900, text: "THE ANSWER" }], {}, "req");
  assert.match(out.deliverable, /## Answer/);
  assert.match(out.deliverable, /THE ANSWER/);
  assert.doesNotMatch(out.deliverable, /Cross-lane additions/);
  assert.equal(out.winner, "a");
});

test("synthesizer: two winners pick the fastest and add cross-lane section", () => {
  const out = synthesize([
    { laneId: "slow", status: "ok", error: null, durationMs: 9000, text: "SLOW TEXT" },
    { laneId: "fast", status: "ok", error: null, durationMs: 1000, text: "FAST TEXT" },
  ], {}, "req");
  assert.equal(out.winner, "fast");
  assert.match(out.deliverable, /Fastest lane: fast/);
  assert.match(out.deliverable, /Cross-lane additions/);
  assert.match(out.deliverable, /SLOW TEXT/);
  assert.ok(out.deliverable.indexOf("FAST TEXT") < out.deliverable.indexOf("SLOW TEXT"));
});

test("dispatcher: all lanes failing does not throw", async () => {
  const results = await dispatch([
    task("a", stubAdapter({ fail: true })),
    task("b", stubAdapter({ ready: false, reason: "gateway down" })),
  ], { deadlineMs: 3000, journal: null });
  assert.equal(results.length, 2);
  const byId = Object.fromEntries(results.map((r) => [r.laneId, r.status]));
  assert.equal(byId.a, "error");
  assert.equal(byId.b, "unavailable");
});

test("dispatcher: unavailable preflight reason is preserved for the user", async () => {
  const results = await dispatch([task("b", stubAdapter({ ready: false, reason: "gateway not listening" }))],
    { deadlineMs: 2000, journal: null });
  assert.equal(results[0].error, "gateway not listening");
});

test("dispatcher: first success cuts slower lanes instead of waiting for them", async () => {
  const results = await dispatch([
    task("fast", stubAdapter({ delayMs: 20, text: "FAST" })),
    task("slow", stubAdapter({ delayMs: 60000, text: "SLOW" })),
  ], { deadlineMs: 60000, graceAfterFirstSuccessMs: 30, journal: null });
  const byId = Object.fromEntries(results.map((r) => [r.laneId, r.status]));
  assert.equal(byId.fast, "ok");
  assert.equal(byId.slow, "cut");
});

test("dispatcher: a hanging lane is reported as timeout, not a hang", async () => {
  const results = await dispatch([task("hang", stubAdapter({ hang: true }), 150)],
    { deadlineMs: 3000, graceAfterFirstSuccessMs: 5000, journal: null });
  assert.equal(results[0].status, "timeout");
});

test("dispatcher: emits lane.start then lane.result events", async () => {
  const events = [];
  await dispatch([task("a", stubAdapter({ delayMs: 5, text: "x" }))], {
    deadlineMs: 3000, graceAfterFirstSuccessMs: 10, journal: null,
    onEvent: (e) => events.push(e.type),
  });
  assert.ok(events.includes("lane.start"), `events were ${events.join(",")}`);
  assert.ok(events.includes("lane.result"), `events were ${events.join(",")}`);
});

test("circuit breaker: opens after threshold failures and skips the lane", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 60000 });
  const failing = () => dispatch([task("x", stubAdapter({ fail: true }))],
    { deadlineMs: 1000, breaker, journal: null });
  await failing();
  await failing();
  const third = await failing();
  assert.equal(third[0].status, "skipped");
  assert.match(third[0].error, /circuit breaker/);
});

test("circuit breaker: a success resets the failure count", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 60000 });
  await dispatch([task("x", stubAdapter({ fail: true }))], { deadlineMs: 1000, breaker, journal: null });
  await dispatch([task("x", stubAdapter({ text: "ok" }))], { deadlineMs: 1000, breaker, journal: null });
  assert.equal(breaker.isOpen("x"), false);
});

test("circuit breaker: opens at threshold and closes once the cooldown expires", () => {
  const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
  breaker.recordFailure("x");
  assert.equal(breaker.isOpen("x"), true, "must be open right after tripping");

  breaker.key("x").openedAt = Date.now() - 120000;
  assert.equal(breaker.isOpen("x"), false, "must close after the cooldown elapses");
  assert.equal(breaker.key("x").failures, 0, "closing must reset the failure count");
});

test("circuit breaker: a lane below the failure threshold stays closed", () => {
  const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60000 });
  breaker.recordFailure("x");
  breaker.recordFailure("x");
  assert.equal(breaker.isOpen("x"), false);
  breaker.recordFailure("x");
  assert.equal(breaker.isOpen("x"), true);
});
