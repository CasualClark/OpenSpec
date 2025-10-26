/**
 * Task MCP HTTPS/SSE Server - Phase 4 Implementation
 * 
 * Production-ready Fastify server with SSE and Streamable HTTP endpoints
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { v4 as uuidv4 } from 'uuid';

import { ServerConfig, HTTPError } from './types.js';
import { loadEnvConfig, createServerConfig, validateConfig } from './config.js';
import { sseRouteHandler } from './routes/sse.js';
import { mcpRouteHandler } from './routes/mcp.js';
import { healthzHandler, readyzHandler } from './routes/health.js';
import { healthCheckPlugin } from './health/index.js';
import { 
  AuthenticationMiddleware, 
  AuditLogger, 
  CorsMiddleware, 
  RateLimitMiddleware, 
  SecurityHeadersMiddleware,
  createAuditLogger
} from './security/index.js';
import { 
  createStructuredLogger, 
  getDefaultLoggerConfig,
  correlationPlugin,
  correlationMiddleware
} from './logging/index.js';
import { 
  initializeOpenTelemetry, 
  getOpenTelemetry 
} from './otel/index.js';

/**
 * Create and configure the Fastify server
 */
export async function createServer(config: ServerConfig): Promise<FastifyInstance> {
  // Create structured logger
  const structuredLogger = createStructuredLogger({
    ...getDefaultLoggerConfig(),
    service: 'task-mcp-http',
    version: '1.0.0',
    level: config.logging.level === 'silent' ? 'error' : config.logging.level as any,
    enableConsole: true,
    enableFile: !!config.logging.logFile,
    filePath: config.logging.logFile,
    enableJsonOutput: config.logging.enableJsonOutput ?? true,
    enablePrettyOutput: config.logging.enablePrettyOutput ?? false,
    maxSize: config.logging.maxFileSize,
    maxFiles: config.logging.maxFiles,
    bufferSize: config.logging.bufferSize,
    flushIntervalMs: config.logging.flushIntervalMs,
    includeStackTrace: config.logging.includeStackTrace,
    sanitizeErrors: config.logging.sanitizeErrors,
  } as any);

  // Create audit logger
  const auditLogger = createAuditLogger({
    logLevel: config.logging.level === 'silent' ? 'error' : config.logging.level,
    logFile: 'audit.log',
    enableConsole: true,
    bufferSize: 50,
    flushIntervalMs: 5000
  });

  // Create security middleware instances
  const authMiddleware = new AuthenticationMiddleware(config.auth, auditLogger);
  const corsMiddleware = new CorsMiddleware(config.cors);
  const rateLimitMiddleware = new RateLimitMiddleware(config.rateLimit);
  const securityHeadersMiddleware = new SecurityHeadersMiddleware({
    enabled: true,
    strictTransportSecurity: {
      enabled: !!config.tls, // Enable HSTS only if TLS is configured
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false
    }
  });

  // Create logger configuration
  const loggerConfig: any = {
    level: config.logging.level,
  };

  // Only add pretty transport for non-silent logging
  if (config.logging.level !== 'silent') {
    loggerConfig.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  }

  // Create Fastify logger configuration
  const fastifyLoggerConfig: any = {
    level: config.logging.level,
  };

  // Only add pretty transport for non-silent logging and if structured logging is disabled
  if (config.logging.level !== 'silent' && !config.logging.enableStructuredLogging) {
    fastifyLoggerConfig.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  }

  // Create Fastify instance
  const server = Fastify({
    logger: config.logging.enableStructuredLogging ? false : fastifyLoggerConfig,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => uuidv4(),
  });

  // Store instances for later use
  (server as any).security = {
    auditLogger,
    authMiddleware,
    corsMiddleware,
    rateLimitMiddleware,
    securityHeadersMiddleware
  };

  // Store structured logger
  (server as any).structuredLogger = structuredLogger;

  // Register OpenTelemetry middleware if enabled
  const otel = getOpenTelemetry();
  if (otel?.isEnabled()) {
    const middleware = otel.getMiddleware();
    
    server.addHook('onRequest', middleware.onRequest);
    server.addHook('onResponse', middleware.onResponse);
    server.addHook('onError', middleware.onError);
    
    // Store OpenTelemetry instances for later use
    (server as any).otel = otel;
  }

  // Register plugins
  await registerPlugins(server, config);

  // Register routes
  await registerRoutes(server, config);

  // Register error handlers
  registerErrorHandlers(server);

  // Register graceful shutdown handlers
  registerGracefulShutdown(server);

  return server;
}

/**
 * Register Fastify plugins
 */
