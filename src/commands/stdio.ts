import { Command } from 'commander';
import ora from 'ora';
import path from 'path';
import { promises as fs } from 'fs';
import { createServer } from '../stdio/factory.js';
import { isInteractive } from '../utils/interactive.js';
import { InputSanitizer } from '../stdio/security/input-sanitizer.js';
import { ErrorSanitizer } from '../stdio/security/error-sanitizer.js';

interface StdioOptions {
  port?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  workingDirectory?: string;
  background?: boolean;
  pidFile?: string;
  dev?: boolean;
  config?: string;
}

export class StdioCommand {
  async execute(options: StdioOptions = {}): Promise<void> {
    const interactive = isInteractive();
    
    try {
      // Sanitize CLI options
      const sanitizedOptions = InputSanitizer.sanitize(options, {
        maxLength: 10000,
        allowedChars: null // Use default sanitization for CLI options
      });

      if (!sanitizedOptions.isSafe) {
        console.warn('CLI options sanitization issues detected:', sanitizedOptions.issues);
        
        // Block critical security issues
        const criticalIssues = sanitizedOptions.issues.filter(i => 
          i.severity === 'critical' || i.severity === 'high'
        );
        
        if (criticalIssues.length > 0) {
          const error = new Error(`CLI options contain security threats: ${criticalIssues.map(i => i.message).join(', ')}`);
          const sanitized = ErrorSanitizer.sanitize(error, {
            context: 'cli',
            userType: 'user',
            logDetails: true
          });
          throw new Error(sanitized.message);
        }
      }

      const safeOptions = sanitizedOptions.sanitized;

      // Determine working directory with path sanitization
      const workingDirInput = safeOptions.workingDirectory || process.cwd();
      const pathSanitization = InputSanitizer.sanitizePath(workingDirInput);
      
      if (!pathSanitization.isSafe) {
        const error = new Error(`Working directory contains path traversal: ${pathSanitization.issues.map(i => i.message).join(', ')}`);
        const sanitized = ErrorSanitizer.sanitize(error, {
          context: 'cli',
          userType: 'user',
          logDetails: true
        });
        throw new Error(sanitized.message);
      }
      
      const workingDirectory = pathSanitization.sanitized;
      
      // Resolve config file if provided with sanitization
      let config: Partial<StdioOptions> = {};
      if (safeOptions.config) {
        const configPathSanitization = InputSanitizer.sanitizePath(safeOptions.config);
        if (!configPathSanitization.isSafe) {
          throw new Error(`Config file path contains security issues: ${configPathSanitization.issues.map(i => i.message).join(', ')}`);
        }
        config = await this.loadConfigFile(configPathSanitization.sanitized);
      }
      
      // Merge options: CLI flags > config file > defaults
      const mergedOptions = {
        logLevel: safeOptions.logLevel || config.logLevel || 'info',
        workingDirectory,
        dev: safeOptions.dev || false,
        background: safeOptions.background || false,
        pidFile: safeOptions.pidFile || config.pidFile || path.join(workingDirectory, '.openspec-stdio.pid')
      };

      // Create server instance
      const spinner = interactive ? ora('Starting Task MCP stdio server...') : undefined;
      spinner?.start();

      const server = await createServer({
        name: mergedOptions.dev ? 'task-mcp-dev-server' : 'task-mcp-server',
        version: mergedOptions.dev ? '1.0.0-dev' : '1.0.0',
        workingDirectory,
        logLevel: mergedOptions.logLevel as 'debug' | 'info' | 'warn' | 'error'
      });

      // Handle background mode
      if (mergedOptions.background) {
        await this.startInBackground(server, { ...mergedOptions, workingDirectory });
        spinner?.succeed('Task MCP stdio server started in background');
        return;
      }

      // Start server in foreground
      spinner?.succeed('Task MCP stdio server started');
      
      // Set up signal handlers for graceful shutdown
      this.setupSignalHandlers(server);
      
      // Start the server (this will block)
      await server.start();
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ora().fail(`Failed to start Task MCP stdio server: ${message}`);
      process.exit(1);
    }
  }

