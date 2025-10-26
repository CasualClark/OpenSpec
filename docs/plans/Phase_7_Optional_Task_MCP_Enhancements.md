# Phase 7 — Optional_Task_MCP_Enhancements

_Last updated: 2025-10-23_

## Goals
Optional Task MCP-only enhancements (no retrieval/memory).

## Tasks & RACI (Task MCP)
- **Builder**: Optional read-only `change.list` tool mirroring `changes://active` for API clients.
- **Generalist**: CHANGELOG appender from receipts.
- **Architect**: Native OpenSpec binding (replace shell) without changing contracts.


## Pseudocode / Algorithms
// change.list (optional)
tool change_list({page,pageSize}) { return list_changes(page,pageSize) }


## Deliverables
- Optional tool + changelog appender + native binding prototype.

## Definition of Done
- Backwards compatible; gated by config flags.
