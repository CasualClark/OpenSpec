/**
 * Memory monitoring and enforcement system for streaming operations
 */



/**
 * Memory usage statistics
 */
export interface MemoryStats {
  /** Current heap used in bytes */
  heapUsed: number;
  /** Current heap total in bytes */
  heapTotal: number;
  /** External memory in bytes */
  external: number;
  /** RSS memory in bytes */
  rss: number;
  /** Percentage of heap used */
  heapUsedPercent: number;
  /** Timestamp of measurement */
  timestamp: number;
}

/**
 * Memory threshold configuration
 */
export interface MemoryThresholds {
  /** Warning threshold percentage (default: 70%) */
  warning?: number;
  /** Critical threshold percentage (default: 85%) */
  critical?: number;
  /** Maximum absolute memory in bytes (default: 50MB) */
  maxAbsolute?: number;
  /** Memory check interval in milliseconds (default: 1000ms) */
  checkInterval?: number;
}

/**
 * Memory breach event
 */
export interface MemoryBreachEvent {
  /** Type of breach */
  type: 'warning' | 'critical' | 'maximum';
  /** Current memory stats */
  stats: MemoryStats;
  /** Threshold that was breached */
  threshold: number;
  /** Message describing the breach */
  message: string;
  /** Timestamp of breach */
  timestamp: number;
}

/**
 * Memory monitor with automatic enforcement
 */
export class MemoryMonitor {
  private thresholds: Required<MemoryThresholds>;
  public isMonitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;
  private memoryHistory: MemoryStats[] = [];
  private maxHistorySize: number = 100;
  private breachCallbacks: Set<(event: MemoryBreachEvent) => void> = new Set();

  constructor(thresholds: MemoryThresholds = {}) {
    this.thresholds = {
      warning: thresholds.warning || 70,
      critical: thresholds.critical || 85,
      maxAbsolute: thresholds.maxAbsolute || 50 * 1024 * 1024, // 50MB
      checkInterval: thresholds.checkInterval || 1000
    };
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.checkMemory();
    }, this.thresholds.checkInterval);

    // Initial check
    this.checkMemory();
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Get current memory statistics
   */
  getCurrentStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedPercent,
      timestamp: Date.now()
    };
  }

  /**
   * Get memory history
   */
  getHistory(): MemoryStats[] {
    return [...this.memoryHistory];
  }

  /**
   * Clear memory history
   */
  clearHistory(): void {
    this.memoryHistory = [];
  }

  /**
   * Add a breach event callback
   */
  onBreach(callback: (event: MemoryBreachEvent) => void): void {
    this.breachCallbacks.add(callback);
  }

  /**
   * Remove a breach event callback
   */
  offBreach(callback: (event: MemoryBreachEvent) => void): void {
    this.breachCallbacks.delete(callback);
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * Check if memory usage is within acceptable limits
   */
  isWithinLimits(stats?: MemoryStats): boolean {
    const currentStats = stats || this.getCurrentStats();
    
    // Check absolute limit
    if (currentStats.heapUsed > this.thresholds.maxAbsolute) {
      return false;
    }

    // Check percentage limit
    if (currentStats.heapUsedPercent > this.thresholds.critical) {
      return false;
    }

    return true;
  }

  /**
   * Get memory pressure level
   */
  getPressureLevel(stats?: MemoryStats): 'normal' | 'warning' | 'critical' | 'maximum' {
    const currentStats = stats || this.getCurrentStats();

    // Check absolute limit first
    if (currentStats.heapUsed > this.thresholds.maxAbsolute) {
      return 'maximum';
    }

    // Check percentage thresholds
    if (currentStats.heapUsedPercent > this.thresholds.critical) {
      return 'critical';
    }

    if (currentStats.heapUsedPercent > this.thresholds.warning) {
      return 'warning';
    }

    return 'normal';
  }

  /**
   * Internal memory check routine
   */
  private checkMemory(): void {
    const stats = this.getCurrentStats();
    
    // Add to history
    this.memoryHistory.push(stats);
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory = this.memoryHistory.slice(-this.maxHistorySize);
    }

    // Check for breaches
    const pressureLevel = this.getPressureLevel(stats);
    
    if (pressureLevel !== 'normal') {
      const event: MemoryBreachEvent = {
        type: pressureLevel === 'maximum' ? 'maximum' : pressureLevel,
        stats,
        threshold: pressureLevel === 'maximum' ? this.thresholds.maxAbsolute : 
                   pressureLevel === 'critical' ? this.thresholds.critical : 
                   this.thresholds.warning,
        message: this.getBreachMessage(pressureLevel, stats),
        timestamp: Date.now()
      };

      // Notify callbacks
      this.breachCallbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('Error in memory breach callback:', error);
        }
      });

      // Force GC on critical breaches
      if (pressureLevel === 'critical' || pressureLevel === 'maximum') {
        this.forceGC();
      }
    }
  }

  /**
   * Generate breach message
   */
  private getBreachMessage(level: string, stats: MemoryStats): string {
    switch (level) {
      case 'warning':
        return `Memory usage warning: ${stats.heapUsedPercent.toFixed(1)}% (${(stats.heapUsed / 1024 / 1024).toFixed(1)}MB)`;
      case 'critical':
        return `Memory usage critical: ${stats.heapUsedPercent.toFixed(1)}% (${(stats.heapUsed / 1024 / 1024).toFixed(1)}MB)`;
      case 'maximum':
        return `Memory usage exceeded maximum: ${(stats.heapUsed / 1024 / 1024).toFixed(1)}MB > ${(this.thresholds.maxAbsolute / 1024 / 1024).toFixed(1)}MB`;
      default:
        return 'Unknown memory breach';
    }
  }
}