# Indexing Hints for Pampax (Advisory)

_Last updated: 2025-10-23_

Pampax can get strong mileage by indexing the following **file-first** surfaces:

- `openspec/changes/*/proposal.md` — natural-language description of the change.
- `openspec/changes/*/tasks.md` — checklist of work; good seed for incident/symbol queries.
- `openspec/changes/*/specs/**` — delta specs; link to living spec locations.
- `openspec/specs/**` — the canonical spec set (post-archive ground truth).
- `openspec/changes/*/receipt.json` — provenance (files touched, commits, test summary).

### Suggested query seeds
- symbol/config/API names from `specs/**` and `tasks.md` headings.
- test names and file paths from receipts' `filesTouched` and local `test/**` paths.

### Token discipline
When building bundles, **never inline** entire proposals or specs; instead include:
- symbol definitions + nearest references
- the minimal test spans that exercise those symbols
- short rationales (one line per item) and a token estimate
