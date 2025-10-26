#!/usr/bin/env node

/**
 * NDJSON Load Testing Script
 * Tests Streamable HTTP (NDJSON) throughput
 */

import { performance } from 'perf_hooks';

// Test configuration
const config = {
  serverUrl: process.env.SERVER_URL || 'http://localhost:8443',
  authToken: process.env.AUTH_TOKEN || 'test-token',
  requestsPerSecond: parseInt(process.env.REQUESTS_PER_SECOND) || 100,
  testDuration: parseInt(process.env.TEST_DURATION) || 120, // 2 minutes
  concurrentClients: parseInt(process.env.CONCURRENT_CLIENTS) || 10,
  toolName: process.env.TOOL_NAME || 'change.open',
  toolInput: JSON.parse(process.env.TOOL_INPUT || '{"slug": "test-change"}')
};

// Test metrics
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalEvents: 0,
  requestLatencies: [],
  eventCounts: [],
  errors: [],
  throughputData: [],
  startTimestamp: null,
  endTimestamp: null
};

/**
 * Make NDJSON request
 */
async function makeNDJSONRequest(clientId, requestId) {
  const startTime = performance.now();
  
  try {
    const url = `${config.serverUrl}/mcp`;
    const eventData = {
      tool: config.toolName,
      input: config.toolInput,
      apiVersion: '1.0.0'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`,
        'X-Client-ID': clientId,
        'X-Request-ID': requestId
      },
      body: JSON.stringify(eventData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Process NDJSON stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    const events = [];

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
          
          try {
            const event = JSON.parse(line);
            events.push(event);
          } catch (parseError) {
            // Log malformed events
            metrics.errors.push({
              clientId,
              requestId,
              error: `Invalid JSON: ${parseError.message}`,
              data: line,
              timestamp: Date.now()
            });
          }
        }
      }
    }

    const latency = performance.now() - startTime;
    metrics.successfulRequests++;
    metrics.totalRequests++;
    metrics.requestLatencies.push(latency);
    metrics.eventCounts.push(eventCount);

    return {
      success: true,
      latency,
      eventCount,
      events,
      clientId,
      requestId
    };

  } catch (error) {
    metrics.failedRequests++;
    metrics.totalRequests++;
    metrics.requestLatencies.push(performance.now() - startTime);
    
    metrics.errors.push({
      clientId,
      requestId,
      error: error.message,
      timestamp: Date.now()
    });

    return {
      success: false,
      error: error.message,
      latency: performance.now() - startTime,
      clientId,
      requestId
    };
  }
}

/**
 * Run concurrent client with rate limiting
 */
async function runClient(clientId, testDuration) {
  const startTime = Date.now();
  const requestInterval = 1000 / (config.requestsPerSecond / config.concurrentClients);
  let requestId = 0;

  const results = [];

  while (Date.now() - startTime < testDuration) {
    const requestStart = performance.now();
    
    const result = await makeNDJSONRequest(clientId, `req-${clientId}-${requestId++}`);
    results.push(result);

    // Track throughput
    metrics.throughputData.push({
      timestamp: Date.now(),
      clientId,
      requestId: result.requestId,
      success: result.success,
      latency: result.latency
    });

    // Rate limiting
    const elapsed = performance.now() - requestStart;
    const waitTime = Math.max(0, requestInterval - elapsed);
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  return results;
}

/**
 * Calculate throughput over time
 */
function calculateThroughput() {
  if (metrics.throughputData.length === 0) return {};

  // Group by second
  const throughputBySecond = {};
  const startTime = metrics.throughputData[0].timestamp;

  metrics.throughputData.forEach(data => {
    const second = Math.floor((data.timestamp - startTime) / 1000);
    if (!throughputBySecond[second]) {
      throughputBySecond[second] = { total: 0, successful: 0, failed: 0 };
    }
    throughputBySecond[second].total++;
    if (data.success) {
      throughputBySecond[second].successful++;
    } else {
      throughputBySecond[second].failed++;
    }
  });

  // Calculate averages and peaks
  const rates = Object.values(throughputBySecond);
  const avgThroughput = rates.reduce((sum, r) => sum + r.total, 0) / rates.length;
  const peakThroughput = Math.max(...rates.map(r => r.total));
  const avgSuccessRate = rates.reduce((sum, r) => sum + (r.successful / r.total), 0) / rates.length;

  return {
    average: avgThroughput.toFixed(2),
    peak: peakThroughput,
    averageSuccessRate: (avgSuccessRate * 100).toFixed(2) + '%',
    timeline: throughputBySecond
  };
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
    p99: sorted[Math.floor(len * 0.99)].toFixed(2) + 'ms',
    mean: (sorted.reduce((a, b) => a + b, 0) / len).toFixed(2) + 'ms'
  };
}

/**
 * Generate test report
 */
function generateReport() {
  const duration = metrics.endTimestamp - metrics.startTimestamp;
  const throughput = calculateThroughput();
  const latencyDist = calculateLatencyDistribution();

  const report = {
    testType: 'ndjson-load-test',
    config,
    duration,
    timestamp: new Date().toISOString(),
    summary: {
      totalRequests: metrics.totalRequests,
      successfulRequests: metrics.successfulRequests,
      failedRequests: metrics.failedRequests,
      successRate: metrics.totalRequests > 0 
        ? (metrics.successfulRequests / metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      totalEvents: metrics.totalEvents,
      averageEventsPerRequest: metrics.successfulRequests > 0
        ? (metrics.totalEvents / metrics.successfulRequests).toFixed(2)
        : '0'
    },
    performance: {
      actualRPS: (metrics.totalRequests / (duration / 1000)).toFixed(2),
      targetRPS: config.requestsPerSecond,
      throughput: throughput,
      latency: latencyDist
    },
    errors: {
      total: metrics.errors.length,
      errorRate: metrics.totalRequests > 0 
        ? (metrics.errors.length / metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      samples: metrics.errors.slice(0, 10) // First 10 errors
    },
    eventAnalysis: {
      totalEvents: metrics.totalEvents,
      averageEventsPerRequest: metrics.eventCounts.length > 0
        ? (metrics.eventCounts.reduce((a, b) => a + b, 0) / metrics.eventCounts.length).toFixed(2)
        : '0',
      maxEventsPerRequest: metrics.eventCounts.length > 0 ? Math.max(...metrics.eventCounts) : 0,
      minEventsPerRequest: metrics.eventCounts.length > 0 ? Math.min(...metrics.eventCounts) : 0
    }
  };

  return report;
}

/**
 * Main test execution
 */
async function runLoadTest() {
  console.log('🚀 Starting NDJSON Load Test');
  console.log(`📊 Configuration: ${JSON.stringify(config, null, 2)}`);
  
  metrics.startTimestamp = Date.now();

  try {
    // Create concurrent clients
    const clientPromises = [];
    
    console.log(`👥 Starting ${config.concurrentClients} concurrent clients...`);
    console.log(`🎯 Target: ${config.requestsPerSecond} requests/second for ${config.testDuration / 1000} seconds`);
    
    for (let i = 0; i < config.concurrentClients; i++) {
      const clientId = `client-${i}`;
      const clientPromise = runClient(clientId, config.testDuration);
      clientPromises.push(clientPromise);
    }

    // Start progress monitoring
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - metrics.startTimestamp;
      const currentRPS = (metrics.totalRequests / (elapsed / 1000)).toFixed(2);
      const successRate = metrics.totalRequests > 0 
        ? (metrics.successfulRequests / metrics.totalRequests * 100).toFixed(1)
        : '0';
      
      console.log(`⏱️  ${Math.floor(elapsed / 1000)}s: ${metrics.totalRequests} requests, ${currentRPS} RPS, ${successRate}% success`);
    }, 5000);

    // Wait for all clients to complete
    const results = await Promise.allSettled(clientPromises);
    
    clearInterval(progressInterval);
    metrics.endTimestamp = Date.now();

    // Analyze results
    const successfulClients = results.filter(r => r.status === 'fulfilled').length;
    const failedClients = results.filter(r => r.status === 'rejected').length;

    console.log(`\n✅ Test completed!`);
    console.log(`📈 Successful clients: ${successfulClients}/${config.concurrentClients}`);
    console.log(`❌ Failed clients: ${failedClients}/${config.concurrentClients}`);
    console.log(`📊 Total requests: ${metrics.totalRequests}`);
    console.log(`✔️  Successful requests: ${metrics.successfulRequests}`);
    console.log(`❌ Failed requests: ${metrics.failedRequests}`);
    console.log(`🎯 Events processed: ${metrics.totalEvents}`);

    // Generate and display report
    const report = generateReport();
    
    console.log('\n📊 Test Report:');
    console.log('===============');
    console.log(JSON.stringify(report, null, 2));

    // Save report to file
    const fs = await import('fs/promises');
    const reportFile = `ndjson-load-test-${Date.now()}.json`;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${reportFile}`);

    // Performance validation
    const actualRPS = parseFloat(report.performance.actualRPS);
    const targetRPS = config.requestsPerSecond;
    const achievedRate = (actualRPS / targetRPS * 100).toFixed(1);

    console.log(`\n🎯 Performance Target: ${targetRPS} RPS`);
    console.log(`📈 Actual Performance: ${actualRPS} RPS (${achievedRate} of target)`);

    if (actualRPS >= targetRPS * 0.9) {
      console.log('✅ Performance target achieved!');
      process.exit(0);
    } else {
      console.log('⚠️  Performance target not fully achieved');
      process.exit(1);
    }

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