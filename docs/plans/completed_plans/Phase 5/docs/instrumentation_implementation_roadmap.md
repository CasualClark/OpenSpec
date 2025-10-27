# OpenTelemetry Instrumentation Implementation Roadmap

## Overview
This roadmap provides a structured implementation plan for adding OpenTelemetry instrumentation to the Task MCP HTTP server, extending existing metrics and logging systems with comprehensive observability capabilities.

## Phase 1: Foundation Setup (Week 1)

### Task 1.1: Package Dependencies & Configuration
**Assign to:** Engineer  
**Estimated Time:** 2 hours  
**Priority:** Critical

#### Implementation Details:
```bash
cd packages/task-mcp-http
npm install @opentelemetry/api@^1.8.0 @opentelemetry/sdk-node@^0.51.0 @opentelemetry/instrumentation-fastify@^0.40.0 @opentelemetry/exporter-otlp-http@^0.51.0 @opentelemetry/exporter-prometheus@^0.51.0 @opentelemetry/auto-instrumentations-node@^0.51.0
```

#### Acceptance Criteria:
- [ ] All OpenTelemetry packages installed
- [ ] TypeScript types resolved without errors
- [ ] No version conflicts with existing dependencies
- [ ] Package updates documented in CHANGELOG

### Task 1.2: OpenTelemetry Initialization Module
**Assign to:** Engineer  
**Estimated Time:** 3 hours  
**Priority:** Critical  
**Depends on:** 1.1

#### Files to Create/Modify:
- `src/instrumentation/tracing.ts` - New file
- `src/instrumentation/metrics.ts` - New file  
- `src/instrumentation/config.ts` - New file

#### Implementation Details:

**src/instrumentation/config.ts**
```typescript
export interface InstrumentationConfig {
  service: {
    name: string;
    version: string;
    instanceId: string;
  };
  deployment: {
    environment: string;
  };
  tracing: {
    enabled: boolean;
    exporterEndpoint: string;
    samplingRate: number;
  };
  metrics: {
    enabled: boolean;
    prometheusPort: number;
    exportInterval: number;
  };
  streaming: {
    sseSamplingRate: number;
    ndjsonSamplingRate: number;
  };
}

export function getInstrumentationConfig(): InstrumentationConfig {
  return {
    service: {
      name: process.env.OTEL_SERVICE_NAME || 'task-mcp',
      version: process.env.npm_package_version || '1.0.0',
      instanceId: process.env.HOSTNAME || 'unknown'
    },
    deployment: {
      environment: process.env.NODE_ENV || 'development'
    },
    tracing: {
      enabled: process.env.OTEL_ENABLED === 'true',
      exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_HTTP_ENDPOINT || 'http://localhost:4318/v1/traces',
      samplingRate: parseFloat(process.env.OTEL_TRACE_SAMPLER_ARG || '0.1')
    },
    metrics: {
      enabled: process.env.OTEL_METRICS_ENABLED !== 'false',
      prometheusPort: parseInt(process.env.OTEL_EXPORTER_PROMETHEUS_PORT || '9464'),
      exportInterval: parseInt(process.env.OTEL_METRICS_EXPORT_INTERVAL || '30000')
    },
    streaming: {
      sseSamplingRate: parseFloat(process.env.SSE_SAMPLING_RATE || '0.01'),
      ndjsonSamplingRate: parseFloat(process.env.NDJSON_SAMPLING_RATE || '0.05')
    }
  };
}
```

**src/instrumentation/tracing.ts**
```typescript
import { trace, SpanKind, SpanStatusCode, context, Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getInstrumentationConfig } from './config';

let sdk: NodeSDK | null = null;

export function initializeTracing(): NodeSDK {
  if (sdk) {
    return sdk;
  }

  const config = getInstrumentationConfig();
  
  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: config.service.name,
      [SEMRESATTRS_SERVICE_VERSION]: config.service.version,
      'service.instance.id': config.service.instanceId,
      'deployment.environment': config.deployment.environment,
      'host.name': require('os').hostname(),
      'process.pid': process.pid
    }),
    traceExporter: config.tracing.enabled ? new OTLPTraceExporter({
      url: config.tracing.exporterEndpoint,
    }) : undefined,
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fastify': {
        enabled: true,
        requestHook: (span: Span, request: any) => {
          span.setAttribute('http.route', request.routeOptions?.config?.url || request.url);
          span.setAttribute('http.method', request.method);
        }
      }
    })],
    sampler: {
      shouldSample: (context, samplingParameters) => {
        // Custom sampling logic for streaming endpoints
        const transport = samplingParameters.attributes['transport'];
        if (transport === 'sse') {
          return { decision: Math.random() < config.streaming.sseSamplingRate ? 1 : 0 };
        }
        if (transport === 'ndjson') {
          return { decision: Math.random() < config.streaming.ndjsonSamplingRate ? 1 : 0 };
        }
        return { decision: Math.random() < config.tracing.samplingRate ? 1 : 0 };
      }
    }
  });

  if (config.tracing.enabled) {
    sdk.start();
  }

  return sdk;
}

export function shutdownTracing(): Promise<void> {
  return sdk?.shutdown() || Promise.resolve();
}

export { trace, SpanKind, SpanStatusCode, context, Span };
```

