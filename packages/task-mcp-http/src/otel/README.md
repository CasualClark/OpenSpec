# OpenTelemetry Instrumentation for Task MCP HTTP Server

This module provides comprehensive OpenTelemetry instrumentation for the Task MCP HTTP server, including metrics collection, distributed tracing, and performance monitoring.

## Features

### 📊 Metrics Collection
- **HTTP Server Metrics**: Request counts, duration, active requests, response sizes
- **Tool Execution Metrics**: Execution counts, duration, active executions, error rates  
- **Streaming Metrics**: Connection counts, message counts, bytes transferred, connection duration
- **System Metrics**: CPU usage, memory usage, process uptime
- **Dual Export**: Prometheus and OTLP export support for gradual migration

### 🔍 Distributed Tracing
- **Automatic HTTP Spans**: Root spans for all HTTP requests with semantic conventions
- **Tool Execution Spans**: Child spans for tool operations with parameters and results
- **Streaming Spans**: Dedicated spans for SSE and NDJSON connections
- **Adaptive Sampling**: Different sampling ratios for different endpoint types
- **Trace Propagation**: Automatic context injection/extraction for downstream services

### 🎯 Performance Monitoring
- **Overhead Tracking**: Real-time monitoring of OpenTelemetry overhead
- **Configurable Limits**: CPU (< 5%), memory (< 50MB), latency (< 2ms) limits
- **Graceful Degradation**: Automatic fallback when limits are exceeded
- **Sample Collection**: Performance samples for optimization

## Quick Start

### Basic Setup

```typescript
import { initializeOpenTelemetry } from './otel/index.js';

// Initialize OpenTelemetry before starting your server
await initializeOpenTelemetry({
  serviceName: 'task-mcp-http',
  serviceVersion: '1.0.0',
  environment: 'production',
  
  // Configure exporters
  metrics: {
    enabled: true,
    endpoint: 'http://otel-collector:4318/v1/metrics',
    enablePrometheus: true, // Keep existing Prometheus metrics
    prometheusPort: 9464,
  },
  
  tracing: {
    enabled: true,
    endpoint: 'http://otel-collector:4318/v1/traces',
    sampling: {
      default: 0.1,    // 10% sampling for general requests
      sse: 0.01,       // 1% sampling for SSE (high volume)
      ndjson: 0.05,    // 5% sampling for NDJSON
      health: 0.1,     // 10% sampling for health endpoints
    },
  },
});

// Start your server
const server = await createServer(config);
await server.listen({ port: 3000 });
```

### Environment Variables

```bash
# Enable/disable OpenTelemetry
OTEL_ENABLED=true

# Service configuration
OTEL_SERVICE_NAME=task-mcp-http
OTEL_SERVICE_VERSION=1.0.0
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://otel-collector:4318/v1/metrics
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector:4318/v1/traces

# Sampling configuration
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_SSE_SAMPLING_RATIO=0.01
OTEL_NDJSON_SAMPLING_RATIO=0.05
OTEL_HEALTH_SAMPLING_RATIO=0.1

# Prometheus export (for dual export during migration)
OTEL_ENABLE_PROMETHEUS=true
OTEL_PROMETHEUS_PORT=9464
OTEL_PROMETHEUS_ENDPOINT=/metrics
```

## Architecture

### Core Components

#### 1. OpenTelemetryInstrumentation
Main orchestrator that coordinates all OpenTelemetry functionality:

```typescript
const otel = new OpenTelemetryInstrumentation(config);
await otel.initialize();

// Get components
const metrics = otel.getMetrics();
const tracing = otel.getTracing();
const streaming = otel.getStreamingTracker();
```

#### 2. MetricsCollector
Handles all metrics collection with semantic conventions:

```typescript
// HTTP request metrics
metrics.recordHttpRequest('POST', '/api/tools', 200, 150, 1024);

// Tool execution metrics
metrics.recordToolExecution('execute_code', 500, true, { code: 'console.log("hello")' });

// Streaming metrics
metrics.recordStreamingMessage('conn-123', 'sse', 256, 'data');
```

#### 3. TracingManager
Manages distributed tracing with automatic span creation:

```typescript
// Start HTTP span (automatically handled by middleware)
const span = tracing.startHttpSpan('POST', '/api/tools', headers);

// Start tool span
const toolSpan = tracing.startToolSpan('execute_code', parameters);

// Complete spans
tracing.completeHttpSpan(span, 200, 1024);
tracing.completeToolSpan(toolSpan, result, undefined, 500);
```

#### 4. Fastify Middleware
Automatic instrumentation for HTTP requests:

