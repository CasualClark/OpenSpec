# 03_REVIEW_CHECKLIST.md — What to Verify Before Merge

- [ ] **Headers**: `Content-Type`, `Cache-Control`, `X-Accel-Buffering: no` (SSE).
- [ ] **Heartbeats**: a comment line every 25–30s keeps proxies alive.
- [ ] **No compression** on SSE locations (nginx: `gzip off;` for `location /sse`).
- [ ] **Auth paths**: Bearer for API clients; cookie for browser EventSource tested.
- [ ] **CORS**: only whitelisted origins; preflights pass.
- [ ] **Backpressure**: response writes never accumulate unbounded.
- [ ] **Size discipline**: tool results are small and paginated when needed.
- [ ] **Connector**: Messages API call with `mcp_servers` returns tool result.
- [ ] **Logs/metrics**: requestId, tool, duration, bytes, status code present.
- [ ] **Runbook**: docs explain dockerless path and single-container image.

Failure handling to see:
- Bad token → 401 with minimal body.
- Tool error → SSE `event:error` with safe `error.code`, `hint`.
- Large output → truncated or paginated per policy; documented in response.
