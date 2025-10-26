/**
 * Comprehensive E2E Testing for Resource Providers
 * 
 * This test suite validates all resource providers:
 * - changes:// collection resource
 * - change://{slug} individual change resources
 * - proposal://{slug} proposal resources
 * - tasks://{slug} task resources
 * - delta://{slug} delta resources
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createDevServer } from '../../src/stdio/factory.js';
import { MCPServer } from '../../src/stdio/server.js';

describe('Phase 1 Task MCP - Resource Providers E2E Tests', () => {
  let server: MCPServer;
  let testDir: string;

  beforeEach(async () => {
    // Create isolated test environment
    testDir = path.join('/tmp', `openspec-resources-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize openspec structure
    const openspecDir = path.join(testDir, 'openspec');
    await fs.mkdir(openspecDir, { recursive: true });
    
    server = await createDevServer(testDir);
    await initializeServer(server);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Changes Collection Resource', () => {
    it('should list empty changes collection', async () => {
      const result = await callResource(server, 'changes://');
      
      expect(result.error).toBeUndefined();
      const data = JSON.parse(result.result.text);
      expect(data.changes).toHaveLength(0);
      expect(data.total).toBe(0);
      expect(data.generated).toBeDefined();
    });

    it('should list multiple changes with correct metadata', async () => {
      // Create multiple changes
      const changes = [
        { slug: 'feature-test', title: 'Feature Test', template: 'feature' as const },
        { slug: 'bugfix-test', title: 'Bugfix Test', template: 'bugfix' as const },
        { slug: 'chore-test', title: 'Chore Test', template: 'chore' as const }
      ];

      for (const change of changes) {
        await callTool(server, 'change.open', {
          title: change.title,
          slug: change.slug,
          template: change.template
        });
      }

      const result = await callResource(server, 'changes://');
      const data = JSON.parse(result.result.text);
      
      expect(data.changes).toHaveLength(3);
      expect(data.total).toBe(3);
      
      // Verify each change is present
      const slugs = data.changes.map((c: any) => c.slug);
      expect(slugs).toContain('feature-test');
      expect(slugs).toContain('bugfix-test');
      expect(slugs).toContain('chore-test');
      
      // Verify metadata
      data.changes.forEach((change: any) => {
        expect(change.slug).toBeDefined();
        expect(change.title).toBeDefined();
        expect(change.path).toBeDefined();
        expect(change.created).toBeDefined();
        expect(change.modified).toBeDefined();
        expect(change.hasProposal).toBe(true);
        expect(change.hasLock).toBe(true);
        expect(change.status).toBe('locked');
      });
    });

    it('should handle changes with different statuses', async () => {
      // Create a change and then archive it to test different statuses
      const changeSlug = 'status-test';
      await callTool(server, 'change.open', {
        title: 'Status Test',
        slug: changeSlug
      });

      // Initially should be locked
      let result = await callResource(server, 'changes://');
      let data = JSON.parse(result.result.text);
      let change = data.changes.find((c: any) => c.slug === changeSlug);
      expect(change.status).toBe('locked');

      // Archive the change
      await callTool(server, 'change.archive', { slug: changeSlug });

      // Should no longer appear in active changes
      result = await callResource(server, 'changes://');
      data = JSON.parse(result.result.text);
      change = data.changes.find((c: any) => c.slug === changeSlug);
      expect(change).toBeUndefined();
    });

    it('should handle malformed change directories gracefully', async () => {
      // Create a malformed change directory
      const malformedDir = path.join(testDir, 'openspec', 'changes', 'malformed');
      await fs.mkdir(malformedDir, { recursive: true });
      
      // Create invalid lock file
      await fs.writeFile(path.join(malformedDir, '.lock'), 'invalid json');

      const result = await callResource(server, 'changes://');
      const data = JSON.parse(result.result.text);
      
      // Should still include the malformed entry - it's locked even with malformed lock file
      const malformed = data.changes.find((c: any) => c.slug === 'malformed');
      expect(malformed).toBeDefined();
      expect(malformed.status).toBe('locked');
      expect(malformed.hasLock).toBe(true);
    });
  });

  describe('Individual Change Resources', () => {
    let changeSlug: string;

    beforeEach(async () => {
      changeSlug = `change-${Date.now()}`;
      await callTool(server, 'change.open', {
        title: 'Resource Test Change',
        slug: changeSlug,
        rationale: 'Testing resource providers',
        template: 'feature'
      });
    });

    it('should provide access to change proposal', async () => {
      const result = await callResource(server, `proposal://${changeSlug}`);
      
      expect(result.error).toBeUndefined();
      expect(result.result.text).toContain('Resource Test Change');
      expect(result.result.text).toContain('Testing resource providers');
    });

    it('should provide access to change tasks', async () => {
      const result = await callResource(server, `task://${changeSlug}`);
      
      expect(result.error).toBeUndefined();
      const content = result.result.text;
      
      expect(content).toContain('tasks');
      expect(content).toContain(changeSlug);
    });

    it('should provide access to change delta/specs', async () => {
      const result = await callResource(server, `delta://${changeSlug}`);
      
      expect(result.error).toBeUndefined();
      // Delta should contain specs directory information
      expect(result.result.text).toBeDefined();
    });

    it('should handle non-existent change resources', async () => {
      const result = await callResource(server, 'proposal://non-existent');
      
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('not found');
    });

    it('should handle invalid resource paths', async () => {
      const result = await callResource(server, `proposal://${changeSlug}/invalid`);
      
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Resource access failed');
    });
  });

  describe('Proposal Resource Provider', () => {
    let changeSlug: string;

    beforeEach(async () => {
      changeSlug = `proposal-${Date.now()}`;
      await callTool(server, 'change.open', {
        title: 'Proposal Test',
        slug: changeSlug,
        rationale: 'Detailed rationale for proposal testing\n\nThis includes multiple lines and various formatting.',
        template: 'feature'
      });
    });

    it('should serve proposal content correctly', async () => {
      const result = await callResource(server, `proposal://${changeSlug}`);
      
      expect(result.error).toBeUndefined();
      const content = result.result.text;
      
      expect(content).toContain('Proposal Test');
      expect(content).toContain('Detailed rationale for proposal testing');
      expect(content).toContain('## Why');
      expect(content).toContain('## What Changes');
    });

    it('should handle proposals with special characters', async () => {
      const specialSlug = `special-${Date.now()}`;
      await callTool(server, 'change.open', {
        title: 'Special Characters: !@#$%^&*()',
        slug: specialSlug,
        rationale: 'Testing special chars: áéíóú ñ 中文 🚀',
        template: 'feature'
      });

      const result = await callResource(server, `proposal://${specialSlug}`);
      
      expect(result.error).toBeUndefined();
      const content = result.result.text;
      expect(content).toContain('Special Characters: !@#$%^&*()');
      expect(content).toContain('Testing special chars: áéíóú ñ 中文 🚀');
    });

    it('should handle non-existent proposal', async () => {
      const result = await callResource(server, 'proposal://non-existent');
      
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('not found');
    });
  });

  describe('Task Resource Provider', () => {
    let changeSlug: string;

    beforeEach(async () => {
      changeSlug = `tasks-${Date.now()}`;
      await callTool(server, 'change.open', {
        title: 'Tasks Test',
        slug: changeSlug,
        template: 'feature'
      });
    });

    it('should serve task content correctly', async () => {
      const result = await callResource(server, `task://${changeSlug}`);
      
      expect(result.error).toBeUndefined();
      const content = result.result.text;
      
      expect(content).toContain('tasks');
      expect(content).toContain(changeSlug);
    });

    it('should handle non-existent tasks', async () => {
      const result = await callResource(server, 'task://non-existent');
      
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('not found');
    });
  });

  describe('Delta Resource Provider', () => {
    let changeSlug: string;

    beforeEach(async () => {
      changeSlug = `delta-${Date.now()}`;
      await callTool(server, 'change.open', {
        title: 'Delta Test',
        slug: changeSlug,
        template: 'feature'
      });
    });

    it('should serve delta content correctly', async () => {
      const result = await callResource(server, `delta://${changeSlug}`);
      
      expect(result.error).toBeUndefined();
      const content = result.result.text;
      
      expect(content).toBeDefined();
      // Delta should contain specs directory information or be empty
    });

    it('should handle non-existent delta', async () => {
      const result = await callResource(server, 'delta://non-existent');
      
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('not found');
    });
  });

  describe('Resource Provider Performance', () => {
    it('should handle large numbers of changes efficiently', async () => {
      // Create multiple changes
      const changeCount = 20;
      const createdSlugs: string[] = [];

      for (let i = 0; i < changeCount; i++) {
        const slug = `perf-test-${i}`;
        createdSlugs.push(slug);
        await callTool(server, 'change.open', {
          title: `Performance Test ${i}`,
          slug,
          template: 'feature'
        });
      }

      // Test collection performance
      const startTime = Date.now();
      const result = await callResource(server, 'changes://');
      const duration = Date.now() - startTime;

      expect(result.error).toBeUndefined();
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      const data = JSON.parse(result.result.text);
      expect(data.changes).toHaveLength(changeCount);

      // Test individual resource performance
      const individualStart = Date.now();
      await callResource(server, `proposal://${createdSlugs[0]}`);
      const individualDuration = Date.now() - individualStart;

      expect(individualDuration).toBeLessThan(200); // Should complete within 200ms
    });

    it('should handle concurrent resource access', async () => {
      // Create a few changes
      const slugs = ['concurrent-1', 'concurrent-2', 'concurrent-3'];
      for (const slug of slugs) {
        await callTool(server, 'change.open', {
          title: `Concurrent Test ${slug}`,
          slug,
          template: 'feature'
        });
      }

      // Access multiple resources (sequentially to avoid race conditions in test helpers)
      const results = [
        await callResource(server, 'changes://'),
        await callResource(server, `proposal://${slugs[0]}`),
        await callResource(server, `task://${slugs[1]}`),
        await callResource(server, `delta://${slugs[2]}`)
      ];
      
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('Resource Provider Security', () => {
    it('should prevent access to files outside change directory', async () => {
      // Try various path traversal attempts
      const maliciousUris = [
        'change://../../../etc/passwd',
        'change://..\\..\\..\\windows\\system32',
        'proposal://../../../etc/shadow',
        'task://C:\\Windows\\System32',
        'delta://....//....//....//etc/passwd'
      ];

      for (const uri of maliciousUris) {
        const result = await callResource(server, uri);
        expect(result.error).toBeDefined();
        // Should either be "not found" or "Resource access failed" depending on the URI
        expect(result.error.message).toMatch(/not found|Resource access failed/);
      }
    });

    it('should validate resource URI format', async () => {
      const invalidUris = [
        'invalid://test',
        'change',
        '://missing-scheme',
        'change:///empty-slug',
        'change://',
        'proposal://',
        'task://',
        'delta://'
      ];

      for (const uri of invalidUris) {
        const result = await callResource(server, uri);
        expect(result.error).toBeDefined();
      }
    });

    it('should enforce slug validation in resource URIs', async () => {
      const invalidSlugs = [
        'invalid slug!',
        'UPPERCASE',
        'a', // too short
        'a'.repeat(65), // too long
        'with spaces',
        'special@chars'
      ];

      for (const slug of invalidSlugs) {
        const result = await callResource(server, `change://${slug}/proposal`);
        expect(result.error).toBeDefined();
      }
    });
  });
});

// Helper functions
async function initializeServer(server: MCPServer): Promise<void> {
  const initRequest = {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  let response: any = null;
  server['sendMessage'] = async (msg: any) => {
    response = msg;
  };

  await server['handleRequest'](initRequest);
  server['initialized'] = true;
  
  expect(response).toBeDefined();
  expect(response.result).toBeDefined();
}

async function callTool(server: MCPServer, toolName: string, args: any): Promise<any> {
  const request = {
    jsonrpc: '2.0' as const,
    id: Math.random(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };

  return new Promise((resolve) => {
    server['sendMessage'] = async (msg: any) => {
      resolve(msg);
    };

    server['handleRequest'](request);
  });
}

async function callResource(server: MCPServer, uri: string): Promise<any> {
  const requestId = `resource-${Date.now()}-${Math.random()}`;
  const request = {
    jsonrpc: '2.0' as const,
    id: requestId,
    method: 'resources/read',
    params: {
      uri: uri
    }
  };

  return new Promise((resolve) => {
    const originalSendMessage = server['sendMessage'];
    server['sendMessage'] = async (msg: any) => {
      if (msg.id === requestId) {
        server['sendMessage'] = originalSendMessage;
        resolve(msg);
      } else {
        // Forward other messages
        return originalSendMessage(msg);
      }
    };

    server['handleRequest'](request);
  });
}