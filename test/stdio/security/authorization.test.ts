/**
 * Tests for AuthorizationEngine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthorizationEngine, ResourceOwnership } from '../../../src/stdio/security/authorization.js';
import { UserIdentity } from '../../../src/stdio/security/auth.js';

describe('AuthorizationEngine', () => {
  let authEngine: AuthorizationEngine;
  let auditEvents: any[] = [];

  beforeEach(() => {
    auditEvents = [];
    authEngine = new AuthorizationEngine((event) => {
      auditEvents.push(event);
    });
  });

  describe('checkAccess', () => {
    it('should allow public read access to changes collection', async () => {
      const user: UserIdentity = {
        id: 'test-user',
        type: 'local'
      };

      const result = await authEngine.checkAccess(user, 'changes://', 'read');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Resource is public');
      expect(result.code).toBe('ALLOWED');
    });

    it('should allow authenticated write access to changes collection', async () => {
      const user: UserIdentity = {
        id: 'test-user',
        type: 'local'
      };

      const result = await authEngine.checkAccess(user, 'changes://', 'write');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('User is authenticated');
      expect(result.code).toBe('ALLOWED');
    });

    it('should allow owner access to their resources', async () => {
      const user: UserIdentity = {
        id: 'pid-12345@hostname',
        type: 'local',
        username: 'testuser'
      };

      const ownership: ResourceOwnership = {
        owner: 'pid-12345@hostname',
        collaborators: [],
        isPublic: false
      };

      const result = await authEngine.checkAccess(
        user, 
        'proposal://my-change', 
        'read',
        { ownership }
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('User is the resource owner');
      expect(result.code).toBe('ALLOWED');
    });

    it('should deny non-owner access to private resources', async () => {
      const user: UserIdentity = {
        id: 'pid-67890@hostname',
        type: 'local',
        username: 'otheruser'
      };

      const ownership: ResourceOwnership = {
        owner: 'pid-12345@hostname',
        collaborators: [],
        isPublic: false
      };

      const result = await authEngine.checkAccess(
        user, 
        'proposal://my-change', 
        'read',
        { ownership }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Resource ownership required');
      expect(result.code).toBe('OWNER_REQUIRED');
    });

    it('should allow admin access to all resources', async () => {
      const user: UserIdentity = {
        id: 'admin-user',
        type: 'local',
        username: 'admin',
        metadata: { admin: true }
      };

      const ownership: ResourceOwnership = {
        owner: 'other-user',
        collaborators: [],
        isPublic: false
      };

      const result = await authEngine.checkAccess(
        user, 
        'proposal://my-change', 
        'read',
        { ownership }
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('User has administrator privileges');
      expect(result.code).toBe('ALLOWED');
    });

    it('should allow CI processes admin access', async () => {
      const user: UserIdentity = {
        id: 'ci-github-actions-run-123',
        type: 'ci'
      };

      const ownership: ResourceOwnership = {
        owner: 'other-user',
        collaborators: [],
        isPublic: false
      };

      const result = await authEngine.checkAccess(
        user, 
        'task://my-change', 
        'read',
        { ownership }
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('User has administrator privileges');
      expect(result.code).toBe('ALLOWED');
    });
  });

  describe('getResourceOwnership', () => {
    beforeEach(() => {
      vi.mock('fs', () => ({
        promises: {
          readFile: vi.fn(),
          stat: vi.fn()
        }
      }));
    });

    it('should extract ownership from lock file', async () => {
      const { promises: fs } = await import('fs');
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        owner: 'pid-12345@hostname',
        since: '2025-10-23T14:30:00.000Z',
        ttl: 3600,
        metadata: {
          hostname: 'test-host',
          process_id: 12345
        }
      }));

      const ownership = await authEngine.getResourceOwnership('/path/to/change');

      expect(ownership).toEqual({
        owner: 'pid-12345@hostname',
        collaborators: [],
        isPublic: false,
        metadata: {
          hostname: 'test-host',
          process_id: 12345
        }
      });
    });

    it('should return public ownership for changes collection', async () => {
      const ownership = await authEngine.getResourceOwnership('/path/to/changes');

      expect(ownership).toEqual({
        owner: 'system',
        collaborators: [],
        isPublic: true,
        metadata: { 
          default: true, 
          type: 'changes-collection' 
        }
      });
    });

    it('should return null when no ownership information found', async () => {
      const { promises: fs } = await import('fs');
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('File not found'));

      const ownership = await authEngine.getResourceOwnership('/path/to/unknown');

      expect(ownership).toBeNull();
    });
  });

  describe('isOwner', () => {
    it('should identify direct ownership match', () => {
      const user: UserIdentity = {
        id: 'pid-12345@hostname',
        type: 'local'
      };

      const ownership: ResourceOwnership = {
        owner: 'pid-12345@hostname',
        collaborators: [],
        isPublic: false
      };

      expect(authEngine.isOwner(user, ownership)).toBe(true);
    });

    it('should identify username match for local users', () => {
      const user: UserIdentity = {
        id: 'pid-12345@hostname',
        type: 'local',
        username: 'testuser'
      };

      const ownership: ResourceOwnership = {
        owner: 'testuser-some-other-info',
        collaborators: [],
        isPublic: false
      };

      expect(authEngine.isOwner(user, ownership)).toBe(true);
    });

    it('should identify session match', () => {
      const user: UserIdentity = {
        id: 'user-john@session-abc123',
        type: 'remote',
        sessionId: 'abc123'
      };

      const ownership: ResourceOwnership = {
        owner: 'user-john@session-abc123',
        collaborators: [],
        isPublic: false
      };

      expect(authEngine.isOwner(user, ownership)).toBe(true);
    });

    it('should reject non-owners', () => {
      const user: UserIdentity = {
        id: 'pid-67890@hostname',
        type: 'local',
        username: 'otheruser'
      };

      const ownership: ResourceOwnership = {
        owner: 'pid-12345@hostname',
        collaborators: [],
        isPublic: false
      };

      expect(authEngine.isOwner(user, ownership)).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should identify admin users', () => {
      const user: UserIdentity = {
        id: 'admin-user',
        type: 'local',
        metadata: { admin: true }
      };

      expect(authEngine.isAdmin(user)).toBe(true);
    });

    it('should identify users with admin roles', () => {
      const user: UserIdentity = {
        id: 'role-admin-user',
        type: 'local',
        metadata: { roles: ['user', 'admin'] }
      };

      expect(authEngine.isAdmin(user)).toBe(true);
    });

    it('should identify CI processes as admins', () => {
      const user: UserIdentity = {
        id: 'ci-github-actions-run-123',
        type: 'ci'
      };

      expect(authEngine.isAdmin(user)).toBe(true);
    });

    it('should identify local admin users from environment', () => {
      const originalUser = process.env.USER;
      const originalAdmins = process.env.OPENSPEC_ADMINS;
      
      process.env.USER = 'testuser';
      process.env.OPENSPEC_ADMINS = 'admin,root,testuser';

      const user: UserIdentity = {
        id: 'local-test-user',
        type: 'local',
        username: 'testuser'
      };

      expect(authEngine.isAdmin(user)).toBe(true);

      process.env.USER = originalUser;
      process.env.OPENSPEC_ADMINS = originalAdmins;
    });

    it('should reject non-admin users', () => {
      const user: UserIdentity = {
        id: 'regular-user',
        type: 'local',
        username: 'normaluser'
      };

      expect(authEngine.isAdmin(user)).toBe(false);
    });
  });

  describe('isTeamMember', () => {
    it('should identify team membership from metadata', () => {
      const user: UserIdentity = {
        id: 'team-user',
        type: 'local',
        metadata: { teams: ['dev-team', 'backend-team'] }
      };

      expect(authEngine.isTeamMember(user, ['dev-team'])).toBe(true);
      expect(authEngine.isTeamMember(user, ['frontend-team'])).toBe(false);
      expect(authEngine.isTeamMember(user, ['backend-team'])).toBe(true);
    });

    it('should identify team membership from username', () => {
      const user: UserIdentity = {
        id: 'username-user',
        type: 'local',
        username: 'john'
      };

      expect(authEngine.isTeamMember(user, ['john'])).toBe(true);
      expect(authEngine.isTeamMember(user, ['jane'])).toBe(false);
    });

    it('should identify team membership from email domain', () => {
      const user: UserIdentity = {
        id: 'email-user',
        type: 'remote',
        email: 'john@company.com'
      };

      expect(authEngine.isTeamMember(user, ['company.com'])).toBe(true);
      expect(authEngine.isTeamMember(user, ['other.com'])).toBe(false);
    });

    it('should handle empty team list', () => {
      const user: UserIdentity = {
        id: 'any-user',
        type: 'local'
      };

      expect(authEngine.isTeamMember(user, [])).toBe(false);
      expect(authEngine.isTeamMember(user, undefined as any)).toBe(false);
    });
  });
});