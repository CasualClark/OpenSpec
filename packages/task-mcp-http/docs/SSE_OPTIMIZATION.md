# Server-Sent Events (SSE) Optimization Guide

This guide covers the optimization of Server-Sent Events for the Task MCP HTTP server, ensuring reliable, high-performance real-time streaming.

## Table of Contents

1. [SSE Overview](#sse-overview)
2. [Nginx SSE Configuration](#nginx-sse-configuration)
3. [Backend SSE Implementation](#backend-sse-implementation)
4. [Performance Optimization](#performance-optimization)
5. [Reliability and Error Handling](#reliability-and-error-handling)
6. [Monitoring and Debugging](#monitoring-and-debugging)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## SSE Overview

Server-Sent Events (SSE) provide a standardized way for servers to push real-time updates to clients over HTTP. Unlike WebSockets, SSE is unidirectional (server-to-client) and works over standard HTTP.

### Key Characteristics

- **Unidirectional**: Server pushes data to client
- **Text-based**: Uses UTF-8 encoded text
- **Automatic reconnection**: Built-in retry mechanism
- **Event IDs**: Clients can track last received event
- **Simple API**: Uses standard EventSource API in browsers

### Message Format

```
data: This is a message\n
id: 123\n
event: update\n
retry: 2000\n
\n
```

## Nginx SSE Configuration

### Core SSE Configuration

The Nginx configuration for SSE endpoints is located in `nginx/conf.d/sse.conf`:

```nginx
location /sse {
    # Rate limiting for SSE endpoints
    limit_req zone=sse_burst burst=5 nodelay;
    limit_conn conn_limit_per_ip 10;
    
    # SSE optimization - disable buffering completely
    proxy_buffering off;
    proxy_cache off;
    proxy_store off;
    
    # SSE headers
    proxy_set_header Connection "";
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    
    # Disable acceleration buffering for SSE
    proxy_set_header X-Accel-Buffering no;
    
    # Extended timeouts for long-lived SSE connections
    proxy_connect_timeout 30s;
    proxy_send_timeout 3600s;  # 1 hour for SSE streams
    proxy_read_timeout 3600s;  # 1 hour for SSE streams
    
    # Keep-alive settings
    proxy_set_header Proxy-Connection "keep-alive";
    proxy_set_header Keep-Alive "timeout=300, max=1000";
    
    # Chunked transfer encoding for streaming
    proxy_set_header Transfer-Encoding "chunked";
    
    # Content-type handling
    proxy_set_header Accept "text/event-stream, application/json, */*";
    
    # SSE-specific proxy settings
    proxy_ignore_client_abort on;
    proxy_ignore_headers Cache-Control Expires Set-Cookie;
    
    # Pass to SSE-specific upstream
    proxy_pass http://task_mcp_sse_backend;
    
    # Error handling for SSE
    proxy_intercept_errors on;
    error_page 502 503 504 = /sse-error;
}
```

### SSE Error Handling

```nginx
location = /sse-error {
    internal;
    add_header Content-Type "text/event-stream";
    add_header Cache-Control "no-cache";
    add_header Connection "keep-alive";
    
    return 200 "event: error\ndata: {\"code\":\"STREAM_ERROR\",\"message\":\"Connection to backend failed\",\"retry\":5000}\n\n";
}
```

### Key Configuration Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `proxy_buffering off` | Off | Disables response buffering for immediate streaming |
| `proxy_cache off` | Off | Prevents caching of SSE streams |
| `proxy_send_timeout` | 3600s | Allows long-lived SSE connections |
| `proxy_read_timeout` | 3600s | Prevents timeout during streaming |
| `X-Accel-Buffering no` | Header | Disables Nginx acceleration buffering |
| `proxy_ignore_client_abort on` | On | Keeps connection alive even if client disconnects |

## Backend SSE Implementation

### Fastify SSE Route

```typescript
// SSE route handler with optimization
export async function sseRouteHandler(request: FastifyRequest, reply: FastifyReply) {
    const { server } = request as any;
    const { config, auditLogger } = server;
    
    // Set SSE headers
    reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
    });
    
    // Disable compression for SSE
    reply.header('Content-Encoding', 'identity');
    
    const clientId = request.id;
    const startTime = Date.now();
    
    // Log SSE connection
    auditLogger.logEvent('sse_connection_started', {
        clientId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
    });
    
    // Heartbeat interval
    const heartbeatInterval = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`);
    }, 30000); // 30 seconds
    
    // Handle client disconnect
    request.raw.on('close', () => {
        clearInterval(heartbeatInterval);
        const duration = Date.now() - startTime;
        
        auditLogger.logEvent('sse_connection_ended', {
            clientId,
            duration,
            ip: request.ip,
        });
    });
    
    // Main SSE loop
    try {
        while (!reply.raw.destroyed) {
            // Process SSE events
            const event = await getNextSSEEvent(clientId);
            
            if (event) {
                const sseMessage = formatSSEMessage(event);
                reply.raw.write(sseMessage);
            }
            
            // Yield to event loop
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        // Send error event
        const errorMessage = formatSSEMessage({
            event: 'error',
            data: {
                code: 'STREAM_ERROR',
                message: 'Internal server error',
                retry: 5000,
            },
        });
        reply.raw.write(errorMessage);
    } finally {
        clearInterval(heartbeatInterval);
    }
}
```

### SSE Message Formatting

```typescript
function formatSSEMessage(event: SSEEvent): string {
    let message = '';
    
    if (event.id) {
        message += `id: ${event.id}\n`;
    }
    
    if (event.event) {
        message += `event: ${event.event}\n`;
    }
    
    if (event.retry) {
        message += `retry: ${event.retry}\n`;
    }
    
    // Handle multi-line data
    if (event.data) {
        const dataStr = typeof event.data === 'string' 
            ? event.data 
            : JSON.stringify(event.data);
        
        dataStr.split('\n').forEach(line => {
            message += `data: ${line}\n`;
        });
    }
    
    message += '\n'; // End of message
    return message;
}
```

## Performance Optimization

### Connection Pooling

```nginx
# Upstream configuration for SSE
upstream task_mcp_sse_backend {
    least_conn;
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s weight=1;
    
    # Longer keepalive for SSE connections
    keepalive 64;
    keepalive_requests 50;
    keepalive_timeout 300s;
}
```

### Memory Management

```typescript
// Implement backpressure handling
class SSEConnectionManager {
    private connections = new Map<string, SSEConnection>();
    private maxConnections = 10000;
    private maxQueueSize = 100;
    
    addConnection(id: string, connection: SSEConnection): boolean {
        if (this.connections.size >= this.maxConnections) {
            return false;
        }
        
        this.connections.set(id, connection);
        return true;
    }
    
    removeConnection(id: string): void {
        const connection = this.connections.get(id);
        if (connection) {
            connection.destroy();
            this.connections.delete(id);
        }
    }
    
    broadcast(event: SSEEvent): void {
        const message = formatSSEMessage(event);
        
        for (const [id, connection] of this.connections) {
            if (connection.queue.size < this.maxQueueSize) {
                connection.write(message);
            } else {
                // Drop connection if queue is full
                this.removeConnection(id);
            }
        }
    }
}
```

### Rate Limiting

```nginx
# Define SSE-specific rate limiting
limit_req_zone $binary_remote_addr zone=sse_connections:10m rate=2r/s;
limit_req_zone $binary_remote_addr zone=sse_events:10m rate=10r/s;

# Apply to SSE endpoint
location /sse {
    limit_req zone=sse_connections burst=5 nodelay;
    
    # Event rate limiting handled by backend
    proxy_set_header X-SSE-Rate-Limit "10r/s";
}
```

### Compression Considerations

```nginx
# Disable compression for SSE
location /sse {
    gzip off;
    brotli off;
    
    # Ensure no compression
    proxy_set_header Accept-Encoding "identity";
}
```

## Reliability and Error Handling

### Automatic Reconnection

```javascript
// Client-side implementation
class SSEClient {
    constructor(url, options = {}) {
        this.url = url;
        this.options = {
            maxRetries: 10,
            retryDelay: 1000,
            maxRetryDelay: 30000,
            ...options,
        };
        this.retryCount = 0;
        this.connect();
    }
    
    connect() {
        this.eventSource = new EventSource(this.url);
        
        this.eventSource.onopen = () => {
            console.log('SSE connection opened');
            this.retryCount = 0;
        };
        
        this.eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            this.handleReconnection();
        };
        
        this.eventSource.onmessage = (event) => {
            this.handleMessage(event);
        };
    }
    
    handleReconnection() {
        if (this.retryCount < this.options.maxRetries) {
            const delay = Math.min(
                this.options.retryDelay * Math.pow(2, this.retryCount),
                this.options.maxRetryDelay
            );
            
            setTimeout(() => {
                this.retryCount++;
                this.connect();
            }, delay);
        }
    }
    
    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this.onMessage(data);
        } catch (error) {
            console.error('Error parsing SSE message:', error);
        }
    }
}
```

### Backend Error Recovery

```typescript
// Robust error handling for SSE streams
export class SSEStream {
    private isAlive = true;
    private errorCount = 0;
    private maxErrors = 5;
    