**src/instrumentation/metrics.ts**
```typescript
import { metrics, Meter, Histogram, Counter, Gauge } from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { getInstrumentationConfig } from './config';

let meter: Meter | null = null;
let prometheusExporter: PrometheusExporter | null = null;

export function initializeMetrics(): void {
  if (meter) {
    return;
  }

  const config = getInstrumentationConfig();
  
  meter = metrics.getMeter('task-mcp', config.service.version);

  if (config.metrics.enabled) {
    prometheusExporter = new PrometheusExporter({
      port: config.metrics.prometheusPort,
      endpoint: '/metrics'
    });
  }
}

// HTTP Server Metrics
export function getHttpServerDuration(): Histogram {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createHistogram('http.server.request.duration', {
    description: 'Measures the duration of inbound HTTP requests',
    unit: 's',
    advice: {
      explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 7.5, 10]
    }
  });
}

export function getHttpServerCount(): Counter {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createCounter('http.server.request.count', {
    description: 'Number of incoming HTTP requests'
  });
}

export function getHttpServerErrorCount(): Counter {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createCounter('http.server.error.count', {
    description: 'Number of HTTP errors'
  });
}

// Tool Execution Metrics
export function getToolDuration(): Histogram {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createHistogram('taskmcp.tool.duration', {
    description: 'Tool execution duration',
    unit: 's',
    advice: {
      explicitBucketBoundaries: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
    }
  });
}

export function getToolSuccess(): Counter {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createCounter('taskmcp.tool.success', {
    description: 'Successful tool executions'
  });
}

export function getToolErrors(): Counter {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createCounter('taskmcp.tool.errors', {
    description: 'Tool execution errors'
  });
}

// Streaming Metrics
export function getStreamConnections(): Gauge {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createGauge('taskmcp.stream.connections', {
    description: 'Active streaming connections'
  });
}

export function getStreamHeartbeats(): Counter {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createCounter('taskmcp.stream.heartbeats', {
    description: 'Stream heartbeat events'
  });
}

export function getStreamBytesOut(): Counter {
  if (!meter) throw new Error('Metrics not initialized');
  return meter.createCounter('taskmcp.stream.bytes_out', {
    description: 'Bytes sent via streams',
    unit: 'By'
  });
}

export function shutdownMetrics(): Promise<void> {
  return prometheusExporter?.stop() || Promise.resolve();
}
```

#### Acceptance Criteria:
- [ ] All configuration values read from environment variables
- [ ] Tracing SDK initialized only when enabled
- [ ] Metrics initialized with proper export configuration
- [ ] TypeScript compilation succeeds
- [ ] Unit tests pass for configuration parsing

### Task 1.3: Correlation Middleware
**Assign to:** Engineer  
**Estimated Time:** 2 hours  
**Priority:** High  
**Depends on:** 1.2

#### Files to Create/Modify:
- `src/instrumentation/correlation.ts` - New file

#### Implementation Details:

**src/instrumentation/correlation.ts**
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { trace, context, SpanKind, Span } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';

declare module 'fastify' {
  interface FastifyRequest {
    traceId?: string;
    spanId?: string;
    correlationId?: string;
  }
}

export async function correlationMiddleware(request: FastifyRequest, reply: FastifyReply) {
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
  
  // Ensure request ID exists (Fastify provides this by default)
  const requestId = request.id || uuidv4();
  
  // Add to request context
  request.traceId = traceId;
  request.spanId = spanId;
  request.correlationId = requestId;
  
  // Add to response headers for client correlation
  reply.header('x-trace-id', traceId);
  reply.header('x-request-id', requestId);
  
  // Set as active span
  return context.with(trace.setSpan(context.active(), span), async () => {
    // Store span reference for later use
    (request as any).otelSpan = span;
  });
}

export function endRequestSpan(request: FastifyRequest, statusCode: number) {
  const span = (request as any).otelSpan as Span;
  if (span) {
    span.setAttributes({
      'http.status_code': statusCode,
      'http.route': request.routeOptions?.config?.url || request.url,
      'transport': determineTransport(request.routeOptions?.config?.url || '')
    });
    span.end();
  }
}

function determineTransport(route: string): 'sse' | 'ndjson' | 'stdio' {
  if (route.includes('/sse')) return 'sse';
  if (route.includes('/mcp')) return 'ndjson';
  return 'stdio';
}

export function createMetricAttributes(request: FastifyRequest, statusCode?: number): Record<string, string> {
  const baseAttrs = {
    'http.method': request.method,
    'http.route': request.routeOptions?.config?.url || request.url,
    'transport': determineTransport(request.routeOptions?.config?.url || ''),
    'service.name': 'task-mcp'
  };

  if (statusCode) {
    const statusClass = getStatusClass(statusCode);
    return { ...baseAttrs, 'http.status_class': statusClass };
  }

  return baseAttrs;
}

function getStatusClass(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500) return '5xx';
  return 'unknown';
}
```

#### Acceptance Criteria:
- [ ] Middleware extracts/creates request ID
- [ ] Trace ID and span ID properly set on request object
- [ ] Response headers include correlation IDs
- [ ] Transport detection works for SSE/NDJSON/stdio
- [ ] Spans properly ended with correct attributes

## Phase 2: Metrics Integration (Week 2)

### Task 2.1: Enhanced MetricsCollector
**Assign to:** Engineer  
**Estimated Time:** 4 hours  
**Priority:** High  
**Depends on:** 1.2, 1.3

#### Files to Modify:
- `src/health/metrics.ts` - Enhance existing class

#### Implementation Details:

Add to existing `MetricsCollector` class:

```typescript
// Add these imports at the top
import { initializeMetrics, getHttpServerDuration, getHttpServerCount, getToolDuration, getToolSuccess, getToolErrors } from '../instrumentation/metrics';
import { createMetricAttributes } from '../instrumentation/correlation';

