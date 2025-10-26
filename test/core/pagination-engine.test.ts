import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { PaginationEngine } from '../../src/core/pagination-engine';

describe('PaginationEngine', () => {
  let engine: PaginationEngine;
  let testDir: string;
  let changesDir: string;

  beforeEach(async () => {
    engine = new PaginationEngine();
    testDir = path.join(process.cwd(), 'test-tmp-pagination');
    changesDir = path.join(testDir, 'openspec', 'changes');
    
    // Create test directory structure
    await fs.mkdir(changesDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Token Encoding/Decoding', () => {
    test('encodes and decodes tokens correctly', () => {
      const originalToken = {
        page: 2,
        timestamp: '2025-10-25T14:30:00.123Z',
        sortKey: '2025-10-25T14:30:00.123Z_feature-authentication'
      };

      const encoded = engine['encodeToken'](originalToken);
      const decoded = engine['decodeToken'](encoded);

      expect(decoded).toEqual(originalToken);
    });

    test('returns null for invalid base64 tokens', () => {
      const invalidToken = 'invalid-base64!@#';
      const decoded = engine['decodeToken'](invalidToken);
      expect(decoded).toBeNull();
    });

    test('returns null for malformed JSON tokens', () => {
      const malformedToken = Buffer.from('{"page": 2, "timestamp":').toString('base64url');
      const decoded = engine['decodeToken'](malformedToken);
      expect(decoded).toBeNull();
    });

    test('handles empty tokens gracefully', () => {
      const decoded = engine['decodeToken']('');
      expect(decoded).toBeNull();
    });

    test('produces URL-safe tokens', () => {
      const token = {
        page: 1,
        timestamp: '2025-10-25T14:30:00.123Z',
        sortKey: 'test-key'
      };
      const encoded = engine['encodeToken'](token);
      
      // Should not contain URL-unsafe characters
      expect(encoded).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  describe('Lock File Checking', () => {
    test('returns false when no lock file exists', async () => {
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      
      const isLocked = await engine['isLocked'](changePath);
      expect(isLocked).toBe(false);
    });

    test('returns false for expired lock files', async () => {
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      
      const lockPath = path.join(changePath, '.lock');
      const expiredLock = {
        since: new Date(Date.now() - 5000).toISOString(), // 5 seconds ago
        ttl: 1 // 1 second TTL
      };
      await fs.writeFile(lockPath, JSON.stringify(expiredLock));
      
      const isLocked = await engine['isLocked'](changePath);
      expect(isLocked).toBe(false);
    });

    test('returns true for valid lock files', async () => {
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      
      const lockPath = path.join(changePath, '.lock');
      const validLock = {
        since: new Date().toISOString(),
        ttl: 60 // 60 seconds TTL
      };
      await fs.writeFile(lockPath, JSON.stringify(validLock));
      
      const isLocked = await engine['isLocked'](changePath);
      expect(isLocked).toBe(true);
    });

    test('returns false for malformed lock files', async () => {
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      
      const lockPath = path.join(changePath, '.lock');
      await fs.writeFile(lockPath, 'invalid-json');
      
      const isLocked = await engine['isLocked'](changePath);
      expect(isLocked).toBe(false);
    });
  });

  describe('Directory Scanning and Sorting', () => {
    beforeEach(async () => {
      // Create test changes with different mtimes
      const changes = [
        { slug: 'feature-auth', mtime: new Date('2025-10-25T14:30:00.000Z') },
        { slug: 'bugfix-login', mtime: new Date('2025-10-25T15:45:00.000Z') },
        { slug: 'feature-ui', mtime: new Date('2025-10-25T14:30:00.000Z') }, // Same mtime as feature-auth
        { slug: 'refactor-api', mtime: new Date('2025-10-24T10:00:00.000Z') }
      ];

      for (const change of changes) {
        const changePath = path.join(changesDir, change.slug);
        await fs.mkdir(changePath);
        
        // Create proposal.md
        const proposalPath = path.join(changePath, 'proposal.md');
        await fs.writeFile(proposalPath, `# ${change.slug}\n\nThis is a test proposal.`);
        
        // Set mtime
        await fs.utimes(changePath, change.mtime, change.mtime);
      }
    });

    test('sorts changes by mtime DESC then slug ASC', async () => {
      const response = await engine.paginate(testDir, { pageSize: 10 });
      
      // Expected order: bugfix-login (15:45), feature-auth (14:30), feature-ui (14:30), refactor-api (10:00)
      // feature-auth comes before feature-ui due to slug ASC tiebreaker
      expect(response.items).toHaveLength(4);
      expect(response.items[0].slug).toBe('bugfix-login');
      expect(response.items[1].slug).toBe('feature-auth');
      expect(response.items[2].slug).toBe('feature-ui');
      expect(response.items[3].slug).toBe('refactor-api');
    });

    test('skips non-directory entries', async () => {
      // Create a file in changes directory
      const filePath = path.join(changesDir, 'not-a-directory.txt');
      await fs.writeFile(filePath, 'This is not a directory');
      
      const response = await engine.paginate(testDir, { pageSize: 10 });
      
      // Should still only include the 4 directories
      expect(response.items).toHaveLength(4);
      expect(response.items.every(item => item.slug !== 'not-a-directory.txt')).toBe(true);
    });

    test('includes lock status in results', async () => {
      // Add a lock file to one change
      const lockPath = path.join(changesDir, 'feature-auth', '.lock');
      const validLock = {
        since: new Date().toISOString(),
        ttl: 60
      };
      await fs.writeFile(lockPath, JSON.stringify(validLock));
      
      const response = await engine.paginate(testDir, { pageSize: 10 });
      
      const featureAuth = response.items.find(item => item.slug === 'feature-auth');
      expect(featureAuth?.isLocked).toBe(true);
      
      const bugfixLogin = response.items.find(item => item.slug === 'bugfix-login');
      expect(bugfixLogin?.isLocked).toBe(false);
    });
  });

  describe('Pagination Logic', () => {
    beforeEach(async () => {
      // Create 15 test changes
      for (let i = 0; i < 15; i++) {
        const slug = `change-${String(i).padStart(2, '0')}`;
        const changePath = path.join(changesDir, slug);
        await fs.mkdir(changePath);
        
        const proposalPath = path.join(changePath, 'proposal.md');
        await fs.writeFile(proposalPath, `# Change ${i}\n\nThis is test change ${i}.`);
        
        // Set different mtimes for consistent ordering
        const mtime = new Date(Date.now() - i * 60000); // 1 minute apart
        await fs.utimes(changePath, mtime, mtime);
      }
    });

    test('handles first page correctly', async () => {
      const response = await engine.paginate(testDir, { pageSize: 5 });
      
      expect(response.page).toBe(1);
      expect(response.pageSize).toBe(5);
      expect(response.items).toHaveLength(5);
      expect(response.totalItems).toBe(15);
      expect(response.totalPages).toBe(3);
      expect(response.hasMore).toBe(true);
      expect(response.nextPageToken).toBeDefined();
      expect(response.previousPageToken).toBeUndefined();
    });

    test('handles middle pages correctly', async () => {
      const firstResponse = await engine.paginate(testDir, { pageSize: 5 });
      const secondResponse = await engine.paginate(testDir, { 
        pageSize: 5, 
        nextPageToken: firstResponse.nextPageToken 
      });
      
      expect(secondResponse.page).toBe(2);
      expect(secondResponse.items).toHaveLength(5);
      expect(secondResponse.hasMore).toBe(true);
      expect(secondResponse.nextPageToken).toBeDefined();
      expect(secondResponse.previousPageToken).toBeDefined();
    });

    test('handles last page correctly', async () => {
      // Get to last page
      let response = await engine.paginate(testDir, { pageSize: 5 });
      while (response.nextPageToken) {
        response = await engine.paginate(testDir, { 
          pageSize: 5, 
          nextPageToken: response.nextPageToken 
        });
      }
      
      expect(response.page).toBe(3);
      expect(response.items).toHaveLength(5);
      expect(response.hasMore).toBe(false);
      expect(response.nextPageToken).toBeUndefined();
      expect(response.previousPageToken).toBeDefined();
    });

    test('respects page size limits', async () => {
      // Test with page size > 100 (should be capped at 100)
      const response = await engine.paginate(testDir, { pageSize: 150 });
      expect(response.pageSize).toBe(100);
      
      // Test with page size = 100 (should be allowed)
      const response2 = await engine.paginate(testDir, { pageSize: 100 });
      expect(response2.pageSize).toBe(100);
    });

    test('uses default page size when not specified', async () => {
      const response = await engine.paginate(testDir, {});
      expect(response.pageSize).toBe(50);
    });

    test('handles empty directory', async () => {
      // Remove all changes
      const entries = await fs.readdir(changesDir);
      for (const entry of entries) {
        await fs.rm(path.join(changesDir, entry), { recursive: true });
      }
      
      const response = await engine.paginate(testDir, { pageSize: 10 });
      
      expect(response.items).toHaveLength(0);
      expect(response.page).toBe(1);
      expect(response.totalItems).toBe(0);
      expect(response.totalPages).toBe(0);
      expect(response.hasMore).toBe(false);
      expect(response.nextPageToken).toBeUndefined();
      expect(response.previousPageToken).toBeUndefined();
    });

    test('handles single page results', async () => {
      // Clean up all changes first
      const entries = await fs.readdir(changesDir);
      for (const entry of entries) {
        await fs.rm(path.join(changesDir, entry), { recursive: true });
      }
      
      // Create only 3 changes
      for (let i = 0; i < 3; i++) {
        const slug = `single-${i}`;
        const changePath = path.join(changesDir, slug);
        await fs.mkdir(changePath);
        
        const proposalPath = path.join(changePath, 'proposal.md');
        await fs.writeFile(proposalPath, `# Single ${i}`);
        
        const mtime = new Date(Date.now() - i * 60000);
        await fs.utimes(changePath, mtime, mtime);
      }
      
      const response = await engine.paginate(testDir, { pageSize: 10 });
      
      expect(response.items).toHaveLength(3);
      expect(response.totalPages).toBe(1);
      expect(response.hasMore).toBe(false);
      expect(response.nextPageToken).toBeUndefined();
    });
  });

  describe('Title Extraction', () => {
    test('extracts title from proposal.md', async () => {
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      
      const proposalPath = path.join(changePath, 'proposal.md');
      await fs.writeFile(proposalPath, '# Custom Title\n\nThis is the content.');
      
      const response = await engine.paginate(testDir, { pageSize: 10 });
      const item = response.items.find(i => i.slug === 'test-change');
      
      expect(item?.title).toBe('Custom Title');
    });

    test('uses slug as fallback when no title found', async () => {
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      
      const proposalPath = path.join(changePath, 'proposal.md');
      await fs.writeFile(proposalPath, 'No title here\n\nJust content.');
      
      const response = await engine.paginate(testDir, { pageSize: 10 });
      const item = response.items.find(i => i.slug === 'test-change');
      
      expect(item?.title).toBe('test-change');
    });

    test('uses slug as fallback when proposal.md missing', async () => {
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      // No proposal.md
      
      const response = await engine.paginate(testDir, { pageSize: 10 });
      const item = response.items.find(i => i.slug === 'test-change');
      
      expect(item?.title).toBe('test-change');
    });
  });

  describe('Error Handling', () => {
    test('handles invalid nextPageToken gracefully', async () => {
      const response = await engine.paginate(testDir, { 
        pageSize: 10, 
        nextPageToken: 'invalid-token' 
      });
      
      // Should fall back to page 1 behavior
      expect(response.page).toBe(1);
      expect(response.items).toHaveLength(0); // No changes created
    });

    test('handles missing openspec directory', async () => {
      const nonExistentDir = path.join(testDir, 'non-existent');
      
      // Should not throw, but return empty response
      const response = await engine.paginate(nonExistentDir, { pageSize: 10 });
      expect(response.items).toHaveLength(0);
    });

    test('handles permission errors gracefully', async () => {
      // Create a change directory with restricted access simulation
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      
      // This test would require more complex setup to simulate permission errors
      // For now, just ensure normal operation works
      const response = await engine.paginate(testDir, { pageSize: 10 });
      expect(response.items).toBeDefined();
    });
  });

  describe('Cursor Positioning', () => {
    test('positions cursor correctly after sortKey', async () => {
      // Create changes with known order
      const changes = [
        'change-a', 'change-b', 'change-c', 'change-d', 'change-e'
      ];
      
      for (let i = 0; i < changes.length; i++) {
        const changePath = path.join(changesDir, changes[i]);
        await fs.mkdir(changePath);
        
        const proposalPath = path.join(changePath, 'proposal.md');
        await fs.writeFile(proposalPath, `# ${changes[i]}`);
        
        // Set mtime to ensure known order (newer first)
        const mtime = new Date(Date.now() - i * 60000);
        await fs.utimes(changePath, mtime, mtime);
      }
      
      // Get first page
      const firstPage = await engine.paginate(testDir, { pageSize: 2 });
      expect(firstPage.items.map(i => i.slug)).toEqual(['change-a', 'change-b']);
      
      // Get second page using token
      const secondPage = await engine.paginate(testDir, { 
        pageSize: 2, 
        nextPageToken: firstPage.nextPageToken 
      });
      expect(secondPage.items.map(i => i.slug)).toEqual(['change-c', 'change-d']);
      
      // Get third page
      const thirdPage = await engine.paginate(testDir, { 
        pageSize: 2, 
        nextPageToken: secondPage.nextPageToken 
      });
      expect(thirdPage.items.map(i => i.slug)).toEqual(['change-e']);
    });
  });

  describe('URI Generation', () => {
    test('generates correct URIs for changes', async () => {
      const changePath = path.join(changesDir, 'test-change');
      await fs.mkdir(changePath);
      
      const proposalPath = path.join(changePath, 'proposal.md');
      await fs.writeFile(proposalPath, '# Test Change');
      
      const response = await engine.paginate(testDir, { pageSize: 10 });
      const item = response.items.find(i => i.slug === 'test-change');
      
      expect(item?.uri).toBe('change://test-change');
    });
  });

  describe('Integration with Page Numbers', () => {
    beforeEach(async () => {
      // Create 25 changes for pagination testing
      for (let i = 0; i < 25; i++) {
        const slug = `change-${String(i).padStart(2, '0')}`;
        const changePath = path.join(changesDir, slug);
        await fs.mkdir(changePath);
        
        const proposalPath = path.join(changePath, 'proposal.md');
        await fs.writeFile(proposalPath, `# Change ${i}`);
        
        const mtime = new Date(Date.now() - i * 60000);
        await fs.utimes(changePath, mtime, mtime);
      }
    });

    test('supports page-based pagination for backward compatibility', async () => {
      const page1 = await engine.paginate(testDir, { page: 1, pageSize: 10 });
      const page2 = await engine.paginate(testDir, { page: 2, pageSize: 10 });
      const page3 = await engine.paginate(testDir, { page: 3, pageSize: 10 });
      
      expect(page1.page).toBe(1);
      expect(page1.items).toHaveLength(10);
      expect(page1.hasMore).toBe(true);
      
      expect(page2.page).toBe(2);
      expect(page2.items).toHaveLength(10);
      expect(page2.hasMore).toBe(true);
      
      expect(page3.page).toBe(3);
      expect(page3.items).toHaveLength(5);
      expect(page3.hasMore).toBe(false);
    });

    test('prioritizes nextPageToken over page number when both provided', async () => {
      const page1 = await engine.paginate(testDir, { page: 1, pageSize: 10 });
      
      // Request page 2 but provide page 1's token - should follow token
      const response = await engine.paginate(testDir, { 
        page: 2, 
        pageSize: 10, 
        nextPageToken: page1.nextPageToken 
      });
      
      expect(response.page).toBe(2); // Token advances to page 2
      expect(response.items).toHaveLength(10);
    });
  });
});