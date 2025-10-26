/**
 * ResourceAccessError for streaming and file access operations
 */

import { BaseError, ResourceAccessErrorDetail, StreamingErrorDetail } from './types.js';
import { CorrelationTracker } from './correlation-tracker.js';

/**
 * Enhanced ResourceAccessError with correlation tracking and detailed access info
 */
export class ResourceAccessError extends Error implements BaseError {
  public readonly code: string;
  public readonly correlationId: string;
  public readonly severity: BaseError['severity'];
  public readonly category: BaseError['category'];
  public readonly context: Record<string, any>;
  public readonly actions: string[];
  public readonly retryable: boolean;
  public readonly timestamp: number;
  public readonly resourceError?: ResourceAccessErrorDetail;
  public readonly streamingError?: StreamingErrorDetail;

  constructor(
    message: string,
    options: {
      code?: string;
      severity?: BaseError['severity'];
      category?: BaseError['category'];
      context?: Record<string, any>;
      correlationId?: string;
      retryable?: boolean;
      resourceError?: ResourceAccessErrorDetail;
      streamingError?: StreamingErrorDetail;
    } = {}
  ) {
    super(message);
    this.name = 'ResourceAccessError';
    
    this.code = options.code || 'RESOURCE_ACCESS_ERROR';
    this.correlationId = options.correlationId || CorrelationTracker.generateId();
    this.severity = options.severity || 'medium';
    this.category = options.category || 'resource_access';
    this.context = options.context || {};
    this.retryable = options.retryable ?? true; // Resource errors are often retryable
    this.timestamp = Date.now();
    this.resourceError = options.resourceError;
    this.streamingError = options.streamingError;
    
    // Set suggested actions based on error type
    this.actions = this.generateActions(options);
  }

  /**
   * Generate suggested actions based on error details
   */
  private generateActions(options: {
    resourceError?: ResourceAccessErrorDetail;
    streamingError?: StreamingErrorDetail;
    code?: string;
  }): string[] {
    const actions: string[] = [];
    
    // Handle specific error codes first
    if (options.code) {
      switch (options.code) {
        case 'PERMISSION_DENIED':
          actions.push('Check file permissions');
          actions.push('Verify you have read access to the file');
          actions.push('Run with appropriate user privileges');
          break;
        case 'FILE_NOT_FOUND':
          actions.push('Verify the file path is correct');
          actions.push('Check if the file exists');
          actions.push('Ensure file is accessible');
          break;
        case 'FILE_LOCKED':
          actions.push('Wait for the file to be unlocked');
          actions.push('Close other applications using the file');
          actions.push('Retry the operation later');
          break;
      }
    }
    
    if (options.streamingError) {
      const stream = options.streamingError;
      
      switch (stream.reason) {
        case 'STREAM_INTERRUPTED':
          actions.push('Retry operation after a brief pause');
          actions.push('Check network connectivity');
          actions.push('Verify file is not being modified');
          break;
        case 'MEMORY_LIMIT_EXCEEDED':
          actions.push('Reduce chunk size or streaming threshold');
          actions.push('Close other applications to free memory');
          actions.push('Try processing a smaller file');
          break;
        case 'FILE_TOO_LARGE':
          actions.push('Use pagination or streaming for large files');
          actions.push('Increase the streaming threshold');
          actions.push('Process file in smaller chunks');
          break;
        case 'PERMISSION_DENIED':
          actions.push('Check file permissions');
          actions.push('Verify you have read access to the file');
          actions.push('Run with appropriate user privileges');
          break;
        case 'FILE_NOT_FOUND':
          actions.push('Verify the file path is correct');
          actions.push('Check if the file exists');
          actions.push('Ensure the file is accessible');
          break;
        case 'FILE_LOCKED':
          actions.push('Wait for the file to be unlocked');
          actions.push('Close other applications using the file');
          actions.push('Retry the operation later');
          break;
        default:
          actions.push('Check file system status');
          actions.push('Verify resource availability');
          actions.push('Retry the operation');
      }
    }
    
    // Only add resource-based actions if we don't have specific code-based actions
    if (options.resourceError && actions.length === 0) {
      const resource = options.resourceError;
      
      if (!resource.exists) {
        actions.push('Verify the file path is correct');
        actions.push('Check if the file exists');
      }
      
      if (!resource.permissions) {
        actions.push('Check file permissions');
        actions.push('Verify authentication/authorization');
      }
      
      if (resource.accessType === 'read') {
        actions.push('Ensure read permissions are granted');
      } else if (resource.accessType === 'write') {
        actions.push('Ensure write permissions are granted');
        actions.push('Check if the resource is not read-only');
      }
    }
    
    // Add retry hint for retryable errors
    if (this.retryable) {
      actions.push('Use exponential backoff for retries');
      actions.push('Consider implementing circuit breaker pattern');
    }
    
    return actions.length > 0 ? actions : ['Check resource availability and retry'];
  }

  /**
   * Create a streaming interruption error
   */
  static forStreamInterruption(
    uri: string,
    operation: string,
    bytesProcessed: number,
    totalBytes?: number,
    correlationId?: string
  ): ResourceAccessError {
    const streamingError: StreamingErrorDetail = {
      streamType: 'file',
      operation: operation as any,
      bytesProcessed,
      totalBytes,
      streamState: 'reading',
      reason: 'STREAM_INTERRUPTED'
    };

    return new ResourceAccessError(
      `Stream interrupted during ${operation} of ${uri}`,
      {
        code: 'STREAM_INTERRUPTED',
        severity: 'medium',
        category: 'streaming',
        retryable: true,
        streamingError,
        context: { uri, operation, bytesProcessed, totalBytes },
        correlationId
      }
    );
  }

