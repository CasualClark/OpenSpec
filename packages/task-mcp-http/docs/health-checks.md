# Health Check System Documentation

## Overview

The Task MCP HTTP Server includes a comprehensive health check system designed for production monitoring, container orchestration, and observability. The system provides multiple layers of health monitoring from basic liveness to detailed system diagnostics.

## Architecture

### Components

1. **Health Check Registry** (`src/health/registry.ts`)
   - Manages registration and execution of health checks
   - Provides caching, retries, and timeout handling
   - Supports critical/non-critical check classification

2. **System Monitor** (`src/health/monitor.ts`)
   - Monitors system resources (CPU, memory, disk)
   - Provides detailed system information
   - Tracks process health metrics

3. **Metrics Collector** (`src/health/metrics.ts`)
   - Prometheus-compatible metrics collection
   - HTTP request, tool execution, and security metrics
   - System resource monitoring

4. **Health Endpoints** (`src/health/index.ts`)
   - `/healthz` - Liveness probe
   - `/readyz` - Readiness probe  
   - `/health` - Comprehensive health check
   - `/metrics` - Prometheus metrics

## Endpoints

### Liveness Probe (`/healthz`)

**Purpose**: Basic server liveness check for container orchestration

**Response Format**:
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2025-01-25T10:30:00.123Z",
  "uptime": 3600000,
  "version": "1.0.0",
  "checks": {},
  "details": {
    "memoryUsage": "45MB",
    "cpuUsage": "2.3%",
    "responseTime": 12
  }
}
```

**Behavior**:
- Always returns 200 if server is running
- Response time < 50ms for healthy status
- Returns degraded if response time exceeds 50ms
- Includes basic system metrics

### Readiness Probe (`/readyz`)

**Purpose**: Check if server is ready to handle requests

**Response Format**:
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2025-01-25T10:30:00.123Z",
  "uptime": 3600000,
  "version": "1.0.0",
  "checks": {
    "toolRegistry": "pass|fail|warn",
    "filesystem": "pass|fail|warn",
    "security": "pass|fail|warn"
  },
  "details": {
    "responseTime": 25,
    "checks": {
      "toolRegistry": {
        "status": "pass",
        "duration": 5,
        "message": "Found 4 tools",
        "lastCheck": "2025-01-25T10:30:00.123Z"
      }
    }
  }
}
```

**Behavior**:
- Returns 200 if all critical checks pass
- Returns 503 if any critical check fails
- Includes detailed check results and timing

### Comprehensive Health (`/health`)

**Purpose**: Complete system health overview

**Response Format**:
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2025-01-25T10:30:00.123Z",
  "uptime": 3600000,
  "version": "1.0.0",
  "checks": {
    "toolRegistry": "pass|fail|warn",
    "filesystem": "pass|fail|warn",
    "memory": "pass|fail|warn",
    "cpu": "pass|fail|warn"
  },
  "details": {
    "system": {
      "memoryUsage": {
        "heapUsed": 47185920,
        "heapTotal": 67108864,
        "external": 2097152,
        "rss": 62914560
      },
      "cpuUsage": 2.3,
      "uptime": 3600,
      "platform": "linux",
      "nodeVersion": "v20.10.0"
    },
    "tools": ["change.open", "change.archive", "change.show", "change.validate"],
    "resources": {
      "memory": {
        "heapUsed": 45,
        "heapTotal": 64,
        "external": 2,
        "rss": 60
      },
      "uptime": 3600,
      "pid": 12345
    },
    "security": {
      "auth": "enabled",
      "rateLimit": "enabled",
      "cors": "enabled",
      "headers": "enabled",
      "audit": "enabled"
    },
    "responseTime": 45
  }
}
```

### Metrics Endpoint (`/metrics`)

**Purpose**: Prometheus-compatible metrics

**Format**: Text-based Prometheus format

**Available Metrics**:
- `http_requests_total` - HTTP request count by method, status, route
- `http_request_duration_seconds` - HTTP request latency histogram
- `tool_executions_total` - Tool execution count by tool, status
- `tool_execution_duration_seconds` - Tool execution latency histogram
- `health_check_status` - Health check status by check name
- `health_check_duration_seconds` - Health check duration histogram
- `auth_attempts_total` - Authentication attempts by status
- `rate_limit_hits_total` - Rate limit violations
- `process_memory_bytes` - Process memory usage by type
- `process_cpu_usage_percent` - Process CPU usage percentage
- `process_uptime_seconds` - Process uptime

## Built-in Health Checks

### Tool Registry Check
- **Critical**: Yes
- **Timeout**: 5 seconds
- **Interval**: 30 seconds
- **Purpose**: Verify tool registry availability and tool count

### Filesystem Check
- **Critical**: Yes
- **Timeout**: 3 seconds
- **Interval**: 60 seconds
- **Purpose**: Verify filesystem accessibility and disk space

### Memory Check
- **Critical**: No
- **Timeout**: 2 seconds
- **Interval**: 30 seconds
- **Purpose**: Monitor memory usage and detect memory pressure

### CPU Check
- **Critical**: No
- **Timeout**: 2 seconds
- **Interval**: 30 seconds
- **Purpose**: Monitor CPU usage and detect CPU pressure

## Configuration

### Health Check Configuration

```typescript
interface HealthCheckConfig {
  timeout?: number;           // Default: 5000ms
  cacheTimeout?: number;      // Default: 30000ms
  enableCaching?: boolean;    // Default: true
  gracePeriod?: number;       // Default: 10000ms
  maxRetries?: number;        // Default: 3
  retryDelay?: number;        // Default: 1000ms
}
```

### Environment Variables

```bash
# Health check timeouts
HEALTH_TIMEOUT=5000
HEALTH_CACHE_TIMEOUT=30000
HEALTH_ENABLE_CACHING=true
HEALTH_GRACE_PERIOD=10000
HEALTH_MAX_RETRIES=3
HEALTH_RETRY_DELAY=1000
```

## Container Integration

### Docker Health Checks

The Dockerfile includes built-in health checks:

```dockerfile
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=30s \
            --retries=3 \
            CMD /usr/local/bin/health-check.sh
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8443
    scheme: HTTPS
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 3
  successThreshold: 1
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /readyz
    port: 8443
    scheme: HTTPS
  initialDelaySeconds: 10
  periodSeconds: 30
  timeoutSeconds: 5
  successThreshold: 1
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /healthz
    port: 8443
    scheme: HTTPS
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 5
  successThreshold: 1
  failureThreshold: 30
