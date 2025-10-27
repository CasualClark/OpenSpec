# Acceptance Matrix

| Capability | Test | Pass Criteria |
|---|---|---|
| Structured logs | E2E run | All lines have required fields |
| RED metrics | Load | Counters increase; histogram populated |
| Tracing | E2E | tool span exists; trace.id in logs |
| Alerts | Synthetic failure | Fast+slow burn fire appropriately |
| Chaos locks | 20 writers | Only one succeeds; no partial state |
