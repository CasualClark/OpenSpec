#!/usr/bin/env node

/**
 * Performance Monitoring Infrastructure for Phase 3
 * 
 * Provides comprehensive monitoring capabilities:
 * - Real-time performance metrics collection
 * - Memory usage tracking
 * - System resource monitoring
 * - Performance alerting
 * - Historical data analysis
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import * as os from 'os';

interface PerformanceMetrics {
  timestamp: string;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    free: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  process: {
    pid: number;
    uptime: number;
    version: string;
    platform: string;
    arch: string;
  };
  custom: Record<string, any>;
}

interface PerformanceAlert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  metrics: PerformanceMetrics;
  threshold: number;
  actual: number;
}

interface MonitoringConfig {
  interval: number;
  enableCpuMonitoring: boolean;
  enableMemoryMonitoring: boolean;
  enableCustomMetrics: boolean;
  alertThresholds: {
    memoryUsage: number;      // Percentage
    cpuUsage: number;         // Percentage
    responseTime: number;     // Milliseconds
    errorRate: number;        // Percentage
  };
  retention: {
    metrics: number;          // Hours
    alerts: number;           // Days
  };
}

class PerformanceMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private isRunning = false;
  private monitoringInterval?: NodeJS.Timeout;
  private metricsHistory: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private startTime = Date.now();

  constructor(config: Partial<MonitoringConfig> = {}) {
    super();
    
    this.config = {
      interval: 1000, // 1 second
      enableCpuMonitoring: true,
      enableMemoryMonitoring: true,
      enableCustomMetrics: true,
      alertThresholds: {
        memoryUsage: 85,      // 85%
        cpuUsage: 80,         // 80%
        responseTime: 5000,   // 5 seconds
        errorRate: 5          // 5%
      },
      retention: {
        metrics: 24,           // 24 hours
        alerts: 7              // 7 days
      },
      ...config
    };
  }

  /**
   * Start performance monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Performance monitoring is already running');
      return;
    }

    console.log('🚀 Starting performance monitoring...');
    this.isRunning = true;
    
    // Start collecting metrics
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.interval);
    
    // Cleanup old data periodically
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000); // Every hour
    
    console.log(`✅ Performance monitoring started (interval: ${this.config.interval}ms)`);
    this.emit('started');
  }

  /**
   * Stop performance monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️ Performance monitoring is not running');
      return;
    }

    console.log('🛑 Stopping performance monitoring...');
    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    console.log('✅ Performance monitoring stopped');
    this.emit('stopped');
  }

  /**
   * Collect performance metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const metrics: PerformanceMetrics = {
        timestamp: new Date().toISOString(),
        cpu: this.config.enableCpuMonitoring ? this.getCpuMetrics() : { usage: 0, loadAverage: [0, 0, 0] },
        memory: this.config.enableMemoryMonitoring ? this.getMemoryMetrics() : { 
          used: 0, free: 0, total: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 
        },
        process: this.getProcessMetrics(),
        custom: {}
      };

      // Add custom metrics if enabled
      if (this.config.enableCustomMetrics) {
        metrics.custom = await this.collectCustomMetrics();
      }

      // Store metrics
      this.metricsHistory.push(metrics);
      
      // Check for alerts
      this.checkAlerts(metrics);
      
      // Emit metrics event
      this.emit('metrics', metrics);
      
    } catch (error) {
      console.error('❌ Error collecting metrics:', error);
      this.emit('error', error);
    }
  }

  /**
   * Get CPU metrics
   */
  private getCpuMetrics() {
    const loadAvg = os.loadavg();
    const cpus = os.cpus();
    
    // Simple CPU usage calculation
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach((cpu: any) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (idle / total) * 100;
    
    return {
      usage: Math.round(usage * 100) / 100,
      loadAverage: loadAvg.map((avg: number) => Math.round(avg * 100) / 100)
    };
  }

  /**
   * Get memory metrics
   */
  private getMemoryMetrics() {
    const processMemory = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };
    
    return {
      used: systemMemory.used,
      free: systemMemory.free,
      total: systemMemory.total,
      heapUsed: processMemory.heapUsed,
      heapTotal: processMemory.heapTotal,
      external: processMemory.external,
      arrayBuffers: processMemory.arrayBuffers
    };
  }

  /**
   * Get process metrics
   */
  private getProcessMetrics() {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  /**
   * Collect custom metrics
   */
  private async collectCustomMetrics(): Promise<Record<string, any>> {
    const custom: Record<string, any> = {};
    
    // Event loop lag
    const start = performance.now();
    await new Promise(resolve => setImmediate(resolve));
    custom.eventLoopLag = performance.now() - start;
    
    // Active handles (if available)
    custom.activeHandles = (process as any)._getActiveHandles?.().length || 0;
    
    // Active requests (if available)
    custom.activeRequests = (process as any)._getActiveRequests?.().length || 0;
    
    // Garbage collection stats (if available)
    if (global.gc) {
      const beforeGC = process.memoryUsage();
      global.gc();
      const afterGC = process.memoryUsage();
      custom.gcFreed = beforeGC.heapUsed - afterGC.heapUsed;
    }
    
    return custom;
  }

  /**
   * Check for performance alerts
   */
  private checkAlerts(metrics: PerformanceMetrics): void {
    const alerts: PerformanceAlert[] = [];
    
    // Memory usage alert
    const memoryUsagePercent = (metrics.memory.used / metrics.memory.total) * 100;
    if (memoryUsagePercent > this.config.alertThresholds.memoryUsage) {
      alerts.push({
        id: `memory-${Date.now()}`,
        timestamp: metrics.timestamp,
        severity: memoryUsagePercent > 95 ? 'critical' : 'high',
        type: 'memory',
        message: `High memory usage: ${memoryUsagePercent.toFixed(1)}%`,
        metrics,
        threshold: this.config.alertThresholds.memoryUsage,
        actual: memoryUsagePercent
      });
    }
    
    // CPU usage alert
    if (metrics.cpu.usage > this.config.alertThresholds.cpuUsage) {
      alerts.push({
        id: `cpu-${Date.now()}`,
        timestamp: metrics.timestamp,
        severity: metrics.cpu.usage > 90 ? 'critical' : 'high',
        type: 'cpu',
        message: `High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`,
        metrics,
        threshold: this.config.alertThresholds.cpuUsage,
        actual: metrics.cpu.usage
      });
    }
    
    // Event loop lag alert
    if (metrics.custom.eventLoopLag > this.config.alertThresholds.responseTime) {
      alerts.push({
        id: `eventloop-${Date.now()}`,
        timestamp: metrics.timestamp,
        severity: 'medium',
        type: 'eventloop',
        message: `High event loop lag: ${metrics.custom.eventLoopLag.toFixed(1)}ms`,
        metrics,
        threshold: this.config.alertThresholds.responseTime,
        actual: metrics.custom.eventLoopLag
      });
    }
    
    // Store and emit alerts
    alerts.forEach(alert => {
      this.alerts.push(alert);
      console.warn(`🚨 Performance Alert [${alert.severity.toUpperCase()}]: ${alert.message}`);
      this.emit('alert', alert);
    });
  }

  /**
   * Clean up old data based on retention policy
   */
  private cleanupOldData(): void {
    const now = Date.now();
    
    // Clean old metrics
    const metricsRetentionMs = this.config.retention.metrics * 60 * 60 * 1000;
    this.metricsHistory = this.metricsHistory.filter(
      metric => new Date(metric.timestamp).getTime() > (now - metricsRetentionMs)
    );
    
    // Clean old alerts
    const alertsRetentionMs = this.config.retention.alerts * 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(
      alert => new Date(alert.timestamp).getTime() > (now - alertsRetentionMs)
    );
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): PerformanceMetrics | null {
    return this.metricsHistory.length > 0 ? this.metricsHistory[this.metricsHistory.length - 1] : null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): PerformanceMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit?: number): PerformanceAlert[] {
    if (limit) {
      return this.alerts.slice(-limit);
    }
    return [...this.alerts];
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    if (this.metricsHistory.length === 0) {
      return null;
    }
    
    const recentMetrics = this.metricsHistory.slice(-60); // Last 60 data points
    const memoryUsage = recentMetrics.map(m => (m.memory.used / m.memory.total) * 100);
    const cpuUsage = recentMetrics.map(m => m.cpu.usage);
    const eventLoopLag = recentMetrics.map(m => m.custom.eventLoopLag || 0);
    
    return {
      uptime: Date.now() - this.startTime,
      samplesCollected: this.metricsHistory.length,
      alertsTriggered: this.alerts.length,
      averages: {
        memoryUsage: memoryUsage.reduce((sum, val) => sum + val, 0) / memoryUsage.length,
        cpuUsage: cpuUsage.reduce((sum, val) => sum + val, 0) / cpuUsage.length,
        eventLoopLag: eventLoopLag.reduce((sum, val) => sum + val, 0) / eventLoopLag.length
      },
      peaks: {
        memoryUsage: Math.max(...memoryUsage),
        cpuUsage: Math.max(...cpuUsage),
        eventLoopLag: Math.max(...eventLoopLag)
      },
      current: this.getCurrentMetrics()
    };
  }

  /**
   * Save monitoring data to file
   */
  async saveData(outputDir: string): Promise<void> {
    try {
      await fs.mkdir(outputDir, { recursive: true });
      
      // Save metrics history
      const metricsPath = join(outputDir, `metrics-${Date.now()}.json`);
      await fs.writeFile(metricsPath, JSON.stringify(this.metricsHistory, null, 2));
      
      // Save alerts
      const alertsPath = join(outputDir, `alerts-${Date.now()}.json`);
      await fs.writeFile(alertsPath, JSON.stringify(this.alerts, null, 2));
      
      // Save summary
      const summaryPath = join(outputDir, `summary-${Date.now()}.json`);
      await fs.writeFile(summaryPath, JSON.stringify(this.getPerformanceSummary(), null, 2));
      
      console.log(`📊 Monitoring data saved to: ${outputDir}`);
      
    } catch (error) {
      console.error('❌ Failed to save monitoring data:', error);
      throw error;
    }
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const summary = this.getPerformanceSummary();
    if (!summary) {
      return 'No performance data available';
    }
    
    const report = `
# Performance Monitoring Report

## Summary
- **Uptime**: ${(summary.uptime / 1000 / 60).toFixed(1)} minutes
- **Samples Collected**: ${summary.samplesCollected}
- **Alerts Triggered**: ${summary.alertsTriggered}

## Averages
- **Memory Usage**: ${summary.averages.memoryUsage.toFixed(1)}%
- **CPU Usage**: ${summary.averages.cpuUsage.toFixed(1)}%
- **Event Loop Lag**: ${summary.averages.eventLoopLag.toFixed(1)}ms

## Peaks
- **Memory Usage**: ${summary.peaks.memoryUsage.toFixed(1)}%
- **CPU Usage**: ${summary.peaks.cpuUsage.toFixed(1)}%
- **Event Loop Lag**: ${summary.peaks.eventLoopLag.toFixed(1)}ms

## Recent Alerts
${this.getAlerts(5).map(alert => 
  `- **${alert.severity.toUpperCase()}** [${alert.type}]: ${alert.message}`
).join('\n') || 'No recent alerts'}

## Current Status
${summary.current ? `
- **Memory**: ${((summary.current.memory.used / summary.current.memory.total) * 100).toFixed(1)}%
- **CPU**: ${summary.current.cpu.usage.toFixed(1)}%
- **Event Loop**: ${summary.current.custom.eventLoopLag?.toFixed(1) || 'N/A'}ms
` : 'N/A'}

---
*Report generated at: ${new Date().toISOString()}*
`;
    
    return report;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new PerformanceMonitor({
    interval: 2000, // 2 seconds for demo
    alertThresholds: {
      memoryUsage: 80,
      cpuUsage: 75,
      responseTime: 1000,
      errorRate: 5
    }
  });
  
  // Set up event listeners
  monitor.on('started', () => {
    console.log('📡 Monitoring started successfully');
  });
  
  monitor.on('metrics', (metrics) => {
    // Log current metrics every 10 seconds
    if (Math.random() < 0.1) {
      console.log(`📊 Memory: ${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}%, CPU: ${metrics.cpu.usage.toFixed(1)}%`);
    }
  });
  
  monitor.on('alert', (alert) => {
    console.warn(`🚨 [${alert.severity.toUpperCase()}] ${alert.message}`);
  });
  
  monitor.on('error', (error) => {
    console.error('❌ Monitoring error:', error);
  });
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down performance monitor...');
    await monitor.stop();
    
    // Save final data
    await monitor.saveData('./monitoring-data');
    
    // Generate and display report
    console.log('\n' + monitor.generateReport());
    
    process.exit(0);
  });
  
  // Start monitoring
  monitor.start().catch(console.error);
}

export { PerformanceMonitor, MonitoringConfig, PerformanceMetrics, PerformanceAlert };