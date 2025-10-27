# Task MCP HTTP API Reference

_Last updated: 2025-10-26_

## Overview

The Task MCP HTTP API provides RESTful endpoints for managing OpenSpec changes through Server-Sent Events (SSE) and Newline-Delimited JSON (NDJSON) transports. This reference covers all available endpoints, authentication, request/response formats, error handling, resource URIs, and IDE integration patterns.

**Key Features:**
- ✅ **4.5-minute onboarding** workflow
- ✅ **Dockerless-first deployment** with optional Docker support
- ✅ **Production-ready security** with rate limiting and CORS
- ✅ **IDE integration** with resource URI patterns
- ✅ **Comprehensive tooling** for change management
- ✅ **Health monitoring** with multiple probe endpoints

## Base URL

```
Production: https://your-domain.com
Development: http://localhost:8443
Docker: http://localhost:8443 (from container)
```

## Quick Start

**Dockerless-First Setup (4.5 minutes total):**

```bash
# 1. Clone and install (1 minute)
git clone https://github.com/Fission-AI/OpenSpec.git
cd OpenSpec
npm install

# 2. Start Task MCP server (30 seconds)
npm run dev

# 3. Create first change (1 minute)
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "change.open",
    "input": {
      "title": "My first change",
      "slug": "my-first-change",
      "template": "feature"
    }
  }'

# 4. Archive change (30 seconds)
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "change.archive",
    "input": {"slug": "my-first-change"}
  }'
```

**Docker One-Liner Deployment:**

```bash
docker run --rm -p 8443:8443 \
  -e AUTH_TOKENS=devtoken \
  ghcr.io/fission-ai/task-mcp-http:latest
```

## Authentication

All API endpoints require authentication using Bearer tokens:

```http
Authorization: Bearer your-token-here
```

### Token Configuration

Tokens are configured via environment variables:

```bash
# Development
AUTH_TOKENS=devtoken,testtoken

# Production (comma-separated)
AUTH_TOKENS=prod-token-1,prod-token-2,prod-token-3

# Docker deployment
docker run -e AUTH_TOKENS=your-token-here ...
```

### Header-based Authentication

```http
POST /sse HTTP/1.1
Host: your-domain.com
Content-Type: application/json
Authorization: Bearer your-token-here
Accept: text/event-stream
```

### Cookie-based Authentication (Optional)

```http
POST /sse HTTP/1.1
Host: your-domain.com
Content-Type: application/json
Cookie: task-mcp-auth=your-token-here
Accept: text/event-stream
```

### Authentication Examples

**cURL:**
```bash
curl -H "Authorization: Bearer devtoken" http://localhost:8443/healthz
```

**JavaScript:**
```javascript
fetch('http://localhost:8443/healthz', {
  headers: {
    'Authorization': 'Bearer devtoken'
  }
})
```

**Python:**
```python
import requests
headers = {'Authorization': 'Bearer devtoken'}
response = requests.get('http://localhost:8443/healthz', headers=headers)
```

## Endpoints

### 1. Server-Sent Events (SSE)

**Endpoint:** `POST /sse`

**Content-Type:** `text/event-stream`

**Description:** Execute tools using Server-Sent Events for real-time streaming responses.

#### Request Format

```http
POST /sse HTTP/1.1
Host: your-domain.com
Content-Type: application/json
Authorization: Bearer your-token-here
Accept: text/event-stream

{
  "tool": "change.open",
  "input": {
    "title": "Implement user authentication",
    "slug": "user-auth-v2",
    "template": "feature"
  },
  "apiVersion": "1.0.0"
}
```

#### Request Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool` | string | Yes | Name of the tool to execute |
| `input` | object | Yes | Tool input parameters |
| `apiVersion` | string | No | API version (default: "1.0.0") |

#### Response Format (SSE Events)

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no

: keep-alive 1698224000000

event: result
id: req-12345
data: {"apiVersion":"1.0.0","tool":"change.open","startedAt":"2025-10-25T10:00:00.000Z","result":{"content":[{"type":"text","text":"Change created successfully"}]},"duration":1250}
```

#### SSE Event Types

| Event Type | Description |
|------------|-------------|
| `heartbeat` | Keep-alive event sent every 25 seconds |
| `result` | Successful tool execution result |
| `error` | Tool execution error |

#### Event Schema

```typescript
interface SSEEvent {
  event: 'result' | 'error' | 'heartbeat';
  id?: string;
  data: any;
  retry?: number;
}

interface SSEResultData {
  apiVersion: string;
  tool: string;
  startedAt: string;
  result: ToolResult;
  duration?: number;
}

interface SSEErrorData {
  apiVersion: string;
  error: {
    code: string;
    message: string;
    hint?: string;
    details?: any;
  };
  startedAt: string;
}
```

### 2. Streamable HTTP (NDJSON)

**Endpoint:** `POST /mcp`

**Content-Type:** `application/x-ndjson`

**Description:** Execute tools using Newline-Delimited JSON for streaming responses.

#### Request Format

```http
POST /mcp HTTP/1.1
Host: your-domain.com
Content-Type: application/json
Authorization: Bearer your-token-here
Accept: application/x-ndjson

{
  "tool": "change.open",
  "input": {
    "title": "Implement user authentication",
    "slug": "user-auth-v2",
    "template": "feature"
  },
  "apiVersion": "1.0.0"
}
```

#### Response Format (NDJSON)

```http
HTTP/1.1 200 OK
Content-Type: application/x-ndjson
Cache-Control: no-cache

