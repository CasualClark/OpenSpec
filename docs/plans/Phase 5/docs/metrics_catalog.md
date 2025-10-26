# Metrics Catalog

| Metric | Type | Labels | Notes |
|---|---|---|---|
| http.server.request.duration | hist | route, method, status_class, transport | RED latency (OTel semantic) |
| http.server.request.count | counter | route, method, status_class, transport | Request rate |
| http.server.error.count | counter | route, method, transport | Error rate |
| taskmcp.tool.duration | hist | tool.name, status | Tool latency |
| taskmcp.tool.success | counter | tool.name | Tool success count |
| taskmcp.tool.errors | counter | tool.name, error.code | Typed tool errors |
| taskmcp.stream.connections | gauge | transport | Active streams |
| taskmcp.stream.heartbeats | counter | transport | Keep‑alives |
| taskmcp.stream.bytes_out | counter | transport | Outgoing bytes |
| process.runtime.heap.bytes | gauge |  | Heap |
| process.cpu.time | counter |  | CPU |
| process.open_fds | gauge |  | FD pressure |
