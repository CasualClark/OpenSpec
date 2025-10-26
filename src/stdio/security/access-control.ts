/**
 * Access control decision engine for Task MCP stdio server
 */

import { UserIdentity } from './auth.js';
import { AuthorizationEngine, AuthorizationDecision, ResourceOwnership } from './authorization.js';

export interface AccessControlContext {
  user: UserIdentity;
  resource: string;
  action: 'read' | 'write' | 'delete' | 'list';
  resourcePath?: string;
  metadata?: Record<string, any>;
}

export interface AccessControlResult {
  allowed: boolean;
  decision: AuthorizationDecision;
  context: AccessControlContext;
  performance: {
    decisionTime: number;
    checksPerformed: number;
  };
}

export interface AccessControlPolicy {
  name: string;
  description: string;
  rules: Array<{
    name: string;
    priority: number;
    condition: string;
    effect: 'allow' | 'deny';
    requirements?: string[];
  }>;
}

/**
 * Access control decision engine with caching and performance optimization
 */
export class AccessControlEngine {
  private authorizationEngine: AuthorizationEngine;
  private auditLogger: (event: any) => void;
  private decisionCache: Map<string, { result: AccessControlResult; timestamp: number }>;
  private cacheTimeout: number;
  private metrics: {
    totalRequests: number;
    cacheHits: number;
    averageDecisionTime: number;
  };

