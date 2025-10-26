/**
 * Correlation ID management for request tracing
 */

import { randomUUID } from 'crypto';
import { CorrelationContext } from './types.js';

/**
 * Correlation ID manager for tracking requests across services
 */
export class CorrelationManager {
  private static instance: CorrelationManager;
  private contexts = new Map<string, CorrelationContext>();
  private currentContext?: CorrelationContext;

  private constructor() {}

  static getInstance(): CorrelationManager {
    if (!CorrelationManager.instance) {
      CorrelationManager.instance = new CorrelationManager();
    }
    return CorrelationManager.instance;
  }

  /**
   * Create a new correlation context
   */
  createContext(options: {
    correlationId?: string;
    requestId?: string;
    userId?: string;
    sessionId?: string;
    tags?: string[];
  } = {}): CorrelationContext {
    const correlationId = options.correlationId || randomUUID();
    
    const context: CorrelationContext = {
      correlationId,
      requestId: options.requestId,
      userId: options.userId,
      sessionId: options.sessionId,
      startTime: Date.now(),
      tags: options.tags || [],
    };

    this.contexts.set(correlationId, context);
    this.currentContext = context;

    return context;
  }

  /**
   * Get current correlation context
   */
  getCurrentContext(): CorrelationContext | undefined {
    return this.currentContext;
  }

  /**
   * Get correlation context by ID
   */
  getContext(correlationId: string): CorrelationContext | undefined {
    return this.contexts.get(correlationId);
  }

  /**
   * Set current correlation context
   */
  setCurrentContext(correlationId: string): void {
    const context = this.contexts.get(correlationId);
    if (context) {
      this.currentContext = context;
    }
  }

  /**
   * Clear current correlation context
   */
  clearCurrentContext(): void {
    this.currentContext = undefined;
  }

  /**
   * Update correlation context
   */
  updateContext(correlationId: string, updates: Partial<CorrelationContext>): void {
    const context = this.contexts.get(correlationId);
    if (context) {
      Object.assign(context, updates);
      
      // Update current context if it's the same
      if (this.currentContext?.correlationId === correlationId) {
        this.currentContext = context;
      }
    }
  }

  /**
   * Add tag to correlation context
   */
  addTag(correlationId: string, tag: string): void {
    const context = this.contexts.get(correlationId);
    if (context) {
      if (!context.tags) {
        context.tags = [];
      }
      context.tags.push(tag);
    }
  }

  /**
   * Remove tag from correlation context
   */
  removeTag(correlationId: string, tag: string): void {
    const context = this.contexts.get(correlationId);
    if (context?.tags) {
      const index = context.tags.indexOf(tag);
      if (index > -1) {
        context.tags.splice(index, 1);
      }
    }
  }

  /**
   * Get correlation duration
   */
  getDuration(correlationId: string): number {
    const context = this.contexts.get(correlationId);
    return context ? Date.now() - context.startTime : 0;
  }

  /**
   * Clean up old correlation contexts
   */
  cleanup(maxAgeMs: number = 3600000): void { // 1 hour default
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, context] of this.contexts) {
      if (now - context.startTime > maxAgeMs) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.contexts.delete(id);
      
      // Clear current context if it was deleted
      if (this.currentContext?.correlationId === id) {
        this.currentContext = undefined;
      }
    }
  }

  /**
   * Get all active correlation contexts
   */
  getAllContexts(): CorrelationContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Get correlation context statistics
   */
  getStats(): {
    totalContexts: number;
    averageDuration: number;
    oldestContextAge: number;
    contextsByTag: Record<string, number>;
  } {
    const contexts = Array.from(this.contexts.values());
    const now = Date.now();
    
    if (contexts.length === 0) {
      return {
        totalContexts: 0,
        averageDuration: 0,
        oldestContextAge: 0,
        contextsByTag: {},
      };
    }

    const durations = contexts.map(c => now - c.startTime);
    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const oldestContextAge = Math.max(...durations);

    const contextsByTag: Record<string, number> = {};
    for (const context of contexts) {
      if (context.tags) {
        for (const tag of context.tags) {
          contextsByTag[tag] = (contextsByTag[tag] || 0) + 1;
        }
      }
    }

    return {
      totalContexts: contexts.length,
      averageDuration,
      oldestContextAge,
      contextsByTag,
    };
  }

  /**
   * Extract correlation ID from headers
   */
  extractFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
    // Try common correlation ID headers
    const possibleHeaders = [
      'x-correlation-id',
      'x-request-id',
      'correlation-id',
      'request-id',
      'x-trace-id',
      'trace-id',
    ];

    for (const header of possibleHeaders) {
      const value = headers[header];
      if (typeof value === 'string' && value) {
        return value;
      }
      if (Array.isArray(value) && value.length > 0) {
        return value[0];
      }
    }

    return null;
  }

  /**
   * Generate correlation ID
   */
  generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Validate correlation ID format
   */
  isValidCorrelationId(id: string): boolean {
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }
}

/**
 * Middleware for Fastify to automatically manage correlation IDs
 */
export function correlationMiddleware(options: {
  headerName?: string;
  generateIfMissing?: boolean;
  addToResponse?: boolean;
} = {}) {
  const correlationManager = CorrelationManager.getInstance();
  const headerName = options.headerName || 'x-correlation-id';
  const generateIfMissing = options.generateIfMissing !== false;
  const addToResponse = options.addToResponse !== false;

  return async (request: any, reply: any) => {
    // Extract correlation ID from request headers
    let correlationId = correlationManager.extractFromHeaders(request.headers);

    // Generate new correlation ID if missing and enabled
    if (!correlationId && generateIfMissing) {
      correlationId = correlationManager.generateCorrelationId();
    }

    // Create correlation context
    if (correlationId) {
      const context = correlationManager.createContext({
        correlationId,
        requestId: request.id,
        userId: request.user?.id,
        sessionId: request.session?.id,
      });

      // Add correlation ID to response headers if enabled
      if (addToResponse) {
        reply.header(headerName, correlationId);
      }

      // Store context in request for later use
      request.correlationContext = context;
    }
  };
}

/**
 * Decorator to add correlation ID to Fastify instance
 */
export function correlationPlugin(fastify: any, options: any, done: () => void) {
  const correlationManager = CorrelationManager.getInstance();

  fastify.decorateRequest('correlationId', null);
  fastify.decorateRequest('correlationContext', null);

  fastify.addHook('preHandler', async (request: any, reply: any) => {
    const correlationId = correlationManager.extractFromHeaders(request.headers) ||
                         correlationManager.generateCorrelationId();

    request.correlationId = correlationId;
    request.correlationContext = correlationManager.createContext({
      correlationId,
      requestId: request.id,
    });

    reply.header('x-correlation-id', correlationId);
  });

  fastify.addHook('onResponse', async (request: any) => {
    // Clean up correlation context after response
    if (request.correlationId) {
      correlationManager.clearCurrentContext();
    }
  });

  done();
}