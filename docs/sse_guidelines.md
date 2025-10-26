# Server-Sent Events (SSE) Implementation Guidelines

_Last updated: 2025-10-25_

## Overview

Server-Sent Events (SSE) provide a standardized way for servers to push real-time updates to clients over HTTP. This guide covers the implementation of SSE in Task MCP HTTP server, including best practices, client integration, and troubleshooting.

## SSE Protocol Basics

### What is SSE?

SSE is a unidirectional communication protocol where:
- **Server** pushes data to **client** continuously
- Uses standard HTTP with `text/event-stream` content type
- Automatic reconnection handling built into browsers
- Event-based messaging with named types

### Message Format

Each SSE message follows this format:

```
event: [event-type]
id: [event-id]
data: [json-data]
retry: [retry-time-ms]

[event: [event-type]
id: [event-id]
data: [json-data]]
```

**Key Components:**
- `event`: Event type (e.g., `result`, `error`, `heartbeat`)
- `id`: Unique event identifier for reconnection tracking
- `data`: JSON payload (can span multiple lines)
- `retry`: Reconnection delay in milliseconds

### Event Types in Task MCP

```typescript
type SSEEventType = 'result' | 'error' | 'heartbeat';

interface SSEEvent {
  event: SSEEventType;
  data: any;
  id?: string;
  retry?: number;
}
```

## Client Implementation Examples

### JavaScript/EventSource (Browser)

```javascript
// Basic SSE connection
const eventSource = new EventSource('/sse', {
  headers: {
    'Authorization': 'Bearer your-token-here'
  }
});

// Handle successful results
eventSource.addEventListener('result', (event) => {
  const response = JSON.parse(event.data);
  console.log('Tool result:', response.result);
  
  // Process the tool result
  if (response.result.content) {
    response.result.content.forEach(item => {
      if (item.type === 'text') {
        console.log('Text output:', item.text);
      }
    });
  }
});

// Handle errors
eventSource.addEventListener('error', (event) => {
  const error = JSON.parse(event.data);
  console.error('Tool error:', error.error);
  
  // Display user-friendly error message
  showError(error.error.message, error.error.hint);
});

// Connection management
eventSource.onopen = () => {
  console.log('SSE connection established');
};

eventSource.onerror = (event) => {
  console.error('SSE connection error:', event);
  
  // Check if connection is closed
  if (eventSource.readyState === EventSource.CLOSED) {
    console.log('SSE connection closed');
  }
};

// Close connection when done
function closeConnection() {
  eventSource.close();
}
```

### JavaScript with POST Request

Since Task MCP requires POST requests for tool execution:

```javascript
async function executeToolWithSSE(toolName, input) {
  const response = await fetch('/sse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-token-here',
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || ''; // Keep incomplete line

    for (const line of lines) {
      if (line.trim()) {
        handleSSEMessage(line);
      }
    }
  }
}

function handleSSEMessage(rawMessage) {
  const lines = rawMessage.split('\n');
  const event = {};
  
  for (const line of lines) {
    const [field, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    
    if (field === 'event') event.type = value;
    else if (field === 'data') event.data = value;
    else if (field === 'id') event.id = value;
    else if (field === 'retry') event.retry = parseInt(value);
  }

  // Parse JSON data
  if (event.data) {
    try {
      event.data = JSON.parse(event.data);
    } catch (e) {
      console.error('Failed to parse SSE data:', e);
      return;
    }
  }

  // Handle based on event type
  switch (event.type) {
    case 'result':
      handleResult(event.data);
      break;
    case 'error':
      handleError(event.data);
      break;
    case 'heartbeat':
      // Heartbeat received, connection is alive
      break;
  }
}
```

### Python Client

```python
import requests
import json
import sseclient

def execute_tool_sse(base_url, tool_name, input_data, auth_token):
    """Execute tool using SSE transport"""
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {auth_token}',
        'Accept': 'text/event-stream'
    }
    
    payload = {
        'tool': tool_name,
        'input': input_data,
        'apiVersion': '1.0.0'
    }
    
    response = requests.post(
        f'{base_url}/sse',
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
                # Connection is alive
                continue
                
        except json.JSONDecodeError as e:
            print(f"Failed to parse SSE data: {e}")
            continue

# Usage example
try:
    result = execute_tool_sse(
        base_url='https://task.example.com',
        tool_name='change.open',
        input_data={
            'title': 'New feature implementation',
            'slug': 'new-feature-impl',
            'template': 'feature'
        },
        auth_token='your-token-here'
    )
    print("Tool result:", result)
except Exception as e:
    print("Error executing tool:", e)
```

