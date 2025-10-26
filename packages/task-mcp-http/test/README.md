# Phase 4 SSE Server - Comprehensive Test Suite

This directory contains a complete test suite for the Phase 4 SSE server implementation, providing comprehensive coverage of unit tests, integration tests, and load testing.

## 📋 Test Coverage Goals

- **SSE endpoint**: >95% coverage
- **NDJSON endpoint**: >95% coverage  
- **Security middleware**: >90% coverage
- **Health endpoints**: >90% coverage
- **Overall coverage**: >90%

## 🧪 Test Types

### 1. Unit Tests (`test/routes/`, `test/security/`, `test/health/__tests__/`)

Comprehensive unit tests covering:

- **SSE Route Handler**
  - SSE format compliance
  - Heartbeat functionality
  - MCP tool integration
  - Error handling
  - Performance features
  - Connection management

- **NDJSON Route Handler**
  - NDJSON format compliance
  - Event sequencing
  - Stream handling
  - Error scenarios
  - Performance validation

- **Security Middleware**
  - Authentication (Bearer tokens, cookies)
  - CORS handling
  - Rate limiting
  - Security headers
  - Audit logging

- **Health Check System**
  - Liveness/readiness probes
  - Metrics collection
  - System monitoring
  - Health check registry

### 2. Integration Tests (`test/integration/`)

End-to-end integration tests covering:

- **Server Functionality**
  - Health endpoints
  - Authentication flows
  - SSE/NDJSON endpoints
  - CORS handling
  - Error scenarios
  - Concurrent connections

### 3. Load Testing (`test/load/`)

Performance and load testing scripts:

- **SSE Load Test** (`sse-load-test.js`)
  - Concurrent SSE connections (50+ clients)
  - Connection duration testing
  - Memory usage monitoring
  - Event processing validation

- **NDJSON Load Test** (`ndjson-load-test.js`)
  - Request throughput testing
  - Rate limiting validation
  - Event stream processing
  - Performance benchmarking

## 🚀 Running Tests

### Quick Start

```bash
# Run all tests
node test/run-all-tests.js

# Run only unit tests
node test/run-all-tests.js --unit-only

# Run only integration tests  
node test/run-all-tests.js --integration-only

# Run only load tests
node test/run-all-tests.js --load-only

# Run without coverage
node test/run-all-tests.js --no-coverage
```

### Individual Test Categories

```bash
# Unit tests with coverage
vitest run --coverage

# Integration tests
vitest run test/integration/*.test.ts

# SSE load test
SERVER_URL=http://localhost:8443 AUTH_TOKEN=test-token \
CONCURRENT_CONNECTIONS=50 TEST_DURATION=300000 \
node test/load/sse-load-test.js

# NDJSON load test
SERVER_URL=http://localhost:8443 AUTH_TOKEN=test-token \
REQUESTS_PER_SECOND=100 TEST_DURATION=120000 \
node test/load/ndjson-load-test.js
```

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_URL` | `http://localhost:8443` | Target server URL |
| `AUTH_TOKEN` | `test-token` | Authentication token |
| `CONCURRENT_CONNECTIONS` | `50` | SSE concurrent connections |
| `REQUESTS_PER_SECOND` | `100` | NDJSON target RPS |
| `TEST_DURATION` | `300000` | Test duration (ms) |
| `TOOL_NAME` | `change.open` | MCP tool to test |
| `TOOL_INPUT` | `{"slug": "test-change"}` | Tool input data |

### Test Configuration

Edit `test/run-all-tests.js` to modify:

- Test enablement/disablement
- Coverage settings
- Load test parameters
- Test timeouts

## 📊 Test Reports

### Coverage Reports

Generated in `coverage/` directory:
- `coverage/lcov-report/index.html` - Interactive HTML report
- `coverage/lcov.info` - LCOV format for CI integration

### Load Test Reports

Generated as timestamped JSON files:
- `sse-load-test-{timestamp}.json` - SSE load test results
- `ndjson-load-test-{timestamp}.json` - NDJSON load test results

Report structure:
```json
{
  "testType": "sse-load-test",
  "config": { ... },
  "summary": {
    "totalConnections": 50,
    "successfulConnections": 48,
    "connectionSuccessRate": "96.0%",
    "totalEvents": 1250,
    "averageLatency": "45.2ms"
  },
  "performance": {
    "connectionsPerSecond": "0.83",
    "eventsPerSecond": "4.17"
  },
  "resources": {
    "peakMemoryUsage": 52428800,
    "averageMemoryUsage": 45678912
  },
  "errors": [...],
  "latencyDistribution": {
    "p50": "42.1ms",
    "p90": "78.3ms",
    "p95": "95.7ms",
    "p99": "145.2ms"
  }
}
```

## 🔧 Test Infrastructure

### Mock MCP Server

Unit tests use a mocked MCP server (`mockMCPServer`) to:
- Simulate tool registry
- Mock tool execution
- Control error scenarios
- Validate input handling

### Test Utilities

Common test utilities include:
- Request/response mocking
- Event stream parsing
- Performance measurement
- Error validation

### Test Data Fixtures

Standardized test data for:
- Tool requests
- Authentication tokens
- Error scenarios
- Performance benchmarks

## 🎯 Performance Benchmarks

### SSE Load Test Targets
- **Concurrent Connections**: 50+ simultaneous clients
- **Connection Duration**: 5+ minutes
- **Memory Usage**: <100MB per 50 connections
- **Latency**: P95 < 100ms
- **Connection Success Rate**: >95%

### NDJSON Load Test Targets  
- **Throughput**: 100+ requests/second
- **Test Duration**: 2+ minutes
- **Success Rate**: >95%
- **Latency**: P95 < 200ms
- **Event Processing**: <5ms per event

## 🐛 Debugging Tests

### Common Issues

1. **Server Not Running**
   ```bash
   # Start test server
   node test-server.mjs
   ```

2. **Port Conflicts**
   ```bash
   # Use different port
   SERVER_URL=http://localhost:8443 node test/load/sse-load-test.js
   ```

3. **Authentication Failures**
   ```bash
   # Check server config
   curl -H "Authorization: Bearer test-token" http://localhost:8443/healthz
   ```

### Debug Mode

```bash
# Enable verbose logging
DEBUG=* node test/run-all-tests.js

# Run tests with inspector
node --inspect test/run-all-tests.js
```

## 🔄 CI/CD Integration

### GitHub Actions

```yaml
- name: Run Tests
  run: |
    pnpm build
    node test/run-all-tests.js --no-coverage

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

### Performance Gates

Load tests fail if:
- Success rate < 95%
- P95 latency > targets
- Memory usage exceeds limits
- Error rate > 5%

## 📈 Monitoring

### Real-time Metrics

During load tests:
- Connection count
- Request rate  
- Error rate
- Memory usage
- Event processing rate

### Post-test Analysis

- Latency distribution
- Throughput trends
- Resource utilization
- Error patterns
- Performance regression

## 🤝 Contributing

### Adding New Tests

1. Follow existing naming conventions
2. Use consistent test structure
3. Include performance assertions
4. Add proper error handling
5. Update documentation

### Test Review Checklist

- [ ] Test is deterministic
- [ ] Proper cleanup implemented
- [ ] Error scenarios covered
- [ ] Performance assertions included
- [ ] Documentation updated

## 📚 Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Node.js Performance Testing](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Server-Sent Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [NDJSON Specification](http://ndjson.org/)