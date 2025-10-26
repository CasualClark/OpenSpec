# Task MCP HTTP Server - Comprehensive Instrumentation Specification

## Overview

This specification extends the base instrumentation requirements with detailed implementation guidance for the Task MCP HTTP server, integrating OpenTelemetry observability with existing Prometheus-style metrics and audit logging systems.

## 1. Core Architecture & Dependencies

### 1.1 Package Dependencies
```json
{
  "@opentelemetry/api": "^1.8.0",
  "@opentelemetry/sdk-node": "^0.51.0",
  "@opentelemetry/instrumentation": "^0.51.0",
  "@opentelemetry/instrumentation-fastify": "^0.40.0",
  "@opentelemetry/instrumentation-http": "^0.51.0",
  "@opentelemetry/exporter-otlp-http": "^0.51.0",
  "@opentelemetry/exporter-prometheus-remote-write": "^0.51.0",
  "@opentelemetry/resource-detector-alibaba-cloud": "^0.28.0",
  "@opentelemetry/resource-detector-aws": "^1.3.0",
  "@opentelemetry/resource-detector-gcp": "^0.29.0",
  "@opentelemetry/semantic-conventions": "^1.21.0"
}
```

### 1.2 Integration Strategy
- **Hybrid Mode**: Maintain existing Prometheus metrics while adding OpenTelemetry
- **Gradual Migration**: Dual export during transition period
- **Zero Downtime**: Existing health endpoints remain functional

## 2. OpenTelemetry Configuration

### 2.1 Service Resource Attributes
```typescript
const serviceResource = {
  'service.name': 'task-mcp',
  'service.version': process.env.npm_package_version || '1.0.0',
  'service.instance.id': process.env.HOSTNAME || 'unknown',
  'deployment.environment': process.env.NODE_ENV || 'development',
  'host.name': os.hostname(),
  'host.arch': process.arch,
  'process.pid': process.pid,
  'process.executable.name': 'task-mcp-http'
};
```

### 2.2 Initialization
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

const sdk = new NodeSDK({
  resource: new Resource(serviceResource),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_HTTP_ENDPOINT || 'http://localhost:4318/v1/traces'
  }),
  metricExporter: new PrometheusExporter({
    port: process.env.OTEL_EXPORTER_PROMETHEUS_PORT || 9464,
    endpoint: '/metrics'
  }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fastify': {
      enabled: true,
      requestHook: (span, request) => {
        // Custom request instrumentation
        span.setAttribute('http.route', request.routeOptions?.config?.url || request.url);
        span.setAttribute('http.method', request.method);
      }
    }
  })]
});

sdk.start();
```

## 3. Metrics Mapping & Implementation

### 3.1 Current Prometheus → OpenTelemetry Mapping

| Current Metric | OpenTelemetry Metric | Type | Implementation |
|---------------|---------------------|------|---------------|
| `http_requests_total` | `http.server.request.count` | Counter | Dual export |
| `http_request_duration_seconds` | `http.server.request.duration` | Histogram | Dual export |
| `tool_executions_total` | `taskmcp.tool.duration` + counters | Histogram | Enhanced with details |
| `health_check_status` | `taskmcp.health.check.status` | Gauge | OTel semantic |
| `auth_attempts_total` | `taskmcp.auth.attempts` | Counter | Security context |
| `rate_limit_hits_total` | `taskmcp.rate.limit.hits` | Counter | Transport label |

### 3.2 Enhanced Metrics Implementation

```typescript
import { MeterProvider, Counter, Histogram, Gauge } from '@opentelemetry/api';

const meter = metrics.getMeter('task-mcp');

// HTTP Server Metrics
const httpServerDuration = meter.createHistogram('http.server.request.duration', {
  description: 'Measures the duration of inbound HTTP requests',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 7.5, 10]
  }
});

const httpServerCount = meter.createCounter('http.server.request.count', {
  description: 'Number of incoming HTTP requests'
});

// Tool Execution Metrics
const toolDuration = meter.createHistogram('taskmcp.tool.duration', {
  description: 'Tool execution duration',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
  }
});

const toolSuccess = meter.createCounter('taskmcp.tool.success', {
  description: 'Successful tool executions'
});

const toolErrors = meter.createCounter('taskmcp.tool.errors', {
  description: 'Tool execution errors'
});

// Streaming Metrics
const streamConnections = meter.createGauge('taskmcp.stream.connections', {
  description: 'Active streaming connections'
});

const streamHeartbeats = meter.createCounter('taskmcp.stream.heartbeats', {
  description: 'Stream heartbeat events'
});

