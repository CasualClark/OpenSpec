/**
 * Pagination Parameter Validator
 * 
 * Provides comprehensive validation for pagination parameters
 * with detailed error messages and correlation tracking
 */

import { ValidationError } from './validation-error.js';
import { PaginationValidationResult, ValidationErrorDetail } from './types.js';

/**
 * Pagination parameter interface
 */
export interface PaginationParams {
  /** Page number (1-based) */
  page?: number;
  /** Number of items per page */
  pageSize?: number;
  /** Next page token for cursor-based pagination */
  nextPageToken?: string;
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  /** Minimum page size */
  minPageSize?: number;
  /** Maximum page size */
  maxPageSize?: number;
  /** Default page size */
  defaultPageSize?: number;
  /** Whether to allow page number 0 (0-based indexing) */
  allowZeroPage?: boolean;
  /** Whether to validate next page token format */
  validateNextPageToken?: boolean;
}

/**
 * Default pagination configuration
 */
export const DEFAULT_PAGINATION_CONFIG: Required<PaginationConfig> = {
  minPageSize: 1,
  maxPageSize: 1000,
  defaultPageSize: 50,
  allowZeroPage: false,
  validateNextPageToken: true
};

/**
 * Comprehensive pagination validator
 */
export class PaginationValidator {
  private config: Required<PaginationConfig>;

  constructor(config: PaginationConfig = {}) {
    this.config = { ...DEFAULT_PAGINATION_CONFIG, ...config };
  }

  /**
   * Validate pagination parameters
   */
  validatePagination(
    params: PaginationParams,
    options: {
      correlationId?: string;
      context?: Record<string, any>;
    } = {}
  ): PaginationValidationResult {
    const errors: ValidationErrorDetail[] = [];
    let page = this.config.allowZeroPage ? 0 : 1;
    let pageSize = this.config.defaultPageSize;

    // Validate page number
    if (params.page !== undefined && params.page !== null) {
      const pageValidation = this.validatePageNumber(params.page);
      if (!pageValidation.isValid) {
        errors.push(pageValidation.error!);
      } else {
        page = pageValidation.value!;
      }
    }

    // Validate page size
    if (params.pageSize !== undefined && params.pageSize !== null) {
      const pageSizeValidation = this.validatePageSize(params.pageSize);
      if (!pageSizeValidation.isValid) {
        errors.push(pageSizeValidation.error!);
      } else {
        pageSize = pageSizeValidation.value!;
      }
    }

    // Validate next page token
    if (params.nextPageToken !== undefined && params.nextPageToken !== null) {
      const tokenValidation = this.validateNextPageToken(params.nextPageToken);
      if (!tokenValidation.isValid) {
        errors.push(tokenValidation.error!);
      }
    }

    // Check for incompatible parameters
    const compatibilityValidation = this.validateParameterCompatibility(params);
    if (!compatibilityValidation.isValid) {
      errors.push(...compatibilityValidation.errors!);
    }

    return {
      isValid: errors.length === 0,
      page,
      pageSize,
      errors
    };
  }

  /**
   * Validate page number
   */
  private validatePageNumber(page: number): { isValid: boolean; value?: number; error?: ValidationErrorDetail } {
    // Check type
    if (typeof page !== 'number' || !Number.isInteger(page)) {
      return {
        isValid: false,
        error: {
          field: 'page',
          code: 'INVALID_TYPE',
          message: 'Page number must be an integer',
          value: page,
          expected: 'integer'
        }
      };
    }

    // Check minimum value
    const minPage = this.config.allowZeroPage ? 0 : 1;
    if (page < minPage) {
      return {
        isValid: false,
        error: {
          field: 'page',
          code: 'INVALID_PAGE',
          message: `Page number must be ${minPage} or greater`,
          value: page,
          expected: `>= ${minPage}`
        }
      };
    }

    // Check maximum reasonable value
    if (page > 1000000) {
      return {
        isValid: false,
        error: {
          field: 'page',
          code: 'PAGE_TOO_LARGE',
          message: 'Page number is unreasonably large',
          value: page,
          expected: '<= 1,000,000'
        }
      };
    }

    return { isValid: true, value: page };
  }

  /**
   * Validate page size
   */
  private validatePageSize(pageSize: number): { isValid: boolean; value?: number; error?: ValidationErrorDetail } {
    // Check type
    if (typeof pageSize !== 'number' || !Number.isInteger(pageSize)) {
      return {
        isValid: false,
        error: {
          field: 'pageSize',
          code: 'INVALID_TYPE',
          message: 'Page size must be an integer',
          value: pageSize,
          expected: 'integer'
        }
      };
    }

    // Check minimum value
    if (pageSize < this.config.minPageSize) {
      return {
        isValid: false,
        error: {
          field: 'pageSize',
          code: 'INVALID_PAGE_SIZE',
          message: `Page size must be at least ${this.config.minPageSize}`,
          value: pageSize,
          expected: `>= ${this.config.minPageSize}`
        }
      };
    }

    // Check maximum value
    if (pageSize > this.config.maxPageSize) {
      return {
        isValid: false,
        error: {
          field: 'pageSize',
          code: 'PAGE_SIZE_TOO_LARGE',
          message: `Page size cannot exceed ${this.config.maxPageSize}`,
          value: pageSize,
          expected: `<= ${this.config.maxPageSize}`
        }
      };
    }

    return { isValid: true, value: pageSize };
  }

