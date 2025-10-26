/**
 * Prometheus-compatible metrics collector for health monitoring
 */

import { HealthCheckResult } from './types';

interface MetricValue {
  value: number;
  timestamp: number;
}

interface CounterMetric {
  type: 'counter';
  values: Map<string, MetricValue>;
}

interface GaugeMetric {
  type: 'gauge';
  value: number;
  timestamp: number;
}

interface HistogramMetric {
  type: 'histogram';
  buckets: Map<number, number>;
  count: number;
  sum: number;
}

type Metric = CounterMetric | GaugeMetric | HistogramMetric;

export class MetricsCollector {
  private metrics = new Map<string, Metric>();
  private startTime = Date.now();

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Initialize default metrics
   */
  private initializeMetrics(): void {
    // HTTP request metrics
    this.registerCounter('http_requests_total', 'Total number of HTTP requests', ['method', 'status', 'route']);
    this.registerHistogram('http_request_duration_seconds', 'HTTP request duration in seconds', ['method', 'route'], [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]);
    
    // Tool execution metrics
    this.registerCounter('tool_executions_total', 'Total number of tool executions', ['tool', 'status']);
    this.registerHistogram('tool_execution_duration_seconds', 'Tool execution duration in seconds', ['tool'], [0.1, 0.5, 1, 2, 5, 10, 30]);
    
    // Health check metrics
    this.registerGauge('health_check_status', 'Health check status (1=pass, 0=warn, -1=fail)', ['check']);
    this.registerHistogram('health_check_duration_seconds', 'Health check duration in seconds', ['check'], [0.01, 0.05, 0.1, 0.5, 1]);
    
    // Security metrics
    this.registerCounter('auth_attempts_total', 'Total authentication attempts', ['status']);
    this.registerCounter('rate_limit_hits_total', 'Total rate limit hits');
    
    // System metrics
    this.registerGauge('process_cpu_usage_percent', 'Process CPU usage percentage');
    this.registerGauge('process_memory_bytes', 'Process memory usage in bytes', ['type']);
    this.registerGauge('process_uptime_seconds', 'Process uptime in seconds');
  }

  /**
   * Record HTTP request
   */
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    const statusCategory = this.getStatusCategory(statusCode);
    
    this.incrementCounter('http_requests_total', {
      method,
      status: statusCategory,
      route
    });
    