```typescript
// Automatically registered when OpenTelemetry is enabled
const middleware = otel.getMiddleware();

server.addHook('onRequest', middleware.onRequest);
server.addHook('onResponse', middleware.onResponse);
server.addHook('onError', middleware.onError);
```

### Integration Points

#### 1. Server Integration
OpenTelemetry is integrated into the main server:

```typescript
// In main server initialization
await initializeOpenTelemetry({
  serviceName: 'task-mcp-http',
  serviceVersion: '1.0.0',
});

// Middleware is automatically registered
const otel = getOpenTelemetry();
if (otel?.isEnabled()) {
  const middleware = otel.getMiddleware();
  server.addHook('onRequest', middleware.onRequest);
  server.addHook('onResponse', middleware.onResponse);
  server.addHook('onError', middleware.onError);
}
```

#### 2. Route Handler Integration
Tool execution is automatically tracked:

```typescript
// Tool execution decorator
@trackToolExecution('execute_code')
async executeCode(parameters: CodeExecutionParams): Promise<any> {
  // Your tool implementation
  return result;
}
```

#### 3. Streaming Integration
SSE and NDJSON connections are tracked:

```typescript
// In SSE route handler
const tracker = otel.getStreamingTracker();
const connection = tracker.startConnection('sse', connectionId, 'browser');

// Record messages
connection.recordMessage(messageSize, 'data');

// End connection
connection.end(undefined, totalMessages, totalBytes);
```

## Configuration

### Complete Configuration

```typescript
interface OpenTelemetryConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment?: string;
  
  metrics: {
    enabled: boolean;
    endpoint?: string;
    exportIntervalMs: number;
    exportTimeoutMs: number;
    enablePrometheus: boolean;
    prometheusPort: number;
    prometheusEndpoint: string;
  };
  
  tracing: {
    enabled: boolean;
    endpoint?: string;
    exportTimeoutMs: number;
    batchTimeoutMs: number;
    maxExportBatchSize: number;
    maxQueueSize: number;
    sampling: {
      default: number;    // 0-1
      sse: number;       // 0-1
      ndjson: number;    // 0-1
      health: number;    // 0-1
    };
  };
  
  resourceDetection: {
    enabled: boolean;
    aws: boolean;
    gcp: boolean;
    alibaba: boolean;
  };
  
  performance: {
    maxCpuOverheadPercent: number;
    maxMemoryOverheadMb: number;
    maxLatencyImpactMs: number;
  };
}
```

### Performance Limits

The implementation includes built-in performance monitoring:

- **CPU Overhead**: Monitors CPU usage impact (< 5% target)
- **Memory Overhead**: Tracks additional memory usage (< 50MB target)
- **Latency Impact**: Measures request processing impact (< 2ms target)
- **Automatic Alerts**: Warnings when limits are exceeded

## Migration Strategy

### Phase 1: Dual Export (Current)
- Enable both Prometheus and OTLP exporters
- Existing Prometheus metrics continue working
- New OpenTelemetry metrics available in parallel
- Gradual verification and validation

### Phase 2: Gradual Transition
- Compare metrics between systems
- Adjust sampling and configuration
- Update dashboards and alerts
- Train operations team

### Phase 3: OpenTelemetry Only
- Disable Prometheus exporter
- Use only OTLP exporters
- Full OpenTelemetry observability stack

## Semantic Conventions

The implementation follows OpenTelemetry semantic conventions:

### HTTP Metrics
- `http.method`: HTTP method (GET, POST, etc.)
- `http.status_code`: HTTP status code
- `http.route`: Matched route pattern
- `http.scheme`: URL scheme (http, https)
- `http.user_agent`: User agent string
- `net.peer.ip`: Client IP address

### Tool Metrics
- `tool_name`: Name of the tool being executed
- `tool.success`: Whether execution succeeded
- `tool_parameters_count`: Number of parameters
- `tool.execution_duration_ms`: Execution time in milliseconds

### Streaming Metrics
- `stream_type`: Type of stream (sse, ndjson)
- `connection_id`: Unique connection identifier
- `client_type`: Type of client (browser, cli, etc.)
- `stream.total_messages`: Total messages sent
- `stream.total_bytes`: Total bytes transferred

## Testing

### Unit Tests
```bash
# Run all OpenTelemetry tests
npm test src/otel/__tests__/

# Run specific test files
npm test src/otel/__tests__/config.test.ts
npm test src/otel/__tests__/metrics.test.ts
npm test src/otel/__tests__/integration.test.ts
```