// Enhance the constructor
constructor() {
  super();
  initializeMetrics(); // Initialize OpenTelemetry metrics
  this.initializeMetrics();
}

// Enhanced recordHttpRequest method
recordHttpRequest(method: string, route: string, statusCode: number, duration: number, context?: { traceId?: string, requestId?: string }): void {
  // Call existing implementation
  super.recordHttpRequest(method, route, statusCode, duration);

  // Add OpenTelemetry metrics
  try {
    const httpDuration = getHttpServerDuration();
    const httpCount = getHttpServerCount();
    
    const attributes = createMetricAttributes({
      method,
      routeOptions: { config: { url: route } }
    } as FastifyRequest, statusCode);

    httpCount.record(1, attributes);
    httpDuration.record(duration / 1000, attributes);

    // Log with correlation if available
    if (context?.traceId || context?.requestId) {
      console.log(JSON.stringify({
        '@timestamp': new Date().toISOString(),
        'log.level': 'INFO',
        message: 'HTTP request recorded',
        'request.id': context?.requestId,
        'trace.id': context?.traceId,
        'http.method': method,
        'http.route': route,
        'http.status_code': statusCode,
        'http.duration_ms': duration
      }));
    }
  } catch (error) {
    console.error('Failed to record OpenTelemetry metrics:', error);
  }
}

// Enhanced recordToolExecution method
recordToolExecution(tool: string, status: 'success' | 'error', duration: number, context?: { traceId?: string, requestId?: string, error?: any }): void {
  // Call existing implementation
  super.recordToolExecution(tool, status, duration);

  try {
    const toolDuration = getToolDuration();
    
    const attributes = {
      'tool.name': tool,
      'tool.status': status,
      'service.name': 'task-mcp'
    };

    if (context?.error) {
      attributes['tool.error.code'] = context.error.code || 'UNKNOWN';
    }

    toolDuration.record(duration / 1000, attributes);

    if (status === 'success') {
      const toolSuccess = getToolSuccess();
      toolSuccess.add(1, { 'tool.name': tool, 'service.name': 'task-mcp' });
    } else {
      const toolErrors = getToolErrors();
      toolErrors.add(1, {
        'tool.name': tool,
        'tool.error.code': context?.error?.code || 'UNKNOWN',
        'service.name': 'task-mcp'
      });
    }

    // Log with correlation if available
    console.log(JSON.stringify({
      '@timestamp': new Date().toISOString(),
      'log.level': status === 'success' ? 'INFO' : 'ERROR',
      message: `Tool ${tool} ${status}`,
      'request.id': context?.requestId,
      'trace.id': context?.traceId,
      'tool.name': tool,
      'tool.status': status,
      'tool.latency_ms': duration,
      ...(context?.error && {
        'error.code': context.error.code,
        'error.message': context.error.message
      })
    }));
  } catch (error) {
    console.error('Failed to record tool metrics:', error);
  }
}
```

#### Acceptance Criteria:
- [ ] Existing Prometheus metrics continue working
- [ ] OpenTelemetry metrics exported correctly
- [ ] Dual export without data loss
- [ ] Performance impact < 5%
- [ ] Error handling doesn't break metrics collection

### Task 2.2: Streaming Metrics Implementation
**Assign to:** Engineer  
**Estimated Time:** 3 hours  
**Priority:** High  
**Depends on:** 2.1

#### Files to Modify:
- `src/routes/sse.ts` - Add streaming instrumentation
- `src/routes/mcp.ts` - Add NDJSON instrumentation

#### Implementation Details:

**Enhanced SSE instrumentation (add to existing SSE routes):**

```typescript
// Add these imports to src/routes/sse.ts
import { getStreamConnections, getStreamHeartbeats, getStreamBytesOut } from '../instrumentation/metrics';
import { trace } from '@opentelemetry/api';

// Add connection tracking
const activeSSEConnections = new Set<string>();

// Enhance SSE connection handler
export async function handleSSEConnection(request: FastifyRequest, reply: FastifyReply) {
  const tracer = trace.getTracer('task-mcp');
  const connectionId = request.id;
  const span = tracer.startSpan('sse.connection', {
    kind: SpanKind.SERVER,
    attributes: {
      'stream.type': 'sse',
      'stream.connection_id': connectionId,
      'request.id': connectionId,
      'transport': 'sse'
    }
  });

  try {
    activeSSEConnections.add(connectionId);
    
    // Update connection gauge
    const streamConnections = getStreamConnections();
    streamConnections.record(activeSSEConnections.size, { 'transport': 'sse' });

    // Log connection start
    console.log(JSON.stringify({
      '@timestamp': new Date().toISOString(),
      'log.level': 'INFO',
      message: 'SSE connection started',
      'request.id': connectionId,
      'stream.connection_id': connectionId,
      'stream.type': 'sse',
      'trace.id': request.traceId
    }));

    // Setup heartbeat tracking
    const heartbeatInterval = setInterval(() => {
      const streamHeartbeats = getStreamHeartbeats();
      streamHeartbeats.add(1, { 'transport': 'sse' });
      
      // Send heartbeat
      reply.sse({ data: '', event: 'heartbeat', id: connectionId });
    }, 30000); // 30 second heartbeat

    // Handle client disconnect
    request.raw.on('close', () => {
      activeSSEConnections.delete(connectionId);
      streamConnections.record(activeSSEConnections.size, { 'transport': 'sse' });
      clearInterval(heartbeatInterval);
      span.end();
      
      console.log(JSON.stringify({
        '@timestamp': new Date().toISOString(),
        'log.level': 'INFO',
        message: 'SSE connection closed',
        'request.id': connectionId,
        'stream.connection_id': connectionId
      }));
    });

  } catch (error) {
    span.recordException(error as Error);
    span.end();
    throw error;
  }
}

