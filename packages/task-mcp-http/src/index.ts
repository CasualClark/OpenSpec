/**
 * Task MCP HTTPS/SSE Server - Phase 4 Implementation
 * 
 * Production-ready Fastify server with SSE and Streamable HTTP endpoints
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { v4 as uuidv4 } from 'uuid';
// import winston from 'winston'; // Using Fastify logger for now

import { ServerConfig, HTTPError } from './types.js';
import { loadEnvConfig, createServerConfig, validateConfig } from './config.js';
import { sseRouteHandler } from './routes/sse.js';
import { mcpRouteHandler } from './routes/mcp.js';
import { healthzHandler, readyzHandler } from './routes/health.js';
import { 
  AuthenticationMiddleware, 
  AuditLogger, 
  CorsMiddleware, 
  RateLimitMiddleware, 
  SecurityHeadersMiddleware,
  createAuditLogger
} from './security/index.js';

/**
 * Create and configure the Fastify server
 */
export async function createServer(config: ServerConfig): Promise<FastifyInstance> {
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

  // Create Fastify instance
  const server = Fastify({
    logger: loggerConfig,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => uuidv4(),
  });

  // Store security instances for later use
  (server as any).security = {
    auditLogger,
    authMiddleware,
    corsMiddleware,
    rateLimitMiddleware,
    securityHeadersMiddleware
  };

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

  // Register global security headers middleware
  server.addHook('preHandler', security.securityHeadersMiddleware.middleware());
}

/**
 * Register route handlers
 */
async function registerRoutes(server: FastifyInstance, config: ServerConfig): Promise<void> {
  const security = (server as any).security;

  // Health check endpoints (no auth required)
  server.get('/healthz', healthzHandler);
  server.get('/readyz', readyzHandler);

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
    const requestId = request.id;
    
    if (error instanceof HTTPError) {
      server.log.warn({
        requestId,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      }, 'HTTP error occurred');

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
      server.log.warn({
        requestId,
        error: error.message,
        validation: error.validation,
      }, 'Validation error occurred');

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
    server.log.error({
      requestId,
      error: error.message,
      stack: error.stack,
    }, 'Unexpected error occurred');

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
    server.log.info(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      await server.close();
      server.log.info('Server closed successfully');
      process.exit(0);
    } catch (error) {
      server.log.error({ error }, 'Error during server shutdown');
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