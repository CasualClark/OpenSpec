/**
 * Enhanced Rate Limiting for Task MCP HTTPS/SSE Server
 * 
 * Provides IP-based and token-based rate limiting with burst control
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ServerConfig } from '../types.js';

export interface RateLimitConfig {
  requestsPerMinute: number;
  burstLimit: number;
  windowMs: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  enableDistributed?: boolean;
  redisUrl?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface RateLimitRecord {
  count: number;
  resetTime: number;
  firstRequest: number;
}

/**
 * Enhanced rate limiting middleware class
 */
export class RateLimitMiddleware {
  private config: RateLimitConfig;
  private store: Map<string, RateLimitRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: ServerConfig['rateLimit']) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute,
      burstLimit: Math.floor(config.requestsPerMinute * 1.5), // 50% burst allowance
      windowMs: 60 * 1000, // 1 minute
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      enableDistributed: false
    };

    // Cleanup expired records every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.windowMs);
  }

  /**
   * Rate limiting middleware
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const key = this.getKey(request);
      const now = Date.now();
      const record = this.getOrCreateRecord(key, now);

      // Check if rate limited
      if (this.isRateLimited(record, now)) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        
        // Set rate limit headers
        this.setRateLimitHeaders(reply, {
          limit: this.config.requestsPerMinute,
          remaining: 0,
          reset: record.resetTime,
          retryAfter
        });

        // Log rate limit event
        this.logRateLimitEvent(request, key, record);

        throw new Error(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
      }

      // Update record
      record.count++;
      record.firstRequest = record.firstRequest || now;

      // Calculate remaining requests
      const remaining = Math.max(0, this.config.requestsPerMinute - record.count);

      // Set rate limit headers
      this.setRateLimitHeaders(reply, {
        limit: this.config.requestsPerMinute,
        remaining,
        reset: record.resetTime
      });

      // Store updated record
      this.store.set(key, record);
    };
  }

  /**
   * Generate rate limit key for request
   */
  private getKey(request: FastifyRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }

    // Use auth token as key if available, otherwise IP
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return `token:${authHeader.substring(7)}`;
    }

    // Check for cookie-based auth
    const cookieHeader = request.headers.cookie;
    if (cookieHeader && cookieHeader.includes('auth_token=')) {
      const tokenMatch = cookieHeader.match(/auth_token=([^;]+)/);
      if (tokenMatch) {
        return `token:${tokenMatch[1]}`;
      }
    }

    // Fallback to IP address
    return `ip:${request.ip}`;
  }

  /**
   * Get or create rate limit record
   */
  private getOrCreateRecord(key: string, now: number): RateLimitRecord {
    const existing = this.store.get(key);
    
    if (existing && existing.resetTime > now) {
      return existing;
    }

    // Create new record
    const newRecord: RateLimitRecord = {
      count: 0,
      resetTime: now + this.config.windowMs,
      firstRequest: now
    };

    this.store.set(key, newRecord);
    return newRecord;
  }

  /**
   * Check if request should be rate limited
   */
  private isRateLimited(record: RateLimitRecord, now: number): boolean {
    // Check basic rate limit
    if (record.count >= this.config.requestsPerMinute) {
      return true;
    }

    // Check burst limit (only within first 10 seconds)
    const timeSinceFirst = now - record.firstRequest;
    if (timeSinceFirst < 10000 && record.count >= this.config.burstLimit) {
      return true;
    }

    return false;
  }

  /**
   * Set rate limit headers on response
   */
  private setRateLimitHeaders(reply: FastifyReply, info: RateLimitInfo): void {
    reply.header('X-RateLimit-Limit', info.limit.toString());
    reply.header('X-RateLimit-Remaining', info.remaining.toString());
    reply.header('X-RateLimit-Reset', new Date(info.reset).toISOString());

    if (info.retryAfter) {
      reply.header('Retry-After', info.retryAfter.toString());
    }
  }

  /**
   * Log rate limit events
   */
  private logRateLimitEvent(request: FastifyRequest, key: string, record: RateLimitRecord): void {
    const keyType = key.startsWith('token:') ? 'token' : 'ip';
    const keyValue = key.substring(key.indexOf(':') + 1);
    
    console.warn('Rate limit exceeded', {
      requestId: request.id,
      keyType,
      keyValue: keyType === 'ip' ? keyValue : keyValue.substring(0, 8) + '...',
      count: record.count,
      limit: this.config.requestsPerMinute,
      resetTime: new Date(record.resetTime).toISOString(),
      userAgent: request.headers['user-agent'],
      path: request.url,
      method: request.method
    });
  }

  /**
   * Cleanup expired records
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, record] of this.store.entries()) {
      if (record.resetTime <= now) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.store.delete(key));
  }

  /**
   * Get rate limit statistics
   */
  getStats() {
    const now = Date.now();
    let totalRecords = 0;
    let activeRecords = 0;
    const keyTypes: { [key: string]: number } = {};

    for (const [key, record] of this.store.entries()) {
      totalRecords++;
      if (record.resetTime > now) {
        activeRecords++;
      }

      const keyType = key.startsWith('token:') ? 'token' : 'ip';
      keyTypes[keyType] = (keyTypes[keyType] || 0) + 1;
    }

    return {
      totalRecords,
      activeRecords,
      keyTypes,
      config: {
        requestsPerMinute: this.config.requestsPerMinute,
        burstLimit: this.config.burstLimit,
        windowMs: this.config.windowMs
      }
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  resetKey(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: ServerConfig['rateLimit']): RateLimitMiddleware {
  return new RateLimitMiddleware(config);
}