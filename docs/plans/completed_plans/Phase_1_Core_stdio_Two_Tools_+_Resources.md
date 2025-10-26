# Phase 1 — Core_stdio_Two_Tools_+_Resources

_Last updated: 2025-10-23_

## Goals
Implement stdio Task MCP server with two tools and resource providers; enforce locking, slug regex, and sandbox.

## Tasks & RACI (Task MCP)
- **Builder**: Stdio server with `change.open`, `change.archive`; resources for changes/proposal/tasks/delta.
- **Engineer**: Utilities for `canonicalize(path)`, `validate_slug`, `atomic_lock`, with unit tests.
- **Architect**: Lock file format `{owner,since,ttl}` and stale lock reclaim policy.
- **Reviewer**: Security pass for path traversal and shell arg escaping.


## Pseudocode / Algorithms
// TS-like pseudocode
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$/
function change_open(input) {
  if (!SLUG_RE.test(input.slug)) throw EBADSLUG
  const root = canon(join(repoRoot,'openspec/changes',input.slug))
  if (!root.startsWith(canon(join(repoRoot,'openspec')))) throw EPATH_ESCAPE
  acquire_lock(root, input.owner||'task-mcp', input.ttl||3600)
  scaffold(root, input.template||'feature') // create proposal.md, tasks.md, specs/
  return out_open(root, input.slug)
}
function change_archive({slug}) {
  const root = canon(join(repoRoot,'openspec/changes',slug))
  if (!exists(root)) throw ENOCHANGE
  validate_shape(root) // files present, delta structure sane
  execFile('openspec',['archive',slug,'--yes'], {shell:false})
  const receipt = compute_receipt(root)
  writeJson(join(root,'receipt.json'), receipt)
  release_lock(root)
  return {apiVersion:'1.0', slug, archived:true, alreadyArchived:false, receipt}
}


## Deliverables
- Stdio server; resource providers; lock docs.

## Definition of Done
- Open/resume/archive against sample repo; resources attach in IDE.
