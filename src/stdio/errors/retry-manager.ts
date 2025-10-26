/**
 * Retry Manager for handling retry logic with proper error classification
 */

import { RetryConfig, RetryResult, RetryAttempt } from './types.js';

/**
 * Error classification for retry decisions
 */
interface ErrorClassification {
  /** Error category */
  category: 'validation' | 'resource_access' | 'streaming' | 'system' | 'security';
  /** Error severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Whether error is retryable */
  retryable: boolean;
  /** Suggested delay before retry */
  retryDelay?: number;
  /** Whether error should be logged */
  loggable: boolean;
  /** Whether error should be reported to monitoring */
  monitorable: boolean;
}
import { ResourceAccessError } from './resource-access-error.js';
import { ValidationError } from './validation-error.js';
import { CorrelationTracker } from './correlation-tracker.js';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true,
  nonRetryableErrors: [
    'VALIDATION_ERROR',
    'PERMISSION_DENIED',
    'FILE_NOT_FOUND',
    'MEMORY_LIMIT_EXCEEDED',
    'FILE_TOO_LARGE'
  ]
};

/**
 * Retry manager with exponential backoff and jitter
 */
export class RetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Execute an operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    options: {
      correlationId?: string;
      customConfig?: Partial<RetryConfig>;
      onRetry?: (attempt: RetryAttempt) => void;
    } = {}
  ): Promise<RetryResult<T>> {
    const config = { ...this.config, ...options.customConfig };
    const correlationId = options.correlationId || CorrelationTracker.generateId();
    const startTime = Date.now();
    
    const attempts: RetryAttempt[] = [];
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        return {
          success: true,
          result,
          attempts,
          totalRetryTime: Date.now() - startTime
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const classification = this.classifyError(lastError);
        const delay = this.calculateDelay(attempt, classification, config);
        
        const retryAttempt: RetryAttempt = {
          attempt,
          error: lastError,
          delay,
          timestamp: Date.now()
        };
        
        attempts.push(retryAttempt);
        
        // Call retry callback if provided
        if (options.onRetry) {
          options.onRetry(retryAttempt);
        }
        
        // Check if we should retry
        if (attempt >= config.maxAttempts || !classification.retryable) {
          break;
        }
        
        // Wait before retry
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      finalError: lastError,
      attempts,
      totalRetryTime: Date.now() - startTime
    };
  }

  /**
   * Classify error for retry decisions
   */
  private classifyError(error: Error): ErrorClassification {
    // Custom errors
    if (error instanceof ValidationError) {
      return {
        category: error.category,
        severity: error.severity,
        retryable: error.retryable,
        loggable: true,
        monitorable: error.severity === 'high' || error.severity === 'critical'
      };
    }

    if (error instanceof ResourceAccessError) {
      return {
        category: error.category,
        severity: error.severity,
        retryable: error.retryable,
        retryDelay: error.getRetryDelay(),
        loggable: true,
        monitorable: error.severity === 'high' || error.severity === 'critical'
      };
    }

    // System errors
    const message = error.message.toLowerCase();
    
    // Network-related errors (retryable)
    if (message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('enotfound') ||
        message.includes('network') ||
        message.includes('connection')) {
      return {
        category: 'system',
        severity: 'medium',
        retryable: true,
        retryDelay: 2000,
        loggable: true,
        monitorable: false
      };
    }

    // File system errors (sometimes retryable)
    if (message.includes('ebusy') ||
        message.includes('emfile') ||
        message.includes('enfile') ||
        message.includes('too many open files')) {
      return {
        category: 'system',
        severity: 'high',
        retryable: true,
        retryDelay: 5000,
        loggable: true,
        monitorable: true
      };
    }

    // Permission and not found errors (not retryable)
    if (message.includes('eacces') ||
        message.includes('eperm') ||
        message.includes('enoent') ||
        message.includes('permission denied') ||
        message.includes('not found')) {
      return {
        category: 'security',
        severity: 'high',
        retryable: false,
        loggable: true,
        monitorable: true
      };
    }

    // Default: retry with caution
    return {
      category: 'system',
      severity: 'medium',
      retryable: true,
      retryDelay: 1000,
      loggable: true,
      monitorable: false
    };
  }

  /**
   * Calculate delay before next retry
   */
  private calculateDelay(
    attempt: number,
    classification: ErrorClassification,
    config: RetryConfig
  ): number {
    // Use classification-specific delay if available
    if (classification.retryDelay) {
      return this.applyJitter(classification.retryDelay, config);
    }

    // Exponential backoff
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);
    
    // Apply jitter
    return this.applyJitter(delay, config);
  }

  /**
   * Apply jitter to delay to prevent thundering herd
   */
  private applyJitter(delay: number, config: RetryConfig): number {
    if (!config.jitter) {
      return delay;
    }

    // Add ±25% random jitter
    const jitterFactor = 0.25;
    const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
    
    return Math.max(0, Math.floor(delay + jitter));
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error type is retryable based on configuration
   */
  isRetryableError(error: Error): boolean {
    const errorCode = (error as any).code || error.message;
    
    // Check if error code is in non-retryable list
    if (this.config.nonRetryableErrors.includes(errorCode)) {
      return false;
    }

    // Check custom error types
    if (error instanceof ValidationError) {
      return error.retryable;
    }

    if (error instanceof ResourceAccessError) {
      return error.retryable;
    }

    // Default classification
    const classification = this.classifyError(error);
    return classification.retryable;
  }

  /**
   * Create a retry manager for streaming operations
   */
  static forStreaming(config: Partial<RetryConfig> = {}): RetryManager {
    return new RetryManager({
      maxAttempts: 5,
      baseDelay: 500,
      maxDelay: 10000,
      backoffMultiplier: 1.5,
      jitter: true,
      nonRetryableErrors: [
        'VALIDATION_ERROR',
        'PERMISSION_DENIED',
        'FILE_NOT_FOUND',
        'MEMORY_LIMIT_EXCEEDED',
        'FILE_TOO_LARGE'
      ],
      ...config
    });
  }

  /**
   * Create a retry manager for pagination operations
   */
  static forPagination(config: Partial<RetryConfig> = {}): RetryManager {
    return new RetryManager({
      maxAttempts: 3,
      baseDelay: 200,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitter: true,
      nonRetryableErrors: [
        'VALIDATION_ERROR',
        'PERMISSION_DENIED',
        'FILE_NOT_FOUND',
        'PAGINATION_VALIDATION_ERROR'
      ],
      ...config
    });
  }

  /**
   * Create a retry manager for resource access operations
   */
  static forResourceAccess(config: Partial<RetryConfig> = {}): RetryManager {
    return new RetryManager({
      maxAttempts: 4,
      baseDelay: 1000,
      maxDelay: 15000,
      backoffMultiplier: 2,
      jitter: true,
      nonRetryableErrors: [
        'VALIDATION_ERROR',
        'PERMISSION_DENIED',
        'FILE_NOT_FOUND',
        'FILE_TOO_LARGE'
      ],
      ...config
    });
  }
}