/**
 * Tests for OpenTelemetry metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetricsCollector } from '../metrics.js';
import { OpenTelemetryConfig } from '../types.js';
import { MeterProvider, Meter } from '@opentelemetry/api';

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;
  let mockMeterProvider: MeterProvider;
  let mockMeter: Meter;

  beforeEach(() => {
    // Create mock meter and meter provider
    mockMeter = {
      createCounter: vi.fn().mockReturnValue({
        add: vi.fn(),
      }),
      createHistogram: vi.fn().mockReturnValue({
        record: vi.fn(),
      }),
      createUpDownCounter: vi.fn().mockReturnValue({
        add: vi.fn(),
      }),
    } as any;

    mockMeterProvider = {
      getMeter: vi.fn().mockReturnValue(mockMeter),
    } as any;

    const config: OpenTelemetryConfig = {
      enabled: true,
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      metrics: {
        enabled: true,
        exportIntervalMs: 60000,
        exportTimeoutMs: 30000,
        enablePrometheus: true,
        prometheusPort: 9464,
        prometheusEndpoint: '/metrics',
      },
      tracing: {
        enabled: true,
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
        enabled: true,
        aws: true,
        gcp: true,
        alibaba: true,
      },
      performance: {
        maxCpuOverheadPercent: 5,
        maxMemoryOverheadMb: 50,
        maxLatencyImpactMs: 2,
      },
    };

    metricsCollector = new MetricsCollector(mockMeterProvider, config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HTTP Request Metrics', () => {
    it('should record HTTP request metrics', () => {
      const mockCounter = { add: vi.fn() };
      const mockHistogram = { record: vi.fn() };
      
      mockMeter.createCounter.mockReturnValue(mockCounter);
      mockMeter.createHistogram.mockReturnValue(mockHistogram);

      metricsCollector.recordHttpRequest(
        'POST',
        '/api/test',
        200,
        150,
        1024,
        'test-agent',
        '127.0.0.1',
        'https'
      );

      expect(mockCounter.add).toHaveBeenCalledWith(1, expect.objectContaining({
        'http.method': 'POST',
        'http.status_code': 200,
        'http.route': '/api/test',
        'http.scheme': 'https',
        'http.user_agent': 'test-agent',
        'net.peer.ip': '127.0.0.1',
      }));

      expect(mockHistogram.record).toHaveBeenCalledWith(150, expect.any(Object));
      expect(mockHistogram.record).toHaveBeenCalledWith(1024, expect.any(Object));
    });

    it('should increment and decrement active requests', () => {
      const mockUpDownCounter = { add: vi.fn() };
      mockMeter.createUpDownCounter.mockReturnValue(mockUpDownCounter);

      metricsCollector.incrementActiveRequests({ method: 'GET' });
      metricsCollector.decrementActiveRequests({ method: 'GET' });

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(1, { method: 'GET' });
      expect(mockUpDownCounter.add).toHaveBeenCalledWith(-1, { method: 'GET' });
    });
  });

  describe('Tool Execution Metrics', () => {
    it('should record successful tool execution', () => {
      const mockCounter = { add: vi.fn() };
      const mockHistogram = { record: vi.fn() };
      
      mockMeter.createCounter.mockReturnValue(mockCounter);
      mockMeter.createHistogram.mockReturnValue(mockHistogram);

      metricsCollector.recordToolExecution('test-tool', 250, true, { param1: 'value1' });

      expect(mockCounter.add).toHaveBeenCalledWith(1, expect.objectContaining({
        tool_name: 'test-tool',
        status: 'success',
        tool_parameters_count: 1,
      }));

      expect(mockHistogram.record).toHaveBeenCalledWith(250, expect.any(Object));
    });

    it('should record failed tool execution', () => {
      const mockCounter = { add: vi.fn() };
      const mockHistogram = { record: vi.fn() };
      
      mockMeter.createCounter.mockReturnValue(mockCounter);
      mockMeter.createHistogram.mockReturnValue(mockHistogram);

      metricsCollector.recordToolExecution('test-tool', 100, false);

      expect(mockCounter.add).toHaveBeenCalledWith(1, expect.objectContaining({
        tool_name: 'test-tool',
        status: 'error',
      }));

      expect(mockCounter.add).toHaveBeenCalledWith(1, { tool_name: 'test-tool' });
    });

    it('should track active tool executions', () => {
      const mockUpDownCounter = { add: vi.fn() };
      mockMeter.createUpDownCounter.mockReturnValue(mockUpDownCounter);

      metricsCollector.incrementActiveExecutions('test-tool');
      metricsCollector.decrementActiveExecutions('test-tool');

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(1, { tool_name: 'test-tool' });
      expect(mockUpDownCounter.add).toHaveBeenCalledWith(-1, { tool_name: 'test-tool' });
    });
  });

  describe('Streaming Metrics', () => {
    it('should record streaming messages', () => {
      const mockCounter = { add: vi.fn() };
      const mockHistogram = { record: vi.fn() };
      
      mockMeter.createCounter.mockReturnValue(mockCounter);
      mockMeter.createHistogram.mockReturnValue(mockHistogram);

      metricsCollector.recordStreamingMessage('conn-123', 'sse', 512, 'data');

      expect(mockCounter.add).toHaveBeenCalledWith(1, expect.objectContaining({
        connection_id: 'conn-123',
        stream_type: 'sse',
        message_type: 'data',
      }));

      expect(mockHistogram.record).toHaveBeenCalledWith(512, expect.any(Object));
    });

    it('should track active connections', () => {
      const mockUpDownCounter = { add: vi.fn() };
      mockMeter.createUpDownCounter.mockReturnValue(mockUpDownCounter);

      metricsCollector.incrementActiveConnections('sse', 'browser');
      metricsCollector.decrementActiveConnections('sse', 'browser');

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(1, expect.objectContaining({
        stream_type: 'sse',
        client_type: 'browser',
      }));

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(-1, expect.objectContaining({
        stream_type: 'sse',
        client_type: 'browser',
      }));
    });

    it('should record connection duration', () => {
      const mockHistogram = { record: vi.fn() };
      mockMeter.createHistogram.mockReturnValue(mockHistogram);

      metricsCollector.recordConnectionDuration('conn-123', 'ndjson', 5000);

      expect(mockHistogram.record).toHaveBeenCalledWith(5000, expect.objectContaining({
        connection_id: 'conn-123',
        stream_type: 'ndjson',
      }));
    });
  });

  describe('Performance Monitoring', () => {
    it('should get performance metrics', () => {
      const perfMetrics = metricsCollector.getPerformanceMetrics();

      expect(perfMetrics).toHaveProperty('cpuOverheadPercent');
      expect(perfMetrics).toHaveProperty('memoryOverheadMb');
      expect(perfMetrics).toHaveProperty('latencyImpactMs');
      expect(perfMetrics).toHaveProperty('sampleCount');
      expect(perfMetrics).toHaveProperty('lastUpdate');
    });

    it('should get metrics snapshot', () => {
      const snapshot = metricsCollector.getMetricsSnapshot();

      expect(snapshot).toHaveProperty('httpServer');
      expect(snapshot).toHaveProperty('toolExecution');
      expect(snapshot).toHaveProperty('streaming');
      expect(snapshot).toHaveProperty('system');
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      const shutdownSpy = vi.spyOn(metricsCollector as any, 'performanceMonitor', 'get').mockReturnValue({
        stop: vi.fn(),
      });

      await metricsCollector.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
    });
  });
});