async function registerPlugins(server: FastifyInstance, config: ServerConfig): Promise<void> {
  const security = (server as any).security;

  // Register correlation plugin for structured logging
  if (config.logging.enableStructuredLogging) {
    await server.register(correlationPlugin);
  }

  // Register enhanced CORS middleware
  await server.register(cors, security.corsMiddleware.getFastifyConfig());

  // Register enhanced rate limiting middleware
  await server.register(rateLimit, {
    max: config.rateLimit.requestsPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Use auth token as key if available, otherwise IP
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
      }
      return request.ip;
    },
    errorResponseBuilder: (request, context) => ({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded',
      hint: `Try again in ${Math.round((context as any).after / 1000)} seconds`,
      retryAfter: (context as any).after,
    }),
  });

  // Register health check plugin
  await server.register(healthCheckPlugin, {
    timeout: 5000,
    cacheTimeout: 30000,
    enableCaching: true,
    gracePeriod: 10000,
    maxRetries: 3,
    retryDelay: 1000
  });

  // Register global security headers middleware
  server.addHook('preHandler', security.securityHeadersMiddleware.middleware());

  // Add request logging hooks if structured logging is enabled
  if (config.logging.enableStructuredLogging) {
    const structuredLogger = (server as any).structuredLogger;
    
    // Log incoming requests
    server.addHook('preHandler', async (request, reply) => {
      const startTime = Date.now();
      (request as any).startTime = startTime;
      
      structuredLogger.debug('Incoming request', {
        request: {
          method: request.method,
          url: request.url,
          headers: request.headers as any,
        },
        clientInfo: {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          origin: request.headers.origin,
          referer: request.headers.referer,
        }
      }, undefined, undefined, ['request'], (request as any).correlationId);
    });

    // Log outgoing responses
    server.addHook('onResponse', async (request, reply) => {
      const startTime = (request as any).startTime;
      const duration = startTime ? Date.now() - startTime : undefined;
      
      structuredLogger.logHttpRequest(
        request.method,
        request.url,
        reply.statusCode,
        duration || 0,
        {
          clientInfo: {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
          response: {
            headers: reply.getHeaders() as any,
          }
        },
        undefined,
        (request as any).correlationId
      );
    });
  }
}

/**
 * Register route handlers
 */
async function registerRoutes(server: FastifyInstance, config: ServerConfig): Promise<void> {
  const security = (server as any).security;

  // Note: Health endpoints are now registered by the healthCheckPlugin
  // The basic handlers are kept as fallbacks but the enhanced ones are preferred

  // Security metrics endpoint
  server.get('/security/metrics', {
    preHandler: [security.authMiddleware.middleware()]
  }, async (request, reply) => {
    const metrics = {
      audit: security.auditLogger.getMetrics(),
      auth: security.authMiddleware.getStats(),
      rateLimit: security.rateLimitMiddleware.getStats(),
      cors: security.corsMiddleware.getConfig()
    };
    return { success: true, data: metrics };
  });

  // Main API endpoints with enhanced security
  server.post('/sse', {
    preHandler: [
      security.authMiddleware.middleware(),
      security.rateLimitMiddleware.middleware(),
      requestSizeMiddleware(config)
    ],
    // Pass config and audit logger to route handler
    onRequest: (request, reply, done) => {
      (request as any).server.config = config;
      (request as any).server.auditLogger = security.auditLogger;
      done();
    }
  }, sseRouteHandler);

  server.post('/mcp', {
    preHandler: [
      security.authMiddleware.middleware(),
      security.rateLimitMiddleware.middleware(),
      requestSizeMiddleware(config)
    ],
    // Pass config and audit logger to route handler
    onRequest: (request, reply, done) => {
      (request as any).server.config = config;
      (request as any).server.auditLogger = security.auditLogger;
      done();
    }
  }, mcpRouteHandler);

  // Root endpoint for API info
  server.get('/', async () => ({
    name: 'Task MCP HTTPS/SSE Server',
    version: '1.0.0',
    security: {
      authentication: 'Bearer token and cookie-based',
      rateLimiting: 'IP and token-based with burst control',
      cors: 'Configurable origin whitelist',
      headers: 'CSP, HSTS, and security headers',
      audit: 'Structured JSON logging'
    },
    endpoints: {
      sse: 'POST /sse - Server-Sent Events',
      mcp: 'POST /mcp - Streamable HTTP (NDJSON)',
      healthz: 'GET /healthz - Liveness probe',
      readyz: 'GET /readyz - Readiness probe',
      security: 'GET /security/metrics - Security metrics (authenticated)'
    },
    documentation: 'https://github.com/Fission-AI/OpenSpec',
  }));
}



/**
 * Request size middleware
 */
function requestSizeMiddleware(config: ServerConfig) {
  return async (request: any, reply: any) => {
    const contentLength = request.headers['content-length'];
    if (contentLength) {
      const sizeKb = parseInt(contentLength) / 1024;
      if (sizeKb > config.responseLimits.maxResponseSizeKb) {
        throw new HTTPError(
          413,
          'REQUEST_TOO_LARGE',
          `Request size exceeds limit of ${config.responseLimits.maxResponseSizeKb}KB`
        );
      }
    }
  };
}

