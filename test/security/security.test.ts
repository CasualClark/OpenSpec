/**
 * Security Middleware Test Suite
 * 
 * Comprehensive tests for authentication, CORS, rate limiting, and security headers
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { 
  AuthenticationMiddleware, 
  CorsMiddleware, 
  RateLimitMiddleware, 
  SecurityHeadersMiddleware,
  createAuditLogger,
  AuditLogger
} from '../../packages/task-mcp-http/src/security/index.js';

describe('Security Middleware', () => {
  let server: FastifyInstance;
  let auditLogger: AuditLogger;
  let authMiddleware: AuthenticationMiddleware;
  let corsMiddleware: CorsMiddleware;
  let rateLimitMiddleware: RateLimitMiddleware;
  let securityHeadersMiddleware: SecurityHeadersMiddleware;

  beforeEach(async () => {
    // Create test server
    server = Fastify({ logger: false });

    // Create audit logger
    auditLogger = createAuditLogger({
      logLevel: 'error', // Reduce noise in tests
      enableConsole: false,
      bufferSize: 10,
      flushIntervalMs: 1000
    });

    // Create security middleware
    authMiddleware = new AuthenticationMiddleware(
      { tokens: ['test-token-123', 'valid-token-456'] },
      auditLogger
    );

    corsMiddleware = new CorsMiddleware({
      origins: ['http://localhost:3000', 'https://example.com']
    });

    rateLimitMiddleware = new RateLimitMiddleware({
      requestsPerMinute: 10
    });

    securityHeadersMiddleware = new SecurityHeadersMiddleware({
      enabled: true,
      strictTransportSecurity: {
        enabled: false, // Disable for tests
        maxAge: 31536000,
        includeSubDomains: true,
        preload: false
      }
    });

    // Register test routes
    server.get('/test', {
      preHandler: [
        authMiddleware.middleware(),
        rateLimitMiddleware.middleware(),
        securityHeadersMiddleware.middleware()
      ]
    }, async () => ({ message: 'success' }));

    server.post('/test', {
      preHandler: [
        authMiddleware.middleware(),
        rateLimitMiddleware.middleware(),
        securityHeadersMiddleware.middleware()
      ]
    }, async () => ({ message: 'success' }));

    server.options('/test', {
      preHandler: [
        corsMiddleware.middleware(),
        securityHeadersMiddleware.middleware()
      ]
    }, async () => ({ message: 'success' }));
  });

  afterEach(async () => {
    await server.close();
    auditLogger.destroy();
  });

  describe('Authentication Middleware', () => {
    it('should allow requests with valid bearer token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer test-token-123'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'success' });
    });

    it('should reject requests with invalid bearer token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer invalid-token'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('INVALID_AUTH_TOKEN');
    });

    it('should reject requests without authorization header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test'
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('MISSING_AUTH_TOKEN');
    });

    it('should allow requests with valid cookie token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          cookie: 'auth_token=test-token-123'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'success' });
    });
  });

  describe('CORS Middleware', () => {
    it('should allow preflight requests from allowed origins', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: {
          origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST'
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should reject preflight requests from disallowed origins', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: {
          origin: 'http://evil.com',
          'Access-Control-Request-Method': 'POST'
        }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should handle wildcard origins', async () => {
      const wildcardCors = new CorsMiddleware({
        origins: ['*']
      });

      const wildcardServer = Fastify({ logger: false });
      wildcardServer.options('/test', {
        preHandler: [wildcardCors.middleware()]
      }, async () => ({ message: 'success' }));

      const response = await wildcardServer.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: {
          origin: 'http://any-origin.com',
          'Access-Control-Request-Method': 'POST'
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('*');

      await wildcardServer.close();
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      for (let i = 0; i < 5; i++) {
        const response = await server.inject({
          method: 'GET',
          url: '/test',
          headers: {
            authorization: 'Bearer test-token-123'
          }
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
        expect(response.headers['x-ratelimit-limit']).toBe('10');
      }
    });

    it('should rate limit excessive requests', async () => {
      // Make requests up to the limit
      for (let i = 0; i < 10; i++) {
        await server.inject({
          method: 'GET',
          url: '/test',
          headers: {
            authorization: 'Bearer test-token-123'
          }
        });
      }

      // Next request should be rate limited
      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer test-token-123'
        }
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
    });

    it('should apply separate rate limits per token', async () => {
      // Exhaust rate limit for first token
      for (let i = 0; i < 10; i++) {
        await server.inject({
          method: 'GET',
          url: '/test',
          headers: {
            authorization: 'Bearer test-token-123'
          }
        });
      }

      // Second token should still be able to make requests
      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token-456'
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security Headers', () => {
    it('should set security headers on responses', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer test-token-123'
        }
      });

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBeDefined();
      expect(response.headers['permissions-policy']).toBeDefined();
    });

    it('should not set HSTS header when disabled', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer test-token-123'
        }
      });

      expect(response.headers['strict-transport-security']).toBeUndefined();
    });

    it('should set HSTS header when enabled', async () => {
      const hstsHeaders = new SecurityHeadersMiddleware({
        enabled: true,
        strictTransportSecurity: {
          enabled: true,
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        }
      });

      const hstsServer = Fastify({ logger: false });
      hstsServer.get('/test', {
        preHandler: [authMiddleware.middleware(), hstsHeaders.middleware()]
      }, async () => ({ message: 'success' }));

      const response = await hstsServer.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer test-token-123'
        }
      });

      expect(response.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');

      await hstsServer.close();
    });
  });

  describe('Audit Logging', () => {
    it('should log authentication events', async () => {
      // Successful auth
      await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer test-token-123'
        }
      });

      // Failed auth
      await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer invalid-token'
        }
      });

      const metrics = auditLogger.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.successfulAuths).toBeGreaterThan(0);
      expect(metrics.failedAuths).toBeGreaterThan(0);
    });

    it('should track security metrics', async () => {
      const authStats = authMiddleware.getStats();
      expect(authStats).toHaveProperty('cachedTokens');
      expect(authStats).toHaveProperty('trackedIPs');

      const rateLimitStats = rateLimitMiddleware.getStats();
      expect(rateLimitStats).toHaveProperty('totalRecords');
      expect(rateLimitStats).toHaveProperty('activeRecords');
      expect(rateLimitStats).toHaveProperty('keyTypes');
    });
  });

  describe('Integration Tests', () => {
    it('should work with all security middleware combined', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/test',
        headers: {
          authorization: 'Bearer test-token-123',
          origin: 'http://localhost:3000',
          'content-type': 'application/json'
        },
        payload: { test: 'data' }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should handle security incidents appropriately', async () => {
      // Simulate multiple failed auth attempts
      for (let i = 0; i < 12; i++) {
        await server.inject({
          method: 'GET',
          url: '/test',
          headers: {
            authorization: 'Bearer invalid-token'
          }
        });
      }

      const metrics = auditLogger.getMetrics();
      expect(metrics.failedAuths).toBeGreaterThan(10);
    });
  });
});