const streamBytesOut = meter.createCounter('taskmcp.stream.bytes_out', {
  description: 'Bytes sent via streams',
  unit: 'By'
});
```

### 3.3 Metric Attributes Schema

```typescript
interface MetricAttributes {
  // HTTP Attributes
  'http.method': string;
  'http.route': string;
  'http.status_code': number;
  'http.status_class': '1xx' | '2xx' | '3xx' | '4xx' | '5xx';
  'transport': 'sse' | 'ndjson' | 'stdio';
  'server.address': string;
  'server.port': number;
  
  // Tool Attributes
  'tool.name': string;
  'tool.status': 'success' | 'error';
  'tool.error.code': string;
  'tool.slug': string;
  
  // Security Attributes
  'auth.type': 'bearer' | 'cookie' | 'none';
  'auth.status': 'success' | 'failed';
  'rate_limited': boolean;
  
  // Service Attributes
  'service.name': string;
  'deployment.environment': string;
  'service.version': string;
}
```

## 4. Logging Enhancement

### 4.1 Structured Logging Integration

```typescript
import { trace } from '@opentelemetry/api';

interface EnhancedLogEntry {
  '@timestamp': string;
  'log.level': 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  
  // Service Context
  'service.name': string;
  'service.version': string;
  'env': string;
  
  // Request Context
  'request.id': string;
  'trace.id': string;
  'span.id': string;
  
  // HTTP Context
  'http.method': string;
  'http.route': string;
  'http.status_code'?: number;
  'http.user_agent'?: string;
  'http.client_ip'?: string;
  
  // Tool Context
  'tool.name'?: string;
  'tool.latency_ms'?: number;
  'tool.result.size'?: number;
  'tool.slug'?: string;
  
  // Streaming Context
  'bytesOut'?: number;
  'stream.type'?: 'sse' | 'ndjson';
  'stream.connection_id'?: string;
  
  // Error Context
  'error.code'?: string;
  'error.message'?: string;
  'error.stack'?: string;
  'error.type'?: string;
  
  // Security Context
  'auth.status'?: 'success' | 'failed';
  'auth.type'?: 'bearer' | 'cookie';
  'rate_limited'?: boolean;
  'client.address_hashed'?: string;
}
```

### 4.2 Request Correlation Middleware

```typescript
// Enhanced Fastify middleware for correlation
async function correlationMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const tracer = trace.getTracer('task-mcp');
  const span = tracer.startSpan('http.request', {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': request.method,
      'http.url': request.url,
      'http.target': request.url,
      'http.host': request.headers.host,
      'http.user_agent': request.headers['user-agent'],
      'http.scheme': request.protocol,
      'net.host.name': request.hostname,
      'net.host.port': request.port
    }
  });

  // Set trace context
  const traceId = span.spanContext().traceId;
  const spanId = span.spanContext().spanId;
  
  // Ensure request ID exists
  const requestId = request.id || uuidv4();
  
  // Add to request context
  request.traceId = traceId;
  request.spanId = spanId;
  request.correlationId = requestId;
  
  // Add to response headers
  reply.header('x-trace-id', traceId);
  reply.header('x-request-id', requestId);
  
  // Set as active span
  context.with(trace.setSpan(context.active(), span), async () => {
    try {
      await request.preHandler;
    } finally {
      span.end();
    }
  });
}
```

## 5. Error Handling & Normalization

### 5.1 HTTPError Integration

```typescript
import { HTTPError } from '../types';

function recordError(error: Error, span: Span, attributes: Record<string, any> = {}) {
  // Normalize different error types
  let errorType = 'unknown';
  let errorCode = 'INTERNAL_ERROR';
  let httpStatusCode = 500;

  if (error instanceof HTTPError) {
    errorType = 'HTTPError';
    errorCode = error.code;
    httpStatusCode = error.statusCode;
  } else if (error.name === 'ValidationError') {
    errorType = 'ValidationError';
    errorCode = 'INVALID_REQUEST';
    httpStatusCode = 400;
  } else if (error.name === 'TimeoutError') {
    errorType = 'TimeoutError';
    errorCode = 'TIMEOUT';
    httpStatusCode = 504;
  }

  // Record on span
  span.recordException(error);
  span.setAttributes({
    'error.type': errorType,
    'error.code': errorCode,
    'error.message': error.message,
    'http.status_code': httpStatusCode
  });
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });

  // Record error metric
  toolErrors.add(1, {
    'tool.name': attributes.toolName || 'unknown',
    'tool.error.code': errorCode,
    'error.type': errorType,
    'http.route': attributes.route || 'unknown'
  });

  return {
    errorType,
    errorCode,
    httpStatusCode
  };
}
```

### 5.2 Error Rate Sampling

```typescript
class ErrorRateSampler {
  private errorCounts = new Map<string, { count: number; lastHour: number }>();
  private readonly maxErrorsPerHour = 10;
  private readonly sampleRate = 0.1; // 10% after threshold