    constructor(private response: FastifyReply) {}
    
    async sendEvent(event: SSEEvent): Promise<boolean> {
        try {
            if (!this.isAlive || this.response.raw.destroyed) {
                return false;
            }
            
            const message = formatSSEMessage(event);
            const written = this.response.raw.write(message);
            
            if (written) {
                this.errorCount = 0;
                return true;
            } else {
                this.errorCount++;
                if (this.errorCount >= this.maxErrors) {
                    this.close();
                    return false;
                }
                return false;
            }
        } catch (error) {
            this.errorCount++;
            console.error('Error sending SSE event:', error);
            
            if (this.errorCount >= this.maxErrors) {
                this.close();
            }
            return false;
        }
    }
    
    close(): void {
        this.isAlive = false;
        if (!this.response.raw.destroyed) {
            this.response.raw.end();
        }
    }
}
```

### Health Checks

```typescript
// SSE-specific health check
export async function sseHealthCheck(): Promise<HealthStatus> {
    const status = {
        healthy: true,
        connections: sseManager.getConnectionCount(),
        maxConnections: sseManager.getMaxConnections(),
        averageLatency: sseManager.getAverageLatency(),
        errorRate: sseManager.getErrorRate(),
    };
    
    // Check if error rate is too high
    if (status.errorRate > 0.05) { // 5% error rate
        status.healthy = false;
    }
    
    // Check if connection count is near limit
    if (status.connections > status.maxConnections * 0.9) {
        status.healthy = false;
    }
    
    return status;
}
```

## Monitoring and Debugging

### SSE Metrics

```typescript
// SSE metrics collection
export class SSEMetrics {
    private metrics = {
        connectionsCreated: 0,
        connectionsDestroyed: 0,
        eventsSent: 0,
        errors: 0,
        bytesTransferred: 0,
        averageLatency: 0,
    };
    
