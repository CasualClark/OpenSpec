# Troubleshooting

## SSE shows batched messages
- Ensure response headers include:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `X-Accel-Buffering: no`
- If behind a proxy, disable buffering for the SSE location or honor `X-Accel-Buffering`.

## Auth errors
- Browser EventSource won't send `Authorization` headers. Use cookie auth or NDJSON transport with headers.

## Port/TLS
- Default to HTTPS on 8443 when TLS envs are set; fall back to HTTP on 8080.
