/**
 * Configuration management for Task MCP HTTPS/SSE server
 */

import { z } from 'zod';
import { EnvConfig, ServerConfig } from './types.js';
import { EnvSchema } from './types.js';
import * as fs from 'fs/promises';

/**
 * Load and validate environment configuration
 */
export function loadEnvConfig(): EnvConfig {
  try {
    return EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      throw new Error(`Environment validation failed: ${errorMessages}`);
    }
    throw new Error(`Failed to load environment configuration: ${error}`);
  }
}

/**
 * Create server configuration from environment
 */
export async function createServerConfig(env: EnvConfig): Promise<ServerConfig> {
  const config: ServerConfig = {
    port: env.PORT,
    host: env.HOST,
    auth: {
      tokens: env.AUTH_TOKENS,
    },
    cors: {
      origins: env.ALLOWED_ORIGINS,
    },
    rateLimit: {
      requestsPerMinute: env.RATE_LIMIT,
    },
    sse: {
      heartbeatMs: env.HEARTBEAT_MS,
    },
    responseLimits: {
      maxResponseSizeKb: env.MAX_RESPONSE_SIZE_KB,
    },
    logging: {
      level: env.LOG_LEVEL,
      enableStructuredLogging: env.ENABLE_STRUCTURED_LOGGING,
      enableJsonOutput: env.ENABLE_JSON_OUTPUT,
      enablePrettyOutput: env.ENABLE_PRETTY_OUTPUT,
      logFile: env.LOG_FILE,
      maxFileSize: env.LOG_MAX_FILE_SIZE,
      maxFiles: env.LOG_MAX_FILES,
      bufferSize: env.LOG_BUFFER_SIZE,
      flushIntervalMs: env.LOG_FLUSH_INTERVAL_MS,
      includeStackTrace: env.LOG_INCLUDE_STACK_TRACE,
      sanitizeErrors: env.LOG_SANITIZE_ERRORS,
    },
    workingDirectory: env.WORKING_DIRECTORY,
  };

  // Load TLS configuration if both key and cert are provided
  if (env.TLS_KEY && env.TLS_CERT) {
    try {
      const [key, cert] = await Promise.all([
        loadCertificateFile(env.TLS_KEY),
        loadCertificateFile(env.TLS_CERT),
      ]);
      
      config.tls = { key, cert };
    } catch (error) {
      throw new Error(`Failed to load TLS certificates: ${error}`);
    }
  }

  // Validate working directory
  try {
    await fs.access(env.WORKING_DIRECTORY);
  } catch {
    throw new Error(`Working directory does not exist: ${env.WORKING_DIRECTORY}`);
  }

  return config;
}

/**
 * Load certificate file from path or environment variable
 */
async function loadCertificateFile(source: string): Promise<string> {
  // Check if it's a file path
  if (await fileExists(source)) {
    return await fs.readFile(source, 'utf-8');
  }
  
  // Treat as literal certificate content
  return source;
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: ServerConfig): void {
  // Validate port
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port number: ${config.port}. Must be between 1 and 65535.`);
  }

  // Validate TLS configuration
  if (config.tls && (!config.tls.key || !config.tls.cert)) {
    throw new Error('TLS configuration requires both key and certificate.');
  }

  // Validate authentication
  if (config.auth.tokens.length === 0) {
    console.warn('Warning: No authentication tokens configured. Server will be open to all requests.');
  }

  // Validate rate limiting
  if (config.rateLimit.requestsPerMinute < 1) {
    throw new Error('Rate limit must be at least 1 request per minute.');
  }

  // Validate SSE heartbeat
  if (config.sse.heartbeatMs < 5000) {
    throw new Error('SSE heartbeat interval must be at least 5000ms (5 seconds).');
  }

  // Validate response size limits
  if (config.responseLimits.maxResponseSizeKb < 1) {
    throw new Error('Maximum response size must be at least 1KB.');
  }
}

/**
 * Get configuration for development environment
 */
export function getDevConfig(): Partial<EnvConfig> {
  return {
    PORT: 8443,
    HOST: '0.0.0.0',
    AUTH_TOKENS: ['dev-token-12345'],
    ALLOWED_ORIGINS: ['http://localhost:3000', 'https://localhost:3000', 'http://localhost:5173'],
    RATE_LIMIT: 100,
    HEARTBEAT_MS: 15000,
    MAX_RESPONSE_SIZE_KB: 50,
    LOG_LEVEL: 'debug',
  };
}

/**
 * Get configuration for production environment
 */
export function getProdConfig(): Partial<EnvConfig> {
  return {
    PORT: 8443,
    HOST: '0.0.0.0',
    RATE_LIMIT: 60,
    HEARTBEAT_MS: 25000,
    MAX_RESPONSE_SIZE_KB: 10,
    LOG_LEVEL: 'warn',
  };
}