  async stop(pidFile?: string): Promise<void> {
    const interactive = isInteractive();
    const spinner = interactive ? ora('Stopping Task MCP stdio server...') : undefined;
    
    try {
      const pidFilePath = pidFile || path.join(process.cwd(), '.openspec-stdio.pid');
      
      // Check if PID file exists
      try {
        await fs.access(pidFilePath);
      } catch {
        throw new Error('No running server found (PID file does not exist)');
      }

      // Read PID
      const pidContent = await fs.readFile(pidFilePath, 'utf-8');
      const pid = parseInt(pidContent.trim(), 10);
      
      if (isNaN(pid)) {
        throw new Error('Invalid PID file format');
      }

      // Check if process is running
      try {
        process.kill(pid, 0); // Signal 0 just checks if process exists
      } catch {
        throw new Error(`Server process ${pid} is not running`);
      }

      // Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if process still exists
      try {
        process.kill(pid, 0);
        // Force kill if still running
        process.kill(pid, 'SIGKILL');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch {
        // Process is gone, which is what we want
      }

      // Remove PID file
      await fs.unlink(pidFilePath);
      
      spinner?.succeed('Task MCP stdio server stopped');
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner?.fail(`Failed to stop server: ${message}`);
      process.exit(1);
    }
  }

  async status(pidFile?: string): Promise<void> {
    const interactive = isInteractive();
    
    try {
      const pidFilePath = pidFile || path.join(process.cwd(), '.openspec-stdio.pid');
      
      // Check if PID file exists
      try {
        await fs.access(pidFilePath);
      } catch {
        console.log('Server status: Not running');
        return;
      }

      // Read PID
      const pidContent = await fs.readFile(pidFilePath, 'utf-8');
      const pid = parseInt(pidContent.trim(), 10);
      
      if (isNaN(pid)) {
        console.log('Server status: Invalid PID file');
        return;
      }

      // Check if process is running
      try {
        process.kill(pid, 0);
        console.log(`Server status: Running (PID: ${pid})`);
        
        if (interactive) {
          // Try to get more process info
          try {
            const stats = await fs.stat(`/proc/${pid}`);
            const startTime = new Date(stats.birthtimeMs);
            console.log(`Started: ${startTime.toLocaleString()}`);
          } catch {
            // Process info not available on this platform
          }
        }
      } catch {
        console.log('Server status: Stale PID file (process not running)');
        console.log('Run "openspec stdio stop" to clean up');
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error checking server status: ${message}`);
      process.exit(1);
    }
  }

  private async loadConfigFile(configPath: string): Promise<Partial<StdioOptions>> {
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      return config.stdio || {};
    } catch (error) {
      throw new Error(`Failed to load config file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async startInBackground(server: any, options: { pidFile: string; workingDirectory?: string }): Promise<void> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      // Spawn the server process
      const child = spawn(process.execPath, [process.argv[1], 'stdio', '--no-background'], {
        stdio: 'inherit',
        detached: true,
        cwd: options.workingDirectory || process.cwd()
      });

      // Write PID file
      if (child.pid) {
        fs.writeFile(options.pidFile, child.pid.toString(), 'utf-8')
          .then(() => {
            // Detach from parent process
            child.unref();
            resolve();
          })
          .catch(reject);
      } else {
        reject(new Error('Failed to get child process PID'));
      }

      child.on('error', reject);
    });
  }

  private setupSignalHandlers(server: any): void {
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      try {
        await server.shutdown();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

export function registerStdioCommand(program: Command): void {
  const stdioCmd = program
    .command('stdio')
    .description('Manage Task MCP stdio server');

  stdioCmd
    .command('start')
    .description('Start the Task MCP stdio server')
    .option('--log-level <level>', 'Log level: debug, info, warn, error', 'info')
    .option('--working-directory <path>', 'Working directory for the server')
    .option('--background', 'Run server in background mode')
    .option('--pid-file <path>', 'Path to PID file for background mode')
    .option('--dev', 'Start in development mode with debug logging')
    .option('--config <path>', 'Path to configuration file')
    .action(async (options: StdioOptions) => {
      const command = new StdioCommand();
      await command.execute(options);
    });

  stdioCmd
    .command('stop')
    .description('Stop the Task MCP stdio server')
    .option('--pid-file <path>', 'Path to PID file')
    .action(async (options: { pidFile?: string }) => {
      const command = new StdioCommand();
      await command.stop(options.pidFile);
    });

  stdioCmd
    .command('status')
    .description('Check the status of the Task MCP stdio server')
    .option('--pid-file <path>', 'Path to PID file')
    .action(async (options: { pidFile?: string }) => {
      const command = new StdioCommand();
      await command.status(options.pidFile);
    });

  // Default action (start with default options)
  stdioCmd
    .action(async (options: StdioOptions) => {
      const command = new StdioCommand();
      await command.execute(options);
    });
}