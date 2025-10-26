# 02_AGENT_TASKS.md — Assignments & Checklists

## Orchestrator
- Freeze scope, sequence, and owners. Keep PRs < 400 lines per review unit.
- Enforce output size policy (tool results <= 10 KB unless paginated).

## Architect
- [ ] Finalize **transport contracts**:
  - SSE event format: `event: result`, `data: <json>`, trailing `\n\n`.
  - Heartbeat: comment lines `: keep-alive <ts>` every 25–30s.
  - Streamable HTTP: `application/x-ndjson` with one JSON object per line.
- [ ] Error map:
  - 401/403 auth, 429 rate limit, 5xx tool failure; include `error.code`, `error.hint`.
- [ ] Config surface:
  - ENV: `PORT`, `TLS_KEY`, `TLS_CERT`, `AUTH_TOKENS`, `ALLOWED_ORIGINS`, `RATE_LIMIT`, `HEARTBEAT_MS`.

## Builder (full‑stack)
- [ ] Server skeleton in `server/src/index.ts` (fastify/express).
- [ ] Route: `POST /mcp` → Streamable HTTP (NDJSON).
- [ ] Route: `POST /sse`  → SSE (responds with `text/event-stream`). 
- [ ] Wire tool dispatcher → existing Task MCP tool registry (open/archive).
- [ ] Small responses: include `{ apiVersion, tool, startedAt, result }`.

### Pseudocode — SSE
```ts
app.post('/sse', auth, cors, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // proxy-safe
  const hb = setInterval(() => res.write(`: keep-alive ${Date.now()}\n\n`), HEARTBEAT_MS);

  try {
    const out = await runTool(req.body.tool, req.body.input);
    res.write(`event: result\n`);
    res.write(`data: ${JSON.stringify(out)}\n\n`);
  } catch (e) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify(normalizeErr(e))}\n\n`);
  } finally {
    clearInterval(hb);
    res.end();
  }
});
```

### Pseudocode — Streamable HTTP (NDJSON)
```ts
app.post('/mcp', auth, cors, async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  const write = (obj:any)=> res.write(JSON.stringify(obj) + '\n');

  write({ type:'start', ts: Date.now() });
  try {
    const out = await runTool(req.body.tool, req.body.input);
    write({ type:'result', result: out });
  } catch (e) {
    write({ type:'error', error: normalizeErr(e) });
  } finally {
    write({ type:'end' });
    res.end();
  }
});
```

## Engineer (Python/Node TDD)
- [ ] Unit tests for transports: headers, heartbeat cadence, error serialization.
- [ ] Golden tests for `change.open` & `change.archive` tool outputs.
- [ ] Load test script (k6/artillery) with 50 concurrent SSE clients for 5 min.

## DevOps
- [ ] Auth: bearer token via `Authorization: Bearer <token>`. For browser EventSource, support cookie auth.
- [ ] CORS: only configured origins; preflight for `/mcp` and `/sse`.
- [ ] Rate limit: { 60 req/min per token, burst 10 } (configurable).
- [ ] Health: `/healthz` liveness (always green), `/readyz` checks tool registry, FS perms.
- [ ] Packaging:
  - **Single Dockerfile** (node:20-alpine → distroless) with `HEALTHCHECK`.
  - **Dockerless**: `pnpm start:https` using `TLS_KEY`/`TLS_CERT` envs.
- [ ] Proxy recipe: Nginx `proxy_buffering off;` and respect `X-Accel-Buffering: no`.

## Reviewer
- [ ] Verify headers, SSE event framing, no gzip on SSE location.
- [ ] E2E against Anthropic Messages API with `mcp_servers` (SSE and NDJSON).
- [ ] Confirm outputs < 10KB and include `apiVersion`.

## Knowledge
- [ ] Write `docs/sse_guidelines.md`, `docs/nginx_proxy_recipe.md`, `docs/messages_api_example.md`, `docs/docker_strategy.md`.
