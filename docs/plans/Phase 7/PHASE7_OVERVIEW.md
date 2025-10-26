# Phase 7 — Optional Task MCP Enhancements

**Status:** Ready • **Date:** 2025-10-25

## Goals
Ship small, **backward‑compatible** improvements behind feature flags:
1) `change.list` tool for API clients (parity with `changes://active` resource).
2) CHANGELOG appender derived from `receipt.json` (Keep a Changelog style).
3) Native OpenSpec binding (replace shell) — **same contracts**, toggled by config.

## Exit Criteria
- Features gated by env/config; default **off**.
- No breaking changes to tool I/O or resource contracts.
- CI proves old paths still succeed with flags off.
