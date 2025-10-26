/**
 * Type definitions for Task MCP HTTPS/SSE server
 */

import { z } from 'zod';
// Import types from the stdio module
// These will be properly integrated when the full implementation is complete
export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface SecurityContext {
  allowedPaths: string[];
  sandboxRoot: string;
  maxFileSize: number;
  allowedSchemas: string[];
  user?: any;
  authContext?: any;
}

// Environment configuration schema
export const EnvSchema = z.object({
  // Server configuration
  PORT: z.coerce.number().default(8443),
  HOST: z.string().default('0.0.0.0'),
  
  // TLS configuration
  TLS_KEY: z.string().optional(),
  TLS_CERT: z.string().optional(),
  
  // Authentication
  AUTH_TOKENS: z.string().transform(val => val.split(',').filter(Boolean)).default([]),
  
  // CORS configuration
  ALLOWED_ORIGINS: z.string().transform(val => val.split(',').filter(Boolean)).default(['http://localhost:3000', 'https://localhost:3000']),
  
  // Rate limiting
  RATE_LIMIT: z.coerce.number().default(60), // requests per minute
  
  // SSE configuration
  HEARTBEAT_MS: z.coerce.number().default(25000), // 25 seconds
  
  // Response size limits
  MAX_RESPONSE_SIZE_KB: z.coerce.number().default(10), // 10KB default
  
  // Logging configuration
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_STRUCTURED_LOGGING: z.coerce.boolean().default(true),
  ENABLE_JSON_OUTPUT: z.coerce.boolean().default(true),
  ENABLE_PRETTY_OUTPUT: z.coerce.boolean().default(false),
  LOG_FILE: z.string().optional(),
  LOG_MAX_FILE_SIZE: z.coerce.number().default(10 * 1024 * 1024), // 10MB
  LOG_MAX_FILES: z.coerce.number().default(5),
  LOG_BUFFER_SIZE: z.coerce.number().default(100),
  LOG_FLUSH_INTERVAL_MS: z.coerce.number().default(5000),
  LOG_INCLUDE_STACK_TRACE: z.coerce.boolean().default(true),
  LOG_SANITIZE_ERRORS: z.coerce.boolean().default(true),
  
  // Enhanced security configuration
  SECURITY_HEADERS_ENABLED: z.coerce.boolean().default(true),
  AUDIT_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  AUDIT_LOG_FILE: z.string().optional(),
  RATE_LIMIT_BURST: z.coerce.number().default(90), // 1.5x normal rate limit
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000), // 1 minute
  ENABLE_DISTRIBUTED_RATE_LIMIT: z.coerce.boolean().default(false),
  REDIS_URL: z.string().optional(),
  
  // Working directory
  WORKING_DIRECTORY: z.string().default(process.cwd()),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

// HTTP request/response types
export interface HTTPToolRequest {
  tool: string;
  input: Record<string, any>;
  apiVersion?: string;
}

export interface HTTPToolResponse {
  apiVersion: string;
  tool: string;
  startedAt: string;
  result: ToolResult;
  duration?: number;
}

export interface HTTPErrorResponse {
  apiVersion: string;
  error: {
    code: string;
    message: string;
    hint?: string;
    details?: any;
  };
  startedAt: string;
}

// SSE event types
export interface SSEEvent {
  event: 'result' | 'error' | 'heartbeat';
  data: any;
  id?: string;
  retry?: number;
}

export interface SSEHeartbeatEvent {
  event: 'heartbeat';
  data: {
    timestamp: number;
    message: string;
  };
}

// Streamable HTTP (NDJSON) event types
export interface NDJSONEvent {
  type: 'start' | 'result' | 'error' | 'end';
  ts?: number;
  tool?: string;
  apiVersion?: string;
  result?: ToolResult;
  error?: {
    code: string;
    message: string;
    hint?: string;
    details?: any;
  };
}

// Server configuration
export interface ServerConfig {
  port: number;
  host: string;
  tls?: {
    key: string;
    cert: string;
  };
  auth: {
    tokens: string[];
  };
  cors: {
    origins: string[];
  };
  rateLimit: {
    requestsPerMinute: number;
  };
  sse: {
    heartbeatMs: number;
  };
  responseLimits: {
    maxResponseSizeKb: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error' | 'silent';
    enableStructuredLogging?: boolean;
    enableJsonOutput?: boolean;
    enablePrettyOutput?: boolean;
    logFile?: string;
    maxFileSize?: number;
    maxFiles?: number;
    bufferSize?: number;
    flushIntervalMs?: number;
    includeStackTrace?: boolean;
    sanitizeErrors?: boolean;
    redactFields?: string[];
  };
  workingDirectory: string;
}

// Health check responses
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks?: {
    database?: 'pass' | 'fail';
    filesystem?: 'pass' | 'fail';
    tools?: 'pass' | 'fail';
  };
}

export interface ReadyCheckResponse extends HealthCheckResponse {
  ready: boolean;
  dependencies: {
    tools: boolean;
    filesystem: boolean;
    security: boolean;
  };
}

// Request context
export interface RequestContext {
  requestId: string;
  timestamp: number;
  userAgent?: string;
  ipAddress?: string;
  auth?: {
    token: string;
    valid: boolean;
  };
}

// Error types
export class HTTPError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public hint?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'HTTPError';
  }
}

// Tool execution context
export interface ToolExecutionContext {
  request: HTTPToolRequest;
  context: RequestContext;
  security: SecurityContext;
}