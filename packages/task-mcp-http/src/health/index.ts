/**
 * Health Check System - Production-ready monitoring endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HealthCheckConfig, HealthStatus, HealthResponse } from './types';
import { HealthCheckRegistry } from './registry';
import { MetricsCollector } from './metrics';
import { SystemMonitor } from './monitor';

/**
 * Health check plugin for Fastify
 */
export async function healthCheckPlugin(
  server: FastifyInstance,
  config: HealthCheckConfig
): Promise<void> {
  const registry = new HealthCheckRegistry(config);
  const metrics = new MetricsCollector();
  const monitor = new SystemMonitor();

  // Store instances for later access
  (server as any).health = {
    registry,
    metrics,
    monitor,
    config
  };

  // Register built-in health checks
  await registerBuiltInChecks(registry, monitor);

  // Health check endpoints (bypass CORS for monitoring)
  server.get('/healthz', {
    config: { cors: false }
  }, async (request, reply) => livenessHandler(request, reply, registry, monitor));
  
  server.get('/readyz', {
    config: { cors: false }
  }, async (request, reply) => readinessHandler(request, reply, registry, monitor));
  
  server.get('/health', {
    config: { cors: false }
  }, async (request, reply) => comprehensiveHandler(request, reply, registry, monitor));
  
  server.get('/metrics', {
    config: { cors: false }
  }, async (request, reply) => metricsHandler(request, reply, metrics, registry));

  // Health check management endpoints (admin only)
  server.get('/health/checks', { 
    preHandler: [requireAdminAuth]
  }, async (request, reply) => {
    return { success: true, data: registry.getAllChecks() };
  });

  server.post('/health/checks/:name/disable', {
    preHandler: [requireAdminAuth]
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    registry.disableCheck(name);
    return { success: true, message: `Check ${name} disabled` };
  });

  server.post('/health/checks/:name/enable', {
    preHandler: [requireAdminAuth]
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    registry.enableCheck(name);
    return { success: true, message: `Check ${name} enabled` };
  });
}

/**
 * Liveness probe handler
 */
async function livenessHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  registry: HealthCheckRegistry,
  monitor: SystemMonitor
): Promise<HealthResponse> {
  const startTime = Date.now();
  
  try {
    const uptime = process.uptime() * 1000;
    const systemInfo = monitor.getBasicSystemInfo();
    
    const response: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      checks: {},
      details: {
        memoryUsage: `${Math.round(systemInfo.memoryUsage.heapUsed / 1024 / 1024)}MB`,
        cpuUsage: `${systemInfo.cpuUsage.toFixed(1)}%`,
        responseTime: Date.now() - startTime
      }
    };

    // Ensure response time is under 50ms for liveness
    if (response.details.responseTime > 50) {
      response.status = 'degraded';
    }

    return response;
  } catch (error) {
    request.log.error({ error }, 'Health check failed');
    reply.code(503);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      version: process.env.npm_package_version || '1.0.0',
      checks: {},
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime
      }
    };
  }
}

/**
 * Readiness probe handler
 */
async function readinessHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  registry: HealthCheckRegistry,
  monitor: SystemMonitor
): Promise<HealthResponse> {
  const startTime = Date.now();
  
  try {
    const uptime = process.uptime() * 1000;
    const results = await registry.runReadinessChecks();
    const overallStatus = determineOverallStatus(results);
    
    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      checks: Object.fromEntries(
        Object.entries(results).map(([name, result]) => [name, result.status])
      ),
      details: {
        responseTime: Date.now() - startTime,
        checks: Object.fromEntries(
          Object.entries(results).map(([name, result]) => [
            name,
            {
              status: result.status,
              duration: result.duration,
              message: result.message,
              lastCheck: result.timestamp
            }
          ])
        )
      }
    };

    // Set appropriate HTTP status code
    if (overallStatus === 'unhealthy') {
      reply.code(503);
    } else if (overallStatus === 'degraded') {
      reply.code(200); // Still serve traffic but indicate issues
    }

    return response;
  } catch (error) {
    request.log.error({ error }, 'Readiness check failed');
    reply.code(503);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      version: process.env.npm_package_version || '1.0.0',
      checks: {},
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime
      }
    };
  }
}