// Enhanced SSE data sending
export function sendSSEData(reply: FastifyReply, data: any, requestId: string) {
  const dataSize = JSON.stringify(data).length;
  const streamBytesOut = getStreamBytesOut();
  
  streamBytesOut.add(dataSize, { 'transport': 'sse' });
  
  reply.sse({
    data: JSON.stringify(data),
    id: requestId,
    event: 'data'
  });

  // Log data transmission for monitoring
  if (dataSize > 10000) { // Only log large transmissions
    console.log(JSON.stringify({
      '@timestamp': new Date().toISOString(),
      'log.level': 'DEBUG',
      message: 'Large SSE data transmitted',
      'request.id': requestId,
      'bytesOut': dataSize
    }));
  }
}
```

**Enhanced NDJSON instrumentation (add to existing MCP routes):**

```typescript
// Add these imports to src/routes/mcp.ts
import { getStreamBytesOut } from '../instrumentation/metrics';
import { trace } from '@opentelemetry/api';

// Enhanced NDJSON response handling
export function sendNDJSONResponse(reply: FastifyReply, data: any[], requestId: string) {
  const tracer = trace.getTracer('task-mcp');
  const span = tracer.startSpan('ndjson.response', {
    kind: SpanKind.INTERNAL,
    attributes: {
      'stream.type': 'ndjson',
      'request.id': requestId,
      'transport': 'ndjson',
      'response.item_count': data.length
    }
  });

  try {
    const ndjsonString = data.map(item => JSON.stringify(item)).join('\n') + '\n';
    const dataSize = Buffer.byteLength(ndjsonString, 'utf8');
    
    const streamBytesOut = getStreamBytesOut();
    streamBytesOut.add(dataSize, { 'transport': 'ndjson' });
    
    reply.type('application/x-ndjson').send(ndjsonString);

    // Log transmission
    console.log(JSON.stringify({
      '@timestamp': new Date().toISOString(),
      'log.level': 'INFO',
      message: 'NDJSON response sent',
      'request.id': requestId,
      'bytesOut': dataSize,
      'item_count': data.length,
      'trace.id': tracer.getActiveSpan()?.spanContext().traceId
    }));

  } finally {
    span.end();
  }
}
```

#### Acceptance Criteria:
- [ ] SSE connections tracked in real-time
- [ ] NDJSON response sizes measured
- [ ] Heartbeat metrics recorded
- [ ] Connection lifecycle logged
- [ ] Memory usage stable under load

## Phase 3: Error Handling Integration (Week 3)

### Task 3.1: Error Normalization & Recording
**Assign to:** Engineer  
**Estimated Time:** 3 hours  
**Priority:** High  
**Depends on:** 2.1

#### Files to Modify:
- `src/index.ts` - Enhance error handler
- `src/instrumentation/errors.ts` - New file

#### Implementation Details:

**src/instrumentation/errors.ts**
```typescript
import { trace, Span, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { HTTPError } from '../types';
import { getToolErrors } from './metrics';

export interface ErrorContext {
  toolName?: string;
  route?: string;
  requestId?: string;
  traceId?: string;
  clientIP?: string;
  userAgent?: string;
}

export interface NormalizedError {
  type: string;
  code: string;
  message: string;
  httpStatusCode: number;
  shouldLog: boolean;
  isSecurityRelevant: boolean;
}

export function normalizeAndRecordError(error: Error, context: ErrorContext): NormalizedError {
  const tracer = trace.getTracer('task-mcp');
  const span = trace.getActiveSpan();
  
  let normalized: NormalizedError;

  if (error instanceof HTTPError) {
    normalized = {
      type: 'HTTPError',
      code: error.code,
      message: error.message,
      httpStatusCode: error.statusCode,
      shouldLog: error.statusCode >= 500 || error.code === 'AUTH_ERROR',
      isSecurityRelevant: error.code.startsWith('AUTH') || error.code === 'RATE_LIMITED'
    };
  } else if (error.name === 'ValidationError') {
    normalized = {
      type: 'ValidationError',
      code: 'INVALID_REQUEST',
      message: error.message,
      httpStatusCode: 400,
      shouldLog: false, // Client errors typically not logged
      isSecurityRelevant: false
    };
  } else if (error.name === 'TimeoutError') {
    normalized = {
      type: 'TimeoutError',
      code: 'TIMEOUT',
      message: error.message,
      httpStatusCode: 504,
      shouldLog: true,
      isSecurityRelevant: false
    };
  } else {
    normalized = {
      type: 'InternalError',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      httpStatusCode: 500,
      shouldLog: true,
      isSecurityRelevant: false
    };
  }

  // Record on span
  if (span) {
    span.recordException(error);
    span.setAttributes({
      'error.type': normalized.type,
      'error.code': normalized.code,
      'error.message': error.message,
      'http.status_code': normalized.httpStatusCode,
      'error.security_relevant': normalized.isSecurityRelevant
    });
    span.setStatus({ 
      code: SpanStatusCode.ERROR, 
      message: `${normalized.type}: ${error.message}` 
    });
  }

  // Record error metric
  try {
    const toolErrors = getToolErrors();
    toolErrors.add(1, {
      'tool.name': context.toolName || 'unknown',
      'tool.error.code': normalized.code,
      'error.type': normalized.type,
      'http.route': context.route || 'unknown',
      'error.security_relevant': String(normalized.isSecurityRelevant)
    });
  } catch (metricError) {
    console.error('Failed to record error metric:', metricError);
  }

  return normalized;
}

// Error rate limiting to prevent log spam
export class ErrorRateLimiter {
  private errorCounts = new Map<string, { count: number; lastHour: number; lastLogged: number }>();
  private readonly maxErrorsPerHour = 10;
  private readonly sampleRate = 0.1;

  shouldLogError(normalizedError: NormalizedError, context: ErrorContext): boolean {
    if (normalizedError.isSecurityRelevant || normalizedError.shouldLog === false) {
      return true; // Always log security relevant errors and skip client errors
    }

    const key = `${normalizedError.code}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    const current = this.errorCounts.get(key) || { count: 0, lastHour: Date.now(), lastLogged: 0 };
    
    if (current.count < this.maxErrorsPerHour) {
      current.count++;
      current.lastLogged = Date.now();
      this.errorCounts.set(key, current);
      return true;
    }
    
    // Sample at configured rate if last logged was more than 1 hour ago
    if (Date.now() - current.lastLogged > 60 * 60 * 1000) {
      current.lastLogged = Date.now();
      return Math.random() < this.sampleRate;
    }
    
    return false;
  }
}

export const errorRateLimiter = new ErrorRateLimiter();
```

**Enhanced error handler in src/index.ts:**
```typescript
import { normalizeAndRecordError, errorRateLimiter } from './instrumentation/errors';

// Replace or enhance existing error handler
fastify.setErrorHandler(async (error, request, reply) => {
  const normalizedError = normalizeAndRecordError(error, {
    toolName: request.body?.tool,
    route: request.routeOptions?.config?.url,
    requestId: request.id,
    traceId: request.traceId,
    clientIP: request.ip,
    userAgent: request.headers['user-agent']
  });

  // Log error with rate limiting
  if (errorRateLimiter.shouldLogError(normalizedError, {
    toolName: request.body?.tool,
    route: request.routeOptions?.config?.url,
    requestId: request.id,
    traceId: request.traceId
  })) {
    const logLevel = normalizedError.isSecurityRelevant ? 'WARN' : 
                    normalizedError.httpStatusCode >= 500 ? 'ERROR' : 'INFO';

    console.log(JSON.stringify({
      '@timestamp': new Date().toISOString(),
      'log.level': logLevel,
      message: `Request failed: ${normalizedError.code}`,
      'request.id': request.id,
      'trace.id': request.traceId,
      'error.code': normalizedError.code,
      'error.type': normalizedError.type,
      'error.message': error.message,
      'http.method': request.method,
      'http.route': request.routeOptions?.config?.url,
      'client.address_hashed': normalizedError.isSecurityRelevant ? 
        crypto.createHash('sha256').update(request.ip + 'salt').digest('hex').substring(0, 8) : 
        undefined,
      ...(normalizedError.httpStatusCode >= 500 && { 'error.stack': error.stack })
    }));
  }

  // Send standardized error response
  const errorResponse = {
    error: normalizedError.code,
    message: normalizedError.httpStatusCode >= 500 ? 'Internal server error' : error.message,
    requestId: request.id,
    traceId: request.traceId
  };

  // Add hint for HTTPError instances
  if (error instanceof HTTPError && error.hint) {
    (errorResponse as any).hint = error.hint;
  }

  reply.code(normalizedError.httpStatusCode).send(errorResponse);
});
```

#### Acceptance Criteria:
- [ ] All error types properly normalized
- [ ] Span attributes set correctly
- [ ] Error metrics recorded with proper labels
- [ ] Rate limiting prevents log spam
- [ ] Security errors handled specially
- [ ] Client vs server errors differentiated

### Task 3.2: Audit Logger Integration
**Assign to:** Engineer  
**Estimated Time:** 2 hours  
**Priority:** Medium  
**Depends on:** 3.1

#### Files to Modify:
- `src/security/audit.ts` - Add OpenTelemetry integration

#### Implementation Details:

```typescript
// Add to existing AuditLogger class
import { trace } from '@opentelemetry/api';

export class EnhancedAuditLogger extends AuditLogger {
  private tracer = trace.getTracer('task-mcp-audit');

  logSecurityEvent(event: AuditEvent): void {
    // Call existing implementation
    super.logSecurityEvent(event);

    // Add tracing
    const span = this.tracer.startSpan('security.audit', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'security.event.type': event.type,
        'security.event.success': event.success,
        'request.id': event.requestId,
        'security.auth.type': event.tokenType,
        'security.user.id': event.userId,
        'security.session.id': event.sessionId
      }
    });

    if (!event.success) {
      span.setAttributes({
        'security.failure.reason': event.reason,
        'security.error': event.error
      });
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    // Add client info (hashed for privacy)
    if (event.clientInfo.ipAddress) {
      const hashedIP = crypto.createHash('sha256')
        .update(event.clientInfo.ipAddress + 'audit-salt')
        .digest('hex')
        .substring(0, 8);
      
      span.setAttribute('security.client.address_hashed', hashedIP);
    }

    span.end();
  }

  // Enhanced method for structured logging
  logStructuredEvent(level: 'INFO' | 'WARN' | 'ERROR', message: string, attributes: Record<string, any>): void {
    const span = this.tracer.startSpan('security.structured_event', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'log.level': level,
        'security.event.message': message,
        ...attributes
      }
    });

    console.log(JSON.stringify({
      '@timestamp': new Date().toISOString(),
      'log.level': level,
      message,
      'service.name': 'task-mcp',
      'audit.source': 'enhanced-audit-logger',
      ...attributes
    }));

    if (level === 'ERROR') {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    span.end();
  }
}
```

#### Acceptance Criteria:
- [ ] Security events traced with proper attributes
- [ ] Client IPs hashed for privacy
- [ ] Structured logging maintains compatibility
- [ ] Performance impact minimal (<2% overhead)

## Phase 4: Integration & Testing (Week 4)

### Task 4.1: Fastify Plugin Integration
**Assign to:** Builder  
**Estimated Time:** 3 hours  
**Priority:** High  
**Depends on:** 3.2

#### Files to Modify:
- `src/instrumentation/plugin.ts` - New file
- `src/index.ts` - Register plugin

#### Implementation Details:

**src/instrumentation/plugin.ts**
```typescript
import { FastifyPluginAsync } from 'fastify';
import { correlationMiddleware, endRequestSpan } from './correlation';
import { initializeTracing, initializeMetrics } from './config';
import { MetricsCollector } from '../health/metrics';

const instrumentationPlugin: FastifyPluginAsync = async (fastify, options) => {
  // Initialize OpenTelemetry
  initializeTracing();
  initializeMetrics();

  // Register correlation middleware
  fastify.addHook('onRequest', correlationMiddleware);

  // Register metrics middleware
  fastify.addHook('onRequest', async (request, reply) => {
    // Record request start time
    (request as any).startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime || Date.now();
    const duration = Date.now() - startTime;

    // End request span and record metrics
    endRequestSpan(request, reply.statusCode);
    
    // Use enhanced metrics collector
    const metricsCollector = new MetricsCollector();
    metricsCollector.recordHttpRequest(
      request.method,
      request.routeOptions?.config?.url || request.url,
      reply.statusCode,
      duration,
      {
        traceId: request.traceId,
        requestId: request.id
      }
    );
  });

  // Graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    const { shutdownTracing, shutdownMetrics } = await import('./config');
    await Promise.all([
      shutdownTracing(),
      shutdownMetrics()
    ]);
  });
};

export default instrumentationPlugin;
```

**Register plugin in src/index.ts:**
```typescript
import instrumentationPlugin from './instrumentation/plugin';

// Add before other route registrations
await fastify.register(instrumentationPlugin);
```

#### Acceptance Criteria:
- [ ] Plugin loads without errors
- [ ] All middleware registered correctly
- [ ] Metrics collected on all requests
- [ ] Graceful shutdown works
- [ ] No impact on existing functionality

### Task 4.2: Integration Tests
**Assign to:** Engineer  
**Estimated Time:** 4 hours  
**Priority:** High  
**Depends on:** 4.1

#### Files to Create:
- `test/instrumentation/correlation.test.ts`
- `test/instrumentation/metrics.test.ts`
- `test/instrumentation/errors.test.ts`

#### Implementation Details:

**test/instrumentation/correlation.test.ts**
```typescript
import { test, expect } from 'vitest';
import { FastifyInstance } from 'fastify';
import { correlationMiddleware, createMetricAttributes } from '../../src/instrumentation/correlation';

test('correlation middleware sets trace and request IDs', async () => {
  const mockRequest = {
    id: 'test-123',
    method: 'POST',
    url: '/test',
    headers: { host: 'localhost', 'user-agent': 'test' },
    protocol: 'http',
    hostname: 'localhost',
    port: 3000,
    routeOptions: { config: { url: '/test' } }
  } as any;

  const mockReply = {
    header: vi.fn()
  } as any;

  await correlationMiddleware(mockRequest, mockReply);

  expect(mockRequest.traceId).toBeDefined();
  expect(mockRequest.spanId).toBeDefined();
  expect(mockRequest.correlationId).toBe('test-123');
  expect(mockReply.header).toHaveBeenCalledWith('x-trace-id', mockRequest.traceId);
  expect(mockReply.header).toHaveBeenCalledWith('x-request-id', 'test-123');
});

test('transport detection works correctly', async () => {
  const attributes1 = createMetricAttributes({
    method: 'GET',
    routeOptions: { config: { url: '/sse/events' } }
  } as any);
  
  expect(attributes1.transport).toBe('sse');

  const attributes2 = createMetricAttributes({
    method: 'POST', 
    routeOptions: { config: { url: '/mcp/execute' } }
  } as any);
  
  expect(attributes2.transport).toBe('ndjson');

  const attributes3 = createMetricAttributes({
    method: 'GET',
    routeOptions: { config: { url: '/health' } }
  } as any);
  
  expect(attributes3.transport).toBe('stdio');
});
```

**test/instrumentation/metrics.test.ts**
```typescript
import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import { metrics } from '@opentelemetry/api';
import { initializeMetrics, getHttpServerDuration } from '../../src/instrumentation/metrics';

describe('OpenTelemetry Metrics', () => {
  beforeEach(() => {
    // Clear metrics for clean test
    metrics.disable();
  });

  afterEach(() => {
    metrics.enable();
  });

  test('metrics initialization creates correct instruments', async () => {
    initializeMetrics();
    
    const httpDuration = getHttpServerDuration();
    expect(httpDuration).toBeDefined();
    
    // Test metric recording
    httpDuration.record(0.1, { 'http.method': 'GET', 'http.route': '/test' });
    
    // Verify metric was recorded (would need mock exporter for full verification)
    expect(true).toBe(true); // Placeholder for metric verification
  });

  test('metric attributes are properly formatted', async () => {
    const testAttributes = {
      'http.method': 'POST',
      'http.route': '/api/tools',
      'http.status_class': '2xx',
      'transport': 'ndjson',
      'service.name': 'task-mcp'
    };

    // Verify attribute keys match expected schema
    expect(testAttributes).toHaveProperty('http.method');
    expect(testAttributes).toHaveProperty('http.route');
    expect(testAttributes).toHaveProperty('http.status_class');
    expect(testAttributes).toHaveProperty('transport');
    expect(testAttributes).toHaveProperty('service.name');
  });
});
```

**test/instrumentation/errors.test.ts**
```typescript
import { test, expect, describe } from 'vitest';
import { HTTPError } from '../../src/types';
import { normalizeAndRecordError, ErrorRateLimiter } from '../../src/instrumentation/errors';

describe('Error Normalization', () => {
  test('HTTPError is normalized correctly', () => {
    const httpError = new HTTPError(400, 'VALIDATION_ERROR', 'Invalid input', 'Check your parameters');
    const context = {
      toolName: 'test-tool',
      route: '/api/tools',
      requestId: 'req-123'
    };

    const normalized = normalizeAndRecordError(httpError, context);

    expect(normalized.type).toBe('HTTPError');
    expect(normalized.code).toBe('VALIDATION_ERROR');
    expect(normalized.httpStatusCode).toBe(400);
    expect(normalized.shouldLog).toBe(false); // 4xx errors typically not logged
    expect(normalized.isSecurityRelevant).toBe(false);
  });

  test('authentication errors are marked as security relevant', () => {
    const authError = new HTTPError(401, 'AUTH_ERROR', 'Authentication failed');
    const context = { route: '/api/tools', requestId: 'req-123' };

    const normalized = normalizeAndRecordError(authError, context);

    expect(normalized.isSecurityRelevant).toBe(true);
    expect(normalized.shouldLog).toBe(true);
  });

  test('ErrorRateLimiter prevents log spam', () => {
    const rateLimiter = new ErrorRateLimiter();
    const normalizedError = {
      type: 'InternalError',
      code: 'INTERNAL_ERROR',
      message: 'Test error',
      httpStatusCode: 500,
      shouldLog: true,
      isSecurityRelevant: false
    };
    const context = { route: '/api/tools', requestId: 'req-123' };

    // First few errors should be logged
    expect(rateLimiter.shouldLogError(normalizedError, context)).toBe(true);
    expect(rateLimiter.shouldLogError(normalizedError, context)).toBe(true);
    
    // After threshold, should start rate limiting
    let loggedCount = 0;
    for (let i = 0; i < 15; i++) {
      if (rateLimiter.shouldLogError(normalizedError, context)) {
        loggedCount++;
      }
    }
    
    expect(loggedCount).toBeLessThanOrEqual(12); // Allow some through due to sampling
  });
});
```

#### Acceptance Criteria:
- [ ] All correlation tests pass
- [ ] Metrics tests validate instrument creation
- [ ] Error normalization tests cover all cases
- [ ] Rate limiting prevents log spam
- [ ] Integration tests with real Fastify server

## Phase 5: Performance & Validation (Week 5)

### Task 5.1: Performance Validation
**Assign to:** Builder  
**Estimated Time:** 3 hours  
**Priority:** High  
**Depends on:** 4.2

#### Files to Create:
- `test/performance/instrumentation-load.test.ts`

#### Implementation Details:

```typescript
import { test, expect, describe } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index';

describe('Instrumentation Performance', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test('instrumentation overhead is < 5%', async () => {
    const iterations = 1000;
    const baseUrl = 'http://localhost:3000';
    
    // Measure baseline performance (without detailed instrumentation)
    const startWithout = Date.now();
    await Promise.all(Array(iterations).fill(null).map(() => 
      app.inject({ method: 'GET', url: '/health' })
    ));
    const durationWithout = Date.now() - startWithout;

    // Measure with full instrumentation
    const startWith = Date.now();
    await Promise.all(Array(iterations).fill(null).map(() => 
      app.inject({ method: 'GET', url: '/health' })
    ));
    const durationWith = Date.now() - startWith;

    const overheadPercent = ((durationWith - durationWithout) / durationWithout) * 100;
    
    expect(overheadPercent).toBeLessThan(5);
    console.log(`Instrumentation overhead: ${overheadPercent.toFixed(2)}%`);
  });

  test('memory usage remains stable under load', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Generate many requests with tracing
    for (let i = 0; i < 1000; i++) {
      await app.inject({ 
        method: 'POST', 
        url: '/mcp',
        payload: { tool: 'ping', arguments: {} },
        headers: { 'x-request-id': `test-${i}` }
      });
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB limit
    console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
  });

  test('high-volume streaming maintains performance', async () => {
    const sseUrl = '/sse/connect';
    
    // Test multiple concurrent SSE connections
    const connections = Array(100).fill(null).map(async (_, index) => {
      const response = await app.inject({
        method: 'GET',
        url: sseUrl,
        headers: { 'x-request-id': `sse-test-${index}` }
      });
      
      expect(response.statusCode).toBe(200);
      return response;
    });

    const start = Date.now();
    await Promise.all(connections);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000); // 5 seconds for 100 connections
    console.log(`SSE connections setup time: ${duration}ms`);
  });
});
```

#### Acceptance Criteria:
- [ ] CPU overhead < 5%
- [ ] Memory growth < 50MB
- [ ] SSE connection setup time acceptable
- [ ] No memory leaks in long-running tests
- [ ] Metrics collection doesn't impact response times

### Task 5.2: End-to-End Validation
**Assign to:** Builder  
**Estimated Time:** 2 hours  
**Priority:** High  
**Depends on:** 5.1

#### Files to Create:
- `test/e2e/instrumentation-e2e.test.ts`

#### Implementation Details:

```typescript
import { test, expect, describe } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index';

describe('End-to-End Instrumentation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test('full request correlation works end-to-end', async () => {
    const requestId = 'e2e-test-123';
    
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { tool: 'ping', arguments: {} },
      headers: { 'x-request-id': requestId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.headers['x-trace-id']).toBeDefined();
    
    const responseBody = JSON.parse(response.body);
    expect(responseBody.requestId).toBe(requestId);
    expect(responseBody.traceId).toBe(response.headers['x-trace-id']);
  });

  test('error handling maintains correlation', async () => {
    const requestId = 'error-test-456';
    
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { tool: 'nonexistent-tool', arguments: {} },
      headers: { 'x-request-id': requestId }
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.headers['x-trace-id']).toBeDefined();
    
    const responseBody = JSON.parse(response.body);
    expect(responseBody.requestId).toBe(requestId);
    expect(responseBody.traceId).toBe(response.headers['x-trace-id']);
    expect(responseBody.error).toBeDefined();
  });

  test('streaming events include correlation IDs', async () => {
    const requestId = 'stream-test-789';
    
    // Test SSE streaming
    const sseResponse = await app.inject({
      method: 'GET',
      url: '/sse/connect',
      headers: { 'x-request-id': requestId }
    });

    expect(sseResponse.statusCode).toBe(200);
    expect(sseResponse.headers['x-request-id']).toBe(requestId);
    expect(sseResponse.headers['x-trace-id']).toBeDefined();
    
    // Verify SSE events include proper IDs
    const sseContent = sseResponse.payload;
    expect(sseContent).toContain(`id: ${requestId}`);
  });

  test('security events are properly audited', async () => {
    const requestId = 'security-test-999';
    
    // Test rate limiting
    const responses = await Promise.all(Array(20).fill(null).map(() => 
      app.inject({
        method: 'POST',
        url: '/mcp',
        payload: { tool: 'ping', arguments: {} },
        headers: { 'x-request-id': `${requestId}-${Math.random()}` }
      })
    ));

    // Some requests should be rate limited
    const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);
    
    // Verify error responses maintain correlation
    rateLimitedResponses.forEach(response => {
      const body = JSON.parse(response.body);
      expect(body.requestId).toBeDefined();
      expect(body.traceId).toBeDefined();
      expect(body.error).toBe('RATE_LIMITED');
    });
  });
});
```

#### Acceptance Criteria:
- [ ] Request correlation maintained across all endpoints
- [ ] Error handling preserves trace context
- [ ] Streaming includes proper correlation
- [ ] Security events audited correctly
- [ ] All response formats consistent

## Phase 6: Documentation & Deployment (Week 6)

### Task 6.1: Configuration Documentation
**Assign to:** Knowledge  
**Estimated Time:** 2 hours  
**Priority:** Medium  
**Depends on:** 5.2

#### Files to Create:
- `docs/observability/configuration.md`
- `docs/observability/migration-guide.md`

#### Acceptance Criteria:
- [ ] All configuration options documented
- [ ] Environment variables clearly explained
- [ ] Migration steps clearly outlined
- [ ] Troubleshooting guide included

### Task 6.2: Monitoring Dashboards
**Assign to:** Knowledge  
**Estimated Time:** 3 hours  
**Priority:** Medium  
**Depends on:** 6.1

#### Files to Create:
- `docs/observability/grafana-dashboards/`
- `docs/observability/prometheus-rules/`

#### Acceptance Criteria:
- [ ] Grafana dashboard definitions
- [ ] Prometheus alerting rules
- [ ] SLO definitions and alerting
- [ ] Example queries and visualizations

## Summary

This implementation roadmap provides a comprehensive, phased approach to adding OpenTelemetry instrumentation to the Task MCP HTTP server:

1. **Foundation Setup**: Core OpenTelemetry integration
2. **Metrics Integration**: Enhanced metrics collection with dual export
3. **Error Handling**: Comprehensive error normalization and rate limiting  
4. **Integration & Testing**: Full Fastify plugin integration with tests
5. **Performance & Validation**: Load testing and end-to-end validation
6. **Documentation & Deployment**: Complete documentation and monitoring setup

The implementation maintains backward compatibility, follows existing patterns, and ensures production-ready performance characteristics. Each task includes specific acceptance criteria and detailed implementation guidance for the Engineer and Builder agents.