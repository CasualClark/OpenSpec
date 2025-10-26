#!/usr/bin/env node
/**
 * Performance test runner for CI/CD integration
 * Runs performance benchmarks and generates reports
 */
interface PerformanceTestResult {
    name: string;
    passed: boolean;
    executionTime: number;
    memoryUsage: number;
    error?: string;
    metrics?: any;
}
interface PerformanceReport {
    timestamp: string;
    nodeVersion: string;
    platform: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    totalExecutionTime: number;
    results: PerformanceTestResult[];
    summary: {
        paginationPerformance: boolean;
        streamingPerformance: boolean;
        concurrencyPerformance: boolean;
        memoryEfficiency: boolean;
    };
}
declare class PerformanceTestRunner {
    private results;
    private startTime;
    private benchmark;
    constructor();
    /**
     * Run all performance tests
     */
    runAllTests(): Promise<PerformanceReport>;
    /**
     * Run pagination performance tests
     */
    private runPaginationTests;
    /**
     * Run streaming performance tests
     */
    private runStreamingTests;
    /**
     * Run concurrency tests
     */
    private runConcurrencyTests;
    /**
     * Run memory efficiency tests
     */
    private runMemoryEfficiencyTests;
    /**
     * Simulate pagination operation
     */
    private simulatePagination;
    /**
     * Simulate streaming operation
     */
    private simulateStreaming;
    /**
     * Simulate concurrent request
     */
    private simulateConcurrentRequest;
    /**
     * Simulate memory-intensive operation
     */
    private simulateMemoryIntensiveOperation;
    /**
     * Generate performance report
     */
    private generateReport;
    /**
     * Save performance report to file
     */
    saveReport(report: PerformanceReport, outputPath?: string): Promise<void>;
    /**
     * Print summary to console
     */
    printSummary(report: PerformanceReport): void;
}
export { PerformanceTestRunner, PerformanceReport };
//# sourceMappingURL=performance-test-runner.d.ts.map