/**
 * Performance benchmarks for pagination functionality
 * Tests pagination performance with 1000+ changes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PerformanceBenchmark, ConcurrencyTester } from './utils/performance-benchmark.js';
import { StreamingChangesResourceProvider } from '../../src/stdio/resources/streaming-changes-resource.js';
import { createTestSecurity, createTestLogger } from './helpers/test-utils.js';

describe('Pagination Performance Benchmarks', () => {
  const testDir = path.join(process.cwd(), 'test-performance-tmp');
  const openspecDir = path.join(testDir, 'openspec');
  const changesDir = path.join(openspecDir, 'changes');
  const benchmark = new PerformanceBenchmark();
  let security: any;
  let logger: any;

  beforeAll(async () => {
    // Setup test environment
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(openspecDir, { recursive: true });
    await fs.mkdir(changesDir, { recursive: true });

    security = createTestSecurity(testDir);
    logger = createTestLogger();

    // Create 1000+ test changes for pagination testing
    await createTestChanges(1200); // Create 1200 changes
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should paginate 1000+ changes in under 200ms', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);

    const result = await benchmark.runBenchmark(
      'pagination-1000-changes',
      async () => {
        const response = await provider.read();
        return response;
      },
      1200, // Number of changes
      {
        warmupIterations: 3,
        iterations: 10,
        monitorMemory: true,
        thresholds: {
          maxExecutionTime: 200, // 200ms requirement
          maxMemoryUsage: 50 * 1024 * 1024, // 50MB
          minItemsPerSecond: 5000, // At least 5000 changes/second
          maxMemoryPerItem: 1024 // 1KB per change
        }
      }
    );

    console.log(benchmark.generateReport(result));

    // Verify performance requirements
    expect(result.thresholdsMet).toBe(true);
    expect(result.average.executionTime).toBeLessThan(200);
    expect(result.average.itemsPerSecond).toBeGreaterThan(5000);
  });

  it('should handle pagination with different page sizes efficiently', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);
    const pageSizes = [10, 50, 100, 500, 1000];
    const results: Array<{ pageSize: number; result: any }> = [] as any;

    for (const pageSize of pageSizes) {
      const result = await benchmark.runBenchmark(
        `pagination-page-size-${pageSize}`,
        async () => {
          const response = await provider.read();
          return response;
        },
        pageSize,
        {
          warmupIterations: 2,
          iterations: 5,
          monitorMemory: true,
          thresholds: {
            maxExecutionTime: 200,
            maxMemoryUsage: 50 * 1024 * 1024,
            minItemsPerSecond: 1000,
            maxMemoryPerItem: 2048
          }
        }
      );

      results.push({ pageSize, result });
      console.log(`\nPage Size ${pageSize}:`);
      console.log(`  Time: ${result.average.executionTime.toFixed(2)}ms`);
      console.log(`  Memory: ${(result.average.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Items/sec: ${result.average.itemsPerSecond.toFixed(0)}`);
    }

    // Verify that performance scales reasonably
    const times = results.map(r => r.result.average.executionTime);
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    
    // Performance shouldn't degrade more than 3x between smallest and largest page sizes
    expect(maxTime / minTime).toBeLessThan(3);
  });

  it('should handle concurrent pagination requests efficiently', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);

    const concurrencyResult = await ConcurrencyTester.testConcurrency(
      async () => {
        const response = await provider.read();
        return response;
      },
      10, // 10 concurrent requests
      30000 // 30 second timeout
    );

    console.log('\nConcurrency Test Results:');
    console.log(`  Success Rate: ${concurrencyResult.successRate}%`);
    console.log(`  Total Time: ${concurrencyResult.totalTime.toFixed(2)}ms`);
    console.log(`  Average Time: ${(concurrencyResult.totalTime / 10).toFixed(2)}ms`);
    console.log(`  Errors: ${concurrencyResult.errors.length}`);

    if (concurrencyResult.executionTimes.length > 0) {
      const avgTime = concurrencyResult.executionTimes.reduce((sum, time) => sum + time, 0) / concurrencyResult.executionTimes.length;
      console.log(`  Average Request Time: ${avgTime.toFixed(2)}ms`);
      
      // Concurrent requests shouldn't be significantly slower than single requests
      expect(avgTime).toBeLessThan(500); // 500ms max for concurrent requests
    }

    // All requests should succeed
    expect(concurrencyResult.successRate).toBe(100);
    expect(concurrencyResult.errors.length).toBe(0);
  });

  it('should maintain performance under load', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);
    const loadTestResults: any[] = [];

    // Test increasing load levels
    for (const concurrency of [1, 5, 10, 15]) {
      const result = await ConcurrencyTester.testConcurrency(
        async () => {
          const response = await provider.read();
          return response;
        },
        concurrency,
        45000
      );

      loadTestResults.push({ concurrency, result });
      
      console.log(`\nLoad Test - ${concurrency} concurrent requests:`);
      console.log(`  Success Rate: ${result.successRate}%`);
      console.log(`  Total Time: ${result.totalTime.toFixed(2)}ms`);
      
      if (result.executionTimes.length > 0) {
        const avgTime = result.executionTimes.reduce((sum, time) => sum + time, 0) / result.executionTimes.length;
        console.log(`  Average Time: ${avgTime.toFixed(2)}ms`);
      }
    }

    // Verify that performance doesn't degrade significantly under load
    const singleRequestTime = loadTestResults[0].result.totalTime;
    const tenConcurrentTime = loadTestResults.find(r => r.concurrency === 10)?.result.totalTime || 0;
    
    // 10 concurrent requests shouldn't take more than 5x the single request time
    if (tenConcurrentTime > 0) {
      expect(tenConcurrentTime / singleRequestTime).toBeLessThan(5);
    }

    // All load levels should maintain high success rates
    loadTestResults.forEach(({ concurrency, result }) => {
      expect(result.successRate).toBeGreaterThan(90);
    });
  });

  it('should handle memory efficiently during pagination', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);

    const result = await benchmark.runBenchmark(
      'pagination-memory-efficiency',
      async () => {
        const response = await provider.read();
        return response;
      },
      1200,
      {
        warmupIterations: 3,
        iterations: 10,
        monitorMemory: true,
        thresholds: {
          maxExecutionTime: 200,
          maxMemoryUsage: 50 * 1024 * 1024, // 50MB requirement
          minItemsPerSecond: 1000,
          maxMemoryPerItem: 1024
        }
      }
    );

    console.log('\nMemory Efficiency Test:');
    console.log(`  Peak Memory: ${(result.average.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Memory per Item: ${(result.average.memoryPerItem / 1024).toFixed(2)}KB`);
    console.log(`  Memory Growth: ${((result.average.memoryAfter.heapUsed - result.average.memoryBefore.heapUsed) / 1024 / 1024).toFixed(2)}MB`);

    // Verify memory requirements
    expect(result.average.peakMemory.heapUsed).toBeLessThan(50 * 1024 * 1024);
    expect(result.average.memoryPerItem).toBeLessThan(1024);
    
    // Memory growth should be reasonable
    const memoryGrowth = result.average.memoryAfter.heapUsed - result.average.memoryBefore.heapUsed;
    expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024); // Less than 20MB growth
  });

  /**
   * Create test changes for pagination testing
   */
  async function createTestChanges(count: number): Promise<void> {
    console.log(`Creating ${count} test changes...`);
    
    for (let i = 0; i < count; i++) {
      const changeDir = path.join(changesDir, `change-${String(i).padStart(4, '0')}`);
      await fs.mkdir(changeDir, { recursive: true });

      // Create proposal.md
      const proposalContent = `# Change ${i}

## Description
This is test change ${i} for pagination performance testing.

## Requirements
- Requirement 1 for change ${i}
- Requirement 2 for change ${i}
- Requirement 3 for change ${i}

## Implementation
Implementation details for change ${i}.
`;
      await fs.writeFile(path.join(changeDir, 'proposal.md'), proposalContent);

      // Create specs directory and files
      const specsDir = path.join(changeDir, 'specs');
      await fs.mkdir(specsDir, { recursive: true });
      await fs.writeFile(path.join(specsDir, 'spec1.md'), `# Spec for change ${i}\n\nSpec content here.`);
      await fs.writeFile(path.join(specsDir, 'spec2.md'), `# Additional spec for change ${i}\n\nMore spec content.`);

      // Create tasks directory and files
      const tasksDir = path.join(changeDir, 'tasks');
      await fs.mkdir(tasksDir, { recursive: true });
      await fs.writeFile(
        path.join(tasksDir, 'task1.json'),
        JSON.stringify({
          name: `Task 1 for change ${i}`,
          description: `Task description for change ${i}`,
          status: 'pending'
        }, null, 2)
      );

      // Create deltas directory and files
      const deltasDir = path.join(changeDir, 'deltas');
      await fs.mkdir(deltasDir, { recursive: true });
      await fs.writeFile(path.join(deltasDir, 'delta1.diff'), `--- a/file.js\n+++ b/file.js\n@@ -1,3 +1,4 @@\n+// Change ${i}\n function test() {\n   return true;\n }\n`);

      // Create lock file for some changes
      if (i % 10 === 0) {
        await fs.writeFile(
          path.join(changeDir, 'lock.json'),
          JSON.stringify({
            lockedBy: 'test-user',
            lockedAt: new Date().toISOString(),
            reason: 'Test lock'
          }, null, 2)
        );
      }

      // Progress indicator
      if ((i + 1) % 100 === 0) {
        console.log(`  Created ${i + 1}/${count} changes...`);
      }
    }
    
    console.log(`Successfully created ${count} test changes`);
  }
});