# Code Examples Directory

This directory contains practical code examples for integrating with Task MCP HTTP server using various programming languages and frameworks.

## Directory Structure

```
examples/
├── javascript/          # JavaScript and Node.js examples
├── python/             # Python examples
├── curl/               # Command-line examples
├── postman/            # Postman collections
├── browser/            # Browser-based examples
└── integrations/       # Full integration examples
```

## Quick Start

### JavaScript/Node.js

```javascript
// Basic SSE client
import { TaskMCPClient } from './javascript/task-mcp-client.js';

const client = new TaskMCPClient('https://your-domain.com', 'your-token');

// Execute a tool
const result = await client.executeToolSSE('changes.active', {});
console.log('Active changes:', result);
```

### Python

```python
# Basic SSE client
from task_mcp_client import TaskMCPClient

client = TaskMCPClient('https://your-domain.com', 'your-token')

# Execute a tool
result = await client.execute_tool_sse('changes.active', {})
print('Active changes:', result)
```

### curl

```bash
# Basic SSE request
curl -X POST https://your-domain.com/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "changes.active",
    "input": {}
  }'
```

## Examples by Use Case

### 1. Basic Tool Execution

- [JavaScript](./javascript/basic-tool-execution.js)
- [Python](./python/basic_tool_execution.py)
- [curl](./curl/basic-tool-execution.sh)

### 2. Error Handling

- [JavaScript](./javascript/error-handling.js)
- [Python](./python/error_handling.py)

### 3. Connection Management

- [JavaScript](./javascript/connection-management.js)
- [Python](./python/connection_management.py)

### 4. Batch Operations

- [JavaScript](./javascript/batch-operations.js)
- [Python](./python/batch_operations.py)

### 5. Real-time Updates

- [Browser](./browser/real-time-updates.html)
- [JavaScript](./javascript/real-time-updates.js)

### 6. Authentication

- [JavaScript](./javascript/authentication.js)
- [Python](./python/authentication.py)

### 7. Rate Limiting

- [JavaScript](./javascript/rate-limiting.js)
- [Python](./python/rate_limiting.py)

## Framework Integrations

### Express.js

```javascript
// See ./javascript/express-integration.js
const express = require('express');
const { TaskMCPClient } = require('./task-mcp-client');

const app = express();
const client = new TaskMCPClient(process.env.TASK_MCP_URL, process.env.TASK_MCP_TOKEN);

app.post('/api/changes', async (req, res) => {
  try {
    const result = await client.executeToolSSE('change.open', req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### FastAPI (Python)

```python
# See ./python/fastapi_integration.py
from fastapi import FastAPI, HTTPException
from task_mcp_client import TaskMCPClient

app = FastAPI()
client = TaskMCPClient(
    base_url=os.getenv("TASK_MCP_URL"),
    auth_token=os.getenv("TASK_MCP_TOKEN")
)

@app.post("/api/changes")
async def create_change(change_data: dict):
    try:
        result = await client.execute_tool_sse("change.open", change_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### React

```jsx
// See ./browser/react-integration.jsx
import React, { useState, useEffect } from 'react';
import { TaskMCPClient } from './task-mcp-client';

function ChangeManager() {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const client = new TaskMCPClient(
    process.env.REACT_APP_TASK_MCP_URL,
    process.env.REACT_APP_TASK_MCP_TOKEN
  );
  
  useEffect(() => {
    loadChanges();
  }, []);
  
  const loadChanges = async () => {
    setLoading(true);
    try {
      const result = await client.executeToolSSE('changes.active', {});
      setChanges(result.content || []);
    } catch (error) {
      console.error('Failed to load changes:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <h1>Active Changes</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {changes.map((change, index) => (
            <li key={index}>{change.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## Testing Examples

### Unit Tests

```javascript
// See ./javascript/unit-tests.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskMCPClient } from '../task-mcp-client';

describe('TaskMCPClient', () => {
  let client;
  let mockFetch;
  
  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    client = new TaskMCPClient('https://test.com', 'test-token');
  });
  
  it('should execute tool successfully', async () => {
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: () => Promise.resolve({
            done: true,
            value: new TextEncoder().encode(
              'event: result\ndata: {"result": {"content": [{"text": "Success"}]}}\n\n'
            )
          })
        })
      }
    };
    
    mockFetch.mockResolvedValue(mockResponse);
    
    const result = await client.executeToolSSE('test.tool', {});
    expect(result.content[0].text).toBe('Success');
  });
});
```

### Integration Tests

```python
# See ./python/integration_tests.py
import pytest
import asyncio
from task_mcp_client import TaskMCPClient

@pytest.mark.asyncio
async def test_tool_execution():
    client = TaskMCPClient('http://localhost:8443', 'test-token')
    
    result = await client.execute_tool_sse('changes.active', {})
    
    assert 'content' in result
    assert isinstance(result['content'], list)

@pytest.mark.asyncio
async def test_error_handling():
    client = TaskMCPClient('http://localhost:8443', 'invalid-token')
    
    with pytest.raises(Exception):
        await client.execute_tool_sse('changes.active', {})
```

## Configuration Examples

### Environment Configuration

```bash
# .env.example
TASK_MCP_URL=https://your-domain.com
TASK_MCP_TOKEN=your-auth-token
TASK_MCP_TIMEOUT=30000
TASK_MCP_RETRY_ATTEMPTS=3
```

### Docker Compose

```yaml
# docker-compose.example.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - TASK_MCP_URL=http://task-mcp:8443
      - TASK_MCP_TOKEN=${TASK_MCP_TOKEN}
    depends_on:
      - task-mcp
      
  task-mcp:
    image: fission-ai/task-mcp-http:latest
    environment:
      - AUTH_TOKENS=${TASK_MCP_TOKEN}
      - LOG_LEVEL=info
```

## Best Practices

### 1. Error Handling

Always implement proper error handling and retry logic:

```javascript
try {
  const result = await client.executeToolSSE('tool.name', input);
  return result;
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    // Implement exponential backoff
    await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
    return client.executeToolSSE('tool.name', input);
  }
  throw error;
}
```

### 2. Connection Management

Manage connections efficiently, especially in browser environments:

```javascript
class ConnectionManager {
  constructor() {
    this.connections = new Map();
  }
  
  getConnection(id) {
    if (!this.connections.has(id)) {
      this.connections.set(id, new TaskMCPClient(url, token));
    }
    return this.connections.get(id);
  }
  
  cleanup() {
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
  }
}
```

### 3. Resource Cleanup

Always clean up resources when they're no longer needed:

```javascript
// Browser
window.addEventListener('beforeunload', () => {
  client.close();
});

// Node.js
process.on('SIGINT', () => {
  client.close();
  process.exit(0);
});
```

## Contributing

To contribute new examples:

1. Create a new file in the appropriate language directory
2. Follow the existing code style and patterns
3. Include comprehensive comments and documentation
4. Add error handling where appropriate
5. Test the example before submitting
6. Update this README file with a link to your example

## Support

For questions about these examples:

1. Check the existing documentation
2. Look at the test files for usage patterns
3. Create an issue on GitHub
4. Join our Discord community

Each example directory includes its own README with specific setup and usage instructions.