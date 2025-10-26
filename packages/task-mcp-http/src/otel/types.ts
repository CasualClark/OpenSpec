/**
 * OpenTelemetry configuration types and interfaces
 */

export interface OpenTelemetryConfig {
  /** Enable OpenTelemetry instrumentation */
  enabled: boolean;
  
  /** Service name for OpenTelemetry resource */
  serviceName: string;
  
  /** Service version */
  serviceVersion: string;
  
  /** Environment (e.g., production, staging, development) */
  environment?: string;
  
  /** Metrics configuration */
  metrics: {
    /** Enable metrics collection */
    enabled: boolean;
    /** Exporter endpoint */
    endpoint?: string;
    /** Export interval in milliseconds */
    exportIntervalMs: number;
    /** Export timeout in milliseconds */
    exportTimeoutMs: number;
    /** Enable Prometheus exporter for dual export */
    enablePrometheus: boolean;
    /** Prometheus port */
    prometheusPort: number;
    /** Prometheus endpoint */
    prometheusEndpoint: string;
  };
  
  /** Tracing configuration */
  tracing: {
    /** Enable distributed tracing */
    enabled: boolean;
    /** Exporter endpoint */
    endpoint?: string;
    /** Export timeout in milliseconds */
    exportTimeoutMs: number;
    /** Batch timeout in milliseconds */
    batchTimeoutMs: number;
    /** Maximum batch size */
    maxExportBatchSize: number;
    /** Maximum queue size */
    maxQueueSize: number;
    /** Sampling configuration */
    sampling: {
      /** Default sampling ratio (0-1) */
      default: number;
      /** SSE sampling ratio */
      sse: number;
      /** NDJSON sampling ratio */
      ndjson: number;
      /** Health endpoint sampling ratio */
      health: number;
    };
  };
  
  /** Resource detection */
  resourceDetection: {
    /** Enable cloud resource detection */
    enabled: boolean;
    /** Enable AWS resource detection */
    aws: boolean;
    /** Enable GCP resource detection */
    gcp: boolean;
    /** Enable Alibaba Cloud resource detection */
    alibaba: boolean;
  };
  
  /** Performance limits */
  performance: {
    /** Maximum CPU overhead percentage */
    maxCpuOverheadPercent: number;
    /** Maximum memory overhead in MB */
    maxMemoryOverheadMb: number;
    /** Maximum latency impact in ms */
    maxLatencyImpactMs: number;
  };
}

export interface SamplingDecision {
  sampled: boolean;
  reason: string;
  attributes?: Record<string, string>;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote: boolean;
}

export interface InstrumentationMetrics {
  /** HTTP server metrics */
  httpServer: {
    requestCount: number;
    requestDuration: number;
    activeRequests: number;
    responseSize: number;
  };
  
  /** Tool execution metrics */
  toolExecution: {
    executionCount: number;
    executionDuration: number;
    activeExecutions: number;
    errorCount: number;
  };
  
  /** Streaming metrics */
  streaming: {
    activeConnections: number;
    messagesSent: number;
    bytesTransferred: number;
    connectionDuration: number;
  };
  
  /** System metrics */
  system: {
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
  };
}

export interface TraceAttributes {
  /** HTTP attributes */
  http?: {
    method: string;
    url: string;
    statusCode: number;
    userAgent?: string;
    remoteAddr?: string;
    route?: string;
  };
  
  /** Tool execution attributes */
  tool?: {
    name: string;
    parameters?: Record<string, any>;
    result?: any;
    error?: string;
  };
  
  /** Streaming attributes */
  streaming?: {
    type: 'sse' | 'ndjson';
    connectionId: string;
    clientType?: string;
  };
  
  /** System attributes */
  system?: {
    hostname: string;
    pid: number;
    version: string;
  };
}

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'updowncounter';

export interface MetricDefinition {
  name: string;
  description: string;
  type: MetricType;
  unit: string;
  labels?: string[];
}

export interface PerformanceMetrics {
  cpuOverheadPercent: number;
  memoryOverheadMb: number;
  latencyImpactMs: number;
  sampleCount: number;
  lastUpdate: number;
}