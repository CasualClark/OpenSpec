/**
 * Tests for StreamingChangesResourceProvider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StreamingChangesResourceProvider } from '../../../src/stdio/resources/streaming-changes-resource.js';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('StreamingChangesResourceProvider', () => {
  let provider: StreamingChangesResourceProvider;
  let security: any;
  let testDir: string;
  let changesDir: string;
  let logMessages: string[] = [];

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-tmp', 'streaming-changes-test');
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
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedSchemas: ['resource.read']
    };

    logMessages = [];
    const logger = (level: string, message: string) => {
      logMessages.push(`[${level}] ${message}`);
    };

    provider = new StreamingChangesResourceProvider(security, logger, {
      chunkSize: 1024, // 1KB chunks for testing
      maxMemoryUsage: 5 * 1024 * 1024, // 5MB limit for testing
      streamingThreshold: 512, // 512B threshold for testing
      progressInterval: 1 // Report every chunk for testing
    });
  });

  afterEach(async () => {
    // Cleanup provider
    provider.cleanup();
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Functionality', () => {
    it('should handle empty changes directory', async () => {
      const result = await provider.read();
      
      expect(result.text).toBeDefined();
      const data = JSON.parse(result.text || '{}');
      expect(data.changes).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.generated).toBeDefined();
      expect(data.memoryStats).toBeDefined();
      expect(data.processingTime).toBeGreaterThan(0);
    });

    it('should check if changes directory exists', async () => {
      const exists = await provider.exists();
      expect(exists).toBe(true);
    });

    it('should handle non-existent changes directory', async () => {
      // Remove the changes directory
      await fs.rm(changesDir, { recursive: true });
      
      const exists = await provider.exists();
      expect(exists).toBe(false);
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      expect(data.changes).toEqual([]);
    });

    it('should get metadata for changes directory', async () => {
      const metadata = await provider.getMetadata();
      
      expect(metadata.path).toBe(changesDir);
      expect(metadata.changeCount).toBe(0);
      expect(metadata.type).toBe('streaming-changes-collection');
      expect(metadata.memoryStats).toBeDefined();
      expect(metadata.streamingConfig).toBeDefined();
    });
  });

  describe('Change Processing', () => {
    it('should process valid change entries', async () => {
      // Create a valid change directory
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create a proposal file
      const proposalContent = '# Test Change\n\nThis is a test change description.';
      await fs.writeFile(path.join(changeDir, 'proposal.md'), proposalContent);
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0].slug).toBe('test-change');
      expect(data.changes[0].title).toBe('Test Change');
      expect(data.changes[0].description).toBe('This is a test change description.');
      expect(data.changes[0].hasProposal).toBe(true);
      expect(data.changes[0].status).toBe('planned'); // No tasks or specs
    });

    it('should ignore invalid slug formats', async () => {
      // Create directories with invalid slugs
      await fs.mkdir(path.join(changesDir, 'invalid slug'), { recursive: true });
      await fs.mkdir(path.join(changesDir, 'Invalid-Slug'), { recursive: true }); // Uppercase
      await fs.mkdir(path.join(changesDir, 'archive'), { recursive: true }); // Special directory
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it('should handle change with lock file', async () => {
      const changeDir = path.join(changesDir, 'locked-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create lock file
      const lockContent = JSON.stringify({
        owner: 'test-user',
        since: Date.now(),
        ttl: 3600
      });
      await fs.writeFile(path.join(changeDir, '.lock'), lockContent);
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0].slug).toBe('locked-change');
      expect(data.changes[0].hasLock).toBe(true);
      expect(data.changes[0].lockInfo.owner).toBe('test-user');
      expect(data.changes[0].status).toBe('locked');
    });

    it('should count specs, tasks, and deltas', async () => {
      const changeDir = path.join(changesDir, 'complete-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create subdirectories and files
      await fs.mkdir(path.join(changeDir, 'specs'), { recursive: true });
      await fs.mkdir(path.join(changeDir, 'tasks'), { recursive: true });
      await fs.mkdir(path.join(changeDir, 'deltas'), { recursive: true });
      
      await fs.writeFile(path.join(changeDir, 'specs', 'spec1.md'), '# Spec 1');
      await fs.writeFile(path.join(changeDir, 'specs', 'spec2.md'), '# Spec 2');
      await fs.writeFile(path.join(changeDir, 'tasks', 'task1.json'), '{}');
      await fs.writeFile(path.join(changeDir, 'deltas', 'delta1.diff'), 'diff');
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0].specCount).toBe(2);
      expect(data.changes[0].taskCount).toBe(1);
      expect(data.changes[0].deltaCount).toBe(1);
    });
  });

  describe('Streaming for Large Files', () => {
    it('should use streaming for large proposal files', async () => {
      const changeDir = path.join(changesDir, 'large-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create a large proposal file (>1KB threshold for testing)
      const largeContent = '# Large Change\n\n' + 'x'.repeat(3 * 1024); // 3KB to ensure multiple chunks with 1KB chunk size
      await fs.writeFile(path.join(changeDir, 'proposal.md'), largeContent);
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0].hasProposal).toBe(true);
      expect(data.changes[0].proposalSize).toBeGreaterThan(1024);
      expect(data.changes[0].proposalChunks).toBeGreaterThan(1);
      
      // Check that streaming was logged
      expect(logMessages.some(msg => msg.includes('Streaming large proposal file'))).toBe(true);
    });

    it('should provide progress feedback during streaming', async () => {
      const changeDir = path.join(changesDir, 'progress-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create a large proposal file
      const largeContent = '# Progress Change\n\n' + 'x'.repeat(3 * 1024); // 3KB
      await fs.writeFile(path.join(changeDir, 'proposal.md'), largeContent);
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0].hasProposal).toBe(true);
      
      // Check that progress was logged
      expect(logMessages.some(msg => msg.includes('Proposal reading progress'))).toBe(true);
    });

    it('should handle streaming errors gracefully', async () => {
      const changeDir = path.join(changesDir, 'error-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create a proposal file
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Error Change');
      
      // Mock the streaming reader to throw an error
      const originalReadFileWithStreaming = provider['readFileWithStreaming'];
      provider['readFileWithStreaming'] = async () => {
        throw new Error('Streaming error');
      };
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      // Should still process the change but without proposal
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0].hasProposal).toBe(false);
      
      // Restore original method
      provider['readFileWithStreaming'] = originalReadFileWithStreaming;
    });
  });

  describe('Memory Management', () => {
    it('should track memory usage during operations', async () => {
      const changeDir = path.join(changesDir, 'memory-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create a large proposal file
      const largeContent = '# Memory Change\n\n' + 'x'.repeat(2 * 1024);
      await fs.writeFile(path.join(changeDir, 'proposal.md'), largeContent);
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.memoryStats).toBeDefined();
      expect(data.memoryStats.heapUsed).toBeGreaterThan(0);
      expect(data.memoryStats.heapTotal).toBeGreaterThan(0);
      expect(data.memoryStats.heapUsedPercent).toBeGreaterThan(0);
    });

    it('should include memory stats in metadata', async () => {
      const metadata = await provider.getMetadata();
      
      expect(metadata.memoryStats).toBeDefined();
      expect(metadata.memoryStats.heapUsed).toBeGreaterThan(0);
      expect(metadata.streamingConfig).toBeDefined();
      expect(metadata.streamingConfig.chunkSize).toBeGreaterThan(0);
    });

    it('should handle memory breaches', async () => {
      // Create a provider with very low memory limits
      const lowMemoryProvider = new StreamingChangesResourceProvider(security, console.log, {
        chunkSize: 256,
        maxMemoryUsage: 512, // 512 bytes
        streamingThreshold: 128
      });
      
      const changeDir = path.join(changesDir, 'memory-breach-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create a content that will exceed memory limits
      const largeContent = 'x'.repeat(1024); // 1KB > 512B limit
      await fs.writeFile(path.join(changeDir, 'proposal.md'), largeContent);
      
      // Should handle memory breach gracefully
      const result = await lowMemoryProvider.read();
      const data = JSON.parse(result.text || '{}');
      
      // Should still return a result, even if processing fails
      expect(data).toBeDefined();
      expect(data.memoryStats).toBeDefined();
      
      lowMemoryProvider.cleanup();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed lock files', async () => {
      const changeDir = path.join(changesDir, 'bad-lock-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create malformed lock file
      await fs.writeFile(path.join(changeDir, '.lock'), 'invalid json content');
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0].hasLock).toBe(true);
      expect(data.changes[0].lockInfo.error).toBe('Invalid lock file format');
    });

    it('should handle processing errors for individual changes', async () => {
      const changeDir = path.join(changesDir, 'error-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create a proposal file
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Error Change');
      
      // Mock the processChangeEntry method to throw an error
      const originalProcessChangeEntry = provider['processChangeEntry'];
      provider['processChangeEntry'] = async () => {
        throw new Error('Processing error');
      };
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(1);
      expect(data.changes[0].status).toBe('error');
      expect(data.changes[0].error).toBeDefined();
      
      // Restore original method
      provider['processChangeEntry'] = originalProcessChangeEntry;
    });

    it('should handle directory access errors', async () => {
      // Change permissions to simulate access error
      const originalExists = provider.exists;
      provider.exists = async () => {
        throw new Error('Access denied');
      };
      
      // Should handle access errors gracefully
      await expect(provider.read()).rejects.toThrow();
      
      provider.exists = originalExists;
    });
  });

  describe('Status Determination', () => {
    it('should determine correct status for draft changes', async () => {
      const changeDir = path.join(changesDir, 'draft-change');
      await fs.mkdir(changeDir, { recursive: true });
      // No proposal file
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes[0].status).toBe('draft');
    });

    it('should determine correct status for planned changes', async () => {
      const changeDir = path.join(changesDir, 'planned-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Planned Change');
      // No tasks or specs
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes[0].status).toBe('planned');
    });

    it('should determine correct status for in-progress changes', async () => {
      const changeDir = path.join(changesDir, 'in-progress-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# In Progress Change');
      await fs.mkdir(path.join(changeDir, 'tasks'));
      await fs.writeFile(path.join(changeDir, 'tasks', 'task1.json'), '{}');
      // No specs
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes[0].status).toBe('in-progress');
    });

    it('should determine correct status for complete changes', async () => {
      const changeDir = path.join(changesDir, 'complete-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Complete Change');
      await fs.mkdir(path.join(changeDir, 'tasks'));
      await fs.writeFile(path.join(changeDir, 'tasks', 'task1.json'), '{}');
      await fs.mkdir(path.join(changeDir, 'specs'));
      await fs.writeFile(path.join(changeDir, 'specs', 'spec1.md'), '# Spec 1');
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes[0].status).toBe('complete');
    });
  });

  describe('Performance', () => {
    it('should complete processing within reasonable time', async () => {
      // Create multiple changes
      for (let i = 0; i < 5; i++) {
        const changeDir = path.join(changesDir, `change-${i}`);
        await fs.mkdir(changeDir, { recursive: true });
        await fs.writeFile(path.join(changeDir, 'proposal.md'), `# Change ${i}`);
      }
      
      const startTime = Date.now();
      const result = await provider.read();
      const endTime = Date.now();
      
      const data = JSON.parse(result.text || '{}');
      expect(data.changes).toHaveLength(5);
      expect(data.processingTime).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should include processing time in results', async () => {
      const changeDir = path.join(changesDir, 'timing-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Timing Change');
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.processingTime).toBeGreaterThan(0);
      expect(data.processingTime).toBeLessThan(10000); // Should be reasonable
    });
  });
});