### Integration Tests
```bash
# Run integration tests with actual OpenTelemetry exporters
npm test src/otel/__tests__/integration.test.ts
```

### Performance Tests
```bash
# Run performance benchmarks
npm test src/otel/__tests__/performance.test.ts
```

## Troubleshooting

### Common Issues

#### 1. High CPU Overhead
```typescript
// Check performance metrics
const perf = otel.getPerformanceMetrics();
if (perf.cpuOverheadPercent > 5) {
  console.warn('High CPU overhead detected:', perf);
}
```

#### 2. Missing Spans
```typescript
// Verify trace context injection
const headers = {};
tracing.injectTraceContext(headers);
console.log('Trace headers:', headers);
```

#### 3. Metrics Not Exporting
```typescript
// Check exporter configuration
const config = otel.getConfig();
console.log('Metrics endpoint:', config.metrics.endpoint);
console.log('Traces endpoint:', config.tracing.endpoint);
```

### Debug Mode
Enable debug logging for troubleshooting:

```bash
# Enable OpenTelemetry debug logging
OTEL_LOG_LEVEL=debug
OTEL_EXPORTER_OTLP_LOG_LEVEL=debug
```

## Best Practices

### 1. Sampling Strategy
- Use low sampling for high-volume endpoints (SSE: 1%)
- Use higher sampling for important operations (tools: 10%)
- Monitor sampling effectiveness and adjust as needed

### 2. Performance Monitoring
- Regularly check performance metrics
- Set up alerts for overhead limits
- Adjust configuration based on usage patterns

### 3. Resource Attributes
- Enable cloud resource detection for better observability
- Add custom attributes for service-specific context
- Use consistent naming conventions

### 4. Error Handling
- Always complete spans, even on errors
- Include relevant error context in spans
- Use appropriate status codes and messages

## API Reference

### OpenTelemetryInstrumentation

```typescript
class OpenTelemetryInstrumentation {
  constructor(config?: Partial<OpenTelemetryConfig>);
  async initialize(): Promise<void>;
  getMetrics(): MetricsCollector | undefined;
  getTracing(): TracingManager | undefined;
  getStreamingTracker(): StreamingTracker | undefined;
  getMiddleware(): OpenTelemetryMiddleware;
  getToolTracker(toolName: string): Function;
  getConfig(): OpenTelemetryConfig;
  isEnabled(): boolean;
  getPerformanceMetrics(): PerformanceMetrics;
  async shutdown(): Promise<void>;
}
```

### MetricsCollector

```typescript
class MetricsCollector {
  recordHttpRequest(method, route, statusCode, duration, responseSize?, userAgent?, remoteIp?, scheme?): void;
  incrementActiveRequests(attributes?): void;
  decrementActiveRequests(attributes?): void;
  recordToolExecution(toolName, duration, success, parameters?): void;
  incrementActiveExecutions(toolName: string): void;
  decrementActiveExecutions(toolName: string): void;
  recordStreamingMessage(connectionId, streamType, messageSize, messageType?): void;
  incrementActiveConnections(streamType, clientType?): void;
  decrementActiveConnections(streamType, clientType?): void;
  recordConnectionDuration(connectionId, streamType, duration): void;
  getMetricsSnapshot(): InstrumentationMetrics;
  getPerformanceMetrics(): PerformanceMetrics;
  async shutdown(): Promise<void>;
}
```

### TracingManager

```typescript
class TracingManager {
  startHttpSpan(method, url, headers, remoteIp?, remotePort?): Span;
  completeHttpSpan(span, statusCode, responseSize?, error?): void;
  startToolSpan(toolName, parameters?, parentContext?): Span;
  completeToolSpan(span, result?, error?, duration?): void;
  startStreamingSpan(streamType, connectionId, clientType?, parentContext?): Span;
  addStreamingEvent(span, eventType, messageSize?, messageCount?): void;
  completeStreamingSpan(span, totalMessages?, totalBytes?, duration?, error?): void;
  injectTraceContext(headers, context?): void;
  extractTraceContext(headers): Context;
  getCurrentTraceId(): string | undefined;
  getCurrentSpanId(): string | undefined;
  addAttributes(attributes): void;
  addEvent(name, attributes?): void;
  recordException(error): void;
}
```

## Contributing

When contributing to the OpenTelemetry implementation:

1. **Follow semantic conventions** for all metrics and traces
2. **Test performance impact** with any changes
3. **Update documentation** for new features
4. **Add comprehensive tests** for new functionality
5. **Consider backward compatibility** for configuration

## License

This OpenTelemetry implementation is part of the Task MCP HTTP server project and follows the same license terms.