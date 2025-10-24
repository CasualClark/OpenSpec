/**
 * Performance benchmarking utilities for OpenSpec
 * Provides comprehensive performance measurement and monitoring capabilities
 */
import { performance } from 'perf_hooks';
import { MemoryMonitor } from '../../../src/stdio/resources/memory-monitor.js';
/**
 * Performance benchmark runner
 */
export class PerformanceBenchmark {
    memoryMonitor;
    metrics = [];
    peakMemory = null;
    constructor() {
        this.memoryMonitor = new MemoryMonitor({
            warning: 70,
            critical: 85,
            maxAbsolute: 100 * 1024 * 1024, // 100MB
            checkInterval: 100 // Fast checking for benchmarks
        });
    }
    /**
     * Run a performance benchmark
     */
    async runBenchmark(name, operation, itemCount = 1, config = {}) {
        const finalConfig = {
            warmupIterations: config.warmupIterations || 3,
            iterations: config.iterations || 10,
            monitorMemory: config.monitorMemory !== false,
            thresholds: {
                maxExecutionTime: config.thresholds?.maxExecutionTime || Infinity,
                maxMemoryUsage: config.thresholds?.maxMemoryUsage || Infinity,
                minItemsPerSecond: config.thresholds?.minItemsPerSecond || 0,
                maxMemoryPerItem: config.thresholds?.maxMemoryPerItem || Infinity
            }
        };
        // Start memory monitoring if enabled
        if (finalConfig.monitorMemory) {
            this.memoryMonitor.startMonitoring();
            this.peakMemory = null;
            this.setupPeakMemoryTracking();
        }
        // Warmup iterations
        for (let i = 0; i < finalConfig.warmupIterations; i++) {
            await operation();
        }
        // Benchmark iterations
        this.metrics = [];
        for (let i = 0; i < finalConfig.iterations; i++) {
            const metric = await this.measureOperation(operation, itemCount);
            this.metrics.push(metric);
        }
        // Stop memory monitoring
        if (finalConfig.monitorMemory) {
            this.memoryMonitor.stopMonitoring();
        }
        // Calculate statistics
        const result = this.calculateResult(name, finalConfig);
        return result;
    }
    /**
     * Measure a single operation
     */
    async measureOperation(operation, itemCount) {
        const memoryBefore = this.memoryMonitor.getCurrentStats();
        const startTime = performance.now();
        const result = await operation();
        const endTime = performance.now();
        const memoryAfter = this.memoryMonitor.getCurrentStats();
        const executionTime = endTime - startTime;
        const itemsPerSecond = itemCount / (executionTime / 1000);
        const memoryPerItem = (memoryAfter.heapUsed - memoryBefore.heapUsed) / itemCount;
        return {
            executionTime,
            memoryBefore,
            memoryAfter,
            peakMemory: this.peakMemory || memoryAfter,
            itemsProcessed: itemCount,
            itemsPerSecond,
            memoryPerItem,
            customMetrics: {}
        };
    }
    /**
     * Setup peak memory tracking
     */
    setupPeakMemoryTracking() {
        this.memoryMonitor.onBreach((event) => {
            if (!this.peakMemory || event.stats.heapUsed > this.peakMemory.heapUsed) {
                this.peakMemory = event.stats;
            }
        });
        // Check for peak memory every 50ms
        const interval = setInterval(() => {
            const current = this.memoryMonitor.getCurrentStats();
            if (!this.peakMemory || current.heapUsed > this.peakMemory.heapUsed) {
                this.peakMemory = current;
            }
        }, 50);
        // Clear interval after 5 seconds (should be enough for any benchmark)
        setTimeout(() => clearInterval(interval), 5000);
    }
    /**
     * Calculate benchmark statistics
     */
    calculateResult(name, config) {
        if (this.metrics.length === 0) {
            throw new Error('No metrics collected');
        }
        // Calculate averages
        const average = {
            executionTime: this.average(this.metrics.map(m => m.executionTime)),
            memoryBefore: this.averageMemory(this.metrics.map(m => m.memoryBefore)),
            memoryAfter: this.averageMemory(this.metrics.map(m => m.memoryAfter)),
            peakMemory: this.averageMemory(this.metrics.map(m => m.peakMemory)),
            itemsProcessed: this.average(this.metrics.map(m => m.itemsProcessed)),
            itemsPerSecond: this.average(this.metrics.map(m => m.itemsPerSecond)),
            memoryPerItem: this.average(this.metrics.map(m => m.memoryPerItem)),
            customMetrics: {}
        };
        // Calculate minimums
        const min = {
            executionTime: Math.min(...this.metrics.map(m => m.executionTime)),
            memoryBefore: this.metrics.reduce((min, m) => m.memoryBefore.heapUsed < min.memoryBefore.heapUsed ? m : min).memoryBefore,
            memoryAfter: this.metrics.reduce((min, m) => m.memoryAfter.heapUsed < min.memoryAfter.heapUsed ? m : min).memoryAfter,
            peakMemory: this.metrics.reduce((min, m) => m.peakMemory.heapUsed < min.peakMemory.heapUsed ? m : min).peakMemory,
            itemsProcessed: Math.min(...this.metrics.map(m => m.itemsProcessed)),
            itemsPerSecond: Math.min(...this.metrics.map(m => m.itemsPerSecond)),
            memoryPerItem: Math.min(...this.metrics.map(m => m.memoryPerItem)),
            customMetrics: {}
        };
        // Calculate maximums
        const max = {
            executionTime: Math.max(...this.metrics.map(m => m.executionTime)),
            memoryBefore: this.metrics.reduce((max, m) => m.memoryBefore.heapUsed > max.memoryBefore.heapUsed ? m : max).memoryBefore,
            memoryAfter: this.metrics.reduce((max, m) => m.memoryAfter.heapUsed > max.memoryAfter.heapUsed ? m : max).memoryAfter,
            peakMemory: this.metrics.reduce((max, m) => m.peakMemory.heapUsed > max.peakMemory.heapUsed ? m : max).peakMemory,
            itemsProcessed: Math.max(...this.metrics.map(m => m.itemsProcessed)),
            itemsPerSecond: Math.max(...this.metrics.map(m => m.itemsPerSecond)),
            memoryPerItem: Math.max(...this.metrics.map(m => m.memoryPerItem)),
            customMetrics: {}
        };
        // Calculate standard deviation
        const stdDev = {
            executionTime: this.standardDeviation(this.metrics.map(m => m.executionTime)),
            itemsProcessed: this.standardDeviation(this.metrics.map(m => m.itemsProcessed)),
            itemsPerSecond: this.standardDeviation(this.metrics.map(m => m.itemsPerSecond)),
            memoryPerItem: this.standardDeviation(this.metrics.map(m => m.memoryPerItem))
        };
        // Check thresholds
        const thresholdsMet = average.executionTime <= (config.thresholds.maxExecutionTime || Infinity) &&
            average.peakMemory.heapUsed <= (config.thresholds.maxMemoryUsage || Infinity) &&
            average.itemsPerSecond >= (config.thresholds.minItemsPerSecond || 0) &&
            average.memoryPerItem <= (config.thresholds.maxMemoryPerItem || Infinity);
        return {
            name,
            iterations: this.metrics,
            average,
            min,
            max,
            stdDev,
            thresholdsMet,
            config
        };
    }
    /**
     * Calculate average of numbers
     */
    average(values) {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    /**
     * Calculate average of memory stats
     */
    averageMemory(stats) {
        return {
            heapUsed: this.average(stats.map(s => s.heapUsed)),
            heapTotal: this.average(stats.map(s => s.heapTotal)),
            external: this.average(stats.map(s => s.external)),
            rss: this.average(stats.map(s => s.rss)),
            heapUsedPercent: this.average(stats.map(s => s.heapUsedPercent)),
            timestamp: Date.now()
        };
    }
    /**
     * Calculate standard deviation
     */
    standardDeviation(values) {
        const avg = this.average(values);
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = this.average(squareDiffs);
        return Math.sqrt(avgSquareDiff);
    }
    /**
     * Generate performance report
     */
    generateReport(result) {
        const { name, average, min, max, stdDev, thresholdsMet, config } = result;
        return `
Performance Benchmark Report: ${name}
=====================================

Configuration:
- Iterations: ${config.iterations}
- Warmup: ${config.warmupIterations}
- Memory Monitoring: ${config.monitorMemory}

Results:
- Execution Time: ${average.executionTime.toFixed(2)}ms (min: ${min.executionTime.toFixed(2)}ms, max: ${max.executionTime.toFixed(2)}ms, ±${stdDev.executionTime?.toFixed(2)}ms)
- Items/Second: ${average.itemsPerSecond.toFixed(0)} (min: ${min.itemsPerSecond.toFixed(0)}, max: ${max.itemsPerSecond.toFixed(0)}, ±${stdDev.itemsPerSecond?.toFixed(0)})
- Memory Usage: ${(average.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB peak
- Memory/Item: ${(average.memoryPerItem / 1024).toFixed(2)}KB

Thresholds:
- Max Execution Time: ${(config.thresholds.maxExecutionTime || Infinity)}ms - ${average.executionTime <= (config.thresholds.maxExecutionTime || Infinity) ? '✅ PASS' : '❌ FAIL'}
- Max Memory Usage: ${((config.thresholds.maxMemoryUsage || Infinity) / 1024 / 1024).toFixed(2)}MB - ${average.peakMemory.heapUsed <= (config.thresholds.maxMemoryUsage || Infinity) ? '✅ PASS' : '❌ FAIL'}
- Min Items/Second: ${config.thresholds.minItemsPerSecond || 0} - ${average.itemsPerSecond >= (config.thresholds.minItemsPerSecond || 0) ? '✅ PASS' : '❌ FAIL'}
- Max Memory/Item: ${((config.thresholds.maxMemoryPerItem || Infinity) / 1024).toFixed(2)}KB - ${average.memoryPerItem <= (config.thresholds.maxMemoryPerItem || Infinity) ? '✅ PASS' : '❌ FAIL'}

Overall: ${thresholdsMet ? '✅ ALL THRESHOLDS MET' : '❌ THRESHOLDS FAILED'}

Memory Details:
- Heap Used: ${(average.memoryAfter.heapUsed / 1024 / 1024).toFixed(2)}MB
- Heap Total: ${(average.memoryAfter.heapTotal / 1024 / 1024).toFixed(2)}MB
- RSS: ${(average.memoryAfter.rss / 1024 / 1024).toFixed(2)}MB
- External: ${(average.memoryAfter.external / 1024 / 1024).toFixed(2)}MB
`;
    }
}
/**
 * Concurrency testing utilities
 */
export class ConcurrencyTester {
    /**
     * Test concurrent execution of an operation
     */
    static async testConcurrency(operation, concurrency = 10, timeout = 30000) {
        const startTime = performance.now();
        const promises = [];
        for (let i = 0; i < concurrency; i++) {
            promises.push(this.timedOperation(operation, timeout));
        }
        const completed = await Promise.allSettled(promises);
        const totalTime = performance.now() - startTime;
        const results = [];
        const executionTimes = [];
        const errors = [];
        completed.forEach((promiseResult, index) => {
            if (promiseResult.status === 'fulfilled') {
                const { result, error, executionTime } = promiseResult.value;
                if (error) {
                    errors.push(error);
                }
                else if (result !== undefined) {
                    results.push(result);
                    executionTimes.push(executionTime);
                }
            }
            else {
                errors.push(new Error(`Promise ${index} rejected: ${promiseResult.reason}`));
            }
        });
        const successRate = (results.length / concurrency) * 100;
        return {
            results,
            executionTimes,
            totalTime,
            errors,
            successRate
        };
    }
    /**
     * Execute an operation with timeout and timing
     */
    static async timedOperation(operation, timeout) {
        const startTime = performance.now();
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Operation timeout')), timeout);
            });
            const result = await Promise.race([
                Promise.resolve(operation()),
                timeoutPromise
            ]);
            const executionTime = performance.now() - startTime;
            return { result, executionTime };
        }
        catch (error) {
            const executionTime = performance.now() - startTime;
            return { error: error instanceof Error ? error : new Error(String(error)), executionTime };
        }
    }
}
//# sourceMappingURL=performance-benchmark.js.map