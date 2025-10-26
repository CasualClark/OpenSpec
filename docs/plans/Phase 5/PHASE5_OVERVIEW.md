# Phase 5 — Observability & Reliability (Task MCP)

**Status:** Ready • **Date:** 2025-10-25

## Objective
Ship structured logs, RED/USE metrics, traces, SLOs with burn‑rate alerts, and CI e2e/load/chaos to prove reliability without infra sprawl.

## Exit Criteria
- CI **green** on the e2e flow: `open → edit files → archive → verify receipt` in a sample repo.
- SLOs: p95 request latency under target; error budget tracked; alerts configured.
- Logs carry `requestId`, `tool`, `latencyMs`, `bytesOut`, `status`, and `error.code` when present.
- Lock‑contention chaos shows **no stale locks**; `ELOCKED` returned with backoff & TTL expiry.