### curl Command Line

```bash
# Execute tool with SSE
curl -X POST https://task.example.com/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "change.open",
    "input": {
      "title": "Test change",
      "slug": "test-change",
      "template": "feature"
    },
    "apiVersion": "1.0.0"
  }'

# With verbose output to see headers
curl -v -X POST https://task.example.com/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -H "Accept: text/event-stream" \
  -d '{"tool":"change.open","input":{"title":"Test","slug":"test"}}'
```

## Connection Management

### Authentication

SSE connections require authentication:

```javascript
// Method 1: Query parameter (not recommended for production)
const eventSource = new EventSource('/sse?token=your-token');

// Method 2: Cookie-based authentication
// Set cookie before establishing connection
document.cookie = 'auth_token=your-token; path=/; secure; httponly';
const eventSource = new EventSource('/sse');

// Method 3: POST request with fetch (recommended)
// See JavaScript with POST Request example above
```

### Heartbeat Mechanism

The server sends heartbeat events to keep connections alive:

```javascript
let lastHeartbeat = Date.now();
const heartbeatTimeout = 60000; // 60 seconds

// Monitor heartbeats
eventSource.addEventListener('heartbeat', (event) => {
  lastHeartbeat = Date.now();
  console.log('Heartbeat received:', event.data);
});

// Check for connection health
setInterval(() => {
  if (Date.now() - lastHeartbeat > heartbeatTimeout) {
    console.warn('No heartbeat received, connection may be dead');
    eventSource.close();
    // Reconnect logic here
  }
}, 30000);
```

### Reconnection Strategy

```javascript
class ReconnectingSSE {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.reconnectDelay = options.reconnectDelay || 1000;
    this.maxReconnectDelay = options.maxReconnectDelay || 30000;
    this.maxRetries = options.maxRetries || 10;
    this.retryCount = 0;
    
    this.connect();
  }
  
  connect() {
    try {
      this.eventSource = new EventSource(this.url, this.options);
      this.setupEventHandlers();
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      this.scheduleReconnect();
    }
  }
  
  setupEventHandlers() {
    this.eventSource.onopen = () => {
      console.log('SSE connection established');
      this.retryCount = 0; // Reset retry count on successful connection
    };
    
    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      
      if (this.eventSource.readyState === EventSource.CLOSED) {
        this.scheduleReconnect();
      }
    };
    
    // Add your custom event handlers here
    this.eventSource.addEventListener('result', (event) => {
      // Handle results
    });
    
    this.eventSource.addEventListener('error', (event) => {
      // Handle tool errors
    });
  }
  
  scheduleReconnect() {
    if (this.retryCount >= this.maxRetries) {
      console.error('Max retry attempts reached');
      return;
    }
    
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.retryCount),
      this.maxReconnectDelay
    );
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.retryCount + 1})`);
    
    setTimeout(() => {
      this.retryCount++;
      this.connect();
    }, delay);
  }
  
  close() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }
}

// Usage
const sseClient = new ReconnectingSSE('/sse', {
  maxRetries: 5,
  maxReconnectDelay: 10000
});
```

## Performance Considerations

### Connection Limits

- **HTTP/1.1**: Limited to 6 concurrent SSE connections per domain per browser
- **HTTP/2**: Supports up to 100 concurrent streams (negotiable)
- **Recommendation**: Use HTTP/2 for multiple simultaneous connections

### Memory Management

```javascript
// Process large responses incrementally
eventSource.addEventListener('result', (event) => {
  const response = JSON.parse(event.data);
  
  // Process content incrementally for large responses
  if (response.result && response.result.content) {
    response.result.content.forEach((item, index) => {
      // Process items one at a time
      setTimeout(() => {
        processContentItem(item);
      }, index * 10); // Small delay to prevent blocking
    });
  }
});

