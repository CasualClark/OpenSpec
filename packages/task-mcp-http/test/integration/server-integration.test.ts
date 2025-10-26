/**
 * Integration Tests for Phase 4 SSE Server
 * Tests end-to-end functionality with real server instances
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/index.js';
import { ServerConfig } from '../../src/types.js';

describe('Server Integration Tests', () => {
  let server: any;
  let serverUrl: string;
  let testConfig: ServerConfig;

  beforeAll(async () => {
    // Create test configuration
    testConfig = {
      port: 0, // Let OS choose port
      host: '127.0.0.1',
      auth: {
        tokens: ['test-token-1', 'test-token-2']
      },
      cors: {
        origins: ['http://localhost:3000']
      },
      rateLimit: {
        requestsPerMinute: 100
      },
      sse: {
        heartbeatMs: 1000 // Short for testing
      },
      responseLimits: {
        maxResponseSizeKb: 100
      },
      logging: {
        level: 'error' // Reduce noise in tests
      },
      workingDirectory: '/tmp'
    };

    // Create and start server
    server = await createServer(testConfig);
    await server.listen();
    
    // Get actual server URL
    const address = server.server.address();
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('Health Endpoints', () => {
    it('should respond to liveness probe', async () => {
      const response = await fetch(`${serverUrl}/healthz`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(['healthy', 'degraded']).toContain(data.status);
    });

    it('should respond to readiness probe', async () => {
      const response = await fetch(`${serverUrl}/readyz`);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('checks');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
    });

    it('should provide Prometheus metrics', async () => {
      const response = await fetch(`${serverUrl}/metrics`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain; version=0.0.4');
      
      const metrics = await response.text();
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tool: 'change.open',
          input: { slug: 'test' }
        })
      });

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid Bearer token', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-1'
        },
        body: JSON.stringify({
          tool: 'change.open',
          input: { slug: 'test' }
        })
      });

      // Should get SSE response
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
    });

    it('should reject requests with invalid token', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token'
        },
        body: JSON.stringify({
          tool: 'change.open',
          input: { slug: 'test' }
        })
      });

      expect(response.status).toBe(401);
    });
  });

  describe('SSE Endpoint', () => {
    it('should handle SSE requests properly', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-1'
        },
        body: JSON.stringify({
          tool: 'change.open',
          input: { slug: 'test-change' }
        })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(response.headers.get('connection')).toBe('keep-alive');

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let events = [];

      if (reader) {
        try {
          // Read for a short time to capture events
          const timeout = setTimeout(() => reader.cancel(), 2000);
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.trim()) {
                events.push(line);
              }
            }
          }
          
          clearTimeout(timeout);
        } catch (error) {
          // Expected when timeout cancels the reader
        }
      }

      expect(events.length).toBeGreaterThan(0);
      
      // Should have heartbeat events
      const heartbeatEvents = events.filter(event => event.startsWith(': keep-alive'));
      expect(heartbeatEvents.length).toBeGreaterThan(0);
    });

    it('should include proper SSE headers', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-1'
        },
        body: JSON.stringify({
          tool: 'change.open',
          input: { slug: 'test' }
        })
      });

      expect(response.headers.get('x-accel-buffering')).toBe('no');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-headers')).toBe('Cache-Control');
    });
  });

  describe('NDJSON Endpoint', () => {
    it('should handle NDJSON requests properly', async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-1'
        },
        body: JSON.stringify({
          tool: 'change.open',
          input: { slug: 'test-change' }
        })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/x-ndjson');
      expect(response.headers.get('cache-control')).toBe('no-cache');

      // Read NDJSON stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let events = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const event = JSON.parse(line);
                events.push(event);
              } catch (error) {
                // Skip invalid JSON lines
              }
            }
          }
        }
      }

      expect(events.length).toBeGreaterThan(0);
      
      // Should have start, result, and end events
      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('start');
      expect(eventTypes).toContain('end');
    });

    it('should validate NDJSON format', async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-1'
        },
        body: JSON.stringify({
          tool: 'change.open',
          input: { slug: 'test-change' }
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let ndjsonContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          ndjsonContent += decoder.decode(value, { stream: true });
        }
      }

      // Verify each line is valid JSON
      const lines = ndjsonContent.trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          expect(() => JSON.parse(line)).not.toThrow();
        }
      }
    });
  });

  describe('CORS Handling', () => {
    it('should handle preflight requests', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
      expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type');
    });

    it('should reject disallowed origins', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://malicious.com',
          'Access-Control-Request-Method': 'POST'
        }
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const promises = [];
      
      // Make 10 requests quickly
      for (let i = 0; i < 10; i++) {
        const promise = fetch(`${serverUrl}/healthz`);
        promises.push(promise);
      }

      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should include rate limit headers', async () => {
      const response = await fetch(`${serverUrl}/healthz`);
      
      expect(response.headers.get('x-ratelimit-limit')).toBeTruthy();
      expect(response.headers.get('x-ratelimit-remaining')).toBeTruthy();
      expect(response.headers.get('x-ratelimit-reset')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-1'
        },
        body: 'invalid-json'
      });

      expect(response.status).toBe(400);
      
      const error = await response.json();
      expect(error).toHaveProperty('error');
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle missing required fields', async () => {
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-1'
        },
        body: JSON.stringify({
          // Missing tool field
          input: { slug: 'test' }
        })
      });

      expect(response.status).toBe(400);
      
      const error = await response.json();
      expect(error).toHaveProperty('error');
    });

    it('should handle oversized responses', async () => {
      // Create a large input that would generate a large response
      const largeInput = {
        slug: 'test',
        largeData: 'x'.repeat(200 * 1024) // 200KB of data
      };

      const response = await fetch(`${serverUrl}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-1'
        },
        body: JSON.stringify({
          tool: 'change.open',
          input: largeInput
        })
      });

      // Should either succeed or fail with size limit error
      expect([200, 413]).toContain(response.status);
    });
  });

  describe('Root Endpoint', () => {
    it('should provide API information', async () => {
      const response = await fetch(`${serverUrl}/`);
      
      expect(response.status).toBe(200);
      
      const info = await response.json();
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('endpoints');
      expect(info).toHaveProperty('security');
      
      expect(info.endpoints).toHaveProperty('sse');
      expect(info.endpoints).toHaveProperty('mcp');
      expect(info.endpoints).toHaveProperty('healthz');
      expect(info.endpoints).toHaveProperty('readyz');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await fetch(`${serverUrl}/healthz`);
      
      // Should have various security headers
      const headers = response.headers;
      expect(headers.get('x-content-type-options')).toBe('nosniff');
      expect(headers.get('x-frame-options')).toBeTruthy();
      expect(headers.get('x-xss-protection')).toBeTruthy();
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent SSE connections', async () => {
      const promises = [];
      
      // Create 5 concurrent SSE connections
      for (let i = 0; i < 5; i++) {
        const promise = fetch(`${serverUrl}/sse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token-1'
          },
          body: JSON.stringify({
            tool: 'change.open',
            input: { slug: `test-${i}` }
          })
        });
        promises.push(promise);
      }

      const responses = await Promise.all(promises);
      
      // All should establish SSE connections
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream');
      });

      // Clean up connections
      responses.forEach(response => {
        if (response.body) {
          response.body.cancel();
        }
      });
    });
  });
});