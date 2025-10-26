/**
 * Tests for OpenTelemetry configuration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  createDefaultConfig, 
  createResource, 
  validateConfig, 
  getPerformanceConfig 
} from '../config.js';
import { OpenTelemetryConfig } from '../types.js';

describe('OpenTelemetry Configuration', () => {
  let config: OpenTelemetryConfig;

  beforeEach(() => {
    config = createDefaultConfig();
  });

  describe('createDefaultConfig', () => {
    it('should create default configuration with expected values', () => {
      expect(config.enabled).toBe(true);
      expect(config.serviceName).toBe('task-mcp-http');
      expect(config.serviceVersion).toBe('1.0.0');
      expect(config.environment).toBe('development');
      
      expect(config.metrics.enabled).toBe(true);
      expect(config.metrics.exportIntervalMs).toBe(60000);
      expect(config.metrics.exportTimeoutMs).toBe(30000);
      expect(config.metrics.enablePrometheus).toBe(true);
      expect(config.metrics.prometheusPort).toBe(9464);
      
      expect(config.tracing.enabled).toBe(true);
      expect(config.tracing.batchTimeoutMs).toBe(5000);
      expect(config.tracing.maxExportBatchSize).toBe(512);
      expect(config.tracing.maxQueueSize).toBe(2048);
      
      expect(config.tracing.sampling.default).toBe(0.1);
      expect(config.tracing.sampling.sse).toBe(0.01);
      expect(config.tracing.sampling.ndjson).toBe(0.05);
      expect(config.tracing.sampling.health).toBe(0.1);
      
      expect(config.resourceDetection.enabled).toBe(true);
      expect(config.resourceDetection.aws).toBe(true);
      expect(config.resourceDetection.gcp).toBe(true);
      expect(config.resourceDetection.alibaba).toBe(true);
      
      expect(config.performance.maxCpuOverheadPercent).toBe(5);
      expect(config.performance.maxMemoryOverheadMb).toBe(50);
      expect(config.performance.maxLatencyImpactMs).toBe(2);
    });

    it('should respect environment variables', () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        OTEL_ENABLED: 'false',
        OTEL_SERVICE_NAME: 'test-service',
        OTEL_SERVICE_VERSION: '2.0.0',
        OTEL_METRICS_ENABLED: 'false',
        OTEL_TRACES_ENABLED: 'false',
        OTEL_TRACES_SAMPLER_ARG: '0.5',
        NODE_ENV: 'production',
      };

      const envConfig = createDefaultConfig();
      
      expect(envConfig.enabled).toBe(false);
      expect(envConfig.serviceName).toBe('test-service');
      expect(envConfig.serviceVersion).toBe('2.0.0');
      expect(envConfig.environment).toBe('production');
      expect(envConfig.metrics.enabled).toBe(false);
      expect(envConfig.tracing.enabled).toBe(false);
      expect(envConfig.tracing.sampling.default).toBe(0.5);

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should throw error for invalid sampling ratios', () => {
      const invalidConfig = { ...config };
      invalidConfig.tracing.sampling.default = -0.1;
      
      expect(() => validateConfig(invalidConfig)).toThrow(
        'Default sampling ratio must be between 0 and 1'
      );
    });

    it('should throw error for sampling ratio > 1', () => {
      const invalidConfig = { ...config };
      invalidConfig.tracing.sampling.sse = 1.5;
      
      expect(() => validateConfig(invalidConfig)).toThrow(
        'SSE sampling ratio must be between 0 and 1'
      );
    });

    it('should throw error for negative performance limits', () => {
      const invalidConfig = { ...config };
      invalidConfig.performance.maxMemoryOverheadMb = -10;
      
      expect(() => validateConfig(invalidConfig)).toThrow(
        'Max memory overhead MB must be non-negative'
      );
    });

    it('should throw error for CPU overhead > 100', () => {
      const invalidConfig = { ...config };
      invalidConfig.performance.maxCpuOverheadPercent = 150;
      
      expect(() => validateConfig(invalidConfig)).toThrow(
        'Max CPU overhead percent must be between 0 and 100'
      );
    });
  });

  describe('createResource', () => {
    it('should create basic resource with service attributes', async () => {
      const resource = await createResource(config);
      
      const attributes = resource.attributes;
      expect(attributes['service.name']).toBe('task-mcp-http');
      expect(attributes['service.version']).toBe('1.0.0');
      expect(attributes['deployment.environment']).toBe('development');
    });

    it('should handle disabled resource detection', async () => {
      const noDetectionConfig = { ...config };
      noDetectionConfig.resourceDetection.enabled = false;
      
      const resource = await createResource(noDetectionConfig);
      
      const attributes = resource.attributes;
      expect(attributes['service.name']).toBe('task-mcp-http');
      expect(attributes['service.version']).toBe('1.0.0');
    });

    it('should handle missing environment', async () => {
      const noEnvConfig = { ...config };
      delete noEnvConfig.environment;
      
      const resource = await createResource(noEnvConfig);
      
      const attributes = resource.attributes;
      expect(attributes['service.name']).toBe('task-mcp-http');
      expect(attributes['service.version']).toBe('1.0.0');
      expect(attributes['deployment.environment']).toBeUndefined();
    });
  });

  describe('getPerformanceConfig', () => {
    it('should return performance monitoring configuration', () => {
      const perfConfig = getPerformanceConfig(config);
      
      expect(perfConfig.maxCpuOverheadPercent).toBe(5);
      expect(perfConfig.maxMemoryOverheadMb).toBe(50);
      expect(perfConfig.maxLatencyImpactMs).toBe(2);
      expect(perfConfig.monitoringInterval).toBe(30000);
      expect(perfConfig.sampleSize).toBe(100);
    });
  });
});