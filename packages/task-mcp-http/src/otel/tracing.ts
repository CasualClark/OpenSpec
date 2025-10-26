/**
 * OpenTelemetry distributed tracing with semantic conventions
 */

import {
  trace,
  Span,
  SpanKind,
  SpanStatusCode,
  Context,
  ROOT_CONTEXT,
  SpanOptions,
  Attributes,
  propagation,
} from '@opentelemetry/api';
import {
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_ROUTE,
  SEMATTRS_HTTP_SCHEME,
  SEMATTRS_HTTP_TARGET,
  SEMATTRS_HTTP_USER_AGENT,
  SEMATTRS_HTTP_URL,
  SEMATTRS_NET_PEER_IP,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
import { OpenTelemetryConfig, SamplingDecision } from './types.js';

export class TracingManager {
  private tracer = trace.getTracer('task-mcp-http');
  private adaptiveSampler: AdaptiveSampler;

  constructor(private config: OpenTelemetryConfig) {
    this.adaptiveSampler = new AdaptiveSampler(config);
  }

  /**
   * Start an HTTP server span
   */
  startHttpSpan(
    method: string,
    url: string,
    headers: Record<string, string>,
    remoteIp?: string,
    remotePort?: number
  ): Span {
    const samplingDecision = this.adaptiveSampler.shouldSample('http', method, url);
    
    const spanOptions: SpanOptions = {
      kind: SpanKind.SERVER,
      attributes: {
        [SEMATTRS_HTTP_METHOD]: method,
        [SEMATTRS_HTTP_URL]: url,
        [SEMATTRS_HTTP_TARGET]: new URL(url).pathname,
        [SEMATTRS_HTTP_SCHEME]: new URL(url).protocol.slice(0, -1),
        ...(remoteIp && { [SEMATTRS_NET_PEER_IP]: remoteIp }),
        ...(remotePort && { [SEMATTRS_NET_PEER_PORT]: remotePort }),
        ...(headers['user-agent'] && { [SEMATTRS_HTTP_USER_AGENT]: headers['user-agent'] }),
        ...samplingDecision.attributes,
      },
    };

    const span = this.tracer.startSpan(`HTTP ${method}`, spanOptions);
    
    if (!samplingDecision.sampled) {
      // Make span a no-op if not sampled
      span.end();
      return this.tracer.startSpan(`HTTP ${method}`, { kind: SpanKind.SERVER });
    }

    return span;
  }

  /**
   * Complete an HTTP span with response information
   */
  completeHttpSpan(
    span: Span,
    statusCode: number,
    responseSize?: number,
    error?: Error
  ): void {
    span.setAttributes({
      [SEMATTRS_HTTP_STATUS_CODE]: statusCode,
      ...(responseSize && { 'http.response_content_length': responseSize }),
    });

    if (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    } else if (statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${statusCode}`,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.OK,
      });
    }

    span.end();
  }

  /**
   * Start a tool execution span
   */
  startToolSpan(
    toolName: string,
    parameters?: Record<string, any>,
    parentContext?: Context
  ): Span {
    const samplingDecision = this.adaptiveSampler.shouldSample('tool', toolName);
    
    const spanOptions: SpanOptions = {
      kind: SpanKind.INTERNAL,
      attributes: {
        tool_name: toolName,
        ...(parameters && { 
          tool_parameters_count: Object.keys(parameters).length,
          tool_parameters: JSON.stringify(parameters)
        }),
        ...samplingDecision.attributes,
      },
    };

    const context = parentContext || ROOT_CONTEXT;
    const span = this.tracer.startSpan(`tool.${toolName}`, spanOptions, context);
    
    if (!samplingDecision.sampled) {
      span.end();
      return this.tracer.startSpan(`tool.${toolName}`, { kind: SpanKind.INTERNAL }, context);
    }

    return span;
  }

  /**
   * Complete a tool execution span
   */
  completeToolSpan(
    span: Span,
    result?: any,
    error?: Error,
    duration?: number
  ): void {
    if (duration) {
      span.setAttribute('tool.execution_duration_ms', duration);
    }

    if (result) {
      span.setAttribute('tool.result_size', JSON.stringify(result).length);
      span.setAttribute('tool.success', true);
    }

    if (error) {
      span.recordException(error);
      span.setAttribute('tool.success', false);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.OK,
      });
    }

    span.end();
  }

  /**
   * Start a streaming span
   */
  startStreamingSpan(
    streamType: 'sse' | 'ndjson',
    connectionId: string,
    clientType?: string,
    parentContext?: Context
  ): Span {
    const samplingDecision = this.adaptiveSampler.shouldSample('streaming', streamType);
    
    const spanOptions: SpanOptions = {
      kind: SpanKind.SERVER,
      attributes: {
        stream_type: streamType,
        connection_id: connectionId,
        ...(clientType && { client_type: clientType }),
        ...samplingDecision.attributes,
      },
    };

    const context = parentContext || ROOT_CONTEXT;
    const span = this.tracer.startSpan(`streaming.${streamType}`, spanOptions, context);
    
    if (!samplingDecision.sampled) {
      span.end();
      return this.tracer.startSpan(`streaming.${streamType}`, { kind: SpanKind.SERVER }, context);
    }

    return span;
  }

  /**
   * Add streaming event to span
   */
  addStreamingEvent(
    span: Span,
    eventType: string,
    messageSize?: number,
    messageCount?: number
  ): void {
    span.addEvent(eventType, {
      ...(messageSize && { message_size: messageSize.toString() }),
      ...(messageCount && { message_count: messageCount.toString() }),
    });
  }

  /**
   * Complete a streaming span
   */
  completeStreamingSpan(
    span: Span,
    totalMessages?: number,
    totalBytes?: number,
    duration?: number,
    error?: Error
  ): void {
    if (duration) {
      span.setAttribute('stream.connection_duration_ms', duration);
    }

    if (totalMessages !== undefined) {
      span.setAttribute('stream.total_messages', totalMessages);
    }

    if (totalBytes !== undefined) {
      span.setAttribute('stream.total_bytes', totalBytes);
    }

    if (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.OK,
      });
    }

    span.end();
  }

  /**
   * Inject trace context into headers
   */
  injectTraceContext(headers: Record<string, string>): void {
    const span = trace.getActiveSpan();
    if (!span) return;

    const context = trace.setSpan(ROOT_CONTEXT, span);
    
    // Standard OpenTelemetry headers
    propagation.inject(context, headers, {
      set: (carrier: any, key: string, value: string) => {
        carrier[key] = value;
      },
    });

    // Add trace ID for correlation with logging
    const spanContext = span.spanContext();
    headers['x-trace-id'] = spanContext.traceId;
    headers['x-span-id'] = spanContext.spanId;
  }

  /**
   * Extract trace context from headers
   */
  extractTraceContext(headers: Record<string, string>): Context {
    try {
      return propagation.extract(headers, headers) as Context || ROOT_CONTEXT;
    } catch {
      return ROOT_CONTEXT;
    }
  }

  /**
   * Get current trace ID for logging correlation
   */
  getCurrentTraceId(): string | undefined {
    const span = trace.getActiveSpan();
    return span?.spanContext().traceId;
  }

  /**
   * Get current span ID for logging correlation
   */
  getCurrentSpanId(): string | undefined {
    const span = trace.getActiveSpan();
    return span?.spanContext().spanId;
  }

  /**
   * Add custom attributes to current span
   */
  addAttributes(attributes: Attributes): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  /**
   * Add event to current span
   */
  addEvent(name: string, attributes?: Attributes): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Record exception on current span
   */
  recordException(error: Error): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }
}

/**
 * Adaptive sampling for different types of operations
 */
class AdaptiveSampler {
  constructor(private config: OpenTelemetryConfig) {}

  shouldSample(
    operationType: 'http' | 'tool' | 'streaming',
    operationName?: string,
    url?: string
  ): SamplingDecision {
    let samplingRatio = this.config.tracing.sampling.default;

    // Adjust sampling based on operation type
    switch (operationType) {
      case 'http':
        if (url?.includes('/sse')) {
          samplingRatio = this.config.tracing.sampling.sse;
        } else if (url?.includes('/mcp')) {
          samplingRatio = this.config.tracing.sampling.ndjson;
        } else if (url?.includes('/health')) {
          samplingRatio = this.config.tracing.sampling.health;
        }
        break;
        
      case 'streaming':
        if (operationName === 'sse') {
          samplingRatio = this.config.tracing.sampling.sse;
        } else if (operationName === 'ndjson') {
          samplingRatio = this.config.tracing.sampling.ndjson;
        }
        break;
        
      case 'tool':
        // Use default sampling for tools
        break;
    }

    const sampled = Math.random() < samplingRatio;

    return {
      sampled,
      reason: sampled ? 'sampled' : 'not_sampled',
      attributes: {
        sampling_decision: sampled ? 'sampled' : 'not_sampled',
        sampling_ratio: samplingRatio.toString(),
        operation_type: operationType,
      },
    };
  }
}

/**
 * Trace context utilities
 */
export class TraceContext {
  /**
   * Create trace context for logging
   */
  static createLogTrace(): Record<string, string> {
    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();
    
    const context: Record<string, string> = {};
    
    if (spanContext?.traceId) {
      context.trace_id = spanContext.traceId;
    }
    
    if (spanContext?.spanId) {
      context.span_id = spanContext.spanId;
    }
    
    return context;
  }

  /**
   * Extract trace ID from request headers
   */
  static extractTraceId(headers: Record<string, string>): string | undefined {
    return headers['x-trace-id'] || headers['traceparent']?.split('-')[1];
  }

  /**
   * Check if request is sampled for tracing
   */
  static isSampled(headers: Record<string, string>): boolean {
    const traceparent = headers['traceparent'];
    if (!traceparent) return true; // Default to sampled if no traceparent
    
    const parts = traceparent.split('-');
    if (parts.length < 2) return true;
    
    const flags = parseInt(parts[1], 16);
    return (flags & 0x01) === 0x01; // Check sampled flag
  }
}