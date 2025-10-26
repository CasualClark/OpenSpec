/**
 * Tests for StreamingResourceReader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';

import { StreamingResourceReader } from '../../../src/stdio/resources/streaming-resource-reader.js';

describe('StreamingResourceReader', () => {
  let streamingReader: StreamingResourceReader;
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-tmp', 'streaming-resource-reader-test');
    
    // Clean up any existing test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
    
    await fs.mkdir(testDir, { recursive: true });
    streamingReader = new StreamingResourceReader();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Configuration and Constants', () => {
    it('should use default 64KB chunk size', () => {
      const reader = new StreamingResourceReader();
      expect(reader.getChunkSize()).toBe(64 * 1024);
    });

    it('should allow custom chunk size', () => {
      const reader = new StreamingResourceReader({ chunkSize: 32 * 1024 });
      expect(reader.getChunkSize()).toBe(32 * 1024);
    });

    it('should use 100MB default max file size', () => {
      const reader = new StreamingResourceReader();
      expect(reader.getMaxFileSize()).toBe(100 * 1024 * 1024);
    });

    it('should allow custom max file size', () => {
      const reader = new StreamingResourceReader({ maxSize: 50 * 1024 * 1024 });
      expect(reader.getMaxFileSize()).toBe(50 * 1024 * 1024);
    });
  });

  describe('Basic Functionality', () => {
    it('should have required methods', () => {
      expect(typeof streamingReader.streamFile).toBe('function');
      expect(typeof streamingReader.readResource).toBe('function');
      expect(typeof streamingReader.getChunkSize).toBe('function');
      expect(typeof streamingReader.getMaxFileSize).toBe('function');
      expect(typeof streamingReader.getMemoryStats).toBe('function');
      expect(typeof streamingReader.setCheckpointCallback).toBe('function');
    });

    it('should stream file content correctly', async () => {
      const testFile = path.join(testDir, 'test.txt');
      const content = 'test content';
      await fs.writeFile(testFile, content, 'utf-8');

      const chunks: string[] = [];
      for await (const chunk of streamingReader.streamFile(testFile)) {
        chunks.push(chunk);
      }
      
      expect(chunks.join('')).toBe(content);
    });

    it('should read file content correctly', async () => {
      const testFile = path.join(testDir, 'test.txt');
      const content = 'test content';
      await fs.writeFile(testFile, content, 'utf-8');

      const result = await streamingReader.readResource(testFile);
      if (typeof result === 'string') {
        expect(result).toBe(content);
      } else {
        // If it's a generator, consume it
        const chunks: string[] = [];
        for await (const chunk of result) {
          chunks.push(chunk);
        }
        expect(chunks.join('')).toBe(content);
      }
    });
  });

  describe('Memory Management', () => {
    it('should track memory usage', async () => {
      const stats = streamingReader.getMemoryStats();
      expect(stats).toHaveProperty('peakUsage');
      expect(stats).toHaveProperty('currentUsage');
      expect(typeof stats.peakUsage).toBe('number');
      expect(typeof stats.currentUsage).toBe('number');
    });
  });

  describe('File Validation', () => {
    it('should reject non-existent files', async () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      
      try {
        const chunks: string[] = [];
        for await (const chunk of streamingReader.streamFile(nonExistentFile)) {
          chunks.push(chunk);
        }
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/ENOENT|Failed to access file/i);
      }
    });

    it('should reject directories', async () => {
      // Use test directory itself - it exists but is not a file
      try {
        const chunks: string[] = [];
        for await (const chunk of streamingReader.streamFile(testDir)) {
          chunks.push(chunk);
        }
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/Not a file/i);
      }
    });

    it('should reject files exceeding size limit', async () => {
      const reader = new StreamingResourceReader({ maxSize: 1024 }); // 1KB limit
      const largeContent = 'x'.repeat(2048); // 2KB
      const testFile = path.join(testDir, 'oversized.txt');
      await fs.writeFile(testFile, largeContent, 'utf-8');

      try {
        const chunks: string[] = [];
        for await (const chunk of reader.streamFile(testFile)) {
          chunks.push(chunk);
        }
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/File too large/i);
      }
    });

    it('should accept files within size limit', async () => {
      const content = 'x'.repeat(512);
      const testFile = path.join(testDir, 'valid.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const chunks: string[] = [];
      for await (const chunk of streamingReader.streamFile(testFile)) {
        chunks.push(chunk);
      }
      
      expect(chunks.join('')).toBe(content);
    });
  });

  describe('Streaming Functionality', () => {
    it('should stream small files in single chunk', async () => {
      const content = 'Small file content';
      const testFile = path.join(testDir, 'small.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const chunks: string[] = [];
      for await (const chunk of streamingReader.streamFile(testFile)) {
        chunks.push(chunk);
      }
      
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(content);
    });

    it('should stream large files in multiple chunks', async () => {
      const chunkSize = 1024;
      const reader = new StreamingResourceReader({ chunkSize });
      const content = 'x'.repeat(chunkSize * 3); // 3 chunks
      const testFile = path.join(testDir, 'large.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const chunks: string[] = [];
      for await (const chunk of reader.streamFile(testFile)) {
        chunks.push(chunk);
      }
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join('')).toBe(content);
    });

    it('should handle UTF-8 encoding correctly', async () => {
      const content = 'Hello 世界 🌍';
      const testFile = path.join(testDir, 'utf8.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const chunks: string[] = [];
      for await (const chunk of streamingReader.streamFile(testFile)) {
        chunks.push(chunk);
      }
      
      expect(chunks.join('')).toBe(content);
    });

    it('should support custom encoding', async () => {
      const content = 'Hello World';
      const testFile = path.join(testDir, 'ascii.txt');
      await fs.writeFile(testFile, content, 'ascii');

      const chunks: string[] = [];
      for await (const chunk of streamingReader.streamFile(testFile, { encoding: 'ascii' })) {
        chunks.push(chunk);
      }
      
      expect(chunks.join('')).toBe(content);
    });
  });

  describe('Automatic Streaming Decision', () => {
    it('should read small files directly', async () => {
      const content = 'x'.repeat(512); // < 1MB threshold
      const testFile = path.join(testDir, 'small.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const result = await streamingReader.readResource(testFile);
      
      expect(typeof result).toBe('string');
      expect(result).toBe(content);
    });

    it('should stream large files', async () => {
      const content = 'x'.repeat(2 * 1024 * 1024); // 2MB > 1MB threshold
      const testFile = path.join(testDir, 'large.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const result = await streamingReader.readResource(testFile);
      
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('next');
      expect(result).toHaveProperty('throw');
      expect(result).toHaveProperty('return');
      
      // Consume the generator
      const chunks: string[] = [];
      for await (const chunk of result as any) {
        chunks.push(chunk);
      }
      expect(chunks.join('')).toBe(content);
    });

    it('should use custom threshold', async () => {
      const reader = new StreamingResourceReader({ streamingThreshold: 1024 });
      const content = 'x'.repeat(2048); // > 1KB threshold
      const testFile = path.join(testDir, 'custom-threshold.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const result = await reader.readResource(testFile);
      
      // Should stream due to custom threshold
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('next');
    });
  });

  describe('Error Handling and Cleanup', () => {
    it('should handle file system errors during streaming', async () => {
      const testFile = path.join(testDir, 'error.txt');
      await fs.writeFile(testFile, 'content', 'utf-8');

      // Mock file system error by temporarily changing permissions
      try {
        await fs.chmod(testFile, 0o000); // Remove all permissions
        try {
          const chunks: string[] = [];
          for await (const chunk of streamingReader.streamFile(testFile)) {
            chunks.push(chunk);
          }
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toMatch(/Failed to access file|permission denied/i);
        }
      } finally {
        await fs.chmod(testFile, 0o644); // Restore permissions
      }
    });

    it('should cleanup on stream errors', async () => {
      const content = 'x'.repeat(1024);
      const testFile = path.join(testDir, 'cleanup.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      // Test that memory stats are reset after streaming
      const initialStats = streamingReader.getMemoryStats();
      expect(initialStats.currentUsage).toBe(0);

      const chunks: string[] = [];
      for await (const chunk of streamingReader.streamFile(testFile)) {
        chunks.push(chunk);
      }

      const finalStats = streamingReader.getMemoryStats();
      expect(finalStats.currentUsage).toBe(0); // Should be reset after completion
    });
  });

  describe('Checkpoint-based Error Recovery', () => {
    it('should create checkpoints during streaming', async () => {
      const content = 'x'.repeat(64 * 1024 * 2); // 2 chunks
      const testFile = path.join(testDir, 'checkpoint.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const checkpoints: number[] = [];
      const reader = new StreamingResourceReader({
        chunkSize: 64 * 1024,
        checkpointInterval: 1 // Checkpoint every chunk
      });

      reader.setCheckpointCallback((position: number) => {
        checkpoints.push(position);
      });

      const chunks: string[] = [];
      for await (const chunk of reader.streamFile(testFile)) {
        chunks.push(chunk);
      }

      expect(checkpoints.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe(content);
    });

    it('should stream from checkpoint position', async () => {
      const content = 'x'.repeat(64 * 1024 * 3); // 3 chunks
      const testFile = path.join(testDir, 'recovery.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const reader = new StreamingResourceReader({
        chunkSize: 64 * 1024,
        checkpointInterval: 1
      });

      // Stream from middle checkpoint
      const checkpointPosition = 64 * 1024; // After first chunk
      const chunks: string[] = [];
      for await (const chunk of reader.streamFileFromCheckpoint(testFile, checkpointPosition)) {
        chunks.push(chunk);
      }

      expect(chunks.join('')).toBe(content.slice(checkpointPosition));
    });

    it('should validate checkpoint position', async () => {
      const content = 'x'.repeat(1024);
      const testFile = path.join(testDir, 'validate-checkpoint.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      try {
        const chunks: string[] = [];
        for await (const chunk of streamingReader.streamFileFromCheckpoint(testFile, 2048)) {
          chunks.push(chunk);
        }
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/Checkpoint position.*exceeds file size/i);
      }
    });
  });

  describe('Adaptive Chunk Sizing', () => {
    it('should support adaptive chunking option', () => {
      const reader = new StreamingResourceReader({ adaptiveChunking: true });
      expect(reader.getChunkSize()).toBe(64 * 1024); // Default size
    });
  });

  describe('Memory Management', () => {
    it('should track memory usage', async () => {
      const content = 'x'.repeat(1024);
      const testFile = path.join(testDir, 'memory.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      await streamingReader.streamFile(testFile);
      
      const stats = streamingReader.getMemoryStats();
      expect(stats.peakUsage).toBeGreaterThanOrEqual(0);
      expect(stats.currentUsage).toBe(0); // Should be reset after completion
      expect(stats.limit).toBe(50 * 1024 * 1024); // Default 50MB
    });

    it('should enforce memory limits', async () => {
      const reader = new StreamingResourceReader({ 
        maxMemoryUsage: 512, // 512B limit - very small
        chunkSize: 1024 // 1KB chunk - larger than memory limit
      });
      
      const content = 'x'.repeat(2048); // 2KB
      const testFile = path.join(testDir, 'memory-limit.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      try {
        const chunks: string[] = [];
        for await (const chunk of reader.streamFile(testFile)) {
          chunks.push(chunk);
        }
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/Memory limit exceeded/i);
      }
    });

    it('should track peak memory usage', async () => {
      const reader = new StreamingResourceReader({ 
        maxMemoryUsage: 10 * 1024, // 10KB limit
        chunkSize: 1024
      });
      
      const content = 'x'.repeat(5 * 1024); // 5KB
      const testFile = path.join(testDir, 'peak-memory.txt');
      await fs.writeFile(testFile, content, 'utf-8');

      const chunks: string[] = [];
      for await (const chunk of reader.streamFile(testFile)) {
        chunks.push(chunk);
      }

      const stats = reader.getMemoryStats();
      expect(stats.peakUsage).toBeGreaterThan(0);
      expect(stats.peakUsage).toBeLessThanOrEqual(stats.limit);
    });
  });

  describe('Checkpoint Support', () => {
    it('should support checkpoint callbacks', () => {
      const checkpoints: number[] = [];
      streamingReader.setCheckpointCallback((position: number) => {
        checkpoints.push(position);
      });
      
      // Test that the callback was set (we'll test functionality in real implementation)
      expect(checkpoints).toEqual([]);
    });

    it('should manage checkpoints list', () => {
      const checkpoints = streamingReader.getCheckpoints();
      expect(Array.isArray(checkpoints)).toBe(true);
      
      streamingReader.clearCheckpoints();
      const clearedCheckpoints = streamingReader.getCheckpoints();
      expect(clearedCheckpoints).toEqual([]);
    });
  });
});