{"type":"start","ts":1698224000000,"tool":"change.open","apiVersion":"1.0.0"}
{"type":"result","ts":1698224001250,"result":{"content":[{"type":"text","text":"Change created successfully"}]}}
{"type":"end","ts":1698224001250}
```

#### NDJSON Event Types

| Event Type | Description |
|------------|-------------|
| `start` | Request processing started |
| `result` | Tool execution result |
| `error` | Tool execution error |
| `end` | Request processing completed |

#### Event Schema

```typescript
interface NDJSONEvent {
  type: 'start' | 'result' | 'error' | 'end';
  ts?: number;
  tool?: string;
  apiVersion?: string;
  result?: ToolResult;
  error?: {
    code: string;
    message: string;
    hint?: string;
    details?: any;
  };
}
```

### 3. Health Check

**Endpoint:** `GET /healthz`

**Description:** Liveness probe for container orchestration.

#### Request Format

```http
GET /healthz HTTP/1.1
Host: your-domain.com
```

#### Response Format

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "timestamp": "2025-10-25T10:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "checks": {
    "filesystem": "pass",
    "tools": "pass"
  }
}
```

#### Response Schema

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall health status (`healthy` | `unhealthy`) |
| `timestamp` | string | ISO 8601 timestamp |
| `uptime` | number | Server uptime in seconds |
| `version` | string | Server version |
| `checks` | object | Individual check results |

### 4. Readiness Check

**Endpoint:** `GET /readyz`

**Description:** Readiness probe for container orchestration.

#### Request Format

```http
GET /readyz HTTP/1.1
Host: your-domain.com
```

#### Response Format

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "ready": true,
  "timestamp": "2025-10-25T10:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "dependencies": {
    "tools": true,
    "filesystem": true,
    "security": true
  }
}
```

### 5. Security Metrics

**Endpoint:** `GET /security/metrics`

**Description:** Security and authentication metrics (requires authentication).

#### Request Format

```http
GET /security/metrics HTTP/1.1
Host: your-domain.com
Authorization: Bearer your-token-here
```

#### Response Format

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "audit": {
      "totalEvents": 1250,
      "failedAuthentications": 5,
      "rateLimitViolations": 12
    },
    "auth": {
      "activeTokens": 3,
      "totalAttempts": 1000,
      "successRate": 0.995
    },
    "rateLimit": {
      "activeRequests": 25,
      "blockedRequests": 12,
      "config": {
        "requestsPerMinute": 60,
        "burstLimit": 90
      }
    },
    "cors": {
      "allowedOrigins": ["https://your-domain.com"],
      "preflightRequests": 45
    }
  }
}
```

### 6. Root Endpoint

**Endpoint:** `GET /`

**Description:** API information and endpoint listing.

#### Request Format

```http
GET / HTTP/1.1
Host: your-domain.com
```

#### Response Format

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "name": "Task MCP HTTPS/SSE Server",
  "version": "1.0.0",
  "security": {
    "authentication": "Bearer token and cookie-based",
    "rateLimiting": "IP and token-based with burst control",
    "cors": "Configurable origin whitelist",
    "headers": "CSP, HSTS, and security headers",
    "audit": "Structured JSON logging"
  },
  "endpoints": {
    "sse": "POST /sse - Server-Sent Events",
    "mcp": "POST /mcp - Streamable HTTP (NDJSON)",
    "healthz": "GET /healthz - Liveness probe",
    "readyz": "GET /readyz - Readiness probe",
    "health": "GET /health - Comprehensive health check",
    "security": "GET /security/metrics - Security metrics (authenticated)"
  },
  "documentation": "https://github.com/Fission-AI/OpenSpec",
  "features": {
    "ide_integration": true,
    "resource_uris": true,
    "template_system": true,
    "docker_deployment": true,
    "performance_monitoring": true
  }
}
```

### 7. Comprehensive Health Check

**Endpoint:** `GET /health`

**Description:** Detailed health check with all subsystems status.

#### Request Format

```http
GET /health HTTP/1.1
Host: your-domain.com
```

#### Response Format

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "timestamp": "2025-10-26T10:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "checks": {
    "filesystem": {
      "status": "pass",
      "details": {
        "accessible": true,
        "writable": true,
        "path": "/app/openspec"
      }
    },
    "tools": {
      "status": "pass",
      "details": {
        "available": ["change.open", "change.archive", "changes.active"],
        "count": 3
      }
    },
    "memory": {
      "status": "pass",
      "details": {
        "used": "45MB",
        "limit": "512MB",
        "percentage": 8.8
      }
    },
    "security": {
      "status": "pass",
      "details": {
        "auth_tokens_configured": 3,
        "rate_limiting_enabled": true,
        "cors_enabled": true
      }
    }
  }
}
```

## Resource URIs

Task MCP supports IDE integration through resource URIs that allow direct access to change artifacts.

### URI Patterns

| Pattern | Description | IDE Integration |
|---------|-------------|-----------------|
| `@task:change://{slug}/proposal` | Change proposal document | ✅ Claude Code, VS Code, JetBrains |
| `@task:change://{slug}/tasks` | Task list for change | ✅ Claude Code, VS Code, JetBrains |
| `@task:change://{slug}/delta/{file}` | Specification files | ✅ Claude Code, VS Code, JetBrains |
| `changes://active` | List of all active changes | ✅ Claude Code, VS Code, JetBrains |
| `changes://active?page=2&limit=25` | Paginated active changes | ✅ Claude Code, VS Code, JetBrains |

