/**
 * Central Error Handler for OpenSpec MCP Server
 * 
 * Provides unified error handling, logging, and MCP response formatting
 */

import { BaseError, MCPErrorResponse, ErrorClassification } from './types.js';
import { ValidationError } from './validation-error.js';
import { ResourceAccessError } from './resource-access-error.js';
import { CorrelationTracker, CorrelationContext } from './correlation-tracker.js';
import { ErrorCode } from '../types/index.js';

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  /** Whether to include stack traces in responses */
  includeStackTrace?: boolean;
  /** Whether to log errors */
  logErrors?: boolean;
  /** Custom error message overrides */
  messageOverrides?: Record<string, string>;
  /** Default correlation ID if none provided */
  defaultCorrelationId?: string;
}

/**
 * Central error handler for MCP server
 */
export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any) => void;

  constructor(
    logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any) => void,
    config: ErrorHandlerConfig = {}
  ) {
    this.logger = logger;
    this.config = {
      includeStackTrace: false,
      logErrors: true,
      ...config
    };
  }

  /**
   * Handle an error and return MCP-compliant response
   */
  handleError(
    error: Error | string,
    requestId: string | number | null,
    options: {
      correlationId?: string;
      context?: Record<string, any>;
      includeStackTrace?: boolean;
    } = {}
  ): MCPErrorResponse {
    const correlationId = options.correlationId || 
                        CorrelationContext.getCurrent() || 
                        this.config.defaultCorrelationId || 
                        CorrelationTracker.generateId();

    // Convert string errors to Error objects
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    
    // Enhance error with correlation ID if it's a custom error
    if (this.isCustomError(errorObj) && !errorObj.correlationId) {
      (errorObj as any).correlationId = correlationId;
    }

    // Log the error
    if (this.config.logErrors) {
      this.logError(errorObj, correlationId, options.context);
    }

    // Convert to MCP format
    return this.toMCPError(errorObj, requestId, correlationId, options);
  }

  /**
   * Handle validation errors specifically
   */
  handleValidationError(
    validationError: ValidationError,
    requestId: string | number | null,
    context?: Record<string, any>
  ): MCPErrorResponse {
    return this.handleError(validationError, requestId, {
      correlationId: validationError.correlationId,
      context
    });
  }

  /**
   * Handle resource access errors specifically
   */
  handleResourceAccessError(
    resourceError: ResourceAccessError,
    requestId: string | number | null,
    context?: Record<string, any>
  ): MCPErrorResponse {
    return this.handleError(resourceError, requestId, {
      correlationId: resourceError.correlationId,
      context
    });
  }

  /**
   * Wrap a function with error handling
   */
  wrapWithErrorHandling<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    options: {
      operationName?: string;
      correlationId?: string;
      context?: Record<string, any>;
    } = {}
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const correlationId = options.correlationId || CorrelationTracker.generateId();
      const operationName = options.operationName || fn.name || 'anonymous';
      
      try {
        return await fn(...args);
      } catch (error) {
        const enhancedError = this.enhanceError(error as Error, operationName, correlationId, options.context);
        throw enhancedError;
      }
    };
  }

  /**
   * Create a validation error with proper context
   */
  createValidationError(
    message: string,
    validationErrors: any[],
    context?: Record<string, any>
  ): ValidationError {
    const correlationId = CorrelationTracker.generateId();
    
    return new ValidationError(message, validationErrors, {
      correlationId,
      context
    });
  }

  /**
   * Create a resource access error with proper context
   */
  createResourceAccessError(
    message: string,
    options: {
      code?: string;
      severity?: BaseError['severity'];
      uri?: string;
      operation?: string;
      context?: Record<string, any>;
    } = {}
  ): ResourceAccessError {
    const correlationId = CorrelationTracker.generateId();
    
    return new ResourceAccessError(message, {
      code: options.code,
      severity: options.severity,
      correlationId,
      context: {
        ...options.context,
        uri: options.uri,
        operation: options.operation
      }
    });
  }

  /**
   * Check if error is a custom error type
   */
  private isCustomError(error: Error): error is ValidationError | ResourceAccessError {
    return error instanceof ValidationError || error instanceof ResourceAccessError;
  }

  /**
   * Enhance error with additional context
   */
  private enhanceError(
    error: Error,
    operationName: string,
    correlationId: string,
    context?: Record<string, any>
  ): Error {
    if (this.isCustomError(error)) {
      return error;
    }

    // For regular errors, create a resource access error
    return new ResourceAccessError(
      `Error in ${operationName}: ${error.message}`,
      {
        code: 'OPERATION_ERROR',
        severity: 'medium',
        correlationId,
        context: {
          operationName,
          originalError: error.message,
          stack: this.config.includeStackTrace ? error.stack : undefined,
          ...context
        }
      }
    );
  }

  /**
   * Log error with context
   */
  private logError(
    error: Error,
    correlationId: string,
    context?: Record<string, any>
  ): void {
    const logData = {
      correlationId,
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      timestamp: new Date().toISOString()
    };

    if (this.isCustomError(error)) {
      const customError = error as ValidationError | ResourceAccessError;
      this.logger('error', `${customError.name}: ${customError.message}`, {
        ...logData,
        code: customError.code,
        severity: customError.severity,
        category: customError.category,
        retryable: customError.retryable,
        actions: customError.actions
      });
    } else {
      this.logger('error', `Unhandled error: ${error.message}`, logData);
    }
  }

  /**
   * Convert error to MCP-compliant format
   */
  private toMCPError(
    error: Error,
    requestId: string | number | null,
    correlationId: string,
    options: {
      includeStackTrace?: boolean;
      context?: Record<string, any>;
    } = {}
  ): MCPErrorResponse {
    if (this.isCustomError(error)) {
      return (error as ValidationError | ResourceAccessError).toMCPError(requestId);
    }

    // For regular errors, create standard MCP error
    const errorCode = this.mapErrorToCode(error);
    const message = this.config.messageOverrides?.[error.message] || error.message;

    return {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: errorCode,
        message,
        data: {
          correlationId,
          category: 'system',
          severity: 'medium',
          retryable: this.isRetryableError(error),
          context: {
            ...options.context,
            errorType: error.name,
            ...(options.includeStackTrace && { stack: error.stack })
          }
        }
      }
    };
  }

  /**
   * Map error to JSON-RPC error code
   */
  private mapErrorToCode(error: Error): number {
    if (this.isCustomError(error)) {
      const customError = error as ValidationError | ResourceAccessError;
      
      switch (customError.category) {
        case 'validation':
          return ErrorCode.InvalidParams;
        case 'resource_access':
          return ErrorCode.ResourceAccessDenied;
        case 'security':
          return ErrorCode.PermissionDenied;
        case 'streaming':
          return ErrorCode.InternalError;
        default:
          return ErrorCode.InternalError;
      }
    }

    const message = error.message.toLowerCase();

    if (message.includes('not found')) {
      return ErrorCode.ResourceNotFound;
    }
    
    if (message.includes('permission') || message.includes('unauthorized')) {
      return ErrorCode.PermissionDenied;
    }
    
    if (message.includes('invalid') || message.includes('validation')) {
      return ErrorCode.InvalidParams;
    }

    return ErrorCode.InternalError;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    if (this.isCustomError(error)) {
      return (error as ValidationError | ResourceAccessError).retryable;
    }

    const message = error.message.toLowerCase();
    
    // Network and temporary errors are retryable
    if (message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('etimedout')) {
      return true;
    }

    // File system busy errors are retryable
    if (message.includes('ebusy') ||
        message.includes('emfile') ||
        message.includes('enfile')) {
      return true;
    }

    return false;
  }

  /**
   * Create error handler for specific context
   */
  static forContext(
    context: string,
    logger: (level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any) => void,
    config: ErrorHandlerConfig = {}
  ): ErrorHandler {
    return new ErrorHandler(logger, {
      ...config,
      defaultCorrelationId: CorrelationTracker.generateForOperation(context)
    });
  }
}