/**
 * Register error handlers
 */
function registerErrorHandlers(server: FastifyInstance): void {
  // Handle HTTPError instances
  server.setErrorHandler((error: Error, request, reply) => {
    const structuredLogger = (server as any).structuredLogger;
    const requestId = request.id;
    const correlationId = (request as any).correlationId;
    
    if (error instanceof HTTPError) {
      // Use structured logger if available, otherwise fall back to Fastify logger
      if (structuredLogger) {
        structuredLogger.warn('HTTP error occurred', {
          request: {
            method: request.method,
            url: request.url,
            headers: request.headers as any,
          },
          response: {
            statusCode: error.statusCode,
          },
          clientInfo: {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          }
        }, error, undefined, ['http', 'error'], correlationId);
      } else {
        server.log.warn({
          requestId,
          error: error.message,
          code: error.code,
          statusCode: error.statusCode,
        }, 'HTTP error occurred');
      }

      reply.code(error.statusCode).send({
        apiVersion: '1.0.0',
        error: {
          code: error.code,
          message: error.message,
          hint: error.hint,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Handle validation errors
    if ('validation' in error && error.validation) {
      if (structuredLogger) {
        structuredLogger.warn('Validation error occurred', {
          request: {
            method: request.method,
            url: request.url,
            headers: request.headers as any,
          },
          response: {
            statusCode: 400,
          },
          clientInfo: {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          }
        }, error, undefined, ['validation', 'error'], correlationId);
      } else {
        server.log.warn({
          requestId,
          error: error.message,
          validation: error.validation,
        }, 'Validation error occurred');
      }

      reply.code(400).send({
        apiVersion: '1.0.0',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request format',
          hint: 'Check request body and parameters',
          details: (error as any).validation,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Handle unexpected errors
    if (structuredLogger) {
      structuredLogger.error('Unexpected error occurred', {
        request: {
          method: request.method,
          url: request.url,
          headers: request.headers as any,
        },
        clientInfo: {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        }
      }, error, undefined, ['unexpected', 'error'], correlationId);
    } else {
      server.log.error({
        requestId,
        error: error.message,
        stack: error.stack,
      }, 'Unexpected error occurred');
    }

    reply.code(500).send({
      apiVersion: '1.0.0',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        hint: 'Please try again or contact support if the issue persists',
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  });
}

/**
 * Register graceful shutdown handlers
 */
function registerGracefulShutdown(server: FastifyInstance): void {
  const shutdown = async (signal: string) => {
    const structuredLogger = (server as any).structuredLogger;
    
    if (structuredLogger) {
      structuredLogger.info(`Received ${signal}, starting graceful shutdown...`, undefined, undefined, undefined, ['shutdown']);
    } else {
      server.log.info(`Received ${signal}, starting graceful shutdown...`);
    }
    
    try {
      await server.close();
      
      // Close structured logger if available
      if (structuredLogger) {
        await structuredLogger.close();
        structuredLogger.info('Server closed successfully', undefined, undefined, undefined, ['shutdown']);
      } else {
        server.log.info('Server closed successfully');
      }
      
      process.exit(0);
    } catch (error) {
      if (structuredLogger) {
        structuredLogger.error('Error during server shutdown', undefined, error as Error, undefined, ['shutdown']);
      } else {
        server.log.error({ error }, 'Error during server shutdown');
      }
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Logger configuration (using Fastify's built-in logger)
 */
function createLogger(level: string) {
  return {
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Initialize OpenTelemetry first
    await initializeOpenTelemetry({
      serviceName: 'task-mcp-http',
      serviceVersion: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    });

    // Load and validate configuration
    const envConfig = loadEnvConfig();
    const serverConfig = await createServerConfig(envConfig);
    validateConfig(serverConfig);

    // Create and start server
    const server = await createServer(serverConfig);

    const startOptions: any = {
      port: serverConfig.port,
      host: serverConfig.host,
    };

    // Add TLS options if configured
    if (serverConfig.tls) {
      startOptions.https = {
        key: serverConfig.tls.key,
        cert: serverConfig.tls.cert,
      };
    }

    await server.listen(startOptions);

    const protocol = serverConfig.tls ? 'https' : 'http';
    server.log.info(`Task MCP HTTP server listening on ${protocol}://${serverConfig.host}:${serverConfig.port}`);
    server.log.info(`Endpoints:`);
    server.log.info(`  - POST /sse - Server-Sent Events`);
    server.log.info(`  - POST /mcp - Streamable HTTP (NDJSON)`);
    server.log.info(`  - GET /healthz - Liveness probe`);
    server.log.info(`  - GET /readyz - Readiness probe`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  main();
}