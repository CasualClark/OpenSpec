/**
 * Enhanced Input Sanitization Layer
 * 
 * Provides comprehensive input sanitization beyond JSON schema validation
 * to prevent injection attacks, XSS, and other security vulnerabilities.
 */

import { ValidationResult } from '../types/index.js';

export interface SanitizationOptions {
  /** Maximum allowed string length */
  maxLength?: number;
  /** Whether to allow HTML tags (default: false) */
  allowHtml?: boolean;
  /** Whether to allow binary content (default: false) */
  allowBinary?: boolean;
  /** Custom allowed characters pattern */
  allowedChars?: RegExp | null;
  /** Whether to sanitize Unicode (default: true) */
  sanitizeUnicode?: boolean;
  /** Maximum depth for nested objects */
  maxDepth?: number;
}

export interface SanitizationResult {
  /** Whether the input passed sanitization */
  isSafe: boolean;
  /** Sanitized content */
  sanitized: any;
  /** Security issues found */
  issues: SecurityIssue[];
  /** Original input hash for detection */
  originalHash?: string;
}

export interface SecurityIssue {
  type: 'xss' | 'command_injection' | 'path_traversal' | 'binary_content' | 'oversized' | 'invalid_unicode' | 'deep_nesting';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  path?: string;
  pattern?: string;
}

/**
 * Comprehensive input sanitizer for Task MCP
 */
export class InputSanitizer {
  private static readonly DEFAULT_MAX_LENGTH = 100000; // 100KB
  private static readonly DEFAULT_MAX_DEPTH = 10;
  