    recordConnectionCreated(): void {
        this.metrics.connectionsCreated++;
    }
    
    recordConnectionDestroyed(): void {
        this.metrics.connectionsDestroyed++;
    }
    
    recordEventSent(size: number, latency: number): void {
        this.metrics.eventsSent++;
        this.metrics.bytesTransferred += size;
        this.updateAverageLatency(latency);
    }
    
    recordError(): void {
        this.metrics.errors++;
    }
    
    getMetrics(): SSEMetrics {
        return { ...this.metrics };
    }
    
    private updateAverageLatency(latency: number): void {
        const alpha = 0.1; // Exponential moving average factor
        this.metrics.averageLatency = 
            alpha * latency + (1 - alpha) * this.metrics.averageLatency;
    }
}
```

### Logging Configuration

```nginx
# SSE-specific log format
log_format sse_main '$remote_addr - $remote_user [$time_local] "$request" '
                   '$status $body_bytes_sent "$http_referer" '
                   '"$http_user_agent" "$http_x_forwarded_for" '
                   'rt=$request_time uct="$upstream_connect_time" '
                   'uht="$upstream_header_time" urt="$upstream_response_time" '
                   'rid="$request_id" '
                   'sse_duration=$connection_requests '
                   'bytes_sent=$body_bytes_sent '
                   'connection="$connection" '
                   'accept="$http_accept"';

