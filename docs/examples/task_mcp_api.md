# Task MCP API — Tools & Resources

_Last updated: 2025-10-23_

## `change.open` (tool)
**Input:** see `/schemas/change.open.input.schema.json`  
**Output:** see `/schemas/change.open.output.schema.json`

**Semantics:**
- Create the change if missing; else return existing (idempotent).
- Create lock file with owner+ttl; return `locked: true` if acquired.
- Scaffold files: `proposal.md`, `tasks.md`, `specs/` (if absent).

## `change.archive` (tool)
**Input/Output:** see `/schemas/change.archive.*.schema.json`

**Semantics:**
- Verify shape; if missing or invalid, emit typed `EBADSHAPE_*`.
- Shell safely: `openspec archive <slug> --yes` (escape args).
- Write `receipt.json` and return the compact copy.

## Resources (stdio)
- `changes://active?page=&pageSize=` → object with paging + items.
- `change://{slug}/proposal` → file stream.
- `change://{slug}/tasks` → file stream.
- `change://{slug}/delta/**` → file tree.