  // Dangerous patterns for command injection
  private static readonly COMMAND_INJECTION_PATTERNS = [
    /[;&|`$(){}[\]]/,                    // Shell metacharacters
    /\b(curl|wget|nc|netcat|ssh|ftp)\b/i, // Network commands
    /\b(rm|mv|cp|chmod|chown)\b/i,       // File system commands
    /\b(cat|less|more|head|tail)\b/i,    // File reading commands
    /\b(ps|kill|killall|pkill)\b/i,      // Process commands
    /\b(sudo|su|doas)\b/i,               // Privilege escalation
    /\b(eval|exec|system)\b/i,           // Code execution
    /\$\{[^}]*\}/,                       // Variable expansion
    /`[^`]*`/,                           // Command substitution
  ];

  // XSS patterns
  private static readonly XSS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>.*?<\/embed>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,                      // Event handlers
    /<[^>]*on\w+\s*=[^>]*>/gi,          // HTML event attributes
  ];

  // Path traversal patterns
  private static readonly PATH_TRAVERSAL_PATTERNS = [
    /\.\.[\/\\]/,                        // Directory traversal
    /[\/\\]\.\.[\/\\]?/,                 // Traversal in middle
    /^[\/\\]/,                           // Absolute paths
    /[\/\\]$/,                           // Trailing slash/slash
    /\x00/,                              // Null bytes
  ];

  /**
   * Sanitize any input value based on options
   */
  static sanitize(input: any, options: SanitizationOptions = {}): SanitizationResult {
    const issues: SecurityIssue[] = [];
    const opts = this.mergeDefaults(options);

    // Quick size check for large inputs
    const sizeCheck = this.checkSize(input, opts);
    if (!sizeCheck.safe) {
      issues.push(...sizeCheck.issues);
      return {
        isSafe: false,
        sanitized: null,
        issues
      };
    }

    try {
      const sanitized = this.sanitizeValue(input, '', opts, issues);
      const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
      return {
        isSafe: criticalIssues.length === 0,
        sanitized,
        issues,
        originalHash: this.hashInput(input)
      };
    } catch (error) {
      issues.push({
        type: 'invalid_unicode',
        severity: 'medium',
        message: `Sanitization error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return {
        isSafe: false,
        sanitized: null,
        issues
      };
    }
  }

  /**
   * Sanitize file content specifically
   */
  static sanitizeFileContent(content: string, filename: string, options: SanitizationOptions = {}): SanitizationResult {
    const fileOptions = {
      ...options,
      allowBinary: options.allowBinary ?? !this.isTextFile(filename),
      maxLength: options.maxLength ?? this.DEFAULT_MAX_LENGTH
    };

    const result = this.sanitize(content, fileOptions);
    
    // Additional file-specific checks
    if (typeof content === 'string') {
      // Check for suspicious file signatures
      const binaryCheck = this.detectBinaryContent(content);
      if (binaryCheck.isBinary && !fileOptions.allowBinary) {
        result.issues.push({
          type: 'binary_content',
          severity: 'high',
          message: 'Binary content detected in text file',
          path: filename
        });
        result.isSafe = false;
      }

      // Check for suspicious patterns in code files
      if (this.isCodeFile(filename)) {
        const codeCheck = this.checkCodeSecurity(content);
        result.issues.push(...codeCheck.issues);
        if (codeCheck.issues.some(i => i.severity === 'critical')) {
          result.isSafe = false;
        }
      }
    }

    return result;
  }

  /**
   * Sanitize command arguments
   */
  static sanitizeCommandArgs(args: string[], options: SanitizationOptions = {}): SanitizationResult {
    const issues: SecurityIssue[] = [];
    const sanitized: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const argResult = this.sanitize(arg, {
        ...options,
        maxLength: 1000, // Short limit for command args
        allowedChars: /^[a-zA-Z0-9._\/\-:@]+$/
      });

      if (!argResult.isSafe) {
        issues.push(...argResult.issues);
      }

      // Additional command injection checks
      for (const pattern of this.COMMAND_INJECTION_PATTERNS) {
        if (pattern.test(arg)) {
          issues.push({
            type: 'command_injection',
            severity: 'critical',
            message: `Command injection pattern detected: ${pattern.source}`,
            path: `args[${i}]`
          });
        }
      }

      sanitized.push(argResult.sanitized || '');
    }

    return {
      isSafe: issues.filter(i => i.severity === 'critical').length === 0,
      sanitized,
      issues
    };
  }

  /**
   * Sanitize path components
   */
  static sanitizePath(path: string, options: SanitizationOptions = {}): SanitizationResult {
    const issues: SecurityIssue[] = [];
    
    // Check path traversal patterns
    for (const pattern of this.PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(path)) {
        issues.push({
          type: 'path_traversal',
          severity: 'high',
          message: `Path traversal pattern detected: ${pattern.source}`,
          pattern: pattern.source
        });
      }
    }

    // Sanitize each component
    const components = path.split(/[\/\\]/);
    const sanitizedComponents = components.map((component, index) => {
      const result = this.sanitize(component, {
        ...options,
        maxLength: 255, // Standard filename limit
        allowedChars: /^[a-zA-Z0-9._\-]+$/
      });

      if (!result.isSafe) {
        issues.push(...result.issues.map(issue => ({
          ...issue,
          path: `path[${index}]`
        })));
      }

      return result.sanitized || component;
    });

    const sanitizedPath = sanitizedComponents.join('/');

    return {
      isSafe: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      sanitized: sanitizedPath,
      issues
    };
  }

  /**
   * Sanitize metadata fields
   */
  static sanitizeMetadata(metadata: Record<string, any>, options: SanitizationOptions = {}): SanitizationResult {
    const issues: SecurityIssue[] = [];
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
      // Sanitize key
      const keyResult = this.sanitize(key, {
        ...options,
        maxLength: 100,
        allowedChars: /^[a-zA-Z0-9._\-]+$/
      });

      if (!keyResult.isSafe) {
        issues.push(...keyResult.issues.map(issue => ({
          ...issue,
          path: `metadata.${key}`
        })));
      }

      // Sanitize value
      const valueResult = this.sanitize(value, {
        ...options,
        maxLength: 1000 // Metadata should be relatively small
      });

      if (!valueResult.isSafe) {
        issues.push(...valueResult.issues.map(issue => ({
          ...issue,
          path: `metadata.${key}`
        })));
      }

      sanitized[keyResult.sanitized || key] = valueResult.sanitized;
    }

    const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
    return {
      isSafe: criticalIssues.length === 0,
      sanitized,
      issues
    };
  }

  // Private helper methods

  private static mergeDefaults(options: SanitizationOptions): SanitizationOptions & { maxLength: number; allowHtml: boolean; allowBinary: boolean; sanitizeUnicode: boolean; maxDepth: number } {
    return {
      maxLength: options.maxLength ?? this.DEFAULT_MAX_LENGTH,
      allowHtml: options.allowHtml ?? false,
      allowBinary: options.allowBinary ?? false,
      allowedChars: options.allowedChars,
      sanitizeUnicode: options.sanitizeUnicode ?? true,
      maxDepth: options.maxDepth ?? this.DEFAULT_MAX_DEPTH
    };
  }

  private static sanitizeValue(value: any, path: string, options: any, issues: SecurityIssue[]): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value, path, options, issues);
    }

    if (typeof value === 'number') {
      return this.sanitizeNumber(value, path, options, issues);
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return this.sanitizeArray(value, path, options, issues);
    }

    if (typeof value === 'object') {
      return this.sanitizeObject(value, path, options, issues);
    }

    // Unknown type - convert to string and sanitize
    return this.sanitizeString(String(value), path, options, issues);
  }

  private static sanitizeString(str: string, path: string, options: any, issues: SecurityIssue[]): string {
    let sanitized = str;

    // Length check
    if (sanitized.length > options.maxLength) {
      issues.push({
        type: 'oversized',
        severity: 'medium',
        message: `String too long: ${sanitized.length} > ${options.maxLength}`,
        path
      });
      sanitized = sanitized.substring(0, options.maxLength);
    }

    // HTML/XSS sanitization
    if (!options.allowHtml) {
      for (const pattern of this.XSS_PATTERNS) {
        if (pattern.test(sanitized)) {
          issues.push({
            type: 'xss',
            severity: 'high',
            message: `XSS pattern detected: ${pattern.source}`,
            path,
            pattern: pattern.source
          });
          sanitized = sanitized.replace(pattern, '');
        }
      }

      // Remove all HTML tags
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Unicode sanitization
    if (options.sanitizeUnicode) {
      try {
        // Normalize Unicode and remove control characters (but preserve newlines and tabs)
        sanitized = sanitized.normalize('NFC').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      } catch {
        issues.push({
          type: 'invalid_unicode',
          severity: 'medium',
          message: 'Invalid Unicode characters detected',
          path
        });
        // Remove problematic characters
        sanitized = sanitized.replace(/[^\x20-\x7E]/g, '');
      }
    }

    // Custom character filter
    if (options.allowedChars) {
      const matches = sanitized.match(options.allowedChars);
      if (matches && matches.join('') !== sanitized) {
        const filtered = matches.join('');
        issues.push({
          type: 'invalid_unicode',
          severity: 'low',
          message: 'Characters outside allowed set detected and removed',
          path
        });
        sanitized = filtered;
      }
    }

    return sanitized;
  }

  private static sanitizeNumber(num: number, path: string, options: any, issues: SecurityIssue[]): number {
    if (!isFinite(num)) {
      issues.push({
        type: 'invalid_unicode',
        severity: 'high',
        message: 'Invalid number (NaN or Infinity)',
        path
      });
      return 0;
    }

    if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
      issues.push({
        type: 'invalid_unicode',
        severity: 'medium',
        message: 'Number outside safe integer range',
        path
      });
    }

    return num;
  }

  private static sanitizeArray(arr: any[], path: string, options: any, issues: SecurityIssue[]): any[] {
    if (arr.length > 1000) {
      issues.push({
        type: 'oversized',
        severity: 'medium',
        message: `Array too large: ${arr.length} items`,
        path
      });
    }

    return arr.slice(0, 1000).map((item, index) => 
      this.sanitizeValue(item, `${path}[${index}]`, options, issues)
    );
  }

  private static sanitizeObject(obj: any, path: string, options: any, issues: SecurityIssue[]): any {
    const keys = Object.keys(obj);
    
    if (keys.length > 100) {
      issues.push({
        type: 'oversized',
        severity: 'medium',
        message: `Object has too many properties: ${keys.length}`,
        path
      });
    }

    const sanitized: any = {};
    
    for (const key of keys.slice(0, 100)) {
      const sanitizedKey = this.sanitizeString(key, `${path}.${key}`, options, issues);
      sanitized[sanitizedKey] = this.sanitizeValue(obj[key], `${path}.${sanitizedKey}`, options, issues);
    }

    return sanitized;
  }

  private static checkSize(input: any, options: any): { safe: boolean; issues: SecurityIssue[] } {
    const issues: SecurityIssue[] = [];
    
    // Skip size check for null/undefined
    if (input === null || input === undefined) {
      return { safe: true, issues };
    }
    
    try {
      const serialized = JSON.stringify(input);
      if (serialized.length > options.maxLength) {
        issues.push({
          type: 'oversized',
          severity: 'medium',
          message: `Input too large: ${serialized.length} > ${options.maxLength}`
        });
        return { safe: false, issues };
      }
    } catch {
      // JSON.stringify failed - likely circular references
      issues.push({
        type: 'deep_nesting',
        severity: 'medium',
        message: 'Input contains circular references or is too deeply nested'
      });
      return { safe: false, issues };
    }

    return { safe: true, issues };
  }

  private static detectBinaryContent(content: string): { isBinary: boolean; confidence: number } {
    // Simple heuristic for binary detection
    const binaryChars = content.match(/[\x00-\x08\x0E-\x1F\x7F-\xFF]/g);
    if (!binaryChars) return { isBinary: false, confidence: 0 };
    
    const ratio = binaryChars.length / content.length;
    return {
      isBinary: ratio > 0.1, // Lower threshold for better detection
      confidence: ratio
    };
  }

  private static checkCodeSecurity(content: string): { issues: SecurityIssue[] } {
    const issues: SecurityIssue[] = [];
    
    // Check for dangerous functions in various languages
    const dangerousPatterns = [
      { pattern: /\beval\s*\(/gi, type: 'command_injection', lang: 'javascript' },
      { pattern: /\bexec\s*\(/gi, type: 'command_injection', lang: 'python' },
      { pattern: /\bsystem\s*\(/gi, type: 'command_injection', lang: 'c/cpp' },
      { pattern: /\bshell_exec\s*\(/gi, type: 'command_injection', lang: 'php' },
      { pattern: /document\.write\s*\(/gi, type: 'xss', lang: 'javascript' },
      { pattern: /innerHTML\s*=/gi, type: 'xss', lang: 'javascript' },
    ];

    for (const { pattern, type, lang } of dangerousPatterns) {
      if (pattern.test(content)) {
        issues.push({
          type: type as SecurityIssue['type'],
          severity: 'high',
          message: `Potentially dangerous ${type} pattern in ${lang} code`,
          pattern: pattern.source
        });
      }
    }

    return { issues };
  }

  private static isTextFile(filename: string): boolean {
    const textExtensions = ['.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv', '.log'];
    const ext = filename.toLowerCase().split('.').pop();
    return textExtensions.includes(`.${ext}`);
  }

  private static isCodeFile(filename: string): boolean {
    const codeExtensions = ['.js', '.ts', '.py', '.php', '.java', '.cpp', '.c', '.h', '.cs', '.rb', '.go'];
    const ext = filename.toLowerCase().split('.').pop();
    return codeExtensions.includes(`.${ext}`);
  }

  private static hashInput(input: any): string {
    // Simple hash for detection purposes
    const str = JSON.stringify(input, (key, value) => 
      value === undefined ? 'undefined' : value
    );
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}