# Docker One‑Liner Deployment

This guide provides a single Docker command to deploy Task MCP HTTP Server with minimal configuration.

## Quick Start

### Basic HTTP Deployment

```bash
docker run --rm -p 8443:8443 \
  -e AUTH_TOKENS=devtoken \
  ghcr.io/fission-ai/task-mcp-http:latest
```

### HTTPS Deployment with TLS Certificates

```bash
docker run --rm -p 8443:8443 \
  -e AUTH_TOKENS=devtoken \
  -v $(pwd)/tls.key:/app/tls.key:ro \
  -v $(pwd)/tls.crt:/app/tls.crt:ro \
  -e TLS_KEY=/app/tls.key \
  -e TLS_CERT=/app/tls.crt \
  ghcr.io/fission-ai/task-mcp-http:latest
```

### Production Deployment with Logging

```bash
docker run -d --name task-mcp-http \
  -p 8443:8443 \
  -e AUTH_TOKENS=your-production-token \
  -e LOG_LEVEL=info \
  -e RATE_LIMIT=120 \
  -e ALLOWED_ORIGINS=https://yourdomain.com \
  -v $(pwd)/logs:/app/logs \
  --restart unless-stopped \
  ghcr.io/fission-ai/task-mcp-http:latest
```

## Configuration Options

### Authentication
- `AUTH_TOKENS` - Comma-separated list of valid bearer tokens
- Default: `devtoken` (development only)

### Server Configuration
- `PORT` - Server port (default: `8443`)
- `HOST` - Bind address (default: `0.0.0.0`)
- `NODE_ENV` - Environment (default: `production`)

### TLS/SSL
- `TLS_KEY` - Path to TLS private key
- `TLS_CERT` - Path to TLS certificate
- When TLS is configured, server uses HTTPS automatically

### Rate Limiting
- `RATE_LIMIT` - Requests per minute per client (default: `60`)

### CORS
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins
- Default: `http://localhost:3000,https://localhost:3000`

### Logging
- `LOG_LEVEL` - `debug`, `info`, `warn`, `error` (default: `info`)
- `ENABLE_STRUCTURED_LOGGING` - Enable JSON logging (default: `true`)
- `LOG_FILE` - Path to log file (optional)

## Health Check Endpoints

The server provides Kubernetes-style health check endpoints:

### Liveness Probe (`/healthz`)

```bash
curl -f -H "Origin: http://localhost:3000" http://localhost:8443/healthz && echo "✅ Server is alive"
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-26T10:30:00.000Z",
  "uptime": 123456,
  "version": "1.0.0",
  "details": {
    "memoryUsage": "45MB",
    "cpuUsage": "2.1%",
    "responseTime": 12
  }
}
```

### Readiness Probe (`/readyz`)

```bash
curl -f -H "Origin: http://localhost:3000" http://localhost:8443/readyz && echo "✅ Server is ready"
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-26T10:30:00.000Z",
  "uptime": 123456,
  "version": "1.0.0",
  "ready": true,
  "dependencies": {
    "tools": true,
    "filesystem": true,
    "security": true
  },
  "details": {
    "responseTime": 15,
    "checks": {
      "toolRegistry": {
        "status": "pass",
        "duration": 5,
        "message": "Found 4 tools"
      },
      "filesystem": {
        "status": "pass", 
        "duration": 2,
        "message": "File system accessible, 25GB free"
      }
    }
  }
}
```

### Comprehensive Health Check (`/health`)

```bash
curl -s http://localhost:8443/health | jq .
```

Provides detailed system information including:
- Memory and CPU usage
- Available tools
- Security subsystem status
- All health check results

## Docker Health Checks

The Docker image includes built-in health checks:

```bash
# Check container health
docker ps --filter name=task-mcp-http

# View health check logs
docker inspect task-mcp-http | jq '.[0].State.Health'
```

## API Endpoints

Once deployed, the server exposes these endpoints:

- `POST /sse` - Server-Sent Events interface
- `POST /mcp` - Streamable HTTP (NDJSON) interface  
- `GET /` - Server information and endpoints
- `GET /healthz` - Liveness probe
- `GET /readyz` - Readiness probe
- `GET /health` - Comprehensive health check
- `GET /metrics` - Prometheus metrics (if enabled)
- `GET /security/metrics` - Security metrics (authenticated)

## Example Usage

### Test with SSE

```bash
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  -d '{
    "tool": "change.show",
    "input": {"slug": "test-slug"}
  }'
```

### Test with NDJSON

```bash
curl -X POST http://localhost:8443/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  -d '{
    "tool": "change.open", 
    "input": {"slug": "test-slug"}
  }'
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs task-mcp-http

# Common issues:
# - Port already in use (change -p mapping)
# - Invalid TLS certificates (check file paths)
# - Missing AUTH_TOKENS (set at least one token)
```

### Health Checks Failing

```bash
# Test endpoints manually
curl -v http://localhost:8443/healthz
curl -v http://localhost:8443/readyz

# Check if server is responding
curl -v http://localhost:8443/
```

### Authentication Issues

```bash
# Test with correct token
curl -H "Authorization: Bearer your-token" http://localhost:8443/

# Verify token is set correctly
docker exec task-mcp-http env | grep AUTH_TOKENS
```

### TLS/SSL Problems

```bash
# Verify certificate files exist
docker exec task-mcp-http ls -la /app/tls.*

# Test TLS configuration
openssl s_client -connect localhost:8443 -servername localhost
```

## Production Considerations

### Security
- Use strong, unique `AUTH_TOKENS` in production
- Enable TLS with valid certificates
- Set appropriate `ALLOWED_ORIGINS` for CORS
- Consider running behind a reverse proxy (nginx/traefik)

### Performance
- Adjust `RATE_LIMIT` based on your traffic patterns
- Monitor memory usage and container resources
- Use structured logging for better observability

### Monitoring
- The `/metrics` endpoint provides Prometheus-compatible metrics
- Health checks integrate with Kubernetes/Docker orchestration
- Structured logs work with log aggregation systems

### Persistence
- Mount volumes for logs if you need persistence
- Consider external storage for TLS certificates
- Database state (if any) should be externalized

## Docker Compose Example

For more complex setups, use Docker Compose:

```yaml
version: '3.8'
services:
  task-mcp:
    image: ghcr.io/fission-ai/task-mcp-http:latest
    ports:
      - "8443:8443"
    environment:
      - AUTH_TOKENS=${AUTH_TOKENS}
      - LOG_LEVEL=info
      - RATE_LIMIT=120
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
    volumes:
      - ./logs:/app/logs
      - ./tls:/app/tls:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8443/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Support

- **Documentation**: https://github.com/Fission-AI/OpenSpec
- **Issues**: https://github.com/Fission-AI/OpenSpec/issues
- **Health Check Reference**: See `/healthz` and `/readyz` endpoints above