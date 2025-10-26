# Task MCP HTTP API Reference

_Last updated: 2025-10-25_

## Overview

The Task MCP HTTP API provides RESTful endpoints for managing OpenSpec changes through Server-Sent Events (SSE) and Newline-Delimited JSON (NDJSON) transports. This reference covers all available endpoints, authentication, request/response formats, and error handling.

## Base URL

```
Production: https://your-domain.com
Development: http://localhost:8443
```

## Authentication

All API endpoints require authentication using Bearer tokens:

```http
Authorization: Bearer your-token-here
```

### Token Configuration

Tokens are configured via environment variables:

```bash
AUTH_TOKENS=token1,token2,token3
```

### Header-based Authentication

```http
POST /sse HTTP/1.1
Host: your-domain.com
Content-Type: application/json
Authorization: Bearer your-token-here
Accept: text/event-stream
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
    "security": "GET /security/metrics - Security metrics (authenticated)"
  },
  "documentation": "https://github.com/Fission-AI/OpenSpec"
}
```

## Tools Reference

### change.open

Create a new OpenSpec change.

#### Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
      "description": "URL-friendly identifier"
    },
    "rationale": {
      "type": "string",
      "description": "Reason for creating this change"
    },
    "owner": {
      "type": "string",
      "description": "Owner of the change"
    },
    "ttl": {
      "type": "integer",
      "minimum": 60,
      "maximum": 86400,
      "description": "Time-to-live in seconds"
    },
    "template": {
      "type": "string",
      "enum": ["feature", "bugfix", "chore"],
      "description": "Change template type"
    }
  }
}
```

#### Example Request

```json
{
  "tool": "change.open",
  "input": {
    "title": "Implement user authentication system",
    "slug": "user-auth-system",
    "template": "feature",
    "rationale": "Add secure JWT-based authentication",
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
  "startedAt": "2025-10-25T10:00:00.000Z",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Change 'user-auth-system' created successfully"
      },
      {
        "type": "resource",
        "uri": "change://user-auth-system/proposal",
        "mimeType": "text/markdown"
      }
    ]
  },
  "duration": 1250
}
```

### change.archive

Archive an existing change.

#### Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
  "startedAt": "2025-10-25T10:00:00.000Z",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Change 'user-auth-system' archived successfully"
      }
    ]
  },
  "duration": 850
}
```

### changes.active

List all active changes.

#### Input Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 50,
      "description": "Maximum number of changes to return"
    },
    "offset": {
      "type": "integer",
      "minimum": 0,
      "default": 0,
      "description": "Number of changes to skip"
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
    "offset": 0
  }
}
```

#### Example Response

```json
{
  "apiVersion": "1.0.0",
  "tool": "changes.active",
  "startedAt": "2025-10-25T10:00:00.000Z",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 3 active changes"
      },
      {
        "type": "resource",
        "uri": "changes://active/list",
        "mimeType": "application/json"
      }
    ]
  },
  "duration": 450
}
```

## Error Handling

### Error Response Format

All errors follow a consistent format:

#### SSE Error Event

```http
event: error
id: req-12345
data: {"apiVersion":"1.0.0","error":{"code":"INVALID_INPUT","message":"Invalid input for tool 'change.open': slug: must match pattern","hint":"Check the input schema and try again"},"startedAt":"2025-10-25T10:00:00.000Z"}
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
  "timestamp": "2025-10-25T10:00:00.000Z"
}
```

### Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `INVALID_TOOL_NAME` | 400 | Tool name is missing or invalid |
| `TOOL_NOT_FOUND` | 404 | Requested tool does not exist |
| `INVALID_INPUT` | 400 | Tool input validation failed |
| `TOOL_REGISTRY_UNAVAILABLE` | 500 | Tool registry is not available |
| `TOOL_EXECUTION_ERROR` | 500 | Tool execution failed |
| `INVALID_TOOL_RESULT` | 500 | Tool returned invalid result |
| `RESPONSE_TOO_LARGE` | 413 | Response exceeds size limit |
| `AUTHENTICATION_FAILED` | 401 | Invalid or missing authentication |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `UNKNOWN_ERROR` | 500 | Unknown error occurred |

### Common Error Scenarios

#### Authentication Errors

```json
{
  "apiVersion": "1.0.0",
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Invalid or missing authentication token",
    "hint": "Provide a valid Bearer token in the Authorization header"
  },
  "timestamp": "2025-10-25T10:00:00.000Z"
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
    "retryAfter": 30
  },
  "timestamp": "2025-10-25T10:00:00.000Z"
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
      "pattern": "^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$"
    }
  },
  "timestamp": "2025-10-25T10:00:00.000Z"
}
```

## Rate Limiting

### Configuration

Rate limiting is configured via environment variables:

```bash
RATE_LIMIT=60                    # Requests per minute
RATE_LIMIT_BURST=90             # Burst limit
RATE_LIMIT_WINDOW_MS=60000      # Window size in milliseconds
ENABLE_DISTRIBUTED_RATE_LIMIT=false  # Redis-based distributed limiting
REDIS_URL=redis://localhost:6379  # Redis URL for distributed limiting
```

### Rate Limiting Headers

When rate limits are enforced, the following headers are included:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1698224060
X-RateLimit-Retry-After: 30
```

### Rate Limiting Strategy

- **IP-based**: Default strategy using client IP address
- **Token-based**: When authentication token is provided
- **Distributed**: Redis-based for multi-instance deployments

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

This comprehensive API reference provides all the information needed to integrate with the Task MCP HTTP server, including detailed endpoint specifications, error handling, security considerations, and working code examples.