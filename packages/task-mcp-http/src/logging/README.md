# Structured JSON Logging Module

A comprehensive logging system for Task MCP HTTP server with JSON output, error normalization, and correlation ID support.

## Features

- **Structured JSON Output**: Consistent, machine-readable log format
- **Correlation IDs**: Request tracing across services and operations
- **Error Normalization**: Standardized error handling with stack traces
- **Multiple Transports**: Console, file, buffered, and async output
- **Log Levels**: debug, info, warn, error, fatal with filtering
- **Context Management**: Rich context data with requests, users, and metrics
- **Security**: Automatic field redaction and sensitive data sanitization
- **Performance**: Async, buffered logging with minimal overhead
- **Child Loggers**: Context inheritance for modular applications

## Quick Start

```typescript
import { createStructuredLogger, getDefaultLoggerConfig } from './logging/index.js';

// Create logger
const logger = createStructuredLogger({
  ...getDefaultLoggerConfig(),
  service: 'my-service',
  level: 'info',
  enableConsole: true,
  enableFile: true,
  filePath: './logs/app.log',
});

// Basic logging
logger.info('Application started');
logger.error('Something went wrong', { userId: '123' }, new Error('Details'));

// With correlation ID
const context = logger.createCorrelationContext({
  correlationId: 'req-123',
  userId: 'user-456'
});

logger.info('User action', { action: 'login' }, undefined, undefined, ['auth'], context.correlationId);
```

## Configuration Options

```typescript
interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  service: string;
  version: string;
  environment?: 'development' | 'staging' | 'production';
  
  // Output options
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableJsonOutput: boolean;
  enablePrettyOutput: boolean;
  
  // Performance options
  bufferSize?: number;
  flushIntervalMs?: number;
  
  // Security options
  includeStackTrace?: boolean;
  sanitizeErrors?: boolean;
  redactFields?: string[];
  
  // File rotation
  maxFileSize?: number;
  maxFiles?: number;
}
```

## Environment Variables

```bash
# Basic logging
LOG_LEVEL=info
ENABLE_STRUCTURED_LOGGING=true
ENABLE_JSON_OUTPUT=true
ENABLE_PRETTY_OUTPUT=false

# File logging
LOG_FILE=./logs/app.log
LOG_MAX_FILE_SIZE=10485760  # 10MB
LOG_MAX_FILES=5

# Performance
LOG_BUFFER_SIZE=100
LOG_FLUSH_INTERVAL_MS=5000

# Security
LOG_INCLUDE_STACK_TRACE=true
LOG_SANITIZE_ERRORS=true
```

## API Reference

### Core Methods

```typescript
// Basic logging
logger.debug(message, context?, error?, metrics?, tags?)
logger.info(message, context?, error?, metrics?, tags?)
logger.warn(message, context?, error?, metrics?, tags?)
logger.error(message, context?, error?, metrics?, tags?)
logger.fatal(message, context?, error?, metrics?, tags?)

// Specialized methods
logger.logHttpRequest(method, url, statusCode, duration, context?, error?, correlationId?)
logger.logToolExecution(toolName, input, output?, error?, duration?)
logger.logSecurityEvent(event, severity, context?, details?)
```

### Correlation Management

```typescript
// Create correlation context
const context = logger.createCorrelationContext({
  correlationId: 'req-123',
  requestId: 'req-123-456',
  userId: 'user-789',
  sessionId: 'sess-456',
  tags: ['api', 'v1']
});

// Get current context
const current = logger.getCurrentCorrelationContext();

// Manual correlation ID
logger.info('Message', undefined, undefined, undefined, ['api'], 'custom-id');
```

### Child Loggers

```typescript
const childLogger = logger.child({
  component: 'auth-service',
  version: '2.1.0'
}, ['auth']);

childLogger.info('Authentication successful', { userId: '123' });
```

## Log Entry Structure

```json
{
  "timestamp": "2025-10-26T07:59:47.935Z",
  "level": "info",
  "message": "User login successful",
  "service": "task-mcp-http",
  "version": "1.0.0",
  "correlationId": "req-123-456",
  "requestId": "req-123-456-789",
  "context": {
    "userId": "user-789",
    "clientInfo": {
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0..."
    },
    "request": {
      "method": "POST",
      "url": "/api/auth/login"
    },
    "response": {
      "statusCode": 200
    }
  },
  "error": {
    "name": "ValidationError",
    "message": "Invalid credentials",
    "code": "AUTH_FAILED",
    "stack": "..."
  },
  "metrics": {
    "responseTime": 150,
    "memoryUsage": 51200000
  },
  "tags": ["auth", "api"],
  "duration": 150
}
```

## Transports

### Console Transport
Outputs to stdout/stderr with optional pretty formatting.

### File Transport
Writes to files with automatic rotation based on size.

### Buffered Transport
Batches log entries for improved performance.

### Async Transport
Non-blocking logging with internal queue.

### Multi Transport
Writes to multiple destinations simultaneously.

### Filter Transport
Filters entries based on custom predicates.

## Security Features

### Field Redaction
Automatically redacts sensitive fields:
- password, token, secret, key
- authorization, cookie, session
- creditCard, ssn, apiKey

### Error Sanitization
- Removes stack traces in production
- Sanitizes error messages containing sensitive data
- Configurable sanitization rules

## Performance

### Buffering
Logs are buffered in memory and flushed periodically:
- Default buffer size: 100 entries
- Default flush interval: 5 seconds
- Immediate flush for critical errors

### Async Processing
Non-blocking logging with internal queues:
- Minimal impact on request processing
- Configurable queue sizes
- Graceful degradation under load

## Integration with Fastify

The logging module integrates seamlessly with Fastify:

```typescript
import { correlationPlugin } from './logging/index.js';

// Register correlation plugin
await server.register(correlationPlugin);

// Automatic request logging
server.addHook('onResponse', async (request, reply) => {
  const logger = (server as any).structuredLogger;
  logger.logHttpRequest(request.method, request.url, reply.statusCode, 
    Date.now() - (request as any).startTime);
});
```

## Testing

```typescript
import { createStructuredLogger } from './logging/index.js';

describe('MyService', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = createStructuredLogger({
      service: 'test-service',
      level: 'debug',
      enableConsole: false,
      enableFile: false,
    });
  });

  afterEach(async () => {
    await logger.close();
  });
});
```

## Examples

See `src/logging/example.ts` for comprehensive usage examples.

## Best Practices

1. **Use Structured Data**: Always provide context objects with relevant metadata
2. **Correlation IDs**: Use correlation IDs for request tracing
3. **Appropriate Levels**: Choose log levels based on severity and audience
4. **Security**: Enable field redaction and error sanitization in production
5. **Performance**: Use buffering and async transports for high-throughput scenarios
6. **Child Loggers**: Use child loggers for modular components
7. **Metrics**: Include performance metrics for monitoring
8. **Tags**: Use tags for log categorization and filtering

## Migration from Existing Logging

To migrate from existing logging:

1. Replace console.log with logger.info
2. Add structured context data
3. Implement correlation IDs
4. Configure appropriate transports
5. Enable security features
6. Add performance metrics

## Monitoring and Observability

The logging module provides built-in metrics:

```typescript
const metrics = logger.getMetrics();
console.log(`Total logs: ${metrics.totalLogs}`);
console.log(`Error rate: ${metrics.errorCount / metrics.totalLogs}`);
```

Correlation manager statistics:

```typescript
const stats = correlationManager.getStats();
console.log(`Active contexts: ${stats.totalContexts}`);
console.log(`Average duration: ${stats.averageDuration}ms`);
```