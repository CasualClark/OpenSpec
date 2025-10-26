/**
 * OpenTelemetry instrumentation main entry point
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { 
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

import { OpenTelemetryConfig, createDefaultConfig, validateConfig, createResource } from './config.js';
import { MetricsCollector } from './metrics.js';
import { TracingManager } from './tracing.js';
import { 
  createOpenTelemetryMiddleware, 
  StreamingTracker, 
  trackToolExecution,
  createPerformanceMiddleware
} from './middleware.js';

export class OpenTelemetryInstrumentation {
  private sdk?: NodeSDK;
  private metricsCollector?: MetricsCollector;
  private tracingManager?: TracingManager;
  private streamingTracker?: StreamingTracker;
  private config: OpenTelemetryConfig;

  constructor(config?: Partial<OpenTelemetryConfig>) {
    this.config = { ...createDefaultConfig(), ...config };
    validateConfig(this.config);
  }

  /**
   * Initialize OpenTelemetry instrumentation
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('OpenTelemetry instrumentation is disabled');
      return;
    }

    try {
      // Create resource
      const resource = new Resource({
        [SEMRESATTRS_SERVICE_NAME]: this.config.serviceName,
        [SEMRESATTRS_SERVICE_VERSION]: this.config.serviceVersion,
        ...(this.config.environment && {
          [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: this.config.environment,
        }),
      });

      // Create exporters
      const exporters = await this.createExporters();

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        traceExporter: exporters.traceExporter,
        metricReader: exporters.metricReader,
        instrumentations: [getNodeAutoInstrumentations()],
      });

      // Start SDK
      this.sdk.start();

      // Initialize managers
      const meterProvider = this.sdk['_meterProvider'] as MeterProvider;
      this.metricsCollector = new MetricsCollector(meterProvider, this.config);
      this.tracingManager = new TracingManager(this.config);
      this.streamingTracker = new StreamingTracker(
        this.tracingManager,
        this.metricsCollector,
        this.config
      );

      console.log('OpenTelemetry instrumentation initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenTelemetry:', error);
      throw error;
    }
  }

  /**
   * Create exporters based on configuration
   */
  private async createExporters() {
    const exporters: {
      traceExporter?: OTLPTraceExporter;
      metricReader?: any;
    } = {};

    // Trace exporter
    if (this.config.tracing.enabled && this.config.tracing.endpoint) {
      exporters.traceExporter = new OTLPTraceExporter({
        url: this.config.tracing.endpoint,
        headers: {
          'Content-Type': 'application/json',
        },
        timeoutMillis: this.config.tracing.exportTimeoutMs,
      });
    }

    // Metrics exporter
    if (this.config.metrics.enabled) {
      if (this.config.metrics.enablePrometheus) {
        // Prometheus exporter for dual export
        exporters.metricReader = new PrometheusExporter({
          port: this.config.metrics.prometheusPort,
          endpoint: this.config.metrics.prometheusEndpoint,
        });
      } else if (this.config.metrics.endpoint) {
        // OTLP metrics exporter
        exporters.metricReader = new OTLPMetricExporter({
          url: this.config.metrics.endpoint,
          headers: {
            'Content-Type': 'application/json',
          },
          timeoutMillis: this.config.metrics.exportTimeoutMs,
        });
      }
    }

    return exporters;
  }

  /**
   * Get metrics collector
   */
  getMetrics(): MetricsCollector | undefined {
    return this.metricsCollector;
  }

  /**
   * Get tracing manager
   */
  getTracing(): TracingManager | undefined {
    return this.tracingManager;
  }

  /**
   * Get streaming tracker
   */
  getStreamingTracker(): StreamingTracker | undefined {
    return this.streamingTracker;
  }

  /**
   * Get middleware for Fastify
   */
  getMiddleware() {
    if (!this.metricsCollector || !this.tracingManager) {
      throw new Error('OpenTelemetry not initialized');
    }

    return {
      ...createOpenTelemetryMiddleware(
        this.tracingManager,
        this.metricsCollector,
        this.config
      ),
      performance: createPerformanceMiddleware(
        this.metricsCollector,
        this.config
      ),
    };
  }

  /**
   * Get decorator for tool execution tracking
   */
  getToolTracker(toolName: string) {
    if (!this.metricsCollector || !this.tracingManager) {
      throw new Error('OpenTelemetry not initialized');
    }

    return trackToolExecution(this.tracingManager, this.metricsCollector, toolName);
  }

  /**
   * Get configuration
   */
  getConfig(): OpenTelemetryConfig {
    return this.config;
  }

  /**
   * Check if OpenTelemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return this.metricsCollector?.getPerformanceMetrics() || {
      cpuOverheadPercent: 0,
      memoryOverheadMb: 0,
      latencyImpactMs: 0,
      sampleCount: 0,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Shutdown OpenTelemetry instrumentation
   */
  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.sdk = undefined;
    }

    if (this.metricsCollector) {
      await this.metricsCollector.shutdown();
      this.metricsCollector = undefined;
    }

    this.tracingManager = undefined;
    this.streamingTracker = undefined;

    console.log('OpenTelemetry instrumentation shut down');
  }
}

/**
 * Create and initialize OpenTelemetry instrumentation
 */
export async function createOpenTelemetryInstrumentation(
  config?: Partial<OpenTelemetryConfig>
): Promise<OpenTelemetryInstrumentation> {
  const instrumentation = new OpenTelemetryInstrumentation(config);
  await instrumentation.initialize();
  return instrumentation;
}

/**
 * Default OpenTelemetry instance for easy access
 */
let defaultInstrumentation: OpenTelemetryInstrumentation | undefined;

/**
 * Initialize default OpenTelemetry instance
 */
export async function initializeOpenTelemetry(
  config?: Partial<OpenTelemetryConfig>
): Promise<OpenTelemetryInstrumentation> {
  if (defaultInstrumentation) {
    console.warn('OpenTelemetry already initialized');
    return defaultInstrumentation;
  }

  defaultInstrumentation = await createOpenTelemetryInstrumentation(config);
  return defaultInstrumentation;
}

/**
 * Get default OpenTelemetry instance
 */
export function getOpenTelemetry(): OpenTelemetryInstrumentation | undefined {
  return defaultInstrumentation;
}

/**
 * Shutdown default OpenTelemetry instance
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (defaultInstrumentation) {
    await defaultInstrumentation.shutdown();
    defaultInstrumentation = undefined;
  }
}

// Export all types and classes
export { OpenTelemetryConfig };
export { MetricsCollector };
export { TracingManager };
export { StreamingTracker };
export { TraceContext } from './tracing.js';
export type { 
  SamplingDecision, 
  TraceAttributes, 
  InstrumentationMetrics,
  PerformanceMetrics 
} from './types.js';