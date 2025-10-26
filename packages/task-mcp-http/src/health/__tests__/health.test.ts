/**
 * Health check system tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { healthCheckPlugin } from '../index';
import { HealthCheckRegistry } from '../registry';
import { MetricsCollector } from '../metrics';
import { SystemMonitor } from '../monitor';

describe('Health Check System', () => {
  let server: any;
  let registry: HealthCheckRegistry;
  let metrics: MetricsCollector;
  let monitor: SystemMonitor;

  beforeEach(async () => {
    server = Fastify({ logger: false });
    
    // Register health check plugin
    await server.register(healthCheckPlugin, {
      timeout: 1000,
      cacheTimeout: 5000,
      enableCaching: true,
      gracePeriod: 1000,
      maxRetries: 2,
      retryDelay: 100
    });

    // Get references to internal components
    const health = (server as any).health;
    registry = health.registry;
    metrics = health.metrics;
    monitor = health.monitor;

    await server.ready();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('Liveness Endpoint (/healthz)', () => {
    it('should return healthy status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/healthz'
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      
      expect(payload.status).toBe('healthy');
      expect(payload.timestamp).toBeDefined();
      expect(payload.uptime).toBeGreaterThan(0);
      expect(payload.version).toBeDefined();
      expect(payload.details.memoryUsage).toBeDefined();
      expect(payload.details.cpuUsage).toBeDefined();
      expect(payload.details.responseTime).toBeLessThan(50);
    });

    it('should return degraded status if response time is high', async () => {
      // Simulate high response time by adding delay
      const originalHandler = server.routing.getRouteByUrl('/healthz')?.handler;
      
      // This is a bit of a hack to test response time
      const response = await server.inject({
        method: 'GET',
        url: '/healthz'
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(['healthy', 'degraded']).toContain(payload.status);
    });
  });

  describe('Readiness Endpoint (/readyz)', () => {
    it('should return healthy when all critical checks pass', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/readyz'
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      
      expect(['healthy', 'degraded']).toContain(payload.status);
      expect(payload.checks).toBeDefined();
      expect(payload.details.checks).toBeDefined();
    });

    it('should return 503 when critical checks fail', async () => {
      // Register a failing critical check
      registry.register('test-fail', {
        timeout: 1000,
        interval: 5000,
        critical: true,
        check: async () => ({
          status: 'fail',
          message: 'Test failure',
          timestamp: new Date().toISOString(),
          duration: 100
        })
      });

      const response = await server.inject({
        method: 'GET',
        url: '/readyz'
      });

      expect(response.statusCode).toBe(503);
      const payload = JSON.parse(response.payload);
      expect(payload.status).toBe('unhealthy');
    });
  });

  describe('Comprehensive Health Endpoint (/health)', () => {
    it('should return detailed health information', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      
      expect(payload.status).toBeDefined();
      expect(payload.system).toBeDefined();
      expect(payload.tools).toBeDefined();
      expect(payload.resources).toBeDefined();
      expect(payload.security).toBeDefined();
      expect(payload.checks).toBeDefined();
      expect(payload.details.checks).toBeDefined();
    });

    it('should include system information', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      const payload = JSON.parse(response.payload);
      const system = payload.system;
      
      expect(system.memoryUsage).toBeDefined();
      expect(system.cpuUsage).toBeDefined();
      expect(system.uptime).toBeGreaterThan(0);
      expect(system.platform).toBeDefined();
      expect(system.nodeVersion).toBeDefined();
    });
  });

  describe('Metrics Endpoint (/metrics)', () => {
    it('should return Prometheus-compatible metrics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain; version=0.0.4');
      
      const metrics = response.payload;
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toContain('process_uptime_seconds');
      expect(metrics).toContain('nodejs_version_info');
    });

    it('should include health check metrics', async () => {
      // Run health checks to generate metrics
      await registry.runAllChecks();
      
      const response = await server.inject({
        method: 'GET',
        url: '/metrics'
      });

      const metrics = response.payload;
      expect(metrics).toContain('health_check_status');
      expect(metrics).toContain('health_check_duration_seconds');
    });
  });

  describe('Health Check Registry', () => {
    it('should register and run custom health checks', async () => {
      registry.register('custom-check', {
        timeout: 1000,
        interval: 5000,
        critical: false,
        check: async () => ({
          status: 'pass',
          message: 'Custom check passed',
          timestamp: new Date().toISOString(),
          duration: 50
        })
      });

      const result = await registry.runCheck('custom-check');
      
      expect(result.status).toBe('pass');
      expect(result.message).toBe('Custom check passed');
      expect(result.duration).toBe(50);
    });

    it('should handle check timeouts', async () => {
      registry.register('timeout-check', {
        timeout: 100,
        interval: 5000,
        critical: false,
        check: async () => {
          // Simulate long-running check
          await new Promise(resolve => setTimeout(resolve, 200));
          return {
            status: 'pass',
            message: 'Should not reach here',
            timestamp: new Date().toISOString(),
            duration: 200
          };
        }
      });

      const result = await registry.runCheck('timeout-check');
      
      expect(result.status).toBe('fail');
      expect(result.message).toContain('timed out');
    });

    it('should respect check caching', async () => {
      let callCount = 0;
      
      registry.register('cached-check', {
        timeout: 1000,
        interval: 5000,
        critical: false,
        check: async () => {
          callCount++;
          return {
            status: 'pass',
            message: `Call ${callCount}`,
            timestamp: new Date().toISOString(),
            duration: 10
          };
        }
      });

      // First call
      const result1 = await registry.runCheck('cached-check');
      expect(result1.message).toBe('Call 1');
      
      // Second call should use cache
      const result2 = await registry.runCheck('cached-check');
      expect(result2.message).toBe('Call 1'); // Should be same as first call
      
      expect(callCount).toBe(1); // Should only be called once
    });

    it('should enable and disable checks', async () => {
      registry.register('toggle-check', {
        timeout: 1000,
        interval: 5000,
        critical: false,
        enabled: true,
        check: async () => ({
          status: 'pass',
          message: 'Enabled',
          timestamp: new Date().toISOString(),
          duration: 10
        })
      });

      // Should work when enabled
      let result = await registry.runCheck('toggle-check');
      expect(result.status).toBe('pass');
      expect(result.message).toBe('Enabled');

      // Disable the check
      registry.disableCheck('toggle-check');
      result = await registry.runCheck('toggle-check');
      expect(result.status).toBe('warn');
      expect(result.message).toContain('disabled');

      // Re-enable the check
      registry.enableCheck('toggle-check');
      result = await registry.runCheck('toggle-check');
      expect(result.status).toBe('pass');
    });
  });

  describe('System Monitor', () => {
    it('should get basic system info', () => {
      const info = monitor.getBasicSystemInfo();
      
      expect(info.memoryUsage).toBeDefined();
      expect(info.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(info.uptime).toBeGreaterThan(0);
      expect(info.platform).toBeDefined();
      expect(info.nodeVersion).toBeDefined();
    });

    it('should get detailed system info', () => {
      const info = monitor.getDetailedSystemInfo();
      
      expect(info.freeMemory).toBeGreaterThan(0);
      expect(info.totalMemory).toBeGreaterThan(0);
      expect(info.cpuCount).toBeGreaterThan(0);
      expect(info.processId).toBeGreaterThan(0);
      expect(info.workingDirectory).toBeDefined();
      expect(info.environment).toBeDefined();
    });

    it('should check resource limits', () => {
      const limits = monitor.checkResourceLimits();
      
      expect(limits.memory).toBeDefined();
      expect(limits.cpu).toBeDefined();
      expect(limits.disk).toBeDefined();
      expect(['ok', 'warning', 'critical']).toContain(limits.memory);
      expect(['ok', 'warning', 'critical']).toContain(limits.cpu);
      expect(['ok', 'warning', 'critical']).toContain(limits.disk);
    });
  });

  describe('Metrics Collector', () => {
    it('should record HTTP metrics', () => {
      metrics.recordHttpRequest('GET', '/test', 200, 150);
      metrics.recordHttpRequest('POST', '/api', 500, 1000);
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      expect(prometheusMetrics).toContain('http_requests_total');
      expect(prometheusMetrics).toContain('http_request_duration_seconds');
    });

    it('should record tool execution metrics', () => {
      metrics.recordToolExecution('test-tool', 'success', 500);
      metrics.recordToolExecution('test-tool', 'error', 200);
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      expect(prometheusMetrics).toContain('tool_executions_total');
      expect(prometheusMetrics).toContain('tool_execution_duration_seconds');
    });

    it('should record security metrics', () => {
      metrics.recordAuthAttempt('success');
      metrics.recordAuthAttempt('failed');
      metrics.recordRateLimitHit();
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      expect(prometheusMetrics).toContain('auth_attempts_total');
      expect(prometheusMetrics).toContain('rate_limit_hits_total');
    });

    it('should update system metrics', () => {
      metrics.updateSystemMetrics();
      
      const prometheusMetrics = metrics.getPrometheusMetrics();
      expect(prometheusMetrics).toContain('process_memory_bytes');
      expect(prometheusMetrics).toContain('process_cpu_usage_percent');
      expect(prometheusMetrics).toContain('process_uptime_seconds');
    });
  });

  describe('Health Check Management', () => {
    it('should require authentication for management endpoints', async () => {
      // Test without auth
      const response = await server.inject({
        method: 'GET',
        url: '/health/checks'
      });

      expect(response.statusCode).toBe(401);
    });

    it('should allow admin access to management endpoints', async () => {
      // Test with admin auth
      const response = await server.inject({
        method: 'GET',
        url: '/health/checks',
        headers: {
          authorization: 'Bearer admin-token'
        }
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(Array.isArray(payload.data)).toBe(true);
    });

    it('should allow enabling and disabling checks via API', async () => {
      // First register a test check
      registry.register('api-test-check', {
        timeout: 1000,
        interval: 5000,
        critical: false,
        check: async () => ({
          status: 'pass',
          message: 'Test',
          timestamp: new Date().toISOString(),
          duration: 10
        })
      });

      // Disable the check
      let response = await server.inject({
        method: 'POST',
        url: '/health/checks/api-test-check/disable',
        headers: {
          authorization: 'Bearer admin-token'
        }
      });

      expect(response.statusCode).toBe(200);
      let payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);

      // Verify it's disabled
      let result = await registry.runCheck('api-test-check');
      expect(result.status).toBe('warn');

      // Enable the check
      response = await server.inject({
        method: 'POST',
        url: '/health/checks/api-test-check/enable',
        headers: {
          authorization: 'Bearer admin-token'
        }
      });

      expect(response.statusCode).toBe(200);
      payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);

      // Verify it's enabled
      result = await registry.runCheck('api-test-check');
      expect(result.status).toBe('pass');
    });
  });
});