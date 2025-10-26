# 01_ORCHESTRATE — Phase 5 Kickoff

## Scope
- Structured JSON logs (stdout).
- Metrics: OpenTelemetry semantic HTTP + tool metrics (RED) and runtime (USE).
- Tracing: lightweight spans per request/tool.
- SLOs & alerts: multi‑window burn‑rate.
- CI: e2e, load (k6), chaos (locks), perf gates.

## Sequence
1) Architect: instrumentation spec (fields, units, buckets).
2) Builder: JSON logging & error normalization.
3) Engineer: OTel metrics/traces; /metrics if Prometheus used.
4) DevOps: SLO dashboards & burn‑rate alerts.
5) Reviewer: CI gates & perf thresholds.
6) Knowledge: runbook & diagrams.
7) Orchestrator: merge, tag, release notes.