### IDE Resource Discovery

**In supported IDEs, type `@` to see available resources:**

```
@task:change://user-auth-system/proposal
@task:change://user-auth-system/tasks
@task:change://user-auth-system/delta/spec.md
changes://active
```

**Resource Resolution:**

```javascript
// IDE sends resource request to Task MCP
{
  "uri": "@task:change://user-auth-system/proposal",
  "method": "resource/read"
}

// Task MCP responds with content
{
  "contents": [
    {
      "uri": "@task:change://user-auth-system/proposal",
      "mimeType": "text/markdown",
      "text": "# User Authentication System\n\n## Overview\n..."
    }
  ]
}
```

## Tools Reference

### change.open

Create a new OpenSpec change with template-based initialization.

#### Input Schema

```json
{
  "$id": "https://example.org/task-mcp/change.open.input.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "change.open input",
  "version": "1.0.0",
  "type": "object",
  "required": ["title", "slug"],
  "properties": {
    "title": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable title of the change"
    },
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$",
      "description": "URL-friendly identifier (3-64 chars, alphanumeric + hyphens)"
    },
    "rationale": {
      "type": "string",
      "description": "Reason for creating this change"
    },
    "owner": {
      "type": "string",
      "description": "Owner or team responsible for the change"
    },
    "ttl": {
      "type": "integer",
      "minimum": 60,
      "maximum": 86400,
      "description": "Time-to-live in seconds (1 minute to 24 hours)"
    },
    "template": {
      "type": "string",
      "enum": ["feature", "bugfix", "chore"],
      "description": "Change template type for structured initialization"
    }
  }
}
```

#### Template Types

| Template | Use Case | Generated Files |
|----------|----------|-----------------|
| `feature` | New features and functionality | proposal.md, tasks.md with 5-phase breakdown |
| `bugfix` | Bug fixes and patches | proposal.md, tasks.md with investigation workflow |
| `chore` | Maintenance and refactoring | proposal.md, tasks.md with risk assessment |

#### Example Request

```json
{
  "tool": "change.open",
  "input": {
    "title": "Implement user authentication system",
    "slug": "user-auth-system",
    "template": "feature",
    "rationale": "Add secure JWT-based authentication with role-based access control",
    "owner": "security-team",
    "ttl": 3600
  }
}
```

#### Example Response

```json
{
  "apiVersion": "1.0.0",
  "tool": "change.open",
  "startedAt": "2025-10-26T10:00:00.000Z",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Change 'user-auth-system' created successfully with feature template"
      },
      {
        "type": "resource",
        "uri": "@task:change://user-auth-system/proposal",
        "mimeType": "text/markdown",
        "name": "proposal.md"
      },
      {
        "type": "resource",
        "uri": "@task:change://user-auth-system/tasks",
        "mimeType": "text/markdown",
        "name": "tasks.md"
      },
      {
        "type": "resource",
        "uri": "@task:change://user-auth-system/delta/spec.md",
        "mimeType": "text/markdown",
        "name": "spec.md"
      }
    ]
  },
  "duration": 1250,
  "receipt": {
    "id": "receipt-12345",
    "timestamp": "2025-10-26T10:00:00.000Z",
    "operation": "change.open",
    "slug": "user-auth-system"
  }
}
```

### change.archive

Archive an existing change and move it from active to completed status.

#### Input Schema

```json
{
  "$id": "https://example.org/task-mcp/change.archive.input.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "change.archive input",
  "version": "1.0.0",
  "type": "object",
  "required": ["slug"],
  "properties": {
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$",
      "description": "Slug of the change to archive"
    }
  }
}
```

#### Archive Process

1. **Validation**: Verify change exists and is active
2. **Status Update**: Change status from `draft` to `archived`
3. **Resource Cleanup**: Remove from active resource listings
4. **Receipt Generation**: Create audit trail
5. **Notification**: Update IDE resource caches

#### Example Request

```json
{
  "tool": "change.archive",
  "input": {
    "slug": "user-auth-system"
  }
}
```

#### Example Response

```json
{
  "apiVersion": "1.0.0",
  "tool": "change.archive",
  "startedAt": "2025-10-26T10:00:00.000Z",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Change 'user-auth-system' archived successfully"
      },
      {
        "type": "resource",
        "uri": "changes://archived/user-auth-system",
        "mimeType": "application/json",
        "name": "archive_summary.json"
      }
    ]
  },
  "duration": 850,
  "receipt": {
    "id": "receipt-12346",
    "timestamp": "2025-10-26T10:00:00.000Z",
    "operation": "change.archive",
    "slug": "user-auth-system",
    "previousStatus": "draft",
    "newStatus": "archived"
  }
}
```

### changes.active

List all active changes with pagination and filtering support.

#### Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 200,
      "default": 50,
      "description": "Maximum number of changes to return (1-200)"
    },
    "offset": {
      "type": "integer",
      "minimum": 0,
      "default": 0,
      "description": "Number of changes to skip for pagination"
    },
    "status": {
      "type": "string",
      "enum": ["draft", "all"],
      "default": "draft",
      "description": "Filter by change status"
    },
    "owner": {
      "type": "string",
      "description": "Filter by owner/team"
    },
    "template": {
      "type": "string",
      "enum": ["feature", "bugfix", "chore"],
      "description": "Filter by template type"
    }
  }
}
```

#### Output Schema

```json
{
  "$id": "https://example.org/task-mcp/changes.active.output.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "changes://active output",
  "version": "1.0.0",
  "type": "object",
  "required": ["page", "pageSize", "items"],
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1,
      "description": "Current page number"
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 200,
      "description": "Items per page"
    },
    "nextPageToken": {
      "type": "string",
      "description": "Token for next page pagination"
    },
    "total": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of active changes"
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["slug", "title", "status", "paths"],
        "properties": {
          "slug": {
            "type": "string",
            "description": "Change identifier"
          },
          "title": {
            "type": "string",
            "description": "Change title"
          },
          "status": {
            "type": "string",
            "enum": ["draft", "archived"],
            "description": "Current status"
          },
          "template": {
            "type": "string",
            "enum": ["feature", "bugfix", "chore"],
            "description": "Template type used"
          },
          "owner": {
            "type": "string",
            "description": "Change owner"
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "description": "Creation timestamp"
          },
          "updatedAt": {
            "type": "string",
            "format": "date-time",
            "description": "Last update timestamp"
          },
          "paths": {
            "type": "object",
            "properties": {
              "root": {
                "type": "string",
                "description": "Root directory path"
              },
              "proposal": {
                "type": "string",
                "description": "Proposal file path"
              },
              "tasks": {
                "type": "string",
                "description": "Tasks file path"
              }
            }
          }
        }
      }
    }
  }
}
```

#### Example Request

```json
{
  "tool": "changes.active",
  "input": {
    "limit": 25,
    "offset": 0,
    "status": "draft",
    "template": "feature"
  }
}
```

#### Example Response

```json
{
  "apiVersion": "1.0.0",
  "tool": "changes.active",
  "startedAt": "2025-10-26T10:00:00.000Z",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 3 active feature changes (showing page 1 of 1)"
      },
      {
        "type": "resource",
        "uri": "changes://active/list",
        "mimeType": "application/json"
      }
    ]
  },
  "duration": 450,
  "receipt": {
    "id": "receipt-12347",
    "timestamp": "2025-10-26T10:00:00.000Z",
    "operation": "changes.active",
    "filters": {
      "limit": 25,
      "offset": 0,
      "status": "draft",
      "template": "feature"
    }
  }
}
```

#### Paginated Response Data

```json
{
  "page": 1,
  "pageSize": 25,
  "total": 3,
  "nextPageToken": null,
  "items": [
    {
      "slug": "user-auth-system",
      "title": "Implement user authentication system",
      "status": "draft",
      "template": "feature",
      "owner": "security-team",
      "createdAt": "2025-10-26T09:30:00.000Z",
      "updatedAt": "2025-10-26T09:45:00.000Z",
      "paths": {
        "root": "/app/openspec/changes/user-auth-system",
        "proposal": "/app/openspec/changes/user-auth-system/proposal.md",
        "tasks": "/app/openspec/changes/user-auth-system/tasks.md"
      }
    }
  ]
}
```

## IDE Integration

Task MCP provides seamless integration with major IDEs through resource URIs and stdio interface.

### Supported IDEs

| IDE | Integration Type | Resource Discovery | Setup Time |
|-----|------------------|-------------------|------------|
| **Claude Code** | Native MCP | ✅ `@` autocomplete | 30 seconds |
| **VS Code** | MCP Extension | ✅ Command palette | 1 minute |
| **JetBrains IDEs** | Plugin | ✅ context menu | 1 minute |
| **Vim/Neovim** | MCP.nvim | ✅ Lua commands | 2 minutes |
| **Emacs** | MCP.el | ✅ Elisp functions | 2 minutes |

### Resource URI Integration

**Pattern 1: Change Resources**
```
@task:change://user-auth-system/proposal    # Proposal document
@task:change://user-auth-system/tasks       # Task list
@task:change://user-auth-system/delta/spec  # Specification file
```

**Pattern 2: Active Changes**
```
changes://active                            # All active changes
changes://active?template=feature           # Filter by template
changes://active?owner=security-team        # Filter by owner
```

**Pattern 3: Paginated Listing**
```
changes://active?page=2&limit=25           # Pagination
changes://active?status=draft&offset=50    # Status + offset
```

### IDE Setup Examples

#### Claude Code (Native)

```json
// ~/.config/claude-code/mcp_servers.json
{
  "task": {
    "command": "node",
    "args": ["/path/to/openspec/packages/task-mcp-http/src/index.js"],
    "env": {
      "AUTH_TOKENS": "devtoken",
      "NODE_ENV": "development"
    }
  }
}
```

#### VS Code Extension

```json
// .vscode/settings.json
{
  "mcp.servers": {
    "task": {
      "command": "node",
      "args": ["packages/task-mcp-http/src/index.js"],
      "env": {
        "AUTH_TOKENS": "devtoken"
      }
    }
  }
}
```

#### JetBrains IDEs

```xml
<!-- .idea/mcp.xml -->
<application>
  <component name="McpSettings">
    <server name="task" command="node" args="packages/task-mcp-http/src/index.js">
      <env name="AUTH_TOKENS" value="devtoken" />
    </server>
  </component>
