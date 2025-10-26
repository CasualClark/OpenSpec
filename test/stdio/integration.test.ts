/**
 * Integration tests for Task MCP stdio server
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDevServer } from '../../src/stdio/factory.js';
import { MCPServer } from '../../src/stdio/server.js';

describe('Task MCP Integration', () => {
  let server: MCPServer;

  beforeEach(async () => {
    server = await createDevServer('/tmp/test-openspec');
  });

  it('should create server with all tools and resources', () => {
    expect(server).toBeDefined();
    
    // Check that tools are registered
    const config = server['config'];
    expect(Object.keys(config.tools)).toContain('change.open');
    expect(Object.keys(config.tools)).toContain('change.archive');
    
    // Check that resources are registered
    expect(Object.keys(config.resources)).toContain('change://{slug}');
    expect(Object.keys(config.resources)).toContain('proposal://{slug}');
  });

  it('should handle initialize request correctly', async () => {
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

    expect(response).toBeDefined();
    expect(response.result.serverInfo.name).toBe('task-mcp-dev-server');
    expect(response.result.capabilities.tools.listChanged).toBe(true);
    expect(response.result.capabilities.resources.subscribe).toBe(true);
  });

  it('should list available tools after initialization', async () => {
    // First initialize
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

    server['sendMessage'] = async () => {};
    await server['handleRequest'](initRequest);
    server['initialized'] = true;

    // Then list tools
    const toolsRequest = {
      jsonrpc: '2.0' as const,
      id: 2,
      method: 'tools/list'
    };

    let response: any = null;
    server['sendMessage'] = async (msg: any) => {
      response = msg;
    };

    await server['handleRequest'](toolsRequest);

    expect(response).toBeDefined();
    expect(response.result.tools).toHaveLength(2);
    
    const toolNames = response.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('change.open');
    expect(toolNames).toContain('change.archive');
  });

  it('should list available resources after initialization', async () => {
    // First initialize
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

    server['sendMessage'] = async () => {};
    await server['handleRequest'](initRequest);
    server['initialized'] = true;

    // Then list resources
    const resourcesRequest = {
      jsonrpc: '2.0' as const,
      id: 2,
      method: 'resources/list'
    };

    let response: any = null;
    server['sendMessage'] = async (msg: any) => {
      response = msg;
    };

    await server['handleRequest'](resourcesRequest);

    expect(response).toBeDefined();
    expect(response.result.resources.length).toBeGreaterThan(0);
    
    const resourceUris = response.result.resources.map((r: any) => r.uri);
    expect(resourceUris.some((uri: string) => uri.includes('change://'))).toBe(true);
    expect(resourceUris.some((uri: string) => uri.includes('proposal://'))).toBe(true);
  });

  it('should validate tool input correctly', async () => {
    // First initialize
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

    server['sendMessage'] = async () => {};
    await server['handleRequest'](initRequest);
    server['initialized'] = true;

    // Try to call change.open with invalid input
    const invalidToolCall = {
      jsonrpc: '2.0' as const,
      id: 2,
      method: 'tools/call',
      params: {
        name: 'change.open',
        arguments: {
          title: 'Test Change',
          slug: 'Invalid Slug!', // Invalid slug format
          rationale: 'Test'
        }
      }
    };

    let response: any = null;
    server['sendMessage'] = async (msg: any) => {
      response = msg;
    };

    await server['handleRequest'](invalidToolCall);

    expect(response).toBeDefined();
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602); // InvalidParams
    expect(response.error.message).toContain('Invalid tool input');
  });
});