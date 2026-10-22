"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const { resolveLanes } = require("./master");
const { runRequest, loadConfig } = require("./runner");
const { log } = require("./lib/log");

const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStatic(req, res) {
  const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const target = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!target.startsWith(PUBLIC_DIR) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  const body = fs.readFileSync(target);
  res.writeHead(200, {
    "content-type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  res.end(body);
}

async function handleDoctor(res) {
  const config = loadConfig();
  const lanes = resolveLanes(config);
  const rows = [];
  for (const { id, lane, adapter } of lanes) {
    const check = await adapter.preflight(lane);
    rows.push({ lane: id, label: lane.label || id, role: lane.role, ready: check.ready, reason: check.reason });
  }
  sendJson(res, 200, { lanes: rows, defaults: config.global || {} });
}

function readBody(req, limitBytes = 1024 * 256) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleRun(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req) || "{}");
  } catch (err) {
    sendJson(res, 400, { error: String(err.message || err) });
    return;
  }

  const request = String(payload.request || "").trim();
  if (!request) {
    sendJson(res, 400, { error: "request is required" });
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  let open = true;
  const send = (event, data) => {
    if (!open) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  req.on("close", () => { open = false; });
  res.on("error", () => { open = false; });

  const flags = {
    deadline: Number(payload.deadline) || undefined,
    lanes: Array.isArray(payload.lanes) && payload.lanes.length ? payload.lanes : undefined,
  };

  send("accepted", { at: Date.now() });

  try {
    const result = await runRequest(request, flags, {
      onEvent: (event) => send("progress", event),
    });
    send("result", result);
  } catch (err) {
    send("failed", { error: String(err && err.message ? err.message : err) });
  }
  res.end();
}

function createServer() {
  return http.createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (req.method === "GET" && url === "/api/doctor") return handleDoctor(res);
    if (req.method === "POST" && url === "/api/run") return handleRun(req, res);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    return res.end("method not allowed");
  });
}

async function serve(port = 4310) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  log("INFO", `Agentic OS UI on http://127.0.0.1:${port}`);
  process.stdout.write(`\n  Agentic OS UI  ->  http://127.0.0.1:${port}\n  Ctrl+C to stop\n\n`);
}

module.exports = { serve, createServer };
