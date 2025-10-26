/**
 * Tests for AuthenticationManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthenticationManager, UserIdentity } from '../../../src/stdio/security/auth.js';

describe('AuthenticationManager', () => {
  let authManager: AuthenticationManager;
  let auditEvents: any[] = [];

  beforeEach(() => {
    auditEvents = [];
    authManager = new AuthenticationManager((event) => {
      auditEvents.push(event);
    });
  });

  describe('authenticateLocal', () => {
    it('should authenticate local user successfully', async () => {
      const result = await authManager.authenticateLocal();

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.type).toBe('local');
      expect(result.user?.id).toContain('pid-');
      expect(result.user?.id).toContain('@');
      expect(result.user?.hostname).toBeDefined();
      expect(result.user?.metadata?.pid).toBe(process.pid);
      expect(result.user?.metadata?.platform).toBe(process.platform);

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0].event).toBe('local_auth_success');
    });

    it('should include environment variables in user metadata', async () => {
      const originalUser = process.env.USER;
      const originalEmail = process.env.EMAIL;
      
      process.env.USER = 'testuser';
      process.env.EMAIL = 'test@example.com';

      const result = await authManager.authenticateLocal();

      expect(result.success).toBe(true);
      expect(result.user?.username).toBe('testuser');
      expect(result.user?.email).toBe('test@example.com');

      // Restore environment
      process.env.USER = originalUser;
      process.env.EMAIL = originalEmail;
    });
  });

  describe('authenticateToken', () => {
    it('should authenticate with valid token', async () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      
      const result = await authManager.authenticateToken(token);

      expect(result.success).toBe(true);
      expect(result.user?.type).toBe('remote');
      expect(result.user?.id).toBe('token-eyJhbGciOiJIUzI1');
      expect(result.user?.token).toBe('eyJhbGciOiJIUzI1');
      expect(result.user?.sessionId).toBeDefined();

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0].event).toBe('token_auth_success');
      expect(auditEvents[0].data.tokenPrefix).toBe('eyJhbGci');
    });

    it('should reject invalid token format', async () => {
      const result = await authManager.authenticateToken('short');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token format');
      expect(result.code).toBe('INVALID_AUTH');

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0].event).toBe('token_auth_error');
    });

    it('should reject empty token', async () => {
      const result = await authManager.authenticateToken('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token format');
      expect(result.code).toBe('INVALID_AUTH');
    });
  });

  describe('authenticateCI', () => {
    it('should authenticate CI process', async () => {
      const originalCI = process.env.CI;
      const originalSystem = process.env.CI_SYSTEM;
      const originalRunId = process.env.CI_RUN_ID;
      const originalGitHubActions = process.env.GITHUB_ACTIONS;
      
      process.env.CI = 'true';
      process.env.CI_SYSTEM = 'github-actions';
      process.env.CI_RUN_ID = 'run-123';
      process.env.GITHUB_ACTIONS = 'true';

      const result = await authManager.authenticateCI();

      expect(result.success).toBe(true);
      expect(result.user?.type).toBe('ci');
      expect(result.user?.id).toBe('ci-github-actions-run-123');
      expect(result.user?.username).toBe('ci-github-actions');
      expect(result.user?.metadata?.ciSystem).toBe('github-actions');
      expect(result.user?.metadata?.runId).toBe('run-123');
      expect(result.user?.metadata?.githubActions).toBe(true);

      // Restore environment
      process.env.CI = originalCI;
      process.env.CI_SYSTEM = originalSystem;
      process.env.CI_RUN_ID = originalRunId;
      process.env.GITHUB_ACTIONS = originalGitHubActions;
    });

    it('should work without CI environment variables', async () => {
      const originalCI = process.env.CI;
      const originalSystem = process.env.CI_SYSTEM;
      const originalRunId = process.env.CI_RUN_ID;
      const originalGitHubActions = process.env.GITHUB_ACTIONS;
      const originalGitlabCI = process.env.GITLAB_CI;
      const originalJenkins = process.env.JENKINS_URL;
      const originalTravis = process.env.TRAVIS;
      const originalCircleCI = process.env.CIRCLECI;
      
      // Clear all CI environment variables
      delete process.env.CI;
      delete process.env.CI_SYSTEM;
      delete process.env.CI_RUN_ID;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;
      delete process.env.TRAVIS;
      delete process.env.CIRCLECI;

      const result = await authManager.authenticateCI();

      expect(result.success).toBe(true);
      expect(result.user?.type).toBe('ci');
      expect(result.user?.id).toContain('ci-unknown-');

      // Restore environment
      process.env.CI = originalCI;
      process.env.CI_SYSTEM = originalSystem;
      process.env.CI_RUN_ID = originalRunId;
      process.env.GITHUB_ACTIONS = originalGitHubActions;
      process.env.GITLAB_CI = originalGitlabCI;
      process.env.JENKINS_URL = originalJenkins;
      process.env.TRAVIS = originalTravis;
      process.env.CIRCLECI = originalCircleCI;
    });
  });

  describe('createAuthContext', () => {
    it('should create context for local request', async () => {
      // Clear CI environment to force local authentication
      const originalCI = process.env.CI;
      const originalGitHubActions = process.env.GITHUB_ACTIONS;
      const originalGitlabCI = process.env.GITLAB_CI;
      
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;

      const request = { source: 'stdio' };
      const context = await authManager.createAuthContext(request, 'stdio');

      expect(context).toBeDefined();
      expect(context?.user.type).toBe('local');
      expect(context?.source).toBe('stdio');
      expect(context?.timestamp).toBeDefined();

      // Restore environment
      process.env.CI = originalCI;
      process.env.GITHUB_ACTIONS = originalGitHubActions;
      process.env.GITLAB_CI = originalGitlabCI;
    });

    it('should create context for token request', async () => {
      const request = { 
        token: 'valid-token-12345678901234567890',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent'
      };
      const context = await authManager.createAuthContext(request, 'http');

      expect(context).toBeDefined();
      expect(context?.user.type).toBe('remote');
      expect(context?.source).toBe('http');
      expect(context?.ipAddress).toBe('192.168.1.1');
      expect(context?.userAgent).toBe('test-agent');
    });

    it('should prioritize CI authentication when CI environment detected', async () => {
      const originalCI = process.env.CI;
      process.env.CI = 'true';
      
      const request = { source: 'stdio' };
      const context = await authManager.createAuthContext(request, 'stdio');

      expect(context?.user.type).toBe('ci');

      process.env.CI = originalCI;
    });

    it('should return null for failed authentication', async () => {
      const request = { token: 'invalid' };
      const context = await authManager.createAuthContext(request, 'http');

      expect(context).toBeNull();
      expect(auditEvents).toHaveLength(2);
      expect(auditEvents[0].event).toBe('token_auth_error');
      expect(auditEvents[1].event).toBe('auth_failed');
    });
  });

  describe('validateAuthContext', () => {
    it('should validate fresh context', async () => {
      const user: UserIdentity = {
        id: 'test-user',
        type: 'local'
      };
      const context = {
        user,
        timestamp: Date.now(),
        source: 'stdio' as const
      };

      const isValid = authManager.validateAuthContext(context);
      expect(isValid).toBe(true);
    });

    it('should reject expired context', async () => {
      const user: UserIdentity = {
        id: 'test-user',
        type: 'local'
      };
      const context = {
        user,
        timestamp: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
        source: 'stdio' as const
      };

      const isValid = authManager.validateAuthContext(context);
      expect(isValid).toBe(false);

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0].event).toBe('context_expired');
    });
  });

  describe('extractUserFromLockOwner', () => {
    it('should extract user from local lock format', () => {
      const lockOwner = 'pid-12345@hostname';
      const user = authManager.extractUserFromLockOwner(lockOwner);

      expect(user).toBeDefined();
      expect(user?.type).toBe('local');
      expect(user?.id).toBe(lockOwner);
      expect(user?.hostname).toBe('hostname');
      expect(user?.metadata?.pid).toBe(12345);
    });

    it('should extract user from multi-user lock format', () => {
      const lockOwner = 'user-john@session-abc123';
      const user = authManager.extractUserFromLockOwner(lockOwner);

      expect(user).toBeDefined();
      expect(user?.type).toBe('remote');
      expect(user?.id).toBe(lockOwner);
      expect(user?.username).toBe('john');
      expect(user?.sessionId).toBe('abc123');
      expect(user?.metadata?.multiUser).toBe(true);
    });

    it('should extract user from token lock format', () => {
      const lockOwner = 'token-eyJhbGciOiJIUzI1NiIs';
      const user = authManager.extractUserFromLockOwner(lockOwner);

      expect(user).toBeDefined();
      expect(user?.type).toBe('remote');
      expect(user?.id).toBe(lockOwner);
      expect(user?.token).toBe(lockOwner);
      expect(user?.metadata?.authMethod).toBe('token');
    });

    it('should extract user from CI lock format', () => {
      const lockOwner = 'ci-pipeline-gh-456';
      const user = authManager.extractUserFromLockOwner(lockOwner);

      expect(user).toBeDefined();
      expect(user?.type).toBe('ci');
      expect(user?.id).toBe(lockOwner);
      expect(user?.username).toBe(lockOwner);
      expect(user?.metadata?.automated).toBe(true);
    });

    it('should return null for invalid lock format', () => {
      const lockOwner = 'invalid-format';
      const user = authManager.extractUserFromLockOwner(lockOwner);

      expect(user).toBeNull();
    });
  });
});