  shouldLogError(errorCode: string, requestId: string): boolean {
    const key = `${errorCode}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    const current = this.errorCounts.get(key) || { count: 0, lastHour: Date.now() };
    
    if (current.count < this.maxErrorsPerHour) {
      current.count++;
      this.errorCounts.set(key, current);
      return true;
    }
    
    // Sample at configured rate
    return Math.random() < this.sampleRate;
  }
}
```

## 6. Streaming Endpoint Instrumentation

### 6.1 SSE Stream Metrics

```typescript
class SSEInstrumentation {
  private activeConnections = new Set<string>();
  
  onConnectionStart(connectionId: string, requestId: string) {
    const tracer = trace.getTracer('task-mcp');
    const span = tracer.startSpan('sse.connection', {
      kind: SpanKind.SERVER,
      attributes: {
        'stream.type': 'sse',
        'stream.connection_id': connectionId,
        'request.id': requestId,
        'transport': 'sse'
      }
    });

    this.activeConnections.add(connectionId);
    streamConnections.add(this.activeConnections.size, { 'transport': 'sse' });
    
    // Log connection start
    logger.info({
      '@timestamp': new Date().toISOString(),
      'log.level': 'INFO',
      message: 'SSE connection started',
      'request.id': requestId,
      'stream.connection_id': connectionId,
      'stream.type': 'sse'
    });
    
    return span;
  }

  onHeartbeat(connectionId: string, bytes: number) {
    streamHeartbeats.add(1, { 'transport': 'sse' });
    streamBytesOut.add(bytes, { 'transport': 'sse' });
  }

  onConnectionEnd(connectionId: string, span: Span) {
    this.activeConnections.delete(connectionId);
    streamConnections.add(this.activeConnections.size, { 'transport': 'sse' });
    span.end();
  }
}
```

### 6.2 NDJSON Stream Instrumentation

```typescript
class NDJSONInstrumentation {
  recordChunkProcessed(requestId: string, chunkSize: number, processingTime: number) {
    const attributes = {
      'stream.type': 'ndjson',
      'request.id': requestId,
      'transport': 'ndjson'
    };

    // Record processing time
    const tracer = trace.getTracer('task-mcp');
    const span = tracer.startSpan('ndjson.chunk.process', {
      kind: SpanKind.INTERNAL,
      attributes
    });

    streamBytesOut.add(chunkSize, { 'transport': 'ndjson' });
    
    span.setAttributes({
      'chunk.size': chunkSize,
      'processing.time_ms': processingTime
    });
    span.end();
  }
}
```

## 7. Sampling Strategies

### 7.1 Configuration-Driven Sampling

```typescript
interface SamplingConfig {
  default: {
    trace: number; // 1.0 = 100%, 0.1 = 10%
    error: number;
  };
  highVolume: {
    sse: number; // Lower sampling for SSE
    ndjson: number;
  };
  adaptive: {
    enabled: boolean;
    maxTracesPerSecond: number;
  };
}

const samplingConfig: SamplingConfig = {
  default: {
    trace: 0.1, // 10% default sampling
    error: 1.0  // 100% error sampling
  },
  highVolume: {
    sse: 0.01,   // 1% for SSE connections
    ndjson: 0.05 // 5% for NDJSON streams
  },
  adaptive: {
    enabled: true,
    maxTracesPerSecond: 1000
  }
};
```

### 7.2 Adaptive Sampling Implementation

```typescript
class AdaptiveSampler {
  private traceCount = 0;
  private resetInterval: NodeJS.Timeout;

  constructor(private config: SamplingConfig) {
    this.resetInterval = setInterval(() => {
      this.traceCount = 0;
    }, 1000);
  }

  shouldSample(attributes: Record<string, any>): SamplingDecision {
    this.traceCount++;
    
    if (this.traceCount > this.config.adaptive.maxTracesPerSecond) {
      return { decision: SamplingDecision.DROP };
    }

    const transport = attributes['transport'];
    if (transport === 'sse') {
      return { decision: Math.random() < this.config.highVolume.sse ? 
        SamplingDecision.RECORD_AND_SAMPLE : SamplingDecision.DROP };
    }
    
    if (transport === 'ndjson') {
      return { decision: Math.random() < this.config.highVolume.ndjson ? 
        SamplingDecision.RECORD_AND_SAMPLE : SamplingDecision.DROP };
    }

    return { decision: Math.random() < this.config.default.trace ? 
      SamplingDecision.RECORD_AND_SAMPLE : SamplingDecision.DROP };
  }
}
```

## 8. Integration with Existing Systems

### 8.1 MetricsCollector Enhancement

```typescript
// Extend existing MetricsCollector to support OpenTelemetry
export class EnhancedMetricsCollector extends MetricsCollector {
  private otelMeter: Meter;
  private httpDuration: Histogram;
  private httpCount: Counter;
  private toolDuration: Histogram;

  constructor() {
    super();
    this.initializeOTelMetrics();
  }

  private initializeOTelMetrics() {
    this.otelMeter = metrics.getMeter('task-mcp-enhanced');
    
    this.httpDuration = this.otelMeter.createHistogram('http.server.request.duration', {
      unit: 's',
      advice: {
        explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
      }
    });

    this.httpCount = this.otelMeter.createCounter('http.server.request.count');
    this.toolDuration = this.otelMeter.createHistogram('taskmcp.tool.duration');
  }

  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    // Call existing implementation
    super.recordHttpRequest(method, route, statusCode, duration);

    // Add OpenTelemetry metrics
    const statusClass = this.getStatusClass(statusCode);
    
    this.httpCount.record(1, {
      'http.method': method,
      'http.route': route,
      'http.status_class': statusClass,
      'transport': this.determineTransport(route)
    });

    this.httpDuration.record(duration / 1000, {
      'http.method': method,
      'http.route': route,
      'http.status_class': statusClass,
      'transport': this.determineTransport(route)
    });
  }

  private getStatusClass(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return '2xx';
    if (statusCode >= 300 && statusCode < 400) return '3xx';
    if (statusCode >= 400 && statusCode < 500) return '4xx';
    if (statusCode >= 500) return '5xx';
    return 'unknown';
  }

  private determineTransport(route: string): 'sse' | 'ndjson' | 'stdio' {
    if (route.includes('/sse')) return 'sse';
    if (route.includes('/mcp')) return 'ndjson';
    return 'stdio';
  }
}
```

### 8.2 AuditLogger Integration

```typescript
// Enhance existing AuditLogger with OpenTelemetry
export class EnhancedAuditLogger extends AuditLogger {
  private tracer: Tracer;

  constructor(config: any) {
    super(config);
    this.tracer = trace.getTracer('task-mcp-audit');
  }

  logSecurityEvent(event: AuditEvent) {
    // Call existing implementation
    super.logSecurityEvent(event);

    // Add tracing
    const span = this.tracer.startSpan('security.audit', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'security.event.type': event.type,
        'security.event.success': event.success,
        'request.id': event.requestId,
        'client.address_hashed': this.hashClientIP(event.clientInfo.ipAddress)
      }
    });

    if (!event.success) {
      span.setAttributes({
        'security.failure.reason': event.reason,
        'security.error': event.error
      });
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    span.end();
  }

  private hashClientIP(ip: string): string {
    // Hash IP for privacy while maintaining correlation
    return crypto.createHash('sha256').update(ip + 'salt').digest('hex').substring(0, 8);
  }
}
```

## 9. Configuration Examples

### 9.1 Environment Variables

```bash
# OpenTelemetry Configuration
OTEL_SERVICE_NAME=task-mcp
OTEL_SERVICE_VERSION=1.0.0
OTEL_DEPLOYMENT_ENVIRONMENT=production
OTEL_EXPORTER_OTLP_HTTP_ENDPOINT=http://otel-collector:4318/v1/traces
OTEL_EXPORTER_PROMETHEUS_PORT=9464

# Sampling Configuration
OTEL_TRACE_SAMPLER=parentbased_always_on
OTEL_TRACE_SAMPLER_ARG=0.1

# Log Level Configuration
LOG_LEVEL=info
OTEL_LOG_LEVEL=info

# High Volume Sampling
SSE_SAMPLING_RATE=0.01
NDJSON_SAMPLING_RATE=0.05
ERROR_SAMPLING_RATE=1.0

# Metrics Configuration
METRICS_EXPORT_INTERVAL=30000
PROMETHEUS_ENABLED=true
OPENTELEMETRY_ENABLED=true
```

### 9.2 Fastify Plugin Configuration

```typescript
// src/instrumentation/plugin.ts
export const instrumentationPlugin = async (fastify: FastifyInstance, options: any) => {
  // Initialize OpenTelemetry
  await initializeTracing();

  // Register correlation middleware
  fastify.addHook('onRequest', correlationMiddleware);

  // Register metrics middleware
  fastify.addHook('onResponse', async (request, reply) => {
    const duration = reply.getResponseTime();
    const attributes = getMetricAttributes(request, reply);
    
    // Record metrics
    recordHttpRequestMetrics(request.method, request.routeOptions?.config?.url, 
                             reply.statusCode, duration, attributes);
    
    // Record span
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes({
        'http.status_code': reply.statusCode,
        'http.response_content_length': reply.getHeader('content-length'),
        'http.duration_ms': duration
      });
    }
  });

  // Register error handling
  fastify.setErrorHandler(async (error, request, reply) => {
    const span = trace.getActiveSpan();
    if (span) {
      recordError(error, span, {
        toolName: request.body?.tool,
        route: request.routeOptions?.config?.url
      });
    }

    // Log error with sampling
    if (shouldLogError(error)) {
      logger.error({
        '@timestamp': new Date().toISOString(),
        'log.level': 'ERROR',
        message: error.message,
        'request.id': request.id,
        'error.code': error.code || 'UNKNOWN',
        'error.stack': error.stack
      });
    }

    // Send standardized error response
    if (error instanceof HTTPError) {
      reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        hint: error.hint,
        requestId: request.id,
        traceId: request.traceId
      });
    } else {
      reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: request.id,
        traceId: request.traceId
      });
    }
  });
};
```

## 10. Migration Strategy

### 10.1 Phase 1: Dual Export (Week 1-2)
- Deploy OpenTelemetry alongside existing Prometheus metrics
- Enable both exporters in parallel
- Validate metric accuracy and performance impact
- Monitor increased overhead (<5% target)

### 10.2 Phase 2: Gradual Rollout (Week 3-4)
- Enable OpenTelemetry for 10% of traffic via feature flag
- Compare metrics between systems
- Fix schema mismatches and label inconsistencies
- Gradually increase traffic percentage

### 10.3 Phase 3: Full Migration (Week 5-6)
- Switch to OpenTelemetry primary export
- Keep Prometheus as backup for 30 days
- Update all dashboards and alerts
- Document deprecation timeline

### 10.4 Phase 4: Cleanup (Week 7-8)
- Remove legacy Prometheus metrics code
- Consolidate monitoring configuration
- Update documentation
- Retire dual export capability

## 11. Performance Considerations

### 11.1 Resource Usage Targets
- **CPU Overhead**: < 5% additional CPU usage
- **Memory Overhead**: < 50MB additional memory
- **Network Overhead**: < 1MB/s additional bandwidth
- **Latency Impact**: < 2ms additional request latency

### 11.2 Optimization Strategies
```typescript
// Batch metric updates
const metricBatch = new Map<string, number[]>();
const batchInterval = setInterval(() => {
  flushMetrics();
}, 5000);

// Async logging for high-volume events
const logQueue = new PQueue({ concurrency: 10, interval: 100 });

// Compression for trace exports
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_HTTP_ENDPOINT,
  compression: 'gzip',
  headers: {
    'Content-Encoding': 'gzip'
  }
});
```

## 12. Validation & Testing

### 12.1 Instrumentation Tests
```typescript
describe('OpenTelemetry Integration', () => {
  it('should record HTTP request metrics', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { tool: 'test' }
    });

    expect(response.statusCode).toBe(200);
    // Verify OpenTelemetry metrics recorded
    const metrics = await getMetrics();
    expect(metrics).toContain('http.server.request.duration');
  });

  it('should correlate logs with traces', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-request-id': 'test-123' }
    });

    const logs = await getLogs();
    const traceLogs = logs.filter(log => log['request.id'] === 'test-123');
    expect(traceLogs).toHaveLength.greaterThan(0);
    expect(traceLogs[0]).toHaveProperty('trace.id');
  });
});
```

### 12.2 Performance Tests
```typescript
describe('Instrumentation Performance', () => {
  it('should maintain performance under load', async () => {
    const start = Date.now();
    
    await Promise.all(Array(1000).fill(null).map(() => 
      app.inject({ method: 'POST', url: '/mcp', payload: { tool: 'ping' } })
    ));

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10000); // 10ms per request average
  });

  it('should limit memory growth', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Generate many spans
    for (let i = 0; i < 10000; i++) {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan(`test-${i}`);
      span.end();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = finalMemory - initialMemory;
    expect(growth).toBeLessThan(50 * 1024 * 1024); // 50MB limit
  });
});
```

This comprehensive specification provides the implementation details needed to instrument the Task MCP HTTP server with OpenTelemetry while maintaining compatibility with existing systems and ensuring production-ready performance characteristics.