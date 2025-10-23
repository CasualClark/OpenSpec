# Task MCP Contracts

_Last updated: 2025-10-23_

## Error Codes (Task MCP)
- `ENOCHANGE` — slug not found or already archived when open requested.
- `ELOCKED` — lock held by another owner (return `{owner, since, ttl}`).
- `EBADSLUG` — slug fails regex or normalization.
- `EBADSHAPE_MISSING_FILE` — required file missing (`proposal.md`, `tasks.md`, or `specs/`).
- `EBADSHAPE_INVALID_DELTA` — malformed `specs/` delta (bad structure or schema).
- `EARCHIVED` — operation attempted on archived change.
- `EPATH_ESCAPE` — attempted path outside `openspec/` sandbox.

## Versioning
- Every tool result includes `apiVersion` and a `toolVersions` map.
- Breaking changes bump **major** and include deprecation notes in docs.

## Resource Naming
- `changes://active`
- `change://{slug}/proposal`, `/tasks`, `/delta/**`

## Output Discipline
- Tool output must be compact (paths, slugs, booleans, small summaries).
- Large artifacts: write to disk; return a path + size and optionally sha256.
