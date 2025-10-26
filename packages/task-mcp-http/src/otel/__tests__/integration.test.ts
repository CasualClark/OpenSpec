/**
 * Integration tests for OpenTelemetry instrumentation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenTelemetryInstrumentation } from '../index.js';

describe('OpenTelemetry Integration', () => {
  let otel: OpenTelemetryInstrumentation;

  beforeEach(async () => {
    otel = new OpenTelemetryInstrumentation({
      enabled: true,
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      environment: 'test',
      metrics: {
        enabled: true,
        exportIntervalMs: 1000,
        exportTimeoutMs: 1000,
        enablePrometheus: false, // Disable for tests
        prometheusPort: 9464,
        prometheusEndpoint: '/metrics',
      },
      tracing: {
        enabled: true,
        exportTimeoutMs: 1000,
        batchTimeoutMs: 1000,
        maxExportBatchSize: 10,
        maxQueueSize: 100,
        sampling: {
          default: 1.0, // Sample everything for tests
          sse: 1.0,
          ndjson: 1.0,
          health: 1.0,
        },
      },
      resourceDetection: {
        enabled: false, // Disable for tests
        aws: false,
        gcp: false,
        alibaba: false,
      },
      performance: {
        maxCpuOverheadPercent: 10,
        maxMemoryOverheadMb: 100,
        maxLatencyImpactMs: 10,
      },
    });
  });

  afterEach(async () => {
    if (otel) {
      await otel.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await otel.initialize();
      
      expect(otel.isEnabled()).toBe(true);
      expect(otel.getMetrics()).toBeDefined();
      expect(otel.getTracing()).toBeDefined();
      expect(otel.getStreamingTracker()).toBeDefined();
    });

    it('should handle disabled configuration', async () => {
      const disabledOtel = new OpenTelemetryInstrumentation({
        enabled: false,
        serviceName: 'disabled-service',
        serviceVersion: '1.0.0',
        metrics: {
          enabled: false,
          exportIntervalMs: 60000,
          exportTimeoutMs: 30000,
          enablePrometheus: false,
          prometheusPort: 9464,
          prometheusEndpoint: '/metrics',
        },
        tracing: {
          enabled: false,
          exportTimeoutMs: 30000,
          batchTimeoutMs: 5000,
          maxExportBatchSize: 512,
          maxQueueSize: 2048,
          sampling: {
            default: 0.1,
            sse: 0.01,
            ndjson: 0.05,
            health: 0.1,
          },
        },
        resourceDetection: {
          enabled: false,
          aws: false,
          gcp: false,
          alibaba: false,
        },
        performance: {
          maxCpuOverheadPercent: 5,
          maxMemoryOverheadMb: 50,
          maxLatencyImpactMs: 2,
        },
      });

      await disabledOtel.initialize();
      
      expect(disabledOtel.isEnabled()).toBe(false);
      expect(disabledOtel.getMetrics()).toBeUndefined();
      expect(disabledOtel.getTracing()).toBeUndefined();
      
      await disabledOtel.shutdown();
    });
  });

  describe('Configuration', () => {
    it('should return correct configuration', () => {
      const config = otel.getConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.serviceName).toBe('test-service');
      expect(config.serviceVersion).toBe('1.0.0');
      expect(config.environment).toBe('test');
    });
  });

  describe('Performance Metrics', () => {
    it('should return performance metrics', () => {
      const perfMetrics = otel.getPerformanceMetrics();
      
      expect(perfMetrics).toHaveProperty('cpuOverheadPercent');
      expect(perfMetrics).toHaveProperty('memoryOverheadMb');
      expect(perfMetrics).toHaveProperty('latencyImpactMs');
      expect(perfMetrics).toHaveProperty('sampleCount');
      expect(perfMetrics).toHaveProperty('lastUpdate');
      
      expect(typeof perfMetrics.cpuOverheadPercent).toBe('number');
      expect(typeof perfMetrics.memoryOverheadMb).toBe('number');
      expect(typeof perfMetrics.latencyImpactMs).toBe('number');
      expect(typeof perfMetrics.sampleCount).toBe('number');
      expect(typeof perfMetrics.lastUpdate).toBe('number');
    });
  });

  describe('Middleware', () => {
    it('should throw error when getting middleware before initialization', () => {
      expect(() => otel.getMiddleware()).toThrow('OpenTelemetry not initialized');
    });

    it('should return middleware after initialization', async () => {
      await otel.initialize();
      
      const middleware = otel.getMiddleware();
      
      expect(middleware).toHaveProperty('onRequest');
      expect(middleware).toHaveProperty('onResponse');
      expect(middleware).toHaveProperty('onError');
      expect(middleware).toHaveProperty('performance');
      expect(typeof middleware.onRequest).toBe('function');
      expect(typeof middleware.onResponse).toBe('function');
      expect(typeof middleware.onError).toBe('function');
      expect(typeof middleware.performance.onRequest).toBe('function');
      expect(typeof middleware.performance.onResponse).toBe('function');
    });
  });

  describe('Tool Tracking', () => {
    it('should throw error when getting tool tracker before initialization', () => {
      expect(() => otel.getToolTracker('test-tool')).toThrow('OpenTelemetry not initialized');
    });

    it('should return tool tracker after initialization', async () => {
      await otel.initialize();
      
      const tracker = otel.getToolTracker('test-tool');
      
      expect(typeof tracker).toBe('function');
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await otel.initialize();
      await otel.shutdown();
      
      // After shutdown, getting middleware should throw
      expect(() => otel.getMiddleware()).toThrow('OpenTelemetry not initialized');
    });
  });
});