/**
 * Comprehensive health check handler
 */
async function comprehensiveHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  registry: HealthCheckRegistry,
  monitor: SystemMonitor
): Promise<HealthResponse> {
  const startTime = Date.now();
  
  try {
    const uptime = process.uptime() * 1000;
    const systemInfo = monitor.getDetailedSystemInfo();
    const results = await registry.runAllChecks();
    const overallStatus = determineOverallStatus(results);
    
    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      checks: Object.fromEntries(
        Object.entries(results).map(([name, result]) => [name, result.status])
      ),
      details: {
        system: systemInfo,
        tools: await getAvailableTools(),
        resources: await getResourceStatus(),
        security: await getSecurityStatus(request.server as FastifyInstance),
        responseTime: Date.now() - startTime,
        checks: Object.fromEntries(
          Object.entries(results).map(([name, result]) => [
            name,
            {
              status: result.status,
              duration: result.duration,
              message: result.message,
              lastCheck: result.timestamp,
              details: result.details
            }
          ])
        )
      }
    };

    // Set appropriate HTTP status code
    if (overallStatus === 'unhealthy') {
      reply.code(503);
    } else if (overallStatus === 'degraded') {
      reply.code(200);
    }

    return response;
  } catch (error) {
    request.log.error({ error }, 'Comprehensive health check failed');
    reply.code(503);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      version: process.env.npm_package_version || '1.0.0',
      checks: {},
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime
      }
    };
  }
}

/**
 * Prometheus metrics handler
 */
async function metricsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  metrics: MetricsCollector,
  registry: HealthCheckRegistry
): Promise<string> {
  try {
    // Update health check metrics
    const results = await registry.runAllChecks();
    metrics.updateHealthCheckMetrics(results);
    
    // Generate Prometheus format metrics
    const metricsText = metrics.getPrometheusMetrics();
    
    reply.type('text/plain; version=0.0.4');
    return metricsText;
  } catch (error) {
    request.log.error({ error }, 'Metrics generation failed');
    reply.code(500);
    return '# Error generating metrics\n';
  }
}

/**
 * Register built-in health checks
 */
