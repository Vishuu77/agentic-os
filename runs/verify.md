# Name the single riskiest assumption in launching an AI SaaS this quarter.

_Fastest lane: opencode (80.9s). 1/2 lanes answered._

## Answer

**Riskiest assumption:** that your gross margin survives 100x your current volume. Everything else in an AI SaaS launch is a variable you can tune weekly; unit economics is the one assumption that flips silently from "viable" to "negative" with no visible UI signal — a context window someone pastes 60k tokens into, a retry loop, one cached-prefix miss, or a provider price change.

**Why it's the riskiest and not quality or distribution:** quality failures announce themselves (churn, bad reviews). Margin failures arrive as a single number 45 days later, after you've priced, promised, and staffed around it. And it's builder-owned — it's the only critical assumption you can falsify this week with data you own.

**Instrument it now (files, this week):**
- `apps/api/src/billing/usage.ts` — extract token counts from the provider response on *every* call; write NDJSON to `var/costs.ndjson`: `{ts, request_id, user_id, model, prompt_tokens, completion_tokens, cached_tokens, cost_usd, latency_ms, retries}`.
- Pin prices in `apps/api/src/billing/prices.ts` as a frozen map with `sourceUrl` + `retrievedAt`. Never compute from docs at runtime.
- `COST_CEILING_PER_REQUEST_USD` (start at `0.002`) — checked *before* the request, fail-closed with 429. A request that can cost unbounded is an outage waiting for a p99 user.
- `POST /internal/costs/summary` → p50/p90/p99 cost per session, cache-hit rate, retry ratio, GM%.

**Commands:** `pnpm --filter api test`; load test with `k6` (or `oha -z 60s -c 20 https://your.app/api/ask`); then `jq -s 'group_by(.user_id)|map(map(.cost_usd)|add)|sort|.[length/2]' var/costs.ndjson`.

**Dates:** instrumentation merged by **Oct 10**. First real margin read **Oct 24**. 100x load test (1M sessions/day equivalent) **Nov 14**. Hard go/no-go on list pricing **Dec 1** — before Q4 discounting pressure starts.

**Falsified if:** >10% of sessions cost >3x p50, or retry ratio >3%, or cache-hit rate <20% on your dominant loop. Any one of those caps your viable price below CAC payback.

**Flagged uncertain:** I'm confident on OpenAI's `usage.prompt_tokens_details.cached_tokens`; verify Anthropic's cache-token field names against current docs before hardcoding. I haven't seen your repo — paths above are proposals, not reads.

## Lanes that did not contribute

- `openclaw` — unavailable: gateway not listening on 127.0.0.1:18789 (start it with: openclaw gateway start)