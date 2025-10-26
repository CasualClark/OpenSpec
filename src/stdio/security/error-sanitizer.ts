/**
 * Error Message Sanitization Framework
 * 
 * Provides comprehensive error message sanitization to prevent information disclosure
 * while maintaining helpful error messages for legitimate users.
 */

import { AuditLogger } from './audit-logger.js';

export interface ErrorSanitizationOptions {
  /** Error context for classification */
  context?: 'tool' | 'resource' | 'cli' | 'server' | 'core';
  /** User type for message tailoring */
  userType?: 'user' | 'developer' | 'system';
  /** Whether to include technical details */
  includeTechnical?: boolean;
  /** Whether to log detailed error information */
  logDetails?: boolean;
  /** Custom error message overrides */
  overrides?: Record<string, string>;
}

export interface SanitizedError {
  /** Safe error message for user */
  message: string;
  /** Error category for handling */
  category: 'user_error' | 'developer_error' | 'system_error' | 'security_error';
  /** Error severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Suggested actions for user */
  actions?: string[];
  /** Original error ID for reference */
  errorId: string;
  /** Whether technical details were logged */
  detailsLogged: boolean;
}

export interface ErrorPattern {
  /** Pattern to match */
  pattern: RegExp;
  /** Sanitized replacement */
  replacement: string;
  /** Error category */
  category: SanitizedError['category'];
  /** Severity level */
  severity: SanitizedError['severity'];
  /** Additional context for logging */
  context?: string;
}

/**
 * Comprehensive error message sanitizer for Task MCP
 */
export class ErrorSanitizer {
  private static auditLogger: AuditLogger | null = null;
  
  // Sensitive information patterns to detect and sanitize
  private static readonly SENSITIVE_PATTERNS: ErrorPattern[] = [
    // File paths - replace with generic location descriptions
    {
      pattern: /\/[uU]sers\/[^\/\s]+/g,
      replacement: '/users/[user]',
      category: 'system_error',
      severity: 'medium',
      context: 'user_home_path'
    },
    {
      pattern: /\/[hH]ome\/[^\/\s]+/g,
      replacement: '/home/[user]',
      category: 'system_error',
      severity: 'medium',
      context: 'user_home_path'
    },
    {
      pattern: /\/(?:tmp|temp|var|etc|usr|opt|srv)\/[^\s\n]+/g,
      replacement: '/[system-directory]/[path]',
      category: 'system_error',
      severity: 'medium',
      context: 'system_path'
    },
    {
      pattern: /[A-Za-z]:\\[Uu]sers\\[^\\]+/g,
      replacement: 'C:\\Users\\[user]',
      category: 'system_error',
      severity: 'medium',
      context: 'windows_user_path'
    },
    {
      pattern: /[A-Za-z]:\\(?:Windows|Program Files|ProgramData)\\[^\s\n]+/g,
      replacement: 'C:\\[system-directory]\\[path]',
      category: 'system_error',
      severity: 'medium',
      context: 'windows_system_path'
    },
    
    // Usernames and identifiers
    {
      pattern: /\b(user|uid|username)[:\s=]+([a-zA-Z0-9._-]+)/gi,
      replacement: '$1: [username]',
      category: 'security_error',
      severity: 'high',
      context: 'username_disclosure'
    },
    {
      pattern: /\b(owner|author)[:\s=]+([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)/gi,
      replacement: '$1: [owner]',
      category: 'security_error',
      severity: 'high',
      context: 'owner_disclosure'
    },
    
    // Process and system information
    {
      pattern: /\b(pid|process)[:\s=]+\d+/gi,
      replacement: '$1: [process-id]',
      category: 'system_error',
      severity: 'low',
      context: 'process_id'
    },
    {
      pattern: /\b(hostname|host)[:\s=]+[a-zA-Z0-9._-]+/gi,
      replacement: '$1: [hostname]',
      category: 'system_error',
      severity: 'medium',
      context: 'hostname_disclosure'
    },
    
    // Stack traces and technical details
    {
      pattern: /\b(at\s+)[A-Za-z0-9._/\\:-]+\.[A-Za-z0-9_]+\([^)]*\)/g,
      replacement: '$1[internal-function]',
      category: 'system_error',
      severity: 'low',
      context: 'stack_trace'
    },
    {
      pattern: /\b(at\s+)[A-Za-z0-9._/\\:-]+:\d+/g,
      replacement: '$1[location]',
      category: 'system_error',
      severity: 'low',
      context: 'file_location'
    },
    
    // Database and connection strings
    {
      pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^:\s\n]+:[^@\s\n]+@[^\s\n]+/g,
      replacement: '[connection-string]',
      category: 'security_error',
      severity: 'critical',
      context: 'database_connection'
    },
    
