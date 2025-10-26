# 05_RUNBOOK_PHASE4.md — How to Drive This Phase

## Daily rhythm
- Kickoff: 10 minutes — blockers, decisions, PRs to review.
- Mid-day: smoke E2E (connect via Messages API).
- End of day: update burn chart (open items vs. DoD).

## PR etiquette
- Max ~400 LOC per PR; include `curl` reproduction for SSE and NDJSON.
- Annotate headers in tests; attach `tcpdump`/`curl -N` clips when debugging.

## Local run (dockerless)
```bash
# Dev TLS (mkcert/self-signed) and run
export TLS_KEY=./dev.key TLS_CERT=./dev.crt AUTH_TOKENS=devtoken
pnpm dev:sse   # starts HTTPS server with /sse and /mcp
```

## Single-container run
```bash
docker run -p 8443:8443   -e TLS_KEY=/secrets/tls.key -e TLS_CERT=/secrets/tls.crt   -e AUTH_TOKENS=devtoken -v $PWD/secrets:/secrets:ro   ghcr.io/yourorg/task-mcp-sse:0.1.0
```

## Messages API example (SSE)
See `docs/messages_api_example.md` for the exact payload with `mcp_servers`.
