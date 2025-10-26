#!/usr/bin/env node

/**
 * SSE Load Testing Script
 * Tests concurrent Server-Sent Events connections
 */

import { performance } from 'perf_hooks';
import { EventSource } from 'eventsource';
import { createHash } from 'crypto';

// Test configuration
const config = {
  serverUrl: process.env.SERVER_URL || 'http://localhost:8443',
  authToken: process.env.AUTH_TOKEN || 'test-token',
  concurrentConnections: parseInt(process.env.CONCURRENT_CONNECTIONS) || 50,
  testDuration: parseInt(process.env.TEST_DURATION) || 300, // 5 minutes
  requestInterval: parseInt(process.env.REQUEST_INTERVAL) || 1000, // 1 second between requests
  toolName: process.env.TOOL_NAME || 'change.open',
  toolInput: JSON.parse(process.env.TOOL_INPUT || '{"slug": "test-change"}')
};

// Test metrics
const metrics = {
  totalConnections: 0,
  successfulConnections: 0,
  failedConnections: 0,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalEvents: 0,
  averageLatency: 0,
  maxLatency: 0,
  minLatency: Infinity,
  connectionErrors: [],
  requestLatencies: [],
  memoryUsage: [],
  startTimestamp: null,
  endTimestamp: null
};

/**
 * Create a unique client ID
 */
function createClientId(index) {
  return `client-${index}-${Date.now()}`;
}

/**
 * Create SSE connection
 */
