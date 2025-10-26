# Phase 4 — HTTPS/SSE Exposure for Task MCP (Connector-Compatible)

**Status:** Planning+Execution (resume) • **Date:** 2025-10-25

This phase exposes Task MCP over HTTPS using **SSE and Streamable HTTP** so it can be used from the Anthropic **MCP connector** in the Messages API. We keep outputs tiny and stable, and we avoid Docker bloat with a **single container or dockerless** run path.

## Why now
- You already drafted Phase 4 goals and minimal SSE pseudocode.
- Streaming architecture ADRs are accepted; cursor pagination ADR is accepted. Now we wire the public-facing API with production hardening.

## What we ship
- `/:transport(mcp|sse|stream)` endpoints (SSE + streamable NDJSON).
- TLS, bearer auth, healthcheck, request limits, structured logs.
- Example Messages API request and end‑to‑end test.
- Proxy‑safe headers (`Content-Type: text/event-stream`, `X-Accel-Buffering: no`, heartbeats), and no compression for SSE.
- Minimal infra: **one container** or **node/bun without Docker**. Optional Nginx recipe (single proxy, not a fleet).

## Exit criteria
- End‑to‑end call via Messages API MCP connector returns **tool result** for `change.open` and `change.archive` against a sample repo.
- Latency p95 < 300ms (no tool work), sustained connections live > 5 min with heartbeats.
- Max output well under default Claude Code MCP **25k‑token** limit.