  constructor(authorizationEngine: AuthorizationEngine, auditLogger: (event: any) => void) {
    this.authorizationEngine = authorizationEngine;
    this.auditLogger = auditLogger;
    this.decisionCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      averageDecisionTime: 0
    };
  }

  /**
   * Make an access control decision
   */
  async decide(context: AccessControlContext): Promise<AccessControlResult> {
    const startTime = performance.now();
    this.metrics.totalRequests++;

    try {
      // Validate resource scheme
      const validSchemes = ['changes', 'change', 'proposal', 'task', 'delta'];
      const resourceScheme = context.resource.split('://')[0];
      if (!validSchemes.includes(resourceScheme)) {
        const decision: AuthorizationDecision = {
          allowed: false,
          reason: 'Access control error: Invalid resource scheme',
          code: 'DENIED'
        };
        
        const result: AccessControlResult = {
          allowed: false,
          decision,
          context,
          performance: {
            decisionTime: performance.now() - startTime,
            checksPerformed: 0
          }
        };
        
        this.logAccessEvent('access_denied', { context, reason: 'Invalid resource scheme' });
        return result;
      }

      // Check cache first
      const cacheKey = this.generateCacheKey(context);
      const cached = this.decisionCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        this.metrics.cacheHits++;
        this.logAccessEvent('cache_hit', { context, cacheKey });
        return {
          ...cached.result,
          performance: {
            ...cached.result.performance,
            decisionTime: performance.now() - startTime
          }
        };
      }

      // Get resource ownership
      let ownership: ResourceOwnership | null = null;
      if (context.resourcePath) {
        ownership = await this.authorizationEngine.getResourceOwnership(context.resourcePath);
      }

      // Make authorization decision
      const decision = await this.authorizationEngine.checkAccess(
        context.user,
        context.resource,
        context.action,
        {
          resourcePath: context.resourcePath,
          ownership: ownership || undefined,
          ...context.metadata
        }
      );

      const result: AccessControlResult = {
        allowed: decision.allowed,
        decision,
        context,
        performance: {
          decisionTime: Date.now() - startTime,
          checksPerformed: 1 // Simplified for now
        }
      };

      // Cache the result
      this.decisionCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      // Update metrics
      this.updateMetrics(result.performance.decisionTime);

      // Log the decision
      this.logAccessEvent('decision_made', { context, result, ownership });

      return result;

    } catch (error) {
      const errorResult: AccessControlResult = {
        allowed: false,
        decision: {
          allowed: false,
          reason: `Access control error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'DENIED'
        },
        context,
        performance: {
          decisionTime: Date.now() - startTime,
          checksPerformed: 0
        }
      };

      this.logAccessEvent('decision_error', { context, error, result: errorResult });
      return errorResult;
    }
  }

  /**
   * Check if access is allowed (convenience method)
   */
  async isAllowed(
    user: UserIdentity,
    resource: string,
    action: AccessControlContext['action'],
    resourcePath?: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    const context: AccessControlContext = {
      user,
      resource,
      action,
      resourcePath,
      metadata
    };

    const result = await this.decide(context);
    return result.allowed;
  }

  /**
   * Enforce access control - throws if not allowed
   */
  async enforce(
    user: UserIdentity,
    resource: string,
    action: AccessControlContext['action'],
    resourcePath?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const context: AccessControlContext = {
      user,
      resource,
      action,
      resourcePath,
      metadata
    };

    const result = await this.decide(context);
    
    if (!result.allowed) {
      const error = new Error(`Access denied: ${result.decision.reason}`);
      (error as any).code = result.decision.code;
      (error as any).context = context;
      (error as any).decision = result.decision;
      throw error;
    }
  }

  /**
   * Batch access control checks
   */
  async batchDecide(contexts: AccessControlContext[]): Promise<AccessControlResult[]> {
    const startTime = Date.now();
    
    try {
      // Process in parallel for better performance
      const results = await Promise.all(
        contexts.map(context => this.decide(context))
      );

      this.logAccessEvent('batch_decision', { 
        count: contexts.length, 
        totalTime: Date.now() - startTime 
      });

      return results;
    } catch (error) {
      this.logAccessEvent('batch_decision_error', { 
        contexts, 
        error, 
        totalTime: Date.now() - startTime 
      });
      throw error;
    }
  }

  /**
   * Clear the decision cache
   */
  clearCache(): void {
    this.decisionCache.clear();
    this.logAccessEvent('cache_cleared', {});
  }

  /**
   * Get access control metrics
   */
  getMetrics(): typeof this.metrics & {
    cacheSize: number;
    cacheHitRate: number;
  } {
    return {
      ...this.metrics,
      cacheSize: this.decisionCache.size,
      cacheHitRate: this.metrics.totalRequests > 0 
        ? (this.metrics.cacheHits / this.metrics.totalRequests) * 100 
        : 0
    };
  }

  /**
   * Pre-warm cache with common access patterns
   */
  async preWarmCache(commonContexts: AccessControlContext[]): Promise<void> {
    try {
      await this.batchDecide(commonContexts);
      this.logAccessEvent('cache_prewarmed', { count: commonContexts.length });
    } catch (error) {
      this.logAccessEvent('cache_prewarm_error', { contexts: commonContexts, error });
    }
  }

  /**
   * Generate cache key from context
   */
  private generateCacheKey(context: AccessControlContext): string {
    const keyData = {
      userId: context.user.id,
      resource: context.resource,
      action: context.action,
      resourcePath: context.resourcePath,
      // Include relevant metadata that affects decisions
      userTeams: context.user.metadata?.teams || [],
      userRoles: context.user.metadata?.roles || [],
      userType: context.user.type
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(decisionTime: number): void {
    const total = this.metrics.totalRequests;
    const current = this.metrics.averageDecisionTime;
    
    // Calculate running average
    this.metrics.averageDecisionTime = ((current * (total - 1)) + decisionTime) / total;
  }

  /**
   * Log access control events
   */
  private logAccessEvent(event: string, data: any): void {
    this.auditLogger({
      type: 'access_control_event',
      event,
      timestamp: Date.now(),
      data: {
        ...data,
        metrics: this.getMetrics()
      }
    });
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.decisionCache.entries()) {
      if (now - entry.timestamp > this.cacheTimeout) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.decisionCache.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.logAccessEvent('cache_cleanup', { expiredCount: expiredKeys.length });
    }
  }
}

/**
 * Default access control policies
 */
export const DEFAULT_POLICIES: AccessControlPolicy[] = [
  {
    name: 'public-read-changes',
    description: 'Allow public read access to changes collection',
    rules: [
      {
        name: 'public-changes-list',
        priority: 100,
        condition: 'resource == "changes://" && action == "read"',
        effect: 'allow'
      }
    ]
  },
  {
    name: 'owner-based-access',
    description: 'Allow owners to access their own resources',
    rules: [
      {
        name: 'owner-resource-access',
        priority: 200,
        condition: 'user.owns(resource)',
        effect: 'allow',
        requirements: ['ownership_verification']
      }
    ]
  },
  {
    name: 'admin-override',
    description: 'Allow administrators to access all resources',
    rules: [
      {
        name: 'admin-full-access',
        priority: 300,
        condition: 'user.isAdmin()',
        effect: 'allow'
      }
    ]
  }
];