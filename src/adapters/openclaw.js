"use strict";

const fs = require("fs");
const net = require("net");
const { execFile } = require("../lib/exec");

const id = "openclaw";
const GATEWAY_HOST = "127.0.0.1";
const GATEWAY_PORT = 18789;

function probeGateway(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (reachable) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(GATEWAY_PORT, GATEWAY_HOST);
  });
}

async function preflight(lane) {
  if (!fs.existsSync(lane.command)) {
    return { ready: false, reason: `openclaw command not found at ${lane.command}` };
  }
  if (lane.requireGateway) {
    const reachable = await probeGateway();
    if (!reachable) {
      return {
        ready: false,
        reason: `gateway not listening on ${GATEWAY_HOST}:${GATEWAY_PORT} (start it with: openclaw gateway start)`,
      };
    }
  }
  return { ready: true, reason: null };
}

async function run(brief, lane, hooks = {}) {
  const args = [...(lane.argsPrefix || []), "agent", "--message", brief, "--json"];
  const res = await execFile(lane.command, args, {
    timeoutMs: lane.timeoutMs,
    env: lane.env || {},
    registerChild: hooks.registerChild,
  });

  const text = extractText(res.stdout);
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

function extractText(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    return collectStrings(parsed).join("\n").trim();
  } catch {
    return text;
  }
}

function collectStrings(node, acc = []) {
  if (typeof node === "string") {
    if (node.trim()) acc.push(node.trim());
    return acc;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, acc);
    return acc;
  }
  if (node && typeof node === "object") {
    for (const key of ["text", "content", "message", "reply", "result", "output"]) {
      if (key in node) collectStrings(node[key], acc);
    }
    return acc;
  }
  return acc;
}

function lastLine(stderr) {
  const lines = String(stderr || "").trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : null;
}

module.exports = { id, preflight, run, probeGateway, GATEWAY_HOST, GATEWAY_PORT };
