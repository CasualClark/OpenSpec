/**
 * Tests for structured JSON logging module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  StructuredLogger, 
  createStructuredLogger, 
  getDefaultLoggerConfig,
  CorrelationManager,
  LogLevel,
  LogContext
} from '../../src/logging/index.js';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let correlationManager: CorrelationManager;

  beforeEach(() => {
    correlationManager = CorrelationManager.getInstance();
    
    // Force cleanup of all contexts by accessing private property
    (correlationManager as any).contexts.clear();
    (correlationManager as any).currentContext = undefined;
    
    logger = createStructuredLogger({
      ...getDefaultLoggerConfig(),
      level: 'debug',
      service: 'test-service',
      version: '1.0.0-test',
      enableConsole: false, // Disable console for tests
      enableFile: false,    // Disable file for tests
      enableJsonOutput: true,
      enablePrettyOutput: false,
    } as any);
  });

  afterEach(async () => {
    correlationManager.cleanup();
    await logger.close();
  });

  describe('basic logging', () => {
    it('should create logger with default config', () => {
      expect(logger).toBeInstanceOf(StructuredLogger);
    });

    it('should log messages at different levels', () => {
      expect(() => {
        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warning message');
        logger.error('Error message');
        logger.fatal('Fatal message');
      }).not.toThrow();
    });

    it('should respect log level configuration', () => {
      const warnLogger = createStructuredLogger({
        ...getDefaultLoggerConfig(),
        level: 'warn',
        enableConsole: false,
        enableFile: false,
        service: 'test-service',
        enableJsonOutput: true,
        enablePrettyOutput: false,
      } as any);

      expect(() => {
        warnLogger.debug('Debug message'); // Should not log
        warnLogger.info('Info message');  // Should not log
        warnLogger.warn('Warning message'); // Should log
        warnLogger.error('Error message');  // Should log
      }).not.toThrow();

      warnLogger.close();
    });
  });

  describe('correlation IDs', () => {
    it('should create and manage correlation contexts', () => {
      const context = correlationManager.createContext({
        correlationId: 'test-correlation-id',
        requestId: 'test-request-id',
        userId: 'test-user',
        tags: ['test', 'unit'],
      });

      expect(context.correlationId).toBe('test-correlation-id');
      expect(context.requestId).toBe('test-request-id');
      expect(context.userId).toBe('test-user');
      expect(context.tags).toContain('test');
      expect(context.tags).toContain('unit');
    });

    it('should get and set current correlation context', () => {
      const context = correlationManager.createContext({
        correlationId: 'test-correlation-id',
      });

      const current = correlationManager.getCurrentContext();
      expect(current?.correlationId).toBe('test-correlation-id');

      correlationManager.clearCurrentContext();
      const cleared = correlationManager.getCurrentContext();
      expect(cleared).toBeUndefined();
    });

    it('should extract correlation ID from headers', () => {
      const headers = {
        'x-correlation-id': 'header-correlation-id',
        'x-request-id': 'header-request-id',
      };

      const correlationId = correlationManager.extractFromHeaders(headers);
      expect(correlationId).toBe('header-correlation-id');
    });

    it('should generate correlation ID if missing', () => {
      const correlationId = correlationManager.generateCorrelationId();
      expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('context and metadata', () => {
    it('should log with context', () => {
      const context: LogContext = {
        userId: 'test-user',
        clientInfo: {
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        },
        request: {
          method: 'POST',
          url: '/test',
        },
        response: {
          statusCode: 200,
        },
      };

      expect(() => {
        logger.info('Test message with context', context);
      }).not.toThrow();
    });

    it('should log with error details', () => {
      const error = new Error('Test error');
      error.name = 'TestError';
      (error as any).code = 'TEST_ERROR';
      (error as any).statusCode = 400;

      expect(() => {
        logger.error('Test error message', undefined, error);
      }).not.toThrow();
    });

    it('should log with metrics', () => {
      const metrics = {
        requestCount: 100,
        responseTime: 150,
        memoryUsage: 50 * 1024 * 1024,
      };

      expect(() => {
        logger.info('Test message with metrics', undefined, undefined, metrics);
      }).not.toThrow();
    });

    it('should log with tags', () => {
      expect(() => {
        logger.info('Test message with tags', undefined, undefined, undefined, ['test', 'unit', 'logging']);
      }).not.toThrow();
    });
  });

  describe('specialized logging methods', () => {
    it('should log HTTP requests', () => {
      expect(() => {
        logger.logHttpRequest('GET', '/api/test', 200, 150, {
          clientInfo: { ipAddress: '127.0.0.1' },
        });
      }).not.toThrow();
    });

    it('should log tool execution', () => {
      expect(() => {
        logger.logToolExecution('test-tool', { input: 'value' }, { output: 'result' }, undefined, 100);
      }).not.toThrow();
    });

    it('should log security events', () => {
      expect(() => {
        logger.logSecurityEvent('authentication-failed', 'high', {
          clientInfo: { ipAddress: '127.0.0.1' },
        });
      }).not.toThrow();
    });
  });

  describe('child loggers', () => {
    it('should create child logger with additional context', () => {
      const childLogger = logger.child({
        userId: 'test-user',
        sessionId: 'test-session',
      }, ['child']);

      expect(childLogger).toBeInstanceOf(StructuredLogger);

      expect(() => {
        childLogger.info('Child logger message');
      }).not.toThrow();
    });
  });

  describe('error handling and sanitization', () => {
    it('should normalize different error types', () => {
      const customError = {
        name: 'CustomError',
        message: 'Custom error message',
        code: 'CUSTOM_CODE',
        statusCode: 500,
        details: { field: 'value' },
      };

      expect(() => {
        logger.error('Custom error', undefined, customError as any);
      }).not.toThrow();
    });

    it('should handle null/undefined inputs gracefully', () => {
      expect(() => {
        logger.info('Test message', undefined, undefined, undefined, undefined);
      }).not.toThrow();
    });
  });

  describe('metrics and monitoring', () => {
    it('should track logger metrics', () => {
      const initialMetrics = logger.getMetrics();
      expect(initialMetrics.totalLogs).toBe(0);

      logger.info('Test message');
      logger.error('Error message');

      const updatedMetrics = logger.getMetrics();
      expect(updatedMetrics.totalLogs).toBe(2);
      expect(updatedMetrics.logsByLevel.info).toBe(1);
      expect(updatedMetrics.logsByLevel.error).toBe(1);
      expect(updatedMetrics.errorCount).toBe(1);
    });

    it('should reset metrics', () => {
      logger.info('Test message');
      logger.error('Error message');

      logger.resetMetrics();
      const metrics = logger.getMetrics();
      expect(metrics.totalLogs).toBe(0);
      expect(metrics.errorCount).toBe(0);
    });
  });

  describe('correlation manager statistics', () => {
    it('should provide correlation context statistics', () => {
      correlationManager.cleanup(); // Clear any existing contexts
      correlationManager.createContext({ correlationId: 'test-1' });
      correlationManager.createContext({ correlationId: 'test-2', tags: ['test'] });

      const stats = correlationManager.getStats();
      expect(stats.totalContexts).toBe(2);
      expect(stats.contextsByTag.test).toBe(1);
    });

    it('should clean up old contexts', () => {
      correlationManager.cleanup(); // Clear any existing contexts
      correlationManager.createContext({ correlationId: 'old-context' });
      
      // Simulate time passing by manually setting start time
      const context = correlationManager.getContext('old-context');
      if (context) {
        context.startTime = Date.now() - 2 * 3600000; // 2 hours ago
      }

      correlationManager.cleanup(3600000); // 1 hour max age
      
      const stats = correlationManager.getStats();
      expect(stats.totalContexts).toBe(0);
    });
  });
});