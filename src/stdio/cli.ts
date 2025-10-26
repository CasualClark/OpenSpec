#!/usr/bin/env node

/**
 * CLI entry point for Task MCP stdio server
 */

import { createDevServer, createProdServer } from './factory.js';
import { program } from 'commander';

program
  .name('task-mcp-server')
  .description('Task MCP stdio server for OpenSpec')
  .version('1.0.0');

program
  .command('start')
  .description('Start the Task MCP server')
  .option('-d, --dev', 'Start in development mode with debug logging')
  .option('-w, --working-dir <path>', 'Working directory for the server')
  .action(async (options) => {
    try {
      const server = options.dev 
        ? await createDevServer(options.workingDir)
        : await createProdServer(options.workingDir);
      
      await server.start();
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await server.shutdown();
        process.exit(0);
      });
      
      process.on('SIGTERM', async () => {
        console.log('Received SIGTERM, shutting down gracefully...');
        await server.shutdown();
        process.exit(0);
      });
      
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

program
  .command('dev')
  .description('Start the Task MCP server in development mode')
  .option('-w, --working-dir <path>', 'Working directory for the server')
  .action(async (options) => {
    try {
      const server = await createDevServer(options.workingDir);
      await server.start();
      
      process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await server.shutdown();
        process.exit(0);
      });
      
    } catch (error) {
      console.error('Failed to start dev server:', error);
      process.exit(1);
    }
  });

program.parse();