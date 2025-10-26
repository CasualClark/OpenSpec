/**
 * Type definitions for structured JSON logging system
 */

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  requestId?: string;
  service: string;
  version: string;
  context?: LogContext;
  error?: LogError;
  metrics?: LogMetrics;
  tags?: string[];
  duration?: number;
}

export interface LogContext {
  userId?: string;
  sessionId?: string;
  clientInfo?: {
    ipAddress?: string;
    userAgent?: string;
    origin?: string;
    referer?: string;
  };
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    bodySize?: number;
  };
  response?: {
    statusCode?: number;
    bodySize?: number;
    headers?: Record<string, string>;
  };
  tool?: {
    name?: string;
    input?: Record<string, any>;
    output?: any;
  };
  security?: {
    authMethod?: string;
    tokenType?: string;
    rateLimited?: boolean;
  };
  system?: {
    memory?: NodeJS.MemoryUsage;
    cpu?: NodeJS.CpuUsage;
    uptime?: number;
  };
}

export interface LogError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
  details?: any;
  cause?: Error;
}

export interface LogMetrics {
  requestCount?: number;
  errorCount?: number;
  responseTime?: number;
  throughput?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  custom?: Record<string, number | string>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerConfig {
  level: LogLevel;
  service: string;
  version: string;
  environment?: 'development' | 'staging' | 'production';
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
  enableJsonOutput: boolean;
  enablePrettyOutput: boolean;
  correlationIdHeader?: string;
  requestIdHeader?: string;
  bufferSize?: number;
  flushIntervalMs?: number;
  includeStackTrace?: boolean;
  sanitizeErrors?: boolean;
  redactFields?: string[];
}

export interface LogTransport {
  name: string;
  level: LogLevel;
  write(entry: LogEntry): Promise<void> | void;
  flush?(): Promise<void> | void;
  close?(): Promise<void> | void;
}

export interface LogFilter {
  name: string;
  shouldLog(entry: LogEntry): boolean;
}

export interface LogFormatter {
  name: string;
  format(entry: LogEntry): string;
}

export interface CorrelationContext {
  correlationId: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  startTime: number;
  tags?: string[];
}

export interface LoggerMetrics {
  totalLogs: number;
  logsByLevel: Record<LogLevel, number>;
  errorCount: number;
  lastLogTime: number;
  bufferSize: number;
  flushCount: number;
  transportErrors: number;
}