/**
 * Main structured JSON logger implementation
 */


import { 
  LogEntry, 
  LogLevel, 
  LoggerConfig, 
  LogTransport, 
  LogContext, 
  LogError, 
  LogMetrics,
  CorrelationContext,
  LoggerMetrics
} from './types.js';
import { CorrelationManager } from './correlation.js';
import { JsonFormatter, PrettyFormatter, CompactFormatter, SyslogFormatter } from './formatters.js';
import { 
  ConsoleTransport, 
  FileTransport, 
  BufferedTransport, 
  MultiTransport,
  FilterTransport,
  AsyncTransport,
  NullTransport
} from './transports.js';

/**
 * Structured JSON logger with correlation ID support
 */
export class StructuredLogger {
  private config: LoggerConfig;
  private transport: LogTransport;
  private correlationManager: CorrelationManager;
  private metrics: LoggerMetrics;
  private redactFields: string[];

  constructor(config: LoggerConfig) {
    this.config = config;
    this.correlationManager = CorrelationManager.getInstance();
    this.redactFields = config.redactFields || [
      'password', 'token', 'secret', 'key', 'authorization',
      'cookie', 'session', 'creditCard', 'ssn', 'apiKey'
    ];
    
    this.metrics = this.initializeMetrics();
    this.transport = this.createTransport();
    
    // Start periodic cleanup
    this.startCleanupInterval();
  }

  /**
   * Create transport based on configuration
   */
  private createTransport(): LogTransport {
    const transports: LogTransport[] = [];

    // Console transport
    if (this.config.enableConsole) {
      const consoleTransport = new ConsoleTransport(this.config.level);
      
      if (this.config.enablePrettyOutput && this.config.environment !== 'production') {
        // Use pretty formatting for console in development
        const prettyTransport = new FilterTransport(
          (entry) => true,
          consoleTransport
        );
        transports.push(prettyTransport);
      } else {
        transports.push(consoleTransport);
      }
    }

    // File transport
    if (this.config.enableFile && this.config.filePath) {
      const fileTransport = new FileTransport({
        filePath: this.config.filePath,
        level: this.config.level,
        maxSize: this.config.maxFileSize,
        maxFiles: this.config.maxFiles,
      });
      transports.push(fileTransport);
    }

    // If no transports are configured, create a null transport
    if (transports.length === 0) {
      return new NullTransport();
    }

    // Create multi-transport or single transport
    const baseTransport = transports.length > 1 
      ? new MultiTransport(transports)
      : transports[0];

    // Add buffering if configured
    if (this.config.bufferSize && this.config.flushIntervalMs) {
      return new BufferedTransport({
        transport: baseTransport,
        bufferSize: this.config.bufferSize,
        flushIntervalMs: this.config.flushIntervalMs,
      });
    }

    // Add async wrapper for non-blocking logging
    return new AsyncTransport(baseTransport);
  }

