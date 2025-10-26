/**
 * Health check system type definitions
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  timestamp: string;
  duration: number;
  details?: Record<string, any>;
}

export interface HealthCheckDefinition {
  timeout: number;
  interval: number;
  critical: boolean;
  enabled?: boolean;
  check: () => Promise<HealthCheckResult>;
}

export interface HealthCheckConfig {
  timeout?: number;
  cacheTimeout?: number;
  enableCaching?: boolean;
  gracePeriod?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  checks: Record<string, 'pass' | 'fail' | 'warn'>;
  details: Record<string, any>;
}

export interface SystemInfo {
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpuUsage: number;
  uptime: number;
  loadAverage?: number[];
  platform: string;
  nodeVersion: string;
}

export interface DetailedSystemInfo extends SystemInfo {
  freeMemory: number;
  totalMemory: number;
  cpuCount: number;
  processId: number;
  workingDirectory: string;
  environment: string;
}

export interface MetricsResponse {
  timestamp: string;
  uptime: number;
  version: string;
  metrics: {
    http: {
      requests: {
        total: number;
        success: number;
        error: number;
      };
      latency: {
        avg: number;
        p50: number;
        p95: number;
        p99: number;
      };
    };
    tools: {
      executions: {
        total: number;
        success: number;
        error: number;
      };
      duration: {
        avg: number;
        p50: number;
        p95: number;
        p99: number;
      };
    };
    security: {
      authAttempts: {
        total: number;
        success: number;
        failed: number;
      };
      rateLimitHits: number;
    };
    system: {
      memoryUsage: number;
      cpuUsage: number;
      diskUsage?: number;
    };
  };
}

export interface HealthCheckSummary {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  lastCheck: string;
  duration: number;
  timeout: number;
  interval: number;
  critical: boolean;
  enabled: boolean;
  message: string;
  details?: Record<string, any>;
}