// Clean up event listeners when done
function cleanup() {
  eventSource.removeEventListener('result', handleResult);
  eventSource.removeEventListener('error', handleError);
  eventSource.close();
}
```

### Batch Operations

```javascript
// Execute multiple tools concurrently
async function executeBatchTools(tools) {
  const promises = tools.map(({ tool, input }) => 
    executeToolWithSSE(tool, input)
  );
  
  try {
    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error('Batch execution failed:', error);
    throw error;
  }
}

// Usage
const batch = [
  { tool: 'change.open', input: { title: 'Change 1', slug: 'change-1' } },
  { tool: 'change.open', input: { title: 'Change 2', slug: 'change-2' } }
];

executeBatchTools(batch)
  .then(results => console.log('Batch results:', results))
  .catch(error => console.error('Batch failed:', error));
```

## Error Handling

### Error Types

```typescript
interface SSEError {
  code: string;
  message: string;
  hint?: string;
  details?: any;
}

// Common error codes
const ERROR_CODES = {
  INVALID_TOOL_NAME: 'INVALID_TOOL_NAME',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  RESPONSE_TOO_LARGE: 'RESPONSE_TOO_LARGE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED'
};
```

### Error Handling Best Practices

```javascript
eventSource.addEventListener('error', (event) => {
  try {
    const errorData = JSON.parse(event.data);
    const error = errorData.error;
    
    switch (error.code) {
      case 'INVALID_INPUT':
        showValidationError(error.message, error.details);
        break;
        
      case 'RATE_LIMIT_EXCEEDED':
        showRateLimitError(error.hint);
        scheduleRetry();
        break;
        
      case 'TOOL_NOT_FOUND':
        showToolNotFoundError(error.message, error.hint);
        break;
        
      default:
        showGenericError(error.message, error.hint);
    }
  } catch (parseError) {
    // Handle JSON parse errors
    showGenericError('Invalid error response from server');
  }
});

function showValidationError(message, details) {
  console.error('Validation error:', message, details);
  // Show user-friendly validation error
  alert(`Validation Error: ${message}`);
}

function showRateLimitError(hint) {
  console.warn('Rate limit exceeded:', hint);
  // Show rate limit message with retry suggestion
  alert(`Rate limit exceeded. ${hint}`);
}

function scheduleRetry() {
  setTimeout(() => {
    // Retry the request
    console.log('Retrying request...');
  }, 5000);
}
```

## Troubleshooting Common SSE Issues

### Connection Problems

**Issue: Connection immediately closes**
```bash
# Check server logs
tail -f /var/log/task-mcp.log

# Test endpoint directly
curl -I https://task.example.com/sse

# Check authentication
curl -X POST https://task.example.com/sse \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json"
```

**Issue: No events received**
```javascript
// Debug connection state
setInterval(() => {
  console.log('Connection state:', eventSource.readyState);
  // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
}, 5000);

// Check network tab in browser dev tools
// Look for 200 OK response with text/event-stream content type
```

### Performance Issues

**Issue: Slow response times**
```javascript
// Measure response time
const startTime = Date.now();

eventSource.addEventListener('result', (event) => {
  const duration = Date.now() - startTime;
  console.log(`Response received in ${duration}ms`);
  
  if (duration > 10000) {
    console.warn('Slow response detected');
  }
});
```

**Issue: Memory leaks**
```javascript
// Monitor memory usage
setInterval(() => {
  if (performance.memory) {
    console.log('Memory usage:', {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
    });
  }
}, 30000);

// Clean up properly
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
});
```

### Browser Compatibility

| Browser | SSE Support | HTTP/2 Support | Notes |
|---------|-------------|----------------|-------|
| Chrome | ✅ Full | ✅ Full | Recommended |
| Firefox | ✅ Full | ✅ Full | Recommended |
| Safari | ✅ Full | ✅ Full | Good |
| Edge | ✅ Full | ✅ Full | Good |
| IE 11 | ❌ No | ❌ No | Not supported |

### Debug Tools

```javascript
// SSE debugging helper
class SSEDebugger {
  constructor(eventSource) {
    this.eventSource = eventSource;
    this.events = [];
    this.setupDebugging();
  }
  
  setupDebugging() {
    // Log all events
    ['result', 'error', 'heartbeat'].forEach(eventType => {
      this.eventSource.addEventListener(eventType, (event) => {
        this.logEvent(eventType, event);
      });
    });
    
    // Log connection state changes
    this.eventSource.onopen = () => this.logStateChange('OPEN');
    this.eventSource.onerror = () => this.logStateChange('ERROR');
  }
  
