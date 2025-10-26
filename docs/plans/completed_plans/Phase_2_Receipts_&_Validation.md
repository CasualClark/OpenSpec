# Phase 2 — Receipts_&_Validation

_Last updated: 2025-10-23_

## Goals
Produce compact receipts and structural validation (no retrieval/memory).

## Tasks & RACI (Task MCP)
- **Engineer**: Implement `compute_receipt()` (commits, filesTouched, tests summary, archivedAt, toolVersions).
- **Builder**: Structural validator: ensure `proposal.md`, `tasks.md`, `specs/` exist; basic delta shape checks.
- **Reviewer**: Negative tests for `EBADSHAPE_*` and `EARCHIVED` behavior.


## Pseudocode / Algorithms
// Receipt
function compute_receipt(root) {
  const commits = git_commits_touching(root)
  const files = git_files_touched_since_change(root)
  const tests = summarize_tests() // adapter/hook
  return {
    slug: basename(root),
    commits, filesTouched: files,
    tests, archivedAt: nowIso(),
    toolVersions: {taskMcp: VERSION, openspecCli: ospec_version()}
  }
}


## Deliverables
- `receipt.json` schema-compliant; validator errors typed.

## Definition of Done
- Failing cases return typed errors with one-line hints.
