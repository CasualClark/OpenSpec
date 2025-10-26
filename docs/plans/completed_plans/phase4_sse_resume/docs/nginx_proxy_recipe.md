# docs/nginx_proxy_recipe.md — Minimal Nginx for SSE & NDJSON

```nginx
server {
  listen 443 ssl;
  server_name task-mcp.example.com;

  ssl_certificate     /etc/ssl/certs/server.crt;
  ssl_certificate_key /etc/ssl/private/server.key;

  # NDJSON endpoint (supports Authorization headers)
  location /mcp {
    proxy_pass http://task-mcp:8443/mcp;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_read_timeout 3600s;
    gzip off;
  }

  # SSE endpoint
  location /sse {
    proxy_pass http://task-mcp:8443/sse;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header Connection '';
    proxy_buffering off;        # or honor backend 'X-Accel-Buffering: no'
    proxy_read_timeout 3600s;
    gzip off;                   # do not compress SSE
  }

  location /healthz { proxy_pass http://task-mcp:8443/healthz; }
  location /readyz  { proxy_pass http://task-mcp:8443/readyz; }
}
```

**Notes**
- Prefer backend `X-Accel-Buffering: no`, but `proxy_buffering off;` works.
- Set longer timeouts if agents keep streams open for minutes.
