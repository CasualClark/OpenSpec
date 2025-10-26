# Phase 3 — Resources_&_IDE_UX

_Last updated: 2025-10-23_

## Goals
Polish `changes://active` pagination; ensure IDE resource UX is smooth.

## Tasks & RACI (Task MCP)
- **Builder**: Implement `changes://active?page=&pageSize=` with stable sort and `nextPageToken`.
- **Engineer**: Add streaming resource readers for large files (no buffer bloat).
- **Knowledge**: IDE guide for resource attach (Task MCP only).


## Pseudocode / Algorithms
// Pagination
function list_changes(page=1,pageSize=50) {
  const slugs = scan_dir('openspec/changes').sort(by_mtime_desc)
  const start=(page-1)*pageSize, end=start+pageSize
  const items = slugs.slice(start,end).map(to_list_item)
  const next = end<slugs.length ? encode_token({page:page+1}) : null
  return {page,pageSize,items,nextPageToken:next}
}


## Deliverables
- `changes://active` with paging; IDE doc.

## Definition of Done
- Large repos list without memory spikes; UX verified in IDE.