  /**
   * Create a memory limit exceeded error
   */
  static forMemoryLimitExceeded(
    uri: string,
    memoryUsage: number,
    memoryLimit: number,
    correlationId?: string
  ): ResourceAccessError {
    const streamingError: StreamingErrorDetail = {
      streamType: 'memory',
      operation: 'read',
      bytesProcessed: memoryUsage,
      totalBytes: memoryLimit,
      streamState: 'reading',
      reason: 'MEMORY_LIMIT_EXCEEDED'
    };

    return new ResourceAccessError(
      `Memory limit exceeded while processing ${uri}`,
      {
        code: 'MEMORY_LIMIT_EXCEEDED',
        severity: 'high',
        category: 'streaming',
        retryable: false, // Memory limit errors are not retryable without changes
        streamingError,
        context: { uri, memoryUsage, memoryLimit },
        correlationId
      }
    );
  }

  /**
   * Create a file too large error
   */
  static forFileTooLarge(
    uri: string,
    fileSize: number,
    maxSize: number,
    correlationId?: string
  ): ResourceAccessError {
    const streamingError: StreamingErrorDetail = {
      streamType: 'file',
      operation: 'read',
      bytesProcessed: 0,
      totalBytes: fileSize,
      streamState: 'opening',
      reason: 'FILE_TOO_LARGE'
    };

    return new ResourceAccessError(
      `File ${uri} is too large (${fileSize} bytes > ${maxSize} bytes limit)`,
      {
        code: 'FILE_TOO_LARGE',
        severity: 'medium',
        category: 'streaming',
        retryable: false, // Need to change approach, not just retry
        streamingError,
        context: { uri, fileSize, maxSize },
        correlationId
      }
    );
  }

  /**
   * Create a permission denied error
   */
  static forPermissionDenied(
    uri: string,
    accessType: 'read' | 'write' | 'execute',
    correlationId?: string
  ): ResourceAccessError {
    const resourceError: ResourceAccessErrorDetail = {
      uri,
      accessType,
      reason: 'PERMISSION_DENIED',
      exists: true,
      permissions: false
    };

    return new ResourceAccessError(
      `Permission denied for ${accessType} access to ${uri}`,
      {
        code: 'PERMISSION_DENIED',
        severity: 'high',
        category: 'security',
        retryable: false, // Permission errors are not retryable
        resourceError,
        context: { uri, accessType },
        correlationId
      }
    );
  }

  /**
   * Create a file not found error
   */
  static forFileNotFound(
    uri: string,
    correlationId?: string
  ): ResourceAccessError {
    const resourceError: ResourceAccessErrorDetail = {
      uri,
      accessType: 'read',
      reason: 'FILE_NOT_FOUND',
      exists: false,
      permissions: false
    };

    return new ResourceAccessError(
      `File not found: ${uri}`,
      {
        code: 'FILE_NOT_FOUND',
        severity: 'medium',
        category: 'resource_access',
        retryable: false, // File not found is not retryable
        resourceError,
        context: { uri },
        correlationId
      }
    );
  }

  /**
   * Create a file locked error
   */
  static forFileLocked(
    uri: string,
    correlationId?: string
  ): ResourceAccessError {
    const resourceError: ResourceAccessErrorDetail = {
      uri,
      accessType: 'read',
      reason: 'FILE_LOCKED',
      exists: true,
      permissions: true
    };

    return new ResourceAccessError(
      `File is locked: ${uri}`,
      {
        code: 'FILE_LOCKED',
        severity: 'medium',
        category: 'resource_access',
        retryable: true, // File locked might be retryable
        resourceError,
        context: { uri },
        correlationId
      }
    );
  }

  /**
   * Create a general resource access error
   */
  static forGeneralAccess(
    uri: string,
    reason: string,
    severity: BaseError['severity'] = 'medium',
    retryable: boolean = true,
    correlationId?: string
  ): ResourceAccessError {
    const resourceError: ResourceAccessErrorDetail = {
      uri,
      accessType: 'read',
      reason,
      exists: true,
      permissions: true
    };

    return new ResourceAccessError(
      `Resource access failed for ${uri}: ${reason}`,
      {
        code: 'RESOURCE_ACCESS_ERROR',
        severity,
        category: 'resource_access',
        retryable,
        resourceError,
        context: { uri, reason },
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
        code: -32005, // ResourceAccessDenied
        message: this.message,
        data: {
          correlationId: this.correlationId,
          category: this.category,
          severity: this.severity,
          retryable: this.retryable,
          actions: this.actions,
          context: {
            ...this.context,
            resourceError: this.resourceError,
            streamingError: this.streamingError
          }
        }
      }
    };
  }

  /**
   * Check if error is related to streaming
   */
  isStreamingError(): boolean {
    return this.category === 'streaming' || !!this.streamingError;
  }

  /**
   * Check if error is related to permissions
   */
  isPermissionError(): boolean {
    return this.category === 'security' || 
           this.code === 'PERMISSION_DENIED' ||
           (this.resourceError?.reason === 'PERMISSION_DENIED');
  }

  /**
   * Check if error is related to resource not existing
   */
  isNotFoundError(): boolean {
    return this.code === 'FILE_NOT_FOUND' ||
           (this.resourceError?.exists === false);
  }

  /**
   * Get retry delay suggestion in milliseconds
   */
  getRetryDelay(): number {
    if (!this.retryable) {
      return 0;
    }

    switch (this.code) {
      case 'STREAM_INTERRUPTED':
        return 1000; // 1 second
      case 'FILE_LOCKED':
        return 2000; // 2 seconds
      case 'RESOURCE_ACCESS_ERROR':
        return 500; // 500ms
      default:
        return 1000; // Default 1 second
    }
  }
}