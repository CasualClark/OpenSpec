# Task MCP CLI Integration

## Overview

The Task MCP stdio server is now fully integrated into the OpenSpec CLI with comprehensive command-line interface support.

## Commands

### `openspec stdio`

Main command group for Task MCP server management.

### `openspec stdio start`

Start the Task MCP stdio server.

**Options:**
- `--log-level <level>`: Set log level (debug, info, warn, error). Default: info
- `--working-directory <path>`: Set working directory for the server. Default: current directory
- `--background`: Run server in background mode
- `--pid-file <path>`: Path to PID file for background mode. Default: `.openspec-stdio.pid`
- `--dev`: Start in development mode with debug logging
- `--config <path>`: Path to configuration file

**Examples:**
```bash
# Start server in foreground
openspec stdio start

# Start server in development mode
openspec stdio start --dev

# Start server in background
openspec stdio start --background

# Start with custom working directory
openspec stdio start --working-directory /path/to/project

# Start with custom log level
openspec stdio start --log-level debug
```

### `openspec stdio stop`

Stop the Task MCP stdio server.

**Options:**
- `--pid-file <path>`: Path to PID file. Default: `.openspec-stdio.pid`

**Examples:**
```bash
# Stop server
openspec stdio stop

# Stop server with custom PID file
openspec stdio stop --pid-file /tmp/my-server.pid
```

### `openspec stdio status`

Check the status of the Task MCP stdio server.

**Options:**
- `--pid-file <path>`: Path to PID file. Default: `.openspec-stdio.pid`

**Examples:**
```bash
# Check server status
openspec stdio status

# Check status with custom PID file
openspec stdio status --pid-file /tmp/my-server.pid
```

## Configuration

### Configuration File Format

You can use a JSON configuration file to set default options:

```json
{
  "stdio": {
    "logLevel": "info",
    "workingDirectory": "/path/to/project",
    "pidFile": "/tmp/openspec-stdio.pid"
  }
}
```

### Environment Variables

The following environment variables are supported:

- `OPENSPEC_CONCURRENCY`: Maximum concurrent validations (used by validate command)
- `NO_COLOR`: Disable color output

## Process Management

### Background Mode

When running in background mode:
- The server forks a child process
- PID is written to the specified PID file
- The parent process exits after the child is started
- Use `openspec stdio stop` to gracefully shutdown the background process

### Signal Handling

The server handles the following signals gracefully:
- `SIGINT` (Ctrl+C): Graceful shutdown
- `SIGTERM`: Graceful shutdown

### Logging

Server logs are written to stderr with the following format:
```
[timestamp] [level] [server-name] message
```

Log levels:
- `debug`: Detailed debugging information
- `info`: General information (default)
- `warn`: Warning messages
- `error`: Error messages only

## Integration with OpenSpec

The Task MCP server integrates seamlessly with existing OpenSpec workflows:

1. **Change Management**: Uses existing change proposal system
2. **Validation**: Integrates with OpenSpec validation tools
3. **File Operations**: Respects OpenSpec security boundaries
4. **Configuration**: Follows OpenSpec configuration patterns

## Security

The server implements comprehensive security measures:

- **Path Protection**: Validates all file paths against allowed directories
- **Schema Validation**: Validates all inputs against defined schemas
- **Sandboxing**: Limits file operations to designated directories
- **Permission Checks**: Enforces read/write permissions

## Troubleshooting

### Server Won't Start

1. Check if another server is already running:
   ```bash
   openspec stdio status
   ```

2. Check log level and working directory:
   ```bash
   openspec stdio start --log-level debug
   ```

3. Verify working directory permissions

### Background Server Issues

1. Check PID file:
   ```bash
   ls -la .openspec-stdio.pid
   ```

2. Check if process is running:
   ```bash
   openspec stdio status
   ```

3. Force stop if needed:
   ```bash
   openspec stdio stop
   ```

### Permission Errors

1. Ensure working directory is accessible
2. Check file permissions for OpenSpec directories
3. Verify sandbox directory exists and is writable

## Examples

### Development Workflow

```bash
# Start development server
openspec stdio start --dev --log-level debug

# In another terminal, check status
openspec stdio status

# Stop when done
openspec stdio stop
```

### Production Deployment

```bash
# Start in background with custom config
openspec stdio start --background --config production.json

# Check status
openspec stdio status

# Stop when needed
openspec stdio stop
```

### Integration with CI/CD

```bash
# Start server for tests
openspec stdio start --background --pid-file /tmp/test-server.pid

# Run your tests
# ...

# Clean up
openspec stdio stop --pid-file /tmp/test-server.pid
```

## API Reference

The server provides the following MCP tools and resources:

### Tools
- `change.open`: Create new change proposals
- `change.archive`: Archive completed changes

### Resources
- `changes`: List active changes
- `proposal`: Access change proposals
- `tasks`: Access task definitions
- `delta`: Access change deltas

For detailed API documentation, see the Task MCP API reference.