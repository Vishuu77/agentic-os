"use strict";

const fs = require("fs");
const { execFile } = require("../lib/exec");

const id = "opencode";

function parseNdjsonText(raw) {
  const parts = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (event.type === "text" && event.part && typeof event.part.text === "string") {
      parts.push(event.part.text);
    }
  }
  return parts.join("\n").trim();
}

async function preflight(lane) {
  if (!fs.existsSync(lane.command)) {
    return { ready: false, reason: `opencode command not found at ${lane.command}` };
  }
  return { ready: true, reason: null };
}

async function run(brief, lane, hooks = {}) {
  const args = [
    ...(lane.argsPrefix || []),
    brief,
    "--format",
    "json",
    "--model",
    lane.model,
    "--auto",
  ];
  const res = await execFile(lane.command, args, {
    timeoutMs: lane.timeoutMs,
    env: lane.env || {},
    registerChild: hooks.registerChild,
  });

  const text = parseNdjsonText(res.stdout);
  if (res.ok && text) {
    return { ok: true, text, durationMs: res.durationMs, raw: res.stdout };
  }
  return {
    ok: false,
    text: "",
    durationMs: res.durationMs,
    error: res.spawnError
      || (res.timedOut ? `timed out after ${lane.timeoutMs}ms` : extractError(res.stderr) || `exit ${res.code}`),
    raw: res.stdout,
  };
}

function extractError(stderr) {
  const text = String(stderr || "").trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1];
}

module.exports = { id, preflight, run, parseNdjsonText };
