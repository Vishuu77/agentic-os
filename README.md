# Agentic OS

One master instruction in, one precise deliverable out. Fans out to three real agents in
parallel — OpenCode, OpenClaw, Hermes Agent — and returns the fastest lane's answer, enriched
with whatever else landed in time.

## Why it is built this way

The box this runs on cannot host three frontier models, so the design optimises for **time to
first useful answer**, not maximum parallelism:

- **Fail-soft.** A dead or unconfigured lane never blocks delivery. Failures are reported in the
  deliverable instead of thrown.
- **Fastest-answer-wins.** The moment one lane returns a usable answer, the run waits a short
  grace window (`graceAfterFirstSuccessMs`) for enrichment, then returns. Slower lanes are killed.
- **No LLM call for routing.** Decomposition is deterministic, so there is no hidden model call
  in front of the real work.
- **Circuit breaker + per-lane timeout.** Repeated failures open a lane's breaker for a cooldown
  instead of burning the whole deadline on it.

## Usage

```bash
node src/index.js doctor
node src/index.js run "your master instruction" [--deadline ms] [--lanes a,b] [--out file] [--json]
node src/index.js ui [--port 4310]
```

`doctor` reports which lanes are ready and why the others are not.

### Web UI

```bash
node src/index.js ui --port 4310
```

Then open <http://127.0.0.1:4310>.

- Live lane chips: `ready` / `running` (pulsing) / `ok` / error, with per-lane duration.
- Master instruction box with three presets.
- Deadline in seconds; the run returns as soon as one lane wins plus a 6s grace window.
- Deliverable rendered as markdown, with a copy button.
- Progress streams over SSE (`POST /api/run`), so a 90s OpenCode call shows live state
  instead of a blank spinner.
- `GET /api/doctor` powers the lane panel.

Stop the server with `Ctrl+C`. It binds `127.0.0.1` only.

## Lanes

| Lane | Backing model | Command |
|---|---|---|
| `opencode` | OpenCode Zen `big-pickle` (keyless free) | `opencode.exe run --format json` |
| `hermes` | local Ollama `qwen3:1.7b` via the `aos` profile | `hermes.exe -p aos -z` |
| `openclaw` | requires a running Gateway on `127.0.0.1:18789` | `openclaw.mjs agent --json` |

Lane roles, commands, timeouts and env live in `config/lanes.config.json`.

## Environment constraints that shaped this

- **7.9 GB RAM, Intel HD 520, CPU-only.** 8B models on Ollama produced 0 tokens under load, so
  the local lane uses `qwen3:1.7b` at an 8K window.
- **Hermes requires >= 64K context** (`MINIMUM_CONTEXT_LENGTH`). The installed copy at
  `Python312\Lib\site-packages\agent\model_metadata.py` was patched to read an override:
  `MINIMUM_CONTEXT_LENGTH = int(os.environ.get("HERMES_MIN_CONTEXT_LENGTH") or 64_000)`.
  Stock behaviour is unchanged when the variable is unset. The orchestrator sets it per spawn.
- **Hermes has no `ollama` provider** — `ollama` is an alias for `custom`, which needs an explicit
  `model.base_url`. The `aos` profile points `custom` at `http://localhost:11434/v1`.
- **OpenCode Zen is queue-latency-bound**, not compute-bound: ~70-95s per call regardless of size.

## OpenClaw

`openclaw` is implemented but reports `unavailable` until its Gateway runs and
`~\.openclaw\openclaw.json` exists. Start it with `openclaw gateway start`. The lane degrades
cleanly, so the other two still deliver.

## Output

- Human-readable deliverable on stdout, plus `--out <file>`.
- `--json` emits `{ deliverable, winner, lanes, wallMs, failures }`.
- Every run appends a JSONL journal to `runs/<runId>.jsonl`.
