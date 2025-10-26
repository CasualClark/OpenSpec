/**
 * Tests for Authentication middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationMiddleware } from '../../src/security/auth.js';

describe('Authentication Middleware', () => {
  let authMiddleware: AuthenticationMiddleware;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockAuditLogger: any;

  beforeEach(() => {
    mockAuditLogger = {
      logAuthAttempt: vi.fn(),
      logAuthSuccess: vi.fn(),
      logAuthFailure: vi.fn(),
      getMetrics: vi.fn(() => ({
        totalAttempts: 100,
        successfulAttempts: 80,
        failedAttempts: 20,
        attemptsByType: { bearer: 60, cookie: 40 },
        attemptsByResult: { success: 80, failed: 20 },
        recentFailures: []
      }))
    };

    const authConfig = {
      tokens: ['valid-token-1', 'valid-token-2'],
      cookieName: 'auth-token',
      enabled: true
    };

    authMiddleware = new AuthenticationMiddleware(authConfig, mockAuditLogger);

    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
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
  });

  describe('Bearer Token Authentication', () => {
    it('should authenticate with valid Bearer token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token-1'
      };

      const middleware = authMiddleware.middleware();
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditLogger.logAuthSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bearer',
          tokenHash: expect.any(String),
          ipAddress: '127.0.0.1'
        })
      );

      // Request should be decorated with auth info
      expect((mockRequest as any).auth).toEqual({
        type: 'bearer',
        token: 'valid-token-1',
        authenticated: true
      });
    });

    it('should reject invalid Bearer token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      const middleware = authMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('AUTHENTICATION_FAILED');
      }

      expect(mockAuditLogger.logAuthFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bearer',
          reason: 'invalid_token',
          ipAddress: '127.0.0.1'
        })
      );
    });

    it('should reject malformed Bearer token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer' // Missing token
      };

      const middleware = authMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('AUTHENTICATION_FAILED');
      }

      expect(mockAuditLogger.logAuthFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'bearer',
          reason: 'malformed_token'
        })
      );
    });

    it('should reject Bearer token with wrong scheme', async () => {
      mockRequest.headers = {
        authorization: 'Basic valid-token-1'
      };

      const middleware = authMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('AUTHENTICATION_FAILED');
      }
    });
  });

  describe('Cookie Authentication', () => {
    it('should authenticate with valid cookie token', async () => {
      mockRequest.headers = {
        cookie: 'auth-token=valid-token-2'
      };

      const middleware = authMiddleware.middleware();
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditLogger.logAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_success',
          tokenType: 'cookie'
        })
      );

      expect((mockRequest as any).authContext).toEqual({
        token: 'valid-token-2',
        type: 'cookie',
        valid: true,
        permissions: ['*']
      });
    });

    it('should reject invalid cookie token', async () => {
      mockRequest.headers = {
        cookie: 'auth-token=invalid-token'
      };

      const middleware = authMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('AUTHENTICATION_FAILED');
      }

      expect(mockAuditLogger.logAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_failed'
        })
      );
    });

    it('should reject missing cookie token', async () => {
      const middleware = authMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('AUTHENTICATION_REQUIRED');
      }
    });
  });

  describe('Authentication Priority', () => {
    it('should prefer Bearer token over cookie when both present', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token-1',
        cookie: 'auth-token=valid-token-2'
      };

      const middleware = authMiddleware.middleware();
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).authContext).toEqual({
        token: 'valid-token-1',
        type: 'bearer',
        valid: true,
        permissions: ['*']
      });
    });
  });

  describe('Security Features', () => {
    it('should handle token hashing for audit logs', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token-1'
      };

      const middleware = authMiddleware.middleware();
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const authSuccessCall = mockAuditLogger.logAuthSuccess.mock.calls[0][0];
      expect(authSuccessCall.tokenHash).toBeDefined();
      expect(authSuccessCall.tokenHash).not.toBe('valid-token-1'); // Should be hashed
      expect(authSuccessCall.tokenHash).toMatch(/^[a-f0-9]+$/); // Should be hex hash
    });

    it('should include correlation ID in audit logs', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token-1'
      };

      const middleware = authMiddleware.middleware();
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditLogger.logAuthSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-request-id'
        })
      );
    });

    it('should include user agent in audit logs when available', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token-1',
        'user-agent': 'Test-Agent/1.0'
      };

      const middleware = authMiddleware.middleware();
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAuditLogger.logAuthSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Test-Agent/1.0'
        })
      );
    });
  });

  describe('Disabled Authentication', () => {
    it('should skip authentication when disabled', async () => {
      const disabledAuthConfig = {
        tokens: [],
        cookieName: 'auth-token',
        enabled: false
      };

      const disabledAuthMiddleware = new AuthenticationMiddleware(disabledAuthConfig, mockAuditLogger);
      const middleware = disabledAuthMiddleware.middleware();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).authContext).toEqual({
        token: 'dev-mode',
        type: 'bearer',
        valid: true,
        permissions: ['*']
      });

      expect(mockAuditLogger.logAuthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_skip',
          reason: 'development_mode'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing authorization gracefully', async () => {
      const middleware = authMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('AUTHENTICATION_REQUIRED');
        expect(error.message).toContain('Authentication required');
      }
    });

    it('should handle malformed authorization header', async () => {
      mockRequest.headers = {
        authorization: 'invalid-format'
      };

      const middleware = authMiddleware.middleware();
      
      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error: any) {
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('AUTHENTICATION_FAILED');
      }
    });
  });

  describe('Statistics and Metrics', () => {
    it('should track authentication statistics', () => {
      const stats = authMiddleware.getStats();
      
      expect(stats).toHaveProperty('cachedTokens');
      expect(stats).toHaveProperty('trackedIPs');
      expect(stats).toHaveProperty('rateLimitedIPs');
      expect(Array.isArray(stats.rateLimitedIPs)).toBe(true);
    });
  });

  describe('Token Validation Edge Cases', () => {
    it('should handle empty tokens array', async () => {
      const emptyTokenConfig = {
        tokens: [],
        cookieName: 'auth-token',
        enabled: true
      };

      const emptyAuthMiddleware = new AuthenticationMiddleware(emptyTokenConfig, mockAuditLogger);
      const middleware = emptyAuthMiddleware.middleware();

      mockRequest.headers = {
        authorization: 'Bearer any-token'
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should skip authentication in dev mode
      expect((mockRequest as any).authContext.valid).toBe(true);
    });

    it('should handle duplicate tokens in config', async () => {
      const duplicateTokenConfig = {
        tokens: ['valid-token', 'valid-token'], // Duplicate
        cookieName: 'auth-token',
        enabled: true
      };

      const duplicateAuthMiddleware = new AuthenticationMiddleware(duplicateTokenConfig, mockAuditLogger);
      const middleware = duplicateAuthMiddleware.middleware();

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).authContext.valid).toBe(true);
    });
  });
});