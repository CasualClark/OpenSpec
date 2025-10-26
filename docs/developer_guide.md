# Developer Guide

_Last updated: 2025-10-25_

## Overview

This guide provides developers with everything needed to get started with Task MCP HTTP server, including setup instructions, development workflows, testing guidelines, and contribution processes.

## Quick Start

### Prerequisites

- **Node.js**: 20.19.0 or higher
- **pnpm**: Latest version (recommended package manager)
- **Git**: For version control
- **Docker**: For containerized development (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/Fission-AI/OpenSpec.git
cd OpenSpec

# Install dependencies
pnpm install

# Build the project
pnpm build

# Start development server
pnpm --filter @fission-ai/task-mcp-http start:dev
```

### Verify Installation

```bash
# Check health endpoint
curl http://localhost:8443/healthz

# Expected response
{
  "status": "healthy",
  "timestamp": "2025-10-25T10:00:00.000Z",
  "uptime": 60,
  "version": "1.0.0"
}
```

## Development Environment Setup

### 1. Environment Configuration

Create a `.env.development` file:

```bash
# .env.development
NODE_ENV=development
PORT=8443
HOST=0.0.0.0

# Authentication (development tokens)
AUTH_TOKENS=dev-token-1,dev-token-2,dev-token-3

# CORS for development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080,http://localhost:5173

# Logging
LOG_LEVEL=debug

# Rate limiting (relaxed for development)
RATE_LIMIT=120
RATE_LIMIT_BURST=180

# Working directory
WORKING_DIRECTORY=./test-openspec
```

### 2. IDE Configuration

#### VS Code

Install recommended extensions:

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "ms-vscode-remote.remote-containers",
    "ms-vscode.vscode-json"
  ]
}
```

Configure workspace settings:

```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true
  }
}
```

#### Debug Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Task MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/packages/task-mcp-http/dist/index.js",
      "outFiles": ["${workspaceFolder}/packages/task-mcp-http/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeArgs": ["--inspect"]
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--reporter=verbose"],
      "console": "integratedTerminal"
    }
  ]
}
```

### 3. Local Development Setup

```bash
# Start the development server with hot reload
pnpm --filter @fission-ai/task-mcp-http dev

# Or run with tsx for direct TypeScript execution
pnpm --filter @fission-ai/task-mcp-http start:dev

# Start with debug mode
node --inspect-brk packages/task-mcp-http/dist/index.js
```

### 4. Test OpenSpec Repository

Create a test OpenSpec repository:

```bash
# Create test directory
mkdir -p test-openspec/changes
cd test-openspec

# Initialize OpenSpec structure
echo '{"name": "test-spec", "version": "1.0.0"}' > openspec.json

# Create a sample change
mkdir -p changes/sample-change
cat > changes/sample-change/proposal.md << EOF
# Sample Change

## Overview
This is a sample change for testing purposes.

## Tasks
- [ ] Task 1
- [ ] Task 2
EOF

cd ..
```

## Architecture Overview

### Project Structure

```
packages/task-mcp-http/
├── src/
│   ├── index.ts                 # Main server entry point
│   ├── config.ts                # Configuration management
│   ├── types.ts                 # TypeScript type definitions
│   ├── routes/                  # HTTP route handlers
│   │   ├── index.ts
│   │   ├── sse.ts              # SSE endpoint
│   │   ├── mcp.ts              # NDJSON endpoint
│   │   └── health.ts           # Health checks
│   ├── security/                # Security middleware
│   │   ├── index.ts
│   │   ├── auth.ts             # Authentication
│   │   ├── cors.ts             # CORS handling
│   │   ├── rateLimit.ts        # Rate limiting
│   │   └── headers.ts          # Security headers
│   ├── health/                  # Health monitoring
│   │   ├── index.ts
│   │   ├── registry.ts         # Health check registry
│   │   ├── monitor.ts          # Health monitor
│   │   └── metrics.ts          # Metrics collection
│   └── stdio/                   # MCP stdio integration
├── docker/                      # Docker configurations
├── test/                        # Test files
├── package.json
└── tsconfig.json
```

### Core Components

#### 1. HTTP Server (Fastify)

```typescript
// src/index.ts
import Fastify from 'fastify';
import { createServer } from './index.js';

const server = await createServer({
  port: 8443,
  host: '0.0.0.0',
  // ... other config
});

