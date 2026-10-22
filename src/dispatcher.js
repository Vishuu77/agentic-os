"use strict";

const { log } = require("./lib/log");

class CircuitBreaker {
  constructor({ failureThreshold = 2, cooldownMs = 120000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.state = new Map();
  }

  key(laneId) {
    let entry = this.state.get(laneId);
    if (!entry) {
      entry = { failures: 0, openedAt: 0 };
      this.state.set(laneId, entry);
    }
    return entry;
  }

  isOpen(laneId) {
    const entry = this.key(laneId);
    if (entry.failures < this.failureThreshold) return false;
    if (entry.openedAt && Date.now() - entry.openedAt >= this.cooldownMs) {
      entry.failures = 0;
      entry.openedAt = 0;
      return false;
    }
    return true;
  }

  recordSuccess(laneId) {
    const entry = this.key(laneId);
    entry.failures = 0;
    entry.openedAt = 0;
  }

  recordFailure(laneId) {
    const entry = this.key(laneId);
    entry.failures += 1;
    if (entry.failures >= this.failureThreshold) entry.openedAt = Date.now();
  }
}

function withDeadline(promise, deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return Promise.resolve({ timedOutEarly: true });
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timedOutEarly: true }), remaining);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); resolve({ rejected: String(err && err.message ? err.message : err) }); },
    );
  });
}

function killAll(children) {
  for (const child of children.values()) {
    try {
      if (child && child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
  children.clear();
}

async function dispatch(tasks, options) {
  const {
    deadlineMs = 300000,
    graceAfterFirstSuccessMs = 6000,
    breaker = new CircuitBreaker(),
    journal = null,
    onEvent = null,
  } = options;

  const emit = (type, payload = {}) => {
    if (typeof onEvent === "function") {
      try {
        onEvent({ type, at: Date.now(), ...payload });
      } catch {
        /* a bad listener must never break the run */
      }
    }
  };

  const deadlineAt = Date.now() + deadlineMs;
  const children = new Map();
  const settled = [];
  const finished = new Set();
  let graceTimer = null;
  let releaseGate = null;
  const gate = new Promise((resolve) => { releaseGate = resolve; });

  const jobs = tasks.map(async (task) => {
    const { id: laneId, lane, adapter } = task;

    if (breaker.isOpen(laneId)) {
      const outcome = { laneId, status: "skipped", error: "circuit breaker open", durationMs: 0, text: "" };
      settled.push(outcome);
      emit("lane.result", { lane: laneId, ...outcome, text: undefined });
      if (journal) journal.write({ event: "lane.skipped", lane: laneId, reason: "circuit_open" });
      return outcome;
    }

    const check = await adapter.preflight(lane);
    if (!check.ready) {
      breaker.recordFailure(laneId);
      const outcome = { laneId, status: "unavailable", error: check.reason, durationMs: 0, text: "" };
      settled.push(outcome);
      finished.add(laneId);
      emit("lane.result", { lane: laneId, ...outcome, text: undefined });
      log("WARN", `${laneId}: ${check.reason}`);
      if (journal) journal.write({ event: "lane.unavailable", lane: laneId, reason: check.reason });
      return outcome;
    }

    const started = Date.now();
    log("INFO", `${laneId}: start`);
    emit("lane.start", { lane: laneId, label: lane.label || laneId });

    const result = await withDeadline(
      adapter.run(task.brief, lane, {
        registerChild: (child) => children.set(laneId, child),
      }),
      Math.min(deadlineAt, started + (lane.timeoutMs || deadlineMs)),
    );

    finished.add(laneId);
    let outcome;
    if (result && result.timedOutEarly) {
      outcome = { laneId, status: "timeout", error: "exceeded global deadline", durationMs: Date.now() - started, text: "" };
    } else if (result && result.rejected) {
      outcome = { laneId, status: "error", error: result.rejected, durationMs: Date.now() - started, text: "" };
    } else if (result && result.ok) {
      outcome = { laneId, status: "ok", error: null, durationMs: result.durationMs, text: result.text };
      breaker.recordSuccess(laneId);
    } else {
      outcome = {
        laneId,
        status: "error",
        error: (result && result.error) || "unknown failure",
        durationMs: (result && result.durationMs) || (Date.now() - started),
        text: "",
      };
      breaker.recordFailure(laneId);
    }

    settled.push(outcome);
    emit("lane.result", { lane: laneId, status: outcome.status, durationMs: outcome.durationMs, error: outcome.error });
    if (journal) journal.write({ event: "lane.done", lane: laneId, status: outcome.status, durationMs: outcome.durationMs, error: outcome.error });
    log(outcome.status === "ok" ? "INFO" : "WARN",
      `${laneId}: ${outcome.status} in ${(outcome.durationMs / 1000).toFixed(1)}s${outcome.error ? ` (${outcome.error})` : ""}`);

    if (outcome.status === "ok" && !graceTimer) {
      emit("first.success", { lane: laneId, durationMs: outcome.durationMs });
      graceTimer = setTimeout(() => releaseGate("first-success"), graceAfterFirstSuccessMs);
    }
    return outcome;
  });

  const all = Promise.all(jobs);
  await Promise.race([all, gate]);

  const anyOk = settled.some((o) => o.status === "ok");
  if (anyOk && settled.length < tasks.length) {
    emit("cut.stragglers", { count: tasks.length - settled.length });
    log("INFO", `first lane answered; cutting ${tasks.length - settled.length} slower lane(s)`);
  }
  killAll(children);

  const results = settled.slice();
  for (const task of tasks) {
    if (finished.has(task.id) || results.some((o) => o.laneId === task.id)) continue;
    const cut = { laneId: task.id, status: "cut", error: "cut after first success", durationMs: 0, text: "" };
    results.push(cut);
    emit("lane.result", { lane: task.id, status: cut.status, durationMs: 0, error: cut.error });
  }

  if (journal) {
    for (const r of results) journal.write({ event: "lane.result", lane: r.laneId, status: r.status, durationMs: r.durationMs, error: r.error });
  }
  emit("dispatch.finish", { count: results.length });
  results.sort((a, b) => a.durationMs - b.durationMs);
  return results;
}

module.exports = { dispatch, CircuitBreaker };
