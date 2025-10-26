/**
 * Tests for ResourceAccessError
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceAccessError } from '../../../src/stdio/errors/resource-access-error';
import { CorrelationTracker } from '../../../src/stdio/errors/correlation-tracker';

describe('ResourceAccessError', () => {
  beforeEach(() => {
    // Reset correlation tracker
  });

  describe('constructor', () => {
    it('should create ResourceAccessError with required properties', () => {
      const error = new ResourceAccessError('Test error');

      expect(error.name).toBe('ResourceAccessError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('RESOURCE_ACCESS_ERROR');
      expect(error.category).toBe('resource_access');
      expect(error.severity).toBe('medium');
      expect(error.retryable).toBe(true);
      expect(error.correlationId).toBeDefined();
      expect(error.timestamp).toBeDefined();
      expect(error.actions).toBeDefined();
    });

    it('should accept custom options', () => {
      const correlationId = CorrelationTracker.generateId();
      const error = new ResourceAccessError('Test error', {
        code: 'CUSTOM_ERROR',
        severity: 'high',
        category: 'security',
        retryable: false,
        context: { custom: 'value' },
        correlationId
      });

      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.severity).toBe('high');
      expect(error.category).toBe('security');
      expect(error.retryable).toBe(false);
      expect(error.context).toEqual({ custom: 'value' });
      expect(error.correlationId).toBe(correlationId);
    });
  });

  describe('static factory methods', () => {
    it('should create stream interruption error', () => {
      const error = ResourceAccessError.forStreamInterruption(
        'file://test.txt',
        'read',
        1024,
        2048
      );

      expect(error.name).toBe('ResourceAccessError');
      expect(error.code).toBe('STREAM_INTERRUPTED');
      expect(error.category).toBe('streaming');
      expect(error.severity).toBe('medium');
      expect(error.retryable).toBe(true);
      expect(error.streamingError).toBeDefined();
      expect(error.streamingError!.streamType).toBe('file');
      expect(error.streamingError!.operation).toBe('read');
      expect(error.streamingError!.bytesProcessed).toBe(1024);
      expect(error.streamingError!.totalBytes).toBe(2048);
      expect(error.streamingError!.reason).toBe('STREAM_INTERRUPTED');
    });

    it('should create memory limit exceeded error', () => {
      const error = ResourceAccessError.forMemoryLimitExceeded(
        'file://large.txt',
        50000000,
        40000000
      );

      expect(error.code).toBe('MEMORY_LIMIT_EXCEEDED');
      expect(error.category).toBe('streaming');
      expect(error.severity).toBe('high');
      expect(error.retryable).toBe(false);
      expect(error.streamingError).toBeDefined();
      expect(error.streamingError!.streamType).toBe('memory');
      expect(error.streamingError!.reason).toBe('MEMORY_LIMIT_EXCEEDED');
    });

    it('should create file too large error', () => {
      const error = ResourceAccessError.forFileTooLarge(
        'file://huge.txt',
        2000000000,
        1000000000
      );

      expect(error.code).toBe('FILE_TOO_LARGE');
      expect(error.category).toBe('streaming');
      expect(error.severity).toBe('medium');
      expect(error.retryable).toBe(false);
      expect(error.streamingError).toBeDefined();
      expect(error.streamingError!.reason).toBe('FILE_TOO_LARGE');
    });

    it('should create permission denied error', () => {
      const error = ResourceAccessError.forPermissionDenied(
        'file://protected.txt',
        'read'
      );

      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.category).toBe('security');
      expect(error.severity).toBe('high');
      expect(error.retryable).toBe(false);
      expect(error.resourceError).toBeDefined();
      expect(error.resourceError!.uri).toBe('file://protected.txt');
      expect(error.resourceError!.accessType).toBe('read');
      expect(error.resourceError!.reason).toBe('PERMISSION_DENIED');
      expect(error.resourceError!.exists).toBe(true);
      expect(error.resourceError!.permissions).toBe(false);
    });

    it('should create file not found error', () => {
      const error = ResourceAccessError.forFileNotFound('file://missing.txt');

      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.category).toBe('resource_access');
      expect(error.severity).toBe('medium');
      expect(error.retryable).toBe(false);
      expect(error.resourceError).toBeDefined();
      expect(error.resourceError!.uri).toBe('file://missing.txt');
      expect(error.resourceError!.reason).toBe('FILE_NOT_FOUND');
      expect(error.resourceError!.exists).toBe(false);
      expect(error.resourceError!.permissions).toBe(false);
    });

    it('should create file locked error', () => {
      const error = ResourceAccessError.forFileLocked('file://locked.txt');

      expect(error.code).toBe('FILE_LOCKED');
      expect(error.category).toBe('resource_access');
      expect(error.severity).toBe('medium');
      expect(error.retryable).toBe(true);
      expect(error.resourceError).toBeDefined();
      expect(error.resourceError!.uri).toBe('file://locked.txt');
      expect(error.resourceError!.reason).toBe('FILE_LOCKED');
      expect(error.resourceError!.exists).toBe(true);
      expect(error.resourceError!.permissions).toBe(true);
    });

    it('should create general access error', () => {
      const error = ResourceAccessError.forGeneralAccess(
        'file://test.txt',
        'UNKNOWN_ERROR',
        'low',
        true
      );

      expect(error.code).toBe('RESOURCE_ACCESS_ERROR');
      expect(error.severity).toBe('low');
      expect(error.retryable).toBe(true);
      expect(error.resourceError).toBeDefined();
      expect(error.resourceError!.uri).toBe('file://test.txt');
      expect(error.resourceError!.reason).toBe('UNKNOWN_ERROR');
    });
  });

  describe('action generation', () => {
    it('should generate actions for stream interruption', () => {
      const error = ResourceAccessError.forStreamInterruption('file://test.txt', 'read', 1024);

      expect(error.actions).toContain('Retry operation after a brief pause');
      expect(error.actions).toContain('Check network connectivity');
      expect(error.actions).toContain('Verify file is not being modified');
    });

    it('should generate actions for memory limit exceeded', () => {
      const error = ResourceAccessError.forMemoryLimitExceeded('file://test.txt', 50000, 40000);

      expect(error.actions).toContain('Reduce chunk size or streaming threshold');
      expect(error.actions).toContain('Close other applications to free memory');
      expect(error.actions).toContain('Try processing a smaller file');
    });

    it('should generate actions for file too large', () => {
      const error = ResourceAccessError.forFileTooLarge('file://test.txt', 2000, 1000);

      expect(error.actions).toContain('Use pagination or streaming for large files');
      expect(error.actions).toContain('Increase the streaming threshold');
      expect(error.actions).toContain('Process file in smaller chunks');
    });

    it('should generate actions for permission denied', () => {
      const error = ResourceAccessError.forPermissionDenied('file://test.txt', 'read');

      expect(error.actions).toContain('Check file permissions');
      expect(error.actions).toContain('Verify you have read access to the file');
      expect(error.actions).toContain('Run with appropriate user privileges');
    });

    it('should generate actions for file not found', () => {
      const error = ResourceAccessError.forFileNotFound('file://test.txt');

      expect(error.actions).toContain('Verify the file path is correct');
      expect(error.actions).toContain('Check if the file exists');
      expect(error.actions).toContain('Ensure file is accessible');
    });

    it('should generate actions for file locked', () => {
      const error = ResourceAccessError.forFileLocked('file://test.txt');

      expect(error.actions).toContain('Wait for the file to be unlocked');
      expect(error.actions).toContain('Close other applications using the file');
      expect(error.actions).toContain('Retry the operation later');
    });

    it('should include retry hints for retryable errors', () => {
      const error = ResourceAccessError.forStreamInterruption('file://test.txt', 'read', 1024);

      expect(error.actions).toContain('Use exponential backoff for retries');
      expect(error.actions).toContain('Consider implementing circuit breaker pattern');
    });
  });

  describe('MCP error conversion', () => {
    it('should convert to MCP error format', () => {
      const error = ResourceAccessError.forFileNotFound('file://test.txt');
      const mcpError = error.toMCPError('test-id');

      expect(mcpError.jsonrpc).toBe('2.0');
      expect(mcpError.id).toBe('test-id');
      expect(mcpError.error.code).toBe(-32005); // ResourceAccessDenied
      expect(mcpError.error.message).toBe('File not found: file://test.txt');
      expect(mcpError.error.data).toBeDefined();
      expect(mcpError.error.data!.correlationId).toBe(error.correlationId);
      expect(mcpError.error.data!.category).toBe('resource_access');
      expect(mcpError.error.data!.severity).toBe('medium');
      expect(mcpError.error.data!.retryable).toBe(false);
      expect(mcpError.error.data!.actions).toEqual(error.actions);
    });
  });

  describe('error type checking', () => {
    it('should identify streaming errors', () => {
      const streamingError = ResourceAccessError.forStreamInterruption('file://test.txt', 'read', 1024);
      const nonStreamingError = ResourceAccessError.forFileNotFound('file://test.txt');

      expect(streamingError.isStreamingError()).toBe(true);
      expect(nonStreamingError.isStreamingError()).toBe(false);
    });

    it('should identify permission errors', () => {
      const permissionError = ResourceAccessError.forPermissionDenied('file://test.txt', 'read');
      const nonPermissionError = ResourceAccessError.forFileNotFound('file://test.txt');

      expect(permissionError.isPermissionError()).toBe(true);
      expect(nonPermissionError.isPermissionError()).toBe(false);
    });

    it('should identify not found errors', () => {
      const notFoundError = ResourceAccessError.forFileNotFound('file://test.txt');
      const nonNotFoundError = ResourceAccessError.forPermissionDenied('file://test.txt', 'read');

      expect(notFoundError.isNotFoundError()).toBe(true);
      expect(nonNotFoundError.isNotFoundError()).toBe(false);
    });
  });

  describe('retry delay calculation', () => {
    it('should return appropriate retry delay for stream interruption', () => {
      const error = ResourceAccessError.forStreamInterruption('file://test.txt', 'read', 1024);
      expect(error.getRetryDelay()).toBe(1000);
    });

    it('should return appropriate retry delay for file locked', () => {
      const error = ResourceAccessError.forFileLocked('file://test.txt');
      expect(error.getRetryDelay()).toBe(2000);
    });

    it('should return appropriate retry delay for general access error', () => {
      const error = ResourceAccessError.forGeneralAccess('file://test.txt', 'UNKNOWN_ERROR');
      expect(error.getRetryDelay()).toBe(500);
    });

    it('should return 0 for non-retryable errors', () => {
      const error = ResourceAccessError.forPermissionDenied('file://test.txt', 'read');
      expect(error.getRetryDelay()).toBe(0);
    });
  });

  describe('inheritance', () => {
    it('should be instance of Error', () => {
      const error = new ResourceAccessError('Test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ResourceAccessError);
    });

    it('should have proper stack trace', () => {
      const error = new ResourceAccessError('Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ResourceAccessError');
    });
  });
});