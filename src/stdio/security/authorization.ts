/**
 * Authorization engine for Task MCP stdio server
 */

import { UserIdentity, AuthenticationContext } from './auth.js';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface ResourceAccessRule {
  resource: string;
  action: 'read' | 'write' | 'delete' | 'list';
  condition: 'owner' | 'public' | 'team' | 'admin' | 'authenticated';
  team?: string[];
  adminRoles?: string[];
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
  code: 'ALLOWED' | 'DENIED' | 'OWNER_REQUIRED' | 'ADMIN_REQUIRED' | 'TEAM_REQUIRED' | 'AUTH_REQUIRED';
  metadata?: Record<string, any>;
}

export interface ResourceOwnership {
  owner: string;
  collaborators: string[];
  team?: string;
  isPublic: boolean;
  metadata?: Record<string, any>;
}

/**
 * Authorization engine for managing access control decisions
 */
export class AuthorizationEngine {
  private auditLogger: (event: any) => void;
  private defaultRules: ResourceAccessRule[];

  constructor(auditLogger: (event: any) => void) {
    this.auditLogger = auditLogger;
    this.defaultRules = this.getDefaultRules();
  }

  /**
   * Check if user is authorized to access a resource
   */
  async checkAccess(
    user: UserIdentity,
    resource: string,
    action: ResourceAccessRule['action'],
    context?: {
      resourcePath?: string;
      ownership?: ResourceOwnership;
      lockInfo?: any;
    }
  ): Promise<AuthorizationDecision> {
    try {
      // Get applicable rules for this resource and action
      const rules = this.getApplicableRules(resource, action);
      
      // Check each rule in order
      let denyDecisions: AuthorizationDecision[] = [];
      for (const rule of rules) {
        const decision = await this.evaluateRule(user, rule, context);
        if (decision.allowed) {
          this.logAuthzEvent('access_allowed', { user, resource, action, rule, decision });
          return decision;
        }
        denyDecisions.push(decision);
      }

      // Choose the most specific deny decision
      // Priority: OWNER_REQUIRED > TEAM_REQUIRED > ADMIN_REQUIRED > AUTH_REQUIRED > DENIED
      const priorityOrder = ['OWNER_REQUIRED', 'TEAM_REQUIRED', 'ADMIN_REQUIRED', 'AUTH_REQUIRED', 'DENIED'];
      let selectedDecision = denyDecisions[0] || {
        allowed: false,
        reason: 'No applicable authorization rule found',
        code: 'DENIED'
      };

      for (const decision of denyDecisions) {
        const currentIndex = priorityOrder.indexOf(decision.code);
        const selectedIndex = priorityOrder.indexOf(selectedDecision.code);
        if (currentIndex < selectedIndex) {
          selectedDecision = decision;
        }
      }

      this.logAuthzEvent('access_denied', { user, resource, action, decision: selectedDecision });
      return selectedDecision;

    } catch (error) {
      const decision: AuthorizationDecision = {
        allowed: false,
        reason: `Authorization error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: 'DENIED'
      };

      this.logAuthzEvent('authz_error', { user, resource, action, error, decision });
      return decision;
    }
  }

  /**
   * Get resource ownership information
   */
  async getResourceOwnership(resourcePath: string, context?: any): Promise<ResourceOwnership | null> {
    try {
      // Check if resource has a lock file
      const lockPath = path.join(resourcePath, '.lock');
      let lockInfo = null;

      try {
        const lockContent = await fs.readFile(lockPath, 'utf-8');
        lockInfo = JSON.parse(lockContent);
      } catch {
        // No lock file
      }

      // Extract ownership from lock or default to public
      if (lockInfo?.owner) {
        return {
          owner: lockInfo.owner,
          collaborators: lockInfo.metadata?.collaborators || [],
          team: lockInfo.metadata?.team,
          isPublic: lockInfo.metadata?.public || false,
          metadata: lockInfo.metadata
        };
      }

      // Check for ownership metadata file
      const ownershipPath = path.join(resourcePath, '.ownership');
      try {
        const ownershipContent = await fs.readFile(ownershipPath, 'utf-8');
        const ownershipData = JSON.parse(ownershipContent);
        return ownershipData as ResourceOwnership;
      } catch {
        // No ownership file
      }

      // Default ownership - public read access for changes collection
      if (resourcePath.includes('changes') && !resourcePath.includes('changes/')) {
        return {
          owner: 'system',
          collaborators: [],
          isPublic: true,
          metadata: { default: true, type: 'changes-collection' }
        };
      }

      return null;

    } catch (error) {
      this.logAuthzEvent('ownership_error', { resourcePath, error });
      return null;
    }
  }

  /**
   * Check if user is the owner of a resource
   */
  isOwner(user: UserIdentity, ownership: ResourceOwnership): boolean {
    // Direct ownership match
    if (ownership.owner === user.id) {
      return true;
    }

    // Check for username match (for local users)
    if (user.type === 'local' && ownership.owner.includes(user.username || '')) {
      return true;
    }

    // Check for session match
    if (user.sessionId && ownership.owner.includes(user.sessionId)) {
      return true;
    }

    return false;
  }

  /**
   * Check if user is an administrator
   */
  isAdmin(user: UserIdentity): boolean {
    // Environment-based admin detection
    if (user.metadata?.admin === true) {
      return true;
    }

    // CI processes have admin privileges for automated operations
    if (user.type === 'ci') {
      return true;
    }

    // Check for admin groups or roles
    if (user.metadata?.roles?.includes('admin')) {
      return true;
    }

    // Local development - check environment variable for admin users
    if (user.type === 'local' && user.username) {
      const adminUsers = process.env.OPENSPEC_ADMINS?.split(',') || ['root', 'admin'];
      return adminUsers.includes(user.username);
    }

    return false;
  }

  /**
   * Check if user is part of a team
   */
  isTeamMember(user: UserIdentity, team: string[]): boolean {
    if (!team || team.length === 0) {
      return false;
    }

    // Check user's teams
    const userTeams = user.metadata?.teams || [];
    for (const teamName of team) {
      if (userTeams.includes(teamName)) {
        return true;
      }
    }

    // Check username against team names
    if (user.username && team.includes(user.username)) {
      return true;
    }

    // Check email domain for team membership
    if (user.email) {
      const domain = user.email.split('@')[1];
      if (team.includes(domain)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get applicable rules for a resource and action
   */
  private getApplicableRules(resource: string, action: ResourceAccessRule['action']): ResourceAccessRule[] {
    return this.defaultRules.filter(rule => {
      // First check action matches
      if (rule.action !== action) {
        return false;
      }

      // Exact match
      if (rule.resource === resource) {
        return true;
      }

      // Pattern match with wildcards
      if (rule.resource.includes('*')) {
        const regex = new RegExp(rule.resource.replace(/\*/g, '.*'));
        return regex.test(resource);
      }

      // Prefix match (only for non-wildcard rules)
      if (resource.startsWith(rule.resource)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Evaluate a specific authorization rule
   */
  private async evaluateRule(
    user: UserIdentity,
    rule: ResourceAccessRule,
    context?: {
      resourcePath?: string;
      ownership?: ResourceOwnership;
      lockInfo?: any;
    }
  ): Promise<AuthorizationDecision> {
    switch (rule.condition) {
      case 'public':
        return {
          allowed: true,
          reason: 'Resource is public',
          code: 'ALLOWED'
        };

      case 'authenticated':
        return {
          allowed: true,
          reason: 'User is authenticated',
          code: 'ALLOWED'
        };

      case 'admin':
        if (this.isAdmin(user)) {
          return {
            allowed: true,
            reason: 'User has administrator privileges',
            code: 'ALLOWED'
          };
        }
        return {
          allowed: false,
          reason: 'Administrator privileges required',
          code: 'ADMIN_REQUIRED'
        };

      case 'owner':
        if (context?.ownership && this.isOwner(user, context.ownership)) {
          return {
            allowed: true,
            reason: 'User is the resource owner',
            code: 'ALLOWED'
          };
        }
        return {
          allowed: false,
          reason: 'Resource ownership required',
          code: 'OWNER_REQUIRED'
        };

      case 'team':
        if (rule.team && this.isTeamMember(user, rule.team)) {
          return {
            allowed: true,
            reason: 'User is a team member',
            code: 'ALLOWED'
          };
        }
        return {
          allowed: false,
          reason: 'Team membership required',
          code: 'TEAM_REQUIRED'
        };

      default:
        return {
          allowed: false,
          reason: `Unknown authorization condition: ${rule.condition}`,
          code: 'DENIED'
        };
    }
  }

  /**
   * Get default authorization rules
   */
  private getDefaultRules(): ResourceAccessRule[] {
    return [
      // Changes collection - public read, authenticated write
      {
        resource: 'changes://',
        action: 'read',
        condition: 'public'
      },
      {
        resource: 'changes://',
        action: 'list',
        condition: 'public'
      },
      {
        resource: 'changes://',
        action: 'write',
        condition: 'authenticated'
      },

      // Individual change resources - owner-based access
      {
        resource: 'change://*',
        action: 'read',
        condition: 'owner'
      },
      {
        resource: 'change://*',
        action: 'write',
        condition: 'owner'
      },
      {
        resource: 'change://*',
        action: 'delete',
        condition: 'owner'
      },

      // Proposal resources - owner-based with team read access
      {
        resource: 'proposal://*',
        action: 'read',
        condition: 'owner'
      },
      {
        resource: 'proposal://*',
        action: 'write',
        condition: 'owner'
      },

      // Task resources - owner-based
      {
        resource: 'task://*',
        action: 'read',
        condition: 'owner'
      },
      {
        resource: 'task://*',
        action: 'write',
        condition: 'owner'
      },

      // Delta resources - owner-based
      {
        resource: 'delta://*',
        action: 'read',
        condition: 'owner'
      },
      {
        resource: 'delta://*',
        action: 'write',
        condition: 'owner'
      },

      // Admin override for all resources
      {
        resource: '*',
        action: 'read',
        condition: 'admin'
      },
      {
        resource: '*',
        action: 'write',
        condition: 'admin'
      },
      {
        resource: '*',
        action: 'delete',
        condition: 'admin'
      }
    ];
  }

  /**
   * Log authorization events
   */
  private logAuthzEvent(event: string, data: any): void {
    this.auditLogger({
      type: 'authz_event',
      event,
      timestamp: Date.now(),
      data
    });
  }
}