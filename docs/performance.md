# Performance Optimization Guide

_Last updated: 2025-10-25_

## Overview

This guide covers performance optimization strategies for Task MCP HTTP server, including benchmarking, monitoring, and optimization techniques for both development and production environments.

## Performance Metrics

### Key Performance Indicators (KPIs)

| Metric | Target | Description |
|--------|--------|-------------|
| Response Time | < 100ms (95th percentile) | Tool execution response time |
| Throughput | > 1000 req/sec | Requests per second capacity |
| Memory Usage | < 512MB | RSS memory consumption |
| CPU Usage | < 70% | Average CPU utilization |
| Error Rate | < 0.1% | Request error percentage |
| Connection Time | < 50ms | Time to establish connection |
| SSE Latency | < 25ms | Event streaming latency |

### Monitoring Dashboard

```typescript
interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  activeConnections: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage: {
    user: number;
    system: number;
    idle: number;
  };
}
```

## Benchmarking

### Load Testing Script

```javascript
// test/load/sse-load-test.js
import { EventSource } from 'eventsource';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';

class SSELoadTester {
  constructor(baseUrl, authToken, concurrency = 10) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.concurrency = concurrency;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errors: []
    };
  }

  async runLoadTest(duration = 60000) {
    console.log(`Starting load test: ${concurrency} concurrent connections for ${duration}ms`);
    
    const startTime = performance.now();
    const promises = [];
    
    for (let i = 0; i < this.concurrency; i++) {
      promises.push(this.runSingleConnection(startTime, duration));
    }
    
    await Promise.all(promises);
    
    this.generateReport();
  }

  async runSingleConnection(startTime, duration) {
    const connectionId = Math.random().toString(36).substring(7);
    let requestCount = 0;
    
    while (performance.now() - startTime < duration) {
      try {
        const requestStart = performance.now();
        
        await this.makeSSERequest(connectionId, requestCount);
        
        const requestTime = performance.now() - requestStart;
        this.metrics.responseTimes.push(requestTime);
        this.metrics.successfulRequests++;
        
      } catch (error) {
        this.metrics.failedRequests++;
        this.metrics.errors.push({
          connectionId,
          error: error.message,
          timestamp: performance.now()
        });
      }
      
      this.metrics.totalRequests++;
      requestCount++;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async makeSSERequest(connectionId, requestCount) {
    return new Promise((resolve, reject) => {
      const requestId = `${connectionId}-${requestCount}`;
      const startTime = performance.now();
      
      const postData = JSON.stringify({
        tool: 'changes.active',
        input: {},
        apiVersion: '1.0.0'
      });
      
      const options = {
        hostname: new URL(this.baseUrl).hostname,
        port: new URL(this.baseUrl).port || 80,
        path: '/sse',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
          'Accept': 'text/event-stream',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = require('http').request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
          
          // Check for completion
          if (data.includes('event: result') || data.includes('event: error')) {
            const endTime = performance.now();
            resolve(endTime - startTime);
          }
        });
        
        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  generateReport() {
    const responseTimes = this.metrics.responseTimes.sort((a, b) => a - b);
    const total = this.metrics.totalRequests;
    
    const report = {
      summary: {
        totalRequests: total,
        successfulRequests: this.metrics.successfulRequests,
        failedRequests: this.metrics.failedRequests,
        successRate: (this.metrics.successfulRequests / total * 100).toFixed(2) + '%',
        errorRate: (this.metrics.failedRequests / total * 100).toFixed(2) + '%'
      },
      responseTime: {
        average: (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) + 'ms',
        minimum: responseTimes[0].toFixed(2) + 'ms',
        maximum: responseTimes[responseTimes.length - 1].toFixed(2) + 'ms',
        p50: responseTimes[Math.floor(responseTimes.length * 0.5)].toFixed(2) + 'ms',
        p95: responseTimes[Math.floor(responseTimes.length * 0.95)].toFixed(2) + 'ms',
        p99: responseTimes[Math.floor(responseTimes.length * 0.99)].toFixed(2) + 'ms'
      },
      throughput: {
        requestsPerSecond: (total / 60).toFixed(2)
      },
      errors: this.metrics.errors.slice(0, 10) // First 10 errors
    };
    
    console.log('\n=== Load Test Report ===');
    console.log(JSON.stringify(report, null, 2));
  }
}

// Usage
const tester = new SSELoadTester('http://localhost:8443', 'test-token', 20);
tester.runLoadTest(60000); // 1 minute test
```