# Apply to SSE endpoint
location /sse {
    access_log /var/log/nginx/sse-access.log sse_main;
}
```

### Debug Tools

```bash
# Test SSE endpoint with curl
curl -N -H "Accept: text/event-stream" \
     -H "Cache-Control: no-cache" \
     http://localhost/sse

# Monitor SSE connections
ss -tulpn | grep :80

# Check Nginx SSE logs
tail -f /var/log/nginx/sse-access.log

# Monitor backend SSE logs
tail -f /var/log/task-mcp/sse.log

# Test with different connection scenarios
curl -N -H "Accept: text/event-stream" \
     -H "Connection: close" \
     http://localhost/sse
```

## Best Practices

### 1. Connection Management

- **Limit concurrent connections** to prevent resource exhaustion
- **Implement graceful degradation** when approaching limits
- **Use connection pooling** for backend connections
- **Monitor connection lifecycle** for anomalies

### 2. Message Design

- **Keep messages small** (< 1KB) for better performance
- **Use JSON for structured data** with consistent schema
- **Include timestamps** for client-side ordering
- **Use event types** for message categorization

### 3. Error Handling

- **Implement exponential backoff** for reconnections
- **Provide meaningful error messages** to clients
- **Log errors appropriately** for debugging
- **Set reasonable retry intervals**

### 4. Performance

- **Disable compression** for SSE streams
- **Use appropriate timeouts** for long-lived connections
- **Implement backpressure** handling
- **Monitor memory usage** per connection

### 5. Security

- **Validate incoming requests** before establishing SSE
- **Rate limit connections** per IP
- **Use authentication** for sensitive streams
- **Implement CORS** policies correctly

## Troubleshooting

### Common Issues

1. **Connections Drop Intermittently**
   ```bash
   # Check Nginx timeouts
   grep timeout /etc/nginx/nginx.conf
   
   # Check backend keepalive settings
   grep keepalive /etc/nginx/conf.d/upstream.conf
   
   # Monitor connection drops
   tail -f /var/log/nginx/error.log | grep -i "connection"
   ```

2. **High Memory Usage**
   ```bash
   # Check connection count
   ss -tulpn | grep :80 | wc -l
   
   # Monitor memory per connection
   ps aux | grep nginx
   
   # Check for memory leaks
   valgrind --tool=memcheck nginx
   ```

3. **Slow Message Delivery**
   ```bash
   # Check buffering settings
   grep proxy_buffering /etc/nginx/conf.d/sse.conf
   
   # Monitor latency
   curl -w "@curl-format.txt" -N -H "Accept: text/event-stream" http://localhost/sse
   
   # Check backend performance
   top -p $(pgrep node)
   ```

### Debug Commands

```bash
# Test SSE with different headers
curl -v -N -H "Accept: text/event-stream" \
     -H "Cache-Control: no-cache" \
     -H "Connection: keep-alive" \
     http://localhost/sse

# Monitor real-time connections
watch -n 1 'ss -tulpn | grep :80'

# Check Nginx status
curl http://localhost/nginx_status

# Test with simulated load
ab -n 100 -c 10 http://localhost/sse
```

### Performance Testing

```bash
# Load test SSE endpoint
hey -n 1000 -c 50 -H "Accept: text/event-stream" http://localhost/sse

# Test connection limits
for i in {1..100}; do
    curl -N -H "Accept: text/event-stream" http://localhost/sse &
done

# Monitor during load test
htop
iostat -x 1
```

## Additional Resources

- [MDN Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Nginx SSE Configuration](https://www.nginx.com/resources/wiki/start/topics/examples/x-accel/)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [SSE Performance Best Practices](https://web.dev/sse-performance/)