# Anthropic Messages API Integration Example

_Last updated: 2025-10-25_

## Overview

This guide provides a complete example of integrating the Anthropic Messages API with Task MCP using both SSE (Server-Sent Events) and NDJSON (Newline-Delimited JSON) transports. The example demonstrates how to connect Claude to Task MCP for managing OpenSpec changes.

## Prerequisites

- Anthropic API key
- Task MCP HTTP server running
- Node.js 18+ or Python 3.8+
- Basic understanding of REST APIs

## Architecture Overview

```
┌─────────────────┐    HTTP/SSE    ┌─────────────────┐    MCP Protocol    ┌─────────────────┐
│   Claude/       │ ──────────────→ │  Task MCP HTTP  │ ──────────────────→ │   OpenSpec      │
│   Messages API  │                │     Server      │                     │   Repository    │
└─────────────────┘                └─────────────────┘                     └─────────────────┘
        │                                   │                                     │
        │                                   │                                     │
        └────────────────── SSE/NDJSON ─────┘                                     │
                                                                                 │
                                                                                 │
        ┌─────────────────┐                                                   ┌───┴───┐
        │   Client App    │                                                   │ Files │
        │   (Browser/     │                                                   │       │
        │   Node.js)      │                                                   └───────┘
        └─────────────────┘
```

## Quick Start Example

### 1. Basic Messages API Request with Task MCP

```javascript
// Example: Create a change using Task MCP via Messages API
const createChangeWithClaude = async () => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      tools: [
        {
          name: 'change_open',
          description: 'Create a new change in OpenSpec',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Change title' },
              slug: { type: 'string', description: 'Change slug' },
              template: { 
                type: 'string', 
                enum: ['feature', 'bugfix', 'chore'],
                description: 'Change template type'
              }
            },
            required: ['title', 'slug']
          }
        }
      ],
      messages: [
        {
          role: 'user',
          content: 'Create a new change for implementing user authentication with slug "user-auth-v2" using the feature template.'
        }
      ]
    })
  });

  const result = await response.json();
  return result;
};
```

### 2. MCP Connector Configuration

```json
{
  "mcp_servers": {
    "task": {
      "url": "https://your-task-mcp-server.com/sse",
      "capabilities": ["tools"],
      "authorization_token": "Bearer your-task-mcp-token"
    }
  },
  "tools": [
    {
      "server": "task",
      "tool": "change.open",
      "input": {
        "title": "Implement user authentication",
        "slug": "user-auth-v2",
        "template": "feature"
      }
    }
  ]
}
```

## Complete Integration Examples

### JavaScript/Node.js Integration

```javascript
class TaskMCPClient {
  constructor(baseUrl, authToken) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  // SSE-based tool execution
  async executeToolSSE(toolName, input) {
    const response = await fetch(`${this.baseUrl}/sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        tool: toolName,
        input: input,
        apiVersion: '1.0.0'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
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
          const parsed = this.parseSSEMessage(line);
          if (parsed.type === 'result') {
            result = parsed.data;
          } else if (parsed.type === 'error') {
            throw new Error(`Tool error: ${parsed.data.error.message}`);
          }
        }
      }
    }

    return result;
  }

  // NDJSON-based tool execution
  async executeToolNDJSON(toolName, input) {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        'Accept': 'application/x-ndjson'
      },
      body: JSON.stringify({
        tool: toolName,
        input: input,
        apiVersion: '1.0.0'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'result') {
              result = event.result;
            } else if (event.type === 'error') {
              throw new Error(`Tool error: ${event.error.message}`);
            }
          } catch (e) {
            console.error('Failed to parse NDJSON line:', line);
          }
        }
      }
    }

    return result;
  }

  parseSSEMessage(rawMessage) {
    const lines = rawMessage.split('\n');
    const event = {};
    
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

  // Convenience methods for common operations
  async createChange(title, slug, options = {}) {
    return this.executeToolSSE('change.open', {
      title,
      slug,
      template: options.template || 'feature',
      rationale: options.rationale,
      owner: options.owner,
      ttl: options.ttl
    });
  }

  async archiveChange(slug) {
    return this.executeToolSSE('change.archive', { slug });
  }

  async getActiveChanges() {
    return this.executeToolSSE('changes.active', {});
  }
}

