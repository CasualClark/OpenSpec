# Task MCP HTTPS/SSE Server

Phase 4 implementation of the Task MCP server with HTTPS and Server-Sent Events support for the Anthropic MCP connector.

## Features

### Core Functionality
- **HTTPS Support**: TLS encryption for secure communication
- **Server-Sent Events (SSE)**: Real-time streaming for tool results
- **Streamable HTTP**: NDJSON response format for tool execution
- **Authentication**: Bearer token-based authentication
- **Rate Limiting**: Configurable request rate limits
- **CORS Support**: Cross-origin resource sharing configuration
- **Health Checks**: Liveness and readiness probes
- **Structured Logging**: JSON logging with request IDs
- **Graceful Shutdown**: Clean server shutdown handling

### Observability & Reliability
- **OpenTelemetry Integration**: Comprehensive metrics and distributed tracing
- **SLO Monitoring**: Service Level Objectives with error budget tracking
- **Prometheus Metrics**: Native Prometheus metric collection
- **Grafana Dashboards**: Pre-built observability dashboards
- **AlertManager Integration**: Multi-channel alerting with burn rate alerts
- **Security Auditing**: Comprehensive security event logging
- **Performance Monitoring**: Real-time performance tracking and optimization

### SRE Features
- **Multi-window Burn Rate Alerts**: Fast, medium, and slow burn detection
- **Error Budget Management**: Automated error budget tracking and alerts
- **Health Check Registry**: Comprehensive health check system
- **Auto-scaling Support**: Kubernetes HPA integration
- **Circuit Breaker Patterns**: Resilience to external service failures
- **Disaster Recovery**: Backup and recovery procedures

## Quick Start

### Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm start:http:dev

# Or use tsx for hot reloading
pnpm dev:http
```

### Production

```bash
# Build the package
pnpm build:http

# Start production server
pnpm start:http
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server Configuration
PORT=8443
HOST=0.0.0.0

# TLS Configuration (required for HTTPS)
TLS_KEY=./path/to/server.key
TLS_CERT=./path/to/server.crt

# Authentication (comma-separated)
AUTH_TOKENS=your-token-1,your-token-2

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Rate Limiting (requests per minute)
RATE_LIMIT=60

# SSE Heartbeat (milliseconds)
HEARTBEAT_MS=25000

# Response Size Limit (KB)
MAX_RESPONSE_SIZE_KB=10

# Logging Level
LOG_LEVEL=info

# OpenTelemetry Configuration
OTEL_ENABLED=true
OTEL_SERVICE_NAME=task-mcp-http
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://otel-collector:4318/v1/metrics
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector:4318/v1/traces

# Monitoring
ENABLE_PROMETHEUS=true
PROMETHEUS_PORT=9464
```

## API Endpoints

### Server-Sent Events (SSE)

```bash
POST /sse
Content-Type: application/json
Authorization: Bearer <token>

{
  "tool": "change.open",
  "input": {
    "slug": "example-change"
  }
}
```

Response:
```
event: result
data: {"apiVersion":"1.0.0","tool":"change.open","result":...}
```

### Streamable HTTP (NDJSON)

```bash
POST /mcp
Content-Type: application/json
Authorization: Bearer <token>

{
  "tool": "change.archive",
  "input": {
    "slug": "example-change"
  }
}
```

Response:
```
{"type":"start","ts":1234567890}
{"type":"result","result":...}
{"type":"end","ts":1234567890}
```

### Health Checks

```bash
GET /health/live   # Liveness probe
GET /health/ready  # Readiness probe
GET /health/metrics # Health metrics
```

### Observability Endpoints

```bash
GET /metrics       # Prometheus metrics (if enabled)
GET /debug/pprof   # Performance profiling (development)
```

## Available Tools

- `change.open`: Open and read change specifications
- `change.archive`: Archive completed changes

## Service Level Objectives (SLOs)

### Availability
- **API Endpoints**: 99.9% uptime (43.2 minutes downtime/month max)
- **Health Checks**: 99.95% uptime (21.6 minutes downtime/month max)

### Latency
- **HTTP Requests**: p95 < 200ms, p99 < 500ms
- **Tool Execution**: p95 < 500ms, p99 < 2000ms
- **Streaming**: p95 < 100ms for first message

### Error Rate
- **HTTP Requests**: < 1% for all endpoints
- **Tool Execution**: < 0.1% for critical operations
- **Authentication**: < 5% (excluding intentional failures)

### Throughput
- **Request Rate**: > 1000 RPS sustained
- **Streaming**: > 1000 concurrent connections
- **Tool Execution**: > 100 executions/second

## Monitoring Stack

### Components

#### Prometheus
- **Metrics Collection**: Application and system metrics
- **Alerting Rules**: SLO-based burn rate alerts
- **Retention**: 30 days with configurable retention
- **Endpoint**: `http://prometheus:9090`

