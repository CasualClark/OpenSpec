# `change.list` — API Design

## Request
```json
{ "page": 1, "pageSize": 50, "q": "router", "status": "draft" }
```

## Response
```json
{
  "apiVersion": "v1",
  "page": 1,
  "pageSize": 50,
  "total": 123,
  "items": [
    { "slug": "router-init-fix", "title": "Router init fix", "status": "draft",
      "paths": {
        "root":"openspec/changes/router-init-fix/",
        "proposal":"openspec/changes/router-init-fix/proposal.md",
        "tasks":"openspec/changes/router-init-fix/tasks.md",
        "delta":"openspec/changes/router-init-fix/specs/"
      }
    }
  ]
}
```

### Filtering & Sorting
- `status` filter optional; `q` matches slug/title substrings.
- Sort: `updatedAt DESC`, tiebreak on `slug` for determinism.
- Pagination: `page/pageSize`, or opaque `nextPageToken` (ADR‑compatible).

### Errors
- `EBADPAGE`, `EBADSIZE` (page > max or pageSize > cap); `EINVAL` for bad filters.
