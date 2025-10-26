/**
 * Log formatters for different output formats
 */

import { LogEntry, LogFormatter } from './types.js';

/**
 * JSON formatter - outputs structured JSON logs
 */
export class JsonFormatter implements LogFormatter {
  name = 'json';

  constructor(private options: {
    pretty?: boolean;
    includeLevel?: boolean;
    sanitizeErrors?: boolean;
    redactFields?: string[];
  } = {}) {}

  format(entry: LogEntry): string {
    const formatted = { ...entry };

    // Apply sanitization if enabled
    if (this.options.sanitizeErrors) {
      this.sanitizeError(formatted);
    }

    // Apply field redaction
    if (this.options.redactFields?.length) {
      this.redactFields(formatted, this.options.redactFields);
    }

    if (this.options.pretty) {
      return JSON.stringify(formatted, null, 2);
    }

    return JSON.stringify(formatted);
  }

  private sanitizeError(entry: LogEntry): void {
    if (entry.error) {
      // Remove potentially sensitive stack traces in production
      if (entry.error.stack && process.env.NODE_ENV === 'production') {
        entry.error.stack = '[REDACTED]';
      }

      // Sanitize error message if it contains sensitive data
      if (entry.error.message) {
        entry.error.message = this.sanitizeErrorMessage(entry.error.message);
      }
    }
  }

  private sanitizeErrorMessage(message: string): string {
    // Remove potential sensitive patterns like passwords, tokens, etc.
    return message
      .replace(/password[=:]\s*[^\s&]+/gi, 'password=[REDACTED]')
      .replace(/token[=:]\s*[^\s&]+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*[^\s&]+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*[^\s&]+/gi, 'secret=[REDACTED]');
  }

  private redactFields(obj: any, fields: string[]): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    for (const field of fields) {
      if (obj[field] !== undefined) {
        obj[field] = '[REDACTED]';
      }
    }

    // Recursively check nested objects
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.redactFields(obj[key], fields);
      }
    }
  }
}

/**
 * Pretty console formatter for development
 */
export class PrettyFormatter implements LogFormatter {
  name = 'pretty';

  private colors = {
    debug: '\x1b[36m',    // cyan
    info: '\x1b[32m',     // green
    warn: '\x1b[33m',     // yellow
    error: '\x1b[31m',    // red
    fatal: '\x1b[35m',    // magenta
    red: '\x1b[31m',      // red (alias for error)
    reset: '\x1b[0m',     // reset
    dim: '\x1b[2m',       // dim
    bold: '\x1b[1m',      // bold
  };

  format(entry: LogEntry): string {
    const color = this.colors[entry.level] || this.colors.reset;
    const timestamp = this.formatTimestamp(entry.timestamp);
    const correlation = entry.correlationId ? ` [${entry.correlationId}]` : '';
    const requestId = entry.requestId ? ` (${entry.requestId})` : '';
    
    let output = `${this.colors.dim}${timestamp}${this.colors.reset} ${color}${entry.level.toUpperCase()}${this.colors.reset} ${this.colors.bold}${entry.service}${this.colors.reset}${correlation}${requestId}: ${entry.message}`;

    // Add duration if available
    if (entry.duration) {
      output += ` ${this.colors.dim}(${entry.duration}ms)${this.colors.reset}`;
    }

    // Add tags if available
    if (entry.tags?.length) {
      output += ` ${this.colors.dim}[${entry.tags.join(', ')}]${this.colors.reset}`;
    }

    // Add error details if available
    if (entry.error) {
      output += `\n${this.colors.red}  Error: ${entry.error.name}: ${entry.error.message}${this.colors.reset}`;
      if (entry.error.stack && process.env.NODE_ENV !== 'production') {
        output += `\n${this.colors.dim}  Stack: ${entry.error.stack}${this.colors.reset}`;
      }
    }

    // Add context summary if available
    if (entry.context) {
      const contextInfo = this.formatContextSummary(entry.context);
      if (contextInfo) {
        output += `\n${this.colors.dim}  Context: ${contextInfo}${this.colors.reset}`;
      }
    }

    // Add metrics if available
    if (entry.metrics) {
      output += `\n${this.colors.dim}  Metrics: ${JSON.stringify(entry.metrics)}${this.colors.reset}`;
    }

    return output;
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }

  private formatContextSummary(context: any): string {
    const parts: string[] = [];

    if (context.userId) parts.push(`user:${context.userId}`);
    if (context.clientInfo?.ipAddress) parts.push(`ip:${context.clientInfo.ipAddress}`);
    if (context.request?.method && context.request?.url) {
      parts.push(`${context.request.method} ${context.request.url}`);
    }
    if (context.response?.statusCode) parts.push(`status:${context.response.statusCode}`);
    if (context.tool?.name) parts.push(`tool:${context.tool.name}`);

    return parts.join(' ');
  }
}

/**
 * Compact formatter for high-volume logging
 */
export class CompactFormatter implements LogFormatter {
  name = 'compact';

  format(entry: LogEntry): string {
    const timestamp = entry.timestamp.substring(11, 23); // HH:mm:ss.SSS
    const level = entry.level.toUpperCase().padEnd(5);
    const correlation = entry.correlationId || '--------';
    const service = entry.service.padEnd(12);
    
    let output = `${timestamp} ${level} ${service} ${correlation} ${entry.message}`;

    // Add essential fields in compact form
    const extras = [];
    if (entry.duration) extras.push(`${entry.duration}ms`);
    if (entry.error?.code) extras.push(`err:${entry.error.code}`);
    if (entry.context?.request?.method) extras.push(entry.context.request.method);
    if (entry.context?.response?.statusCode) extras.push(`->${entry.context.response.statusCode}`);
    if (entry.tags?.length) extras.push(`[${entry.tags.join(',')}]`);

    if (extras.length > 0) {
      output += ` ${extras.join(' ')}`;
    }

    return output;
  }
}

/**
 * Syslog-compatible formatter
 */
export class SyslogFormatter implements LogFormatter {
  name = 'syslog';

  private severityMap = {
    debug: 7,
    info: 6,
    warn: 4,
    error: 3,
    fatal: 2,
  };

  format(entry: LogEntry): string {
    const priority = this.severityMap[entry.level] || 6;
    const timestamp = entry.timestamp.replace('T', ' ').substring(0, 19);
    const hostname = require('os').hostname();
    const appName = entry.service;
    const procId = process.pid;
    const msgId = entry.correlationId || '-';
    const message = entry.message;

    // RFC 5424 format: <PRIVAL>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
    const structuredData = entry.correlationId ? `[correlationId "${entry.correlationId}"]` : '-';
    
    return `<${priority}>1 ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${message}`;
  }
}