#### Grafana
- **Dashboards**: 6 pre-built dashboards for comprehensive monitoring
- **Alerting**: Visual alert indicators and notifications
- **User Management**: Role-based access control
- **Endpoint**: `http://grafana:3000`

#### AlertManager
- **Routing**: Multi-level alert routing based on severity
- **Silencing**: Alert management and suppression
- **Templates**: Custom notification templates
- **Endpoint**: `http://alertmanager:9093`

#### OpenTelemetry
- **Metrics**: Application performance metrics
- **Tracing**: Distributed request tracing
- **Sampling**: Adaptive sampling for high-volume endpoints
- **Collector**: `http://otel-collector:4318`

### Key Metrics

#### HTTP Metrics
- `http_server_requests_total`: Total HTTP requests
- `http_server_request_duration`: Request latency histogram
- `http_server_active_requests`: Current active requests

#### Tool Execution Metrics
- `tool_executions_total`: Tool execution count
- `tool_execution_duration`: Tool execution latency
- `tool_active_executions`: Active tool executions

#### Streaming Metrics
- `streaming_active_connections`: Active SSE connections
- `streaming_messages_total`: Messages sent
- `streaming_bytes_transferred`: Bytes transferred

#### System Metrics
- `process_cpu_usage_percent`: CPU usage percentage
- `process_memory_bytes`: Memory usage breakdown
- `health_check_status`: Health check status

### Alerting

#### Critical Alerts
- Service downtime > 5 minutes
- Error rate > 5% over 5 minutes
- p99 latency > 2x target over 10 minutes
- Health check failures > 3 consecutive checks

#### Warning Alerts
- Error rate > 2x target over 15 minutes
- p95 latency > 1.5x target over 15 minutes
- Throughput < 50% of target over 10 minutes
- Memory usage > 85%

#### SLO Burn Rate Alerts
- **Fast Burn**: Error budget exhausted in < 2 hours
- **Medium Burn**: Error budget exhausted in < 6 hours
- **Slow Burn**: Error budget exhausted in < 24 hours

## TLS Setup

### Development (mkcert)

```bash
# Install mkcert
brew install mkcert  # macOS
# or follow https://github.com/FiloSottile/mkcert for other platforms

# Create local CA
mkcert -install

# Generate certificate
mkcert localhost 127.0.0.1 ::1
# This creates localhost+2.pem and localhost+2-key.pem
```

### Production

