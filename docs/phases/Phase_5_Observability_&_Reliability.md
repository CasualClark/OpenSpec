# Phase 5 — Observability_&_Reliability

_Last updated: 2025-10-23_

## Goals
Observability, reliability, and CI e2e tests for Task MCP.

## Tasks & RACI (Task MCP)
- **DevOps**: Structured logs (JSON) with requestId, tool, latency, bytesOut.
- **Engineer**: e2e: open → edit files → archive → verify receipt; chaos tests for lock contention.
- **Reviewer**: Perf budgets in CI (median latency threshold).


## Pseudocode / Algorithms
// Metrics event
metric({tool, latencyMs, bytesOut, ok: true, errCode: null})


## Deliverables
- CI suite; metrics doc; perf tables.

## Definition of Done
- CI green; median e2e time under target on sample repo.
