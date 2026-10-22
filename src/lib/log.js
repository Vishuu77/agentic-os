"use strict";

const fs = require("fs");
const path = require("path");

const RUNS_DIR = path.resolve(__dirname, "..", "..", "runs");

function ensureRunsDir() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  return RUNS_DIR;
}

function createRunJournal(runId) {
  const dir = ensureRunsDir();
  const file = path.join(dir, `${runId}.jsonl`);
  const meta = {
    runId,
    file,
    write(entry) {
      fs.appendFileSync(file, `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`);
    },
  };
  meta.write({ event: "run.start" });
  return meta;
}

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function log(level, message) {
  process.stderr.write(`[${stamp()}] ${level.padEnd(5)} ${message}\n`);
}

module.exports = { createRunJournal, ensureRunsDir, RUNS_DIR, log };
