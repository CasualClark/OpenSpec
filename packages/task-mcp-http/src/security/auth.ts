/**
 * Enhanced Authentication Middleware for Task MCP HTTPS/SSE Server
 * 
 * Provides comprehensive authentication with bearer tokens, cookies, and audit logging
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { parse as parseCookie } from 'cookie';
import { ServerConfig, HTTPError } from '../types.js';
import { AuditLogger, AuditEvent } from './audit.js';

// Extend FastifyRequest to include authentication context
declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export interface AuthContext {
  token: string;
  type: 'bearer' | 'cookie';
  valid: boolean;
  expiresAt?: number;
  userId?: string;
  sessionId?: string;
  permissions: string[];
}

export interface TokenInfo {
  token: string;
  type: 'bearer' | 'cookie';
  expiresAt?: number;
  userId?: string;
  sessionId?: string;
}

/**
 * Enhanced authentication middleware class
 */
export class AuthenticationMiddleware {
  private auditLogger: AuditLogger;
  private tokenCache: Map<string, TokenInfo> = new Map();
  private failedAttempts: Map<string, number[]> = new Map();

  constructor(
    private config: ServerConfig['auth'],
    private auditLoggerInstance: AuditLogger
  ) {
    this.auditLogger = auditLoggerInstance;
    // Cleanup expired tokens every 5 minutes
    setInterval(() => this.cleanupExpiredTokens(), 5 * 60 * 1000);
  }

  /**
   * Main authentication middleware
   */
  async authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const requestId = request.id;
    const startTime = Date.now();
    const clientInfo = this.extractClientInfo(request);

    try {
      // Skip auth if no tokens configured (development mode)
      if (this.config.tokens.length === 0) {
        const authContext: AuthContext = {
          token: 'dev-mode',
          type: 'bearer',
          valid: true,
          permissions: ['*']
        };
        request.authContext = authContext;
        
        await this.auditLogger.logAuthEvent({
          type: 'auth_skip',
          requestId,
          timestamp: startTime,
          clientInfo,
          success: true,
          reason: 'development_mode'
        });
        return;
      }

      // Extract token from various sources
      const tokenInfo = this.extractToken(request);
      if (!tokenInfo) {
        await this.handleMissingAuth(request, reply, requestId, clientInfo, startTime);
        return;
      }

      // Check rate limiting for failed attempts
      if (this.isRateLimited(clientInfo.ipAddress)) {
        await this.handleRateLimit(request, reply, requestId, clientInfo, startTime);
        return;
      }

      // Validate token
      const authContext = await this.validateToken(tokenInfo, requestId, clientInfo);
      if (!authContext.valid) {
        await this.handleInvalidAuth(request, reply, tokenInfo, requestId, clientInfo, startTime);
        return;
      }

      // Set authentication context
      request.authContext = authContext;

      // Log successful authentication
      await this.auditLogger.logAuthEvent({
        type: 'auth_success',
        requestId,
        timestamp: startTime,
        clientInfo,
        tokenType: authContext.type,
        userId: authContext.userId,
        sessionId: authContext.sessionId,
        success: true
      });

      // Clear failed attempts for successful auth
      this.failedAttempts.delete(clientInfo.ipAddress);

    } catch (error) {
      await this.auditLogger.logAuthEvent({
        type: 'auth_error',
        requestId,
        timestamp: startTime,
        clientInfo,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new HTTPError(500, 'AUTH_ERROR', 'Authentication system error');
    }
  }

  /**
   * Extract token from request headers or cookies
   */
  private extractToken(request: FastifyRequest): TokenInfo | null {
    // Try Bearer token first
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return {
        token,
        type: 'bearer'
      };
    }

    // Try cookie-based authentication for EventSource
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookie(cookieHeader);
      if (cookies.auth_token) {
        return {
          token: cookies.auth_token,
          type: 'cookie'
        };
      }
    }

