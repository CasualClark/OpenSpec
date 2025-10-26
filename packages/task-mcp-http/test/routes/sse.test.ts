/**
 * Tests for Server-Sent Events (SSE) route handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { sseRouteHandler } from '../../src/routes/sse.js';
import { HTTPToolRequest, SSEEvent, HTTPError, ServerConfig } from '../../src/types.js';

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

describe('SSE Route Handler', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let sseEvents: string[];
  let mockRaw: any;

  beforeEach(async () => {
    sseEvents = [];
    
    // Mock raw response stream
    mockRaw = {
      writeHead: vi.fn(),
      write: vi.fn((data: string) => {
        sseEvents.push(data);
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
    vi.useRealTimers();
  });

  describe('SSE Format Compliance', () => {
    it('should set proper SSE headers', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      expect(mockRaw.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });
    });

    it('should send initial heartbeat immediately', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      // Check that initial heartbeat was sent
      const initialHeartbeat = sseEvents.find(event => 
        event.includes(': keep-alive') && !event.includes('event:')
      );
      expect(initialHeartbeat).toBeDefined();
    });

    it('should send result event with proper SSE format', async () => {
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

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      // Find result event
      const resultEventLines = sseEvents.filter(event => event.includes('event: result'));
      expect(resultEventLines.length).toBeGreaterThan(0);
      
      // Check SSE format
      const resultEvent = resultEventLines.join('');
      expect(resultEvent).toContain('event: result');
      expect(resultEvent).toContain('id: test-request-id');
      expect(resultEvent).toContain('data: {');
      expect(resultEvent).toContain('apiVersion');
      expect(resultEvent).toContain('tool');
      expect(resultEvent).toContain('startedAt');
      expect(resultEvent).toContain('duration');
    });

    it('should send error event with proper SSE format', async () => {
      mockMCPServer.toolRegistry.get.mockReturnValue(null); // Tool not found

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      // Find error event
      const errorEventLines = sseEvents.filter(event => event.includes('event: error'));
      expect(errorEventLines.length).toBeGreaterThan(0);
      
      // Check SSE format
      const errorEvent = errorEventLines.join('');
      expect(errorEvent).toContain('event: error');
      expect(errorEvent).toContain('id: test-request-id');
      expect(errorEvent).toContain('data: {');
      expect(errorEvent).toContain('apiVersion');
      expect(errorEvent).toContain('error');
      expect(errorEvent).toContain('startedAt');
    });

    it('should send periodic heartbeats', async () => {
      vi.useFakeTimers();
      
      const mockConfig: ServerConfig = {
        port: 8443,
        host: '0.0.0.0',
        auth: { tokens: [] },
        cors: { origins: [] },
        rateLimit: { requestsPerMinute: 60 },
        sse: { heartbeatMs: 1000 }, // Short heartbeat for testing
        responseLimits: { maxResponseSizeKb: 10 },
        logging: { level: 'info' },
        workingDirectory: '/tmp'
      };
      (mockRequest as any).server.config = mockConfig;

      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      // Start the handler (it will run asynchronously)
      const handlerPromise = sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      // Wait for initial heartbeat
      await vi.runAllTimersAsync();
      
      // Count initial heartbeats
      const initialHeartbeats = sseEvents.filter(event => 
        event.includes(': keep-alive')
      ).length;
      expect(initialHeartbeats).toBeGreaterThan(0);

      // Advance time for more heartbeats
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      // Check that more heartbeats were sent
      const totalHeartbeats = sseEvents.filter(event => 
        event.includes(': keep-alive')
      ).length;
      expect(totalHeartbeats).toBeGreaterThan(initialHeartbeats);

      // Clean up
      vi.clearAllTimers();
      await handlerPromise;
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

      await sseRouteHandler(
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

      await sseRouteHandler(
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

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('INVALID_INPUT');
      expect(errorEvent).toContain('Invalid input');
    });

    it('should handle tool registry unavailable', async () => {
      mockMCPServer.toolRegistry.get.mockImplementation(() => {
        throw new Error('Registry unavailable');
      });

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('TOOL_REGISTRY_UNAVAILABLE');
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

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('TOOL_EXECUTION_ERROR');
      expect(errorEvent).toContain('execution failed');
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

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('BAD_REQUEST');
      expect(errorEvent).toContain('Invalid request');
      expect(errorEvent).toContain('Check your input');
    });

    it('should handle unknown errors gracefully', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockRejectedValue('Unknown error');
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('INTERNAL_ERROR');
      expect(errorEvent).toContain('Unknown error');
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

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('RESPONSE_TOO_LARGE');
      expect(errorEvent).toContain('exceeds limit');
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
      
      await sseRouteHandler(
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

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('INVALID_TOOL_NAME');
    });

    it('should reject non-string tool names', async () => {
      (mockRequest.body as HTTPToolRequest).tool = 123 as any;

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('INVALID_TOOL_NAME');
    });
  });

  describe('Connection Handling', () => {
    it('should properly close connection after response', async () => {
      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }]
      });
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      expect(mockRaw.end).toHaveBeenCalled();
    });

    it('should close connection even when errors occur', async () => {
      mockMCPServer.toolRegistry.get.mockReturnValue(null);

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      expect(mockRaw.end).toHaveBeenCalled();
    });
  });

  describe('SSE Event Structure', () => {
    it('should include all required fields in result event', async () => {
      const mockResult = {
        content: [{ type: 'text', text: 'Test result' }]
      };

      mockToolInstance.definition.inputSchema.safeParse.mockReturnValue({ 
        success: true, 
        data: { slug: 'test-change' } 
      });
      mockToolInstance.execute.mockResolvedValue(mockResult);
      mockMCPServer.toolRegistry.get.mockReturnValue(mockToolInstance);

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const resultEvent = sseEvents.find(event => event.includes('event: result'));
      expect(resultEvent).toContain('apiVersion');
      expect(resultEvent).toContain('tool');
      expect(resultEvent).toContain('startedAt');
      expect(resultEvent).toContain('result');
      expect(resultEvent).toContain('duration');

      // Parse and validate the data structure
      const dataMatch = resultEvent?.match(/data: (.+)/);
      if (dataMatch) {
        const data = JSON.parse(dataMatch[1]);
        expect(data).toHaveProperty('apiVersion');
        expect(data).toHaveProperty('tool');
        expect(data).toHaveProperty('startedAt');
        expect(data).toHaveProperty('result');
        expect(data).toHaveProperty('duration');
        expect(typeof data.duration).toBe('number');
      }
    });

    it('should include all required fields in error event', async () => {
      mockMCPServer.toolRegistry.get.mockReturnValue(null);

      await sseRouteHandler(
        mockRequest as FastifyRequest<{ Body: HTTPToolRequest }>,
        mockReply as FastifyReply
      );

      const errorEvent = sseEvents.find(event => event.includes('event: error'));
      expect(errorEvent).toContain('apiVersion');
      expect(errorEvent).toContain('error');
      expect(errorEvent).toContain('startedAt');

      // Parse and validate the data structure
      const dataMatch = errorEvent?.match(/data: (.+)/);
      if (dataMatch) {
        const data = JSON.parse(dataMatch[1]);
        expect(data).toHaveProperty('apiVersion');
        expect(data).toHaveProperty('error');
        expect(data).toHaveProperty('startedAt');
        expect(data.error).toHaveProperty('code');
        expect(data.error).toHaveProperty('message');
      }
    });
  });
});