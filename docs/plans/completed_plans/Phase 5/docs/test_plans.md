# Test Plans

## E2E (CI)
Flow: open → write proposal/tasks → archive → verify `receipt.json`.Assert: 2xx, compact outputs, logs emitted, metrics incremented.

## Load (k6)
50 VUs → 3m to `/mcp` NDJSON; thresholds: `p(95)<300ms`, failures `<1%`.

## Chaos (Locks)
20 workers call `change.open` same slug for 30s.Expect one winner; others `ELOCKED` until TTL expires; no partial state.
