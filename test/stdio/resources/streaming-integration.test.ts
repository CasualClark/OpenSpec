/**
 * Integration tests for streaming functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StreamingChangesResourceProvider } from '../../../src/stdio/resources/streaming-changes-resource.js';
import { StreamingReader } from '../../../src/stdio/resources/streaming-reader.js';
import { MemoryMonitor } from '../../../src/stdio/resources/memory-monitor.js';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('Streaming Integration Tests', () => {
  let testDir: string;
  let changesDir: string;
  let security: any;
  let logMessages: string[] = [];

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-tmp', 'streaming-integration-test');
    changesDir = path.join(testDir, 'openspec', 'changes');
    
    // Clean up any existing test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
    
    await fs.mkdir(changesDir, { recursive: true });

    security = {
      allowedPaths: [testDir, process.cwd()],
      sandboxRoot: testDir,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedSchemas: ['resource.read']
    };

    logMessages = [];
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('End-to-End Streaming Workflow', () => {
    it('should handle complete workflow with large files', async () => {
      const logger = (level: string, message: string) => {
        logMessages.push(`[${level}] ${message}`);
      };

      const provider = new StreamingChangesResourceProvider(security, logger, {
        chunkSize: 2048, // 2KB chunks
        maxMemoryUsage: 10 * 1024 * 1024, // 10MB limit
        streamingThreshold: 1024 // 1KB threshold
      });

      try {
        // Create multiple changes with varying file sizes
        const changes = [
          { name: 'small-change', size: 512 }, // Small file
          { name: 'medium-change', size: 5 * 1024 }, // Medium file
          { name: 'large-change', size: 50 * 1024 } // Large file
        ];

        for (const change of changes) {
          const changeDir = path.join(changesDir, change.name);
          await fs.mkdir(changeDir, { recursive: true });
          
          // Create proposal with specified size
          const content = `# ${change.name}\n\n` + 'x'.repeat(change.size);
          await fs.writeFile(path.join(changeDir, 'proposal.md'), content);
          
          // Add some additional files
          await fs.mkdir(path.join(changeDir, 'specs'), { recursive: true });
          await fs.writeFile(path.join(changeDir, 'specs', 'spec.md'), '# Specification');
          
          await fs.mkdir(path.join(changeDir, 'tasks'), { recursive: true });
          await fs.writeFile(path.join(changeDir, 'tasks', 'task.json'), '{"name": "task"}');
        }

        // Read all changes
        const result = await provider.read();
        const data = JSON.parse(result.text || '{}');

        // Verify all changes were processed
        expect(data.changes).toHaveLength(3);
        expect(data.total).toBe(3);
        expect(data.memoryStats).toBeDefined();
        expect(data.processingTime).toBeGreaterThan(0);

        // Verify streaming was used for large files
        const largeChange = data.changes.find((c: any) => c.slug === 'large-change');
        expect(largeChange.proposalSize).toBeGreaterThan(1024);
        expect(largeChange.proposalChunks).toBeGreaterThan(1);

        // Verify buffered reading for small files
        const smallChange = data.changes.find((c: any) => c.slug === 'small-change');
        expect(smallChange.proposalSize).toBeLessThan(1024);
        expect(smallChange.proposalChunks).toBeUndefined();

        // Check that appropriate logging occurred
        expect(logMessages.some(msg => msg.includes('Streaming large proposal file'))).toBe(true);
        expect(logMessages.some(msg => msg.includes('Proposal reading progress'))).toBe(true);

      } finally {
        provider.cleanup();
      }
    });

    it('should maintain memory limits during concurrent operations', async () => {
      const memoryMonitor = new MemoryMonitor({
        warning: 70,
        critical: 85,
        maxAbsolute: 20 * 1024 * 1024, // 20MB
        checkInterval: 100
      });

      const breachEvents: any[] = [];
      memoryMonitor.onBreach((event) => {
        breachEvents.push(event);
      });

      memoryMonitor.startMonitoring();

      try {
        // Create multiple large changes to stress test memory usage
        const promises = [];
        for (let i = 0; i < 5; i++) {
          const changeDir = path.join(changesDir, `concurrent-change-${i}`);
          await fs.mkdir(changeDir, { recursive: true });
          
          // Create large proposal
          const content = `# Concurrent Change ${i}\n\n` + 'x'.repeat(20 * 1024); // 20KB each
          await fs.writeFile(path.join(changeDir, 'proposal.md'), content);
        }

        // Process all changes concurrently
        const provider = new StreamingChangesResourceProvider(security, console.log);
        
        const startTime = Date.now();
        const result = await provider.read();
        const endTime = Date.now();

        const data = JSON.parse(result.text || '{}');
        
        expect(data.changes).toHaveLength(5);
        expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

        // Check memory usage stayed within bounds
        const finalStats = memoryMonitor.getCurrentStats();
        expect(finalStats.heapUsed).toBeLessThan(20 * 1024 * 1024); // Should be under 20MB

        // Should not have exceeded maximum memory
        const maxBreaches = breachEvents.filter(e => e.type === 'maximum');
        expect(maxBreaches).toHaveLength(0);

        provider.cleanup();

      } finally {
        memoryMonitor.stopMonitoring();
      }
    });

    it('should provide progress feedback for IDE integration', async () => {
      const progressEvents: any[] = [];
      
      const streamingReader = new StreamingReader(security, console.log, {
        chunkSize: 512,
        maxMemoryUsage: 5 * 1024 * 1024,
        streamingThreshold: 256,
        progressInterval: 1 // Report every chunk
      });

      // Create a large file for testing
      const testFile = path.join(testDir, 'large-test.txt');
      const largeContent = 'x'.repeat(5 * 1024); // 5KB
      await fs.writeFile(testFile, largeContent);

      // Read with progress tracking
      const result = await streamingReader.readFile(testFile, (progress) => {
        progressEvents.push(progress);
      });

      // Verify progress tracking
      expect(progressEvents.length).toBeGreaterThan(1);
      expect(result.content).toBe(largeContent);
      expect(result.usedStreaming).toBe(true);

      // Verify progress sequence
      for (let i = 1; i < progressEvents.length; i++) {
        expect(progressEvents[i].bytesRead).toBeGreaterThanOrEqual(progressEvents[i - 1].bytesRead);
        expect(progressEvents[i].percentage).toBeGreaterThanOrEqual(progressEvents[i - 1].percentage);
      }

      // Final progress should be 100%
      const finalProgress = progressEvents[progressEvents.length - 1];
      expect(finalProgress.percentage).toBe(100);
      expect(finalProgress.bytesRead).toBe(largeContent.length);
    });

    it('should handle security validation during streaming', async () => {
      const streamingReader = new StreamingReader(security, console.log, {
        chunkSize: 1024,
        maxMemoryUsage: 5 * 1024 * 1024,
        streamingThreshold: 512
      });

      // Create file with potentially unsafe content
      const unsafeContent = '<script>alert("xss")</script>\n'.repeat(100) + 'safe content';
      const testFile = path.join(testDir, 'unsafe.txt');
      await fs.writeFile(testFile, unsafeContent);

      const result = await streamingReader.readFile(testFile);

      // Should handle unsafe content gracefully
      expect(result.content).toBeDefined();
      expect(result.validation.isValid).toBe(true);
      expect(result.usedStreaming).toBe(true);

      // Content should be processed (exact sanitization depends on InputSanitizer)
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should fallback to buffered reading for small files', async () => {
      const streamingReader = new StreamingReader(security, console.log, {
        chunkSize: 1024,
        maxMemoryUsage: 5 * 1024 * 1024,
        streamingThreshold: 2048 // 2KB threshold
      });

      // Create small file
      const smallContent = 'Small file content';
      const testFile = path.join(testDir, 'small.txt');
      await fs.writeFile(testFile, smallContent);

      const result = await streamingReader.readFile(testFile);

      expect(result.content).toBe(smallContent);
      expect(result.usedStreaming).toBe(false);
      expect(result.progress.chunkNumber).toBe(1);
      expect(result.progress.totalChunks).toBe(1);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should prevent memory leaks during repeated operations', async () => {
      const streamingReader = new StreamingReader(security, console.log, {
        chunkSize: 1024,
        maxMemoryUsage: 5 * 1024 * 1024,
        streamingThreshold: 512
      });

      // Create test file
      const testFile = path.join(testDir, 'leak-test.txt');
      const content = 'x'.repeat(3 * 1024); // 3KB
      await fs.writeFile(testFile, content);

      const initialMemory = streamingReader.getMemoryStats();

      // Perform multiple operations
      for (let i = 0; i < 10; i++) {
        await streamingReader.readFile(testFile);
        
        // Reset memory tracking after each operation
        streamingReader.resetMemoryTracking();
      }

      const finalMemory = streamingReader.getMemoryStats();

      // Memory should be properly reset
      expect(finalMemory.current).toBe(0);
      expect(finalMemory.peak).toBe(0);
    });

    it('should clean up resources properly', async () => {
      const provider = new StreamingChangesResourceProvider(security, console.log);
      
      // Create a change
      const changeDir = path.join(changesDir, 'cleanup-test');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Cleanup Test');

      // Perform operations
      await provider.read();
      await provider.getMetadata();

      // Cleanup should not throw errors
      expect(() => provider.cleanup()).not.toThrow();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance requirements for IDE workflows', async () => {
      const provider = new StreamingChangesResourceProvider(security, console.log, {
        chunkSize: 4096, // 4KB chunks
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
        streamingThreshold: 10 * 1024 // 10KB threshold
      });

      try {
        // Create realistic scenario with multiple changes
        for (let i = 0; i < 20; i++) {
          const changeDir = path.join(changesDir, `perf-change-${i}`);
          await fs.mkdir(changeDir, { recursive: true });
          
          // Create proposal of varying sizes
          const size = 1024 + (i * 512); // 1KB to 11KB
          const content = `# Performance Change ${i}\n\n` + 'x'.repeat(size);
          await fs.writeFile(path.join(changeDir, 'proposal.md'), content);
          
          // Add specs and tasks
          await fs.mkdir(path.join(changeDir, 'specs'), { recursive: true });
          await fs.writeFile(path.join(changeDir, 'specs', 'spec.md'), '# Specification');
          
          await fs.mkdir(path.join(changeDir, 'tasks'), { recursive: true });
          await fs.writeFile(path.join(changeDir, 'tasks', 'task.json'), '{"name": "task"}');
        }

        // Measure performance
        const startTime = Date.now();
        const result = await provider.read();
        const endTime = Date.now();

        const data = JSON.parse(result.text || '{}');
        
        // Performance assertions
        expect(data.changes).toHaveLength(20);
        expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        expect(data.processingTime).toBeLessThan(5000);
        
        // Memory usage should be reasonable
        expect(data.memoryStats.heapUsed).toBeLessThan(50 * 1024 * 1024); // Under 50MB

      } finally {
        provider.cleanup();
      }
    });
  });
});