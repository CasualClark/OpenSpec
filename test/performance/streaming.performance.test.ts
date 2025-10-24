/**
 * Performance benchmarks for streaming functionality
 * Tests memory usage during streaming of large files (100MB)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PerformanceBenchmark, ConcurrencyTester } from './utils/performance-benchmark.js';
import { StreamingChangesResourceProvider } from '../../src/stdio/resources/streaming-changes-resource.js';
import { MemoryMonitor } from '../../src/stdio/resources/memory-monitor.js';
import { createTestSecurity, createTestLogger, createTempDir, cleanupTempDir, createTestFile } from './helpers/test-utils.js';

describe('Streaming Performance Benchmarks', () => {
  const testDir = path.join(process.cwd(), 'test-streaming-tmp');
  const openspecDir = path.join(testDir, 'openspec');
  const changesDir = path.join(openspecDir, 'changes');
  const benchmark = new PerformanceBenchmark();
  let security: any;
  let logger: any;
  let memoryMonitor: MemoryMonitor;

  beforeAll(async () => {
    // Setup test environment
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(openspecDir, { recursive: true });
    await fs.mkdir(changesDir, { recursive: true });

    security = createTestSecurity(testDir);
    logger = createTestLogger();
    memoryMonitor = new MemoryMonitor({
      warning: 60,
      critical: 80,
      maxAbsolute: 50 * 1024 * 1024, // 50MB requirement
      checkInterval: 500
    });

    // Create test changes with large files for streaming tests
    await createLargeTestFiles();
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should stream 100MB files with memory usage below 50MB', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);
    
    // Start memory monitoring
    memoryMonitor.startMonitoring();
    const initialMemory = memoryMonitor.getCurrentStats();

    const result = await benchmark.runBenchmark(
      'stream-100mb-files',
      async () => {
        const response = await provider.read();
        return response;
      },
      50, // 50 changes with large files
      {
        warmupIterations: 2,
        iterations: 5,
        monitorMemory: true,
        thresholds: {
          maxExecutionTime: 5000, // 5 seconds for large files
          maxMemoryUsage: 50 * 1024 * 1024, // 50MB requirement
          minItemsPerSecond: 10, // At least 10 items/second for large files
          maxMemoryPerItem: 1024 * 1024 // 1MB per item
        }
      }
    );

    const finalMemory = memoryMonitor.getCurrentStats();
    memoryMonitor.stopMonitoring();

    console.log('\nStreaming Memory Usage Test:');
    console.log(`  Initial Memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Final Memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Peak Memory: ${(result.average.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Memory Growth: ${((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`);
    console.log(benchmark.generateReport(result));

    // Verify memory requirements
    expect(result.thresholdsMet).toBe(true);
    expect(result.average.peakMemory.heapUsed).toBeLessThan(50 * 1024 * 1024);
    expect(finalMemory.heapUsed - initialMemory.heapUsed).toBeLessThan(20 * 1024 * 1024); // Less than 20MB growth
  });

  it('should handle streaming of multiple large files concurrently', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);
    
    memoryMonitor.startMonitoring();
    const initialMemory = memoryMonitor.getCurrentStats();

    const concurrencyResult = await ConcurrencyTester.testConcurrency(
      async () => {
        const response = await provider.read();
        return response;
      },
      10, // 10 concurrent streaming operations
      60000 // 60 second timeout for large files
    );

    const finalMemory = memoryMonitor.getCurrentStats();
    memoryMonitor.stopMonitoring();

    console.log('\nConcurrent Streaming Test:');
    console.log(`  Success Rate: ${concurrencyResult.successRate}%`);
    console.log(`  Total Time: ${concurrencyResult.totalTime.toFixed(2)}ms`);
    console.log(`  Initial Memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Final Memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Memory Growth: ${((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Errors: ${concurrencyResult.errors.length}`);

    // Verify concurrent streaming requirements
    expect(concurrencyResult.successRate).toBe(100);
    expect(concurrencyResult.errors.length).toBe(0);
    expect(finalMemory.heapUsed - initialMemory.heapUsed).toBeLessThan(40 * 1024 * 1024); // Less than 40MB growth for 10 concurrent operations
  });

  it('should maintain memory efficiency during progressive streaming', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);
    
    memoryMonitor.startMonitoring();
    const memorySnapshots: Array<{ time: number; memory: number }> = [];
    
    // Capture memory every 100ms during streaming
    const memoryInterval = setInterval(() => {
      const stats = memoryMonitor.getCurrentStats();
      memorySnapshots.push({
        time: Date.now(),
        memory: stats.heapUsed
      });
    }, 100);

    const result = await benchmark.runBenchmark(
      'progressive-streaming',
      async () => {
        const response = await provider.read();
        return response;
      },
      50,
      {
        warmupIterations: 1,
        iterations: 3,
        monitorMemory: true,
        thresholds: {
          maxExecutionTime: 5000,
          maxMemoryUsage: 50 * 1024 * 1024,
          minItemsPerSecond: 10,
          maxMemoryPerItem: 1024 * 1024
        }
      }
    );

    clearInterval(memoryInterval);
    memoryMonitor.stopMonitoring();

    // Analyze memory patterns
    const maxMemory = Math.max(...memorySnapshots.map(s => s.memory));
    const minMemory = Math.min(...memorySnapshots.map(s => s.memory));
    const memoryVariation = maxMemory - minMemory;

    console.log('\nProgressive Streaming Memory Analysis:');
    console.log(`  Memory Snapshots: ${memorySnapshots.length}`);
    console.log(`  Min Memory: ${(minMemory / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Max Memory: ${(maxMemory / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Memory Variation: ${(memoryVariation / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Average Memory: ${(memorySnapshots.reduce((sum, s) => sum + s.memory, 0) / memorySnapshots.length / 1024 / 1024).toFixed(2)}MB`);

    // Memory should be stable during streaming (variation should be reasonable)
    expect(memoryVariation).toBeLessThan(10 * 1024 * 1024); // Less than 10MB variation
    expect(maxMemory).toBeLessThan(50 * 1024 * 1024); // Peak memory under 50MB
  });

  it('should handle streaming with different chunk sizes efficiently', async () => {
    const chunkSizes = [256, 512, 1024, 2048, 4096];
    const results: any[] = [];

    for (const chunkSize of chunkSizes) {
      // Create provider with specific chunk size
      const provider = new StreamingChangesResourceProvider(security, logger, {
        chunkSize,
        streamingThreshold: 1024,
        maxMemoryUsage: 50 * 1024 * 1024,
        progressInterval: 10
      });

      const result = await benchmark.runBenchmark(
        `streaming-chunk-size-${chunkSize}`,
        async () => {
          const response = await provider.read();
          return response;
        },
        50,
        {
          warmupIterations: 1,
          iterations: 3,
          monitorMemory: true,
          thresholds: {
            maxExecutionTime: 10000,
            maxMemoryUsage: 50 * 1024 * 1024,
            minItemsPerSecond: 5,
            maxMemoryPerItem: 2 * 1024 * 1024
          }
        }
      );

      results.push({ chunkSize, result });
      
      console.log(`\nChunk Size ${chunkSize}:`);
      console.log(`  Time: ${result.average.executionTime.toFixed(2)}ms`);
      console.log(`  Memory: ${(result.average.peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Items/sec: ${result.average.itemsPerSecond.toFixed(0)}`);

      await provider.cleanup();
    }

    // Analyze chunk size performance
    const times = results.map(r => r.result.average.executionTime);
    const memoryUsage = results.map(r => r.result.average.peakMemory.heapUsed);
    
    console.log('\nChunk Size Analysis:');
    console.log(`  Fastest Chunk Size: ${chunkSizes[times.indexOf(Math.min(...times))]}`);
    console.log(`  Most Memory Efficient: ${chunkSizes[memoryUsage.indexOf(Math.min(...memoryUsage))]}`);

    // All chunk sizes should meet requirements
    results.forEach(({ chunkSize, result }) => {
      expect(result.thresholdsMet).toBe(true);
      expect(result.average.peakMemory.heapUsed).toBeLessThan(50 * 1024 * 1024);
    });
  });

  it('should recover gracefully from memory pressure during streaming', async () => {
    const provider = new StreamingChangesResourceProvider(security, logger);
    
    // Create memory pressure by setting low limits
    const pressureMonitor = new MemoryMonitor({
      warning: 30,
      critical: 40,
      maxAbsolute: 20 * 1024 * 1024, // 20MB limit to trigger pressure
      checkInterval: 200
    });

    let breachCount = 0;
    pressureMonitor.onBreach(() => {
      breachCount++;
    });

    pressureMonitor.startMonitoring();

    const result = await benchmark.runBenchmark(
      'streaming-under-pressure',
      async () => {
        const response = await provider.read();
        return response;
      },
      50,
      {
        warmupIterations: 1,
        iterations: 3,
        monitorMemory: true,
        thresholds: {
          maxExecutionTime: 15000, // Longer timeout due to pressure
          maxMemoryUsage: 25 * 1024 * 1024, // Allow higher memory under pressure
          minItemsPerSecond: 5, // Lower throughput expectation
          maxMemoryPerItem: 2 * 1024 * 1024
        }
      }
    );

    pressureMonitor.stopMonitoring();

    console.log('\nMemory Pressure Test:');
    console.log(`  Breach Events: ${breachCount}`);
    console.log(`  Final Memory: ${(result.average.memoryAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Success: ${result.thresholdsMet}`);

    // Should handle memory pressure gracefully
    expect(breachCount).toBeGreaterThan(0); // Should detect pressure
    expect(result.average.memoryAfter.heapUsed).toBeLessThan(25 * 1024 * 1024); // Should recover
  });

  /**
   * Create test changes with large files for streaming tests
   */
  async function createLargeTestFiles(): Promise<void> {
    console.log('Creating test changes with large files...');
    
    // Create 50 changes, each with ~2MB of content (total ~100MB)
    for (let i = 0; i < 50; i++) {
      const changeDir = path.join(changesDir, `large-change-${String(i).padStart(3, '0')}`);
      await fs.mkdir(changeDir, { recursive: true });

      // Create large proposal file (~2MB)
      const largeContent = `# Large Change ${i}

## Description
This is a large test change ${i} for streaming performance testing.

## Large Content Section
${Array.from({ length: 1000 }, (_, j) => `
### Section ${j}
This is section ${j} with a lot of content. ${'x'.repeat(1000)}

${Array.from({ length: 10 }, (_, k) => `
- Item ${k} with lots of repeated text to make the file larger. ${'y'.repeat(500)}
- Another item ${k} with more content. ${'z'.repeat(500)}
- Yet another item ${k} to increase file size. ${'a'.repeat(500)}
`).join('\n')}

More content for section ${j}. ${'b'.repeat(1000)}
`).join('\n')}

## Implementation Details
${Array.from({ length: 100 }, (_, j) => `
Implementation step ${j}: ${'c'.repeat(2000)}

${Array.from({ length: 5 }, (_, k) => `
- Detail ${k}: ${'d'.repeat(1000)}
- More details ${k}: ${'e'.repeat(1000)}
`).join('\n')}
`).join('\n')}

## Requirements
${Array.from({ length: 50 }, (_, j) => `
Requirement ${j}: This is a detailed requirement with lots of descriptive text to make the file larger. ${'f'.repeat(800)}

Additional details for requirement ${j}: ${'g'.repeat(800)}
`).join('\n')}

## Testing
${Array.from({ length: 30 }, (_, j) => `
Test case ${j}: ${'h'.repeat(1500)}

Expected results for test ${j}: ${'i'.repeat(1500)}
`).join('\n')}
`;

      await fs.writeFile(path.join(changeDir, 'proposal.md'), largeContent);

      // Create additional large files
      const specsDir = path.join(changeDir, 'specs');
      await fs.mkdir(specsDir, { recursive: true });
      
      const specContent = `# Specification for Large Change ${i}

${Array.from({ length: 200 }, (_, j) => `
## Specification Section ${j}
${'j'.repeat(3000)}

${Array.from({ length: 10 }, (_, k) => `
- Spec item ${k}: ${'k'.repeat(1000)}
- Additional spec details ${k}: ${'l'.repeat(1000)}
`).join('\n')}
`).join('\n')}
`;
      await fs.writeFile(path.join(specsDir, 'large-spec.md'), specContent);

      // Create tasks with large descriptions
      const tasksDir = path.join(changeDir, 'tasks');
      await fs.mkdir(tasksDir, { recursive: true });
      
      const taskContent = {
        name: `Large Task ${i}`,
        description: 'm'.repeat(5000),
        requirements: Array.from({ length: 20 }, (_, j) => `Requirement ${j}: ${'n'.repeat(500)}`),
        implementation: 'o'.repeat(8000),
        testing: Array.from({ length: 15 }, (_, j) => `Test ${j}: ${'p'.repeat(600)}`)
      };
      
      await fs.writeFile(path.join(tasksDir, 'large-task.json'), JSON.stringify(taskContent, null, 2));

      // Create large delta files
      const deltasDir = path.join(changeDir, 'deltas');
      await fs.mkdir(deltasDir, { recursive: true });
      
      const deltaContent = Array.from({ length: 100 }, (_, j) => `
--- a/file${j}.js
+++ b/file${j}.js
@@ -1,50 +1,50 @@
 function example${j}() {
-  // Old code ${'q'.repeat(1000)}
+  // New code ${'r'.repeat(1000)}
   return true;
 }
 
-${'s'.repeat(2000)}
+${'t'.repeat(2000)}
 
 module.exports = example${j};
`).join('\n');
      
      await fs.writeFile(path.join(deltasDir, 'large-delta.diff'), deltaContent);

      if ((i + 1) % 10 === 0) {
        console.log(`  Created ${i + 1}/50 large changes...`);
      }
    }
    
    console.log('Successfully created 50 large test changes (~100MB total)');
  }
});