# Chaos: Lock Contention

- 20 workers hammer `change.open` on the same slug for 30s.
- Expect one success; others return `ELOCKED` until TTL expiry.
- Validate no partial state in `openspec/changes/<slug>/`.
- Confirm `taskmcp.tool.errors{error.code="ELOCKED"}` increments.
