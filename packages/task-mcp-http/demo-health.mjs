#!/usr/bin/env node

/**
 * Demo script to test health check endpoints
 */

import Fastify from 'fastify';
import { healthCheckPlugin } from './dist/health/index.js';

async function demo() {
  console.log('🚀 Starting Task MCP HTTP Server with Health Checks Demo');
  
  // Create Fastify server
  const server = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  try {
    // Register health check plugin
    await server.register(healthCheckPlugin, {
      timeout: 5000,
      cacheTimeout: 30000,
      enableCaching: true,
      gracePeriod: 10000,
      maxRetries: 3,
      retryDelay: 1000
    });

    // Register a custom health check for demo
    const registry = server.health.registry;
    registry.register('demo-check', {
      timeout: 2000,
      interval: 10000,
      critical: false,
      check: async () => {
        const startTime = Date.now();
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
          status: 'pass',
          message: 'Demo check completed successfully',
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { demo: true }
        };
      }
    });

    // Start server
    const port = 8080;
    const host = '0.0.0.0';
    
    await server.listen({ port, host });
    
    console.log(`✅ Server is running on http://${host}:${port}`);
    console.log('');
    console.log('📊 Health Endpoints:');
    console.log(`   Liveness:  http://${host}:${port}/healthz`);
    console.log(`   Readiness: http://${host}:${port}/readyz`);
    console.log(`   Detailed:  http://${host}:${port}/health`);
    console.log(`   Metrics:   http://${host}:${port}/metrics`);
    console.log('');
    console.log('🔧 Management API (requires auth):');
    console.log(`   GET  http://${host}:${port}/health/checks`);
    console.log(`   POST http://${host}:${port}/health/checks/demo-check/disable`);
    console.log(`   POST http://${host}:${port}/health/checks/demo-check/enable`);
    console.log('');
    console.log('🧪 Try these commands:');
    console.log(`   curl http://${host}:${port}/healthz | jq`);
    console.log(`   curl http://${host}:${port}/readyz | jq`);
    console.log(`   curl http://${host}:${port}/health | jq`);
    console.log(`   curl http://${host}:${port}/metrics`);
    console.log('');
    console.log('Press Ctrl+C to stop the server');

    // Setup graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      await server.close();
      console.log('✅ Server stopped');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Run the demo
demo().catch(console.error);