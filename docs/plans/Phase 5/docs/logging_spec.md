# Logging Spec

- JSON Lines to stdout.
- ECS‑like keys; redaction for PII; hash `client.address`.
- Sampling: after first N identical errors/code per hour, sample at 1/M rate.
- Correlate logs ↔ traces via `trace.id`; surface `request.id` in responses (non‑sensitive).