</application>
```

### IDE Workflow Examples

**1. Create Change from IDE**
```
User: @task:change://new-feature/proposal
IDE: Opens new change creation dialog
User: Fill title, slug, template
IDE: Calls change.open tool
IDE: Shows created resources
```

**2. Browse Active Changes**
```
User: changes://active
IDE: Lists all active changes
User: Select change to view
IDE: Opens change resources
```

**3. Reference Resources in Chat**
```
User: What's in @task:change://user-auth-system/tasks?
IDE: Fetches and displays task list
User: Update task 3 to include security review
IDE: Opens file for editing
```

## Error Handling

### Error Response Format

All errors follow a consistent format across SSE, NDJSON, and HTTP responses:

#### SSE Error Event

```http
event: error
id: req-12345
data: {"apiVersion":"1.0.0","error":{"code":"INVALID_INPUT","message":"Invalid input for tool 'change.open': slug: must match pattern","hint":"Check the input schema and try again"},"startedAt":"2025-10-26T10:00:00.000Z"}
```

#### NDJSON Error Event

```json
{"type":"error","ts":1698224000000,"error":{"code":"INVALID_INPUT","message":"Invalid input for tool 'change.open': slug: must match pattern","hint":"Check the input schema and try again"}}
```

#### HTTP Error Response

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request format",
    "hint": "Check request body and parameters",
    "details": {
      "field": "tool",
      "issue": "required field missing"
    }
  },
  "requestId": "req-12345",
  "timestamp": "2025-10-26T10:00:00.000Z"
}
```

### Comprehensive Error Codes

| Error Code | HTTP Status | Category | Description | Recovery |
|------------|-------------|----------|-------------|----------|
| `INVALID_TOOL_NAME` | 400 | Validation | Tool name is missing or invalid | Check tool spelling |
| `TOOL_NOT_FOUND` | 404 | Validation | Requested tool does not exist | Use available tools |
| `INVALID_INPUT` | 400 | Validation | Tool input validation failed | Check input schema |
| `TOOL_REGISTRY_UNAVAILABLE` | 500 | System | Tool registry is not available | Retry later |
| `TOOL_EXECUTION_ERROR` | 500 | System | Tool execution failed | Check server logs |
| `INVALID_TOOL_RESULT` | 500 | System | Tool returned invalid result | Contact support |
| `RESPONSE_TOO_LARGE` | 413 | Limits | Response exceeds size limit | Use pagination |
| `AUTHENTICATION_FAILED` | 401 | Security | Invalid or missing authentication | Check token |
| `RATE_LIMIT_EXCEEDED` | 429 | Limits | Rate limit exceeded | Wait and retry |
| `VALIDATION_ERROR` | 400 | Validation | Request validation failed | Check request format |
| `INTERNAL_ERROR` | 500 | System | Internal server error | Contact support |
| `UNKNOWN_ERROR` | 500 | System | Unknown error occurred | Contact support |
| `CHANGE_NOT_FOUND` | 404 | Business | Change slug not found | Verify slug exists |
| `CHANGE_ALREADY_EXISTS` | 409 | Business | Change slug already exists | Use different slug |
| `CHANGE_ALREADY_ARCHIVED` | 409 | Business | Change already archived | Check change status |
| `TEMPLATE_NOT_FOUND` | 404 | Business | Template type not found | Use valid template |

### Error Recovery Procedures

#### 1. Authentication Errors
```bash
# Check token validity
curl -H "Authorization: Bearer your-token" http://localhost:8443/healthz

# Reset token (if you have access)
export AUTH_TOKENS="new-token"
```

#### 2. Rate Limiting
```bash
# Check rate limit headers
curl -I -H "Authorization: Bearer token" http://localhost:8443/healthz

# Implement exponential backoff
retry_after=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:8443/healthz)
sleep $retry_after
```

#### 3. Input Validation
```bash
# Validate with schema
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token" \
  -d '{"tool":"change.open","input":{"title":"Test","slug":"test-slug"}}'
```

#### 4. Resource Not Found
```bash
# List active changes first
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token" \
  -d '{"tool":"changes.active","input":{}}'
```

### Common Error Scenarios

#### Authentication Errors

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Invalid or missing authentication token",
    "hint": "Provide a valid Bearer token in the Authorization header",
    "details": {
      "provided": false,
      "configured_tokens": 3
    }
  },
  "timestamp": "2025-10-26T10:00:00.000Z"
}
```

#### Rate Limiting

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "hint": "Try again in 30 seconds",
    "retryAfter": 30,
    "details": {
      "limit": 60,
      "window": "1 minute",
      "current": 65
    }
  },
  "timestamp": "2025-10-26T10:00:00.000Z"
}
```

#### Input Validation

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "INVALID_INPUT",
    "message": "Invalid input for tool 'change.open': slug: must match pattern '^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$'",
    "hint": "Check the input schema and try again",
    "details": {
      "field": "slug",
      "value": "invalid slug!",
      "pattern": "^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$",
      "schema_reference": "https://example.org/task-mcp/change.open.input.schema.json"
    }
  },
  "timestamp": "2025-10-26T10:00:00.000Z"
}
```

#### Business Logic Errors

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "CHANGE_ALREADY_EXISTS",
    "message": "Change with slug 'user-auth-system' already exists",
    "hint": "Choose a different slug or archive the existing change",
    "details": {
      "existing_slug": "user-auth-system",
      "existing_status": "draft",
      "created_at": "2025-10-26T09:30:00.000Z"
    }
  },
  "timestamp": "2025-10-26T10:00:00.000Z"
}
```

## Performance & Optimization

### Performance Benchmarks

**Latest Performance Results (Phase 6):**
- **Pagination Performance**: 10,424 items/second
- **Streaming Performance**: 56.4 MB/second  
- **Concurrency Performance**: 121.9ms average (10 concurrent requests)
- **Memory Efficiency**: -583KB growth (proper cleanup)
- **Cold Start**: <2 seconds for dockerless deployment

