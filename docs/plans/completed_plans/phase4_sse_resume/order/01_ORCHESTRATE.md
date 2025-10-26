# 01_ORCHESTRATE.md — Phase 4 Kickoff & Plan

**Objective:** Expose Task MCP over HTTPS using SSE + Streamable HTTP with production hygiene and minimal infra.

## Scope (explicit)
- ✅ Implement **SSE** endpoint and **Streamable HTTP** (chunked NDJSON) endpoint.
- ✅ Auth: Bearer token (Authorization header) and allow cookie auth for browser EventSource.
- ✅ Health: `/healthz` (liveness), `/readyz` (readiness).
- ✅ Rate‑limits: IP+token; burst control.
- ✅ Logging: JSON logs, request IDs, tool name, duration, bytes out.
- ✅ CORS: allow configured origins only.
- ✅ Docs: messages API example; proxy recipes; runbook.
- ✅ Packaging: **single container** image + dockerless node/bun script.

## Non‑goals (this phase)
- No expensive server‑side state (only ephemeral request context).
- No multi‑node sticky‑session features.
- No web UI.

## Work chunks & flow
1. **Design snapshot** (Architect) — refine contracts, transports, error map.
2. **Server skeleton** (Builder) — express/fastify server, routes, TLS, config.
3. **SSE transport** (Engineer) — correct headers, heartbeats, backpressure.
4. **Streamable HTTP transport** (Engineer) — `application/x-ndjson` over chunked encoding.
5. **Security** (DevOps) — auth, CORS, rate limits, audit logs.
6. **Proxy sanity** (DevOps) — Nginx recipe, keepalive, buffering off.
7. **Examples & tests** (Reviewer, Knowledge) — E2E, load, docs.
8. **Packaging** (DevOps) — single Dockerfile + dockerless runner scripts.
9. **Sign‑off** (Orchestrator) — gate on DoD, release notes.

## Deliverables
- `server/src/http/` (transports), `server/src/auth/`, `server/src/logging/`.
- `examples/messages_api_request.json`.
- `docs/sse_guidelines.md`, `docs/nginx_proxy_recipe.md`, `docs/docker_strategy.md`, `docs/runbook_phase4.md`.
- `tests/e2e/` scripts.

## Definition of Done
- ✅ Messages API call with `mcp_servers` hits our HTTPS endpoint and streams back a small **tool result** for `change.open` against a temp repo.
- ✅ Works behind Nginx with `X-Accel-Buffering: no` and heartbeat every 25–30s.
- ✅ Single container image **or** node/bun runner works on a fresh machine in <5 minutes.
