/**
 * Authentication utilities for Task MCP stdio server
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface UserIdentity {
  id: string;
  type: 'local' | 'remote' | 'service' | 'ci';
  username?: string;
  email?: string;
  hostname?: string;
  sessionId?: string;
  token?: string;
  metadata?: Record<string, any>;
}

export interface AuthenticationContext {
  user: UserIdentity;
  timestamp: number;
  source: 'stdio' | 'http' | 'cli';
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticationResult {
  success: boolean;
  user?: UserIdentity;
  error?: string;
  code?: 'NO_AUTH' | 'INVALID_AUTH' | 'EXPIRED_AUTH' | 'FORBIDDEN';
}

/**
 * Authentication manager for handling user identity verification
 */
export class AuthenticationManager {
  private auditLogger: (event: any) => void;

  constructor(auditLogger: (event: any) => void) {
    this.auditLogger = auditLogger;
  }

  /**
   * Authenticate from local environment (development, CLI)
   */
  async authenticateLocal(context?: any): Promise<AuthenticationResult> {
    try {
      const user: UserIdentity = {
        id: `pid-${process.pid}@${os.hostname()}`,
        type: 'local',
        username: process.env.USER || process.env.USERNAME || 'unknown',
        hostname: os.hostname(),
        metadata: {
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
          cwd: process.cwd()
        }
      };

      // Try to get more user information
      if (process.env.USER) {
        user.username = process.env.USER;
      }

      if (process.env.EMAIL) {
        user.email = process.env.EMAIL;
      }

      this.logAuthEvent('local_auth_success', { user, context });

      return {
        success: true,
        user
      };
    } catch (error) {
      this.logAuthEvent('local_auth_error', { error, context });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
        code: 'NO_AUTH'
      };
    }
  }

  /**
   * Authenticate from session token
   */
  async authenticateToken(token: string, context?: any): Promise<AuthenticationResult> {
    try {
      // Basic token validation - in production this would verify JWT or similar
      if (!token || token.length < 10) {
        this.logAuthEvent('token_auth_error', { error: 'Invalid token format', tokenPrefix: token?.substring(0, 8), context });
        return {
          success: false,
          error: 'Invalid token format',
          code: 'INVALID_AUTH'
        };
      }

      // Extract user info from token (simplified for demo)
      const user: UserIdentity = {
        id: `token-${token.substring(0, 16)}`,
        type: 'remote',
        token: token.substring(0, 16), // Store only prefix for security
        sessionId: this.generateSessionId(),
        metadata: {
          authMethod: 'token',
          tokenPrefix: token.substring(0, 8)
        }
      };

      this.logAuthEvent('token_auth_success', { user, tokenPrefix: token.substring(0, 8), context });

      return {
        success: true,
        user
      };
    } catch (error) {
      this.logAuthEvent('token_auth_error', { error, tokenPrefix: token?.substring(0, 8), context });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token authentication failed',
        code: 'INVALID_AUTH'
      };
    }
  }

  /**
   * Authenticate CI/automated process
   */
  async authenticateCI(context?: any): Promise<AuthenticationResult> {
    try {
      const ciSystem = process.env.CI_SYSTEM || 'unknown';
      const runId = process.env.CI_RUN_ID || Date.now().toString();

      const user: UserIdentity = {
        id: `ci-${ciSystem}-${runId}`,
        type: 'ci',
        username: `ci-${ciSystem}`,
        metadata: {
          ciSystem,
          runId,
          ci: true,
          automated: true,
          // Common CI environment variables
          githubActions: !!process.env.GITHUB_ACTIONS,
          gitlabCI: !!process.env.GITLAB_CI,
          jenkins: !!process.env.JENKINS_URL,
          travis: !!process.env.TRAVIS,
          circleci: !!process.env.CIRCLECI
        }
      };

      this.logAuthEvent('ci_auth_success', { user, context });

      return {
        success: true,
        user
      };
    } catch (error) {
      this.logAuthEvent('ci_auth_error', { error, context });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'CI authentication failed',
        code: 'NO_AUTH'
      };
    }
  }

  /**
   * Create authentication context from request
   */
  async createAuthContext(request: any, source: AuthenticationContext['source'] = 'stdio'): Promise<AuthenticationContext | null> {
    let authResult: AuthenticationResult;

    // Determine authentication method based on request first, then environment
    if (request?.token || request?.authorization) {
      const token = request.token || request.authorization?.replace('Bearer ', '');
      authResult = await this.authenticateToken(token, request);
    } else if (request?.forceCI || (process.env.CI && !request?.forceLocal)) {
      authResult = await this.authenticateCI(request);
    } else {
      authResult = await this.authenticateLocal(request);
    }

    if (!authResult.success || !authResult.user) {
      this.logAuthEvent('auth_failed', { request, source, error: authResult.error });
      return null;
    }

    const context: AuthenticationContext = {
      user: authResult.user,
      timestamp: Date.now(),
      source,
      ipAddress: request?.ipAddress,
      userAgent: request?.userAgent
    };

    this.logAuthEvent('context_created', { context });

    return context;
  }

  /**
   * Validate authentication context is still valid
   */
  validateAuthContext(context: AuthenticationContext): boolean {
    // Check if context is not expired (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in ms
    const age = Date.now() - context.timestamp;
    
    if (age > maxAge) {
      this.logAuthEvent('context_expired', { context, age });
      return false;
    }

    return true;
  }

  /**
   * Extract user identity from lock file owner format
   */
  extractUserFromLockOwner(lockOwner: string): UserIdentity | null {
    try {
      // Parse lock owner formats:
      // - "pid-12345@hostname" (local)
      // - "user-john@session-abc123" (multi-user)
      // - "token-eyJhbGciOiJIUzI1NiIs" (remote)
      // - "ci-pipeline-gh-456" (CI)

      if (lockOwner.startsWith('pid-')) {
        const match = lockOwner.match(/pid-(\d+)@(.+)/);
        if (match) {
          return {
            id: lockOwner,
            type: 'local',
            username: process.env.USER || 'unknown',
            hostname: match[2],
            metadata: { pid: parseInt(match[1]) }
          };
        }
      } else if (lockOwner.startsWith('user-')) {
        const match = lockOwner.match(/user-([^@]+)@session-(.+)/);
        if (match) {
          return {
            id: lockOwner,
            type: 'remote',
            username: match[1],
            sessionId: match[2],
            metadata: { multiUser: true }
          };
        }
      } else if (lockOwner.startsWith('token-')) {
        return {
          id: lockOwner,
          type: 'remote',
          token: lockOwner,
          metadata: { authMethod: 'token' }
        };
      } else if (lockOwner.startsWith('ci-')) {
        return {
          id: lockOwner,
          type: 'ci',
          username: lockOwner,
          metadata: { automated: true }
        };
      }

      return null;
    } catch (error) {
      this.logAuthEvent('lock_owner_parse_error', { lockOwner, error });
      return null;
    }
  }

  /**
   * Generate a session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Log authentication events
   */
  private logAuthEvent(event: string, data: any): void {
    this.auditLogger({
      type: 'auth_event',
      event,
      timestamp: Date.now(),
      data
    });
  }
}