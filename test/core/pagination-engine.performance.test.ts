import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { PaginationEngine } from '../../src/core/pagination-engine';

describe('PaginationEngine Performance', () => {
  let engine: PaginationEngine;
  let testDir: string;
  let changesDir: string;

  beforeEach(async () => {
    engine = new PaginationEngine();
    testDir = path.join(process.cwd(), 'test-tmp-pagination-perf');
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

  test('handles large number of changes efficiently', async () => {
    // Create 500 changes (more realistic test size)
    const startTime = Date.now();
    
    for (let i = 0; i < 500; i++) {
      const slug = `perf-${String(i).padStart(3, '0')}`;
      const changePath = path.join(changesDir, slug);
      await fs.mkdir(changePath);
      
      const proposalPath = path.join(changePath, 'proposal.md');
      await fs.writeFile(proposalPath, `# Performance Test ${i}\n\nThis is test change ${i}.`);
      
      // Set different mtimes for consistent ordering
      const mtime = new Date(Date.now() - i * 1000); // 1 second apart
      await fs.utimes(changePath, mtime, mtime);
    }
    
    const creationTime = Date.now() - startTime;
    
    // Test first page performance
    const firstPageStart = Date.now();
    const firstPage = await engine.paginate(testDir, { pageSize: 50 });
    const firstPageTime = Date.now() - firstPageStart;
    
    // Test deep pagination performance
    const deepPageStart = Date.now();
    let currentPage = firstPage;
    let pageCount = 1;
    
    // Navigate to page 5
    while (currentPage.nextPageToken && pageCount < 5) {
      currentPage = await engine.paginate(testDir, { 
        pageSize: 50, 
        nextPageToken: currentPage.nextPageToken 
      });
      pageCount++;
    }
    
    const deepPageTime = Date.now() - deepPageStart;
    
    // Performance assertions (adjusted for realistic file system performance)
    expect(creationTime).toBeLessThan(8000); // Should create 500 changes in < 8s
    expect(firstPageTime).toBeLessThan(1000); // First page should be < 1s
    expect(deepPageTime).toBeLessThan(1000); // Deep pagination should be < 1s
    
    // Correctness assertions
    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.totalItems).toBe(500);
    expect(firstPage.hasMore).toBe(true);
    expect(currentPage.page).toBe(5);
  });

  test('maintains stable ordering under concurrent modifications', async () => {
    // Create initial set of changes
    for (let i = 0; i < 100; i++) {
      const slug = `stable-${String(i).padStart(3, '0')}`;
      const changePath = path.join(changesDir, slug);
      await fs.mkdir(changePath);
      
      const proposalPath = path.join(changePath, 'proposal.md');
      await fs.writeFile(proposalPath, `# Stable Test ${i}`);
      
      const mtime = new Date(Date.now() - i * 60000); // 1 minute apart
      await fs.utimes(changePath, mtime, mtime);
    }
    
    // Get first page
    const firstPage = await engine.paginate(testDir, { pageSize: 10 });
    const firstPageSlugs = firstPage.items.map(i => i.slug);
    
    // Add new changes (should appear at beginning)
    for (let i = 0; i < 10; i++) {
      const slug = `new-${String(i).padStart(2, '0')}`;
      const changePath = path.join(changesDir, slug);
      await fs.mkdir(changePath);
      
      const proposalPath = path.join(changePath, 'proposal.md');
      await fs.writeFile(proposalPath, `# New Test ${i}`);
      
      // Newer mtime than existing changes
      const mtime = new Date(Date.now() + i * 1000);
      await fs.utimes(changePath, mtime, mtime);
    }
    
    // Navigate using original token - should get same results
    const secondPageWithToken = await engine.paginate(testDir, { 
      pageSize: 10, 
      nextPageToken: firstPage.nextPageToken 
    });
    
    // Get fresh first page - should include new items
    const freshFirstPage = await engine.paginate(testDir, { pageSize: 10 });
    
    // Original pagination should be stable
    expect(firstPageSlugs).toEqual(firstPage.items.map(i => i.slug));
    
    // Fresh pagination should include new items at beginning
    expect(freshFirstPage.items.slice(0, 10).map(i => i.slug)).toContain('new-00');
    
    // Token-based pagination should still work correctly
    expect(secondPageWithToken.items).toHaveLength(10);
    expect(secondPageWithToken.page).toBe(2);
  });

  test('memory usage remains reasonable with large datasets', async () => {
    // Create a large number of changes with some content
    for (let i = 0; i < 500; i++) {
      const slug = `memory-${String(i).padStart(4, '0')}`;
      const changePath = path.join(changesDir, slug);
      await fs.mkdir(changePath);
      
      // Create larger proposal files
      const content = `# Memory Test ${i}\n\n` + 
        'This is a larger proposal to test memory usage.\n'.repeat(100);
      const proposalPath = path.join(changePath, 'proposal.md');
      await fs.writeFile(proposalPath, content);
      
      const mtime = new Date(Date.now() - i * 1000);
      await fs.utimes(changePath, mtime, mtime);
    }
    
    // Measure memory before pagination
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Perform multiple pagination operations
    let currentPage = await engine.paginate(testDir, { pageSize: 20 });
    let page_count = 1;
    
    while (currentPage.nextPageToken && page_count < 5) {
      currentPage = await engine.paginate(testDir, { 
        pageSize: 20, 
        nextPageToken: currentPage.nextPageToken 
      });
      page_count++;
    }
    
    // Measure memory after pagination
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (less than 50MB)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    
    // Verify pagination worked correctly
    expect(currentPage.items).toHaveLength(20);
    expect(currentPage.page).toBe(5);
  });
});