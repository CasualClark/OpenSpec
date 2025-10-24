/**
 * Performance benchmarking utilities for OpenSpec
 * Provides comprehensive performance measurement and monitoring capabilities
 */
import { MemoryStats } from '../../../src/stdio/resources/memory-monitor.js';
/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
    /** Execution time in milliseconds */
    executionTime: number;
    /** Memory usage before operation */
    memoryBefore: MemoryStats;
    /** Memory usage after operation */
    memoryAfter: MemoryStats;
    /** Peak memory usage during operation */
    peakMemory: MemoryStats;
    /** Number of items processed */
    itemsProcessed: number;
    /** Items per second */
    itemsPerSecond: number;
    /** Memory usage per item */
    memoryPerItem: number;
    /** Custom metrics */
    customMetrics?: Record<string, number>;
}
/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
    /** Number of warmup iterations */
    warmupIterations?: number;
    /** Number of benchmark iterations */
    iterations?: number;
    /** Memory monitoring enabled */
    monitorMemory?: boolean;
    /** Custom thresholds */
    thresholds?: {
        maxExecutionTime?: number;
        maxMemoryUsage?: number;
        minItemsPerSecond?: number;
        maxMemoryPerItem?: number;
    };
}
/**
 * Benchmark result
 */
export interface BenchmarkResult {
    /** Benchmark name */
    name: string;
    /** All iteration metrics */
    iterations: PerformanceMetrics[];
    /** Average metrics */
    average: PerformanceMetrics;
    /** Minimum metrics */
    min: PerformanceMetrics;
    /** Maximum metrics */
    max: PerformanceMetrics;
    /** Standard deviation */
    stdDev: Partial<PerformanceMetrics>;
    /** Whether thresholds were met */
    thresholdsMet: boolean;
    /** Configuration used */
    config: Required<BenchmarkConfig>;
}
/**
 * Performance benchmark runner
 */
export declare class PerformanceBenchmark {
    private memoryMonitor;
    private metrics;
    private peakMemory;
    constructor();
    /**
     * Run a performance benchmark
     */
    runBenchmark<T>(name: string, operation: () => Promise<T> | T, itemCount?: number, config?: BenchmarkConfig): Promise<BenchmarkResult>;
    /**
     * Measure a single operation
     */
    private measureOperation;
    /**
     * Setup peak memory tracking
     */
    private setupPeakMemoryTracking;
    /**
     * Calculate benchmark statistics
     */
    private calculateResult;
    /**
     * Calculate average of numbers
     */
    private average;
    /**
     * Calculate average of memory stats
     */
    private averageMemory;
    /**
     * Calculate standard deviation
     */
    private standardDeviation;
    /**
     * Generate performance report
     */
    generateReport(result: BenchmarkResult): string;
}
/**
 * Concurrency testing utilities
 */
export declare class ConcurrencyTester {
    /**
     * Test concurrent execution of an operation
     */
    static testConcurrency<T>(operation: () => Promise<T> | T, concurrency?: number, timeout?: number): Promise<{
        results: T[];
        executionTimes: number[];
        totalTime: number;
        errors: Error[];
        successRate: number;
    }>;
    /**
     * Execute an operation with timeout and timing
     */
    private static timedOperation;
}
//# sourceMappingURL=performance-benchmark.d.ts.map