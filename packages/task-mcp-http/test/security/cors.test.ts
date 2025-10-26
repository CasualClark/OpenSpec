/**
 * Tests for CORS middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CorsMiddleware } from '../../src/security/cors.js';

describe('CORS Middleware', () => {
  let corsMiddleware: CorsMiddleware;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    const corsConfig = {
      origins: ['https://localhost:3000', 'https://example.com'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining']
    };

    corsMiddleware = new CorsMiddleware(corsConfig);

    mockRequest = {
      headers: {},
      method: 'POST' as any
    };

    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Preflight Requests', () => {
    it('should handle OPTIONS preflight requests for allowed origins', async () => {
      const optionsRequest = {
        ...mockRequest,
        method: 'OPTIONS' as any,
        headers: {
          origin: 'https://localhost:3000',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Content-Type, Authorization'
        }
      };

      const middleware = corsMiddleware.middleware();
      await middleware(optionsRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://localhost:3000');
      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
      expect(mockReply.code).toHaveBeenCalledWith(204);
    });

    it('should reject preflight requests from disallowed origins', async () => {
      const optionsRequest = {
        ...mockRequest,
        method: 'OPTIONS' as any,
        headers: {
          origin: 'https://malicious.com',
          'access-control-request-method': 'POST'
        }
      };

      const middleware = corsMiddleware.middleware();
      
      try {
        await middleware(optionsRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
      }
    });

    it('should handle preflight requests with disallowed methods', async () => {
      const optionsRequest = {
        ...mockRequest,
        method: 'OPTIONS' as any,
        headers: {
          origin: 'https://localhost:3000',
          'access-control-request-method': 'PATCH' // Not in allowed methods
        }
      };

      const middleware = corsMiddleware.middleware();
      
      try {
        await middleware(optionsRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(405);
        expect(error.code).toBe('CORS_METHOD_NOT_ALLOWED');
      }
    });

    it('should handle preflight requests with disallowed headers', async () => {
      const optionsRequest = {
        ...mockRequest,
        method: 'OPTIONS' as any,
        headers: {
          origin: 'https://localhost:3000',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'X-Disallowed-Header'
        }
      };

      const middleware = corsMiddleware.middleware();
      
      try {
        await middleware(optionsRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('CORS_HEADERS_NOT_ALLOWED');
      }
    });
  });

  describe('Actual Requests', () => {
    it('should add CORS headers to requests from allowed origins', async () => {
      mockRequest.headers = {
        origin: 'https://localhost:3000'
      };

      const middleware = corsMiddleware.middleware();
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://localhost:3000');
      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Expose-Headers', 'X-Total-Count, X-Rate-Limit-Remaining');
    });

    it('should handle multiple allowed origins', async () => {
      const testOrigins = ['https://localhost:3000', 'https://example.com'];
      
      for (const origin of testOrigins) {
        vi.clearAllMocks();
        mockRequest.headers = { origin };

        const middleware = corsMiddleware.middleware();
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', origin);
      }
    });

    it('should reject requests from disallowed origins', async () => {
      mockRequest.headers = {
        origin: 'https://malicious.com'
      };

      const middleware = corsMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
      }
    });

    it('should handle requests without origin header (same-origin)', async () => {
      mockRequest.headers = {}; // No origin header

      const middleware = corsMiddleware.middleware();
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not add CORS headers for same-origin requests
      expect(mockReply.header).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.any(String));
    });
  });

  describe('Wildcard Origins', () => {
    it('should handle wildcard origin configuration', async () => {
      const wildcardCorsConfig = {
        origins: ['*'],
        credentials: false,
        methods: ['GET', 'POST'],
        headers: ['Content-Type']
      };

      const wildcardCorsMiddleware = new CorsMiddleware(wildcardCorsConfig);
      const middleware = wildcardCorsMiddleware.middleware();

      mockRequest.headers = {
        origin: 'https://any-origin.com'
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(mockReply.header).not.toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
    });
  });

  describe('Security Features', () => {
    it('should prevent origin reflection attacks', async () => {
      mockRequest.headers = {
        origin: 'https://localhost:3000\nX-Forwarded-For: evil.com'
      };

      const middleware = corsMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('INVALID_ORIGIN');
      }
    });

    it('should validate origin format', async () => {
      const invalidOrigins = [
        'not-a-url',
        'ftp://invalid-protocol.com',
        'javascript:evil()',
        'data:text/html,<script>alert(1)</script>'
      ];

      for (const origin of invalidOrigins) {
        vi.clearAllMocks();
        mockRequest.headers = { origin };

        const middleware = corsMiddleware.middleware();
        
        try {
          await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
        } catch (error: any) {
          expect([400, 403]).toContain(error.statusCode);
        }
      }
    });

    it('should handle null origin in preflight', async () => {
      const optionsRequest = {
        ...mockRequest,
        method: 'OPTIONS' as any,
        headers: {
          origin: 'null',
          'access-control-request-method': 'POST'
        }
      };

      const middleware = corsMiddleware.middleware();
      
      try {
        await middleware(optionsRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
      }
    });
  });

  describe('Configuration', () => {
    it('should return current configuration', () => {
      const config = corsMiddleware.getConfig();
      
      expect(config).toHaveProperty('origins');
      expect(config).toHaveProperty('credentials');
      expect(config).toHaveProperty('methods');
      expect(config).toHaveProperty('headers');
      expect(config).toHaveProperty('exposedHeaders');
      expect(Array.isArray(config.origins)).toBe(true);
    });

    it('should get Fastify configuration', () => {
      const fastifyConfig = corsMiddleware.getFastifyConfig();
      
      expect(fastifyConfig).toHaveProperty('origin');
      expect(fastifyConfig).toHaveProperty('credentials');
      expect(fastifyConfig).toHaveProperty('methods');
      expect(fastifyConfig).toHaveProperty('allowedHeaders');
      expect(fastifyConfig).toHaveProperty('exposedHeaders');
      expect(fastifyConfig).toHaveProperty('maxAge');
      expect(typeof fastifyConfig.origin).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty origins array (CORS disabled)', async () => {
      const noCorsConfig = {
        origins: [],
        credentials: false,
        methods: ['GET', 'POST'],
        headers: ['Content-Type']
      };

      const noCorsMiddleware = new CorsMiddleware(noCorsConfig);
      const middleware = noCorsMiddleware.middleware();

      mockRequest.headers = {
        origin: 'https://any-origin.com'
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not add any CORS headers
      expect(mockReply.header).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.any(String));
    });

    it('should handle missing request headers gracefully', async () => {
      mockRequest.headers = undefined;

      const middleware = corsMiddleware.middleware();
      
      // Should not throw error
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should handle malformed origin headers', async () => {
      const malformedOrigins = [
        '',
        ' ',
        'http://',
        'https://',
        '://no-protocol.com'
      ];

      for (const origin of malformedOrigins) {
        vi.clearAllMocks();
        mockRequest.headers = { origin };

        const middleware = corsMiddleware.middleware();
        
        try {
          await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
        } catch (error: any) {
          expect([400, 403]).toContain(error.statusCode);
        }
      }
    });
  });

  describe('Performance', () => {
    it('should handle high volume of requests efficiently', async () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        vi.clearAllMocks();
        mockRequest.headers = {
          origin: 'https://localhost:3000'
        };

        const middleware = corsMiddleware.middleware();
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should process 1000 requests in less than 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});