    return null;
  }

  /**
   * Validate token against configured tokens
   */
  private async validateToken(tokenInfo: TokenInfo, requestId: string, clientInfo: any): Promise<AuthContext> {
    // Check cache first
    const cached = this.tokenCache.get(tokenInfo.token);
    if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
      return {
        token: tokenInfo.token,
        type: tokenInfo.type,
        valid: true,
        expiresAt: cached.expiresAt,
        userId: cached.userId,
        sessionId: cached.sessionId,
        permissions: ['*'] // Simple permissions for now
      };
    }

    // Validate against configured tokens
    const isValidToken = this.config.tokens.includes(tokenInfo.token);
    
    if (!isValidToken) {
      // Record failed attempt
      this.recordFailedAttempt(clientInfo.ipAddress);
      
      return {
        token: tokenInfo.token,
        type: tokenInfo.type,
        valid: false,
        permissions: []
      };
    }

    // Create token info with expiration (1 hour from now)
    const tokenData: TokenInfo = {
      ...tokenInfo,
      expiresAt: Date.now() + (60 * 60 * 1000), // 1 hour
      userId: this.extractUserIdFromToken(tokenInfo.token),
      sessionId: this.generateSessionId()
    };

    // Cache the token
    this.tokenCache.set(tokenInfo.token, tokenData);

    return {
      token: tokenInfo.token,
      type: tokenInfo.type,
      valid: true,
      expiresAt: tokenData.expiresAt,
      userId: tokenData.userId,
      sessionId: tokenData.sessionId,
      permissions: ['*']
    };
  }

  /**
   * Handle missing authentication
   */
  private async handleMissingAuth(
    request: FastifyRequest,
    reply: FastifyReply,
    requestId: string,
    clientInfo: any,
    startTime: number
  ): Promise<void> {
    await this.auditLogger.logAuthEvent({
      type: 'auth_missing',
      requestId,
      timestamp: startTime,
      clientInfo,
      success: false,
      reason: 'no_auth_token_provided'
    });

    throw new HTTPError(
      401,
      'MISSING_AUTH_TOKEN',
      'Authentication required',
      'Provide Bearer token in Authorization header or auth_token cookie'
    );
  }

  /**
   * Handle invalid authentication
   */
  private async handleInvalidAuth(
    request: FastifyRequest,
    reply: FastifyReply,
    tokenInfo: TokenInfo,
    requestId: string,
    clientInfo: any,
    startTime: number
  ): Promise<void> {
    await this.auditLogger.logAuthEvent({
      type: 'auth_invalid',
      requestId,
      timestamp: startTime,
      clientInfo,
      tokenType: tokenInfo.type,
      success: false,
      reason: 'invalid_token'
    });

    throw new HTTPError(
      403,
      'INVALID_AUTH_TOKEN',
      'Invalid or expired authentication token',
      'Check your token and try again'
    );
  }

  /**
   * Handle rate limiting for failed attempts
   */
  private async handleRateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
    requestId: string,
    clientInfo: any,
    startTime: number
  ): Promise<void> {
    await this.auditLogger.logAuthEvent({
      type: 'auth_rate_limited',
      requestId,
      timestamp: startTime,
      clientInfo,
      success: false,
      reason: 'too_many_failed_attempts'
    });

    throw new HTTPError(
      429,
      'AUTH_RATE_LIMITED',
      'Too many failed authentication attempts',
      'Please wait before trying again'
    );
  }

  /**
   * Extract client information for audit logging
   */
  private extractClientInfo(request: FastifyRequest) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      referer: request.headers.referer,
      origin: request.headers.origin,
      requestId: request.id
    };
  }

  /**
   * Record failed authentication attempt
   */
  private recordFailedAttempt(ipAddress: string): void {
    const now = Date.now();
    const attempts = this.failedAttempts.get(ipAddress) || [];
    attempts.push(now);
    
    // Keep only attempts from the last 15 minutes
    const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);
    this.failedAttempts.set(ipAddress, recentAttempts);
  }

  /**
   * Check if IP address is rate limited
   */
  private isRateLimited(ipAddress: string): boolean {
    const attempts = this.failedAttempts.get(ipAddress) || [];
    const now = Date.now();
    
    // Count attempts in the last 15 minutes
    const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);
    
    // Rate limit after 10 failed attempts
    return recentAttempts.length >= 10;
  }

  /**
   * Clean up expired tokens from cache
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [token, tokenInfo] of this.tokenCache.entries()) {
      if (tokenInfo.expiresAt && tokenInfo.expiresAt <= now) {
        this.tokenCache.delete(token);
      }
    }
  }

  /**
   * Extract user ID from token (simple implementation)
   */
  private extractUserIdFromToken(token: string): string {
    // In a real implementation, this might decode a JWT or look up in a database
    // For now, use a simple hash
    return `user_${Buffer.from(token).toString('base64').substring(0, 8)}`;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Create authentication middleware function
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await this.authenticate(request, reply);
    };
  }

  /**
   * Get authentication statistics
   */
  getStats() {
    return {
      cachedTokens: this.tokenCache.size,
      trackedIPs: this.failedAttempts.size,
      rateLimitedIPs: Array.from(this.failedAttempts.entries())
        .filter(([_, attempts]) => attempts.length >= 10)
        .map(([ip]) => ip)
    };
  }
}