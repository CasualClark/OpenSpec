/**
 * Enhanced Error Types for OpenSpec MCP Server
 */

import { ErrorCode } from '../types/index.js';

/**
 * Base error interface for all custom errors
 */
export interface BaseError {
  /** Error message */
  message: string;
  /** Error code for classification */
  code: ErrorCode | string;
  /** Correlation ID for tracking */
  correlationId: string;
  /** Error severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Error category */
  category: 'validation' | 'resource_access' | 'streaming' | 'system' | 'security';
  /** Additional context */
  context?: Record<string, any>;
  /** Suggested actions for resolution */
  actions?: string[];
  /** Whether error is retryable */
  retryable: boolean;
  /** Timestamp when error occurred */
  timestamp: number;
}

/**
 * Validation error details
 */
export interface ValidationErrorDetail {
  /** Field that failed validation */
  field: string;
  /** Validation error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Current value that failed */
  value?: any;
  /** Expected value or constraint */
  expected?: any;
}

/**
 * Pagination validation result
 */
export interface PaginationValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validated page number */
  page: number;
  /** Validated page size */
  pageSize: number;
  /** Validation errors if any */
  errors: ValidationErrorDetail[];
}

/**
 * Resource access error details
 */
export interface ResourceAccessErrorDetail {
  /** Resource URI that failed */
  uri: string;
  /** Type of access failure */
  accessType: 'read' | 'write' | 'execute';
  /** Specific failure reason */
  reason: string;
  /** Whether resource exists */
  exists: boolean;
  /** Whether permissions are sufficient */
  permissions: boolean;
}

/**
 * Streaming error details
 */
export interface StreamingErrorDetail {
  /** Stream type */
  streamType: 'file' | 'memory' | 'network';
  /** Current operation */
  operation: 'read' | 'write' | 'seek' | 'close';
  /** Bytes processed before failure */
  bytesProcessed: number;
  /** Total bytes expected */
  totalBytes?: number;
  /** Stream state at failure */
  streamState: 'opening' | 'reading' | 'writing' | 'closing' | 'closed';
  /** Reason for failure */
  reason: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Whether to use jitter */
  jitter: boolean;
  /** Error types that should not be retried */
  nonRetryableErrors: string[];
}

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  /** Attempt number (1-based) */
  attempt: number;
  /** Error that occurred */
  error: Error;
  /** Delay before this attempt */
  delay: number;
  /** Timestamp of attempt */
  timestamp: number;
}

/**
 * Retry result
 */
export interface RetryResult<T = any> {
  /** Whether operation eventually succeeded */
  success: boolean;
  /** Result if successful */
  result?: T;
  /** Final error if failed */
  finalError?: Error;
  /** All retry attempts */
  attempts: RetryAttempt[];
  /** Total time spent retrying */
  totalRetryTime: number;
}

/**
 * Error classification for handling decisions
 */
export interface ErrorClassification {
  /** Error category */
  category: BaseError['category'];
  /** Error severity */
  severity: BaseError['severity'];
  /** Whether error is retryable */
  retryable: boolean;
  /** Suggested delay before retry */
  retryDelay?: number;
  /** Whether error should be logged */
  loggable: boolean;
  /** Whether error should be reported to monitoring */
  monitorable: boolean;
}

/**
 * MCP-compliant error response format
 */
export interface MCPErrorResponse {
  /** JSON-RPC version */
  jsonrpc: '2.0';
  /** Request ID */
  id: string | number | null;
  /** Error object */
  error: {
    /** Error code */
    code: number;
    /** Error message */
    message: string;
    /** Additional error data */
    data?: {
      /** Correlation ID */
      correlationId: string;
      /** Error category */
      category: string;
      /** Error severity */
      severity: string;
      /** Whether retryable */
      retryable: boolean;
      /** Suggested actions */
      actions?: string[];
      /** Additional context */
      context?: Record<string, any>;
    };
  };
}