await server.listen();
```

#### 2. SSE Route Handler

```typescript
// src/routes/sse.ts
export async function sseRouteHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Execute tool and stream results
  const result = await executeTool(request.body);
  
  // Send SSE event
  reply.raw.write(`event: result\n`);
  reply.raw.write(`data: ${JSON.stringify(result)}\n\n`);
}
```

#### 3. Security Middleware

```typescript
// src/security/auth.ts
export class AuthenticationMiddleware {
  constructor(private config: AuthConfig) {}
  
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const token = this.extractToken(request);
      if (!this.isValidToken(token)) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    };
  }
}
```

## Development Workflow

### 1. Making Changes

```bash
# Create a new feature branch
git checkout -b feature/new-endpoint

# Make your changes
# Edit files in src/

# Run type checking
pnpm --filter @fission-ai/task-mcp-http type-check

# Run linting
pnpm --filter @fission-ai/task-mcp-http lint

# Run tests
pnpm --filter @fission-ai/task-mcp-http test

# Build project
pnpm --filter @fission-ai/task-mcp-http build
```

### 2. Testing Changes

#### Unit Tests

```bash
# Run all tests
pnpm --filter @fission-ai/task-mcp-http test

# Run tests in watch mode
pnpm --filter @fission-ai/task-mcp-http test:watch

# Run tests with coverage
pnpm --filter @fission-ai/task-mcp-http test:coverage
```

#### Integration Tests

```bash
# Start test server
pnpm --filter @fission-ai/task-mcp-http test:integration

# Run API tests
pnpm --filter @fission-ai/task-mcp-http test:api

# Run load tests
pnpm --filter @fission-ai/task-mcp-http test:load
```

#### Manual Testing

```bash
# Test SSE endpoint
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token-1" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "changes.active",
    "input": {}
  }'

# Test NDJSON endpoint
curl -X POST http://localhost:8443/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token-1" \
  -H "Accept: application/x-ndjson" \
  -d '{
    "tool": "changes.active",
    "input": {}
  }'
```

### 3. Debugging

#### Debug Logs

Enable debug logging:

```bash
# Set log level to debug
export LOG_LEVEL=debug

# Start server
pnpm --filter @fission-ai/task-mcp-http start
```

#### Debug Mode with VS Code

1. Set breakpoints in your code
2. Press F5 to start debugging
3. Use the Debug Console for inspection

#### Remote Debugging

```bash
# Start with remote debugging
node --inspect=0.0.0.0:9229 packages/task-mcp-http/dist/index.js

# Connect with Chrome DevTools
# Open chrome://inspect and click "Open dedicated DevTools"
```

## Testing Guidelines

### 1. Test Structure

```
test/
├── unit/                    # Unit tests
│   ├── routes/
│   ├── security/
│   └── utils/
├── integration/             # Integration tests
│   ├── api/
│   └── sse/
├── e2e/                     # End-to-end tests
├── fixtures/               # Test data
└── helpers/                # Test utilities
```

### 2. Writing Tests

#### Unit Test Example

```typescript
// test/unit/routes/sse.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../../helper.js';

describe('SSE Route', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  it('should handle valid tool execution', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/sse',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer test-token',
        'accept': 'text/event-stream'
      },
      payload: {
        tool: 'changes.active',
        input: {}
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
  });
});
```

#### Integration Test Example

```typescript
// test/integration/api/sse-flow.test.ts
import { describe, it, expect } from 'vitest';
import { TaskMCPClient } from '../../../helpers/client.js';

describe('SSE Integration', () => {
  it('should complete full change workflow', async () => {
    const client = new TaskMCPClient('http://localhost:8443', 'test-token');

    // Create change
    const createResult = await client.executeToolSSE('change.open', {
      title: 'Test Change',
      slug: 'test-change',
      template: 'feature'
    });

    expect(createResult.content).toBeDefined();

    // Archive change
    const archiveResult = await client.executeToolSSE('change.archive', {
      slug: 'test-change'
    });

    expect(archiveResult.content).toBeDefined();
  });
});
```

### 3. Test Utilities

#### Test Server Helper

```typescript
// test/helpers/server.ts
import Fastify from 'fastify';
import { createServer } from '../../src/index.js';

export async function buildServer(options = {}) {
  const server = Fastify({
    logger: false // Disable logging for tests
  });

  // Register test configuration
  const testConfig = {
    port: 0, // Random port
    host: '127.0.0.1',
    auth: { tokens: ['test-token'] },
    cors: { origins: ['http://localhost:3000'] },
    rateLimit: { requestsPerMinute: 100 },
    sse: { heartbeatMs: 1000 },
    responseLimits: { maxResponseSizeKb: 1024 },
    logging: { level: 'silent' },
    workingDirectory: './test-openspec',
    ...options
  };

  return createServer(testConfig);
}
```

#### Test Client Helper

```typescript
// test/helpers/client.ts
export class TestTaskMCPClient {
  constructor(
    private baseUrl: string,
    private authToken: string
  ) {}