### Benchmarking with Artillery

```yaml
# artillery-config.yml
config:
  target: 'http://localhost:8443'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Load test"
    - duration: 60
      arrivalRate: 100
      name: "Stress test"

scenarios:
  - name: "SSE Tool Execution"
    weight: 70
    flow:
      - post:
          url: "/sse"
          headers:
            Content-Type: "application/json"
            Authorization: "Bearer test-token"
            Accept: "text/event-stream"
          json:
            tool: "changes.active"
            input: {}
            apiVersion: "1.0.0"
          capture:
            - json: "$.result"
              as: "result"

  - name: "NDJSON Tool Execution"
    weight: 30
    flow:
      - post:
          url: "/mcp"
          headers:
            Content-Type: "application/json"
            Authorization: "Bearer test-token"
            Accept: "application/x-ndjson"
          json:
            tool: "changes.active"
            input: {}
            apiVersion: "1.0.0"
```

### Running Benchmarks

```bash
# Install Artillery
npm install -g artillery

# Run load test
artillery run artillery-config.yml

# Run with custom output
artillery run artillery-config.yml --output results.json

# Generate HTML report
artillery report results.json --output report.html
```

## Performance Optimization Strategies

### 1. Connection Management

#### Connection Pooling

```typescript
import { Agent } from 'undici';

class OptimizedHttpClient {
  private agent: Agent;
  
  constructor() {
    this.agent = new Agent({
      connections: 100,           // Max concurrent connections
      keepAliveTimeout: 60000,    // Keep connections alive for 60s
      keepAliveMaxTimeout: 300000, // Max keep-alive time
      headersTimeout: 30000,      // Headers timeout
      bodyTimeout: 30000          // Body timeout
    });
  }

  async makeRequest(url: string, options: RequestInit) {
    return fetch(url, {
      ...options,
      dispatcher: this.agent
    });
  }
}
```

#### HTTP/2 Configuration

```typescript
import { createSecureServer } from 'http2';
import { readFileSync } from 'fs';

const http2Server = createSecureServer({
  cert: readFileSync('./cert.pem'),
  key: readFileSync('./key.pem'),
  allowHTTP1: true, // Support HTTP/1.1 fallback
  maxSessionMemory: 100 * 1024 * 1024, // 100MB per session
  maxConcurrentStreams: 100 // Max concurrent streams per session
});

// Enable HTTP/2 multiplexing for better performance
```

### 2. Memory Optimization

#### Stream Processing

```typescript
class StreamingResponseHandler {
  async handleLargeResponse(reply: FastifyReply, dataGenerator: AsyncGenerator) {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    try {
      for await (const chunk of dataGenerator) {
        // Process chunk immediately, don't buffer
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        // Allow event loop to process other tasks
        await new Promise(resolve => setImmediate(resolve));
      }
    } finally {
      reply.raw.end();
    }
  }
}
```

#### Memory Leak Prevention

```typescript
class MemoryManager {
  private connections = new Map<string, any>();
  private readonly maxConnections = 1000;
  
  registerConnection(id: string, connection: any) {
    if (this.connections.size >= this.maxConnections) {
      // Remove oldest connection
      const oldestId = this.connections.keys().next().value;
      this.cleanupConnection(oldestId);
    }
    
    this.connections.set(id, {
      connection,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
  }
  
  cleanupConnection(id: string) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.connection.destroy();
      this.connections.delete(id);
    }
  }
  
  // Periodic cleanup of idle connections
  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      const idleTimeout = 300000; // 5 minutes
      
      for (const [id, conn] of this.connections) {
        if (now - conn.lastActivity > idleTimeout) {
          this.cleanupConnection(id);
        }
      }
    }, 60000); // Check every minute
  }
}
```

