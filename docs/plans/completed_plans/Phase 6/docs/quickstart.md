# Quickstart — 5 minutes

## 0) Prereqs
- Node 20+ and git installed.

## 1) Clone & start Task MCP (dockerless)
```bash
git clone https://github.com/your-org/task-mcp task-mcp && cd task-mcp
# Dev TLS optional; server auto‑selects HTTP if TLS vars missing
export AUTH_TOKENS=devtoken
pnpm install
pnpm dev:sse   # starts HTTPS/HTTP with /sse and /mcp
```

## 2) Init a tiny sample repo
```bash
mkdir -p examples/sample-repo && cd examples/sample-repo
git init -q
mkdir -p openspec/changes
cd -
```

## 3) Open a change
```bash
curl -sS -H "Authorization: Bearer $AUTH_TOKENS"   -H "Content-Type: application/json"   -X POST http://localhost:8443/mcp   -d '{"tool":"change.open","input":{"title":"router-init-fix","slug":"router-init-fix","rationale":"demo"}}' | sed -n '1,5p'
```

## 4) Edit proposal/tasks and archive
Open `openspec/changes/router-init-fix/` and fill `proposal.md`, `tasks.md` minimally.

```bash
curl -sS -H "Authorization: Bearer $AUTH_TOKENS"   -H "Content-Type: application/json"   -X POST http://localhost:8443/mcp   -d '{"tool":"change.archive","input":{"slug":"router-init-fix"}}' | sed -n '1,20p'
```

You should see `archived:true` and a compact `receipt` block.
