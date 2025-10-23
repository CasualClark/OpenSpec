# Task MCP — Overview, Goals & Roadmap (Standalone)

_Last updated: 2025-10-23_

> **Scope disclaimer:** These documents define the Task MCP only—its two tools and resources, receipts, security, and operational practices.
> Integration points for Pampax are provided **separately** under `/integrations/pampax/` as non-binding guidance.

## Vision
Give agents a **single, unambiguous lane** for planning and shipping changes in a repo:
- open a scoped change,
- work against concrete files (`proposal.md`, `tasks.md`, `specs/**`),
- archive into living specs with an auditable **receipt**—
all while keeping token costs predictable via **resources** (IDE) and **compact JSON** (API).

## Goals
- **Minimal surface**: exactly two tools: `change.open`, `change.archive`.
- **File-first**: all authoring/editing lives in the repo (`openspec/changes/<slug>/`).
- **Token-discipline**: tool outputs are compact; IDE attaches resources; API returns paths/handles only.
- **Multi-transport**: stdio for IDE; HTTPS/SSE for API (tools-only).

## Non-Goals (for v1)
- Search, retrieval, embeddings, or durable memory (lives outside Task MCP).
- Web UI or DB: the repo is source of truth.
- Task CRUD beyond open/close (editing is file-based).

## Architecture (Task MCP only)
```
Client (Claude Code stdio / Messages API via HTTPS/SSE)
      │
      ▼
Task MCP Server
  ├─ Tools: change.open, change.archive
  ├─ Resources (stdio/IDE):
  │     changes://active
  │     change://{slug}/proposal
  │     change://{slug}/tasks
  │     change://{slug}/delta/**
  └─ OpenSpec CLI for archive (replace with native binding later)
```

## Tools (contract summary)
- `change.open(title, slug, rationale?, owner?, ttl?, template?)` → creates/resumes a change. Returns paths + resource URIs.
- `change.archive(slug)` → runs deterministic archive and writes `receipt.json`. Returns compact `receipt` (see schema).

## Resources
- `changes://active?page=&pageSize=`
- `change://{slug}/proposal` | `/tasks` | `/delta/**`

## Security
- Path sandbox: **refuse outside `openspec/`** after canonicalization.
- Strict slug regex and normalization.
- Lock files with owner+ttl; typed errors for conflicts.

## Versioning
- Every tool result includes `apiVersion`, `toolVersions` (`taskMcp`, `openspecCli`).

## Roadmap (Phases)
- Phase 0: Foundations & Contracts (schemas, error codes, CI checks)
- Phase 1: Core stdio server (two tools + resources, locks, sandbox)
- Phase 2: Receipts & structural validation
- Phase 3: IDE resources & pagination polish
- Phase 4: HTTPS/SSE server for API
- Phase 5: Observability & reliability
- Phase 6: Developer experience & docs
- Phase 7: Optional Task MCP enhancements (no retrieval/memory)

