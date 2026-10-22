# SaaS Product (no billing)
Local-first multi-profile pattern.

## Profiles
Each teammate gets a folder in `profiles/<name>/` with own `.env` overrides.
Default profile serves shared ingress (multiplex).

## Rules
- No API keys in repo; use Ollama local models.
- No billing code; gate by profile allowlist.