```

## Custom Health Checks

### Registering Custom Checks

```typescript
import { healthCheckPlugin } from './health/index';

// During server setup
await server.register(healthCheckPlugin, config);

// Get registry reference
const registry = server.health.registry;

// Register custom check
registry.register('database', {
  timeout: 5000,
  interval: 30000,
  critical: true,
  check: async () => {
    const startTime = Date.now();
    try {
      // Perform database connectivity check
      await database.ping();
      
      return {
        status: 'pass',
        message: 'Database connection successful',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: { connectionPool: 'healthy' }
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Database connection failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };
    }
  }
});
```

### Health Check Result Format

```typescript
interface HealthCheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  timestamp: string;
  duration: number;
  details?: Record<string, any>;
}
```

## Monitoring Integration

### Prometheus Configuration

```yaml
scrape_configs:
  - job_name: 'task-mcp-http'
    static_configs:
      - targets: ['task-mcp-http:8443']
    metrics_path: '/metrics'
    scheme: https
    tls_config:
      insecure_skip_verify: true
    scrape_interval: 30s
    scrape_timeout: 10s
```

### Grafana Dashboard

Key metrics to monitor:
- HTTP request rate and latency
- Tool execution success rate
- Health check status changes
- Memory and CPU usage trends
- Authentication success/failure rates
- Rate limit violations

## Management API

### Admin Endpoints

All management endpoints require authentication:

```bash
# Get all health checks
GET /health/checks
Authorization: Bearer admin-token

# Disable a health check
POST /health/checks/{name}/disable
Authorization: Bearer admin-token

# Enable a health check
POST /health/checks/{name}/enable
Authorization: Bearer admin-token
```

### Response Format

```json
{
  "success": true,
  "data": [
    {
      "name": "toolRegistry",
      "status": "pass",
      "lastCheck": "2025-01-25T10:30:00.123Z",
      "duration": 5,
      "timeout": 5000,
      "interval": 30000,
      "critical": true,
      "enabled": true,
      "message": "Found 4 tools"
    }
  ]
}
```

## Troubleshooting

### Common Issues

1. **Health Check Timeouts**
   - Increase timeout values for slower systems
   - Check system resource constraints
   - Verify network connectivity

2. **Failed Critical Checks**
   - Review check-specific error messages
   - Verify required dependencies are available
   - Check configuration settings

3. **High Memory Usage**
   - Monitor memory trends in `/metrics`
   - Check for memory leaks in custom health checks
   - Adjust memory thresholds

4. **Metrics Not Available**
   - Verify metrics endpoint is accessible
   - Check Prometheus configuration
   - Ensure health checks are running

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

Debug information includes:
- Health check execution details
- Timing information
- Error stack traces
- Cache hit/miss rates

## Best Practices

1. **Check Classification**
   - Mark truly critical checks as critical
   - Use non-critical checks for monitoring
   - Balance thoroughness with performance

2. **Timeout Configuration**
   - Set appropriate timeouts for each check
   - Consider network latency for external checks
   - Avoid overly aggressive timeouts

3. **Caching Strategy**
   - Enable caching for expensive checks
   - Set appropriate cache timeouts
   - Clear cache when configuration changes

4. **Monitoring Setup**
   - Set up Prometheus scraping
   - Create Grafana dashboards
   - Configure alerting rules

5. **Security**
   - Protect admin endpoints with authentication
   - Use HTTPS for all health check communication
   - Limit health check access to internal networks

## Performance Considerations

- Health checks are designed to be lightweight
- Built-in checks complete within 50ms for healthy systems
- Caching reduces overhead for frequent polling
- Parallel execution of independent checks
- Minimal impact on application performance

## Security Notes

- Health endpoints expose system information
- Admin endpoints require authentication
- Metrics may contain sensitive information
- Use network policies to restrict access
- Consider rate limiting for health endpoints