  /**
   * Log a message with structured data
   */
  log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error | LogError,
    metrics?: LogMetrics,
    tags?: string[],
    correlationId?: string
  ): void {
    // Check if we should log at this level
    if (!this.shouldLog(level)) {
      return;
    }

    // Get correlation context
    const corrContext = correlationId 
      ? this.correlationManager.getContext(correlationId)
      : this.correlationManager.getCurrentContext();

    // Create log entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.service,
      version: this.config.version,
      correlationId: corrContext?.correlationId,
      requestId: corrContext?.requestId,
      context: this.sanitizeContext(context),
      error: this.normalizeError(error),
      metrics,
      tags,
      duration: corrContext ? Date.now() - corrContext.startTime : undefined,
    };

    // Update metrics
    this.updateMetrics(level);

    // Write to transport
    this.transport.write(entry);
  }

  /**
   * Convenience methods for different log levels
   */
  debug(message: string, context?: LogContext, error?: Error | LogError, metrics?: LogMetrics, tags?: string[]): void {
    this.log('debug', message, context, error, metrics, tags);
  }

  info(message: string, context?: LogContext, error?: Error | LogError, metrics?: LogMetrics, tags?: string[]): void {
    this.log('info', message, context, error, metrics, tags);
  }

  warn(message: string, context?: LogContext, error?: Error | LogError, metrics?: LogMetrics, tags?: string[]): void {
    this.log('warn', message, context, error, metrics, tags);
  }

  error(message: string, context?: LogContext, error?: Error | LogError, metrics?: LogMetrics, tags?: string[]): void {
    this.log('error', message, context, error, metrics, tags);
  }

  fatal(message: string, context?: LogContext, error?: Error | LogError, metrics?: LogMetrics, tags?: string[]): void {
    this.log('fatal', message, context, error, metrics, tags);
  }

  /**
   * Log HTTP request/response
   */
  logHttpRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    context?: Partial<LogContext>,
    error?: Error
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    
    this.log(level, `${method} ${url} -> ${statusCode}`, {
      request: { method, url },
      response: { statusCode },
      ...context,
    }, error, { responseTime: duration });
  }

  /**
   * Log tool execution
   */
  logToolExecution(
    toolName: string,
    input: Record<string, any>,
    output?: any,
    error?: Error,
    duration?: number
  ): void {
    const level = error ? 'error' : 'info';
    
    this.log(level, `Tool execution: ${toolName}`, {
      tool: { name: toolName, input, output },
    }, error, duration ? { responseTime: duration } : undefined, ['tool']);
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context?: Partial<LogContext>,
    details?: any
  ): void {
    const level = severity === 'critical' ? 'fatal' : 
                  severity === 'high' ? 'error' : 
                  severity === 'medium' ? 'warn' : 'info';
    
    this.log(level, `Security event: ${event}`, {
      security: { 
        authMethod: context?.security?.authMethod,
        tokenType: context?.security?.tokenType,
        rateLimited: context?.security?.rateLimited
      },
      ...context,
    }, undefined, undefined, ['security'], details);
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext, tags?: string[]): StructuredLogger {
    return new Proxy(this, {
      get: (target, prop) => {
        if (typeof target[prop as keyof StructuredLogger] === 'function') {
          return (...args: any[]) => {
            // Merge context and tags for child logger
            const [message, childContext, ...rest] = args;
            const mergedContext = { ...context, ...childContext };
            const mergedTags = [...(tags || []), ...(rest[rest.length - 1]?.tags || [])];
            
            if (prop === 'log') {
              return target.log.call(target, args[0], args[1], mergedContext, ...rest.slice(2));
            } else {
              return (target[prop as keyof StructuredLogger] as any).call(target, message, mergedContext, ...rest.slice(1));
            }
          };
        }
        return target[prop as keyof StructuredLogger];
      }
    });
  }

  /**
   * Create correlation context
   */
  createCorrelationContext(options: {
    correlationId?: string;
    requestId?: string;
    userId?: string;
    sessionId?: string;
    tags?: string[];
  } = {}): CorrelationContext {
    return this.correlationManager.createContext(options);
  }

  /**
   * Get current correlation context
   */
  getCurrentCorrelationContext(): CorrelationContext | undefined {
    return this.correlationManager.getCurrentContext();
  }

  /**
   * Check if we should log at the given level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
    const configLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= configLevelIndex;
  }

  /**
   * Normalize error to LogError format
   */
  private normalizeError(error?: Error | LogError): LogError | undefined {
    if (!error) return undefined;

    if ('name' in error && 'message' in error) {
      const logError: LogError = {
        name: error.name,
        message: error.message,
        stack: this.config.includeStackTrace ? error.stack : undefined,
      };

      if ('code' in error) logError.code = String(error.code);
      if ('statusCode' in error) logError.statusCode = Number(error.statusCode);
      if ('details' in error) logError.details = error.details;
      if ('cause' in error) logError.cause = error.cause as Error;

      return logError;
    }

    return {
      name: 'Unknown',
      message: String(error),
    };
  }

  /**
   * Sanitize context by redacting sensitive fields
   */
  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return context;

    return this.redactSensitiveFields(context);
  }

  /**
   * Redact sensitive fields from object
   */
  private redactSensitiveFields(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactSensitiveFields(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.redactFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.redactSensitiveFields(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Initialize logger metrics
   */
  private initializeMetrics(): LoggerMetrics {
    return {
      totalLogs: 0,
      logsByLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        fatal: 0,
      },
      errorCount: 0,
      lastLogTime: 0,
      bufferSize: 0,
      flushCount: 0,
      transportErrors: 0,
    };
  }

  /**
   * Update logger metrics
   */
  private updateMetrics(level: LogLevel): void {
    this.metrics.totalLogs++;
    this.metrics.logsByLevel[level]++;
    
    if (level === 'error' || level === 'fatal') {
      this.metrics.errorCount++;
    }
    
    this.metrics.lastLogTime = Date.now();
  }

  /**
   * Start periodic cleanup interval
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.correlationManager.cleanup();
    }, 300000); // 5 minutes
  }

  /**
   * Get logger metrics
   */
  getMetrics(): LoggerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset logger metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  /**
   * Flush transport buffers
   */
  async flush(): Promise<void> {
    if (this.transport.flush) {
      await this.transport.flush();
    }
  }

  /**
   * Close logger and cleanup resources
   */
  async close(): Promise<void> {
    if (this.transport.close) {
      await this.transport.close();
    }
  }
}

/**
 * Create structured logger instance
 */
export function createStructuredLogger(config: LoggerConfig): StructuredLogger {
  return new StructuredLogger(config);
}

/**
 * Default logger configuration
 */
export function getDefaultLoggerConfig(): Partial<LoggerConfig> {
  return {
    service: 'task-mcp-http',
    version: '1.0.0',
    environment: (process.env.NODE_ENV as any) || 'development',
    enableConsole: true,
    enableFile: false,
    enableJsonOutput: true,
    enablePrettyOutput: true,
    correlationIdHeader: 'x-correlation-id',
    requestIdHeader: 'x-request-id',
    bufferSize: 100,
    flushIntervalMs: 5000,
    includeStackTrace: true,
    sanitizeErrors: true,
    redactFields: [
      'password', 'token', 'secret', 'key', 'authorization',
      'cookie', 'session', 'creditCard', 'ssn', 'apiKey'
    ],
  };
}