function createSSEConnection(clientId) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const url = `${config.serverUrl}/sse`;
    
    const eventData = {
      tool: config.toolName,
      input: config.toolInput,
      apiVersion: '1.0.0'
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`,
        'X-Client-ID': clientId
      },
      body: JSON.stringify(eventData)
    };

    // Use fetch for SSE connections
    fetch(url, options)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const latency = performance.now() - startTime;
        metrics.successfulConnections++;
        metrics.totalConnections++;
        
        // Track latency
        metrics.requestLatencies.push(latency);
        metrics.maxLatency = Math.max(metrics.maxLatency, latency);
        metrics.minLatency = Math.min(metrics.minLatency, latency);

        resolve({
          clientId,
          response,
          latency,
          startTime
        });
      })
      .catch(error => {
        metrics.failedConnections++;
        metrics.totalConnections++;
        metrics.connectionErrors.push({
          clientId,
          error: error.message,
          timestamp: Date.now()
        });
        reject(error);
      });
  });
}

/**
 * Handle SSE events
 */
function handleSSEEvents(connection, testStartTime) {
  return new Promise((resolve, reject) => {
    const { clientId, response } = connection;
    let eventCount = 0;
    let lastEventTime = Date.now();
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEvents = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              eventCount++;
              metrics.totalEvents++;
              lastEventTime = Date.now();

              // Parse SSE event
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  
                  // Track request completion
                  if (data.result || data.error) {
                    const requestLatency = Date.now() - testStartTime;
                    metrics.successfulRequests++;
                    metrics.totalRequests++;
                  }
                } catch (parseError) {
                  // Ignore JSON parse errors for heartbeat events
                }
              }
            }
          }
        }

        resolve({
          clientId,
          eventCount,
          duration: Date.now() - testStartTime
        });
      } catch (error) {
        metrics.failedRequests++;
        reject(error);
      }
    };

    processEvents();
  });
}

/**
 * Run a single client test
 */
async function runClientTest(clientIndex, testDuration) {
  const clientId = createClientId(clientIndex);
  const testStartTime = Date.now();
  
  try {
    // Create connection
    const connection = await createSSEConnection(clientId);
    
    // Handle events for the test duration
    const eventPromise = handleSSEEvents(connection, testStartTime);
    const timeoutPromise = new Promise(resolve => 
      setTimeout(resolve, testDuration)
    );

    // Wait for either completion or timeout
    await Promise.race([eventPromise, timeoutPromise]);
    
    // Clean up connection
    if (connection.response.body) {
      connection.response.body.cancel();
    }

    return {
      clientId,
      success: true,
      events: metrics.totalEvents,
      latency: connection.latency
    };
  } catch (error) {
    return {
      clientId,
      success: false,
      error: error.message
    };
  }
}

/**
 * Monitor system resources
 */
function startResourceMonitoring() {
  const interval = setInterval(() => {
    const memUsage = process.memoryUsage();
    metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    });
  }, 5000); // Every 5 seconds

  return () => clearInterval(interval);
}

/**
 * Generate test report
 */
function generateReport() {
  const duration = metrics.endTimestamp - metrics.startTimestamp;
  const avgLatency = metrics.requestLatencies.length > 0 
    ? metrics.requestLatencies.reduce((a, b) => a + b, 0) / metrics.requestLatencies.length 
    : 0;

  const report = {
    testType: 'sse-load-test',
    config,
    duration,
    timestamp: new Date().toISOString(),
    summary: {
      totalConnections: metrics.totalConnections,
      successfulConnections: metrics.successfulConnections,
      failedConnections: metrics.failedConnections,
      connectionSuccessRate: metrics.totalConnections > 0 
        ? (metrics.successfulConnections / metrics.totalConnections * 100).toFixed(2) + '%'
        : '0%',
      totalRequests: metrics.totalRequests,
      successfulRequests: metrics.successfulRequests,
      failedRequests: metrics.failedRequests,
      requestSuccessRate: metrics.totalRequests > 0
        ? (metrics.successfulRequests / metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      totalEvents: metrics.totalEvents,
      averageLatency: avgLatency.toFixed(2) + 'ms',
      maxLatency: metrics.maxLatency.toFixed(2) + 'ms',
      minLatency: metrics.minLatency === Infinity ? '0ms' : metrics.minLatency.toFixed(2) + 'ms'
    },
    performance: {
      connectionsPerSecond: (metrics.totalConnections / (duration / 1000)).toFixed(2),
      eventsPerSecond: (metrics.totalEvents / (duration / 1000)).toFixed(2),
      requestsPerSecond: (metrics.totalRequests / (duration / 1000)).toFixed(2)
    },
    resources: {
      peakMemoryUsage: metrics.memoryUsage.length > 0 
        ? Math.max(...metrics.memoryUsage.map(m => m.heapUsed))
        : 0,
      averageMemoryUsage: metrics.memoryUsage.length > 0
        ? metrics.memoryUsage.reduce((sum, m) => sum + m.heapUsed, 0) / metrics.memoryUsage.length
        : 0
    },
    errors: metrics.connectionErrors.slice(0, 10), // Limit to first 10 errors
    latencyDistribution: calculateLatencyDistribution()
  };

  return report;
}

/**
 * Calculate latency distribution
 */
function calculateLatencyDistribution() {
  if (metrics.requestLatencies.length === 0) return {};

  const sorted = [...metrics.requestLatencies].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    p50: sorted[Math.floor(len * 0.5)].toFixed(2) + 'ms',
    p90: sorted[Math.floor(len * 0.9)].toFixed(2) + 'ms',
    p95: sorted[Math.floor(len * 0.95)].toFixed(2) + 'ms',
    p99: sorted[Math.floor(len * 0.99)].toFixed(2) + 'ms'
  };
}

/**
 * Main test execution
 */
async function runLoadTest() {
  console.log('🚀 Starting SSE Load Test');
  console.log(`📊 Configuration: ${JSON.stringify(config, null, 2)}`);
  
  metrics.startTimestamp = Date.now();
  const stopResourceMonitoring = startResourceMonitoring();

  try {
    // Create concurrent connections
    const clientPromises = [];
    
    console.log(`🔗 Creating ${config.concurrentConnections} concurrent connections...`);
    
    for (let i = 0; i < config.concurrentConnections; i++) {
      const clientPromise = runClientTest(i, config.testDuration);
      clientPromises.push(clientPromise);
      
      // Stagger connection creation to avoid overwhelming the server
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`⏱️  Test running for ${config.testDuration / 1000} seconds...`);
    
    // Wait for all clients to complete
    const results = await Promise.allSettled(clientPromises);
    
    metrics.endTimestamp = Date.now();
    stopResourceMonitoring();

    // Analyze results
    const successfulClients = results.filter(r => r.status === 'fulfilled').length;
    const failedClients = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Test completed!`);
    console.log(`📈 Successful clients: ${successfulClients}/${config.concurrentConnections}`);
    console.log(`❌ Failed clients: ${failedClients}/${config.concurrentConnections}`);

    // Generate and display report
    const report = generateReport();
    
    console.log('\n📊 Test Report:');
    console.log('===============');
    console.log(JSON.stringify(report, null, 2));

    // Save report to file
    const fs = await import('fs/promises');
    const reportFile = `sse-load-test-${Date.now()}.json`;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${reportFile}`);

    // Exit with appropriate code
    process.exit(failedClients > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  metrics.endTimestamp = Date.now();
  
  const report = generateReport();
  console.log('\n📊 Partial Test Report:');
  console.log('=====================');
  console.log(JSON.stringify(report, null, 2));
  
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test terminated');
  process.exit(1);
});

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runLoadTest();
}

export { runLoadTest, generateReport };