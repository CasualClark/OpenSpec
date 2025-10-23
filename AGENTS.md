# AGENTS — Roles & RACI (Task MCP)

_Last updated: 2025-10-23_

| Agent         | Role                              | Primary Responsibilities (Task MCP only)                                   | DRI Backups        |
| ------------- | --------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| Orchestrator  | Plan architect & coordinator      | Phasing, cross-agent handoffs, phase gates                                 | Architect, DevOps  |
| Architect     | Strategic planning & design       | Contracts, error codes, security model, versioning                         | Orchestrator       |
| Engineer      | Python TDD specialist             | Lock/slug/path utilities; schema validators; test harnesses                | Reviewer, Generalist |
| Builder       | Full-stack generalist             | Stdio/HTTPS servers, CLI glue, file IO, resources                          | Engineer           |
| Database      | Data layer specialist             | N/A primary (consult on receipts perf/FS interactions)                     | Engineer           |
| Reviewer      | Code quality & testing            | Code review checklists, CI gating, perf thresholds                         | Engineer           |
| Knowledge     | Research & documentation          | Docs, quickstarts, examples                                                | Orchestrator       |
| DevOps        | Build & deployment                | Dockerfiles, TLS/bearer auth, healthchecks, rate limiting                  | Orchestrator, Builder |
| Generalist    | Quick fixes & triage              | Bug triage, sample repos, misc scripts                                     | Reviewer           |

### Working Agreements
- WIP limit: ≤2 tasks per agent.
- DoD: tests & docs updated, schemas validated in CI, security checks pass, receipts produced where applicable.
- Reviews: Reviewer sign-off mandatory for merge.

## Docs
/docs                # starting plans
  /completed_plans   # finished plans
  /implementation_reports # summaries of completed implementations
  /phases              # plans to start with and implement
  /schemas             # Schemas to reference as starting points
  /handoffs             # when closing a session, place detailed handoffs here