    this.recordHistogram('http_request_duration_seconds', duration / 1000, {
      method,
      route
    });
  }

  /**
   * Record tool execution
   */
  recordToolExecution(tool: string, status: 'success' | 'error', duration: number): void {
    this.incrementCounter('tool_executions_total', {
      tool,
      status
    });
    
    this.recordHistogram('tool_execution_duration_seconds', duration / 1000, {
      tool
    });
  }

  /**
   * Record authentication attempt
   */
  recordAuthAttempt(status: 'success' | 'failed'): void {
    this.incrementCounter('auth_attempts_total', {
      status
    });
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(): void {
    this.incrementCounter('rate_limit_hits_total');
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Update memory metrics
    this.setGauge('process_memory_bytes', memUsage.heapUsed, { type: 'heap_used' });
    this.setGauge('process_memory_bytes', memUsage.heapTotal, { type: 'heap_total' });
    this.setGauge('process_memory_bytes', memUsage.external, { type: 'external' });
    this.setGauge('process_memory_bytes', memUsage.rss, { type: 'rss' });
    
    // Update CPU usage (simplified calculation)
    const totalCpu = cpuUsage.user + cpuUsage.system;
    const cpuPercent = (totalCpu / 1000000) / process.uptime() * 100; // Very rough approximation
    this.setGauge('process_cpu_usage_percent', Math.min(cpuPercent, 100));
    
    // Update uptime
    this.setGauge('process_uptime_seconds', process.uptime());
  }

  /**
   * Update health check metrics
   */
  updateHealthCheckMetrics(results: Record<string, HealthCheckResult>): void {
    for (const [name, result] of Object.entries(results)) {
      let statusValue: number;
      switch (result.status) {
        case 'pass':
          statusValue = 1;
          break;
        case 'warn':
          statusValue = 0;
          break;
        case 'fail':
          statusValue = -1;
          break;
        default:
          statusValue = -1;
      }
      
      this.setGauge('health_check_status', statusValue, { check: name });
      this.recordHistogram('health_check_duration_seconds', result.duration / 1000, {
        check: name
      });
    }
  }

  /**
   * Generate Prometheus metrics format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];
    
    // Add metadata
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${process.uptime()}`);
    
    lines.push('# HELP nodejs_version_info Node.js version information');
    lines.push('# TYPE nodejs_version_info gauge');
    lines.push(`nodejs_version_info{version="${process.version}",major="${process.versions.node}",minor="${process.versions.v8}"} 1`);
    
    // Add all metrics
    for (const [name, metric] of this.metrics.entries()) {
      switch (metric.type) {
        case 'counter':
          lines.push(this.formatCounter(name, metric as CounterMetric));
          break;
        case 'gauge':
          lines.push(this.formatGauge(name, metric as GaugeMetric));
          break;
        case 'histogram':
          lines.push(this.formatHistogram(name, metric as HistogramMetric));
          break;
      }
    }
    
    return lines.join('\n') + '\n';
  }

  /**
   * Register a counter metric
   */
  private registerCounter(name: string, help: string, labels: string[] = []): void {
    this.metrics.set(name, {
      type: 'counter',
      values: new Map()
    });
  }

  /**
   * Register a gauge metric
   */
  private registerGauge(name: string, help: string, labels: string[] = []): void {
    this.metrics.set(name, {
      type: 'gauge',
      value: 0,
      timestamp: Date.now()
    });
  }

  /**
   * Register a histogram metric
   */
  private registerHistogram(name: string, help: string, labels: string[] = [], buckets: number[] = []): void {
    const bucketMap = new Map<number, number>();
    for (const bucket of buckets) {
      bucketMap.set(bucket, 0);
    }
    // Add infinity bucket
    bucketMap.set(Infinity, 0);
    
    this.metrics.set(name, {
      type: 'histogram',
      buckets: bucketMap,
      count: 0,
      sum: 0
    });
  }

  /**
   * Increment counter metric
   */
  private incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name) as CounterMetric;
    if (!metric || metric.type !== 'counter') return;
    
    const labelKey = JSON.stringify(labels);
    const current = metric.values.get(labelKey) || { value: 0, timestamp: Date.now() };
    metric.values.set(labelKey, {
      value: current.value + 1,
      timestamp: Date.now()
    });
  }

  /**
   * Set gauge metric
   */
  private setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name) as GaugeMetric;
    if (!metric || metric.type !== 'gauge') return;
    
    metric.value = value;
    metric.timestamp = Date.now();
  }

  /**
   * Record histogram metric
   */
  private recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name) as HistogramMetric;
    if (!metric || metric.type !== 'histogram') return;
    
    metric.count++;
    metric.sum += value;
    
    // Find the right bucket
    for (const [bucket] of metric.buckets.entries()) {
      if (value <= bucket) {
        metric.buckets.set(bucket, (metric.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  /**
   * Format counter metric for Prometheus
   */
  private formatCounter(name: string, metric: CounterMetric): string {
    const lines: string[] = [];
    lines.push(`# HELP ${name} Total counter`);
    lines.push(`# TYPE ${name} counter`);
    
    for (const [labelKey, data] of metric.values.entries()) {
      const labels = JSON.parse(labelKey);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${name}{${labelStr}} ${data.value}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Format gauge metric for Prometheus
   */
  private formatGauge(name: string, metric: GaugeMetric): string {
    const lines: string[] = [];
    lines.push(`# HELP ${name} Gauge metric`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${metric.value}`);
    return lines.join('\n');
  }

  /**
   * Format histogram metric for Prometheus
   */
  private formatHistogram(name: string, metric: HistogramMetric): string {
    const lines: string[] = [];
    lines.push(`# HELP ${name} Histogram metric`);
    lines.push(`# TYPE ${name} histogram`);
    
    // Bucket counts
    for (const [bucket, count] of metric.buckets.entries()) {
      const bucketLabel = bucket === Infinity ? '+Inf' : bucket.toString();
      lines.push(`${name}_bucket{le="${bucketLabel}"} ${count}`);
    }
    
    // Count and sum
    lines.push(`${name}_count ${metric.count}`);
    lines.push(`${name}_sum ${metric.sum}`);
    
    return lines.join('\n');
  }

  /**
   * Get status category from HTTP status code
   */
  private getStatusCategory(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return '2xx';
    if (statusCode >= 300 && statusCode < 400) return '3xx';
    if (statusCode >= 400 && statusCode < 500) return '4xx';
    if (statusCode >= 500) return '5xx';
    return 'unknown';
  }
}