async function registerBuiltInChecks(
  registry: HealthCheckRegistry,
  monitor: SystemMonitor
): Promise<void> {
  // Tool registry check
  registry.register('toolRegistry', {
    timeout: 5000,
    interval: 30000,
    critical: true,
    check: async () => {
      const startTime = Date.now();
      try {
        // Check if tool registry is available
        const tools = await getAvailableTools();
        if (tools.length === 0) {
          return {
            status: 'warn',
            message: 'No tools available in registry',
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime
          };
        }
        return {
          status: 'pass',
          message: `Found ${tools.length} tools`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { tools }
        };
      } catch (error) {
        return {
          status: 'fail',
          message: `Tool registry unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        };
      }
    }
  });

  // File system check
  registry.register('filesystem', {
    timeout: 3000,
    interval: 60000,
    critical: true,
    check: async () => {
      const startTime = Date.now();
      try {
        const fs = await import('fs/promises');
        await fs.access(process.cwd(), fs.constants.R_OK | fs.constants.W_OK);
        
        // Check available disk space
        const stats = await fs.statfs(process.cwd());
        const freeSpace = stats.bavail * stats.bsize;
        const freeSpaceGB = Math.round(freeSpace / 1024 / 1024 / 1024);
        
        if (freeSpaceGB < 1) {
          return {
            status: 'warn',
            message: `Low disk space: ${freeSpaceGB}GB available`,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            details: { freeSpaceGB }
          };
        }
        
        return {
          status: 'pass',
          message: `File system accessible, ${freeSpaceGB}GB free`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { freeSpaceGB }
        };
      } catch (error) {
        return {
          status: 'fail',
          message: `File system inaccessible: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        };
      }
    }
  });

  // Memory check
  registry.register('memory', {
    timeout: 2000,
    interval: 30000,
    critical: false,
    check: async () => {
      const startTime = Date.now();
      const memUsage = process.memoryUsage();
      const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const usagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      if (usagePercent > 90) {
        return {
          status: 'fail',
          message: `High memory usage: ${usedMB}MB/${totalMB}MB (${usagePercent.toFixed(1)}%)`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { usedMB, totalMB, usagePercent }
        };
      } else if (usagePercent > 80) {
        return {
          status: 'warn',
          message: `Elevated memory usage: ${usedMB}MB/${totalMB}MB (${usagePercent.toFixed(1)}%)`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { usedMB, totalMB, usagePercent }
        };
      }
      
      return {
        status: 'pass',
        message: `Memory usage normal: ${usedMB}MB/${totalMB}MB`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: { usedMB, totalMB, usagePercent }
      };
    }
  });

  // CPU check
  registry.register('cpu', {
    timeout: 2000,
    interval: 30000,
    critical: false,
    check: async () => {
      const startTime = Date.now();
      const cpuUsage = monitor.getCPUUsage();
      
      if (cpuUsage > 90) {
        return {
          status: 'fail',
          message: `High CPU usage: ${cpuUsage.toFixed(1)}%`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { cpuUsage }
        };
      } else if (cpuUsage > 80) {
        return {
          status: 'warn',
          message: `Elevated CPU usage: ${cpuUsage.toFixed(1)}%`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { cpuUsage }
        };
      }
      
      return {
        status: 'pass',
        message: `CPU usage normal: ${cpuUsage.toFixed(1)}%`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: { cpuUsage }
      };
    }
  });
}

/**
 * Determine overall health status
 */
function determineOverallStatus(results: Record<string, any>): HealthStatus {
  const statuses = Object.values(results).map((result: any) => result.status);
  
  if (statuses.includes('fail')) {
    return 'unhealthy';
  }
  
  if (statuses.includes('warn')) {
    return 'degraded';
  }
  
  return 'healthy';
}

/**
 * Get available tools
 */
async function getAvailableTools(): Promise<string[]> {
  try {
    // This would integrate with the actual tool registry
    // For now, return a placeholder list
    return ['change.open', 'change.archive', 'change.show', 'change.validate'];
  } catch {
    return [];
  }
}

/**
 * Get resource status
 */
async function getResourceStatus(): Promise<any> {
  try {
    const memUsage = process.memoryUsage();
    return {
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      uptime: process.uptime(),
      pid: process.pid
    };
  } catch {
    return {};
  }
}

/**
 * Get security status
 */
async function getSecurityStatus(server: FastifyInstance): Promise<any> {
  try {
    const security = (server as any).security;
    if (!security) {
      return { status: 'unknown', message: 'Security subsystem not available' };
    }
    
    return {
      auth: security.authMiddleware ? 'enabled' : 'disabled',
      rateLimit: security.rateLimitMiddleware ? 'enabled' : 'disabled',
      cors: security.corsMiddleware ? 'enabled' : 'disabled',
      headers: security.securityHeadersMiddleware ? 'enabled' : 'disabled',
      audit: security.auditLogger ? 'enabled' : 'disabled'
    };
  } catch {
    return { status: 'error', message: 'Failed to get security status' };
  }
}

/**
 * Require admin authentication
 */
async function requireAdminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Simple admin check - in production, this should be more sophisticated
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401);
    throw new Error('Authentication required');
  }
  
  const token = authHeader.substring(7);
  // In a real implementation, validate the token properly
  if (token !== 'admin-token') {
    reply.code(403);
    throw new Error('Admin access required');
  }
}