### 3. CPU Optimization

#### Worker Threads

```typescript
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: any[] = [];
  
  constructor(private poolSize: number = require('os').cpus().length) {
    this.initializeWorkers();
  }
  
  private initializeWorkers() {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(__filename);
      
      worker.on('message', (result) => {
        this.availableWorkers.push(worker);
        
        // Process next task in queue
        if (this.taskQueue.length > 0) {
          const nextTask = this.taskQueue.shift();
          worker.postMessage(nextTask);
        }
      });
      
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }
  
  async executeTask(task: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const wrappedTask = {
        ...task,
        resolve,
        reject
      };
      
      if (this.availableWorkers.length > 0) {
        const worker = this.availableWorkers.pop()!;
        worker.postMessage(wrappedTask);
      } else {
        this.taskQueue.push(wrappedTask);
      }
    });
  }
}

// Worker thread code
if (!isMainThread) {
  parentPort.on('message', async (task) => {
    try {
      const result = await processTask(task);
      parentPort.postMessage({ type: 'success', result, taskId: task.taskId });
    } catch (error) {
      parentPort.postMessage({ type: 'error', error: error.message, taskId: task.taskId });
    }
  });
}
```

#### Tool Execution Optimization

```typescript
class OptimizedToolExecutor {
  private toolCache = new Map<string, any>();
  private executionQueue = new Map<string, Promise<any>>();
  
  async executeTool(toolName: string, input: any): Promise<any> {
    // Check cache first
    const cacheKey = this.generateCacheKey(toolName, input);
    if (this.toolCache.has(cacheKey)) {
      return this.toolCache.get(cacheKey);
    }
    
    // Prevent duplicate executions
    if (this.executionQueue.has(cacheKey)) {
      return this.executionQueue.get(cacheKey);
    }
    
    const executionPromise = this.performExecution(toolName, input);
    this.executionQueue.set(cacheKey, executionPromise);
    
    try {
      const result = await executionPromise;
      
      // Cache result (with TTL)
      this.toolCache.set(cacheKey, result);
      setTimeout(() => {
        this.toolCache.delete(cacheKey);
      }, 300000); // 5 minutes cache
      
      return result;
    } finally {
      this.executionQueue.delete(cacheKey);
    }
  }
  
  private async performExecution(toolName: string, input: any): Promise<any> {
    // Implement actual tool execution
    // This could involve calling external services, databases, etc.
    return { result: `Executed ${toolName} with ${JSON.stringify(input)}` };
  }
  
  private generateCacheKey(toolName: string, input: any): string {
    const hash = require('crypto')
      .createHash('md5')
      .update(`${toolName}:${JSON.stringify(input)}`)
      .digest('hex');
    
    return hash;
  }
}
```

### 4. Caching Strategies

#### Response Caching

```typescript
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize = 1000;
  private readonly defaultTTL = 300000; // 5 minutes
  
  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  set(key: string, data: any, ttl?: number): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }
  
  // LRU eviction
  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
```

#### Redis Integration

```typescript
import Redis from 'ioredis';

class DistributedCache {
  private redis: Redis;
  
  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
  }
  
  async get(key: string): Promise<any | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }
  
  async set(key: string, data: any, ttlSeconds: number = 300): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }
  
  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache invalidate error:', error);
    }
  }
}
```

### 5. Database Optimization

#### Connection Pooling

```typescript
import { Pool } from 'pg';

class DatabaseManager {
  private pool: Pool;
  
  constructor(config: any) {
    this.pool = new Pool({
      ...config,
      max: 20,              // Maximum connections
      min: 5,               // Minimum connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  
  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      const start = Date.now();
      const result = await client.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query (${duration}ms):`, text);
      }
      
      return result;
    } finally {
      client.release();
    }
  }
  
  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

#### Query Optimization

