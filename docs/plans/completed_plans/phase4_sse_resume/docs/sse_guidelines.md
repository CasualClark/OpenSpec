# docs/sse_guidelines.md — SSE & Streamable HTTP Notes

## SSE
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (lets Nginx pass events immediately)
- Heartbeat comment lines (`: keep-alive <ts>`) every 25–30s

## Streamable HTTP (NDJSON)
- `Content-Type: application/x-ndjson`
- One JSON object per line, flush per write.
- Works with `fetch()` and custom headers; useful when you need Authorization.

## Auth
- Native browser `EventSource` **cannot set custom headers**; use cookies or NDJSON.
- For API clients (server‑side), use Bearer tokens with either SSE (non‑browser) or NDJSON.

## Proxies
- Disable buffering for SSE (`X-Accel-Buffering: no` or nginx `proxy_buffering off;`).
- Consider `gzip off;` for SSE locations.
- Keep connections alive with heartbeats to avoid idle timeouts.
