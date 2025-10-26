# 02_AGENT_TASKS — Assignments

| Agent        | Responsibilities |
|--------------|------------------|
| Orchestrator | Plan, scope, merge gates, release notes |
| Architect    | Instrumentation spec, SLOs, buckets, dimensions |
| Engineer     | OTel metrics + traces, k6 load, chaos harness |
| Builder      | JSON logs, error normalization, correlation IDs |
| Reviewer     | CI rules, thresholds, perf budgets |
| Knowledge    | Docs, runbook, dashboards guide |
| DevOps       | Dashboards, alerts, optional collector |

### Builder
- Emit JSON lines with: `@timestamp, level, msg, request.id, tool.name, latencyMs, bytesOut, status, error.code, trace.id`.
- Rate‑limit/sampling for repetitive errors.

### Engineer
- Metrics (OTel): `http.server.request.duration` (histogram, seconds), counts & error counts; `taskmcp.tool.duration/success/errors`.
- Tracing: root HTTP span; child `tool.{name}` span; inject `trace.id` into logs.

### DevOps
- Burn‑rate alerts (fast/slow windows) bound to availability SLI.
- Dashboards: RED/USE; locks panel (ELOCKED/TTL).

### Reviewer
- Enforce label cardinality; perf budgets; alert noise review.
