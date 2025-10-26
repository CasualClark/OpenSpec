/**
 * Enhanced CORS Configuration for Task MCP HTTPS/SSE Server
 * 
 * Provides configurable origin whitelist, preflight handling, and credential support
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ServerConfig } from '../types.js';

export interface CorsConfig {
  origins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
  preflightContinue: boolean;
}

/**
 * Enhanced CORS middleware class
 */
export class CorsMiddleware {
  private config: CorsConfig;
  private originPatterns: RegExp[];

  constructor(config: ServerConfig['cors']) {
    this.config = {
      origins: config.origins,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control'
      ],
      exposedHeaders: [
        'X-Request-ID',
        'X-Rate-Limit-Limit',
        'X-Rate-Limit-Remaining',
        'X-Rate-Limit-Reset'
      ],
      maxAge: 86400, // 24 hours
      preflightContinue: false
    };

    // Precompile origin patterns for performance
    this.originPatterns = this.config.origins.map(origin => {
      if (origin === '*') {
        return /^.*$/;
      }
      // Convert wildcard patterns to regex
      const pattern = origin
        .replace(/\*/g, '.*')
        .replace(/\./g, '\\.');
      return new RegExp(`^${pattern}$`);
    });
  }

  /**
   * Check if origin is allowed
   */
  private isOriginAllowed(origin?: string): boolean {
    if (!origin) return false;
    if (this.config.origins.includes('*')) return true;

    return this.originPatterns.some(pattern => pattern.test(origin));
  }

  /**
   * Handle preflight requests
   */
  private handlePreflight(request: FastifyRequest, reply: FastifyReply): void {
    const origin = request.headers.origin;
    
    if (!this.isOriginAllowed(origin)) {
      reply.code(403).send({
        error: 'Origin not allowed',
        message: `Origin ${origin} is not in the allowed list`
      });
      return;
    }

    // Set CORS headers for preflight
    reply.header('Access-Control-Allow-Origin', origin || '*');
    reply.header('Access-Control-Allow-Methods', this.config.methods.join(', '));
    reply.header('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
    reply.header('Access-Control-Max-Age', this.config.maxAge.toString());
    
    if (this.config.credentials) {
      reply.header('Access-Control-Allow-Credentials', 'true');
    }

    reply.code(204).send();
  }

  /**
   * Handle actual requests
   */
  private handleRequest(request: FastifyRequest, reply: FastifyReply): void {
    const origin = request.headers.origin;
    
    if (!this.isOriginAllowed(origin)) {
      return; // Don't add CORS headers for disallowed origins
    }

    // Set CORS headers
    reply.header('Access-Control-Allow-Origin', origin || '*');
    
    if (this.config.credentials) {
      reply.header('Access-Control-Allow-Credentials', 'true');
    }

    // Expose additional headers
    if (this.config.exposedHeaders.length > 0) {
      reply.header('Access-Control-Expose-Headers', this.config.exposedHeaders.join(', '));
    }
  }

  /**
   * Create CORS middleware
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.method === 'OPTIONS') {
        return this.handlePreflight(request, reply);
      } else {
        return this.handleRequest(request, reply);
      }
    };
  }

  /**
   * Get Fastify CORS configuration
   */
  getFastifyConfig() {
    return {
      origin: (origin: string, callback: Function) => {
        // Allow health check requests without origin (for monitoring tools)
        if (!origin) {
          callback(null, true);
          return;
        }
        
        if (this.isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: this.config.credentials,
      methods: this.config.methods,
      allowedHeaders: this.config.allowedHeaders,
      exposedHeaders: this.config.exposedHeaders,
      maxAge: this.config.maxAge,
      preflightContinue: this.config.preflightContinue,
      hideOptionsRoute: true
    };
  }

  /**
   * Validate CORS configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.origins.length === 0) {
      errors.push('At least one origin must be specified');
    }

    // Validate origin formats
    for (const origin of this.config.origins) {
      if (origin !== '*' && !origin.startsWith('http://') && !origin.startsWith('https://')) {
        errors.push(`Invalid origin format: ${origin}. Must start with http:// or https:// or be *`);
      }
    }

    if (this.config.maxAge < 0) {
      errors.push('CORS max-age must be non-negative');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): CorsConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<CorsConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Recompile origin patterns if origins changed
    if (updates.origins) {
      this.originPatterns = this.config.origins.map(origin => {
        if (origin === '*') {
          return /^.*$/;
        }
        const pattern = origin
          .replace(/\*/g, '.*')
          .replace(/\./g, '\\.');
        return new RegExp(`^${pattern}$`);
      });
    }
  }
}