    // API keys and tokens - more flexible pattern
    {
      pattern: /\b(api[_-]?key|token|secret|password|pwd)[:\s=]+[A-Za-z0-9+/=_-]{8,}/gi,
      replacement: '$1: [redacted]',
      category: 'security_error',
      severity: 'critical',
      context: 'credential_disclosure'
    },
    
    // File content snippets
    {
      pattern: /File content:.*?\n[\s\S]{1,200}?Error:/gi,
      replacement: 'File content: [redacted]\nError:',
      category: 'security_error',
      severity: 'high',
      context: 'file_content_disclosure'
    }
  ];

  // Error message templates by category and context
  private static readonly ERROR_TEMPLATES = {
    user_error: {
      tool: {
        low: 'Operation failed. Please check your input and try again.',
        medium: 'Invalid input provided. Please verify the required parameters.',
        high: 'Input validation failed. The request contains invalid data.',
        critical: 'Request rejected due to invalid input format.'
      },
      resource: {
        low: 'Resource access failed. Please try again.',
        medium: 'Resource not found or unavailable.',
        high: 'Access to the requested resource is not permitted.',
        critical: 'Resource access denied due to security restrictions.'
      },
      cli: {
        low: 'Command failed. Please check the syntax and try again.',
        medium: 'Invalid command parameters provided.',
        high: 'Command execution failed due to invalid input.',
        critical: 'Command rejected due to security validation.'
      },
      server: {
        low: 'Request processing failed. Please try again.',
        medium: 'Invalid request format received.',
        high: 'Request rejected due to validation errors.',
        critical: 'Request blocked due to security policy violation.'
      },
      core: {
        low: 'Operation completed with errors. Please review the input.',
        medium: 'Core operation failed due to invalid parameters.',
        high: 'Critical validation error in core operation.',
        critical: 'Core operation rejected due to security constraints.'
      }
    },
    developer_error: {
      tool: {
        low: 'Tool execution encountered an error. Check the implementation.',
        medium: 'Tool configuration error detected.',
        high: 'Critical tool error - implementation issue found.',
        critical: 'Tool execution blocked due to security violation.'
      },
      resource: {
        low: 'Resource provider error occurred.',
        medium: 'Resource configuration error detected.',
        high: 'Resource provider implementation error.',
        critical: 'Resource access blocked due to security policy.'
      },
      cli: {
        low: 'CLI command error occurred.',
        medium: 'CLI configuration error detected.',
        high: 'CLI implementation error found.',
        critical: 'CLI command blocked due to security violation.'
      },
      server: {
        low: 'Server processing error occurred.',
        medium: 'Server configuration error detected.',
        high: 'Server implementation error found.',
        critical: 'Server operation blocked due to security policy.'
      },
      core: {
        low: 'Core utility error occurred.',
        medium: 'Core configuration error detected.',
        high: 'Core implementation error found.',
        critical: 'Core operation blocked due to security violation.'
      }
    },
    system_error: {
      tool: {
        low: 'System resource temporarily unavailable.',
        medium: 'Tool operation failed due to system constraints.',
        high: 'Critical system error affecting tool operation.',
        critical: 'Tool operation blocked due to system security policy.'
      },
      resource: {
        low: 'Resource temporarily unavailable.',
        medium: 'Resource access failed due to system limitations.',
        high: 'Critical system error affecting resource access.',
        critical: 'Resource access blocked due to system security.'
      },
      cli: {
        low: 'System operation failed. Please try again.',
        medium: 'CLI operation failed due to system constraints.',
        high: 'Critical system error affecting CLI operation.',
        critical: 'CLI operation blocked due to system security.'
      },
      server: {
        low: 'Server temporarily unavailable.',
        medium: 'Server operation failed due to system limitations.',
        high: 'Critical system error affecting server operation.',
        critical: 'Server operation blocked due to system security.'
      },
      core: {
        low: 'Core system operation failed.',
        medium: 'Core operation failed due to system constraints.',
        high: 'Critical system error affecting core operations.',
        critical: 'Core operation blocked due to system security.'
      }
    },
    security_error: {
      tool: {
        low: 'Security validation failed.',
        medium: 'Operation blocked due to security policy.',
        high: 'Security violation detected - operation blocked.',
        critical: 'Critical security violation - operation terminated.'
      },
      resource: {
        low: 'Resource access security check failed.',
        medium: 'Resource access blocked by security policy.',
        high: 'Security violation in resource access - blocked.',
        critical: 'Critical security violation - resource access denied.'
      },
      cli: {
        low: 'Command security validation failed.',
        medium: 'Command blocked by security policy.',
        high: 'Security violation in command - blocked.',
        critical: 'Critical security violation - command rejected.'
      },
      server: {
        low: 'Request security validation failed.',
        medium: 'Request blocked by security policy.',
        high: 'Security violation in request - blocked.',
        critical: 'Critical security violation - request rejected.'
      },
      core: {
        low: 'Core operation security check failed.',
        medium: 'Core operation blocked by security policy.',
        high: 'Security violation in core operation - blocked.',
        critical: 'Critical security violation - core operation terminated.'
      }
    }
  };

  // Suggested actions by error type
  private static readonly SUGGESTED_ACTIONS = {
    user_error: {
      tool: [
        'Verify input parameters match the expected format',
        'Check that all required fields are provided',
        'Review the documentation for proper usage'
      ],
      resource: [
        'Verify the resource exists and is accessible',
        'Check that you have the required permissions',
        'Ensure the resource URI is correct'
      ],
      cli: [
        'Check command syntax and parameters',
        'Verify required arguments are provided',
        'Review the command help documentation'
      ],
      server: [
        'Verify the request format is correct',
        'Check that all required fields are included',
        'Review the API documentation'
      ],
      core: [
        'Verify operation parameters are valid',
        'Check that required context is provided',
        'Review the operation requirements'
      ]
    },
    developer_error: {
      tool: [
        'Check tool implementation for bugs',
        'Verify tool configuration is correct',
        'Review tool error logs for details'
      ],
      resource: [
        'Check resource provider implementation',
        'Verify resource configuration',
        'Review resource access logs'
      ],
      cli: [
        'Check CLI command implementation',
        'Verify CLI configuration',
        'Review CLI error logs'
      ],
      server: [
        'Check server implementation',
        'Verify server configuration',
        'Review server error logs'
      ],
      core: [
        'Check core utility implementation',
        'Verify core configuration',
        'Review core error logs'
      ]
    },
    system_error: {
      tool: [
        'Wait a moment and try again',
        'Check system resource availability',
        'Verify system permissions'
      ],
      resource: [
        'Wait and retry the operation',
        'Check system resource limits',
        'Verify file system permissions'
      ],
      cli: [
        'Retry the command after a brief pause',
        'Check system resource usage',
        'Verify system permissions'
      ],
      server: [
        'Wait and retry the request',
        'Check server resource availability',
        'Verify system status'
      ],
      core: [
        'Retry the operation after a pause',
        'Check system resource limits',
        'Verify system permissions'
      ]
    },
    security_error: {
      tool: [
        'Review security policy requirements',
        'Check input for prohibited content',
        'Verify authentication/authorization'
      ],
      resource: [
        'Verify you have proper permissions',
        'Check resource access policies',
        'Review security configuration'
      ],
      cli: [
        'Verify command is allowed by security policy',
        'Check authentication status',
        'Review security configuration'
      ],
      server: [
        'Verify request complies with security policy',
        'Check authentication credentials',
        'Review security configuration'
      ],
      core: [
        'Verify operation meets security requirements',
        'Check security context',
        'Review security policies'
      ]
    }
  };

  /**
   * Initialize the error sanitizer with audit logger
   */
  static initialize(auditLogger: AuditLogger): void {
    this.auditLogger = auditLogger;
  }

  /**
   * Sanitize an error message for user consumption
   */
  static sanitize(
    error: Error | string,
    options: ErrorSanitizationOptions = {}
  ): SanitizedError {
    const errorMessage = error instanceof Error ? error.message : error;
    const originalError = error instanceof Error ? error.stack || errorMessage : errorMessage;
    
    // Generate unique error ID for tracking
    const errorId = this.generateErrorId();
    
    // Determine context
    const context = options.context || 'tool';
    const userType = options.userType || 'user';
    
    // Detect and classify the error
    const classification = this.classifyError(errorMessage, context);
    
    // Apply sanitization patterns
    let sanitizedMessage = this.applySanitizationPatterns(errorMessage);
    
    // Apply custom overrides if provided
    if (options.overrides && options.overrides[errorMessage]) {
      sanitizedMessage = options.overrides[errorMessage];
    }
    
    // Generate appropriate message template if heavily sanitized
    if (this.isHeavilySanitized(errorMessage, sanitizedMessage)) {
      sanitizedMessage = this.generateTemplateMessage(classification.category, context, classification.severity);
    }
    
    // Log detailed error information securely
    const detailsLogged = this.logSecureError(errorId, originalError, classification, options);
    
    // Get suggested actions
    const actions = this.getSuggestedActions(classification.category, context, userType);
    
    return {
      message: sanitizedMessage,
      category: classification.category,
      severity: classification.severity,
      actions,
      errorId,
      detailsLogged
    };
  }

  /**
   * Sanitize error for logging (more detailed than user-facing)
   */
  static sanitizeForLogging(
    error: Error | string,
    context: string = 'unknown'
  ): { message: string; details: any; sanitized: boolean } {
    const errorMessage = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    
    // Apply lighter sanitization for logs - redact sensitive paths and credentials
    let sanitizedMessage = errorMessage;
    let sanitized = false;
    
    // Redact file paths and user information for logs
    const pathPatterns = this.SENSITIVE_PATTERNS.filter(p => 
      p.context?.includes('path') || p.context?.includes('user')
    );
    for (const pattern of pathPatterns) {
      if (pattern.pattern.test(sanitizedMessage)) {
        if (pattern.pattern.global) {
          pattern.pattern.lastIndex = 0;
        }
        sanitizedMessage = sanitizedMessage.replace(pattern.pattern, pattern.replacement);
        sanitized = true;
      }
    }
    
    // Also redact critical and high severity security info for logs
    const securityPatterns = this.SENSITIVE_PATTERNS.filter(p => 
      (p.severity === 'critical' || p.severity === 'high') && p.category === 'security_error'
    );
    for (const pattern of securityPatterns) {
      if (pattern.pattern.test(sanitizedMessage)) {
        if (pattern.pattern.global) {
          pattern.pattern.lastIndex = 0;
        }
        sanitizedMessage = sanitizedMessage.replace(pattern.pattern, pattern.replacement);
        sanitized = true;
      }
    }
    
    const details = {
      context,
      timestamp: new Date().toISOString(),
      stack: stack ? this.sanitizeStack(stack) : undefined,
      sanitized
    };
    
    return {
      message: sanitizedMessage,
      details,
      sanitized
    };
  }

  /**
   * Check if an error message contains sensitive information
   */
  static containsSensitiveInfo(message: string): boolean {
    return this.SENSITIVE_PATTERNS.some(pattern => pattern.pattern.test(message));
  }

  /**
   * Generate a unique error ID for tracking
   */
  private static generateErrorId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `err_${timestamp}_${random}`;
  }

  /**
   * Classify error based on content and context
   */
  private static classifyError(
    message: string,
    context: string
  ): { category: SanitizedError['category']; severity: SanitizedError['severity'] } {
    if (!message || typeof message !== 'string') {
      return { category: 'system_error', severity: 'low' };
    }
    
    // First check for sensitive patterns that should override classification
    for (const pattern of this.SENSITIVE_PATTERNS) {
      if (pattern.pattern.test(message)) {
        // Security patterns have highest priority
        if (pattern.category === 'security_error') {
          return { category: pattern.category, severity: pattern.severity };
        }
      }
    }
    
    const lowerMessage = message.toLowerCase();
    
    // Security errors (highest priority)
    if (lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('forbidden') ||
        lowerMessage.includes('access denied') ||
        lowerMessage.includes('security violation') ||
        lowerMessage.includes('authentication failed') ||
        lowerMessage.includes('permission denied')) {
      return { category: 'security_error', severity: 'high' };
    }
    
    // Input validation errors
    if (lowerMessage.includes('invalid') ||
        lowerMessage.includes('validation') ||
        lowerMessage.includes('malformed') ||
        lowerMessage.includes('bad request') ||
        lowerMessage.includes('schema')) {
      return { category: 'user_error', severity: 'medium' };
    }
    
    // Not found errors
    if (lowerMessage.includes('not found') ||
        lowerMessage.includes('does not exist') ||
        lowerMessage.includes('missing')) {
      return { category: 'user_error', severity: 'low' };
    }
    
    // System errors
    if (lowerMessage.includes('enoent') ||
        lowerMessage.includes('eacces') ||
        lowerMessage.includes('eperm') ||
        lowerMessage.includes('permission denied') ||
        lowerMessage.includes('system') ||
        lowerMessage.includes('internal')) {
      return { category: 'system_error', severity: 'medium' };
    }
    
    // Developer/implementation errors
    if (lowerMessage.includes('undefined') ||
        lowerMessage.includes('null') ||
        lowerMessage.includes('cannot read') ||
        lowerMessage.includes('type error') ||
        lowerMessage.includes('reference error')) {
      return { category: 'developer_error', severity: 'high' };
    }
    
    // Default classification
    return { category: 'system_error', severity: 'low' };
  }

  /**
   * Apply sanitization patterns to error message
   */
  private static applySanitizationPatterns(message: string): string {
    let sanitized = message;
    
    // Apply patterns in order of severity (critical first)
    const sortedPatterns = [...this.SENSITIVE_PATTERNS].sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
    
    for (const pattern of sortedPatterns) {
      // Reset regex lastIndex for global patterns
      if (pattern.pattern.global) {
        pattern.pattern.lastIndex = 0;
      }
      if (pattern.pattern.test(sanitized)) {
        // Reset again before replace
        if (pattern.pattern.global) {
          pattern.pattern.lastIndex = 0;
        }
        sanitized = sanitized.replace(pattern.pattern, pattern.replacement);
      }
    }
    
    return sanitized;
  }

  /**
   * Check if message was heavily sanitized
   */
  private static isHeavilySanitized(original: string, sanitized: string): boolean {
    if (!original || !sanitized) {
      return false;
    }
    
    const originalLength = original.length;
    const sanitizedLength = sanitized.length;
    const reductionRatio = (originalLength - sanitizedLength) / originalLength;
    
    // Consider heavily sanitized if more than 30% was replaced
    return reductionRatio > 0.3;
  }

  /**
   * Generate template message based on category and severity
   */
  private static generateTemplateMessage(
    category: SanitizedError['category'],
    context: string,
    severity: SanitizedError['severity']
  ): string {
    const templates = this.ERROR_TEMPLATES[category];
    const contextTemplates = templates[context as keyof typeof templates] || templates.tool;
    return contextTemplates[severity] || contextTemplates.medium;
  }

  /**
   * Log detailed error information securely
   */
  private static logSecureError(
    errorId: string,
    originalError: string,
    classification: { category: SanitizedError['category']; severity: SanitizedError['severity'] },
    options: ErrorSanitizationOptions
  ): boolean {
    if (!this.auditLogger || !options.logDetails) {
      return false;
    }
    
    try {
      this.auditLogger.logSecurityViolation('error_sanitization', {
        errorId,
        category: classification.category,
        severity: classification.severity,
        context: options.context,
        userType: options.userType,
        originalError: this.sanitizeForLogging(originalError, 'error_sanitization'),
        timestamp: new Date().toISOString()
      }, classification.severity);
      
      return true;
    } catch (error) {
      console.error('Failed to log sanitized error:', error);
      return false;
    }
  }

  /**
   * Get suggested actions for error type and context
   */
  private static getSuggestedActions(
    category: SanitizedError['category'],
    context: string,
    userType: string
  ): string[] {
    const actions = this.SUGGESTED_ACTIONS[category];
    const contextActions = actions[context as keyof typeof actions] || actions.tool;
    
    // Filter actions based on user type
    if (userType === 'user') {
      return contextActions.filter(action => 
        !action.toLowerCase().includes('implementation') &&
        !action.toLowerCase().includes('configuration') &&
        !action.toLowerCase().includes('logs')
      );
    }
    
    return contextActions;
  }

  /**
   * Sanitize stack trace for logging
   */
  private static sanitizeStack(stack: string): string {
    let sanitized = stack;
    
    // Remove sensitive paths
    sanitized = sanitized.replace(/\/[uU]sers\/[^\/\s]+/g, '/users/[user]');
    sanitized = sanitized.replace(/\/[hH]ome\/[^\/\s]+/g, '/home/[user]');
    sanitized = sanitized.replace(/[A-Za-z]:\\[Uu]sers\\[^\\]+/g, 'C:\\Users\\[user]');
    
    // Remove potentially sensitive function arguments
    sanitized = sanitized.replace(/\([^)]*\)/g, '([args])');
    
    return sanitized;
  }
}