/**
 * OpenTelemetry metrics collection with semantic conventions
 */

import {
  Meter,
  MeterProvider,
  Counter,
  Histogram,
  UpDownCounter,
  Attributes,
} from '@opentelemetry/api';
import {
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_ROUTE,
  SEMATTRS_HTTP_SCHEME,
  SEMATTRS_HTTP_USER_AGENT,
  SEMATTRS_NET_PEER_IP,
  SEMRESATTRS_PROCESS_PID,
  SEMRESATTRS_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';
import { OpenTelemetryConfig, InstrumentationMetrics } from './types.js';

export class MetricsCollector {
  private meter: Meter;
  private metrics: Map<string, Counter | Histogram | UpDownCounter> = new Map();
  private performanceMonitor?: PerformanceMonitor;

  constructor(meterProvider: MeterProvider, private config: OpenTelemetryConfig) {
    this.meter = meterProvider.getMeter('task-mcp-http');
    this.initializeMetrics();
    
    if (config.enabled) {
      this.performanceMonitor = new PerformanceMonitor(config);
    }
  }

  /**
   * Initialize all metrics with semantic conventions
   */
  private initializeMetrics(): void {
    // HTTP Server Metrics
    this.createCounter('http_server_requests_total', 'Total HTTP requests');
    this.createHistogram('http_server_request_duration', 'HTTP request duration');
    this.createUpDownCounter('http_server_active_requests', 'Active HTTP requests');
    this.createHistogram('http_server_response_size', 'HTTP response size');

    // Tool Execution Metrics
    this.createCounter('tool_executions_total', 'Total tool executions');
    this.createHistogram('tool_execution_duration', 'Tool execution duration');
    this.createUpDownCounter('tool_active_executions', 'Active tool executions');
    this.createCounter('tool_errors_total', 'Total tool errors');

    // Streaming Metrics
    this.createUpDownCounter('streaming_active_connections', 'Active streaming connections');
    this.createCounter('streaming_messages_total', 'Total streaming messages');
    this.createHistogram('streaming_bytes_transferred', 'Streaming bytes transferred');
    this.createHistogram('streaming_connection_duration', 'Streaming connection duration');
  }

  /**
   * Create a counter metric
   */
  private createCounter(name: string, description: string): void {
    const counter = this.meter.createCounter(name, { description });
    this.metrics.set(name, counter);
  }

  /**
   * Create a histogram metric
   */
  private createHistogram(name: string, description: string): void {
    const histogram = this.meter.createHistogram(name, { description });
    this.metrics.set(name, histogram);
  }

  /**
   * Create an up-down counter metric
   */
  private createUpDownCounter(name: string, description: string): void {
    const upDownCounter = this.meter.createUpDownCounter(name, { description });
    this.metrics.set(name, upDownCounter);
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    responseSize?: number,
    userAgent?: string,
    remoteIp?: string,
    scheme?: string
  ): void {
    const attributes: Attributes = {
      [SEMATTRS_HTTP_METHOD]: method,
      [SEMATTRS_HTTP_STATUS_CODE]: statusCode,
      [SEMATTRS_HTTP_ROUTE]: route,
      ...(scheme && { [SEMATTRS_HTTP_SCHEME]: scheme }),
      ...(userAgent && { [SEMATTRS_HTTP_USER_AGENT]: userAgent }),
      ...(remoteIp && { [SEMATTRS_NET_PEER_IP]: remoteIp }),
    };

    // Increment request counter
    const counter = this.metrics.get('http_server_requests_total') as Counter;
    counter?.add(1, attributes);

    // Record duration
    const histogram = this.metrics.get('http_server_request_duration') as Histogram;
    histogram?.record(duration, attributes);

    // Record response size if provided
    if (responseSize !== undefined) {
      const sizeHistogram = this.metrics.get('http_server_response_size') as Histogram;
      sizeHistogram?.record(responseSize, attributes);
    }
  }

  /**
   * Increment active HTTP requests
   */
  incrementActiveRequests(attributes?: Attributes): void {
    const upDownCounter = this.metrics.get('http_server_active_requests') as UpDownCounter;
    upDownCounter?.add(1, attributes);
  }

  /**
   * Decrement active HTTP requests
   */
  decrementActiveRequests(attributes?: Attributes): void {
    const upDownCounter = this.metrics.get('http_server_active_requests') as UpDownCounter;
    upDownCounter?.add(-1, attributes);
  }

  /**
   * Record tool execution metrics
   */
  recordToolExecution(
    toolName: string,
    duration: number,
    success: boolean,
    parameters?: Record<string, any>
  ): void {
    const attributes: Attributes = {
      tool_name: toolName,
      status: success ? 'success' : 'error',
      ...(parameters && { tool_parameters_count: Object.keys(parameters).length }),
    };

    // Increment execution counter
    const counter = this.metrics.get('tool_executions_total') as Counter;
    counter?.add(1, attributes);

    // Record duration
    const histogram = this.metrics.get('tool_execution_duration') as Histogram;
    histogram?.record(duration, attributes);

    // Increment error counter if failed
    if (!success) {
      const errorCounter = this.metrics.get('tool_errors_total') as Counter;
      errorCounter?.add(1, { tool_name: toolName });
    }
  }

  /**
   * Increment active tool executions
   */
  incrementActiveExecutions(toolName: string): void {
    const upDownCounter = this.metrics.get('tool_active_executions') as UpDownCounter;
    upDownCounter?.add(1, { tool_name: toolName });
  }

  /**
   * Decrement active tool executions
   */
  decrementActiveExecutions(toolName: string): void {
    const upDownCounter = this.metrics.get('tool_active_executions') as UpDownCounter;
    upDownCounter?.add(-1, { tool_name: toolName });
  }

  /**
   * Record streaming metrics
   */
  recordStreamingMessage(
    connectionId: string,
    streamType: 'sse' | 'ndjson',
    messageSize: number,
    messageType?: string
  ): void {
    const attributes: Attributes = {
      connection_id: connectionId,
      stream_type: streamType,
      ...(messageType && { message_type: messageType }),
    };

    // Increment message counter
    const counter = this.metrics.get('streaming_messages_total') as Counter;
    counter?.add(1, attributes);

    // Record bytes transferred
    const histogram = this.metrics.get('streaming_bytes_transferred') as Histogram;
    histogram?.record(messageSize, attributes);
  }

  /**
   * Increment active streaming connections
   */
  incrementActiveConnections(streamType: 'sse' | 'ndjson', clientType?: string): void {
    const upDownCounter = this.metrics.get('streaming_active_connections') as UpDownCounter;
    upDownCounter?.add(1, {
      stream_type: streamType,
      ...(clientType && { client_type: clientType }),
    });
  }

  /**
   * Decrement active streaming connections
   */
  decrementActiveConnections(streamType: 'sse' | 'ndjson', clientType?: string): void {
    const upDownCounter = this.metrics.get('streaming_active_connections') as UpDownCounter;
    upDownCounter?.add(-1, {
      stream_type: streamType,
      ...(clientType && { client_type: clientType }),
    });
  }

  /**
   * Record streaming connection duration
   */
  recordConnectionDuration(
    connectionId: string,
    streamType: 'sse' | 'ndjson',
    duration: number
  ): void {
    const attributes: Attributes = {
      connection_id: connectionId,
      stream_type: streamType,
    };

    const histogram = this.metrics.get('streaming_connection_duration') as Histogram;
    histogram?.record(duration, attributes);
  }

  /**
   * Get current metrics snapshot
   */
  getMetricsSnapshot(): InstrumentationMetrics {
    return {
      httpServer: {
        requestCount: 0, // Would need to be tracked separately
        requestDuration: 0,
        activeRequests: 0,
        responseSize: 0,
      },
      toolExecution: {
        executionCount: 0,
        executionDuration: 0,
        activeExecutions: 0,
        errorCount: 0,
      },
      streaming: {
        activeConnections: 0,
        messagesSent: 0,
        bytesTransferred: 0,
        connectionDuration: 0,
      },
      system: {
        cpuUsage: this.calculateCpuPercent(process.cpuUsage()),
        memoryUsage: process.memoryUsage().heapUsed,
        uptime: process.uptime(),
      },
    };
  }

  /**
   * Calculate CPU percentage from CPU usage
   */
  private calculateCpuPercent(cpuUsage: NodeJS.CpuUsage): number {
    const total = cpuUsage.user + cpuUsage.system;
    return (total / 1000000) / process.uptime() * 100;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return this.performanceMonitor?.getMetrics() || {
      cpuOverheadPercent: 0,
      memoryOverheadMb: 0,
      latencyImpactMs: 0,
      sampleCount: 0,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Shutdown metrics collector
   */
  async shutdown(): Promise<void> {
    this.performanceMonitor?.stop();
  }
}

/**
 * Performance monitoring for OpenTelemetry overhead
 */
class PerformanceMonitor {
  private startTime = Date.now();
  private startCpuUsage = process.cpuUsage();
  private startMemUsage = process.memoryUsage();
  private samples: Array<{ cpu: number; memory: number; latency: number }> = [];
  private monitoringInterval?: NodeJS.Timeout;

  constructor(private config: OpenTelemetryConfig) {
    this.startMonitoring();
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectSample();
    }, 30000); // 30 seconds
  }

  private collectSample(): void {
    const currentCpu = process.cpuUsage(this.startCpuUsage);
    const currentMem = process.memoryUsage();
    const now = Date.now();

    const cpuPercent = (currentCpu.user + currentCpu.system) / 1000000 / (now - this.startTime) * 100;
    const memoryOverhead = (currentMem.heapUsed - this.startMemUsage.heapUsed) / 1024 / 1024; // MB

    this.samples.push({
      cpu: cpuPercent,
      memory: memoryOverhead,
      latency: 0, // Would be measured from actual operations
    });

    // Keep only recent samples
    if (this.samples.length > 100) {
      this.samples = this.samples.slice(-100);
    }
  }

  getMetrics() {
    if (this.samples.length === 0) {
      return {
        cpuOverheadPercent: 0,
        memoryOverheadMb: 0,
        latencyImpactMs: 0,
        sampleCount: 0,
        lastUpdate: Date.now(),
      };
    }

    const avgCpu = this.samples.reduce((sum, s) => sum + s.cpu, 0) / this.samples.length;
    const avgMemory = this.samples.reduce((sum, s) => sum + s.memory, 0) / this.samples.length;
    const avgLatency = this.samples.reduce((sum, s) => sum + s.latency, 0) / this.samples.length;

    return {
      cpuOverheadPercent: Math.min(avgCpu, this.config.performance.maxCpuOverheadPercent),
      memoryOverheadMb: Math.min(avgMemory, this.config.performance.maxMemoryOverheadMb),
      latencyImpactMs: Math.min(avgLatency, this.config.performance.maxLatencyImpactMs),
      sampleCount: this.samples.length,
      lastUpdate: Date.now(),
    };
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }
}