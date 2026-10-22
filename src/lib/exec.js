"use strict";

const { spawn } = require("child_process");

function execFile(command, args, options = {}) {
  const {
    timeoutMs = 120000,
    cwd = process.cwd(),
    env = {},
    input = null,
    registerChild = null,
  } = options;

  return new Promise((resolve) => {
    const started = Date.now();
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      return resolve({
        ok: false,
        code: null,
        signal: null,
        stdout: "",
        stderr: message,
        durationMs: Date.now() - started,
        timedOut: false,
        spawnError: message,
      });
    }

    if (typeof registerChild === "function") registerChild(child);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }, timeoutMs);

    if (child.stdout) child.stdout.on("data", (d) => { stdout += d.toString(); });
    if (child.stderr) child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        signal: null,
        stdout,
        stderr: stderr + String(err.message || err),
        durationMs: Date.now() - started,
        timedOut,
        spawnError: String(err.message || err),
      });
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        spawnError: null,
      });
    });

    if (child.stdin) child.stdin.end(input == null ? undefined : input);
  });
}

module.exports = { execFile };
