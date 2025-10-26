# Task MCP Stdio Server

A comprehensive JSON-RPC 2.0 server implementation for the Task MCP protocol, providing secure tool execution and resource access for OpenSpec change management.

## Features

- **JSON-RPC 2.0 Protocol**: Full compliance with JSON-RPC 2.0 specification
- **Stdio Transport**: Communication over standard input/output for IDE integration
- **Tool Registration Framework**: Plugin architecture for extensible tool support
- **Resource Provider System**: Secure access to change, proposal, task, and delta resources
- **Security Sandbox**: Path traversal protection and input validation
- **Lock Integration**: Atomic file-based locking with stale lock reclamation
- **Cross-Platform Support**: Works on Windows, macOS, and Linux
- **Comprehensive Logging**: Configurable logging levels for debugging and monitoring

## Architecture

### Core Components

1. **MCPServer**: Main server class handling JSON-RPC communication
2. **ToolRegistry**: Manages tool registration and execution
3. **ResourceRegistry**: Manages resource providers and access
4. **Security Framework**: Provides sandboxing and validation
5. **Factory**: Server configuration and creation utilities

### Security Features

- **Path Traversal Protection**: All file operations are validated against allowed paths
- **Input Validation**: JSON schema validation for all tool inputs
- **Sandbox Enforcement**: File operations restricted to designated sandbox directories
- **Size Limits**: Configurable maximum file size restrictions
- **Lock Security**: Atomic lock operations with owner validation

## Quick Start

### Installation

```bash
npm install @fission-ai/openspec
```

### Basic Usage

```typescript
import { createServer } from '@fission-ai/openspec/stdio';

// Create and start server
const server = await createServer({
  name: 'my-task-mcp-server',
  workingDirectory: './my-project',
  logLevel: 'info'
});

await server.start();
```

### CLI Usage

```bash
# Start production server
npx openspec task-mcp start

# Start development server with debug logging
npx openspec task-mcp dev

# Start with custom working directory
npx openspec task-mcp start --working-dir ./my-project
```

## Available Tools

### change.open

Opens a new change for development with lock acquisition.

**Input Schema:**
```json
{
  "title": "string (required)",
  "slug": "string (required, pattern: ^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$)",
  "rationale": "string (optional)",
  "owner": "string (optional)",
  "ttl": "number (optional, min: 60, max: 86400)",
  "template": "string (optional, enum: [feature, bugfix, chore])"
}
```

**Example:**
```json
{
  "name": "change.open",
  "arguments": {
    "title": "Add user authentication",
    "slug": "add-user-auth",
    "rationale": "Implement JWT-based authentication system",
    "template": "feature"
  }
}
```

### change.archive

Archives a completed change and releases its lock.

**Input Schema:**
```json
{
  "slug": "string (required)"
}
```

**Example:**
```json
{
  "name": "change.archive",
  "arguments": {
    "slug": "add-user-auth"
  }
}
```

## Available Resources

### change://{slug}

Access change information and metadata.

**Example URI:** `change://add-user-auth`

**Returns:** JSON with change details, lock info, and associated specs

### proposal://{slug}

Access change proposal content.

**Example URI:** `proposal://add-user-auth`

**Returns:** Markdown content of the proposal

### task://{slug}/{taskId}

Access task information and status.

**Example URI:** `task://add-user-auth/task-1`

**Returns:** JSON with task details and status

### delta://{slug}/{deltaId}

Access change deltas and diffs.

**Example URI:** `delta://add-user-auth/delta-1`

**Returns:** Unified diff content

## Security Configuration

### Security Context

```typescript
interface SecurityContext {
  allowedPaths: string[];           // Allowed file paths
  sandboxRoot: string;              // Root directory for sandbox
  maxFileSize: number;              // Maximum file size in bytes
  allowedSchemas: string[];          // Allowed JSON schemas
}
```

### Default Security Settings

- **Allowed Paths**: Current working directory and temp directory
- **Sandbox Root**: Current working directory
- **Max File Size**: 10MB
- **Allowed Schemas**: All built-in schemas

## Development

### Project Structure

```
src/stdio/
├── server.ts              # Main JSON-RPC server
├── factory.ts             # Server factory and configuration
├── cli.ts                 # CLI entry point
├── types/
│   └── index.ts           # TypeScript type definitions
├── tools/
│   ├── base.ts            # Base tool class
│   ├── registry.ts        # Tool registry
│   ├── change-open.ts     # change.open tool
│   └── change-archive.ts  # change.archive tool
├── resources/
│   ├── base.ts           # Base resource provider
│   ├── registry.ts       # Resource registry
│   ├── change-resource.ts # Change resource provider
│   ├── proposal-resource.ts # Proposal resource provider
│   ├── task-resource.ts  # Task resource provider
│   └── delta-resource.ts # Delta resource provider
└── security/
    ├── sandbox.ts        # Sandbox enforcement
    ├── validator.ts      # Input validation
    └── path-protection.ts # Path traversal protection
```

### Running Tests

```bash
# Run all tests
npm test

# Run stdio server tests
npm test -- stdio

# Run with coverage
npm run test:coverage
```

### Building

```bash
# Build the project
npm run build

# Watch for changes
npm run dev
```

## Integration with IDEs

### VS Code

The stdio server can be integrated with VS Code through the MCP extension:

```json
{
  "mcpServers": {
    "openspec": {
      "command": "npx",
      "args": ["@fission-ai/openspec", "task-mcp", "start"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

### Other IDEs

Any IDE supporting the MCP protocol can connect to the stdio server by running the server process and communicating via standard input/output.

## Error Handling

The server provides comprehensive error handling with proper JSON-RPC error codes:

- **ParseError** (-32700): Invalid JSON
- **InvalidRequest** (-32600): Invalid JSON-RPC request
- **MethodNotFound** (-32601): Method not found
- **InvalidParams** (-32602): Invalid method parameters
- **InternalError** (-32603): Internal server error
- **ToolNotFound** (-32001): Tool not found
- **InvalidToolInput** (-32002): Invalid tool input
- **ToolExecutionError** (-32003): Tool execution failed
- **ResourceNotFound** (-32004): Resource not found
- **ResourceAccessDenied** (-32005): Resource access denied
- **PathTraversal** (-33001): Path traversal attempt
- **SchemaValidation** (-33002): Schema validation failed
- **LockAcquisition** (-33003): Lock acquisition failed
- **PermissionDenied** (-33004): Permission denied

## Logging

The server supports configurable logging levels:

- **debug**: Detailed debugging information
- **info**: General information messages
- **warn**: Warning messages
- **error**: Error messages only

Set the log level when creating the server:

```typescript
const server = await createServer({
  logLevel: 'debug'
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes with tests
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.