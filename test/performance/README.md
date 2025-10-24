# OpenSpec Performance Benchmarking Suite

This document describes the comprehensive performance benchmarking suite for OpenSpec's pagination and streaming features.

## Overview

The performance benchmarking suite is designed to validate that OpenSpec meets performance requirements and establishes CI performance regression testing. It provides comprehensive monitoring of pagination, streaming, concurrency, and memory efficiency.

## Features

### 🚀 Core Capabilities

- **Pagination Performance**: Tests pagination of 1000+ changes with <200ms requirement
- **Streaming Performance**: Validates memory usage stays below 50MB during streaming of 100MB files
- **Concurrency Testing**: Ensures 10 simultaneous requests don't cause performance degradation
- **Memory Efficiency**: Monitors memory usage patterns and detects leaks
- **Regression Detection**: Automatically detects performance regressions compared to baselines
- **CI Integration**: Full integration with GitHub Actions for automated testing
- **Dashboard Generation**: Creates detailed HTML dashboards for performance visualization

### 📊 Performance Metrics

The suite tracks the following key metrics:

#### Execution Time Metrics
- **Pagination**: Time to paginate 1000+ changes (target: <200ms)
- **Streaming**: Time to stream 100MB files (target: <5s)
- **Concurrency**: Average response time under load (target: <500ms)
- **Total Suite**: Overall test execution time

#### Memory Metrics
- **Peak Memory Usage**: Maximum memory during operations (target: <50MB)
- **Memory Growth**: Memory increase from start to finish
- **Memory per Item**: Memory efficiency per processed item
- **Memory Pressure**: Detection of memory breaches

#### Throughput Metrics
- **Items per Second**: Processing rate for pagination and streaming
- **Concurrent Requests**: Success rate under concurrent load
- **Request Distribution**: Performance variance across requests

## Architecture

### Core Components

```
test/performance/
├── utils/
│   ├── performance-benchmark.ts      # Core benchmarking framework
│   ├── performance-regression-detector.ts  # Regression detection
│   └── performance-dashboard.ts     # Dashboard generation
├── helpers/
│   └── test-utils.ts               # Test utilities and helpers
├── pagination.performance.test.ts    # Pagination benchmarks
├── streaming.performance.test.ts     # Streaming benchmarks
└── README.md                        # This documentation
```

### Scripts

```
scripts/
└── performance-test-runner.ts       # CI/CD test runner
```

### CI Integration

```
.github/workflows/
└── performance-tests.yml           # GitHub Actions workflow
```

## Usage

### Running Performance Tests

#### Local Development

```bash
# Run full performance test suite
pnpm test:performance

# Run with memory monitoring
NODE_OPTIONS=--expose-gc pnpm test:performance

# Generate performance dashboard
pnpm test:performance:report

# Watch mode for development
pnpm test:performance:watch
```

#### Individual Test Categories

```bash
# Run only pagination tests
pnpm test pagination.performance.test.ts

# Run only streaming tests  
pnpm test streaming.performance.test.ts

# Run with coverage
pnpm test:coverage test/performance/
```

### CI/CD Integration

The performance tests are automatically triggered on:

- **Pull Requests**: Full performance suite with regression detection
- **Main Branch Pushes**: Baseline updates and trend analysis
- **Daily Schedule**: Automated performance monitoring
- **Manual Dispatch**: On-demand performance testing

## Performance Requirements

### Pagination Requirements

| Metric | Requirement | Target |
|--------|-------------|--------|
| Execution Time | <200ms for 1000+ changes | ✅ 200ms |
| Memory Usage | <50MB peak | ✅ 50MB |
| Throughput | >5000 items/second | ✅ 5000/s |
| Memory per Item | <1KB per change | ✅ 1KB |

### Streaming Requirements

| Metric | Requirement | Target |
|--------|-------------|--------|
| Memory Usage | <50MB for 100MB files | ✅ 50MB |
| Memory Growth | <20MB during streaming | ✅ 20MB |
| Throughput | >10 items/second | ✅ 10/s |
| Chunk Processing | Efficient chunk handling | ✅ 64KB chunks |

### Concurrency Requirements

| Metric | Requirement | Target |
|--------|-------------|--------|
| Concurrent Requests | 10 simultaneous | ✅ 10 |
| Success Rate | 100% under load | ✅ 100% |
| Response Time | <500ms average | ✅ 500ms |
| Max Response Time | <1000ms | ✅ 1000ms |

## Regression Detection

### Baseline Management

The system maintains performance baselines and automatically detects regressions:

```typescript
// Regression thresholds
const thresholds = {
  executionTimeRegression: 15,    // 15% increase
  memoryUsageRegression: 20,      // 20% increase  
  throughputRegression: 10,        // 10% decrease
  criticalThreshold: 50,           // 50% change
  majorThreshold: 25               // 25% change
};
```

### Severity Levels

- **🚨 Critical**: >50% performance degradation
- **⚠️ Major**: 25-50% performance degradation  
- **⚠️ Minor**: 15-25% performance degradation

### Automated Actions

- **PR Blocking**: Regressions block merge until resolved
- **Baseline Updates**: Automatic baseline updates for improvements
- **Trend Analysis**: Historical performance tracking
- **Alerting**: Automated notifications for regressions

## Dashboard and Reporting

### Performance Dashboard

The suite generates comprehensive HTML dashboards featuring:

- **Real-time Metrics**: Current performance data visualization
- **Historical Trends**: Performance changes over time
- **Interactive Charts**: Chart.js-based visualizations
- **Detailed Reports**: Granular test results and metrics
- **Environment Info**: Node.js version, platform details

### Report Components

#### Summary Section
- Total tests run and pass rate
- Overall execution time
- Environment details
- Success/failure breakdown