  /**
   * Validate next page token
   */
  private validateNextPageToken(token: string): { isValid: boolean; error?: ValidationErrorDetail } {
    // Check type
    if (typeof token !== 'string') {
      return {
        isValid: false,
        error: {
          field: 'nextPageToken',
          code: 'INVALID_TYPE',
          message: 'Next page token must be a string',
          value: token,
          expected: 'string'
        }
      };
    }

    // Check if empty
    if (token.length === 0) {
      return {
        isValid: false,
        error: {
          field: 'nextPageToken',
          code: 'EMPTY_TOKEN',
          message: 'Next page token cannot be empty',
          value: token,
          expected: 'non-empty string'
        }
      };
    }

    // Validate format if enabled
    if (this.config.validateNextPageToken) {
      // Basic format validation (hex string with reasonable length)
      const tokenPattern = /^[a-f0-9]{8,64}$/i;
      if (!tokenPattern.test(token)) {
        return {
          isValid: false,
          error: {
            field: 'nextPageToken',
            code: 'INVALID_TOKEN_FORMAT',
            message: 'Next page token has invalid format',
            value: token.substring(0, 8) + '...',
            expected: 'hexadecimal string (8-64 characters)'
          }
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Validate parameter compatibility
   */
  private validateParameterCompatibility(params: PaginationParams): { isValid: boolean; errors?: ValidationErrorDetail[] } {
    const errors: ValidationErrorDetail[] = [];

    // Check if both page number and next page token are provided
    if (params.page !== undefined && params.nextPageToken !== undefined) {
      errors.push({
        field: 'pagination',
        code: 'MUTUALLY_EXCLUSIVE',
        message: 'Page number and next page token cannot be used together',
        value: { page: params.page, nextPageToken: params.nextPageToken },
        expected: 'Either page number OR next page token'
      });
    }

    // Check if page is 0 with page-based pagination
    if (params.page === 0 && !this.config.allowZeroPage) {
      errors.push({
        field: 'page',
        code: 'ZERO_PAGE_NOT_ALLOWED',
        message: 'Page number 0 is not allowed (use 1 for first page)',
        value: params.page,
        expected: '>= 1'
      });
    }

    // Check for negative values (should be caught by individual validations but added for completeness)
    if (params.page !== undefined && params.page < 0) {
      errors.push({
        field: 'page',
        code: 'NEGATIVE_PAGE',
        message: 'Page number cannot be negative',
        value: params.page,
        expected: '>= 0'
      });
    }

    if (params.pageSize !== undefined && params.pageSize < 0) {
      errors.push({
        field: 'pageSize',
        code: 'NEGATIVE_PAGE_SIZE',
        message: 'Page size cannot be negative',
        value: params.pageSize,
        expected: '>= 0'
      });
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Create validation error from failed validation
   */
  createValidationError(
    validationResult: PaginationValidationResult,
    correlationId?: string
  ): ValidationError {
    return ValidationError.forPagination(validationResult, correlationId);
  }

  /**
   * Parse pagination parameters from URI query string
   */
  parseFromUri(uri: string): PaginationParams {
    const params: PaginationParams = {};
    
    try {
      const url = new URL(uri);
      const searchParams = url.searchParams;

      // Parse page parameter
      const pageParam = searchParams.get('page');
      if (pageParam) {
        const page = parseInt(pageParam, 10);
        if (!isNaN(page)) {
          params.page = page;
        }
      }

      // Parse pageSize parameter
      const pageSizeParam = searchParams.get('pageSize');
      if (pageSizeParam) {
        const pageSize = parseInt(pageSizeParam, 10);
        if (!isNaN(pageSize)) {
          params.pageSize = pageSize;
        }
      }

      // Parse nextPageToken parameter
      const nextPageTokenParam = searchParams.get('nextPageToken');
      if (nextPageTokenParam) {
        params.nextPageToken = nextPageTokenParam;
      }

    } catch (error) {
      // If URI parsing fails, return empty params
      // The validation will catch any issues
    }

    return params;
  }

  /**
   * Apply defaults to pagination parameters
   */
  applyDefaults(params: PaginationParams): Required<Omit<PaginationParams, 'nextPageToken'>> & { nextPageToken?: string } {
    return {
      page: params.page ?? (this.config.allowZeroPage ? 0 : 1),
      pageSize: params.pageSize ?? this.config.defaultPageSize,
      nextPageToken: params.nextPageToken
    };
  }

  /**
   * Create validator with custom configuration
   */
  static withConfig(config: PaginationConfig): PaginationValidator {
    return new PaginationValidator(config);
  }

  /**
   * Create validator for API endpoints
   */
  static forApi(): PaginationValidator {
    return new PaginationValidator({
      minPageSize: 1,
      maxPageSize: 100,
      defaultPageSize: 20,
      allowZeroPage: false,
      validateNextPageToken: true
    });
  }

  /**
   * Create validator for internal operations
   */
  static forInternal(): PaginationValidator {
    return new PaginationValidator({
      minPageSize: 1,
      maxPageSize: 1000,
      defaultPageSize: 50,
      allowZeroPage: false,
      validateNextPageToken: false
    });
  }
}