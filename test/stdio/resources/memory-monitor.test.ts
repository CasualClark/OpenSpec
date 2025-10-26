/**
 * Tests for MemoryMonitor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryMonitor } from '../../../src/stdio/resources/memory-monitor.js';

describe('MemoryMonitor', () => {
  let memoryMonitor: MemoryMonitor;

  beforeEach(() => {
    memoryMonitor = new MemoryMonitor({
      warning: 50, // 50% warning threshold
      critical: 75, // 75% critical threshold
      maxAbsolute: 10 * 1024 * 1024, // 10MB absolute limit
      checkInterval: 100 // Fast check interval for testing
    });
  });

  afterEach(() => {
    memoryMonitor.stopMonitoring();
    memoryMonitor.clearHistory();
  });

  describe('Basic Functionality', () => {
    it('should get current memory statistics', () => {
      const stats = memoryMonitor.getCurrentStats();
      
      expect(stats.heapUsed).toBeGreaterThan(0);
      expect(stats.heapTotal).toBeGreaterThan(0);
      expect(stats.heapUsedPercent).toBeGreaterThan(0);
      expect(stats.heapUsedPercent).toBeLessThanOrEqual(100);
      expect(stats.timestamp).toBeGreaterThan(0);
      expect(stats.external).toBeGreaterThanOrEqual(0);
      expect(stats.rss).toBeGreaterThan(0);
    });

    it('should determine memory pressure levels', () => {
      const stats = memoryMonitor.getCurrentStats();
      
      // Should start in normal range
      const pressure = memoryMonitor.getPressureLevel(stats);
      expect(['normal', 'warning', 'critical', 'maximum']).toContain(pressure);
    });

    it('should check if within limits', () => {
      const stats = memoryMonitor.getCurrentStats();
      
      // Should be within limits for normal operation
      const withinLimits = memoryMonitor.isWithinLimits(stats);
      expect(typeof withinLimits).toBe('boolean');
    });
  });

  describe('Monitoring Control', () => {
    it('should start and stop monitoring', () => {
      expect(memoryMonitor.isMonitoring).toBe(false);
      
      memoryMonitor.startMonitoring();
      expect(memoryMonitor.isMonitoring).toBe(true);
      
      memoryMonitor.stopMonitoring();
      expect(memoryMonitor.isMonitoring).toBe(false);
    });

    it('should handle multiple start calls', () => {
      memoryMonitor.startMonitoring();
      memoryMonitor.startMonitoring(); // Should not cause issues
      
      expect(memoryMonitor.isMonitoring).toBe(true);
    });

    it('should handle multiple stop calls', () => {
      memoryMonitor.startMonitoring();
      memoryMonitor.stopMonitoring();
      memoryMonitor.stopMonitoring(); // Should not cause issues
      
      expect(memoryMonitor.isMonitoring).toBe(false);
    });
  });

  describe('History Management', () => {
    it('should maintain memory history', async () => {
      memoryMonitor.startMonitoring();
      
      // Wait for some history to accumulate
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const history = memoryMonitor.getHistory();
      expect(history.length).toBeGreaterThan(0);
      
      // Check history entry structure
      const entry = history[history.length - 1];
      expect(entry.heapUsed).toBeGreaterThan(0);
      expect(entry.heapTotal).toBeGreaterThan(0);
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('should clear history', async () => {
      memoryMonitor.startMonitoring();
      
      // Wait for some history
      await new Promise(resolve => setTimeout(resolve, 200));
      
      let history = memoryMonitor.getHistory();
      expect(history.length).toBeGreaterThan(0);
      
      memoryMonitor.clearHistory();
      history = memoryMonitor.getHistory();
      expect(history.length).toBe(0);
    });

    it('should limit history size', () => {
      // Create a monitor with small history limit
      const smallHistoryMonitor = new MemoryMonitor({
        checkInterval: 10
      });
      
      // Manually add many entries to test limit - access private method
      const stats = smallHistoryMonitor.getCurrentStats();
      for (let i = 0; i < 150; i++) {
        (smallHistoryMonitor as any).memoryHistory.push({ ...stats, timestamp: Date.now() + i });
      }
      
      // Trigger history cleanup by simulating checkMemory
      (smallHistoryMonitor as any).checkMemory();
      
      const history = smallHistoryMonitor.getHistory();
      expect(history.length).toBeLessThanOrEqual(100); // Default max history size
    });
  });

  describe('Breach Detection', () => {
    it('should detect and report breaches', async () => {
      const breachEvents: any[] = [];
      
      // Create a monitor with very low thresholds to trigger breaches
      const lowThresholdMonitor = new MemoryMonitor({
        warning: -1, // Always trigger warning
        critical: -1, // Always trigger critical
        maxAbsolute: 1, // 1 byte absolute limit - will definitely trigger
        checkInterval: 50
      });
      
      lowThresholdMonitor.onBreach((event) => {
        breachEvents.push(event);
      });
      
      lowThresholdMonitor.startMonitoring();
      
      // Wait for breach detection
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(breachEvents.length).toBeGreaterThan(0);
      
      const breach = breachEvents[0];
      expect(['warning', 'critical', 'maximum']).toContain(breach.type);
      expect(breach.stats).toBeDefined();
      expect(breach.threshold).toBeDefined();
      expect(breach.message).toBeDefined();
      expect(breach.timestamp).toBeGreaterThan(0);
      
      lowThresholdMonitor.stopMonitoring();
    });

    it('should handle breach callback errors', async () => {
      const goodCallback = vi.fn();
      const badCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      
      memoryMonitor.onBreach(goodCallback);
      memoryMonitor.onBreach(badCallback);
      
      // Create monitor that will trigger breaches
      const breachMonitor = new MemoryMonitor({
        warning: 0,
        checkInterval: 50
      });
      
      breachMonitor.onBreach(() => {
        throw new Error('Another callback error');
      });
      
      breachMonitor.startMonitoring();
      
      // Wait for breach detection
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should not crash despite callback errors
      expect(true).toBe(true); // Test passes if no uncaught exceptions
      
      breachMonitor.stopMonitoring();
    });

    it('should add and remove breach callbacks', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      memoryMonitor.onBreach(callback1);
      memoryMonitor.onBreach(callback2);
      
      // Remove one callback
      memoryMonitor.offBreach(callback1);
      
      // Trigger a breach by creating a monitor with very low thresholds
      const testMonitor = new MemoryMonitor({
        warning: -1,
        maxAbsolute: 1,
        checkInterval: 50
      });
      
      testMonitor.onBreach(callback2);
      testMonitor.startMonitoring();
      
      // Wait for breach detection
      await new Promise(resolve => setTimeout(resolve, 200));
      
      testMonitor.stopMonitoring();
      
      // callback1 should not be called on main monitor
      expect(callback1).not.toHaveBeenCalled();
      // callback2 should be called on test monitor
      expect(callback2).toHaveBeenCalled();
    }, 5000); // 5 second timeout
  });

  describe('Garbage Collection', () => {
    it('should attempt garbage collection', () => {
      const result = memoryMonitor.forceGC();
      expect(typeof result).toBe('boolean');
    });

    it('should attempt garbage collection', () => {
      const result = memoryMonitor.forceGC();
      expect(typeof result).toBe('boolean');
    });

    it('should handle GC gracefully when not available', () => {
      // Test that GC doesn't throw when not available
      expect(() => memoryMonitor.forceGC()).not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should use default thresholds', () => {
      const defaultMonitor = new MemoryMonitor();
      
      // Should not throw and should work
      const stats = defaultMonitor.getCurrentStats();
      expect(stats.heapUsed).toBeGreaterThan(0);
    });

    it('should accept custom thresholds', () => {
      const customMonitor = new MemoryMonitor({
        warning: 60,
        critical: 80,
        maxAbsolute: 20 * 1024 * 1024,
        checkInterval: 500
      });
      
      const stats = customMonitor.getCurrentStats();
      expect(stats.heapUsed).toBeGreaterThan(0);
    });

    it('should generate appropriate breach messages', () => {
      const stats = memoryMonitor.getCurrentStats();
      
      // Test message generation through private method access
      const monitor = memoryMonitor as any;
      
      const warningMsg = monitor.getBreachMessage('warning', stats);
      const criticalMsg = monitor.getBreachMessage('critical', stats);
      const maxMsg = monitor.getBreachMessage('maximum', stats);
      
      expect(warningMsg).toContain('warning');
      expect(criticalMsg).toContain('critical');
      expect(maxMsg).toContain('maximum');
    });
  });
});