Use certificates from your preferred CA (Let's Encrypt, DigiCert, etc.).

## Docker Usage

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 8443 9464
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  task-mcp-http:
    build: .
    ports:
      - "8443:8443"
      - "9464:9464"
    environment:
      - NODE_ENV=production
      - OTEL_ENABLED=true
      - ENABLE_PROMETHEUS=true
    volumes:
      - ./certs:/app/certs:ro
```

## Kubernetes Deployment

### Basic Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: task-mcp-http
  namespace: task-mcp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: task-mcp-http
  template:
    metadata:
      labels:
        app: task-mcp-http
    spec:
      containers:
      - name: task-mcp-http
        image: task-mcp-http:latest
        ports:
        - containerPort: 8443
        - containerPort: 9464
        env:
        - name: OTEL_ENABLED
          value: "true"
        - name: ENABLE_PROMETHEUS
          value: "true"
        resources:
          limits:
            cpu: 1000m
            memory: 2Gi
          requests:
            cpu: 500m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8443
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8443
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: task-mcp-http
  namespace: task-mcp
  labels:
    app: task-mcp-http
spec:
  selector:
    app: task-mcp-http
  ports:
  - name: https
    port: 8443
    targetPort: 8443
  - name: metrics
    port: 9464
    targetPort: 9464
  type: ClusterIP
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: task-mcp-http
  namespace: task-mcp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: task-mcp-http
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Integration with Existing MCP Infrastructure

The server integrates with the existing Task MCP tool registry:

```typescript
import { createServer } from '../../src/stdio/factory.js';

// Tool registry is automatically loaded with:
// - change.open tool
// - change.archive tool
// - Resource providers for changes, proposals, tasks, deltas
```

## Observability Features

### Structured Logging

The server uses structured JSON logging with correlation IDs:

```json
{
  "timestamp": "2025-10-26T07:59:47.935Z",
  "level": "info",
  "message": "Request processed successfully",
  "service": "task-mcp-http",
  "correlationId": "req-123-456",
  "context": {
    "userId": "user-789",
    "request": {
      "method": "POST",
      "url": "/mcp",
      "userAgent": "MCP-Client/1.0.0"
    },
    "response": {
      "statusCode": 200,
      "duration": 150
    }
  },
  "metrics": {
    "responseTime": 150,
    "memoryUsage": 51200000
  }
}
```

### OpenTelemetry Integration

Comprehensive OpenTelemetry instrumentation:

```typescript
// Automatic HTTP request tracing
// Tool execution spans
// Streaming connection tracking
// Custom metrics and events
// Performance overhead monitoring
```

### Health Check System

Comprehensive health check registry:

```typescript
// Database connectivity
// External service dependencies
// Resource utilization
// Custom application checks
// Health metrics collection
```

## Security

### Authentication & Authorization
- Bearer token authentication
- Configurable token management
- Rate limiting per token
- IP-based access controls

### TLS & Encryption
- TLS 1.3 encryption
- Certificate management
- Secure cipher suites
- HSTS headers

### Security Auditing
- Comprehensive audit logging
- Failed authentication tracking
- Rate limit violation monitoring
- Security event correlation

### Input Validation
- Request size limits
- Path validation and sandboxing
- Content-type validation
- SQL injection prevention

## Performance

### Optimization Features
- Connection pooling via Fastify
- Streaming responses for large payloads
- Configurable response size limits
- Rate limiting to prevent abuse

### Performance Monitoring
- Real-time latency tracking
- Throughput monitoring
- Resource utilization metrics
- Performance bottleneck detection

### Auto-scaling
- Kubernetes HPA integration
- CPU and memory-based scaling
- Custom metric scaling
- Predictive scaling capabilities

## Error Handling

All errors follow a consistent format:

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "hint": "Optional hint for resolution"
  },
  "requestId": "uuid",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "correlationId": "req-123-456"
}
```

## Documentation

### Operational Documentation
- [Operations Runbooks](docs/operations/README.md)
- [Troubleshooting Guide](docs/troubleshooting/README.md)
- [SLO Documentation](docs/slos/README.md)
- [Maintenance Guide](docs/maintenance/README.md)

### Team Documentation
- [Onboarding Guide](docs/onboarding/README.md)
- [Security Guide](docs/SECURITY.md)
- [API Reference](docs/api/README.md)
- [NGINX Setup](docs/NGINX_SETUP_GUIDE.md)

### Monitoring Documentation
- [Monitoring Stack Overview](monitoring/README.md)
- [SLO Definitions](monitoring/SLOS.md)
- [Runbooks](monitoring/RUNBOOKS.md)
- [Alert Configuration](monitoring/alertmanager/alertmanager.yml)

## Development Scripts

```bash
pnpm build:http    # Build the package
pnpm dev:http      # Start with hot reload
pnpm start:http    # Start production server
pnpm start:http:dev # Start development server
pnpm test          # Run tests
pnpm test:watch    # Run tests in watch mode
pnpm test:integration # Run integration tests
pnpm test:load     # Run load tests
```

## Testing

### Unit Tests
```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/routes/mcp.test.ts
```

### Integration Tests
```bash
# Run integration tests
pnpm test:integration

# Run with specific environment
NODE_ENV=test pnpm test:integration
```

### Load Tests
```bash
# Run SSE load test
node test/load/sse-load-test.js

# Run NDJSON load test
node test/load/ndjson-load-test.js
```

## Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Submit pull request
5. Address review feedback
6. Merge to main branch

### Code Quality
- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- Husky for git hooks

### Testing Requirements
- Unit tests for all new features
- Integration tests for API changes
- Performance tests for optimizations
- Security tests for authentication changes

## License

MIT License - see LICENSE file for details.

## Support

### Documentation
- [Operations Runbooks](docs/operations/README.md)
- [Troubleshooting Guide](docs/troubleshooting/README.md)
- [SLO Documentation](docs/slos/README.md)
- [API Reference](docs/api/README.md)

### Community
- **Issues**: [GitHub Issues](https://github.com/company/task-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/company/task-mcp/discussions)
- **Slack**: #task-mcp-team

### Professional Support
- **Enterprise**: enterprise@company.com
- **Support**: support@company.com
- **Security**: security@company.com