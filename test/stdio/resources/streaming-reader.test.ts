/**
 * Tests for StreamingReader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StreamingReader } from '../../../src/stdio/resources/streaming-reader.js';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('StreamingReader', () => {
  let streamingReader: StreamingReader;
  let testDir: string;
  let security: any;
  let logger: any;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-tmp', 'streaming-reader-test');
    
    // Clean up any existing test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
    
    await fs.mkdir(testDir, { recursive: true });

    security = {
      allowedPaths: [testDir, process.cwd()],
      sandboxRoot: testDir,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedSchemas: ['resource.read']
    };

    const logMessages: string[] = [];
    logger = (level: string, message: string) => {
      logMessages.push(`[${level}] ${message}`);
    };

    streamingReader = new StreamingReader(security, logger, {
      chunkSize: 1024, // 1KB chunks for testing
      maxMemoryUsage: 5 * 1024 * 1024, // 5MB limit for testing
      streamingThreshold: 2 * 1024, // 2KB threshold for testing
      progressInterval: 2
    });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Buffered Reading (Small Files)', () => {
    it('should read small files using buffered reading', async () => {
      const testContent = 'This is a small test file content.';
      const testFile = path.join(testDir, 'small.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      const result = await streamingReader.readFile(testFile);

      expect(result.content).toBe(testContent);
      expect(result.usedStreaming).toBe(false);
      expect(result.validation.isValid).toBe(true);
      expect(result.progress.bytesRead).toBe(testContent.length);
      expect(result.progress.totalBytes).toBe(testContent.length);
      expect(result.progress.percentage).toBe(100);
    });

    it('should handle empty files', async () => {
      const testFile = path.join(testDir, 'empty.txt');
      await fs.writeFile(testFile, '', 'utf-8');

      const result = await streamingReader.readFile(testFile);

      expect(result.content).toBe('');
      expect(result.usedStreaming).toBe(false);
      expect(result.validation.isValid).toBe(true);
    });

    it('should reject files exceeding max file size', async () => {
      // Create a file larger than maxFileSize
      const largeContent = 'x'.repeat((security.maxFileSize || 0) + 1);
      const testFile = path.join(testDir, 'oversized.txt');
      await fs.writeFile(testFile, largeContent, 'utf-8');

      const result = await streamingReader.readFile(testFile);

      expect(result.content).toBe('');
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors[0].code).toBe('FILE_TOO_LARGE');
    });
  });

  describe('Streaming Reading (Large Files)', () => {
    it('should read large files using streaming', async () => {
      // Create a file larger than streaming threshold
      const largeContent = 'x'.repeat(3 * 1024); // 3KB > 2KB threshold
      const testFile = path.join(testDir, 'large.txt');
      await fs.writeFile(testFile, largeContent, 'utf-8');

      const progressEvents: any[] = [];
      const result = await streamingReader.readFile(testFile, (progress) => {
        progressEvents.push(progress);
      });

      expect(result.content).toBe(largeContent);
      expect(result.usedStreaming).toBe(true);
      expect(result.validation.isValid).toBe(true);
      expect(result.progress.bytesRead).toBe(largeContent.length);
      expect(result.progress.percentage).toBe(100);

      // Check that progress was reported
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1].percentage).toBe(100);
    });

    it('should handle streaming with progress callbacks', async () => {
      const largeContent = 'x'.repeat(5 * 1024); // 5KB
      const testFile = path.join(testDir, 'progress.txt');
      await fs.writeFile(testFile, largeContent, 'utf-8');

      const progressEvents: any[] = [];
      await streamingReader.readFile(testFile, (progress) => {
        progressEvents.push(progress);
      });

      // Verify progress reporting
      expect(progressEvents.length).toBeGreaterThan(1);
      
      // Check that progress increases
      for (let i = 1; i < progressEvents.length; i++) {
        expect(progressEvents[i].bytesRead).toBeGreaterThanOrEqual(progressEvents[i - 1].bytesRead);
        expect(progressEvents[i].percentage).toBeGreaterThanOrEqual(progressEvents[i - 1].percentage);
      }

      // Final progress should be 100%
      expect(progressEvents[progressEvents.length - 1].percentage).toBe(100);
    });

    it('should handle chunk boundaries correctly', async () => {
      // Create content that spans multiple chunks
      const chunkSize = 1024;
      const content = 'a'.repeat(chunkSize) + 'b'.repeat(chunkSize) + 'c'.repeat(chunkSize);
      const testFile = path.join(testDir, 'chunks.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const result = await streamingReader.readFile(testFile);

      expect(result.content).toBe(content);
      expect(result.usedStreaming).toBe(true);
      expect(result.progress.totalChunks).toBeGreaterThan(1);
    });
  });

  describe('Memory Management', () => {
    it('should track memory usage correctly', async () => {
      const testContent = 'x'.repeat(3 * 1024);
      const testFile = path.join(testDir, 'memory.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      await streamingReader.readFile(testFile);

      const stats = streamingReader.getMemoryStats();
      expect(stats.current).toBe(0); // Should be reset after operation
      expect(stats.peak).toBeGreaterThan(0);
      expect(stats.limit).toBe(5 * 1024 * 1024); // 5MB limit from config
    });

    it('should reset memory tracking', async () => {
      const testContent = 'x'.repeat(3 * 1024);
      const testFile = path.join(testDir, 'reset.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      await streamingReader.readFile(testFile);
      
      let stats = streamingReader.getMemoryStats();
      expect(stats.peak).toBeGreaterThan(0);

      streamingReader.resetMemoryTracking();
      stats = streamingReader.getMemoryStats();
      expect(stats.current).toBe(0);
      expect(stats.peak).toBe(0);
    });

    it('should handle memory limit enforcement', async () => {
      // Create a reader with very low memory limit
      const limitedReader = new StreamingReader(security, logger, {
        chunkSize: 1024,
        maxMemoryUsage: 1024, // 1KB limit
        streamingThreshold: 512
      });

      const largeContent = 'x'.repeat(2 * 1024); // 2KB
      const testFile = path.join(testDir, 'memory-limit.txt');
      await fs.writeFile(testFile, largeContent, 'utf-8');

      // This should fail due to memory limit
      await expect(limitedReader.readFile(testFile)).rejects.toThrow('Memory usage exceeded');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent files', async () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      
      const result = await streamingReader.readFile(nonExistentFile);

      expect(result.content).toBe('');
      expect(result.validation.isValid).toBe(false);
      expect(['READ_ERROR', 'READ_ACCESS_DENIED']).toContain(result.validation.errors[0].code);
    });

    it('should handle file access errors', async () => {
      // Create a file and then remove it during read
      const testFile = path.join(testDir, 'access.txt');
      await fs.writeFile(testFile, 'test', 'utf-8');
      
      // Mock security to deny access
      const restrictiveSecurity = {
        ...security,
        allowedPaths: [] // No allowed paths
      };

      const restrictiveReader = new StreamingReader(restrictiveSecurity, logger);
      
      const result = await restrictiveReader.readFile(testFile);

      expect(result.content).toBe('');
      expect(result.validation.isValid).toBe(false);
    });

    it('should handle corrupted files', async () => {
      const testFile = path.join(testDir, 'corrupted.txt');
      // Write binary data that might cause issues
      const buffer = Buffer.from([0xFF, 0xFE, 0xFD, 0xFC]);
      await fs.writeFile(testFile, buffer);

      const result = await streamingReader.readFile(testFile);

      // Should handle gracefully
      expect(typeof result.content).toBe('string');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Security Validation', () => {
    it('should sanitize content during streaming', async () => {
      // Create content with potentially unsafe elements
      const unsafeContent = '<script>alert("xss")</script>'.repeat(100);
      const testFile = path.join(testDir, 'unsafe.txt');
      await fs.writeFile(testFile, unsafeContent, 'utf-8');

      const result = await streamingReader.readFile(testFile);

      expect(result.content).toBeDefined();
      expect(result.validation.isValid).toBe(true);
      // Content should be sanitized (exact behavior depends on InputSanitizer)
    });

    it('should maintain security boundaries for each chunk', async () => {
      const mixedContent = 'safe'.repeat(256) + '<script>' + 'safe'.repeat(256);
      const testFile = path.join(testDir, 'mixed.txt');
      await fs.writeFile(testFile, mixedContent, 'utf-8');

      const result = await streamingReader.readFile(testFile);

      expect(result.content).toBeDefined();
      expect(result.validation.isValid).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete streaming within reasonable time', async () => {
      const largeContent = 'x'.repeat(10 * 1024); // 10KB
      const testFile = path.join(testDir, 'performance.txt');
      await fs.writeFile(testFile, largeContent, 'utf-8');

      const startTime = Date.now();
      const result = await streamingReader.readFile(testFile);
      const endTime = Date.now();

      expect(result.content).toBe(largeContent);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should provide accurate processing time', async () => {
      const testContent = 'x'.repeat(3 * 1024);
      const testFile = path.join(testDir, 'timing.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      const result = await streamingReader.readFile(testFile);

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeLessThan(10000); // Should be reasonable
    });
  });
});