  async executeToolSSE(tool: string, input: any) {
    const response = await fetch(`${this.baseUrl}/sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ tool, input, apiVersion: '1.0.0' })
    });

    // Parse SSE response
    return this.parseSSEResponse(response);
  }

  private async parseSSEResponse(response: Response) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        if (event.includes('event: result')) {
          const dataMatch = event.match(/data: (.+)/);
          if (dataMatch) {
            result = JSON.parse(dataMatch[1]);
          }
        }
      }
    }

    return result;
  }
}
```

### 4. Test Data Management

#### Fixtures

```typescript
// test/fixtures/changes.ts
export const testChanges = {
  validChange: {
    title: 'Test Feature',
    slug: 'test-feature',
    template: 'feature' as const,
    rationale: 'Test change for development'
  },
  invalidChange: {
    title: '',
    slug: 'invalid slug!',
    template: 'invalid' as const
  }
};
```

#### Mock Data

```typescript
// test/helpers/mocks.ts
export const mockToolResult = {
  content: [
    {
      type: 'text' as const,
      text: 'Mock tool execution successful'
    }
  ]
};

export const mockErrorResponse = {
  code: 'TEST_ERROR',
  message: 'Mock error for testing',
  hint: 'This is a test error'
};
```

## Code Quality Standards

### 1. TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### 2. ESLint Configuration

```json
// .eslintrc.json
{
  "extends": [
    "@typescript-eslint/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

### 3. Prettier Configuration

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

### 4. Code Style Guidelines

#### Naming Conventions

```typescript
// Variables and functions: camelCase
const userName = 'john';
function getUserData() {}

// Classes: PascalCase
class TaskMCPClient {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;

// Types and interfaces: PascalCase
interface ToolResult {}
type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

// Files: kebab-case
// sse-route-handler.ts
// authentication-middleware.ts
```

#### Error Handling

```typescript
// Use custom error classes
export class HTTPError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public hint?: string
  ) {
    super(message);
    this.name = 'HTTPError';
  }
}

// Handle errors consistently
try {
  const result = await executeTool();
  return result;
} catch (error) {
  if (error instanceof HTTPError) {
    throw error;
  }
  
  // Convert unknown errors to HTTPError
  throw new HTTPError(
    500,
    'INTERNAL_ERROR',
    error.message || 'An unexpected error occurred'
  );
}
```

#### Async/Await Patterns

```typescript
// Prefer async/await over promises
async function processRequest(request: FastifyRequest) {
  try {
    const validatedInput = await validateInput(request.body);
    const result = await executeTool(validatedInput);
    return result;
  } catch (error) {
    handleError(error);
  }
}

// Use Promise.all for concurrent operations
async function processMultipleTools(tools: ToolRequest[]) {
  const results = await Promise.all(
    tools.map(tool => executeTool(tool))
  );
  return results;
}
```

## Performance Guidelines

### 1. Memory Management

```typescript
// Stream large responses
async function streamSSEResponse(reply: FastifyReply, generator: AsyncGenerator) {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache'
  });

  try {
    for await (const chunk of generator) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      
      // Allow event loop to process other tasks
      await new Promise(resolve => setImmediate(resolve));
    }
  } finally {
    reply.raw.end();
  }
}
```

### 2. Connection Pooling

```typescript
// Reuse HTTP clients
import { Agent } from 'undici';

const httpAgent = new Agent({
  connections: 10,
  keepAliveTimeout: 60000
});

class TaskMCPClient {
  private client = new Agent({
    connections: 10,
    keepAliveTimeout: 60000
  });

  async makeRequest(url: string, options: RequestInit) {
    return fetch(url, {
      ...options,
      dispatcher: this.client
    });
  }
}
```

### 3. Caching Strategy

```typescript
// Implement response caching
class ResponseCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl = 30000; // 30 seconds

  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: any) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
```

## Security Best Practices

### 1. Input Validation

```typescript
// Use Zod for schema validation
import { z } from 'zod';

const ToolRequestSchema = z.object({
  tool: z.string().min(1),
  input: z.record(z.any()),
  apiVersion: z.string().optional().default('1.0.0')
});

async function validateToolRequest(request: unknown) {
  return ToolRequestSchema.parse(request);
}
```

### 2. Authentication

```typescript
// Secure token validation
export class AuthenticationService {
  private readonly tokens: Set<string>;
  
  constructor(tokens: string[]) {
    this.tokens = new Set(tokens);
  }

