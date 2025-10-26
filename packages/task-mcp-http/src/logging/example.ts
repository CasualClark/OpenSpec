/**
 * Example usage of the structured JSON logging module
 */

import { 
  createStructuredLogger, 
  getDefaultLoggerConfig,
  CorrelationManager 
} from './index.js';

async function example() {
  console.log('=== Structured JSON Logging Example ===\n');

  // Create logger with development configuration
  const logger = createStructuredLogger({
    ...getDefaultLoggerConfig(),
    service: 'example-service',
    version: '1.0.0',
    level: 'debug',
    enableConsole: true,
    enableFile: false,
    enableJsonOutput: true,
    enablePrettyOutput: true, // Pretty output for console
    environment: 'development',
  } as any);

  const correlationManager = CorrelationManager.getInstance();

  // Example 1: Basic logging
  console.log('1. Basic logging:');
  logger.debug('Debug message for debugging');
  logger.info('Information message');
  logger.warn('Warning message');
  logger.error('Error message');
  console.log();

  // Example 2: Logging with correlation ID
  console.log('2. Logging with correlation ID:');
  const context = correlationManager.createContext({
    correlationId: 'example-correlation-123',
    requestId: 'req-456',
    userId: 'user-789',
    tags: ['example', 'demo'],
  });

  logger.info('Message with correlation context', {
    userId: 'user-789',
    clientInfo: {
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Example Browser)',
    },
    request: {
      method: 'POST',
      url: '/api/tools/execute',
    },
  }, undefined, undefined, ['api']);

  console.log();

  // Example 3: HTTP request logging
  console.log('3. HTTP request logging:');
  logger.logHttpRequest(
    'POST',
    '/api/tools/execute',
    200,
    150,
    {
      clientInfo: {
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Example Browser)',
      },
      request: {
        method: 'POST',
        url: '/api/tools/execute',
        headers: { 'content-type': 'application/json' },
      },
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
      },
    }
  );

  console.log();

  // Example 4: Tool execution logging
  console.log('4. Tool execution logging:');
  logger.logToolExecution(
    'file-read',
    { path: '/tmp/example.txt', encoding: 'utf8' },
    { content: 'Hello, World!', size: 13 },
    undefined,
    75
  );

  console.log();

  // Example 5: Error logging
  console.log('5. Error logging:');
  const error = new Error('Something went wrong');
  error.name = 'ExampleError';
  (error as any).code = 'EXAMPLE_ERROR';
  
  logger.error('An error occurred during operation', {
    userId: 'user-789',
    tool: {
      name: 'file-write',
      input: { path: '/tmp/example.txt' }
    }
  }, error, undefined, ['error', 'operation']);

  console.log();

  // Example 6: Security event logging
  console.log('6. Security event logging:');
  logger.logSecurityEvent(
    'authentication-failed',
    'medium',
    {
      clientInfo: {
        ipAddress: '192.168.1.100',
        userAgent: 'SuspiciousBot/1.0',
      },
      security: {
        authMethod: 'bearer-token',
        rateLimited: false,
      },
    },
    { reason: 'Invalid token', attempts: 3 }
  );

  console.log();

  // Example 7: Child logger
  console.log('7. Child logger with inherited context:');
  const childLogger = logger.child({
    userId: 'user-789',
    security: {
      authMethod: 'oauth2'
    }
  }, ['auth']);

  childLogger.info('Authentication successful');

  console.log();

  // Example 8: Logger metrics
  console.log('8. Logger metrics:');
  const metrics = logger.getMetrics();
  console.log(`Total logs: ${metrics.totalLogs}`);
  console.log(`Error count: ${metrics.errorCount}`);
  console.log(`Logs by level:`, metrics.logsByLevel);

  console.log();

  // Example 9: Correlation manager statistics
  console.log('9. Correlation manager statistics:');
  const stats = correlationManager.getStats();
  console.log(`Total contexts: ${stats.totalContexts}`);
  console.log(`Average duration: ${Math.round(stats.averageDuration)}ms`);
  console.log(`Contexts by tag:`, stats.contextsByTag);

  console.log();

  // Example 10: JSON output (production style)
  console.log('10. JSON output (production style):');
  const prodLogger = createStructuredLogger({
    ...getDefaultLoggerConfig(),
    service: 'production-service',
    version: '1.0.0',
    level: 'info',
    enableConsole: true,
    enableFile: false,
    enableJsonOutput: true,
    enablePrettyOutput: false, // JSON output for production
    environment: 'production',
  } as any);

  prodLogger.info('Production log entry', {
    userId: 'user-456',
    request: {
      method: 'GET',
      url: '/api/health'
    }
  }, undefined, { throughput: 1000, responseTime: 120, memoryUsage: 51200000 }, ['production']);

  console.log('\n=== Example completed ===');

  // Cleanup
  await logger.close();
  await prodLogger.close();
}

// Run example if this file is executed directly
if (require.main === module) {
  example().catch(console.error);
}

export { example };