```typescript
class OptimizedQueries {
  // Use prepared statements for better performance
  private static readonly GET_CHANGE_SQL = `
    SELECT id, title, slug, status, created_at, updated_at
    FROM changes 
    WHERE slug = $1 AND status != 'archived'
  `;
  
  // Batch operations
  async getMultipleChanges(slugs: string[]): Promise<any[]> {
    const placeholders = slugs.map((_, i) => `$${i + 1}`).join(', ');
    const query = `
      SELECT id, title, slug, status, created_at, updated_at
      FROM changes 
      WHERE slug IN (${placeholders}) AND status != 'archived'
    `;
    
    return this.db.query(query, slugs);
  }
  
  // Pagination for large datasets
  async getChangesPaginated(page: number, limit: number): Promise<any> {
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT id, title, slug, status, created_at, updated_at
      FROM changes 
      WHERE status != 'archived'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    return this.db.query(query, [limit, offset]);
  }
}
```

## Monitoring and Alerting

### Performance Monitoring

```typescript
class PerformanceMonitor {
  private metrics = {
    requestCount: 0,
    responseTimeSum: 0,
    responseTimeMax: 0,
    responseTimeMin: Infinity,
    errorCount: 0,
    activeConnections: 0
  };
  
  recordRequest(responseTime: number, isError: boolean = false): void {
    this.metrics.requestCount++;
    this.metrics.responseTimeSum += responseTime;
    this.metrics.responseTimeMax = Math.max(this.metrics.responseTimeMax, responseTime);
    this.metrics.responseTimeMin = Math.min(this.metrics.responseTimeMin, responseTime);
    
    if (isError) {
      this.metrics.errorCount++;
    }
  }
  
  getMetrics(): any {
    const count = this.metrics.requestCount;
    
    return {
      requestCount: count,
      averageResponseTime: count > 0 ? this.metrics.responseTimeSum / count : 0,
      maxResponseTime: this.metrics.responseTimeMax,
      minResponseTime: this.metrics.responseTimeMin === Infinity ? 0 : this.metrics.responseTimeMin,
      errorRate: count > 0 ? this.metrics.errorCount / count : 0,
      activeConnections: this.metrics.activeConnections
    };
  }
  
  resetMetrics(): void {
    this.metrics = {
      requestCount: 0,
      responseTimeSum: 0,
      responseTimeMax: 0,
      responseTimeMin: Infinity,
      errorCount: 0,
      activeConnections: this.metrics.activeConnections
    };
  }
}
```

### Prometheus Metrics

```typescript
import { register, Counter, Histogram, Gauge } from 'prom-client';

class PrometheusMetrics {
  private httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
  });
  
  private httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
  });
  
  private activeConnections = new Gauge({
    name: 'sse_active_connections',
    help: 'Number of active SSE connections'
  });
  
  private toolExecutionDuration = new Histogram({
    name: 'tool_execution_duration_seconds',
    help: 'Duration of tool executions in seconds',
    labelNames: ['tool'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  });
  
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
    this.httpRequestDuration.observe({ method, route }, duration / 1000);
  }
  
  setActiveConnections(count: number): void {
    this.activeConnections.set(count);
  }
  
  recordToolExecution(tool: string, duration: number): void {
    this.toolExecutionDuration.observe({ tool }, duration / 1000);
  }
  
  getMetrics(): string {
    return register.metrics();
  }
}
```

### Health Checks

```typescript
class HealthChecker {
  private checks = new Map<string, () => Promise<boolean>>();
  
  addCheck(name: string, checkFn: () => Promise<boolean>): void {
    this.checks.set(name, checkFn);
  }
  
  async runHealthChecks(): Promise<{ status: string; checks: any }> {
    const results: any = {};
    let allHealthy = true;
    
    for (const [name, checkFn] of this.checks) {
      try {
        const startTime = Date.now();
        const isHealthy = await checkFn();
        const duration = Date.now() - startTime;
        
        results[name] = {
          status: isHealthy ? 'pass' : 'fail',
          duration,
          timestamp: new Date().toISOString()
        };
        
        if (!isHealthy) {
          allHealthy = false;
        }
      } catch (error) {
        results[name] = {
          status: 'fail',
          error: error.message,
          timestamp: new Date().toISOString()
        };
        allHealthy = false;
      }
    }
    
    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks: results
    };
  }
}
```

