/**
 * Tests for ValidationError
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationError } from '../../../src/stdio/errors/validation-error';
import { CorrelationTracker } from '../../../src/stdio/errors/correlation-tracker';

describe('ValidationError', () => {
  beforeEach(() => {
    // Reset correlation tracker
  });

  describe('constructor', () => {
    it('should create ValidationError with required properties', () => {
      const errors = [{
        field: 'test',
        code: 'TEST_ERROR',
        message: 'Test error message',
        value: 'invalid',
        expected: 'valid'
      }];

      const error = new ValidationError('Test message', errors);

      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.category).toBe('validation');
      expect(error.severity).toBe('medium');
      expect(error.retryable).toBe(false);
      expect(error.validationErrors).toEqual(errors);
      expect(error.correlationId).toBeDefined();
      expect(error.timestamp).toBeDefined();
      expect(error.actions).toBeDefined();
    });

    it('should accept custom options', () => {
      const errors = [{ field: 'test', code: 'TEST_ERROR', message: 'Test' }];
      const correlationId = CorrelationTracker.generateId();

      const error = new ValidationError('Test message', errors, {
        code: 'CUSTOM_ERROR',
        severity: 'high',
        context: { custom: 'value' },
        correlationId
      });

      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.severity).toBe('high');
      expect(error.context).toEqual({ custom: 'value' });
      expect(error.correlationId).toBe(correlationId);
    });
  });

  describe('static factory methods', () => {
    it('should create pagination validation error', () => {
      const validationResult = {
        isValid: false,
        page: 0,
        pageSize: 0,
        errors: [{
          field: 'page',
          code: 'INVALID_PAGE',
          message: 'Page must be > 0',
          value: 0,
          expected: '> 0'
        }]
      };

      const error = ValidationError.forPagination(validationResult, undefined);

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('PAGINATION_VALIDATION_ERROR');
      expect(error.message).toBe('Pagination parameters failed validation');
      expect(error.validationErrors).toEqual(validationResult.errors);
      expect(error.context.page).toBe(0);
      expect(error.context.pageSize).toBe(0);
    });

    it('should create field validation error', () => {
      const error = ValidationError.forField('username', 'ab', 'min 3 chars');

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('FIELD_VALIDATION_ERROR');
      expect(error.message).toBe('Field validation failed: username');
      expect(error.validationErrors).toHaveLength(1);
      expect(error.validationErrors[0].field).toBe('username');
      expect(error.validationErrors[0].value).toBe('ab');
      expect(error.validationErrors[0].expected).toBe('min 3 chars');
    });

    it('should create missing field error', () => {
      const error = ValidationError.forMissingField('email');

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('MISSING_FIELD_ERROR');
      expect(error.severity).toBe('high');
      expect(error.validationErrors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(error.validationErrors[0].field).toBe('email');
    });

    it('should create invalid type error', () => {
      const error = ValidationError.forInvalidType('age', 'twenty', 'number');

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('TYPE_VALIDATION_ERROR');
      expect(error.validationErrors[0].field).toBe('age');
      expect(error.validationErrors[0].value).toBe('string');
      expect(error.validationErrors[0].expected).toBe('number');
    });

    it('should create out of range error', () => {
      const error = ValidationError.forOutOfRange('page', 0, 1, 100);

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('RANGE_VALIDATION_ERROR');
      expect(error.validationErrors[0].field).toBe('page');
      expect(error.validationErrors[0].value).toBe(0);
      expect(error.validationErrors[0].expected).toBe('1 - 100');
    });
  });

  describe('action generation', () => {
    it('should generate appropriate actions for invalid page', () => {
      const errors = [{
        field: 'page',
        code: 'INVALID_PAGE',
        message: 'Page must be > 0',
        value: 0,
        expected: '> 0'
      }];

      const error = new ValidationError('Test', errors);

      expect(error.actions).toContain('Provide a page number greater than 0');
    });

    it('should generate appropriate actions for page size too large', () => {
      const errors = [{
        field: 'pageSize',
        code: 'PAGE_SIZE_TOO_LARGE',
        message: 'Page size too large',
        value: 2000,
        expected: '≤ 1000'
      }];

      const error = new ValidationError('Test', errors);

      expect(error.actions).toContain('Reduce page size to 1000 or less');
      expect(error.actions).toContain('Consider using pagination with smaller page sizes');
    });

    it('should generate appropriate actions for missing field', () => {
      const errors = [{
        field: 'requiredField',
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Field is required',
        value: undefined,
        expected: 'non-empty value'
      }];

      const error = new ValidationError('Test', errors);

      expect(error.actions).toContain('Provide the required field: requiredField');
    });

    it('should generate default action for unknown error code', () => {
      const errors = [{
        field: 'test',
        code: 'UNKNOWN_ERROR',
        message: 'Unknown error',
        value: 'test',
        expected: 'valid'
      }];

      const error = new ValidationError('Test', errors);

      expect(error.actions).toContain('Check input parameters and try again');
    });
  });

  describe('MCP error conversion', () => {
    it('should convert to MCP error format', () => {
      const errors = [{
        field: 'test',
        code: 'TEST_ERROR',
        message: 'Test error',
        value: 'invalid',
        expected: 'valid'
      }];

      const error = new ValidationError('Test message', errors);
      const mcpError = error.toMCPError('test-id');

      expect(mcpError.jsonrpc).toBe('2.0');
      expect(mcpError.id).toBe('test-id');
      expect(mcpError.error.code).toBe(-32602); // InvalidParams
      expect(mcpError.error.message).toBe('Test message');
      expect(mcpError.error.data).toBeDefined();
      expect(mcpError.error.data!.correlationId).toBe(error.correlationId);
      expect(mcpError.error.data!.category).toBe('validation');
      expect(mcpError.error.data!.severity).toBe('medium');
      expect(mcpError.error.data!.retryable).toBe(false);
      expect(mcpError.error.data!.actions).toEqual(error.actions);
    });
  });

  describe('error summary', () => {
    it('should return message for single validation error', () => {
      const errors = [{
        field: 'test',
        code: 'TEST_ERROR',
        message: 'Test error',
        value: 'invalid',
        expected: 'valid'
      }];

      const error = new ValidationError('Test message', errors);

      expect(error.getErrorSummary()).toBe('Test message');
    });

    it('should return detailed summary for multiple validation errors', () => {
      const errors = [
        {
          field: 'page',
          code: 'INVALID_PAGE',
          message: 'Page must be > 0',
          value: 0,
          expected: '> 0'
        },
        {
          field: 'pageSize',
          code: 'INVALID_PAGE_SIZE',
          message: 'Page size must be > 0',
          value: -1,
          expected: '> 0'
        }
      ];

      const error = new ValidationError('Test message', errors);

      expect(error.getErrorSummary()).toBe(
        'Test message. Errors: page: Page must be > 0; pageSize: Page size must be > 0'
      );
    });
  });

  describe('inheritance', () => {
    it('should be instance of Error', () => {
      const error = new ValidationError('Test', []);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should have proper stack trace', () => {
      const error = new ValidationError('Test', []);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });
});