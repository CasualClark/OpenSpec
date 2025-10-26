# SLOs & Alerts

## SLIs
- Availability (success ratio) and latency (p95).

## SLO Targets
- Availability: 99.9% rolling 30d.
- Latency: p95 < 300ms for `/mcp|/sse`.

## Burn‑rate Alerts (multi‑window)
- Fast burn: 1h window with 5m short‑window; threshold ~14.4x.
- Slow burn: 6h window with 30m short‑window; threshold ~6x.

## Error Budget Policy
- Freeze non‑P0 work if burn exceeds monthly budget; review gates.
