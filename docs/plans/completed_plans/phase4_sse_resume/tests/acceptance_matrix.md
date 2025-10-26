# tests/acceptance_matrix.md — What We Prove Works

| Capability | Test | Pass Criteria |
| --- | --- | --- |
| SSE headers | `curl -N` shows immediate `event: result` | First event < 500ms after tool completes |
| Heartbeat | open 5 min idle | Receive `: keep-alive` at configured cadence |
| NDJSON | `curl` shows start/result/end lines | No buffering; lines appear as written |
| Auth | bad token | 401 minimal JSON body |
| CORS | disallowed origin | 403 or preflight denied |
| Connector | Messages API call | Tool result block appears; IDs are consistent |
| Proxy | Behind nginx | No buffering, gzip disabled, long timeout |
