#!/usr/bin/env node
"use strict";

const path = require("path");

const { resolveLanes } = require("./master");
const { runRequest, loadConfig } = require("./runner");
const { log } = require("./lib/log");

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--out") flags.out = argv[++i];
    else if (arg === "--lanes") flags.lanes = String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--deadline") flags.deadline = Number(argv[++i]);
    else if (arg.startsWith("--")) flags[arg.slice(2)] = argv[++i];
    else positional.push(arg);
  }
  return { flags, positional };
}

async function doctor(asJson = false) {
  const config = loadConfig();
  const lanes = resolveLanes(config);
  const rows = [];
  for (const { id, lane, adapter } of lanes) {
    const check = await adapter.preflight(lane);
    rows.push({ lane: id, label: lane.label || id, ready: check.ready, reason: check.reason });
  }
  if (asJson) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } else {
    for (const r of rows) {
      process.stdout.write(`${r.ready ? "ready    " : "unavailable"}  ${r.lane.padEnd(9)} ${r.label}\n`);
      if (!r.ready) process.stdout.write(`            -> ${r.reason}\n`);
    }
    process.stdout.write(`\n${rows.filter((r) => r.ready).length}/${rows.length} lanes ready.\n`);
  }
  return rows.filter((r) => r.ready).length > 0 ? 0 : 1;
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === "help" || flags.help) {
    process.stdout.write([
      "Agentic OS orchestrator",
      "",
      "Usage:",
      "  aos run \"<master instruction>\" [--deadline ms] [--lanes a,b] [--out file] [--json]",
      "  aos doctor [--json]",
      "  aos ui [--port 4310]",
      "",
    ].join("\n"));
    return;
  }

  if (command === "doctor") {
    process.exitCode = await doctor(Boolean(flags.json));
    return;
  }

  if (command === "ui" || command === "serve") {
    const { serve } = require("./server");
    const port = Number(flags.port) || 4310;
    await serve(port);
    return;
  }

  if (command === "run") {
    const request = positional.slice(1).join(" ").trim();
    if (!request) {
      process.stderr.write("Missing master instruction.\n");
      process.exitCode = 1;
      return;
    }
    const result = await runRequest(request, flags, {
      onEvent: (e) => {
        if (e.type === "lane.start") log("INFO", `${e.lane}: start`);
        if (e.type === "lane.result") {
          log(e.status === "ok" ? "INFO" : "WARN",
            `${e.lane}: ${e.status} in ${(e.durationMs / 1000).toFixed(1)}s${e.error ? ` (${e.error})` : ""}`);
        }
      },
    });
    if (flags.out && result.deliverable) log("INFO", `deliverable written to ${path.resolve(String(flags.out))}`);
    process.stdout.write(flags.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.deliverable || result.headline}\n`);
    process.exitCode = result.deliverable ? 0 : 1;
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n`);
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err && err.stack ? err.stack : err}\n`);
  process.exitCode = 1;
});