## Production Optimization

### 1. Environment Configuration

```bash
# Production performance settings
NODE_ENV=production
UV_THREADPOOL_SIZE=16          # Thread pool size
NODE_OPTIONS=--max-old-space-size=1024  # Max heap size

# HTTP server optimizations
HTTP_KEEP_ALIVE_TIMEOUT=65000  # Keep-alive timeout
HTTP_HEADERS_TIMEOUT=60000     # Headers timeout
HTTP_BODY_TIMEOUT=30000        # Body timeout

# Connection limits
MAX_CONCURRENT_CONNECTIONS=1000
MAX_CONNECTIONS_PER_IP=100
```

### 2. Clustering

```typescript
import cluster from 'cluster';
import os from 'os';

class ClusterManager {
  private workers: any[] = [];
  
  startCluster(workerCount: number = os.cpus().length): void {
    if (cluster.isMaster) {
      console.log(`Master ${process.pid} is running`);
      
      // Fork workers
      for (let i = 0; i < workerCount; i++) {
        this.forkWorker();
      }
      
      // Handle worker crashes
      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died with code ${code}`);
        this.forkWorker(); // Replace dead worker
      });
      
      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.log('Master received SIGTERM, shutting down gracefully');
        this.shutdownWorkers();
      });
      
    } else {
      // Worker process
      this.startWorker();
    }
  }
  
  private forkWorker(): void {
    const worker = cluster.fork();
    this.workers.push(worker);
    
    worker.on('online', () => {
      console.log(`Worker ${worker.process.pid} is online`);
    });
  }
  
  private startWorker(): void {
    // Start the HTTP server in worker
    require('./index.js');
  }
  
  private shutdownWorkers(): void {
    for (const worker of this.workers) {
      worker.kill('SIGTERM');
    }
    
    setTimeout(() => {
      process.exit(0);
    }, 5000);
  }
}

// Start cluster
const clusterManager = new ClusterManager();
clusterManager.startCluster();
```

### 3. Load Balancing

#### Nginx Configuration

```nginx
upstream task_mcp_backend {
    least_conn;
    server 127.0.0.1:8443 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8444 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8445 max_fails=3 fail_timeout=30s;
    
    # Health check
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL configuration
    ssl_certificate /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Performance optimizations
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain application/json application/javascript text/css;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
    limit_req_zone $binary_remote_addr zone=sse:10m rate=10r/s;
    
    location /sse {
        limit_req zone=sse burst=20 nodelay;
        
        proxy_pass https://task_mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE specific optimizations
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    
    location /mcp {
        limit_req zone=api burst=40 nodelay;
        
        proxy_pass https://task_mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

## Performance Testing Checklist

### Pre-Deployment

- [ ] Load testing with expected traffic patterns
- [ ] Memory leak detection
- [ ] CPU profiling under load
- [ ] Database query optimization
- [ ] SSL/TLS performance testing
- [ ] Cache effectiveness validation
- [ ] Error handling under stress
- [ ] Graceful degradation testing

### Production Monitoring

- [ ] Response time monitoring (95th percentile < 100ms)
- [ ] Error rate monitoring (< 0.1%)
- [ ] Memory usage monitoring (< 512MB)
- [ ] CPU usage monitoring (< 70%)
- [ ] Connection count monitoring
- [ ] Database performance monitoring
- [ ] Cache hit ratio monitoring (> 80%)
- [ ] SSL/TLS certificate expiration monitoring

### Performance Alerts

```yaml
# Prometheus alerting rules
groups:
  - name: performance
    rules:
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "95th percentile response time is high"
          
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Error rate is above 1%"
          
      - alert: HighMemoryUsage
        expr: nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Memory usage is above 90%"
```

This comprehensive performance optimization guide provides all the necessary tools, strategies, and monitoring techniques to ensure optimal performance of Task MCP HTTP server in both development and production environments.