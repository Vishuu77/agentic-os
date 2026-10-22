"use strict";

const fs = require("fs");
const path = require("path");

const { resolveLanes, buildBrief } = require("./master");
const { dispatch, CircuitBreaker } = require("./dispatcher");
const { synthesize } = require("./synthesizer");
const { createRunJournal } = require("./lib/log");

const CONFIG_PATH = path.resolve(__dirname, "..", "config", "lanes.config.json");

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function newRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function runRequest(request, flags = {}, hooks = {}) {
  const config = hooks.config || loadConfig();
  const global = config.global || {};
  const deadlineMs = Number.isFinite(flags.deadline) && flags.deadline > 0
    ? flags.deadline
    : global.defaultDeadlineMs || 300000;

  const runId = flags.runId || newRunId();
  const journal = flags.journal === null ? null : (flags.journal || createRunJournal(runId));

  const lanes = resolveLanes(config, flags.lanes);
  if (!lanes.length) {
    const err = new Error("No lanes selected.");
    err.code = "NO_LANES";
    throw err;
  }

  const tasks = lanes.map(({ id, lane, adapter }) => ({
    id,
    lane,
    adapter,
    brief: buildBrief(id, lane, request),
  }));

  const breaker = new CircuitBreaker(global.circuitBreaker || {});
  const startedAll = Date.now();
  const outcomes = await dispatch(tasks, {
    deadlineMs,
    graceAfterFirstSuccessMs: global.graceAfterFirstSuccessMs,
    breaker,
    journal,
    onEvent: hooks.onEvent,
  });
  const wallMs = Date.now() - startedAll;

  const result = synthesize(outcomes, config, request);
  result.runId = runId;
  result.wallMs = wallMs;
  result.deadlineMs = deadlineMs;
  result.lanes = outcomes.map(({ laneId, status, durationMs, error }) => ({
    lane: laneId,
    status,
    durationMs,
    error,
  }));

  if (journal) {
    journal.write({ event: "run.finish", wallMs, winner: result.winner, lanes: result.lanes });
  }

  if (flags.out && result.deliverable) {
    const outPath = path.resolve(String(flags.out));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result.deliverable, "utf8");
  }

  return result;
}

module.exports = { runRequest, loadConfig, CONFIG_PATH };
