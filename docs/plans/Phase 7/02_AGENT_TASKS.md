# 02_AGENT_TASKS — Assignments

## Builder — `change.list`
- Inputs: `{ page?: number, pageSize?: number, q?: string, status?: "draft|active|archived" }`.
- Output: `{ page, pageSize, total, items: [{slug,title,status,paths}] }`.
- Sorting: `updatedAt DESC` deterministic; opaque `nextPageToken` optional.

## Generalist — CHANGELOG appender
- Input: path to `receipt.json`; optional `--unreleased` or `--version 1.2.3`.
- Behavior: append under Keep a Changelog sections (`Added/Changed/Fixed`), create file if missing.
- Idempotent; no duplicate entries.

## Architect/Engineer — Native OpenSpec binding
- Replace `shell("openspec archive <slug>")` with in‑process library calls (or a thin adapter).
- Contracts unchanged; same output shapes.
- Fallback to shell via feature flag if binding not available.

## DevOps
- Feature flags via env: `TASKMCP_ENABLE_CHANGE_LIST`, `TASKMCP_ENABLE_CHANGELOG`, `TASKMCP_ENABLE_NATIVE_OS`.
- CI matrix runs {flags: off,on} for back‑compat.
