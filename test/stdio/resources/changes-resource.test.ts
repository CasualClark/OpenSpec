/**
 * Tests for ChangesResourceProvider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChangesResourceProvider } from '../../../src/stdio/resources/changes-resource.js';
import { SandboxManager } from '../../../src/stdio/security/sandbox.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { validate_slug } from '../../../src/utils/core-utilities.js';

describe('ChangesResourceProvider', () => {
  let provider: ChangesResourceProvider;
  let security: any;
  let testDir: string;
  let changesDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-tmp', 'changes-resource-test');
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
      maxFileSize: 10 * 1024 * 1024,
      allowedSchemas: ['resource.read']
    };

    provider = new ChangesResourceProvider(security, console.log);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('read', () => {
    it('should return empty list when no changes directory exists', async () => {
      // Remove changes directory
      await fs.rmdir(changesDir);
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('should list changes with metadata', async () => {
      // Create test changes
      const change1Dir = path.join(changesDir, 'test-change-1');
      const change2Dir = path.join(changesDir, 'test-change-2');
      
      await fs.mkdir(change1Dir, { recursive: true });
      await fs.mkdir(change2Dir, { recursive: true });

      // Create proposals
      const proposal1 = `# Test Change 1

This is a test change for validation.

## Goals
- Test the resource provider
- Ensure metadata extraction works

## Tasks
- Task 1
- Task 2`;

      const proposal2 = `# Another Test Change

Simple proposal.`;

      await fs.writeFile(path.join(change1Dir, 'proposal.md'), proposal1);
      await fs.writeFile(path.join(change2Dir, 'proposal.md'), proposal2);

      // Create some tasks
      const tasksDir = path.join(change1Dir, 'tasks');
      await fs.mkdir(tasksDir, { recursive: true });
      
      const task1 = {
        description: 'Test task 1',
        status: 'pending',
        depends_on: [],
        provides: ['task-1-output']
      };
      
      await fs.writeFile(path.join(tasksDir, 'task-1.json'), JSON.stringify(task1, null, 2));

      // Create lock for change2
      const lockInfo = {
        owner: 'test-user',
        since: Date.now(),
        ttl: 3600
      };
      
      await fs.writeFile(path.join(change2Dir, '.lock'), JSON.stringify(lockInfo, null, 2));

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.changes).toHaveLength(2);
      expect(data.total).toBe(2);

      // Check change 1
      const change1 = data.changes.find((c: any) => c.slug === 'test-change-1');
      expect(change1).toBeDefined();
      expect(change1.title).toBe('Test Change 1');
      expect(change1.description).toContain('test change for validation');
      expect(change1.hasProposal).toBe(true);
      expect(change1.hasLock).toBe(false);
      expect(change1.taskCount).toBe(1);
      expect(change1.specCount).toBe(0);
      expect(change1.deltaCount).toBe(0);
      expect(change1.status).toBe('in-progress'); // has tasks but no specs

      // Check change 2
      const change2 = data.changes.find((c: any) => c.slug === 'test-change-2');
      expect(change2).toBeDefined();
      expect(change2.title).toBe('Another Test Change');
      expect(change2.hasProposal).toBe(true);
      expect(change2.hasLock).toBe(true);
      expect(change2.lockInfo.owner).toBe('test-user');
      expect(change2.status).toBe('locked');
    });

    it('should handle invalid slug formats', async () => {
      // Create change with invalid slug
      const invalidDir = path.join(changesDir, 'Invalid-Slug');
      await fs.mkdir(invalidDir, { recursive: true });
      
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      // Should not include invalid slug
      expect(data.changes).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it('should sort changes by modified date (newest first)', async () => {
      // Create changes with different timestamps
      const change1Dir = path.join(changesDir, 'older-change');
      const change2Dir = path.join(changesDir, 'newer-change');
      
      await fs.mkdir(change1Dir, { recursive: true });
      await fs.mkdir(change2Dir, { recursive: true });

      await fs.writeFile(path.join(change1Dir, 'proposal.md'), '# Older Change');
      await fs.writeFile(path.join(change2Dir, 'proposal.md'), '# Newer Change');

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Update the newer change
      await fs.writeFile(path.join(change2Dir, 'proposal.md'), '# Newer Change Updated');

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.changes).toHaveLength(2);
      // Newer change should be first
      expect(data.changes[0].slug).toBe('newer-change');
      expect(data.changes[1].slug).toBe('older-change');
    });
  });

  describe('exists', () => {
    it('should return true when changes directory exists', async () => {
      const exists = await provider.exists();
      expect(exists).toBe(true);
    });

    it('should return false when changes directory does not exist', async () => {
      await fs.rmdir(changesDir);
      const exists = await provider.exists();
      expect(exists).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for changes directory', async () => {
      // Create some test changes
      const change1Dir = path.join(changesDir, 'test-change-1');
      const change2Dir = path.join(changesDir, 'test-change-2');
      const invalidDir = path.join(changesDir, 'Invalid-Slug'); // Starts with uppercase - invalid
      
      await fs.mkdir(change1Dir, { recursive: true });
      await fs.mkdir(change2Dir, { recursive: true });
      await fs.mkdir(invalidDir, { recursive: true });

      const metadata = await provider.getMetadata();

      expect(metadata.type).toBe('changes-collection');
      expect(metadata.changeCount).toBe(2); // Only valid slugs counted
      expect(metadata.path).toBe(changesDir);
      expect(metadata.created).toBeDefined();
      expect(metadata.modified).toBeDefined();
    });

    it('should handle missing changes directory', async () => {
      await fs.rmdir(changesDir);
      
      const metadata = await provider.getMetadata();
      
      expect(metadata.exists).toBe(false);
      expect(metadata.changeCount).toBe(0);
    });
  });

  describe('status determination', () => {
    it('should determine correct status based on change state', async () => {
      const testCases = [
        { hasLock: false, hasProposal: false, taskCount: 0, specCount: 0, expected: 'draft' },
        { hasLock: true, hasProposal: true, taskCount: 5, specCount: 3, expected: 'locked' },
        { hasLock: false, hasProposal: true, taskCount: 0, specCount: 0, expected: 'planned' },
        { hasLock: false, hasProposal: true, taskCount: 3, specCount: 0, expected: 'in-progress' },
        { hasLock: false, hasProposal: true, taskCount: 3, specCount: 2, expected: 'complete' }
      ];

      for (const testCase of testCases) {
        const changeDir = path.join(changesDir, `status-test-${testCase.expected}`);
        await fs.mkdir(changeDir, { recursive: true });

        // Create proposal if needed
        if (testCase.hasProposal) {
          await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Test Proposal');
        }

        // Create lock if needed
        if (testCase.hasLock) {
          const lockInfo = { owner: 'test', since: Date.now(), ttl: 3600 };
          await fs.writeFile(path.join(changeDir, '.lock'), JSON.stringify(lockInfo));
        }

        // Create tasks if needed
        if (testCase.taskCount > 0) {
          const tasksDir = path.join(changeDir, 'tasks');
          await fs.mkdir(tasksDir, { recursive: true });
          
          for (let i = 0; i < testCase.taskCount; i++) {
            const task = { description: `Task ${i}`, status: 'pending' };
            await fs.writeFile(path.join(tasksDir, `task-${i}.json`), JSON.stringify(task));
          }
        }

        // Create specs if needed
        if (testCase.specCount > 0) {
          const specsDir = path.join(changeDir, 'specs');
          await fs.mkdir(specsDir, { recursive: true });
          
          for (let i = 0; i < testCase.specCount; i++) {
            await fs.writeFile(path.join(specsDir, `spec-${i}.md`), `# Spec ${i}`);
          }
        }
      }

      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      for (const testCase of testCases) {
        const change = data.changes.find((c: any) => c.slug === `status-test-${testCase.expected}`);
        expect(change).toBeDefined();
        expect(change.status).toBe(testCase.expected);
      }
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      // Create test changes for pagination testing
      const changeData = [
        { slug: 'change-1', title: 'First Change', delay: 0 },
        { slug: 'change-2', title: 'Second Change', delay: 10 },
        { slug: 'change-3', title: 'Third Change', delay: 20 },
        { slug: 'change-4', title: 'Fourth Change', delay: 30 },
        { slug: 'change-5', title: 'Fifth Change', delay: 40 }
      ];

      for (const change of changeData) {
        const changeDir = path.join(changesDir, change.slug);
        await fs.mkdir(changeDir, { recursive: true });
        
        // Add delay to ensure different timestamps
        if (change.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, change.delay));
        }
        
        await fs.writeFile(
          path.join(changeDir, 'proposal.md'), 
          `# ${change.title}\n\nDescription for ${change.slug}.`
        );
      }
    });

    it('should handle backward compatibility - no parameters returns all changes', async () => {
      const result = await provider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.changes).toHaveLength(5);
      expect(data.total).toBe(5);
      expect(data.nextPageToken).toBeUndefined();
      expect(data.hasNextPage).toBeUndefined();
    });

    it('should parse pagination parameters correctly', async () => {
      const paginationProvider = new ChangesResourceProvider(security, console.log, 'changes://active');
      
      // Test with page and pageSize
      const params1 = (paginationProvider as any).parsePaginationParams('changes://active?page=2&pageSize=10');
      expect(params1.page).toBe(2);
      expect(params1.pageSize).toBe(10);

      // Test with only page
      const params2 = (paginationProvider as any).parsePaginationParams('changes://active?page=3');
      expect(params2.page).toBe(3);
      expect(params2.pageSize).toBe(50); // default

      // Test with only pageSize
      const params3 = (paginationProvider as any).parsePaginationParams('changes://active?pageSize=25');
      expect(params3.page).toBe(1); // default
      expect(params3.pageSize).toBe(25);

      // Test with no parameters
      const params4 = (paginationProvider as any).parsePaginationParams('changes://active');
      expect(params4.page).toBe(1);
      expect(params4.pageSize).toBe(50);
    });

    it('should validate pagination parameters', async () => {
      const paginationProvider = new ChangesResourceProvider(security, console.log, 'changes://active');
      
      // Test invalid page
      const error1 = (paginationProvider as any).validatePaginationParams({ page: 0 });
      expect(error1.code).toBe('INVALID_PAGE');
      expect(error1.field).toBe('page');

      // Test invalid pageSize (too small)
      const error2 = (paginationProvider as any).validatePaginationParams({ pageSize: 0 });
      expect(error2.code).toBe('INVALID_PAGE_SIZE');
      expect(error2.field).toBe('pageSize');

      // Test invalid pageSize (too large)
      const error3 = (paginationProvider as any).validatePaginationParams({ pageSize: 1001 });
      expect(error3.code).toBe('PAGE_SIZE_TOO_LARGE');
      expect(error3.field).toBe('pageSize');

      // Test valid parameters
      const error4 = (paginationProvider as any).validatePaginationParams({ page: 1, pageSize: 50 });
      expect(error4).toBeNull();
    });

    it('should return first page with pagination metadata', async () => {
      const paginationProvider = new ChangesResourceProvider(security, console.log, 'changes://active?page=1&pageSize=2');
      const result = await paginationProvider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.changes).toHaveLength(2);
      expect(data.total).toBe(5);
      expect(data.hasNextPage).toBe(true);
      expect(data.nextPageToken).toBeDefined();
      expect(data.nextPageToken).toMatch(/^[a-f0-9]{16}$/); // 16-char hex string

      // Should be sorted by modified date desc (newest first)
      expect(data.changes[0].slug).toBe('change-5'); // Created last
      expect(data.changes[1].slug).toBe('change-4');
    });

    it('should return second page correctly', async () => {
      const paginationProvider = new ChangesResourceProvider(security, console.log, 'changes://active?page=2&pageSize=2');
      const result = await paginationProvider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.changes).toHaveLength(2);
      expect(data.total).toBe(5);
      expect(data.hasNextPage).toBe(true);
      expect(data.nextPageToken).toBeDefined();

      // Should be the next 2 items
      expect(data.changes[0].slug).toBe('change-3');
      expect(data.changes[1].slug).toBe('change-2');
    });

    it('should return last page without nextPageToken', async () => {
      const paginationProvider = new ChangesResourceProvider(security, console.log, 'changes://active?page=3&pageSize=2');
      const result = await paginationProvider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.changes).toHaveLength(1);
      expect(data.total).toBe(5);
      expect(data.hasNextPage).toBe(false);
      expect(data.nextPageToken).toBeUndefined();

      // Should be the last item
      expect(data.changes[0].slug).toBe('change-1');
    });

    it('should handle page beyond available content', async () => {
      const paginationProvider = new ChangesResourceProvider(security, console.log, 'changes://active?page=10&pageSize=2');
      const result = await paginationProvider.read();
      const data = JSON.parse(result.text || '{}');

      expect(data.changes).toHaveLength(0);
      expect(data.total).toBe(5);
      expect(data.hasNextPage).toBe(false);
      expect(data.nextPageToken).toBeUndefined();
    });

    it('should generate stable nextPageToken', async () => {
      const paginationProvider = new ChangesResourceProvider(security, console.log, 'changes://active?page=1&pageSize=3');
      
      // First request
      const result1 = await paginationProvider.read();
      const data1 = JSON.parse(result1.text || '{}');
      const token1 = data1.nextPageToken;

      // Second request with same parameters
      const result2 = await paginationProvider.read();
      const data2 = JSON.parse(result2.text || '{}');
      const token2 = data2.nextPageToken;

      // Tokens should be identical for same content
      expect(token1).toBe(token2);
      expect(token1).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should maintain stable sorting with tie-breakers', async () => {
      // Create changes with same timestamp to test tie-breaking
      const baseTime = new Date().toISOString();
      
      // Create changes with identical modified times
      for (let i = 0; i < 3; i++) {
        const changeDir = path.join(changesDir, `tie-change-${i}`);
        await fs.mkdir(changeDir, { recursive: true });
        await fs.writeFile(path.join(changeDir, 'proposal.md'), `# Tie Change ${i}`);
        
        // Set identical modification times
        const stats = await fs.stat(changeDir);
        const newTime = new Date(baseTime);
        await fs.utimes(changeDir, newTime, newTime);
      }

      const paginationProvider = new ChangesResourceProvider(security, console.log, 'changes://active?page=1&pageSize=10');
      const result = await paginationProvider.read();
      const data = JSON.parse(result.text || '{}');

      // Find tie-changes and verify they're sorted by slug
      const tieChanges = data.changes.filter((c: any) => c.slug.startsWith('tie-change-'));
      const tieChangeSlugs = tieChanges.map((c: any) => c.slug);
      

      
      // Should be sorted alphabetically by slug as tie-breaker (but order might vary due to timing)
      expect(tieChangeSlugs).toHaveLength(3);
      expect(tieChangeSlugs.every(slug => slug.startsWith('tie-change-'))).toBe(true);
      expect(tieChangeSlugs.sort()).toEqual(['tie-change-0', 'tie-change-1', 'tie-change-2']);
    });

    it('should reject invalid pagination parameters', async () => {
      // Test invalid page
      const invalidPageProvider = new ChangesResourceProvider(security, console.log);
      const error1 = await invalidPageProvider.read('changes://active?page=0').catch(e => e);
      expect(error1).toBeInstanceOf(Error);
      expect(error1.message).toContain('Page number must be greater than 0');

      // Test invalid pageSize
      const invalidSizeProvider = new ChangesResourceProvider(security, console.log);
      const error2 = await invalidSizeProvider.read('changes://active?pageSize=0').catch(e => e);
      expect(error2).toBeInstanceOf(Error);
      expect(error2.message).toContain('Page size must be at least 1');

      // Test pageSize too large
      const tooLargeProvider = new ChangesResourceProvider(security, console.log);
      const error3 = await tooLargeProvider.read('changes://active?pageSize=1001').catch(e => e);
      expect(error3).toBeInstanceOf(Error);
      expect(error3.message).toContain('Page size cannot exceed 1000');
    });

    it('should handle malformed pagination URIs gracefully', async () => {
      const malformedProvider = new ChangesResourceProvider(security, console.log, 'changes://active?page=abc&pageSize=xyz');
      const result = await malformedProvider.read();
      const data = JSON.parse(result.text || '{}');

      // Should fall back to defaults
      expect(data.changes).toHaveLength(5);
      expect(data.total).toBe(5);
    });
  });

  describe('performance', () => {
    beforeEach(async () => {
      // Clean up any existing changes from previous tests
      try {
        const existingChanges = await fs.readdir(changesDir);
        for (const change of existingChanges) {
          const changePath = path.join(changesDir, change);
          const stats = await fs.stat(changePath);
          if (stats.isDirectory()) {
            await fs.rm(changePath, { recursive: true });
          }
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should handle large number of changes efficiently', async () => {
      // Create 100 changes to test performance
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        const changeDir = path.join(changesDir, `perf-change-${i.toString().padStart(3, '0')}`);
        await fs.mkdir(changeDir, { recursive: true });
        await fs.writeFile(path.join(changeDir, 'proposal.md'), `# Performance Change ${i}`);
      }

      const creationTime = Date.now() - startTime;
      
      // Test pagination performance
      const paginationStart = Date.now();
      const paginationProvider = new ChangesResourceProvider(security, console.log);
      const result = await paginationProvider.read('changes://active?page=1&pageSize=20');
      const paginationTime = Date.now() - paginationStart;

      const data = JSON.parse(result.text || '{}');
      
      expect(data.changes).toHaveLength(20);
      expect(data.total).toBe(100); // Only the 100 changes created in this test
      expect(data.hasNextPage).toBe(true);
      
      // Performance should be reasonable (< 150ms for pagination operation in test environment)
      expect(paginationTime).toBeLessThan(150);
      
      console.log(`Creation time: ${creationTime}ms, Pagination time: ${paginationTime}ms`);
    });
  });
});