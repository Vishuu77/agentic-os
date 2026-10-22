"use strict";

const fs = require("fs");
const { execFile } = require("../lib/exec");

const id = "hermes";

function unwrapJsonish(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("{")) return trimmed;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const values = Object.values(parsed).filter((v) => typeof v === "string");
    if (values.length === 1 && Object.keys(parsed).length === 1) return values[0].trim();
  }
  return trimmed;
}

async function preflight(lane) {
  if (!fs.existsSync(lane.command)) {
    return { ready: false, reason: `hermes command not found at ${lane.command}` };
  }
  if (!lane.hermesHome || !fs.existsSync(lane.hermesHome)) {
    return { ready: false, reason: `HERMES_HOME not found: ${lane.hermesHome}` };
  }
  return { ready: true, reason: null };
}

async function run(brief, lane, hooks = {}) {
  const args = [...(lane.argsPrefix || ["-p", lane.profile, "-z"]), brief];
  const env = {
    HERMES_HOME: lane.hermesHome,
    HERMES_MIN_CONTEXT_LENGTH: String(lane.minContextLength || 8000),
    ...(lane.env || {}),
  };

  const res = await execFile(lane.command, args, {
    timeoutMs: lane.timeoutMs,
    env,
    registerChild: hooks.registerChild,
  });

  const text = unwrapJsonish(res.stdout);
  if (res.ok && text) {
    return { ok: true, text, durationMs: res.durationMs, raw: res.stdout };
  }
  return {
    ok: false,
    text: "",
    durationMs: res.durationMs,
    error: res.spawnError
      || (res.timedOut ? `timed out after ${lane.timeoutMs}ms` : lastLine(res.stderr) || `exit ${res.code}`),
    raw: res.stdout,
  };
}

function lastLine(stderr) {
  const lines = String(stderr || "").trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : null;
}

module.exports = { id, preflight, run, unwrapJsonish };
