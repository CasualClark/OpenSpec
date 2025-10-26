/**
 * Tests for AccessControlEngine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AccessControlEngine, AccessControlContext } from '../../../src/stdio/security/access-control.js';
import { AuthorizationEngine } from '../../../src/stdio/security/authorization.js';
import { UserIdentity } from '../../../src/stdio/security/auth.js';

describe('AccessControlEngine', () => {
  let accessControl: AccessControlEngine;
  let authEngine: AuthorizationEngine;
  let auditEvents: any[] = [];

  beforeEach(() => {
    auditEvents = [];
    
    authEngine = new AuthorizationEngine((event) => {
      auditEvents.push(event);
    });
    
    accessControl = new AccessControlEngine(authEngine, (event) => {
      auditEvents.push(event);
    });
  });

  afterEach(() => {
    accessControl.clearCache();
  });

  describe('decide', () => {
    it('should allow public read access', async () => {
      const context: AccessControlContext = {
        user: {
          id: 'test-user',
          type: 'local'
        },
        resource: 'changes://',
        action: 'read'
      };

      const result = await accessControl.decide(context);

      expect(result.allowed).toBe(true);
      expect(result.decision.code).toBe('ALLOWED');
      expect(result.performance.decisionTime).toBeGreaterThan(0);
      expect(result.performance.checksPerformed).toBe(1);
    });

    it('should deny unauthorized access', async () => {
      const context: AccessControlContext = {
        user: {
          id: 'unauthorized-user',
          type: 'local'
        },
        resource: 'proposal://private-change',
        action: 'read',
        resourcePath: '/path/to/private-change'
      };

      const result = await accessControl.decide(context);

      expect(result.allowed).toBe(false);
      expect(result.decision.code).toBe('OWNER_REQUIRED');
      expect(result.decision.reason).toBe('Resource ownership required');
    });

    it('should cache decisions', async () => {
      const context: AccessControlContext = {
        user: {
          id: 'test-user',
          type: 'local'
        },
        resource: 'changes://',
        action: 'read'
      };

      // First call
      const result1 = await accessControl.decide(context);
      expect(result1.performance.decisionTime).toBeGreaterThan(0);

      // Second call should be cached (faster)
      const result2 = await accessControl.decide(context);
      expect(result2.performance.decisionTime).toBeLessThan(result1.performance.decisionTime);

      const metrics = accessControl.getMetrics();
      expect(metrics.cacheHits).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      const context: AccessControlContext = {
        user: {
          id: 'test-user',
          type: 'local'
        },
        resource: 'invalid://resource',
        action: 'read'
      };

      const result = await accessControl.decide(context);

      expect(result.allowed).toBe(false);
      expect(result.decision.reason).toContain('Access control error');
      expect(result.performance.checksPerformed).toBe(0);
    });
  });

  describe('isAllowed', () => {
    it('should return boolean for allowed access', async () => {
      const user: UserIdentity = {
        id: 'test-user',
        type: 'local'
      };

      const allowed = await accessControl.isAllowed(user, 'changes://', 'read');

      expect(allowed).toBe(true);
    });

    it('should return boolean for denied access', async () => {
      const user: UserIdentity = {
        id: 'unauthorized-user',
        type: 'local'
      };

      const allowed = await accessControl.isAllowed(user, 'proposal://private-change', 'read');

      expect(allowed).toBe(false);
    });
  });

  describe('enforce', () => {
    it('should succeed for allowed access', async () => {
      const user: UserIdentity = {
        id: 'test-user',
        type: 'local'
      };

      await expect(accessControl.enforce(user, 'changes://', 'read')).resolves.not.toThrow();
    });

    it('should throw for denied access', async () => {
      const user: UserIdentity = {
        id: 'unauthorized-user',
        type: 'local'
      };

      await expect(accessControl.enforce(user, 'proposal://private-change', 'read'))
        .rejects.toThrow('Access denied: Resource ownership required');
    });

    it('should include error details in thrown error', async () => {
      const user: UserIdentity = {
        id: 'unauthorized-user',
        type: 'local'
      };

      try {
        await accessControl.enforce(user, 'proposal://private-change', 'read');
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.code).toBe('OWNER_REQUIRED');
        expect(error.context).toBeDefined();
        expect(error.decision).toBeDefined();
      }
    });
  });

  describe('batchDecide', () => {
    it('should process multiple contexts in parallel', async () => {
      const contexts: AccessControlContext[] = [
        {
          user: { id: 'user1', type: 'local' },
          resource: 'changes://',
          action: 'read'
        },
        {
          user: { id: 'user2', type: 'local' },
          resource: 'changes://',
          action: 'read'
        },
        {
          user: { id: 'user3', type: 'local' },
          resource: 'proposal://private',
          action: 'read'
        }
      ];

      const results = await accessControl.batchDecide(contexts);

      expect(results).toHaveLength(3);
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(true);
      expect(results[2].allowed).toBe(false);
    });

    it('should handle batch errors', async () => {
      const contexts: AccessControlContext[] = [
        {
          user: { id: 'user1', type: 'local' },
          resource: 'changes://',
          action: 'read'
        },
        {
          user: { id: 'user2', type: 'local' },
          resource: 'invalid://resource',
          action: 'read'
        }
      ];

      const results = await accessControl.batchDecide(contexts);

      expect(results).toHaveLength(2);
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(false);
      expect(results[1].decision.reason).toContain('Access control error');
    });
  });

  describe('metrics', () => {
    it('should track metrics correctly', async () => {
      const context: AccessControlContext = {
        user: { id: 'test-user', type: 'local' },
        resource: 'changes://',
        action: 'read'
      };

      // Make some decisions
      await accessControl.decide(context);
      await accessControl.decide(context); // Cached
      await accessControl.decide(context); // Cached

      const metrics = accessControl.getMetrics();

      expect(metrics.totalRequests).toBe(3);
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheHitRate).toBeCloseTo(66.67, 1);
      expect(metrics.cacheSize).toBe(1);
      expect(metrics.averageDecisionTime).toBeGreaterThan(0);
    });

    it('should clear cache and reset metrics appropriately', async () => {
      const context: AccessControlContext = {
        user: { id: 'test-user', type: 'local' },
        resource: 'changes://',
        action: 'read'
      };

      await accessControl.decide(context);
      await accessControl.decide(context); // Cached

      let metrics = accessControl.getMetrics();
      expect(metrics.cacheSize).toBe(1);
      expect(metrics.totalRequests).toBe(2);

      accessControl.clearCache();

      metrics = accessControl.getMetrics();
      expect(metrics.cacheSize).toBe(0);
      // Total requests should remain, cache should be empty
      expect(metrics.totalRequests).toBe(2);
    });
  });

  describe('preWarmCache', () => {
    it('should pre-warm cache with common contexts', async () => {
      const commonContexts: AccessControlContext[] = [
        {
          user: { id: 'user1', type: 'local' },
          resource: 'changes://',
          action: 'read'
        },
        {
          user: { id: 'user2', type: 'local' },
          resource: 'changes://',
          action: 'read'
        }
      ];

      await accessControl.preWarmCache(commonContexts);

      const metrics = accessControl.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.cacheSize).toBe(2);

      // Subsequent calls should be cached
      const result = await accessControl.decide(commonContexts[0]);
      expect(result.performance.decisionTime).toBeLessThan(10); // Very fast for cached
    });
  });

  describe('cleanupCache', () => {
    it('should clean up expired entries', async () => {
      // Mock Date.now to simulate time passage
      const originalDateNow = Date.now;
      const startTime = originalDateNow();

      // Create a decision
      const context: AccessControlContext = {
        user: { id: 'test-user', type: 'local' },
        resource: 'changes://',
        action: 'read'
      };

      await accessControl.decide(context);

      // Simulate time passage (beyond cache timeout)
      const mockDateNow = () => startTime + (6 * 60 * 1000); // 6 minutes later
      Date.now = mockDateNow;

      try {
        accessControl.cleanupCache();

        const metrics = accessControl.getMetrics();
        expect(metrics.cacheSize).toBe(0);
      } finally {
        Date.now = originalDateNow;
      }
    });
  });
});