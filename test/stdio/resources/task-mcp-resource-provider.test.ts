/**
 * Integration tests for TaskMCPResourceProvider
 * Tests pagination, streaming, URI parsing, security validation, and error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskMCPResourceProvider } from '../../../src/stdio/resources/task-mcp-resource-provider.js';
import { SecurityContext } from '../../../src/stdio/types/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { mkdtemp, rmdir, writeFile, mkdir, access, stat, utimes } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Helper functions
async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'openspec-test-'));
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await rmdir(dir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('TaskMCPResourceProvider Integration Tests', () => {
  let provider: TaskMCPResourceProvider;
  let security: SecurityContext;
  let tempDir: string;
  let openspecDir: string;
  let changesDir: string;

  beforeEach(async () => {
    // Create temporary directory structure
    tempDir = await createTempDir();
    openspecDir = path.join(tempDir, 'openspec');
    changesDir = path.join(openspecDir, 'changes');
    
    await fs.mkdir(openspecDir, { recursive: true });
    await fs.mkdir(changesDir, { recursive: true });

    // Setup security context with all required fields
    security = {
      allowedPaths: [tempDir],
      sandboxRoot: tempDir,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedSchemas: ['changes', 'change'],
      user: {
        id: 'test-user',
        type: 'local',
        username: 'testuser'
      }
    };

    // Create provider
    provider = new TaskMCPResourceProvider(
      security,
      (level, message) => console.log(`[${level}] ${message}`)
    );
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('changes://active with pagination', () => {
    beforeEach(async () => {
      // Create test changes
      const changes = [
        { slug: 'change-1', title: 'First Change', mtime: new Date('2023-01-01') },
        { slug: 'change-2', title: 'Second Change', mtime: new Date('2023-01-02') },
        { slug: 'change-3', title: 'Third Change', mtime: new Date('2023-01-03') }
      ];

      for (const change of changes) {
        const changeDir = path.join(changesDir, change.slug);
        await fs.mkdir(changeDir, { recursive: true });
        
        // Create proposal.md
        const proposalPath = path.join(changeDir, 'proposal.md');
        await fs.writeFile(proposalPath, `# ${change.title}\n\nDescription of ${change.slug}.`);
        
        // Set modification time
        await fs.utimes(changeDir, change.mtime, change.mtime);
      }
    });

    it('should paginate changes with default parameters', async () => {
      const paginatedProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'changes://active?page=1&pageSize=2'
      );

      const result = await paginatedProvider.read();
      
      expect(result.mimeType).toBe('application/json');
      expect(result.text).toBeDefined();
      
      const data = JSON.parse(result.text!);
      expect(data.items).toHaveLength(2);
      expect(data.pagination.currentPage).toBe(1);
      expect(data.pagination.pageSize).toBe(2);
      expect(data.pagination.totalItems).toBe(3);
      expect(data.pagination.totalPages).toBe(2);
      expect(data.pagination.hasMore).toBe(true);
      expect(data.pagination.nextPageToken).toBeDefined();
    });

    it('should handle second page with token', async () => {
      // Get first page to get token
      const firstPageProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'changes://active?page=1&pageSize=2'
      );

      const firstResult = await firstPageProvider.read();
      const firstData = JSON.parse(firstResult.text!);
      const nextToken = firstData.pagination.nextPageToken;

      // Get second page with token
      const secondPageProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        `changes://active?nextPageToken=${nextToken}`
      );

      const secondResult = await secondPageProvider.read();
      const secondData = JSON.parse(secondResult.text!);
      
      expect(secondData.items).toHaveLength(1);
      expect(secondData.pagination.hasMore).toBe(false);
    });

    it('should validate pagination parameters', async () => {
      // Test invalid page
      const invalidPageProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'changes://active?page=abc'
      );

      await expect(invalidPageProvider.read()).rejects.toThrow('Invalid page parameter');

      // Test invalid pageSize
      const invalidSizeProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'changes://active?pageSize=200'
      );

      await expect(invalidSizeProvider.read()).rejects.toThrow('Invalid pageSize parameter');
    });

    it('should return empty result when no changes exist', async () => {
      // Clean up changes directory
      await fs.rmdir(changesDir, { recursive: true });
      await fs.mkdir(changesDir);

      const emptyProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'changes://active'
      );

      const result = await emptyProvider.read();
      const data = JSON.parse(result.text!);
      
      expect(data.items).toHaveLength(0);
      expect(data.pagination.totalItems).toBe(0);
    });
  });

  describe('change://[slug]/file with streaming', () => {
    beforeEach(async () => {
      // Create test change
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create test files
      await fs.writeFile(
        path.join(changeDir, 'proposal.md'),
        '# Test Change\n\nThis is a test proposal.',
        'utf8'
      );
      
      await fs.writeFile(
        path.join(changeDir, 'config.json'),
        JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2),
        'utf8'
      );

      // Create a large file for streaming test (but under sanitization limit)
      const largeContent = 'A'.repeat(500 * 1024); // 500KB
      await fs.writeFile(
        path.join(changeDir, 'large-file.txt'),
        largeContent,
        'utf8'
      );
    });

    it('should read change metadata', async () => {
      const changeProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change'
      );

      const result = await changeProvider.read();
      
      expect(result.mimeType).toBe('application/json');
      const data = JSON.parse(result.text!);
      expect(data.slug).toBe('test-change');
      expect(data.files).toContain('proposal.md');
      expect(data.files).toContain('config.json');
      expect(data.files).toContain('large-file.txt');
    });

    it('should read small files directly', async () => {
      const fileProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change/proposal.md'
      );

      const result = await fileProvider.read();
      
      expect(result.mimeType).toBe('text/markdown');
      expect(result.text).toContain('# Test Change');
    });

    it('should stream large files', async () => {
      const largeFileProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change/large-file.txt'
      );

      const result = await largeFileProvider.read();
      
      expect(result.mimeType).toBe('text/plain');
      expect(result.text || result.blob).toBeDefined();
      const content = result.text || result.blob;
      expect(content!.length).toBe(500 * 1024);
      expect(content).toMatch(/^A+$/);
    });

    it('should detect MIME types correctly', async () => {
      const jsonProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change/config.json'
      );

      const result = await jsonProvider.read();
      expect(result.mimeType).toBe('application/json');
      
      const data = JSON.parse(result.text!);
      expect(data.name).toBe('test');
    });
  });

  describe('URI parsing and security validation', () => {
    it('should reject URIs with path traversal attempts', async () => {
      const maliciousProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change/../../../etc/passwd'
      );

      await expect(maliciousProvider.read()).rejects.toThrow('URI security validation failed');
    });

    it('should reject URIs with invalid slug format', async () => {
      const invalidSlugProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://Invalid-Slug/file.txt'
      );

      await expect(invalidSlugProvider.read()).rejects.toThrow('URI security validation failed');
    });

    it('should reject unsupported URI schemes', async () => {
      const unsupportedProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'unsupported://test'
      );

      await expect(unsupportedProvider.read()).rejects.toThrow('Unsupported URI scheme');
    });

    it('should handle malformed URIs gracefully', async () => {
      const malformedProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'not-a-valid-uri'
      );

      await expect(malformedProvider.read()).rejects.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle missing change directory', async () => {
      const missingChangeProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://nonexistent-change'
      );

      await expect(missingChangeProvider.read()).rejects.toThrow('Change not found: nonexistent-change');
    });

    it('should handle missing files', async () => {
      // Create change directory but no files
      const changeDir = path.join(changesDir, 'empty-change');
      await fs.mkdir(changeDir, { recursive: true });

      const missingFileProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://empty-change/nonexistent.txt'
      );

      await expect(missingFileProvider.read()).rejects.toThrow('Failed to read file');
    });

    it('should sanitize errors properly', async () => {
      const errorProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change/../../../etc/passwd'
      );

      try {
        await errorProvider.read();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        // Error should be sanitized and not contain sensitive information
        expect(String(error)).not.toContain('../../..');
      }
    });
  });

  describe('exists() method', () => {
    beforeEach(async () => {
      // Create test change
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'test.txt'), 'test', 'utf8');
    });

    it('should return true for changes://active', async () => {
      const activeProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'changes://active'
      );

      const exists = await activeProvider.exists();
      expect(exists).toBe(true);
    });

    it('should return true for existing change', async () => {
      const changeProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change'
      );

      const exists = await changeProvider.exists();
      expect(exists).toBe(true);
    });

    it('should return true for existing file', async () => {
      const fileProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change/test.txt'
      );

      const exists = await fileProvider.exists();
      expect(exists).toBe(true);
    });

    it('should return false for nonexistent change', async () => {
      const nonexistentProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://nonexistent'
      );

      const exists = await nonexistentProvider.exists();
      expect(exists).toBe(false);
    });

    it('should return false for nonexistent file', async () => {
      const nonexistentFileProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change/nonexistent.txt'
      );

      const exists = await nonexistentFileProvider.exists();
      expect(exists).toBe(false);
    });
  });

  describe('getMetadata() method', () => {
    beforeEach(async () => {
      // Create test change with files
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'test.txt'), 'test', 'utf8');
      await fs.writeFile(path.join(changeDir, 'openspec.json'), JSON.stringify({ title: 'Test' }), 'utf8');
    });

    it('should return metadata for changes://active', async () => {
      const activeProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'changes://active'
      );

      const metadata = await activeProvider.getMetadata();
      expect(metadata.type).toBe('changes-collection');
      expect(metadata.scheme).toBe('changes');
      expect(metadata.supportsPagination).toBe(true);
      expect(metadata.supportedQueryParams).toContain('page');
    });

    it('should return metadata for change', async () => {
      const changeProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change'
      );

      const metadata = await changeProvider.getMetadata();
      expect(metadata.type).toBe('change');
      expect(metadata.slug).toBe('test-change');
      expect(metadata.scheme).toBe('change');
      expect(metadata.exists).toBe(true);
    });

    it('should return metadata for file', async () => {
      const fileProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://test-change/test.txt'
      );

      const metadata = await fileProvider.getMetadata();
      expect(metadata.type).toBe('file');
      expect(metadata.slug).toBe('test-change');
      expect(metadata.filePath).toBe('test.txt');
      expect(metadata.mimeType).toBe('text/plain');
      expect(metadata.exists).toBe(true);
    });
  });

  describe('Performance and memory management', () => {
    it('should handle large numbers of changes efficiently', async () => {
      // Create many changes
      for (let i = 1; i <= 50; i++) {
        const changeDir = path.join(changesDir, `change-${i}`);
        await fs.mkdir(changeDir, { recursive: true });
        await fs.writeFile(
          path.join(changeDir, 'proposal.md'),
          `# Change ${i}`,
          'utf8'
        );
      }

      const paginatedProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'changes://active?page=1&pageSize=10'
      );

      const startTime = Date.now();
      const result = await paginatedProvider.read();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      
      const data = JSON.parse(result.text!);
      expect(data.items).toHaveLength(10);
      expect(data.pagination.totalItems).toBe(50);
    });

    it('should handle very large files without memory issues', async () => {
      const changeDir = path.join(changesDir, 'large-change');
      await fs.mkdir(changeDir, { recursive: true });
      
      // Create a 3MB file (under sanitization limit but still large)
      const largeContent = 'X'.repeat(3 * 1024 * 1024);
      await fs.writeFile(
        path.join(changeDir, 'huge.txt'),
        largeContent,
        'utf8'
      );

      const largeFileProvider = new TaskMCPResourceProvider(
        security,
        console.log,
        'change://large-change/huge.txt'
      );

      const startTime = Date.now();
      const result = await largeFileProvider.read();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
      const content = result.text || result.blob;
      expect(content!.length).toBe(3 * 1024 * 1024);
    });
  });
});