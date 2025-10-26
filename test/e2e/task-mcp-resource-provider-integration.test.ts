/**
 * End-to-end integration test for TaskMCPResourceProvider
 * Tests the complete integration with factory and real-world scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskMCPResourceProvider } from '../../src/stdio/resources/task-mcp-resource-provider.js';
import { SecurityContext } from '../../src/stdio/types/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { mkdtemp, rmdir, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Helper functions
async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'openspec-e2e-'));
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await rmdir(dir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('TaskMCPResourceProvider End-to-End Integration', () => {
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

    // Setup security context
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

  describe('Complete workflow integration', () => {
    beforeEach(async () => {
      // Create realistic test data
      const changes = [
        {
          slug: 'feature-auth',
          title: 'Add Authentication System',
          description: 'Implement JWT-based authentication with refresh tokens',
          files: {
            'proposal.md': `# Add Authentication System

## Overview
Implement a comprehensive authentication system using JWT tokens with refresh token support.

## Technical Details
- Use bcrypt for password hashing
- JWT tokens with 15-minute expiration
- Refresh tokens with 7-day expiration
- Rate limiting on auth endpoints`,
            'tasks.json': JSON.stringify([
              {
                id: 'auth-1',
                description: 'Design authentication schema',
                status: 'completed',
                dependencies: []
              },
              {
                id: 'auth-2', 
                description: 'Implement JWT service',
                status: 'in-progress',
                dependencies: ['auth-1']
              }
            ], null, 2),
            'implementation.md': `# Implementation Notes

## Database Schema
\`\`\`sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\``,
            'openspec.json': JSON.stringify({
              title: 'Add Authentication System',
              status: 'in-progress',
              priority: 'high',
              assignee: 'security-team'
            }, null, 2)
          }
        },
        {
          slug: 'feature-ui-redesign',
          title: 'UI Redesign for Dashboard',
          description: 'Modernize the dashboard interface with new design system',
          files: {
            'proposal.md': `# UI Redesign for Dashboard

## Overview
Update the dashboard to use our new design system with improved UX.

## Changes
- New color scheme
- Improved navigation
- Better mobile responsiveness`,
            'design-mockups.png': 'fake-image-content-for-testing',
            'openspec.json': JSON.stringify({
              title: 'UI Redesign for Dashboard',
              status: 'planning',
              priority: 'medium'
            }, null, 2)
          }
        },
        {
          slug: 'bugfix-memory-leak',
          title: 'Fix Memory Leak in Data Processing',
          description: 'Resolve memory leak issue in batch data processing',
          files: {
            'proposal.md': `# Fix Memory Leak in Data Processing

## Issue
Memory usage grows linearly during batch processing.

## Root Cause
Event listeners not being properly cleaned up.`,
            'fix.patch': `--- a/src/processor.js
+++ b/src/processor.js
@@ -45,6 +45,7 @@ class DataProcessor {
   }
   
   cleanup() {
+    this.eventEmitter.removeAllListeners();
     this.cache.clear();
   }
 }`,
            'openspec.json': JSON.stringify({
              title: 'Fix Memory Leak in Data Processing',
              status: 'completed',
              priority: 'critical'
            }, null, 2)
          }
        }
      ];

      // Create all changes with their files
      for (const change of changes) {
        const changeDir = path.join(changesDir, change.slug);
        await fs.mkdir(changeDir, { recursive: true });
        
        for (const [filename, content] of Object.entries(change.files)) {
          await fs.writeFile(path.join(changeDir, filename), content, 'utf8');
        }
      }
    });

    it('should handle complete changes listing with pagination', async () => {
      // Get first page
      const result1 = await provider.read('changes://active?page=1&pageSize=2');
      expect(result1.mimeType).toBe('application/json');
      
      const data1 = JSON.parse(result1.text!);
      expect(data1.items).toHaveLength(2);
      expect(data1.pagination.totalItems).toBe(3);
      expect(data1.pagination.hasMore).toBe(true);
      expect(data1.pagination.nextPageToken).toBeDefined();
      
      // Get second page
      const result2 = await provider.read(`changes://active?nextPageToken=${data1.pagination.nextPageToken}`);
      const data2 = JSON.parse(result2.text!);
      expect(data2.items).toHaveLength(1);
      expect(['bugfix-memory-leak', 'feature-ui-redesign', 'feature-auth']).toContain(data2.items[0].slug);
      expect(data2.pagination.hasMore).toBe(false);
    });

    it('should handle individual change access with streaming', async () => {
      // Get change metadata
      const metadataResult = await provider.read('change://feature-auth');
      const metadata = JSON.parse(metadataResult.text!);
      
      expect(metadata.slug).toBe('feature-auth');
      expect(metadata.files).toContain('proposal.md');
      expect(metadata.files).toContain('tasks.json');
      expect(metadata.files).toContain('implementation.md');
      expect(metadata.files).toContain('openspec.json');
      expect(metadata.manifest.title).toBe('Add Authentication System');
      
      // Read specific files
      const proposalResult = await provider.read('change://feature-auth/proposal.md');
      expect(proposalResult.mimeType).toBe('text/markdown');
      expect(proposalResult.text).toContain('Add Authentication System');
      expect(proposalResult.text).toContain('JWT tokens');
      
      const tasksResult = await provider.read('change://feature-auth/tasks.json');
      expect(tasksResult.mimeType).toBe('application/json');
      const tasks = JSON.parse(tasksResult.text!);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].description).toBe('Design authentication schema');
      expect(tasks[0].status).toBe('completed');
      
      const manifestResult = await provider.read('change://feature-auth/openspec.json');
      const manifest = JSON.parse(manifestResult.text!);
      expect(manifest.status).toBe('in-progress');
      expect(manifest.priority).toBe('high');
    });

    it('should handle binary files correctly', async () => {
      // Read the "image" file
      const imageResult = await provider.read('change://feature-ui-redesign/design-mockups.png');
      expect(imageResult.mimeType).toBe('image/png');
      expect(imageResult.text || imageResult.blob).toBe('fake-image-content-for-testing');
    });

    it('should handle patch/diff files', async () => {
      const patchResult = await provider.read('change://bugfix-memory-leak/fix.patch');
      expect(patchResult.mimeType).toBe('text/plain');
      expect(patchResult.text).toContain('removeAllListeners');
      expect(patchResult.text).toContain('removeAllListeners');
    });

    it('should handle security validation properly', async () => {
      // Test path traversal attempts
      await expect(
        provider.read('change://feature-auth/../../../etc/passwd')
      ).rejects.toThrow('URI security validation failed');
      
      // Test invalid slug formats
      await expect(
        provider.read('change://Invalid-Slug/file.txt')
      ).rejects.toThrow('URI security validation failed');
      
      // Test nonexistent changes
      await expect(
        provider.read('change://nonexistent-change')
      ).rejects.toThrow('Change not found: nonexistent-change');
    });

    it('should handle metadata queries correctly', async () => {
      // Test changes://active metadata
      const activeMetadataProvider = new TaskMCPResourceProvider(security, console.log, 'changes://active');
      const activeMetadata = await activeMetadataProvider.getMetadata();
      expect(activeMetadata.type).toBe('changes-collection');
      expect(activeMetadata.supportsPagination).toBe(true);
      expect(activeMetadata.supportedQueryParams).toContain('page');
      expect(activeMetadata.supportedQueryParams).toContain('pageSize');
      
      // Test change metadata
      const changeMetadataProvider = new TaskMCPResourceProvider(security, console.log, 'change://feature-auth');
      const changeMetadata = await changeMetadataProvider.getMetadata();
      expect(changeMetadata.type).toBe('change');
      expect(changeMetadata.slug).toBe('feature-auth');
      expect(changeMetadata.exists).toBe(true);
      
      // Test file metadata
      const fileMetadataProvider = new TaskMCPResourceProvider(security, console.log, 'change://feature-auth/proposal.md');
      const fileMetadata = await fileMetadataProvider.getMetadata();
      expect(fileMetadata.type).toBe('file');
      expect(fileMetadata.slug).toBe('feature-auth');
      expect(fileMetadata.filePath).toBe('proposal.md');
      expect(fileMetadata.mimeType).toBe('text/markdown');
      expect(fileMetadata.exists).toBe(true);
    });

    it('should handle existence checks correctly', async () => {
      // Test existing resources
      const activeProvider = new TaskMCPResourceProvider(security, console.log, 'changes://active');
      expect(await activeProvider.exists()).toBe(true);
      
      const changeProvider = new TaskMCPResourceProvider(security, console.log, 'change://feature-auth');
      expect(await changeProvider.exists()).toBe(true);
      
      const fileProvider = new TaskMCPResourceProvider(security, console.log, 'change://feature-auth/proposal.md');
      expect(await fileProvider.exists()).toBe(true);
      
      // Test nonexistent resources
      const nonexistentProvider = new TaskMCPResourceProvider(security, console.log, 'change://nonexistent');
      expect(await nonexistentProvider.exists()).toBe(false);
      
      const nonexistentFileProvider = new TaskMCPResourceProvider(security, console.log, 'change://feature-auth/nonexistent.md');
      expect(await nonexistentFileProvider.exists()).toBe(false);
    });

    it('should handle performance with large datasets', async () => {
      // Create many changes to test performance
      for (let i = 100; i < 150; i++) {
        const changeDir = path.join(changesDir, `perf-change-${i}`);
        await fs.mkdir(changeDir, { recursive: true });
        await fs.writeFile(
          path.join(changeDir, 'proposal.md'),
          `# Performance Test Change ${i}\n\nThis is a test change for performance testing.`,
          'utf8'
        );
      }
      
      // Test pagination performance
      const startTime = Date.now();
      const result = await provider.read('changes://active?page=1&pageSize=20');
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      
      const data = JSON.parse(result.text!);
      expect(data.items).toHaveLength(20);
      expect(data.pagination.totalItems).toBeGreaterThan(50); // At least our test changes
    });

    it('should handle concurrent access safely', async () => {
      // Make multiple concurrent requests
      const promises = [
        provider.read('changes://active?page=1&pageSize=5'),
        provider.read('change://feature-auth/proposal.md'),
        provider.read('change://feature-ui-redesign/proposal.md'),
        provider.read('change://bugfix-memory-leak/fix.patch'),
        new TaskMCPResourceProvider(security, console.log, 'change://feature-auth').getMetadata()
      ];
      
      const results = await Promise.all(promises);
      
      // All requests should succeed
      expect(results).toHaveLength(5);
      expect(results[0].mimeType).toBe('application/json');
      expect(results[1].mimeType).toBe('text/markdown');
      expect(results[2].mimeType).toBe('text/markdown');
      expect(results[3].mimeType).toBe('text/plain');
      expect(typeof results[4]).toBe('object');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle malformed URIs gracefully', async () => {
      await expect(provider.read('not-a-valid-uri')).rejects.toThrow();
      await expect(provider.read('')).rejects.toThrow();
      await expect(provider.read('://missing-scheme')).rejects.toThrow();
    });

    it('should handle file system errors gracefully', async () => {
      // Create a change but remove the directory to simulate filesystem error
      const changeDir = path.join(changesDir, 'test-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'test.txt'), 'test', 'utf8');
      
      // Should work initially
      await expect(provider.read('change://test-change/test.txt')).resolves.toBeDefined();
      
      // Remove directory to simulate error
      await fs.rmdir(changeDir, { recursive: true });
      
      // Should handle error gracefully
      await expect(provider.read('change://test-change')).rejects.toThrow('Change not found');
      await expect(provider.read('change://test-change/test.txt')).rejects.toThrow();
    });

    it('should handle corrupted files gracefully', async () => {
      // Create change with corrupted JSON
      const changeDir = path.join(changesDir, 'corrupted-change');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'openspec.json'), '{ invalid json }', 'utf8');
      
      // Should handle corrupted JSON gracefully
      const result = await provider.read('change://corrupted-change');
      const data = JSON.parse(result.text!);
      expect(data.slug).toBe('corrupted-change');
      expect(data.manifest).toEqual({}); // Should default to empty object
    });
  });
});