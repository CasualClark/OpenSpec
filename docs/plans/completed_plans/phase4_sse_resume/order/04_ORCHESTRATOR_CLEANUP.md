# 04_ORCHESTRATOR_CLEANUP.md — Finish & Release

## Merge gating
- All checklists in `03_REVIEW_CHECKLIST.md` are ✅
- E2E test artifacts attached to PR.
- Image pushed and tagged `task-mcp-sse:<semver>`.

## Release steps
1. Tag commit and publish image.
2. Update docs site and examples.
3. Announce dev instruction: dockerless & container run snippets.
4. Create follow‑up tickets for Phase 5 (Memory hooks) if needed.

## Rollback
- Feature flag `ENABLE_HTTP_API=false` to disable transports.
- Revert to stdio mode in IDE-only contexts.
