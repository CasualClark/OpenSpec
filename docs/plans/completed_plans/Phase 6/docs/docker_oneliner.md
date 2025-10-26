# Docker One‑liner

```bash
docker run --rm -p 8443:8443   -e AUTH_TOKENS=devtoken   ghcr.io/your-org/task-mcp-sse:latest
```

**Healthchecks**
```bash
curl -f http://localhost:8443/healthz && echo OK
curl -f http://localhost:8443/readyz && echo READY
```

- `/healthz` - Basic liveness check: validates server is running and responding
- `/readyz` - Readiness check: confirms all dependencies are available and server can accept traffic
