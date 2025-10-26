/**
 * Tests for Streamable HTTP (NDJSON) MCP route handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { mcpRouteHandler } from '../../src/routes/mcp.js';
import { HTTPToolRequest, NDJSONEvent, HTTPError, ServerConfig } from '../../src/types.js';

// Mock the MCP factory
vi.mock('/home/oakley/mcps/OpenSpec/dist/src/stdio/factory.js', () => ({
  createServer: vi.fn(() => Promise.resolve(mockMCPServer))
}));

// Mock MCP server
const mockMCPServer = {
  toolRegistry: {
    get: vi.fn(),
    getNames: vi.fn(() => ['change.open', 'change.archive'])
  }
};

// Mock tool instance
const mockToolInstance = {
  definition: {
    inputSchema: {
      safeParse: vi.fn()
    }
  },
  execute: vi.fn()
};

describe('NDJSON MCP Route Handler', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let writeEvents: NDJSONEvent[];
  let mockRaw: any;

  beforeEach(async () => {
    writeEvents = [];
    
    // Mock raw response stream
    mockRaw = {
      writeHead: vi.fn(),
      write: vi.fn((data: string) => {
        // Parse NDJSON events for testing
        const lines = data.trim().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            writeEvents.push(JSON.parse(line));
          }
        });
      }),
      end: vi.fn()
    };

    // Mock Fastify request
    mockRequest = {
      id: 'test-request-id',
      body: {
        tool: 'change.open',
        input: { slug: 'test-change' },
        apiVersion: '1.0.0'
      } as HTTPToolRequest,
      headers: {
        'user-agent': 'test-agent'
      },
      ip: '127.0.0.1',
      log: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn(() => ({} as any)),
        level: 'info',
        fatal: vi.fn(),
        trace: vi.fn()
      } as any
    };

    // Mock Fastify reply
    mockReply = {
      raw: mockRaw,
      code: vi.fn(),
      send: vi.fn(),
      header: vi.fn()
    };

    // Mock server config
    const mockConfig: ServerConfig = {
      port: 8443,
      host: '0.0.0.0',
      auth: { tokens: [] },
      cors: { origins: [] },
      rateLimit: { requestsPerMinute: 60 },
      sse: { heartbeatMs: 25000 },
      responseLimits: { maxResponseSizeKb: 10 },
      logging: { level: 'info' },
      workingDirectory: '/tmp'
    };

    // Set up server context
    (mockRequest as any).server = { config: mockConfig };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('NDJSON Format Compliance', () => {
    it('should send proper NDJSON start event with tool and apiVersion', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      expect(mockRaw.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });

      // Check start event
      const startEvent = writeEvents.find(e => e.type === 'start');
      expect(startEvent).toBeDefined();
      expect(startEvent).toMatchObject({
        type: 'start',
        tool: 'change.open',
        apiVersion: '1.0.0'
      });
      expect(startEvent?.ts).toBeDefined();
      expect(typeof startEvent?.ts).toBe('number');
    });

    it('should send result event with proper structure', async () => {
      const mockResult = {
        content: [{ 
          type: 'text', 
          text: 'Change opened successfully' 
        }]
      };

      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue(mockResult);
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const resultEvent = writeEvents.find(e => e.type === 'result');
      expect(resultEvent).toBeDefined();
      expect(resultEvent).toMatchObject({
        type: 'result',
        result: mockResult
      });
      expect(resultEvent?.ts).toBeDefined();
    });

    it('should send error event with proper structure', async () => {
      mockMCPServer.toolRegistry.get.mockReturnValue(null); // Tool not found

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'TOOL_NOT_FOUND',
          message: expect.stringContaining('not found'),
          hint: expect.stringContaining('Available tools')
        }
      });
      expect(errorEvent?.ts).toBeDefined();
    });

    it('should send end event to close the stream', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const endEvent = writeEvents.find(e => e.type === 'end');
      expect(endEvent).toBeDefined();
      expect(endEvent).toMatchObject({
        type: 'end'
      });
      expect(endEvent?.ts).toBeDefined();
    });

    it('should write one JSON object per line with newlines', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      // Verify that write was called with properly formatted NDJSON
      expect(mockRaw.write).toHaveBeenCalledTimes(3); // start, result, end
      
      // Check that each call ends with newline
      mockRaw.write.mock.calls.forEach((call: any) => {
        expect(call[0]).toMatch(/\n$/);
      });

      // Verify that events are in correct order
      expect(writeEvents[0].type).toBe('start');
      expect(writeEvents[1].type).toBe('result');
      expect(writeEvents[2].type).toBe('end');
    });
  });

  describe('MCP Integration', () => {
    it('should integrate with MCP tool registry for change.open', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Change opened' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      expect(mockMCPServer.toolRegistry.get).toHaveBeenCalledWith('change.open');
      expect(mockToolInstance.execute).toHaveBeenCalledWith({ slug: 'test-change' });
    });

    it('should integrate with MCP tool registry for change.archive', async () => {
      (mockRequest.body as HTTPToolRequest).tool = 'change.archive';
      (mockRequest.body as HTTPToolRequest).input = { slug: 'test-change' };

      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Change archived' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      expect(mockMCPServer.toolRegistry.get).toHaveBeenCalledWith('change.archive');
      expect(mockToolInstance.execute).toHaveBeenCalledWith({ slug: 'test-change' });
    });

    it('should validate input against tool schema', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({
        success: false,
        error: {
          issues: [{ path: ['slug'], message: 'Required' }]
        }
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'INVALID_INPUT',
          message: expect.stringContaining('Invalid input')
        }
      });
    });

    it('should handle tool registry unavailable', async () => {
      mockMCPServer.toolRegistry.get.mockImplementation(() => {
        throw new Error('Registry unavailable');
      });

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'TOOL_REGISTRY_UNAVAILABLE'
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle tool execution errors', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockRejectedValue(new Error('Tool execution failed'));
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: expect.stringContaining('execution failed')
        }
      });
    });

    it('should handle HTTPError instances properly', async () => {
      const httpError = new HTTPError(
        400,
        'BAD_REQUEST',
        'Invalid request',
        'Check your input'
      );

      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockRejectedValue(httpError);
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid request',
          hint: 'Check your input'
        }
      });
    });

    it('should handle unknown errors gracefully', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockRejectedValue('Unknown error');
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unknown error'
        }
      });
    });
  });

  describe('Performance Features', () => {
    it('should enforce response size limits', async () => {
      const largeResult = {
        content: [{ 
          type: 'text', 
          text: 'X'.repeat(15 * 1024) // 15KB content
        }]
      };

      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue(largeResult);
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'RESPONSE_TOO_LARGE',
          message: expect.stringContaining('exceeds limit')
        }
      });
    });

    it('should handle request timing and correlation IDs', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      const startTime = Date.now();
      
      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const endTime = Date.now();
      
      // Check that timing is reasonable
      expect(endTime - startTime).toBeLessThan(1000);
      
      // Check that correlation ID is used in logging
      expect(mockRequest.log?.info).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'test-request-id' }),
        expect.any(String)
      );
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid tool names', async () => {
      (mockRequest.body as HTTPToolRequest).tool = '';

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'INVALID_TOOL_NAME'
        }
      });
    });

    it('should reject non-string tool names', async () => {
      (mockRequest.body as HTTPToolRequest).tool = 123 as any;

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = writeEvents.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: {
          code: 'INVALID_TOOL_NAME'
        }
      });
    });
  });

  describe('Connection Handling', () => {
    it('should properly close connection after all events', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      expect(mockRaw.end).toHaveBeenCalled();
    });

    it('should close connection even when errors occur', async () => {
      mockMCPServer.toolRegistry.get.mockReturnValue(null);

      await mcpRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      expect(mockRaw.end).toHaveBeenCalled();
    });
  });
});