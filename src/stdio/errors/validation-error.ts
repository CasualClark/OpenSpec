/**
 * ValidationError for pagination and parameter validation
 */

import { BaseError, ValidationErrorDetail, PaginationValidationResult } from './types.js';
import { CorrelationTracker } from './correlation-tracker.js';

/**
 * Enhanced ValidationError with correlation tracking and detailed validation info
 */
export class ValidationError extends Error implements BaseError {
  public readonly code: string;
  public readonly correlationId: string;
  public readonly severity: BaseError['severity'];
  public readonly category: BaseError['category'];
  public readonly context: Record<string, any>;
  public readonly actions: string[];
  public readonly retryable: boolean;
  public readonly timestamp: number;
  public readonly validationErrors: ValidationErrorDetail[];

  constructor(
    message: string,
    validationErrors: ValidationErrorDetail[],
    options: {
      code?: string;
      severity?: BaseError['severity'];
      context?: Record<string, any>;
      correlationId?: string;
    } = {}
  ) {
    super(message);
    this.name = 'ValidationError';
    
    this.code = options.code || 'VALIDATION_ERROR';
    this.correlationId = options.correlationId || CorrelationTracker.generateId();
    this.severity = options.severity || 'medium';
    this.category = 'validation';
    this.context = options.context || {};
    this.retryable = false; // Validation errors are typically not retryable
    this.timestamp = Date.now();
    this.validationErrors = validationErrors;
    
    // Set suggested actions based on validation errors
    this.actions = this.generateActions(validationErrors);
  }

  /**
   * Generate suggested actions based on validation errors
   */
  private generateActions(errors: ValidationErrorDetail[]): string[] {
    const actions = new Set<string>();
    
    for (const error of errors) {
      switch (error.code) {
        case 'INVALID_PAGE':
          actions.add('Provide a page number greater than 0');
          break;
        case 'INVALID_PAGE_SIZE':
          actions.add('Provide a page size between 1 and 1000');
          break;
        case 'PAGE_SIZE_TOO_LARGE':
          actions.add('Reduce page size to 1000 or less');
          actions.add('Consider using pagination with smaller page sizes');
          break;
        case 'MISSING_REQUIRED_FIELD':
          actions.add(`Provide the required field: ${error.field}`);
          break;
        case 'INVALID_TYPE':
          actions.add(`Ensure ${error.field} is of the correct type`);
          break;
        case 'OUT_OF_RANGE':
          actions.add(`Ensure ${error.field} is within the valid range`);
          break;
        default:
          actions.add('Check input parameters and try again');
      }
    }
    
    return Array.from(actions);
  }

  /**
   * Create a pagination validation error
   */
  static forPagination(
    validationResult: PaginationValidationResult,
    correlationId?: string
  ): ValidationError {
    return new ValidationError(
      'Pagination parameters failed validation',
      validationResult.errors,
      {
        code: 'PAGINATION_VALIDATION_ERROR',
        severity: 'medium',
        context: {
          page: validationResult.page,
          pageSize: validationResult.pageSize,
          errors: validationResult.errors
        },
        correlationId
      }
    );
  }

  /**
   * Create a field validation error
   */
  static forField(
    field: string,
    value: any,
    expected: any,
    message: string,
    code: string = 'FIELD_VALIDATION_ERROR',
    correlationId?: string
  ): ValidationError {
    const error: ValidationErrorDetail = {
      field,
      code,
      message,
      value,
      expected
    };

    return new ValidationError(
      `Field validation failed: ${field}`,
      [error],
      {
        code,
        severity: 'medium',
        context: { field, value, expected },
        correlationId
      }
    );
  }

  /**
   * Create a missing field error
   */
  static forMissingField(
    field: string,
    correlationId?: string
  ): ValidationError {
    const error: ValidationErrorDetail = {
      field,
      code: 'MISSING_REQUIRED_FIELD',
      message: `Required field '${field}' is missing`,
      value: undefined,
      expected: 'non-empty value'
    };

    return new ValidationError(
      `Missing required field: ${field}`,
      [error],
      {
        code: 'MISSING_FIELD_ERROR',
        severity: 'high',
        context: { field },
        correlationId
      }
    );
  }

  /**
   * Create a type validation error
   */
  static forInvalidType(
    field: string,
    value: any,
    expectedType: string,
    correlationId?: string
  ): ValidationError {
    const error: ValidationErrorDetail = {
      field,
      code: 'INVALID_TYPE',
      message: `Field '${field}' must be of type ${expectedType}`,
      value: typeof value,
      expected: expectedType
    };

    return new ValidationError(
      `Invalid type for field: ${field}`,
      [error],
      {
        code: 'TYPE_VALIDATION_ERROR',
        severity: 'medium',
        context: { field, actualType: typeof value, expectedType },
        correlationId
      }
    );
  }

  /**
   * Create a range validation error
   */
  static forOutOfRange(
    field: string,
    value: number,
    min: number,
    max: number,
    correlationId?: string
  ): ValidationError {
    const error: ValidationErrorDetail = {
      field,
      code: 'OUT_OF_RANGE',
      message: `Field '${field}' must be between ${min} and ${max}`,
      value,
      expected: `${min} - ${max}`
    };

    return new ValidationError(
      `Value out of range for field: ${field}`,
      [error],
      {
        code: 'RANGE_VALIDATION_ERROR',
        severity: 'medium',
        context: { field, value, min, max },
        correlationId
      }
    );
  }

  /**
   * Convert to MCP-compliant error format
   */
  toMCPError(id: string | number | null): import('./types.js').MCPErrorResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602, // InvalidParams
        message: this.message,
        data: {
          correlationId: this.correlationId,
          category: this.category,
          severity: this.severity,
          retryable: this.retryable,
          actions: this.actions,
          context: {
            ...this.context,
            validationErrors: this.validationErrors
          }
        }
      }
    };
  }

  /**
   * Get summary of validation errors
   */
  getErrorSummary(): string {
    if (this.validationErrors.length === 0) {
      return this.message;
    }
    
    if (this.validationErrors.length === 1) {
      return this.message;
    }
    
    const errorMessages = this.validationErrors.map(err => 
      `${err.field}: ${err.message}`
    );
    
    return `${this.message}. Errors: ${errorMessages.join('; ')}`;
  }
}