  logEvent(type, event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: type,
      data: event.data,
      id: event.lastEventId
    };
    
    this.events.push(logEntry);
    console.log(`SSE Event [${type}]:`, logEntry);
  }
  
  logStateChange(state) {
    console.log(`SSE State: ${state}`, {
      readyState: this.eventSource.readyState,
      url: this.eventSource.url,
      eventsCount: this.events.length
    });
  }
  
  getEventHistory() {
    return this.events;
  }
  
  exportLogs() {
    const logs = {
      timestamp: new Date().toISOString(),
      url: this.eventSource.url,
      readyState: this.eventSource.readyState,
      events: this.events
    };
    
    console.log('SSE Debug Logs:', JSON.stringify(logs, null, 2));
    return logs;
  }
}

// Usage
const debugger = new SSEDebugger(eventSource);

// Export logs for troubleshooting
setTimeout(() => {
  debugger.exportLogs();
}, 60000);
```

## Security Considerations

### Authentication Security

1. **Use HTTPS**: Always use HTTPS for SSE connections
2. **Token Management**: Securely store and refresh auth tokens
3. **CORS Configuration**: Properly configure CORS headers
4. **Rate Limiting**: Implement client-side rate limiting

### Data Security

```javascript
// Validate incoming data
function validateSSEData(data) {
  try {
    const parsed = JSON.parse(data);
    
    // Check for expected structure
    if (!parsed.apiVersion) {
      throw new Error('Missing apiVersion');
    }
    
    // Validate tool results
    if (parsed.result && !Array.isArray(parsed.result.content)) {
      throw new Error('Invalid result structure');
    }
    
    return parsed;
  } catch (error) {
    console.error('Invalid SSE data:', error);
    return null;
  }
}

// Sanitize data before processing
function sanitizeResult(result) {
  if (result.content) {
    result.content = result.content.map(item => {
      // Remove potentially dangerous content
      if (item.type === 'text' && item.text) {
        item.text = sanitizeHtml(item.text);
      }
      return item;
    });
  }
  return result;
}
```

## Best Practices Summary

### Do's
- ✅ Use HTTPS for all connections
- ✅ Implement proper error handling
- ✅ Monitor connection health with heartbeats
- ✅ Use exponential backoff for reconnections
- ✅ Validate all incoming data
- ✅ Clean up resources properly
- ✅ Implement rate limiting
- ✅ Use HTTP/2 when possible

### Don'ts
- ❌ Send sensitive data in query parameters
- ❌ Ignore error events
- ❌ Create unlimited reconnection attempts
- ❌ Process large responses synchronously
- ❌ Store tokens in localStorage
- ❌ Skip input validation
- ❌ Assume connection will stay open forever

## Monitoring and Metrics

### Client-Side Metrics

```javascript
class SSEMetrics {
  constructor() {
    this.metrics = {
      connections: 0,
      reconnections: 0,
      errors: 0,
      totalEvents: 0,
      averageResponseTime: 0,
      responseTimes: []
    };
  }
  
  recordConnection() {
    this.metrics.connections++;
  }
  
  recordReconnection() {
    this.metrics.reconnections++;
  }
  
  recordError() {
    this.metrics.errors++;
  }
  
  recordEvent(responseTime) {
    this.metrics.totalEvents++;
    this.metrics.responseTimes.push(responseTime);
    this.updateAverageResponseTime();
  }
  
  updateAverageResponseTime() {
    const times = this.metrics.responseTimes;
    this.metrics.averageResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      errorRate: this.metrics.errors / this.metrics.connections,
      reconnectionRate: this.metrics.reconnections / this.metrics.connections
    };
  }
}

// Usage
const metrics = new SSEMetrics();

// Track metrics in event handlers
eventSource.onopen = () => {
  metrics.recordConnection();
};

eventSource.onerror = () => {
  metrics.recordError();
};

eventSource.addEventListener('result', (event) => {
  metrics.recordEvent(Date.now() - startTime);
});
```

This comprehensive SSE implementation guide provides developers with everything needed to successfully integrate with Task MCP's SSE endpoints, including working code examples, troubleshooting guidance, and best practices.