// Usage example
async function demonstrateIntegration() {
  const client = new TaskMCPClient(
    'https://task-mcp.example.com',
    'your-auth-token-here'
  );

  try {
    // Create a new change
    const changeResult = await client.createChange(
      'Add user authentication system',
      'user-auth-system',
      {
        template: 'feature',
        rationale: 'Implement secure user authentication with JWT tokens',
        owner: 'security-team'
      }
    );

    console.log('Change created:', changeResult);

    // Get active changes
    const activeChanges = await client.getActiveChanges();
    console.log('Active changes:', activeChanges);

    // Archive the change when done
    await client.archiveChange('user-auth-system');
    console.log('Change archived');

  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Python Integration

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
        """Execute tool using SSE transport"""
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

    def execute_tool_ndjson(self, tool_name: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute tool using NDJSON transport"""
        headers = {'Accept': 'application/x-ndjson'}
        payload = {
            'tool': tool_name,
            'input': input_data,
            'apiVersion': '1.0.0'
        }
        
        response = self.session.post(
            f'{self.base_url}/mcp',
            headers=headers,
            json=payload,
            stream=True
        )
        
        if response.status_code != 200:
            raise Exception(f"HTTP {response.status_code}: {response.text}")
        
        result = None
        
        for line in response.iter_lines():
            if line:
                try:
                    event = json.loads(line)
                    if event.get('type') == 'result':
                        result = event.get('result')
                    elif event.get('type') == 'error':
                        error_info = event.get('error', {})
                        raise Exception(f"Tool error: {error_info.get('message')}")
                except json.JSONDecodeError as e:
                    print(f"Failed to parse NDJSON line: {e}")
                    continue
        
        return result

    def create_change(self, title: str, slug: str, **options) -> Dict[str, Any]:
        """Create a new change"""
        input_data = {
            'title': title,
            'slug': slug,
            'template': options.get('template', 'feature'),
            'rationale': options.get('rationale'),
            'owner': options.get('owner'),
            'ttl': options.get('ttl')
        }
        return self.execute_tool_sse('change.open', input_data)

    def archive_change(self, slug: str) -> Dict[str, Any]:
        """Archive a change"""
        return self.execute_tool_sse('change.archive', {'slug': slug})

    def get_active_changes(self) -> Dict[str, Any]:
        """Get all active changes"""
        return self.execute_tool_sse('changes.active', {})

# Usage example
def main():
    client = TaskMCPClient(
        'https://task-mcp.example.com',
        'your-auth-token-here'
    )

    try:
        # Create a new change
        result = client.create_change(
            title='Implement OAuth2 integration',
            slug='oauth2-integration',
            template='feature',
            rationale='Add OAuth2 support for third-party authentication',
            owner='auth-team'
        )
        print("Change created:", json.dumps(result, indent=2))

        # Get active changes
        active = client.get_active_changes()
        print("Active changes:", json.dumps(active, indent=2))

        # Archive the change
        client.archive_change('oauth2-integration')
        print("Change archived successfully")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
```

## Anthropic Messages API with MCP Integration

### 1. Direct API Integration

```javascript
class ClaudeMCPIntegration {
  constructor(anthropicApiKey, taskMcpClient) {
    this.anthropicApiKey = anthropicApiKey;
    this.taskMcpClient = taskMcpClient;
  }

  async processUserRequest(userMessage) {
    // First, check if this is a change management request
    const changeIntent = await this.detectChangeIntent(userMessage);
    
    if (changeIntent) {
      return this.handleChangeRequest(changeIntent);
    }

    // Otherwise, process as regular Claude request
    return this.callClaude(userMessage);
  }

  async detectChangeIntent(message) {
    // Use Claude to detect if this is a change management request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Analyze this message and determine if it's requesting a change management action. If yes, extract the details in JSON format:
            
            Message: "${message}"
            
            Return JSON with: { isChangeRequest: boolean, action: "create|archive|list", details: {...} }
            
            If not a change request, return: { isChangeRequest: false }`
          }
        ]
      })
    });

    const result = await response.json();
    const content = result.content[0]?.text;
    
    try {
      return JSON.parse(content);
    } catch (e) {
      return { isChangeRequest: false };
    }
  }

  async handleChangeRequest(intent) {
    switch (intent.action) {
      case 'create':
        return this.createChange(intent.details);
      case 'archive':
        return this.archiveChange(intent.details);
      case 'list':
        return this.listChanges();
      default:
        throw new Error(`Unknown action: ${intent.action}`);
    }
  }

  async createChange(details) {
    // Validate required fields
    if (!details.title || !details.slug) {
      throw new Error('Title and slug are required for creating changes');
    }

    // Create the change using Task MCP
    const result = await this.taskMcpClient.createChange(
      details.title,
      details.slug,
      {
        template: details.template || 'feature',
        rationale: details.rationale,
        owner: details.owner
      }
    );

    return {
      type: 'change_created',
      data: result,
      message: `Successfully created change: ${details.title}`
    };
  }

  async archiveChange(details) {
    if (!details.slug) {
      throw new Error('Slug is required for archiving changes');
    }

    const result = await this.taskMcpClient.archiveChange(details.slug);
    
    return {
      type: 'change_archived',
      data: result,
      message: `Successfully archived change: ${details.slug}`
    };
  }

  async listChanges() {
    const result = await this.taskMcpClient.getActiveChanges();
    
    return {
      type: 'active_changes',
      data: result,
      message: `Found ${result.content?.length || 0} active changes`
    };
  }

  async callClaude(message) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      })
    });

    return response.json();
  }
}

// Usage example
async function demonstrateClaudeIntegration() {
  const taskMcpClient = new TaskMCPClient(
    'https://task-mcp.example.com',
    'your-task-mcp-token'
  );

  const claudeIntegration = new ClaudeMCPIntegration(
    process.env.ANTHROPIC_API_KEY,
    taskMcpClient
  );

  // Test different types of requests
  const requests = [
    'Create a new change for implementing user notifications with slug "user-notifications"',
    'Archive the change "old-feature-removal"',
    'Show me all active changes',
    'What is the capital of France?' // Regular Claude question
  ];

  for (const request of requests) {
    console.log(`\nProcessing: ${request}`);
    try {
      const result = await claudeIntegration.processUserRequest(request);
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}
```

### 2. Streaming Integration with Claude

```javascript
class StreamingClaudeMCPIntegration {
  constructor(anthropicApiKey, taskMcpClient) {
    this.anthropicApiKey = anthropicApiKey;
    this.taskMcpClient = taskMcpClient;
  }

  async processStreamingRequest(userMessage, onChunk) {
    const changeIntent = await this.detectChangeIntent(userMessage);
    
    if (changeIntent.isChangeRequest) {
      return this.handleStreamingChangeRequest(changeIntent, onChunk);
    }

    return this_streamingClaudeCall(userMessage, onChunk);
  }

  async handleStreamingChangeRequest(intent, onChunk) {
    // Send initial status
    onChunk({
      type: 'status',
      message: `Processing ${intent.action} request...`
    });

    try {
      let result;
      switch (intent.action) {
        case 'create':
          onChunk({ type: 'status', message: 'Creating change...' });
          result = await this.createChange(intent.details);
          break;
        case 'archive':
          onChunk({ type: 'status', message: 'Archiving change...' });
          result = await this.archiveChange(intent.details);
          break;
        case 'list':
          onChunk({ type: 'status', message: 'Fetching changes...' });
          result = await this.listChanges();
          break;
      }

      onChunk({
        type: 'result',
        data: result
      });

    } catch (error) {
      onChunk({
        type: 'error',
        message: error.message
      });
    }
  }

  async streamingClaudeCall(message, onChunk) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        stream: true,
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta') {
              onChunk({
                type: 'claude_chunk',
                text: parsed.delta.text
              });
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }
  }
}

// Browser-based example
function setupChatInterface() {
  const claudeIntegration = new StreamingClaudeMCPIntegration(
    'your-anthropic-api-key',
    new TaskMCPClient('https://task-mcp.example.com', 'your-token')
  );

  const chatContainer = document.getElementById('chat');
  const inputField = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');

  sendButton.addEventListener('click', async () => {
    const message = inputField.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessageToChat('user', message);
    inputField.value = '';

    // Add loading indicator
    const loadingId = addMessageToChat('assistant', 'Thinking...', true);

    try {
      let fullResponse = '';
      
      await claudeIntegration.processStreamingRequest(message, (chunk) => {
        if (chunk.type === 'claude_chunk') {
          fullResponse += chunk.text;
          updateMessage(loadingId, fullResponse);
        } else if (chunk.type === 'status') {
          updateMessage(loadingId, chunk.message);
        } else if (chunk.type === 'result') {
          updateMessage(loadingId, formatResult(chunk.data));
        } else if (chunk.type === 'error') {
          updateMessage(loadingId, `Error: ${chunk.message}`);
        }
      });

    } catch (error) {
      updateMessage(loadingId, `Error: ${error.message}`);
    }
  });
}

function addMessageToChat(role, content, isLoading = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  messageDiv.textContent = content;
  if (isLoading) messageDiv.id = `loading-${Date.now()}`;
  
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  return messageDiv.id;
}

function updateMessage(messageId, content) {
  const message = document.getElementById(messageId);
  if (message) {
    message.textContent = content;
  }
}

function formatResult(result) {
  if (result.type === 'change_created') {
    return `✅ ${result.message}\n\nChange details:\n${JSON.stringify(result.data, null, 2)}`;
  } else if (result.type === 'change_archived') {
    return `🗑️ ${result.message}`;
  } else if (result.type === 'active_changes') {
    const changes = result.data.content || [];
    return `📋 ${result.message}\n\n${changes.map(c => `- ${c.title} (${c.slug})`).join('\n')}`;
  }
  return JSON.stringify(result, null, 2);
}
```

## Configuration Examples

### Environment Configuration

```bash
# .env file
ANTHROPIC_API_KEY=your-anthropic-api-key
TASK_MCP_BASE_URL=https://task-mcp.example.com
TASK_MCP_AUTH_TOKEN=your-task-mcp-token
DEFAULT_CHANGE_TEMPLATE=feature
DEFAULT_CHANGE_OWNER=dev-team
```

### Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  task-mcp-server:
    image: fission-ai/task-mcp-http:latest
    ports:
      - "8443:8443"
    environment:
      - PORT=8443
      - HOST=0.0.0.0
      - AUTH_TOKENS=your-token-here
      - LOG_LEVEL=info
      - WORKING_DIRECTORY=/app/openspec
    volumes:
      - ./openspec:/app/openspec:ro
      - ./certs:/app/certs:ro
    healthcheck:
      test: ["CMD", "/usr/local/bin/health-check.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  claude-integration:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - TASK_MCP_BASE_URL=http://task-mcp-server:8443
      - TASK_MCP_AUTH_TOKEN=${TASK_MCP_AUTH_TOKEN}
    depends_on:
      task-mcp-server:
        condition: service_healthy
```

### Claude Desktop Configuration

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "task-mcp": {
      "command": "node",
      "args": ["./claude-mcp-bridge.js"],
      "env": {
        "TASK_MCP_URL": "https://task-mcp.example.com",
        "TASK_MCP_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Error Handling and Retry Logic

### Robust Error Handling

```javascript
class RobustTaskMCPClient extends TaskMCPClient {
  async executeToolWithRetry(toolName, input, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeToolSSE(toolName, input);
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  isNonRetryableError(error) {
    const nonRetryableCodes = [
      'INVALID_TOOL_NAME',
      'TOOL_NOT_FOUND',
      'INVALID_INPUT',
      'AUTHENTICATION_FAILED'
    ];
    
    return nonRetryableCodes.includes(error.code);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeToolWithTimeout(toolName, input, timeoutMs = 30000) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
    });

    const toolPromise = this.executeToolWithRetry(toolName, input);
    
    return Promise.race([toolPromise, timeoutPromise]);
  }
}
```

### Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(failureThreshold = 5, timeoutMs = 60000) {
    this.failureThreshold = failureThreshold;
    this.timeoutMs = timeoutMs;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage
const circuitBreaker = new CircuitBreaker();

async function executeWithCircuitBreaker(toolName, input) {
  return circuitBreaker.execute(async () => {
    return client.executeToolSSE(toolName, input);
  });
}
```

## Performance Optimization

### Connection Pooling

```javascript
class PooledTaskMCPClient {
  constructor(baseUrl, authToken, poolSize = 5) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.poolSize = poolSize;
    this.clients = [];
    this.availableClients = [];
    
    for (let i = 0; i < poolSize; i++) {
      const client = new TaskMCPClient(baseUrl, authToken);
      this.clients.push(client);
      this.availableClients.push(client);
    }
  }

  async executeTool(toolName, input) {
    const client = await this.getClient();
    
    try {
      return await client.executeToolSSE(toolName, input);
    } finally {
      this.releaseClient(client);
    }
  }

  async getClient() {
    if (this.availableClients.length === 0) {
      // Wait for a client to become available
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (this.availableClients.length > 0) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }
    
    return this.availableClients.pop();
  }

  releaseClient(client) {
    this.availableClients.push(client);
  }
}
```

### Request Batching

```javascript
class BatchTaskMCPClient extends TaskMCPClient {
  constructor(baseUrl, authToken, batchSize = 10, batchTimeoutMs = 100) {
    super(baseUrl, authToken);
    this.batchSize = batchSize;
    this.batchTimeoutMs = batchTimeoutMs;
    this.pendingRequests = [];
    this.batchTimer = null;
  }

  async executeToolBatched(toolName, input) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.push({
        toolName,
        input,
        resolve,
        reject,
        timestamp: Date.now()
      });

      if (this.pendingRequests.length >= this.batchSize) {
        this.processBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, this.batchTimeoutMs);
      }
    });
  }

  async processBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const batch = this.pendingRequests.splice(0, this.batchSize);
    
    try {
      // Process requests in parallel
      const results = await Promise.allSettled(
        batch.map(req => this.executeToolSSE(req.toolName, req.input))
      );

      // Resolve/reject individual promises
      results.forEach((result, index) => {
        const request = batch[index];
        if (result.status === 'fulfilled') {
          request.resolve(result.value);
        } else {
          request.reject(result.reason);
        }
      });

    } catch (error) {
      // Reject all requests if batch processing fails
      batch.forEach(req => req.reject(error));
    }
  }
}
```

## Testing and Monitoring

### Unit Testing Example

```javascript
// tests/task-mcp-client.test.js
import { TaskMCPClient } from '../src/task-mcp-client';

describe('TaskMCPClient', () => {
  let client;
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    client = new TaskMCPClient('https://test.com', 'test-token');
  });

  test('should create change successfully', async () => {
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: () => Promise.resolve({
            done: true,
            value: new TextEncoder().encode(
              'event: result\n' +
              'data: {"result": {"content": [{"type": "text", "text": "Success"}]}}\n\n'
            )
          })
        })
      }
    };

    mockFetch.mockResolvedValue(mockResponse);

    const result = await client.createChange('Test Change', 'test-change');
    
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Success' }]
    });
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.com/sse',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        })
      })
    );
  });

  test('should handle tool errors', async () => {
    const mockResponse = {
      ok: true,
      body: {
        getReader: () => ({
          read: () => Promise.resolve({
            done: true,
            value: new TextEncoder().encode(
              'event: error\n' +
              'data: {"error": {"code": "INVALID_INPUT", "message": "Invalid input"}}\n\n'
            )
          })
        })
      }
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(client.createChange('', '')).rejects.toThrow('Tool error: Invalid input');
  });
});
```

### Monitoring and Metrics

```javascript
class TaskMCPMetrics {
  constructor() {
    this.metrics = {
      requests: 0,
      successes: 0,
      errors: 0,
      responseTime: [],
      activeConnections: 0
    };
  }

  recordRequest() {
    this.metrics.requests++;
    this.metrics.activeConnections++;
  }

  recordSuccess(responseTime) {
    this.metrics.successes++;
    this.metrics.responseTime.push(responseTime);
    this.metrics.activeConnections--;
  }

  recordError() {
    this.metrics.errors++;
    this.metrics.activeConnections--;
  }

  getMetrics() {
    const avgResponseTime = this.metrics.responseTime.length > 0
      ? this.metrics.responseTime.reduce((a, b) => a + b, 0) / this.metrics.responseTime.length
      : 0;

    return {
      ...this.metrics,
      successRate: this.metrics.requests > 0 ? this.metrics.successes / this.metrics.requests : 0,
      errorRate: this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0,
      averageResponseTime: avgResponseTime
    };
  }
}

// Wrap client with metrics
class MetricsTaskMCPClient extends TaskMCPClient {
  constructor(baseUrl, authToken) {
    super(baseUrl, authToken);
    this.metrics = new TaskMCPMetrics();
  }

  async executeToolSSE(toolName, input) {
    const startTime = Date.now();
    this.metrics.recordRequest();

    try {
      const result = await super.executeToolSSE(toolName, input);
      const responseTime = Date.now() - startTime;
      this.metrics.recordSuccess(responseTime);
      return result;
    } catch (error) {
      this.metrics.recordError();
      throw error;
    }
  }

  getMetrics() {
    return this.metrics.getMetrics();
  }
}
```

This comprehensive integration guide provides everything needed to connect the Anthropic Messages API with Task MCP, including working examples, error handling, performance optimization, and testing strategies.