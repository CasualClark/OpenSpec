/**
 * Tests for Task MCP stdio server
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPServer } from '../../src/stdio/server.js';
import { ServerConfig, SecurityContext } from '../../src/stdio/types/index.js';
import { Readable, Writable } from 'node:stream';

describe('MCPServer', () => {
  let server: MCPServer;
  let mockInput: Readable;
  let mockOutput: Writable;
  let config: ServerConfig;

  beforeEach(() => {
    const security: SecurityContext = {
      allowedPaths: ['/tmp/test'],
      sandboxRoot: '/tmp/test',
      maxFileSize: 1024 * 1024,
      allowedSchemas: ['test']
    };

    config = {
      name: 'test-server',
      version: '1.0.0',
      logLevel: 'error', // Suppress logs during tests
      security,
      tools: {},
      resources: {}
    };

    // Create mock streams
    mockInput = new Readable({ read() {} });
    mockOutput = new Writable({ write() {} });
    
    server = new MCPServer(config, mockInput, mockOutput);
  });

  afterEach(() => {
    mockInput.destroy();
    mockOutput.end();
  });

  it('should create server with correct configuration', () => {
    expect(server).toBeDefined();
  });

  it('should handle initialize request', async () => {
    const initRequest = {
      jsonrpc: '2.0',
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

    // Mock the sendResult method
    let sentResponse: any = null;
    server['sendMessage'] = async (message: any) => {
      sentResponse = message;
    };

    await server['handleRequest'](initRequest);

    expect(sentResponse).toBeDefined();
    expect(sentResponse.result.serverInfo.name).toBe('test-server');
    expect(sentResponse.result.capabilities.tools).toBeDefined();
  });

  it('should handle tools/list request', async () => {
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    };

    // Mock the sendResult method
    let sentResponse: any = null;
    server['sendMessage'] = async (message: any) => {
      sentResponse = message;
    };

    // Set server as initialized
    server['initialized'] = true;

    await server['handleRequest'](toolsRequest);

    expect(sentResponse).toBeDefined();
    expect(sentResponse.result.tools).toEqual([]);
  });

  it('should handle resources/list request', async () => {
    const resourcesRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list'
    };

    // Mock the sendResult method
    let sentResponse: any = null;
    server['sendMessage'] = async (message: any) => {
      sentResponse = message;
    };

    // Set server as initialized
    server['initialized'] = true;

    await server['handleRequest'](resourcesRequest);

    expect(sentResponse).toBeDefined();
    expect(sentResponse.result.resources).toEqual([]);
  });

  it('should reject requests before initialization', async () => {
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list'
    };

    // Mock the sendError method
    let sentResponse: any = null;
    server['sendMessage'] = async (message: any) => {
      sentResponse = message;
    };

    await server['handleRequest'](toolsRequest);

    expect(sentResponse).toBeDefined();
    expect(sentResponse.error.message).toBe('Server not initialized');
  });

  it('should handle notifications', async () => {
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };

    // Should not throw
    await server['handleNotification'](notification);
    expect(server['initialized']).toBe(true);
  });

  it('should handle invalid JSON-RPC version', async () => {
    const invalidRequest = {
      jsonrpc: '1.0',
      id: 5,
      method: 'tools/list'
    };

    // Mock the sendError method
    let sentResponse: any = null;
    server['sendMessage'] = async (message: any) => {
      sentResponse = message;
    };

    await server['handleRequest'](invalidRequest);

    expect(sentResponse).toBeDefined();
    expect(sentResponse.error.message).toContain('Invalid JSON-RPC version');
  });
});