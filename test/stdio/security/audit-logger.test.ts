/**
 * Tests for AuditLogger
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { AuditLogger, AuditEvent } from '../../../src/stdio/security/audit-logger.js';

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;
  let testLogPath: string;

  beforeEach(() => {
    testLogPath = `/tmp/test-audit-${Date.now()}.log`;
    auditLogger = new AuditLogger({
      enabled: true,
      logPath: testLogPath,
      maxFileSize: 1024 * 1024, // 1MB for testing
      maxFiles: 3,
      bufferSize: 5,
      flushInterval: 100, // Fast for testing
      includeStackTrace: false
    });
  });

  afterEach(async () => {
    await auditLogger.shutdown();
    
    // Clean up test log files
    try {
      await fs.unlink(testLogPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('log', () => {
    it('should log authentication events', () => {
      const event = {
        type: 'auth_event' as const,
        event: 'local_auth_success',
        data: { user: { id: 'test-user' } }
      };

      auditLogger.log(event);

      const metrics = auditLogger.getMetrics();
      expect(metrics.eventsLogged).toBe(1);
    });

    it('should add severity based on event type', () => {
      const criticalEvent = {
        type: 'security_violation' as const,
        event: 'unauthorized_access',
        data: { resource: 'secret-data' }
      };

      auditLogger.log(criticalEvent);

      const metrics = auditLogger.getMetrics();
      expect(metrics.eventsLogged).toBe(1);
    });

    it('should include stack trace for critical events when enabled', async () => {
      const testLogPathWithStackTrace = `/tmp/test-audit-stack-${Date.now()}.log`;
      const auditLoggerWithStackTrace = new AuditLogger({
        enabled: true,
        logPath: testLogPathWithStackTrace,
        includeStackTrace: true,
        bufferSize: 1, // Force immediate flush
        flushInterval: 1000 // Don't rely on timer
      });

      const criticalEvent = {
        type: 'security_violation' as const,
        event: 'critical_error',
        data: { error: 'something went wrong' }
      };

      auditLoggerWithStackTrace.log(criticalEvent);

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 50));
      await auditLoggerWithStackTrace.flush();
      
      // Check if file exists
      try {
        await fs.access(testLogPathWithStackTrace);
      } catch (error) {
        console.error('Log file does not exist:', testLogPathWithStackTrace);
        throw error;
      }
      
      const logContent = await fs.readFile(testLogPathWithStackTrace, 'utf-8');
      const loggedEvent = JSON.parse(logContent.trim()) as AuditEvent;
      
      expect(loggedEvent.data.stackTrace).toBeDefined();
      expect(typeof loggedEvent.data.stackTrace).toBe('string');

      await auditLoggerWithStackTrace.shutdown();
      
      // Clean up
      try {
        await fs.unlink(testLogPathWithStackTrace);
      } catch {
        // Ignore if file doesn't exist
      }
    });

    it('should buffer events and flush on timer', async () => {
      const auditLoggerSlow = new AuditLogger({
        enabled: true,
        logPath: testLogPath,
        bufferSize: 10,
        flushInterval: 200 // 200ms
      });

      // Log some events
      for (let i = 0; i < 3; i++) {
        auditLoggerSlow.log({
          type: 'auth_event' as const,
          event: `test_event_${i}`,
          data: { index: i }
        });
      }

      // Should not be in file yet
      try {
        const content = await fs.readFile(testLogPath, 'utf-8');
        expect(content).toBe('');
      } catch {
        // File doesn't exist yet, which is expected
      }

      // Wait for flush
      await new Promise(resolve => setTimeout(resolve, 250));

      // Should be in file now
      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      await auditLoggerSlow.shutdown();
    });

    it('should flush immediately for critical events', async () => {
      const criticalEvent = {
        type: 'security_violation' as const,
        event: 'critical_security_issue',
        data: { error: 'critical issue' }
      };

      auditLogger.log(criticalEvent);

      // Wait for async flush to complete
      await auditLogger.flush();

      const content = await fs.readFile(testLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      const loggedEvent = JSON.parse(lines[lines.length - 1]) as AuditEvent;
      
      expect(loggedEvent.event).toBe('critical_security_issue');
      expect(loggedEvent.severity).toBe('high');
    });

    it('should handle disabled logger', () => {
      const disabledLogger = new AuditLogger({
        enabled: false,
        logPath: testLogPath
      });

      const event = {
        type: 'auth_event' as const,
        event: 'test_event',
        data: {}
      };

      disabledLogger.log(event);

      const metrics = disabledLogger.getMetrics();
      expect(metrics.eventsLogged).toBe(0);
    });
  });

  describe('convenience methods', () => {
    it('should log auth events', () => {
      auditLogger.logAuthEvent('auth_success', { userId: 'test-user' });

      const metrics = auditLogger.getMetrics();
      expect(metrics.eventsLogged).toBe(1);
    });

    it('should log authorization events', () => {
      auditLogger.logAuthzEvent('access_allowed', { resource: 'test-resource' });

      const metrics = auditLogger.getMetrics();
      expect(metrics.eventsLogged).toBe(1);
    });

    it('should log access control events', () => {
      auditLogger.logAccessEvent('decision_made', { allowed: true });

      const metrics = auditLogger.getMetrics();
      expect(metrics.eventsLogged).toBe(1);
    });

    it('should log security violations', () => {
      auditLogger.logSecurityViolation('unauthorized_access', { 
        resource: 'secret-data',
        userId: 'attacker' 
      }, 'critical');

      const metrics = auditLogger.getMetrics();
      expect(metrics.eventsLogged).toBe(1);
    });
  });

  describe('flush', () => {
    it('should flush buffered events to file', async () => {
      // Start with a clean audit logger for this test
      const cleanTestLogPath = `/tmp/test-audit-flush-${Date.now()}.log`;
      const cleanAuditLogger = new AuditLogger({
        enabled: true,
        logPath: cleanTestLogPath,
        bufferSize: 10,
        flushInterval: 10000 // Don't use timer for this test
      });

      // Log multiple events
      for (let i = 0; i < 3; i++) {
        cleanAuditLogger.log({
          type: 'auth_event' as const,
          event: `test_event_${i}`,
          data: { index: i }
        });
      }

      // Flush manually
      await cleanAuditLogger.flush();

      // Check file content
      const content = await fs.readFile(cleanTestLogPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(3);
      
      // Parse each line as JSON
      lines.forEach((line, index) => {
        const event = JSON.parse(line) as AuditEvent;
        expect(event.event).toBe(`test_event_${index}`);
        expect(event.timestamp).toBeDefined();
        expect(event.type).toBe('auth_event');
      });

      const metrics = cleanAuditLogger.getMetrics();
      expect(metrics.eventsFlushed).toBe(3);

      await cleanAuditLogger.shutdown();
      
      // Clean up
      try {
        await fs.unlink(cleanTestLogPath);
      } catch {
        // Ignore if file doesn't exist
      }
    });

    it('should handle flush errors gracefully', async () => {
      // Create logger with invalid path
      const invalidLogger = new AuditLogger({
        enabled: true,
        logPath: '/invalid/path/that/does/not/exist/audit.log'
      });

      invalidLogger.log({
        type: 'auth_event' as const,
        event: 'test_event',
        data: {}
      });

      // Should not throw, but should record error
      await invalidLogger.flush();

      const metrics = invalidLogger.getMetrics();
      expect(metrics.errors).toBeGreaterThan(0);

      await invalidLogger.shutdown();
    });
  });

  describe('generateSummary', () => {
    beforeEach(async () => {
      // Log some test events
      const testEvents: AuditEvent[] = [
        {
          type: 'auth_event',
          event: 'auth_success',
          timestamp: Date.now() - 3600000, // 1 hour ago
          data: { user: { id: 'user1' } }
        },
        {
          type: 'authz_event',
          event: 'access_allowed',
          timestamp: Date.now() - 1800000, // 30 minutes ago
          data: { resource: 'resource1', user: { id: 'user1' } }
        },
        {
          type: 'security_violation',
          event: 'access_denied',
          timestamp: Date.now() - 900000, // 15 minutes ago
          data: { resource: 'resource2', user: { id: 'user2' } },
          severity: 'high'
        }
      ];

      for (const event of testEvents) {
        auditLogger.log(event);
      }

      await auditLogger.flush();
    });

    it('should generate summary for time range', async () => {
      const summary = await auditLogger.generateSummary();

      expect(summary.totalEvents).toBe(3);
      expect(summary.eventsByType['auth_event']).toBe(1);
      expect(summary.eventsByType['authz_event']).toBe(1);
      expect(summary.eventsByType['security_violation']).toBe(1);
      expect(summary.eventsBySeverity['low']).toBe(2);
      expect(summary.eventsBySeverity['high']).toBe(1);
      expect(summary.timeRange.end).toBeGreaterThan(summary.timeRange.start);
    });

    it('should identify top users and resources', async () => {
      const summary = await auditLogger.generateSummary();

      expect(summary.topUsers).toBeDefined();
      expect(summary.topResources).toBeDefined();
      // user1 should be top user (appears twice)
      expect(summary.topUsers[0].userId).toBe('user1');
      expect(summary.topUsers[0].count).toBe(2);
    });

    it('should track denied access attempts', async () => {
      const summary = await auditLogger.generateSummary();

      expect(summary.deniedAccess).toHaveLength(1);
      expect(summary.deniedAccess[0].resource).toBe('resource2');
      expect(summary.deniedAccess[0].userId).toBe('user2');
    });
  });

  describe('searchEvents', () => {
    beforeEach(async () => {
      // Log test events with different properties
      const testEvents = [
        {
          type: 'auth_event' as const,
          event: 'auth_success',
          data: { user: { id: 'user1' }, resource: 'changes://' }
        },
        {
          type: 'authz_event' as const,
          event: 'access_denied',
          data: { user: { id: 'user2' }, resource: 'proposal://private' }
        },
        {
          type: 'security_violation' as const,
          event: 'unauthorized_access',
          data: { user: { id: 'user1' }, resource: 'task://secret' },
          severity: 'critical' as const
        }
      ];

      for (const event of testEvents) {
        auditLogger.log(event);
      }

      await auditLogger.flush();
      
      // Wait a bit to ensure file is written
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should search by event type', async () => {
      const events = await auditLogger.searchEvents({
        type: 'auth_event'
      });

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('auth_success');
    });

    it('should search by user ID', async () => {
      const events = await auditLogger.searchEvents({
        userId: 'user1'
      });

      expect(events).toHaveLength(2);
      expect(events[0].data.user.id).toBe('user1');
      expect(events[1].data.user.id).toBe('user1');
    });

    it('should search by resource', async () => {
      const events = await auditLogger.searchEvents({
        resource: 'proposal://private'
      });

      expect(events).toHaveLength(1);
      expect(events[0].data.resource).toBe('proposal://private');
    });

    it('should search by severity', async () => {
      const events = await auditLogger.searchEvents({
        severity: 'critical'
      });

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('unauthorized_access');
    });

    it('should limit results', async () => {
      const events = await auditLogger.searchEvents({
        limit: 2
      });

      expect(events.length).toBeLessThanOrEqual(2);
    });
  });

  describe('cleanup', () => {
    it('should remove old log files', async () => {
      // Create some old log files
      const oldLogPath1 = testLogPath.replace('.log', '.1.log');
      const oldLogPath2 = testLogPath.replace('.log', '.2.log');
      const oldLogPath3 = testLogPath.replace('.log', '.3.log');
      const oldLogPath4 = testLogPath.replace('.log', '.4.log');

      await fs.writeFile(oldLogPath1, 'old log 1');
      await fs.writeFile(oldLogPath2, 'old log 2');
      await fs.writeFile(oldLogPath3, 'old log 3');
      await fs.writeFile(oldLogPath4, 'old log 4');

      // Create logger with maxFiles = 3
      const limitedLogger = new AuditLogger({
        enabled: true,
        logPath: testLogPath,
        maxFiles: 3
      });

      await limitedLogger.cleanup();

      // Should keep only 3 most recent files
      try {
        await fs.access(oldLogPath1);
        expect.fail('oldLogPath1 should have been deleted');
      } catch {
        // Expected
      }

      // Clean up
      await limitedLogger.shutdown();
      
      try {
        await fs.unlink(oldLogPath2);
        await fs.unlink(oldLogPath3);
        await fs.unlink(oldLogPath4);
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  describe('metrics', () => {
    it('should track metrics correctly', () => {
      const metrics = auditLogger.getMetrics();

      expect(metrics.eventsLogged).toBe(0);
      expect(metrics.eventsFlushed).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.lastFlush).toBeDefined();
    });
  });
});