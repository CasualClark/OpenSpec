/**
 * OpenTelemetry middleware for Fastify
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { TracingManager, TraceContext } from './tracing.js';
import { MetricsCollector } from './metrics.js';
import { OpenTelemetryConfig } from './types.js';

export interface OpenTelemetryMiddleware {
  onRequest: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  onResponse: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  onError: (request: FastifyRequest, reply: FastifyReply, error: Error) => Promise<void>;
}

export function createOpenTelemetryMiddleware(
  tracing: TracingManager,
  metrics: MetricsCollector,
  config: OpenTelemetryConfig
): OpenTelemetryMiddleware {
  return {
    onRequest: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!config.enabled) return;

      const startTime = Date.now();
      (request as any).otelStartTime = startTime;

      // Extract trace context from headers
      const headers = request.headers as Record<string, string>;
      const context = tracing.extractTraceContext(headers);

      // Start HTTP span
      const span = tracing.startHttpSpan(
        request.method,
        request.url,
        headers,
        request.ip,
        undefined // remote port not easily available
      );

      // Store span and context on request
      (request as any).otelSpan = span;
      (request as any).otelContext = context;

      // Increment active requests
      metrics.incrementActiveRequests({
        method: request.method,
        route: request.routeOptions?.url || request.url,
      });

      // Inject trace context for downstream calls
      tracing.injectTraceContext(headers);

      // Add trace info to request for logging
      (request as any).traceInfo = TraceContext.createLogTrace();
    },

    onResponse: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!config.enabled) return;

      const span = (request as any).otelSpan;
      const startTime = (request as any).otelStartTime;
      const duration = startTime ? Date.now() - startTime : 0;

      if (span) {
        tracing.completeHttpSpan(
          span,
          reply.statusCode,
          reply.raw.getHeader('content-length') as number || undefined
        );
      }

      // Record metrics
      metrics.recordHttpRequest(
        request.method,
        request.routeOptions?.url || request.url,
        reply.statusCode,
        duration,
        reply.raw.getHeader('content-length') as number || undefined,
        request.headers['user-agent'] as string,
        request.ip,
        request.protocol
      );

      // Decrement active requests
      metrics.decrementActiveRequests({
        method: request.method,
        route: request.routeOptions?.url || request.url,
      });
    },

    onError: async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
      if (!config.enabled) return;

      const span = (request as any).otelSpan;
      const startTime = (request as any).otelStartTime;
      const duration = startTime ? Date.now() - startTime : 0;

      if (span) {
        tracing.completeHttpSpan(
          span,
          reply.statusCode || 500,
          undefined,
          error
        );
      }

      // Record error metrics
      metrics.recordHttpRequest(
        request.method,
        request.routeOptions?.url || request.url,
        reply.statusCode || 500,
        duration,
        undefined,
        request.headers['user-agent'] as string,
        request.ip,
        request.protocol
      );

      // Decrement active requests
      metrics.decrementActiveRequests({
        method: request.method,
        route: request.routeOptions?.url || request.url,
      });
    },
  };
}

/**
 * Tool execution tracking decorator
 */
export function trackToolExecution(
  tracing: TracingManager,
  metrics: MetricsCollector,
  toolName: string
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const parameters = args[0]; // Assuming first argument is parameters
      
      // Start tool span
      const span = tracing.startToolSpan(toolName, parameters);
      metrics.incrementActiveExecutions(toolName);

      try {
        // Execute the original method
        const result = await originalMethod.apply(this, args);
        
        // Record success
        const duration = Date.now() - startTime;
        tracing.completeToolSpan(span, result, undefined, duration);
        metrics.recordToolExecution(toolName, duration, true, parameters);
        
        return result;
      } catch (error) {
        // Record error
        const duration = Date.now() - startTime;
        tracing.completeToolSpan(span, undefined, error as Error, duration);
        metrics.recordToolExecution(toolName, duration, false, parameters);
        
        throw error;
      } finally {
        metrics.decrementActiveExecutions(toolName);
      }
    };

    return descriptor;
  };
}

/**
 * Streaming connection tracking
 */
export class StreamingTracker {
  constructor(
    private tracing: TracingManager,
    private metrics: MetricsCollector,
    private config: OpenTelemetryConfig
  ) {}

  /**
   * Track a new streaming connection
   */
  startConnection(
    streamType: 'sse' | 'ndjson',
    connectionId: string,
    clientType?: string,
    parentContext?: any
  ) {
    if (!this.config.enabled) {
      return {
        addEvent: () => {},
        end: () => {},
      };
    }

    const span = this.tracing.startStreamingSpan(
      streamType,
      connectionId,
      clientType,
      parentContext
    );

    this.metrics.incrementActiveConnections(streamType, clientType);

    const startTime = Date.now();

    return {
      addEvent: (eventType: string, messageSize?: number, messageCount?: number) => {
        this.tracing.addStreamingEvent(span, eventType, messageSize, messageCount);
      },
      
      recordMessage: (messageSize: number, messageType?: string) => {
        this.metrics.recordStreamingMessage(connectionId, streamType, messageSize, messageType);
      },

      end: (error?: Error, totalMessages?: number, totalBytes?: number) => {
        const duration = Date.now() - startTime;
        
        this.tracing.completeStreamingSpan(
          span,
          totalMessages,
          totalBytes,
          duration,
          error
        );

        this.metrics.recordConnectionDuration(connectionId, streamType, duration);
        this.metrics.decrementActiveConnections(streamType, clientType);
      },
    };
  }
}

/**
 * Performance monitoring middleware
 */
export function createPerformanceMiddleware(
  metrics: MetricsCollector,
  config: OpenTelemetryConfig
) {
  return {
    onRequest: async (request: FastifyRequest) => {
      if (!config.enabled) return;
      (request as any).perfStartTime = process.hrtime.bigint();
    },
    
    onResponse: async (request: FastifyRequest) => {
      if (!config.enabled) return;
      
      const startTime = (request as any).perfStartTime;
      if (!startTime) return;
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      // Check if we're exceeding performance limits
      const perfMetrics = metrics.getPerformanceMetrics();
      
      if (duration > config.performance.maxLatencyImpactMs) {
        console.warn(`OpenTelemetry overhead exceeded: ${duration}ms > ${config.performance.maxLatencyImpactMs}ms`);
      }

      if (perfMetrics.cpuOverheadPercent > config.performance.maxCpuOverheadPercent) {
        console.warn(`OpenTelemetry CPU overhead exceeded: ${perfMetrics.cpuOverheadPercent}%`);
      }

      if (perfMetrics.memoryOverheadMb > config.performance.maxMemoryOverheadMb) {
        console.warn(`OpenTelemetry memory overhead exceeded: ${perfMetrics.memoryOverheadMb}MB`);
      }
    },
  };
}