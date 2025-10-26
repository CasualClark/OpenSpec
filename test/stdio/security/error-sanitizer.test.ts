/**
 * Tests for Error Sanitization Framework
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorSanitizer } from '../../../src/stdio/security/error-sanitizer.js';
import { AuditLogger } from '../../../src/stdio/security/audit-logger.js';

describe('ErrorSanitizer', () => {
  beforeEach(() => {
    // Initialize with a mock audit logger
    const mockAuditLogger = new AuditLogger({ enabled: false });
    ErrorSanitizer.initialize(mockAuditLogger);
  });

  describe('sanitize', () => {
    it('should sanitize file paths from error messages', () => {
      const error = new Error('Failed to access /Users/john/project/openspec/changes/my-change');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).not.toContain('/Users/john');
      expect(result.message).toContain('/users/[user]');
      expect(result.category).toBe('system_error');
      expect(result.severity).toBe('medium');
    });

    it('should sanitize Windows paths from error messages', () => {
      const error = new Error('Cannot read C:\\Users\\jane\\project\\file.txt');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).not.toContain('C:\\Users\\jane');
      expect(result.message).toContain('C:\\Users\\[user]');
      expect(result.category).toBe('system_error');
    });

    it('should sanitize usernames and identifiers', () => {
      const error = new Error('Access denied for user: john.doe@example.com');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).not.toContain('john.doe@example.com');
      expect(result.message).toContain('user: [username]');
      expect(result.category).toBe('security_error');
      expect(result.severity).toBe('high');
    });

    it('should sanitize system paths', () => {
      const error = new Error('Permission denied for /etc/passwd');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).not.toContain('/etc/passwd');
      expect(result.message).toContain('/[system-directory]/[path]');
      expect(result.category).toBe('system_error');
    });

    it('should sanitize process information', () => {
      const error = new Error('Process pid: 12345 failed on hostname: server-prod-01');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).not.toContain('12345');
      expect(result.message).not.toContain('server-prod-01');
      expect(result.message).toContain('pid: [process-id]');
      expect(result.message).toContain('hostname: [hostname]');
    });

    it('should sanitize stack traces', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Object.module.exports (/path/to/file.js:123:45)\n    at Module._compile (internal/modules/cjs/loader.js:999:30)';
      
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).not.toContain('/path/to/file.js:123:45');
      expect(result.message).not.toContain('internal/modules/cjs/loader.js:999:30');
    });

    it('should sanitize database connection strings', () => {
      const error = new Error('Connection failed: mongodb://user:password@localhost:27017/database');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).not.toContain('user:password');
      expect(result.message).toContain('[connection-string]');
      expect(result.category).toBe('security_error');
      expect(result.severity).toBe('critical');
    });

    it('should sanitize API keys and tokens', () => {
      const error = new Error('Authentication failed: api_key: sk-1234567890abcdef1234567890abcdef12345678');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).not.toContain('sk-1234567890abcdef1234567890abcdef12345678');
      expect(result.message).toContain('api_key: [redacted]');
      expect(result.category).toBe('security_error');
      expect(result.severity).toBe('critical');
    });

    it('should classify security errors correctly', () => {
      const error = new Error('Access denied: unauthorized operation');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.category).toBe('security_error');
      expect(result.severity).toBe('high');
    });

    it('should classify validation errors correctly', () => {
      const error = new Error('Invalid input: validation failed for field "name"');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.category).toBe('user_error');
      expect(result.severity).toBe('medium');
    });

    it('should classify not found errors correctly', () => {
      const error = new Error('Resource not found: file does not exist');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.category).toBe('user_error');
      expect(result.severity).toBe('low');
    });

    it('should classify system errors correctly', () => {
      const error = new Error('ENOENT: no such file or directory');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.category).toBe('system_error');
      expect(result.severity).toBe('medium');
    });

    it('should classify developer errors correctly', () => {
      const error = new Error('Cannot read property "name" of undefined');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.category).toBe('developer_error');
      expect(result.severity).toBe('high');
    });

    it('should generate unique error IDs', () => {
      const error1 = new Error('Test error 1');
      const error2 = new Error('Test error 2');
      
      const result1 = ErrorSanitizer.sanitize(error1);
      const result2 = ErrorSanitizer.sanitize(error2);

      expect(result1.errorId).toMatch(/^err_[a-z0-9]+_[a-z0-9]+$/);
      expect(result2.errorId).toMatch(/^err_[a-z0-9]+_[a-z0-9]+$/);
      expect(result1.errorId).not.toBe(result2.errorId);
    });

    it('should provide suggested actions for user errors', () => {
      const error = new Error('Invalid input: validation failed');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.actions).toBeDefined();
      expect(result.actions!.length).toBeGreaterThan(0);
      expect(result.actions![0]).toContain('Verify');
    });

    it('should provide technical actions for developers', () => {
      const error = new Error('Cannot read property of undefined');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'developer'
      });

      expect(result.actions).toBeDefined();
      expect(result.actions!.length).toBeGreaterThan(0);
      expect(result.actions!.some(action => action.includes('implementation'))).toBe(true);
    });

    it('should use template messages for heavily sanitized errors', () => {
      const error = new Error('/Users/john/project/openspec/changes/my-change/proposal.md: Permission denied for user john@example.com');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      // Should use template since more than 30% was sanitized
      expect(result.message).not.toContain('john');
      expect(result.message).not.toContain('/Users/');
      expect(result.category).toBe('security_error');
    });

    it('should apply custom overrides when provided', () => {
      const error = new Error('Custom error message');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user',
        overrides: {
          'Custom error message': 'Custom sanitized message'
        }
      });

      expect(result.message).toBe('Custom sanitized message');
    });
  });

  describe('sanitizeForLogging', () => {
    it('should apply lighter sanitization for logs', () => {
      const error = new Error('Failed to access /Users/john/project/file.txt');
      const result = ErrorSanitizer.sanitizeForLogging(error, 'test');

      expect(result.message).not.toContain('/Users/john');
      expect(result.details.context).toBe('test');
      expect(result.details.sanitized).toBe(true);
    });

    it('should include stack trace when available', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      const result = ErrorSanitizer.sanitizeForLogging(error, 'test');

      expect(result.details.stack).toBeDefined();
      expect(result.details.stack).not.toContain('test.js:1:1');
      expect(result.details.stack).toContain('[location]');
    });

    it('should only redact critical information for logs', () => {
      const error = new Error('Process pid: 12345 failed on hostname server-01');
      const result = ErrorSanitizer.sanitizeForLogging(error, 'test');

      // Process info should remain in logs (not critical)
      expect(result.message).toContain('pid: 12345');
      expect(result.message).toContain('hostname server-01');
    });
  });

  describe('containsSensitiveInfo', () => {
    it('should detect sensitive file paths', () => {
      const message = 'Error accessing /Users/john/secrets.txt';
      expect(ErrorSanitizer.containsSensitiveInfo(message)).toBe(true);
    });

    it('should detect sensitive usernames', () => {
      const message = 'Access denied for user: admin@company.com';
      expect(ErrorSanitizer.containsSensitiveInfo(message)).toBe(true);
    });

    it('should detect API keys', () => {
      const message = 'Invalid api_key: sk-1234567890abcdef';
      expect(ErrorSanitizer.containsSensitiveInfo(message)).toBe(true);
    });

    it('should return false for safe messages', () => {
      const message = 'Operation completed successfully';
      expect(ErrorSanitizer.containsSensitiveInfo(message)).toBe(false);
    });
  });

  describe('context-specific behavior', () => {
    it('should handle tool context errors', () => {
      const error = new Error('Tool execution failed');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.actions).toBeDefined();
      expect(result.actions!.some(action => action.includes('input'))).toBe(true);
    });

    it('should handle resource context errors', () => {
      const error = new Error('Resource access denied');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'resource',
        userType: 'user'
      });

      expect(result.actions).toBeDefined();
      expect(result.actions!.some(action => action.includes('permissions'))).toBe(true);
    });

    it('should handle CLI context errors', () => {
      const error = new Error('Command syntax error');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'cli',
        userType: 'user'
      });

      expect(result.actions).toBeDefined();
      expect(result.actions!.some(action => action.includes('syntax'))).toBe(true);
    });

    it('should handle server context errors', () => {
      const error = new Error('Request processing failed');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'server',
        userType: 'user'
      });

      expect(result.actions).toBeDefined();
      expect(result.actions!.some(action => action.includes('request'))).toBe(true);
    });

    it('should handle core context errors', () => {
      const error = new Error('Core utility error');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'core',
        userType: 'user'
      });

      expect(result.actions).toBeDefined();
      expect(result.actions!.some(action => action.includes('parameters'))).toBe(true);
    });
  });

  describe('error classification edge cases', () => {
    it('should handle mixed error types', () => {
      const error = new Error('UNAUTHORIZED access to /etc/shadow failed due to undefined property');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      // Should prioritize security errors
      expect(result.category).toBe('security_error');
      expect(result.severity).toBe('high');
    });

    it('should handle empty error messages', () => {
      const error = new Error('');
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).toBeDefined();
      expect(result.category).toBe('system_error');
      expect(result.severity).toBe('low');
    });

    it('should handle non-Error objects', () => {
      const error = 'String error message';
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).toBe('String error message');
      expect(result.category).toBe('system_error');
      expect(result.severity).toBe('low');
    });

    it('should handle null/undefined errors', () => {
      const error = null as any;
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });

      expect(result.message).toBeDefined();
      expect(result.category).toBe('system_error');
    });
  });

  describe('performance considerations', () => {
    it('should handle large error messages efficiently', () => {
      const largeMessage = 'Error: ' + 'x'.repeat(10000) + ' /Users/john/secret.txt';
      const error = new Error(largeMessage);
      
      const start = Date.now();
      const result = ErrorSanitizer.sanitize(error, {
        context: 'tool',
        userType: 'user'
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should complete in <100ms
      expect(result.message).not.toContain('/Users/john');
      expect(result.message).not.toContain('x'.repeat(10000));
    });

    it('should handle multiple patterns efficiently', () => {
      const complexError = new Error(`
        Failed to access /Users/john/project/file.txt
        User: john@example.com
        PID: 12345
        Hostname: server-prod-01
        API Key: sk-1234567890abcdef
        Connection: mongodb://user:pass@localhost/db
      `);
      
      const start = Date.now();
      const result = ErrorSanitizer.sanitize(complexError, {
        context: 'tool',
        userType: 'user'
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50); // Should complete in <50ms
      expect(result.message).not.toContain('john');
      expect(result.message).not.toContain('12345');
      expect(result.message).not.toContain('server-prod-01');
      expect(result.message).not.toContain('sk-1234567890abcdef');
      expect(result.message).not.toContain('mongodb://');
    });
  });
});