/**
 * Unit tests for SSE route handler
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';

describe('SSE Route Handler Unit Tests', () => {
  let testDir: string;
  let mockRequest: any;
  let mockReply: any;
  let sseRouteHandler: any;

  beforeAll(async () => {
    // Create temporary test directory
    testDir = path.join('/tmp', `test-openspec-sse-unit-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'openspec'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'openspec', 'changes'), { recursive: true });

    // Import the SSE route handler
    const sseModule = await import('../../packages/task-mcp-http/src/routes/sse.js');
    sseRouteHandler = sseModule.sseRouteHandler;

    // Mock request and reply objects
    mockRequest = {
      id: 'test-request-id',
      body: {
        tool: 'change.open',
        input: {
          title: 'Test Change',
          slug: 'test-change',
          rationale: 'Test change for SSE endpoint',
          template: 'feature'
        }
      },
      headers: {
        'user-agent': 'test-agent',
        'authorization': 'Bearer test-token'
      },
      ip: '127.0.0.1',
      log: {
        info: vi.fn(),
        error: vi.fn()
      }
    };

    mockReply = {
      raw: {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn()
      }
    };

    // Mock server config
    mockRequest.server = {
      config: {
        sse: { heartbeatMs: 1000 },
        responseLimits: { maxResponseSizeKb: 10 },
        workingDirectory: testDir,
        logging: { level: 'error' }
      }
    };
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should initialize SSE connection with correct headers', async () => {
    await sseRouteHandler(mockRequest, mockReply);

    expect(mockReply.raw.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });
  });

  it('should handle change.open tool request', async () => {
    await sseRouteHandler(mockRequest, mockReply);

    // Verify that write was called for SSE events
    expect(mockReply.raw.write).toHaveBeenCalled();
    
    // Get all write calls and check for result event
    const writeCalls = mockReply.raw.write.mock.calls;
    const writeData = writeCalls.map(call => call[0]).join('');
    
    expect(writeData).toContain('event: result');
    expect(writeData).toContain('change.open');
  });

  it('should handle unknown tool error', async () => {
    mockRequest.body.tool = 'unknown.tool';
    
    await sseRouteHandler(mockRequest, mockReply);

    const writeCalls = mockReply.raw.write.mock.calls;
    const writeData = writeCalls.map(call => call[0]).join('');
    
    expect(writeData).toContain('event: error');
    expect(writeData).toContain('TOOL_NOT_FOUND');
  });

  it('should validate input schema', async () => {
    mockRequest.body.tool = 'change.open';
    mockRequest.body.input = {
      // Missing required fields
      title: 'Test Change'
    };
    
    await sseRouteHandler(mockRequest, mockReply);

    const writeCalls = mockReply.raw.write.mock.calls;
    const writeData = writeCalls.map(call => call[0]).join('');
    
    expect(writeData).toContain('event: error');
    expect(writeData).toContain('INVALID_INPUT');
  });

  it('should send heartbeat comments', async () => {
    await sseRouteHandler(mockRequest, mockReply);

    const writeCalls = mockReply.raw.write.mock.calls;
    const writeData = writeCalls.map(call => call[0]).join('');
    
    // Check for heartbeat comments
    expect(writeData).toContain(': keep-alive');
  });

  it('should include correlation ID in events', async () => {
    await sseRouteHandler(mockRequest, mockReply);

    const writeCalls = mockReply.raw.write.mock.calls;
    const writeData = writeCalls.map(call => call[0]).join('');
    
    expect(writeData).toContain('id: test-request-id');
  });
});