### Rate Limiting Configuration

```bash
# Rate limiting settings
RATE_LIMIT=60                    # Requests per minute
RATE_LIMIT_BURST=90             # Burst limit
RATE_LIMIT_WINDOW_MS=60000      # Window size in milliseconds

# Distributed rate limiting (optional)
ENABLE_DISTRIBUTED_RATE_LIMIT=false  # Redis-based distributed limiting
REDIS_URL=redis://localhost:6379  # Redis URL for distributed limiting

# Performance tuning
NODE_OPTIONS="--max-old-space-size=512"
UV_THREADPOOL_SIZE=16
```

### Rate Limiting Headers

When rate limits are enforced, the following headers are included:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1698224060
X-RateLimit-Retry-After: 30
X-RateLimit-Window: 60
```

### Rate Limiting Strategy

- **IP-based**: Default strategy using client IP address
- **Token-based**: When authentication token is provided
- **Distributed**: Redis-based for multi-instance deployments
- **Adaptive**: Dynamic adjustment based on server load

### Performance Optimization

#### 1. Request Optimization

```bash
# Use NDJSON for better performance
curl -X POST http://localhost:8443/mcp \
  -H "Accept: application/x-ndjson" \
  -H "Content-Type: application/json" \
  -d '{"tool":"changes.active","input":{"limit":25}}'

# Pagination for large datasets
curl -X POST http://localhost:8443/sse \
  -H "Accept: text/event-stream" \
  -d '{"tool":"changes.active","input":{"limit":50,"offset":0}}'
```

#### 2. Connection Pooling

```javascript
// JavaScript example with connection pooling
const https = require('https');
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5
});

const response = await fetch('http://localhost:8443/sse', {
  agent,
  headers: {
    'Authorization': 'Bearer token',
    'Connection': 'keep-alive'
  }
});
```

#### 3. Streaming Best Practices

```python
# Python streaming example
import requests
import json

response = requests.post(
    'http://localhost:8443/mcp',
    headers={
        'Accept': 'application/x-ndjson',
        'Authorization': 'Bearer token'
    },
    json={'tool': 'changes.active', 'input': {}},
    stream=True
)

for line in response.iter_lines():
    if line:
        event = json.loads(line)
        if event['type'] == 'result':
            print(event['result'])
```

### Memory Management

```bash
# Monitor memory usage
docker stats task-mcp-container

# Memory optimization settings
NODE_OPTIONS="--max-old-space-size=256 --optimize-for-size"
```

### Caching Strategy

- **Resource Cache**: 5-minute TTL for change metadata
- **Template Cache**: Persistent cache for template content
- **Schema Cache**: In-memory cache for JSON schemas
- **Auth Cache**: Token validation cache with 1-minute TTL

### Monitoring & Metrics

**Key Performance Indicators:**
- Request latency (p50, p95, p99)
- Error rate by endpoint
- Memory usage trends
- Active connections count
- Rate limit hit ratio

**Health Check Metrics:**
```bash
curl http://localhost:8443/health
# Returns detailed performance metrics
```

## CORS Configuration

### Default Origins

```bash
ALLOWED_ORIGINS=http://localhost:3000,https://localhost:3000
```

### CORS Headers

```http
Access-Control-Allow-Origin: https://your-domain.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Cache-Control
Access-Control-Max-Age: 86400
```

### Preflight Requests

```http
OPTIONS /sse HTTP/1.1
Host: your-domain.com
Origin: https://your-domain.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type, Authorization

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://your-domain.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Cache-Control
Access-Control-Max-Age: 86400
```

## Security Headers

### Default Security Headers

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
```

### Configuration

```bash
SECURITY_HEADERS_ENABLED=true
```

## Response Size Limits

### Configuration

```bash
MAX_RESPONSE_SIZE_KB=1024  # Maximum response size in kilobytes
```

### Size Limit Error

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "RESPONSE_TOO_LARGE",
    "message": "Response size (2048KB) exceeds limit of 1024KB",
    "hint": "Consider using pagination or reducing the amount of data requested"
  },
  "timestamp": "2025-10-25T10:00:00.000Z"
}
```

## Request Timeouts

### Configuration

```bash
REQUEST_TIMEOUT_MS=30000  # Request timeout in milliseconds
```

### Timeout Error

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "REQUEST_TIMEOUT",
    "message": "Request timed out after 30 seconds",
    "hint": "Try reducing the complexity of your request or check server performance"
  },
  "timestamp": "2025-10-25T10:00:00.000Z"
}
```

## Versioning

### API Versioning

The API uses semantic versioning:

- **Major**: Breaking changes
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes (backward compatible)

### Version Header

```http
API-Version: 1.0.0
```

### Version Negotiation

Clients can specify the desired API version:

