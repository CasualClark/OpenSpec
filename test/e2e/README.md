# Phase 1 Task MCP - End-to-End Testing Suite

This directory contains comprehensive end-to-end tests for the Phase 1 Task MCP implementation. The test suite validates the complete workflow, integration, security, and performance aspects of the system.

## Test Structure

### Core Test Files

1. **`phase1-workflow.test.ts`** - Complete workflow testing
   - Full change.open → resource access → change.archive workflow
   - All template types (feature, bugfix, chore)
   - Lock acquisition, modification, and release scenarios
   - Error handling and recovery scenarios
   - Cross-platform compatibility testing

2. **`resource-providers.test.ts`** - Resource provider testing
   - Changes collection resource (`changes://`)
   - Individual change resources (`change://{slug}`)
   - Proposal resources (`proposal://{slug}`)
   - Task resources (`tasks://{slug}`)
   - Delta resources (`delta://{slug}`)
   - Performance and security testing for resources

3. **`cli-integration.test.ts`** - CLI integration testing
   - Stdio server management
   - JSON-RPC communication
   - CLI command integration
   - Error handling and recovery
   - Cross-platform compatibility

4. **`security-performance.test.ts`** - Security and performance testing
   - Path traversal protection
   - Input validation security
   - Lock security
   - Performance benchmarks
   - Load testing
   - Memory management
   - Resource usage monitoring

## Test Categories

### 1. Complete Workflow Testing
Validates the entire Phase 1 workflow:
- `change.open` → template creation → resource access → `change.archive`
- Lock management throughout the lifecycle
- Error scenarios and recovery paths
- Cross-platform path handling

### 2. Integration Testing
Ensures all components work together:
- CLI integration with stdio server
- Tool registration and execution
- Resource provider functionality
- Security sandbox enforcement

### 3. Performance Testing
Validates performance requirements:
- Server startup time (< 2 seconds)
- Tool execution response time (< 500ms)
- Resource provider response time (< 200ms)
- Memory usage and leak detection
- Concurrent operation handling

### 4. Security Testing
Validates security controls:
- Path traversal attack prevention
- Input validation enforcement
- Lock file security validation
- Resource access control testing
- Code injection prevention

## Running the Tests

### Prerequisites
- Node.js >= 20.19.0
- Test environment with sufficient permissions
- Isolated temporary directory access

### Individual Test Suites

```bash
# Run complete workflow tests
npm test -- test/e2e/phase1-workflow.test.ts

# Run resource provider tests
npm test -- test/e2e/resource-providers.test.ts

# Run CLI integration tests
npm test -- test/e2e/cli-integration.test.ts

# Run security and performance tests
npm test -- test/e2e/security-performance.test.ts
```

### All E2E Tests

```bash
# Run all E2E tests
npm test -- test/e2e/

# Run with coverage
npm run test:coverage -- test/e2e/

# Run in watch mode
npm run test:watch -- test/e2e/
```

## Test Environment Setup

### Isolation
Each test suite creates isolated test environments:
- Unique temporary directories using timestamps and random strings
- Clean openspec project structure initialization
- Proper cleanup after each test

### Security Context
Tests use dedicated security contexts:
- Sandbox boundaries enforced
- Path traversal protection tested
- Resource access control validated

### Data Fixtures
Test data includes:
- Various change types and templates
- Malicious input for security testing
- Large datasets for performance testing
- Edge cases and error conditions

## Performance Benchmarks

### Server Performance
- **Startup Time**: < 2 seconds average, < 3 seconds maximum
- **Tool Execution**: < 500ms average, < 1 second for errors
- **Resource Access**: < 200ms average, < 1 second maximum

### Memory Management
- **Normal Operations**: < 20MB growth after cleanup
- **Large Operations**: < 50MB growth for large content
- **Concurrent Operations**: Graceful handling without crashes

### Load Testing
- **Concurrent Operations**: 20+ simultaneous operations
- **High Frequency**: 100+ sequential operations
- **Resource Exhaustion**: Graceful degradation under pressure

## Security Validation

### Path Traversal Protection
Tests various attack vectors:
- `../../../etc/passwd`
- `..\\..\\..\\windows\\system32`
- URL-encoded variants
- Symlink attacks

### Input Validation
Validates protection against:
- Code injection attempts
- XSS attacks
- Large input handling
- Malformed JSON-RPC requests

### Lock Security
Ensures:
- Proper lock file format
- Lock exhaustion resistance
- Unauthorized lock manipulation prevention

## Test Coverage

### Workflow Coverage
- ✅ Complete change lifecycle
- ✅ All template types
- ✅ Lock management
- ✅ Error scenarios
- ✅ Cross-platform compatibility

### Integration Coverage
- ✅ CLI-stdio server integration
- ✅ JSON-RPC communication
- ✅ Tool registration and execution
- ✅ Resource provider functionality
- ✅ Security sandbox enforcement

### Performance Coverage
- ✅ Server startup benchmarks
- ✅ Tool execution performance
- ✅ Resource provider performance
- ✅ Memory leak detection
- ✅ Concurrent operation handling

### Security Coverage
- ✅ Path traversal protection
- ✅ Input validation
- ✅ Lock security
- ✅ Resource access control
- ✅ Code injection prevention

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Ensure test directory permissions are sufficient
   - Check temporary directory access

2. **Timeout Issues**
   - Increase test timeout for slow systems
   - Check system resource availability

3. **Memory Issues**
   - Ensure sufficient system memory
   - Check for memory leaks in test setup

4. **Path Issues**
   - Verify cross-platform path handling
   - Check temporary directory creation

### Debug Mode

Run tests with additional logging:

```bash
# Run with debug logging
DEBUG=* npm test -- test/e2e/

# Run with verbose output
npm test -- test/e2e/ --reporter=verbose
```

## CI/CD Integration

### GitHub Actions
The tests are designed to run in CI environments:
- Isolated test environments
- Proper cleanup procedures
- Reasonable timeout values
- Cross-platform compatibility

### Performance Thresholds
CI tests enforce performance thresholds:
- Fail if benchmarks are not met
- Monitor memory usage trends
- Track performance regressions

## Contributing

### Adding New Tests
1. Follow existing test patterns
2. Use proper isolation and cleanup
3. Include performance and security considerations
4. Add documentation for new test cases

### Test Maintenance
- Update tests when adding new features
- Review performance thresholds periodically
- Update security test cases for new threats
- Maintain cross-platform compatibility

## Future Enhancements

### Planned Additions
- Visual regression testing
- Network performance testing
- Additional security attack vectors
- Performance profiling integration
- Automated test data generation

### Monitoring
- Test execution time tracking
- Memory usage monitoring
- Performance trend analysis
- Security test coverage metrics