#### Performance Charts
- Execution time by test category
- Memory usage visualization
- Throughput metrics
- Success rate doughnut chart

#### Detailed Results
- Individual test metrics
- Error messages and details
- Performance thresholds status
- Comparison with baselines

## Configuration

### Benchmark Configuration

```typescript
interface BenchmarkConfig {
  warmupIterations?: number;      // Default: 3
  iterations?: number;            // Default: 10
  monitorMemory?: boolean;        // Default: true
  thresholds?: {
    maxExecutionTime?: number;    // Category-specific
    maxMemoryUsage?: number;
    minItemsPerSecond?: number;
    maxMemoryPerItem?: number;
  };
}
```

### Memory Monitoring

```typescript
interface MemoryThresholds {
  warning?: number;              // Default: 70%
  critical?: number;             // Default: 85%
  maxAbsolute?: number;          // Default: 50MB
  checkInterval?: number;        // Default: 1000ms
}
```

### Regression Detection

```typescript
interface RegressionThresholds {
  executionTimeRegression: number;   // 15%
  memoryUsageRegression: number;     // 20%
  throughputRegression: number;       // 10%
  criticalThreshold: number;         // 50%
  majorThreshold: number;            // 25%
}
```

## Test Data

### Pagination Tests

- **Test Changes**: 1200 simulated changes
- **Change Structure**: Proposal, specs, tasks, deltas
- **File Sizes**: Variable sizes to simulate real data
- **Lock Files**: 10% of changes have locks

### Streaming Tests

- **Large Files**: 50 changes with ~2MB each (100MB total)
- **Chunk Sizes**: 256B to 4KB for testing different configurations
- **Content Types**: Text, JSON, diff files
- **Memory Pressure**: Tests with low memory limits

### Concurrency Tests

- **Simultaneous Requests**: 10 concurrent operations
- **Load Levels**: 1, 5, 10, 15 concurrent requests
- **Timeout Handling**: 30-60 second timeouts
- **Error Recovery**: Graceful handling of failures

## Best Practices

### Running Tests

1. **Environment Setup**: Use `--expose-gc` for accurate memory monitoring
2. **Consistent Hardware**: Run on similar hardware for comparable results
3. **Multiple Runs**: Use multiple iterations for statistical significance
4. **Warm-up Period**: Allow warm-up iterations to stabilize measurements

### Interpreting Results

1. **Look for Trends**: Focus on patterns rather than single runs
2. **Consider Variance**: Account for natural performance variation
3. **Environment Factors**: Consider system load and resource availability
4. **Baseline Comparison**: Always compare against established baselines

### Performance Optimization

1. **Profile First**: Use benchmark results to identify bottlenecks
2. **Iterative Testing**: Test after each optimization
3. **Memory Management**: Monitor for memory leaks and pressure
4. **Concurrency Scaling**: Test with increasing concurrent loads

## Troubleshooting

### Common Issues

#### Memory Monitoring Issues
```bash
# Enable garbage collection for accurate memory tracking
export NODE_OPTIONS=--expose-gc
pnpm test:performance
```

#### Test Timeouts
```bash
# Increase test timeout for slower systems
VITEST_TEST_TIMEOUT=30000 pnpm test:performance
```

#### Inconsistent Results
- Ensure consistent system load
- Close unnecessary applications
- Use dedicated test environment
- Run multiple iterations

#### CI Failures
- Check resource limits in CI environment
- Verify Node.js version compatibility
- Review system resource constraints
- Check for network-related delays

### Debug Mode

Enable detailed logging for troubleshooting:

```typescript
// In performance tests
const debugMode = process.env.DEBUG_PERFORMANCE === 'true';
if (debugMode) {
  console.log('Detailed performance metrics...');
}
```

## Contributing

### Adding New Performance Tests

1. **Create Test File**: Add to `test/performance/` directory
2. **Use Benchmark Framework**: Extend `PerformanceBenchmark` class
3. **Define Thresholds**: Set appropriate performance requirements
4. **Add to CI Runner**: Include in `performance-test-runner.ts`
5. **Update Documentation**: Document new test requirements

### Performance Requirements

When adding new tests, define clear performance requirements:

```typescript
const requirements = {
  maxExecutionTime: 1000,      // 1 second
  maxMemoryUsage: 100 * 1024 * 1024,  // 100MB
  minThroughput: 100,          // 100 items/second
  successRate: 95              // 95% success rate
};
```

### Regression Detection

Update regression thresholds for new metrics:

```typescript
const regressionThresholds = {
  newMetricRegression: 20,     // 20% regression threshold
  newMetricCritical: 60         // 60% critical threshold
};
```

## Future Enhancements

### Planned Features

- **Distributed Testing**: Multi-machine performance testing
- **Real-time Monitoring**: Live performance dashboards
- **Integration Testing**: Performance testing with external services
- **Load Testing**: Higher concurrency and stress testing
- **Comparative Analysis**: Performance comparison across versions
- **SLA Monitoring**: Service level agreement tracking

### Integration Opportunities

- **Grafana Dashboards**: Real-time performance visualization
- **Prometheus Metrics**: Performance metric collection
- **Alertmanager Integration**: Automated alerting for regressions
- **Performance Budgets**: Automated performance budget enforcement
- **A/B Testing**: Performance impact of feature changes

## Support

For questions or issues with the performance benchmarking suite:

1. **Check Documentation**: Review this document and test files
2. **Review CI Logs**: Check GitHub Actions for detailed error messages  
3. **Create Issue**: File an issue with performance test details
4. **Contact Team**: Reach out to the OpenSpec development team

---

*This performance benchmarking suite ensures OpenSpec maintains high performance standards and provides early detection of performance regressions before they impact production users.*