```json
{
  "tool": "change.open",
  "input": {
    "title": "Test change",
    "slug": "test"
  },
  "apiVersion": "1.0.0"
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
interface TaskMCPClient {
  executeToolSSE(tool: string, input: any): Promise<any>;
  executeToolNDJSON(tool: string, input: any): Promise<any>;
}

class TaskMCPHTTPClient implements TaskMCPClient {
  constructor(
    private baseUrl: string,
    private authToken: string
  ) {}

  async executeToolSSE(tool: string, input: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        tool,
        input,
        apiVersion: '1.0.0'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          const event = this.parseSSEMessage(line);
          if (event.type === 'result') {
            result = event.data.result;
          } else if (event.type === 'error') {
            throw new Error(event.data.error.message);
          }
        }
      }
    }

    return result;
  }

  private parseSSEMessage(rawMessage: string) {
    const lines = rawMessage.split('\n');
    const event: any = {};
    
    for (const line of lines) {
      const [field, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      if (field === 'event') event.type = value;
      else if (field === 'data') {
        try {
          event.data = JSON.parse(value);
        } catch (e) {
          event.data = value;
        }
      }
      else if (field === 'id') event.id = value;
    }

    return event;
  }
}
```

### Python

```python
import requests
import json
import sseclient
from typing import Dict, Any, Optional

class TaskMCPClient:
    def __init__(self, base_url: str, auth_token: str):
        self.base_url = base_url
        self.auth_token = auth_token
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {auth_token}',
            'Content-Type': 'application/json'
        })

    def execute_tool_sse(self, tool_name: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        headers = {'Accept': 'text/event-stream'}
        payload = {
            'tool': tool_name,
            'input': input_data,
            'apiVersion': '1.0.0'
        }
        
        response = self.session.post(
            f'{self.base_url}/sse',
            headers=headers,
            json=payload,
            stream=True
        )
        
        if response.status_code != 200:
            raise Exception(f"HTTP {response.status_code}: {response.text}")
        
        client = sseclient.SSEClient(response)
        
        for event in client.events():
            try:
                data = json.loads(event.data)
                
                if event.event == 'result':
                    return data.get('result')
                elif event.event == 'error':
                    error_info = data.get('error', {})
                    raise Exception(f"Tool error: {error_info.get('message')}")
                elif event.event == 'heartbeat':
                    continue
                    
            except json.JSONDecodeError as e:
                print(f"Failed to parse SSE data: {e}")
                continue
```

## Testing

### Health Check Test

```bash
curl -f http://localhost:8443/healthz
```

### SSE Test

```bash
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "changes.active",
    "input": {},
    "apiVersion": "1.0.0"
  }'
```

### NDJSON Test

```bash
curl -X POST http://localhost:8443/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -H "Accept: application/x-ndjson" \
  -d '{
    "tool": "changes.active",
    "input": {},
    "apiVersion": "1.0.0"
  }'
```

## Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check network connectivity
   - Verify firewall settings
   - Ensure server is running

2. **Authentication Errors**
   - Verify token is valid
   - Check Authorization header format
   - Ensure token is in AUTH_TOKENS list

3. **Rate Limiting**
   - Check X-RateLimit-* headers
   - Implement exponential backoff
   - Consider distributed rate limiting

4. **CORS Issues**
   - Verify origin is in ALLOWED_ORIGINS
   - Check preflight request handling
   - Ensure proper headers are sent

### Debug Headers

Enable debug mode for additional information:

```bash
curl -v -H "X-Debug: true" http://localhost:8443/healthz
```

### Log Analysis

Check server logs for detailed error information:

```bash
docker logs task-mcp-container
```

## Complete Workflow Examples

### Example 1: Complete Change Lifecycle

**Step 1: Create Feature Change**
```bash
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "change.open",
    "input": {
      "title": "Add user profile management",
      "slug": "user-profile-mgmt",
      "template": "feature",
      "rationale": "Enable users to manage their profile information",
      "owner": "frontend-team",
      "ttl": 7200
    }
  }'
```

**Step 2: List Active Changes**
```bash
curl -X POST http://localhost:8443/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  -H "Accept: application/x-ndjson" \
  -d '{
    "tool": "changes.active",
    "input": {
      "limit": 10,
      "template": "feature"
    }
  }'
```

**Step 3: Archive Change**
```bash
curl -X POST http://localhost:8443/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer devtoken" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "change.archive",
    "input": {
      "slug": "user-profile-mgmt"
    }
  }'
```

### Example 2: IDE Integration Workflow

**Claude Code Integration:**
```
User: Create a new feature change for payment processing
Claude: I'll help you create a change for payment processing.

[Automatically calls change.open with template="feature"]

✅ Change 'payment-processing' created successfully
📝 Proposal: @task:change://payment-processing/proposal
📋 Tasks: @task:change://payment-processing/tasks
📄 Spec: @task:change://payment-processing/delta/spec.md

User: Show me the tasks
Claude: [Opens @task:change://payment-processing/tasks]

User: Update task 3 to include PCI compliance
Claude: [Edits the tasks file with PCI compliance requirements]
```

### Example 3: Batch Operations

**Create Multiple Changes:**
```javascript
const changes = [
  {
    title: "Implement OAuth2 authentication",
    slug: "oauth2-auth",
    template: "feature"
  },
  {
    title: "Fix login redirect loop",
    slug: "login-redirect-fix",
    template: "bugfix"
  },
  {
    title: "Update dependencies",
    slug: "dependency-update",
    template: "chore"
  }
];

for (const change of changes) {
  const response = await fetch('http://localhost:8443/sse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer devtoken',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      tool: 'change.open',
      input: change
    })
  });
  
  console.log(`Created change: ${change.slug}`);
}
```

### Example 4: Error Handling Workflow

