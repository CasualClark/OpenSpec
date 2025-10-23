# Task MCP Security Model

_Last updated: 2025-10-23_

## Path & Slug Rules
- Canonicalize and verify all read/write paths are under `openspec/`.
- Slug regex: `^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$`; normalize to lower-kebab.

## Locking
- Lock file: `openspec/changes/<slug>/.lock` with `{ owner, since, ttl }`.
- Atomic create; treat expired locks as reclaimable.

## Transport
- Stdio for IDE.
- HTTPS/SSE for API with TLS and bearer auth; `/healthz` for liveness.

## Rate Limits & Logging
- Rate limit per IP; structured JSON logs (no secrets).
