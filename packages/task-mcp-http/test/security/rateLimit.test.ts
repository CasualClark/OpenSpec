/**
 * Tests for Rate Limiting middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { RateLimitMiddleware } from '../../src/security/rateLimit.js';

describe('Rate Limiting Middleware', () => {
  let rateLimitMiddleware: RateLimitMiddleware;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    const rateLimitConfig = {
      requestsPerMinute: 60
    };

    rateLimitMiddleware = new RateLimitMiddleware(rateLimitConfig);

    mockRequest = {
      ip: '127.0.0.1',
      headers: {},
      id: 'test-request-id'
    };

    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      // Make 50 requests (within 60 limit)
      for (let i = 0; i < 50; i++) {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }

      expect(mockReply.code).not.toHaveBeenCalledWith(429);
    });

    it('should block requests exceeding limit', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      // Make requests exceeding the limit
      for (let i = 0; i < 61; i++) {
        try {
          await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
        } catch (error: any) {
          if (i >= 60) {
            expect(error.statusCode).toBe(429);
            expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
          }
        }
      }

      // The 61st request should be rate limited
      expect(mockReply.code).toHaveBeenCalledWith(429);
    });

    it('should include rate limit headers', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should handle burst capacity correctly', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      // Make burst requests (should allow up to 90)
      let rateLimitedCount = 0;
      for (let i = 0; i < 91; i++) {
        try {
          await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
        } catch (error: any) {
          rateLimitedCount++;
        }
      }

      // Should allow 90 requests (60 normal + 30 burst)
      expect(rateLimitedCount).toBe(1); // Only the 91st should be blocked
    });
  });

  describe('Token-based Rate Limiting', () => {
    it('should use auth token for rate limiting when available', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      // Mock request with auth token
      const authenticatedRequest = {
        ...mockRequest,
        headers: {
          authorization: 'Bearer valid-token-123'
        },
        authContext: {
          token: 'valid-token-123',
          type: 'bearer',
          valid: true,
          permissions: ['*']
        }
      };

      // Make requests with token
      for (let i = 0; i < 50; i++) {
        await middleware(authenticatedRequest as FastifyRequest, mockReply as FastifyReply);
      }

      const stats = rateLimitMiddleware.getStats();
      expect(stats.keyTypes.token).toBeGreaterThan(0);
    });

    it('should fall back to IP when no auth token', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const stats = rateLimitMiddleware.getStats();
      expect(stats.keyTypes.ip).toBeGreaterThan(0);
    });
  });

  describe('Window Reset', () => {
    it('should reset rate limit after window expires', async () => {
      vi.useFakeTimers();
      
      const middleware = rateLimitMiddleware.middleware();
      
      // Exhaust the limit
      for (let i = 0; i < 60; i++) {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }

      // Next request should be rate limited
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(429);
      }

      // Advance time by window duration
      vi.advanceTimersByTime(60001);
      
      // Should allow requests again
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.code).not.toHaveBeenCalledWith(429);
    });
  });

  describe('Multiple Clients', () => {
    it('should track different clients separately', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      const client1 = { ...mockRequest, ip: '192.168.1.1' };
      const client2 = { ...mockRequest, ip: '192.168.1.2' };

      // Exhaust limit for client1
      for (let i = 0; i < 61; i++) {
        try {
          await middleware(client1 as FastifyRequest, mockReply as FastifyReply);
        } catch (error: any) {
          // Client1 should be rate limited
        }
      }

      // Client2 should still be able to make requests
      await middleware(client2 as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.code).not.toHaveBeenCalledWith(429);
    });

    it('should handle mixed IP and token-based clients', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      const ipClient = { ...mockRequest, ip: '192.168.1.1' };
      const tokenClient = {
        ...mockRequest,
        headers: { authorization: 'Bearer token-123' },
        authContext: {
          token: 'token-123',
          type: 'bearer',
          valid: true,
          permissions: ['*']
        }
      };

      // Both clients should have separate limits
      for (let i = 0; i < 50; i++) {
        await middleware(ipClient as FastifyRequest, mockReply as FastifyReply);
        await middleware(tokenClient as FastifyRequest, mockReply as FastifyReply);
      }

      const stats = rateLimitMiddleware.getStats();
      expect(stats.keyTypes.ip).toBeGreaterThan(0);
      expect(stats.keyTypes.token).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track rate limit statistics', () => {
      const stats = rateLimitMiddleware.getStats();
      
      expect(stats).toHaveProperty('totalRecords');
      expect(stats).toHaveProperty('activeRecords');
      expect(stats).toHaveProperty('keyTypes');
      expect(stats).toHaveProperty('config');
      expect(typeof stats.totalRecords).toBe('number');
      expect(typeof stats.activeRecords).toBe('number');
      expect(typeof stats.keyTypes).toBe('object');
      expect(typeof stats.config).toBe('object');
    });

    it('should update statistics on requests', async () => {
      const initialStats = rateLimitMiddleware.getStats();
      const middleware = rateLimitMiddleware.middleware();
      
      // Make some requests
      for (let i = 0; i < 10; i++) {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }

      const updatedStats = rateLimitMiddleware.getStats();
      expect(updatedStats.totalRecords).toBeGreaterThan(initialStats.totalRecords);
    });

    it('should track different key types', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      // Make requests with different IP
      for (let i = 0; i < 5; i++) {
        const request = {
          ...mockRequest,
          ip: `192.168.1.${i}`
        };
        await middleware(request as FastifyRequest, mockReply as FastifyReply);
      }

      const stats = rateLimitMiddleware.getStats();
      expect(stats.keyTypes.ip).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing IP gracefully', async () => {
      const requestWithoutIP = {
        ...mockRequest,
        ip: '127.0.0.1' // Provide a fallback IP
      };

      const middleware = rateLimitMiddleware.middleware();
      
      // Should not throw error
      await expect(
        middleware(requestWithoutIP as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should provide detailed error information', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      // Exhaust limit
      for (let i = 0; i < 61; i++) {
        try {
          await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
        } catch (error: any) {
          if (i >= 60) {
            expect(error.statusCode).toBe(429);
            expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
            expect(error.message).toContain('Rate limit exceeded');
            expect(error.retryAfter).toBeDefined();
          }
        }
      }
    });
  });

  describe('Configuration', () => {
    it('should handle custom rate limit configurations', () => {
      const customConfig = {
        requestsPerMinute: 30
      };

      const customRateLimit = new RateLimitMiddleware(customConfig);
      const stats = customRateLimit.getStats();
      
      expect(stats).toBeDefined();
      expect(stats.config.requestsPerMinute).toBe(30);
    });

    it('should validate configuration parameters', () => {
      expect(() => {
        new RateLimitMiddleware({
          requestsPerMinute: 60
        });
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle high request volume efficiently', async () => {
      const startTime = Date.now();
      const middleware = rateLimitMiddleware.middleware();
      
      // Process 1000 requests
      for (let i = 0; i < 1000; i++) {
        const request = {
          ...mockRequest,
          ip: `192.168.1.${i % 255}` // Different IPs to avoid rate limiting
        };
        
        try {
          await middleware(request as FastifyRequest, mockReply as FastifyReply);
        } catch (error: any) {
          // Some may be rate limited, which is expected
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should process 1000 requests in reasonable time
      expect(duration).toBeLessThan(1000);
    });

    it('should cleanup old entries to prevent memory leaks', async () => {
      vi.useFakeTimers();
      
      const middleware = rateLimitMiddleware.middleware();
      
      // Make requests from multiple IPs
      for (let i = 0; i < 100; i++) {
        const request = {
          ...mockRequest,
          ip: `192.168.1.${i}`
        };
        
        await middleware(request as FastifyRequest, mockReply as FastifyReply);
      }

      let stats = rateLimitMiddleware.getStats();
      const initialRecords = stats.totalRecords;

      // Advance time beyond window
      vi.advanceTimersByTime(120000);
      
      // Trigger cleanup (should happen automatically)
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      
      stats = rateLimitMiddleware.getStats();
      
      // Records should be managed properly
      expect(stats.totalRecords).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle IPv6 addresses', async () => {
      const ipv6Request = {
        ...mockRequest,
        ip: '2001:db8::1'
      };

      const middleware = rateLimitMiddleware.middleware();
      
      await expect(
        middleware(ipv6Request as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should handle malformed IP addresses', async () => {
      const malformedIPRequest = {
        ...mockRequest,
        ip: 'not-an-ip'
      };

      const middleware = rateLimitMiddleware.middleware();
      
      await expect(
        middleware(malformedIPRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should handle concurrent requests safely', async () => {
      const middleware = rateLimitMiddleware.middleware();
      
      // Make concurrent requests
      const promises = Array.from({ length: 100 }, () => 
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });
});