  validateToken(token: string): boolean {
    return this.tokens.has(token) && token.length > 10;
  }

  extractToken(request: FastifyRequest): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    
    return authHeader.substring(7);
  }
}
```

### 3. Rate Limiting

```typescript
// Implement rate limiting with sliding window
class RateLimiter {
  private requests = new Map<string, number[]>();
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    let userRequests = this.requests.get(key) || [];
    
    // Remove old requests
    userRequests = userRequests.filter(time => time > windowStart);
    
    if (userRequests.length >= this.maxRequests) {
      return false;
    }
    
    userRequests.push(now);
    this.requests.set(key, userRequests);
    
    return true;
  }
}
```

## Contributing Guidelines

### 1. Branch Strategy

```bash
# Main branches
main          # Production-ready code
develop       # Integration branch

# Feature branches
feature/feature-name
bugfix/bug-description
hotfix/critical-fix

# Release branches
release/v1.0.0
```

### 2. Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

#### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build process or dependency changes

#### Examples

```
feat(sse): add heartbeat mechanism

Improve connection reliability with periodic heartbeat events
to detect and clean up dead connections.

Closes #123
```

```
fix(auth): resolve token validation issue

Fix edge case where empty tokens were being accepted.
Add proper length validation.

Security: high
```

### 3. Pull Request Process

#### Before Creating PR

1. **Update tests**: Ensure all tests pass
2. **Update documentation**: Add relevant docs
3. **Run linting**: Fix all style issues
4. **Test manually**: Verify functionality works

#### PR Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

### 4. Code Review Guidelines

#### Review Checklist

- **Functionality**: Does the code work as intended?
- **Performance**: Are there any performance implications?
- **Security**: Are there any security concerns?
- **Testing**: Are tests comprehensive?
- **Documentation**: Is documentation up to date?
- **Style**: Does code follow project conventions?

#### Review Process

1. **Automated checks**: CI/CD pipeline validation
2. **Peer review**: At least one team member approval
3. **Security review**: For sensitive changes
4. **Final approval**: Maintainer approval

## Troubleshooting

### 1. Common Development Issues

#### Port Already in Use

```bash
# Find process using port
lsof -i :8443

# Kill process
kill -9 <PID>

# Or use different port
export PORT=8444
```

#### TypeScript Compilation Errors

```bash
# Clean build artifacts
rm -rf packages/task-mcp-http/dist

# Rebuild
pnpm --filter @fission-ai/task-mcp-http build

# Check for type errors
pnpm --filter @fission-ai/task-mcp-http type-check
```

#### Test Failures

```bash
# Run tests with verbose output
pnpm --filter @fission-ai/task-mcp-http test --reporter=verbose

# Run specific test file
pnpm --filter @fission-ai/task-mcp-http test test/unit/routes/sse.test.ts

# Debug test
node --inspect-brk node_modules/.bin/vitest run test/unit/routes/sse.test.ts
```

### 2. Performance Issues

#### Memory Leaks

```bash
# Monitor memory usage
node --inspect packages/task-mcp-http/dist/index.js

# Use Chrome DevTools Memory tab
# Take heap snapshots to identify leaks
```

#### Slow Response Times

```bash
# Enable performance logging
export LOG_LEVEL=debug

# Profile with Node.js profiler
node --prof packages/task-mcp-http/dist/index.js

# Analyze profile
node --prof-process isolate-*.log > performance-analysis.txt
```

### 3. Debugging Tools

#### VS Code Debugging

1. Set breakpoints in code
2. Use Debug Console for evaluation
3. Monitor variables and call stack

#### Chrome DevTools

1. Start server with `--inspect`
2. Open `chrome://inspect`
3. Connect to Node.js process

#### Logging

```typescript
// Add debug logging
import { logger } from '../src/utils/logger.js';

logger.debug('Processing request', { requestId, tool });
logger.info('Tool executed successfully', { duration });
logger.error('Tool execution failed', { error });
```

## Resources

### Documentation

- [API Reference](./api_reference.md)
- [SSE Guidelines](./sse_guidelines.md)
- [Docker Strategy](./docker_strategy.md)
- [Messages API Example](./messages_api_example.md)

### External Resources

- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [Server-Sent Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

### Community

- [GitHub Issues](https://github.com/Fission-AI/OpenSpec/issues)
- [Discussions](https://github.com/Fission-AI/OpenSpec/discussions)
- [Discord Server](https://discord.gg/FissionAI)

This comprehensive developer guide provides everything needed to effectively develop, test, and contribute to the Task MCP HTTP server project.