**Robust Error Handling:**
```python
import requests
import time
import json

class TaskMCPClient:
    def __init__(self, base_url, auth_token):
        self.base_url = base_url
        self.auth_token = auth_token
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {auth_token}',
            'Content-Type': 'application/json'
        })
    
    def execute_tool_with_retry(self, tool, input_data, max_retries=3):
        for attempt in range(max_retries):
            try:
                response = self.session.post(
                    f'{self.base_url}/sse',
                    headers={'Accept': 'text/event-stream'},
                    json={'tool': tool, 'input': input_data},
                    stream=True
                )
                
                if response.status_code == 429:
                    retry_after = int(response.headers.get('X-RateLimit-Retry-After', 30))
                    print(f"Rate limited. Retrying in {retry_after} seconds...")
                    time.sleep(retry_after)
                    continue
                
                response.raise_for_status()
                
                # Parse SSE response
                for line in response.iter_lines():
                    if line.startswith(b'data: '):
                        data = json.loads(line[6:])
                        if 'result' in data:
                            return data['result']
                        elif 'error' in data:
                            raise Exception(f"Tool error: {data['error']['message']}")
                
                return None
                
            except requests.exceptions.RequestException as e:
                if attempt == max_retries - 1:
                    raise
                print(f"Attempt {attempt + 1} failed: {e}")
                time.sleep(2 ** attempt)
        
        raise Exception("Max retries exceeded")

# Usage
client = TaskMCPClient('http://localhost:8443', 'devtoken')

try:
    result = client.execute_tool_with_retry(
        'change.open',
        {
            'title': 'Test change',
            'slug': 'test-change',
            'template': 'feature'
        }
    )
    print("Success:", result)
except Exception as e:
    print("Error:", e)
```

### Example 5: Production Deployment

**Docker Compose with Monitoring:**
```yaml
version: '3.8'
services:
  task-mcp:
    image: ghcr.io/fission-ai/task-mcp-http:latest
    ports:
      - "8443:8443"
    environment:
      - AUTH_TOKENS=${AUTH_TOKENS}
      - NODE_ENV=production
      - RATE_LIMIT=120
      - RATE_LIMIT_BURST=180
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8443/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - task-mcp
    restart: unless-stopped

volumes:
  redis_data:
```

## Troubleshooting Guide

### Common Issues & Solutions

#### 1. Connection Issues
```bash
# Check if server is running
curl http://localhost:8443/healthz

# Check port availability
netstat -tlnp | grep 8443

# Docker troubleshooting
docker logs task-mcp-container
docker ps -a | grep task-mcp
```

#### 2. Authentication Problems
```bash
# Verify token configuration
curl -H "Authorization: Bearer your-token" http://localhost:8443/healthz

# Check environment variables
env | grep AUTH_TOKENS

# Test multiple tokens
for token in "token1" "token2" "token3"; do
  echo "Testing token: $token"
  curl -s -H "Authorization: Bearer $token" http://localhost:8443/healthz | jq .
done
```

#### 3. Performance Issues
```bash
# Monitor resource usage
docker stats task-mcp-container
top -p $(pgrep -f task-mcp)

# Check rate limiting
curl -I -H "Authorization: Bearer token" http://localhost:8443/healthz

# Benchmark performance
curl -X POST http://localhost:8443/mcp \
  -H "Accept: application/x-ndjson" \
  -d '{"tool":"changes.active","input":{"limit":100}}' \
  -w "Time: %{time_total}s\n"
```

#### 4. IDE Integration Issues
```bash
# Check MCP server configuration
cat ~/.config/claude-code/mcp_servers.json

# Test stdio interface
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | \
  node packages/task-mcp-http/src/index.js

# Verify resource URIs
curl -X POST http://localhost:8443/sse \
  -H "Accept: text/event-stream" \
  -d '{"tool":"changes.active","input":{}}'
```

### Debug Mode

Enable debug logging:
```bash
# Development
export DEBUG=task-mcp:*
npm run dev

# Docker
docker run -e DEBUG=task-mcp:* ghcr.io/fission-ai/task-mcp-http:latest

# Production
docker run -e NODE_ENV=production -e DEBUG=task-mcp:error,task-mcp:warn \
  ghcr.io/fission-ai/task-mcp-http:latest
```

### Health Monitoring

**Comprehensive Health Check:**
```bash
# Basic health
curl http://localhost:8443/healthz

# Detailed health
curl http://localhost:8443/health

# Readiness check
curl http://localhost:8443/readyz

# Security metrics
curl -H "Authorization: Bearer token" http://localhost:8443/security/metrics
```

**Monitoring Script:**
```bash
#!/bin/bash
# monitor-task-mcp.sh

ENDPOINT="http://localhost:8443"
TOKEN="your-token"

while true; do
  echo "=== $(date) ==="
  
  # Health check
  health=$(curl -s "$ENDPOINT/healthz" | jq -r '.status // "error"')
  echo "Health: $health"
  
  # Security metrics
  if [[ "$health" == "healthy" ]]; then
    metrics=$(curl -s -H "Authorization: Bearer $TOKEN" "$ENDPOINT/security/metrics")
    echo "Auth success rate: $(echo "$metrics" | jq -r '.data.auth.successRate // "N/A"')"
    echo "Active requests: $(echo "$metrics" | jq -r '.data.rateLimit.activeRequests // "N/A"')"
  fi
  
  echo "---"
  sleep 30
done
```

---

This comprehensive API reference provides all the information needed to integrate with the Task MCP HTTP server, including detailed endpoint specifications, error handling, security considerations, IDE integration, performance optimization, and complete workflow examples. The documentation reflects the Phase 6 completion achievements, including the 4.5-minute onboarding workflow and production-ready deployment options.