/**
 * OpenTelemetry configuration and initialization
 */

import { NodeSDKConfiguration } from '@opentelemetry/sdk-node';
export { OpenTelemetryConfig };
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { detectResources } from '@opentelemetry/resources';
import {
  awsEc2Detector,
  awsEcsDetector,
  awsEksDetector,
} from '@opentelemetry/resource-detector-aws';
import { gcpDetector } from '@opentelemetry/resource-detector-gcp';
import { alibabaCloudEcsDetector } from '@opentelemetry/resource-detector-alibaba-cloud';
import { OpenTelemetryConfig } from './types.js';

/**
 * Create default OpenTelemetry configuration
 */
export function createDefaultConfig(): OpenTelemetryConfig {
  return {
    enabled: process.env.OTEL_ENABLED !== 'false',
    serviceName: process.env.OTEL_SERVICE_NAME || 'task-mcp-http',
    serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    
    metrics: {
      enabled: process.env.OTEL_METRICS_ENABLED !== 'false',
      endpoint: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
      exportIntervalMs: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000'),
      exportTimeoutMs: parseInt(process.env.OTEL_EXPORTER_OTLP_METRICS_TIMEOUT || '30000'),
      enablePrometheus: process.env.OTEL_ENABLE_PROMETHEUS !== 'false',
      prometheusPort: parseInt(process.env.OTEL_PROMETHEUS_PORT || '9464'),
      prometheusEndpoint: process.env.OTEL_PROMETHEUS_ENDPOINT || '/metrics',
    },
    
    tracing: {
      enabled: process.env.OTEL_TRACES_ENABLED !== 'false',
      endpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      exportTimeoutMs: parseInt(process.env.OTEL_EXPORTER_OTLP_TRACES_TIMEOUT || '30000'),
      batchTimeoutMs: parseInt(process.env.OTEL_BSP_SCHEDULE_DELAY || '5000'),
      maxExportBatchSize: parseInt(process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE || '512'),
      maxQueueSize: parseInt(process.env.OTEL_BSP_MAX_QUEUE_SIZE || '2048'),
      sampling: {
        default: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '0.1'),
        sse: parseFloat(process.env.OTEL_SSE_SAMPLING_RATIO || '0.01'),
        ndjson: parseFloat(process.env.OTEL_NDJSON_SAMPLING_RATIO || '0.05'),
        health: parseFloat(process.env.OTEL_HEALTH_SAMPLING_RATIO || '0.1'),
      },
    },
    
    resourceDetection: {
      enabled: process.env.OTEL_RESOURCE_DETECTION_ENABLED !== 'false',
      aws: process.env.OTEL_AWS_RESOURCE_DETECTION !== 'false',
      gcp: process.env.OTEL_GCP_RESOURCE_DETECTION !== 'false',
      alibaba: process.env.OTEL_ALIBABA_RESOURCE_DETECTION !== 'false',
    },
    
    performance: {
      maxCpuOverheadPercent: 5,
      maxMemoryOverheadMb: 50,
      maxLatencyImpactMs: 2,
    },
  };
}

/**
 * Create OpenTelemetry resource with service and cloud attributes
 */
export async function createResource(config: OpenTelemetryConfig): Promise<Resource> {
  const baseResource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
    ...(config.environment && {
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment,
    }),
  });

  if (!config.resourceDetection.enabled) {
    return baseResource;
  }

  const detectors = [];
  
  if (config.resourceDetection.aws) {
    detectors.push(awsEc2Detector, awsEcsDetector, awsEksDetector);
  }
  
  if (config.resourceDetection.gcp) {
    detectors.push(gcpDetector);
  }
  
  if (config.resourceDetection.alibaba) {
    detectors.push(alibabaCloudEcsDetector);
  }

  try {
    const detectedResource = await detectResources({
      detectors,
    });
    
    return baseResource.merge(detectedResource);
  } catch (error) {
    console.warn('Failed to detect cloud resources:', error);
    return baseResource;
  }
}

/**
 * Create OpenTelemetry SDK configuration
 */
export async function createSDKConfig(config: OpenTelemetryConfig): Promise<Partial<NodeSDKConfiguration>> {
  const resource = await createResource(config);
  
  const sdkConfig: Partial<NodeSDKConfiguration> = {
    resource,
    traceExporter: config.tracing.enabled && config.tracing.endpoint ? undefined : undefined,
    metricReader: config.metrics.enabled ? undefined : undefined,
    instrumentations: [],
  };

  return sdkConfig;
}

/**
 * Validate OpenTelemetry configuration
 */
export function validateConfig(config: OpenTelemetryConfig): void {
  if (config.enabled) {
    // Validate sampling ratios
    if (config.tracing.sampling.default < 0 || config.tracing.sampling.default > 1) {
      throw new Error('Default sampling ratio must be between 0 and 1');
    }
    
    if (config.tracing.sampling.sse < 0 || config.tracing.sampling.sse > 1) {
      throw new Error('SSE sampling ratio must be between 0 and 1');
    }
    
    if (config.tracing.sampling.ndjson < 0 || config.tracing.sampling.ndjson > 1) {
      throw new Error('NDJSON sampling ratio must be between 0 and 1');
    }
    
    if (config.tracing.sampling.health < 0 || config.tracing.sampling.health > 1) {
      throw new Error('Health sampling ratio must be between 0 and 1');
    }
    
    // Validate performance limits
    if (config.performance.maxCpuOverheadPercent < 0 || config.performance.maxCpuOverheadPercent > 100) {
      throw new Error('Max CPU overhead percent must be between 0 and 100');
    }
    
    if (config.performance.maxMemoryOverheadMb < 0) {
      throw new Error('Max memory overhead MB must be non-negative');
    }
    
    if (config.performance.maxLatencyImpactMs < 0) {
      throw new Error('Max latency impact ms must be non-negative');
    }
  }
}

/**
 * Get performance monitoring configuration
 */
export function getPerformanceConfig(config: OpenTelemetryConfig) {
  return {
    maxCpuOverheadPercent: config.performance.maxCpuOverheadPercent,
    maxMemoryOverheadMb: config.performance.maxMemoryOverheadMb,
    maxLatencyImpactMs: config.performance.maxLatencyImpactMs,
    monitoringInterval: 30000, // 30 seconds
    sampleSize: 100,
  };
}