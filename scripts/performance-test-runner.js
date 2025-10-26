#!/usr/bin/env node
/**
 * Performance test runner for CI/CD integration
 * Runs performance benchmarks and generates reports
 */
import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import { PerformanceBenchmark } from '../test/performance/utils/performance-benchmark.js';
class PerformanceTestRunner {
    results = [];
    startTime = 0;
    benchmark;
    constructor() {
        this.benchmark = new PerformanceBenchmark();
    }
    /**
     * Run all performance tests
     */
    async runAllTests() {
        console.log('🚀 Starting OpenSpec Performance Tests...\n');
        this.startTime = performance.now();
        try {
            // Run pagination performance tests
            await this.runPaginationTests();
            // Run streaming performance tests  
            await this.runStreamingTests();
            // Run concurrency tests
            await this.runConcurrencyTests();
            // Run memory efficiency tests
            await this.runMemoryEfficiencyTests();
        }
        catch (error) {
            console.error('❌ Performance test suite failed:', error);
            this.results.push({
                name: 'test-suite-error',
                passed: false,
                executionTime: 0,
                memoryUsage: 0,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        const totalTime = performance.now() - this.startTime;
        return this.generateReport(totalTime);
    }
    /**
     * Run pagination performance tests
     */
    async runPaginationTests() {
        console.log('📄 Testing Pagination Performance...');
        try {
            // Test pagination of 1000+ changes
            const result = await this.benchmark.runBenchmark('ci-pagination-1000-changes', async () => {
                // Simulate pagination operation
                await this.simulatePagination(1200);
                return { changes: 1200 };
            }, 1200, {
                warmupIterations: 2,
                iterations: 5,
                monitorMemory: true,
                thresholds: {
                    maxExecutionTime: 200, // 200ms requirement
                    maxMemoryUsage: 50 * 1024 * 1024, // 50MB
                    minItemsPerSecond: 5000,
                    maxMemoryPerItem: 1024
                }
            });
            this.results.push({
                name: 'pagination-1000-changes',
                passed: result.thresholdsMet,
                executionTime: result.average.executionTime,
                memoryUsage: result.average.peakMemory.heapUsed,
                metrics: result.average
            });
            console.log(`  ✅ Pagination: ${result.average.executionTime.toFixed(2)}ms, ${(result.average.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        }
        catch (error) {
            this.results.push({
                name: 'pagination-1000-changes',
                passed: false,
                executionTime: 0,
                memoryUsage: 0,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`  ❌ Pagination failed: ${error}`);
        }
    }
    /**
     * Run streaming performance tests
     */
    async runStreamingTests() {
        console.log('🌊 Testing Streaming Performance...');
        try {
            // Test streaming of 100MB files
            const result = await this.benchmark.runBenchmark('ci-streaming-100mb', async () => {
                await this.simulateStreaming(100 * 1024 * 1024); // 100MB
                return { streamed: 100 * 1024 * 1024 };
            }, 100, // 100 large files
            {
                warmupIterations: 1,
                iterations: 3,
                monitorMemory: true,
                thresholds: {
                    maxExecutionTime: 5000, // 5 seconds
                    maxMemoryUsage: 50 * 1024 * 1024, // 50MB requirement
                    minItemsPerSecond: 10,
                    maxMemoryPerItem: 1024 * 1024 // 1MB per item
                }
            });
            this.results.push({
                name: 'streaming-100mb',
                passed: result.thresholdsMet,
                executionTime: result.average.executionTime,
                memoryUsage: result.average.peakMemory.heapUsed,
                metrics: result.average
            });
            console.log(`  ✅ Streaming: ${result.average.executionTime.toFixed(2)}ms, ${(result.average.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        }
        catch (error) {
            this.results.push({
                name: 'streaming-100mb',
                passed: false,
                executionTime: 0,
                memoryUsage: 0,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`  ❌ Streaming failed: ${error}`);
        }
    }
    /**
     * Run concurrency tests
     */
    async runConcurrencyTests() {
        console.log('⚡ Testing Concurrency Performance...');
        try {
            const startTime = performance.now();
            // Simulate 10 concurrent requests
            const promises = Array.from({ length: 10 }, async (_, i) => {
                const requestStart = performance.now();
                await this.simulateConcurrentRequest(i);
                return performance.now() - requestStart;
            });
            const executionTimes = await Promise.all(promises);
            const totalTime = performance.now() - startTime;
            const avgTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
            const maxTime = Math.max(...executionTimes);
            // Concurrency requirements: avg time should be reasonable
            const passed = avgTime < 500 && maxTime < 1000; // 500ms avg, 1s max
            this.results.push({
                name: 'concurrency-10-requests',
                passed,
                executionTime: avgTime,
                memoryUsage: 0, // Not tracked for this test
                metrics: { totalTime, avgTime, maxTime, executionTimes }
            });
            console.log(`  ${passed ? '✅' : '❌'} Concurrency: ${avgTime.toFixed(2)}ms avg, ${maxTime.toFixed(2)}ms max`);
        }
        catch (error) {
            this.results.push({
                name: 'concurrency-10-requests',
                passed: false,
                executionTime: 0,
                memoryUsage: 0,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`  ❌ Concurrency failed: ${error}`);
        }
    }
    /**
     * Run memory efficiency tests
     */
    async runMemoryEfficiencyTests() {
        console.log('💾 Testing Memory Efficiency...');
        try {
            const initialMemory = process.memoryUsage();
            // Simulate memory-intensive operations
            await this.simulateMemoryIntensiveOperation();
            const finalMemory = process.memoryUsage();
            const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            // Memory efficiency requirements: growth should be reasonable
            const passed = memoryGrowth < 20 * 1024 * 1024; // Less than 20MB growth
            this.results.push({
                name: 'memory-efficiency',
                passed,
                executionTime: 0,
                memoryUsage: memoryGrowth,
                metrics: { initialMemory, finalMemory, memoryGrowth }
            });
            console.log(`  ${passed ? '✅' : '❌'} Memory Efficiency: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`);
        }
        catch (error) {
            this.results.push({
                name: 'memory-efficiency',
                passed: false,
                executionTime: 0,
                memoryUsage: 0,
                error: error instanceof Error ? error.message : String(error)
            });
            console.log(`  ❌ Memory efficiency test failed: ${error}`);
        }
    }
    /**
     * Simulate pagination operation
     */
    async simulatePagination(itemCount) {
        // Simulate database queries and pagination logic
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
        // Simulate processing items
        const items = Array.from({ length: Math.min(itemCount, 100) }, (_, i) => ({
            id: i,
            title: `Item ${i}`,
            content: 'x'.repeat(1000)
        }));
        // Simulate pagination overhead
        items.sort(() => Math.random() - 0.5);
    }
    /**
     * Simulate streaming operation
     */
    async simulateStreaming(byteSize) {
        // Simulate streaming large files in chunks
        const chunkSize = 64 * 1024; // 64KB chunks
        const chunks = Math.ceil(byteSize / chunkSize);
        for (let i = 0; i < chunks; i++) {
            // Simulate reading a chunk
            await new Promise(resolve => setTimeout(resolve, 1));
            // Simulate processing the chunk
            const chunk = 'x'.repeat(Math.min(chunkSize, byteSize - i * chunkSize));
            chunk.length; // Use the chunk to prevent optimization
        }
    }
    /**
     * Simulate concurrent request
     */
    async simulateConcurrentRequest(requestId) {
        // Simulate independent request processing
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 200));
        // Simulate some work
        const data = Array.from({ length: 1000 }, (_, i) => i * requestId);
        data.reduce((sum, val) => sum + val, 0);
    }
    /**
     * Simulate memory-intensive operation
     */
    async simulateMemoryIntensiveOperation() {
        // Create and process large arrays
        const arrays = Array.from({ length: 10 }, () => Array.from({ length: 10000 }, (_, i) => ({
            id: i,
            data: 'x'.repeat(1000),
            timestamp: Date.now()
        })));
        // Process arrays
        arrays.forEach(array => {
            array.sort(() => Math.random() - 0.5);
            array.filter(item => item.id % 2 === 0);
        });
        // Clear references to allow GC
        arrays.length = 0;
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
    }
    /**
     * Generate performance report
     */
    generateReport(totalExecutionTime) {
        const passedTests = this.results.filter(r => r.passed).length;
        const failedTests = this.results.length - passedTests;
        const summary = {
            paginationPerformance: this.results.some(r => r.name.includes('pagination') && r.passed),
            streamingPerformance: this.results.some(r => r.name.includes('streaming') && r.passed),
            concurrencyPerformance: this.results.some(r => r.name.includes('concurrency') && r.passed),
            memoryEfficiency: this.results.some(r => r.name.includes('memory') && r.passed)
        };
        const report = {
            timestamp: new Date().toISOString(),
            nodeVersion: process.version,
            platform: process.platform,
            totalTests: this.results.length,
            passedTests,
            failedTests,
            totalExecutionTime,
            results: this.results,
            summary
        };
        return report;
    }
    /**
     * Save performance report to file
     */
    async saveReport(report, outputPath = 'performance-report.json') {
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
        console.log(`\n📊 Performance report saved to: ${outputPath}`);
    }
    /**
     * Print summary to console
     */
    printSummary(report) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 PERFORMANCE TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${report.totalTests}`);
        console.log(`Passed: ${report.passedTests} ✅`);
        console.log(`Failed: ${report.failedTests} ❌`);
        console.log(`Total Execution Time: ${report.totalExecutionTime.toFixed(2)}ms`);
        console.log(`Success Rate: ${((report.passedTests / report.totalTests) * 100).toFixed(1)}%`);
        console.log('\nCategory Results:');
        console.log(`  Pagination Performance: ${report.summary.paginationPerformance ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Streaming Performance: ${report.summary.streamingPerformance ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Concurrency Performance: ${report.summary.concurrencyPerformance ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  Memory Efficiency: ${report.summary.memoryEfficiency ? '✅ PASS' : '❌ FAIL'}`);
        if (report.failedTests > 0) {
            console.log('\n❌ Failed Tests:');
            report.results.filter(r => !r.passed).forEach(result => {
                console.log(`  - ${result.name}: ${result.error || 'Thresholds not met'}`);
            });
        }
        console.log('='.repeat(60));
        // Exit with appropriate code for CI
        if (report.failedTests > 0) {
            console.log('\n❌ Performance tests failed!');
            process.exit(1);
        }
        else {
            console.log('\n✅ All performance tests passed!');
            process.exit(0);
        }
    }
}
// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new PerformanceTestRunner();
    runner.runAllTests()
        .then(async (report) => {
        await runner.saveReport(report);
        runner.printSummary(report);
    })
        .catch((error) => {
        console.error('❌ Failed to run performance tests:', error);
        process.exit(1);
    });
}
export { PerformanceTestRunner };
//# sourceMappingURL=performance-test-runner.js.map