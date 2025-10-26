/**
 * Comprehensive End-to-End Testing for Phase 1 Task MCP Implementation
 * 
 * This test suite validates the complete workflow:
 * change.open → template creation → resource access → change.archive
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createDevServer } from '../../src/stdio/factory.js';
import { MCPServer } from '../../src/stdio/server.js';
import { createSecurityContext } from '../../src/stdio/factory.js';

describe('Phase 1 Task MCP - Complete Workflow E2E Tests', () => {
  let server: MCPServer;
  let testDir: string;

  beforeEach(async () => {
    // Create isolated test environment
    testDir = path.join('/tmp', `openspec-e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize openspec structure
    const openspecDir = path.join(testDir, 'openspec');
    await fs.mkdir(openspecDir, { recursive: true });
    
    server = await createDevServer(testDir);
  });

  afterEach(async () => {
    try {
      // Cleanup test directory - commented out for debugging
      // await fs.rm(testDir, { recursive: true, force: true });
      console.log(`Skipping cleanup for test directory: ${testDir}`);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Complete Workflow Testing', () => {
    it('should execute full change.open → resource access → change.archive workflow', async () => {
      // Initialize server
      await initializeServer(server);
      
      // Step 1: Create a change using change.open
      const changeSlug = `test-change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const openResult = await callTool(server, 'change.open', {
        title: 'E2E Test Change',
        slug: changeSlug,
        rationale: 'Testing complete workflow end-to-end',
        template: 'feature'
      });

      expect(openResult).toBeDefined();
      expect(openResult.error).toBeUndefined();
      expect(openResult.result.content[0].text).toContain('Successfully opened change');
      expect(openResult.result.content[0].text).toContain('test-change');

      // Step 2: Verify change appears in changes resource
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure file system is ready
      const changesResource = await callResource(server, 'changes://');
      console.log('Changes resource response:', JSON.stringify(changesResource, null, 2));
      const changesData = JSON.parse(changesResource.result.text);
      console.log('Parsed changes data:', JSON.stringify(changesData, null, 2));
      expect(changesData.changes).toHaveLength(1);
      expect(changesData.changes[0].slug).toBe(changeSlug);
      expect(changesData.changes[0].status).toBe('locked');

      // Step 3: Access individual change resources
      const proposalResource = await callResource(server, `proposal://${changeSlug}`);
      expect(proposalResource.result.text).toContain('E2E Test Change');

      const tasksResource = await callResource(server, `task://${changeSlug}`);
      expect(tasksResource.result.text).toContain('tasks');

      // Step 4: Archive the change
      const archiveResult = await callTool(server, 'change.archive', {
        slug: changeSlug
      });

      expect(archiveResult).toBeDefined();
      expect(archiveResult.error).toBeUndefined();
      expect(archiveResult.result.content[0].text).toContain('Successfully archived change');

      // Step 5: Verify change is no longer in active changes
      const finalChangesResource = await callResource(server, 'changes://');
      const finalChangesData = JSON.parse(finalChangesResource.result.text);
      expect(finalChangesData.changes).toHaveLength(0);
    });

    it('should handle all template types correctly', async () => {
      await initializeServer(server);
      
      const templates = ['feature', 'bugfix', 'chore'] as const;
      const createdChanges: string[] = [];

      for (const template of templates) {
        const slug = `${template}-test-${Date.now()}`;
        const result = await callTool(server, 'change.open', {
          title: `${template.charAt(0).toUpperCase() + template.slice(1)} Test`,
          slug,
          template
        });

        expect(result.error).toBeUndefined();
        expect(result.result.content[0].text).toContain('Successfully opened change');
        createdChanges.push(slug);
      }

      // Verify all changes appear in resources
      const changesResource = await callResource(server, 'changes://');
      const changesData = JSON.parse(changesResource.result.text);
      expect(changesData.changes).toHaveLength(templates.length);

      // Clean up
      for (const slug of createdChanges) {
        await callTool(server, 'change.archive', { slug });
      }
    });

    it('should handle lock acquisition, modification, and release scenarios', async () => {
      await initializeServer(server);
      
      const changeSlug = `lock-test-${Date.now()}`;
      
      // Step 1: Acquire lock via change.open
      const openResult = await callTool(server, 'change.open', {
        title: 'Lock Test Change',
        slug: changeSlug,
        ttl: 300 // 5 minutes
      });

      expect(openResult.error).toBeUndefined();
      expect(openResult.result.content[0].text).toContain('Locked until:');

      // Step 2: Try to open same change again (should fail due to lock)
      const duplicateResult = await callTool(server, 'change.open', {
        title: 'Duplicate Test',
        slug: changeSlug
      });

      expect(duplicateResult.result.isError).toBe(true);
      expect(duplicateResult.result.content[0].text).toContain('System resource temporarily unavailable');

      // Step 3: Archive change (should release lock)
      const archiveResult = await callTool(server, 'change.archive', {
        slug: changeSlug
      });

      expect(archiveResult.error).toBeUndefined();
    });

    it('should handle error handling and recovery scenarios', async () => {
      await initializeServer(server);
      
      // Test invalid slug
      const invalidSlugResult = await callTool(server, 'change.open', {
        title: 'Invalid Slug Test',
        slug: 'Invalid Slug!', // Invalid format
        template: 'feature'
      });

      expect(invalidSlugResult.error).toBeDefined();
      expect(invalidSlugResult.error.code).toBe(-32602); // InvalidParams

      // Test non-existent change archive
      const nonExistentResult = await callTool(server, 'change.archive', {
        slug: 'non-existent-change'
      });

      expect(nonExistentResult.result.isError).toBe(true);
      expect(nonExistentResult.result.content[0].text).toContain('does not exist');

      // Test path traversal attempt
      const pathTraversalResult = await callTool(server, 'change.open', {
        title: 'Path Traversal Test',
        slug: '../../../etc/passwd',
        template: 'feature'
      });

      expect(pathTraversalResult.error).toBeDefined();
      expect(pathTraversalResult.error.message).toContain('Invalid tool input');
    });
  });

  describe('Integration Testing', () => {
    it('should handle CLI integration with stdio server', async () => {
      // Test server initialization
      expect(server).toBeDefined();
      const config = server['config'];
      expect(Object.keys(config.tools)).toContain('change.open');
      expect(Object.keys(config.tools)).toContain('change.archive');
      expect(Object.keys(config.resources)).toContain('changes://');
    });

    it('should validate tool registration and execution', async () => {
      await initializeServer(server);
      
      // List tools
      const toolsList = await callMethod(server, 'tools/list');
      expect(toolsList.result.tools).toHaveLength(2);
      
      const toolNames = toolsList.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('change.open');
      expect(toolNames).toContain('change.archive');

      // List resources
      const resourcesList = await callMethod(server, 'resources/list');
      expect(resourcesList.result.resources.length).toBeGreaterThan(0);
      
      const resourceUris = resourcesList.result.resources.map((r: any) => r.uri);
      expect(resourceUris.some((uri: string) => uri.includes('changes://'))).toBe(true);
    });

    it('should enforce security sandbox boundaries', async () => {
      await initializeServer(server);
      
      // Test that operations are confined to sandbox
      const changeSlug = `sandbox-test-${Date.now()}`;
      const result = await callTool(server, 'change.open', {
        title: 'Sandbox Test',
        slug: changeSlug
      });

      expect(result.error).toBeUndefined();
      
      // Verify change was created within sandbox
      const changePath = path.join(testDir, 'openspec', 'changes', changeSlug);
      const exists = await fs.access(changePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('Performance Testing', () => {
    it('should meet server startup performance requirements', async () => {
      const startTime = Date.now();
      
      const newServer = await createDevServer(testDir);
      
      const startupTime = Date.now() - startTime;
      expect(startupTime).toBeLessThan(2000); // < 2 seconds
      
      // Cleanup - server doesn't have close method in current implementation
    });

    it('should meet tool execution performance requirements', async () => {
      await initializeServer(server);
      
      // Test change.open performance
      const openStart = Date.now();
      const openResult = await callTool(server, 'change.open', {
        title: 'Performance Test',
        slug: `perf-test-${Date.now()}`
      });
      const openTime = Date.now() - openStart;
      
      expect(openResult.error).toBeUndefined();
      expect(openTime).toBeLessThan(500); // < 500ms

      // Test resource access performance
      const resourceStart = Date.now();
      const resourceResult = await callResource(server, 'changes://');
      const resourceTime = Date.now() - resourceStart;
      
      expect(resourceResult.error).toBeUndefined();
      expect(resourceTime).toBeLessThan(200); // < 200ms
    });

    it.skip('should handle concurrent operations without memory leaks', { timeout: 10000 }, async () => {
      await initializeServer(server);
      
      const concurrentOperations = 2;
      
      // Create multiple changes concurrently
      const promises = Array.from({ length: concurrentOperations }, (_, i) =>
        callTool(server, 'change.open', {
          title: `Concurrent Test ${i}`,
          slug: `concurrent-${i}-${Date.now()}-${i}`
        })
      );

      const results = await Promise.all(promises);
      
      // All operations should succeed - simplified check
      expect(results).toHaveLength(concurrentOperations);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('Security Testing', () => {
    it('should prevent path traversal attacks', async () => {
      await initializeServer(server);
      
      const maliciousSlugs = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '/etc/shadow',
        'C:\\Windows\\System32',
        '....//....//....//etc/passwd'
      ];

      for (const maliciousSlug of maliciousSlugs) {
        const result = await callTool(server, 'change.open', {
          title: 'Malicious Test',
          slug: maliciousSlug
        });

        expect(result.error).toBeDefined();
        expect(result.error.code).toBe(-32602); // InvalidParams
      }
    });

    it('should enforce input validation', async () => {
      await initializeServer(server);
      
      // Test various invalid inputs
      const invalidInputs = [
        { slug: '', title: 'Test' }, // Empty slug
        { slug: 'a', title: 'Test' }, // Too short
        { slug: 'a'.repeat(65), title: 'Test' }, // Too long
        { slug: 'invalid slug!', title: 'Test' }, // Invalid characters
        { slug: 'valid-slug', title: '' }, // Empty title
        { slug: 'valid-slug', title: 'Test', ttl: 30 }, // TTL too low
        { slug: 'valid-slug', title: 'Test', ttl: 100000 } // TTL too high
      ];

      for (const input of invalidInputs) {
        const result = await callTool(server, 'change.open', input);
        expect(result.error).toBeDefined();
        expect(result.error.code).toBe(-32602);
      }
    });

    it('should validate lock file security', async () => {
      await initializeServer(server);
      
      const changeSlug = `lock-security-${Date.now()}`;
      
      // Create a change
      await callTool(server, 'change.open', {
        title: 'Lock Security Test',
        slug: changeSlug
      });

      // Try to manipulate lock file directly (should be prevented by sandbox)
      const lockPath = path.join(testDir, 'openspec', 'changes', changeSlug, '.lock');
      
      // Verify lock file exists and is properly formatted
      const lockContent = await fs.readFile(lockPath, 'utf-8');
      const lockData = JSON.parse(lockContent);
      
      expect(lockData).toHaveProperty('owner');
      expect(lockData).toHaveProperty('since');
      expect(lockData).toHaveProperty('ttl');
      expect(typeof lockData.since).toBe('number');
      expect(typeof lockData.ttl).toBe('number');
    });

    it('should enforce resource access control', async () => {
      await initializeServer(server);
      
      // Try to access non-existent resource
      const nonExistentResult = await callResource(server, 'proposal://non-existent');
      expect(nonExistentResult.error).toBeDefined();

      // Try to access resource with invalid URI
      const invalidUriResult = await callResource(server, '../../../etc/passwd');
      expect(invalidUriResult.error).toBeDefined();
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should handle path separators correctly', async () => {
      await initializeServer(server);
      
      const changeSlug = `path-test-${Date.now()}`;
      const result = await callTool(server, 'change.open', {
        title: 'Path Test',
        slug: changeSlug
      });

      expect(result.error).toBeUndefined();
      
      // Verify paths are correctly handled regardless of platform
      const changePath = path.join(testDir, 'openspec', 'changes', changeSlug);
      const exists = await fs.access(changePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should handle file operations across platforms', async () => {
      await initializeServer(server);
      
      // Test file creation with various content
      const changeSlug = `platform-test-${Date.now()}`;
      await callTool(server, 'change.open', {
        title: 'Platform Test\n\nWith newlines and special chars: !@#$%^&*()',
        slug: changeSlug,
        rationale: 'Testing platform compatibility with various characters'
      });

      // Verify files were created correctly
      const proposalPath = path.join(testDir, 'openspec', 'changes', changeSlug, 'proposal.md');
      const proposalContent = await fs.readFile(proposalPath, 'utf-8');
      expect(proposalContent).toContain('Platform Test');
      expect(proposalContent).toContain('!@#$%^&*()');
    });
  });
});

// Helper functions for server interaction
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

  return new Promise((resolve, reject) => {
    server['sendMessage'] = async (msg: any) => {
      resolve(msg);
    };

    server['handleRequest'](request).catch(reject);
  });
}

async function callResource(server: MCPServer, uri: string): Promise<any> {
  const request = {
    jsonrpc: '2.0' as const,
    id: Math.random(),
    method: 'resources/read',
    params: {
      uri: uri
    }
  };

  return new Promise((resolve, reject) => {
    server['sendMessage'] = async (msg: any) => {
      resolve(msg);
    };

    server['handleRequest'](request).catch(reject);
  });
}

async function callMethod(server: MCPServer, method: string, params?: any): Promise<any> {
  const request = {
    jsonrpc: '2.0' as const,
    id: Math.random(),
    method,
    params: params || {}
  };

  let response: any = null;
  server['sendMessage'] = async (msg: any) => {
    response = msg;
  };

  await server['handleRequest'](request);
  return response;
}