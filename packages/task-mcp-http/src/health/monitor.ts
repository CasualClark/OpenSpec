/**
 * System monitoring utilities for health checks
 */

import { SystemInfo, DetailedSystemInfo } from './types';

export class SystemMonitor {
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();

  /**
   * Get basic system information for liveness checks
   */
  getBasicSystemInfo(): SystemInfo {
    const memUsage = process.memoryUsage();
    const cpuUsage = this.getCPUUsage();
    
    return {
      memoryUsage: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      cpuUsage,
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version
    };
  }

  /**
   * Get detailed system information for comprehensive health checks
   */
  getDetailedSystemInfo(): DetailedSystemInfo {
    const basic = this.getBasicSystemInfo();
    const os = require('os');
    
    return {
      ...basic,
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      cpuCount: os.cpus().length,
      processId: process.pid,
      workingDirectory: process.cwd(),
      environment: process.env.NODE_ENV || 'development',
      loadAverage: os.loadavg()
    };
  }

  /**
   * Get current CPU usage percentage
   */
  getCPUUsage(): number {
    const currentUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const timeDelta = currentTime - this.lastCpuTime;
    
    // Update last values
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = currentTime;
    
    // Calculate percentage (user + system) / timeDelta * 100
    const totalUsage = currentUsage.user + currentUsage.system;
    const percentage = (totalUsage / 1000) / timeDelta * 100; // Convert to percentage
    
    return Math.min(Math.max(percentage, 0), 100); // Clamp between 0-100
  }

  /**
   * Check if system resources are within acceptable limits
   */
  checkResourceLimits(): {
    memory: 'ok' | 'warning' | 'critical';
    cpu: 'ok' | 'warning' | 'critical';
    disk: 'ok' | 'warning' | 'critical';
  } {
    const memUsage = process.memoryUsage();
    const cpuUsage = this.getCPUUsage();
    
    // Memory checks
    const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    let memory: 'ok' | 'warning' | 'critical' = 'ok';
    if (memoryUsagePercent > 90) {
      memory = 'critical';
    } else if (memoryUsagePercent > 80) {
      memory = 'warning';
    }
    
    // CPU checks
    let cpu: 'ok' | 'warning' | 'critical' = 'ok';
    if (cpuUsage > 90) {
      cpu = 'critical';
    } else if (cpuUsage > 80) {
      cpu = 'warning';
    }
    
    // Disk checks (simplified - would need actual disk space checking in production)
    let disk: 'ok' | 'warning' | 'critical' = 'ok';
    // This is a placeholder - real implementation would check actual disk space
    // For now, we'll assume disk is ok unless we can detect issues
    
    return { memory, cpu, disk };
  }

  /**
   * Get process health metrics
   */
  getProcessHealth(): {
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    fileDescriptors: number;
    eventLoopLag: number;
  } {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage().heapUsed,
      cpuUsage: this.getCPUUsage(),
      fileDescriptors: this.getFileDescriptorCount(),
      eventLoopLag: 0 // Placeholder - would need async implementation
    };
  }

  /**
   * Get file descriptor count (Unix-like systems only)
   */
  private getFileDescriptorCount(): number {
    try {
      if (process.platform !== 'win32') {
        const fs = require('fs');
        const fds = fs.readdirSync('/proc/self/fd');
        return fds.length;
      }
    } catch (error) {
      // Ignore errors, return 0 as fallback
    }
    return 0;
  }

  /**
   * Measure event loop lag
   */
  private async getEventLoopLag(): Promise<number> {
    const start = process.hrtime.bigint();
    return new Promise(resolve => {
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
        resolve(lag);
      });
    });
  }

  /**
   * Check disk space (placeholder implementation)
   */
  async checkDiskSpace(path: string = process.cwd()): Promise<{
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  }> {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.statfs(path);
      
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = total - free;
      const usagePercent = (used / total) * 100;
      
      return {
        total,
        free,
        used,
        usagePercent
      };
    } catch (error) {
      // Fallback for systems that don't support statfs
      return {
        total: 0,
        free: 0,
        used: 0,
        usagePercent: 0
      };
    }
  }

  /**
   * Get network interface information
   */
  getNetworkInterfaces(): Record<string, Array<{
    address: string;
    netmask: string;
    family: 'IPv4' | 'IPv6';
    internal: boolean;
  }>> {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    return interfaces || {};
  }

  /**
   * Check if the process is responsive
   */
  async checkResponsiveness(): Promise<boolean> {
    const start = Date.now();
    
    try {
      // Simple async operation to test event loop responsiveness
      await new Promise(resolve => setTimeout(resolve, 1));
      const lag = Date.now() - start;
      
      // Consider responsive if lag is less than 100ms
      return lag < 100;
    } catch {
      return false;
    }
  }

  /**
   * Get garbage collection statistics
   */
  getGCStats(): {
    totalCollections: number;
    totalDuration: number;
    averageDuration: number;
  } {
    // Node.js v14+ has GC stats
    if (typeof global.gc === 'function') {
      try {
        const stats = require('v8').getHeapStatistics();
        return {
          totalCollections: 0, // Would need more detailed V8 API
          totalDuration: 0,
          averageDuration: 0
        };
      } catch {
        // Fallback if V8 APIs are not available
      }
    }
    
    return {
      totalCollections: 0,
      totalDuration: 0,
      averageDuration: 0
    };
  }
}