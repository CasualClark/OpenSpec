# Tracing Spec

- Tracer `task-mcp`.
- Root span per HTTP request; child span per tool `tool.{name}`.
- Span attributes: `tool.name`, `slug`, `input.bytes`, `result.bytes`, `status`.
- Record exceptions; set error status; always end spans.
