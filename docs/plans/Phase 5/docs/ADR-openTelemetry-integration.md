# ADR-001: OpenTelemetry Integration Strategy

## Status
Accepted

## Context
The Task MCP HTTP server requires comprehensive observability to meet Phase 5 requirements, including structured logs, RED/USE metrics, distributed tracing, and SLO monitoring. The existing system has:

- Prometheus-style metrics via custom `MetricsCollector`
- Audit logging via `AuditLogger`
- Fastify request ID system
- HTTPError handling
- SSE and NDJSON streaming endpoints

The challenge is to integrate OpenTelemetry while maintaining backward compatibility and minimizing operational disruption.

## Decision

### 1. Hybrid Export Strategy
We will implement **dual export** of metrics during the transition period:

- **Phase 1-2**: Both Prometheus and OpenTelemetry exporters active
- **Phase 3**: OpenTelemetry primary, Prometheus backup
- **Phase 4**: OpenTelemetry only

**Rationale**: 
- Zero downtime during migration
- Ability to validate metric accuracy
- Gradual confidence building
- Rollback capability if issues arise

### 2. Correlation Strategy
We will leverage the existing Fastify request ID system as the primary correlation mechanism:

- **Request ID**: Primary correlation identifier (already implemented)
- **Trace ID**: OpenTelemetry trace identifier (new)
- **Span ID**: Individual operation identifier (new)
- **Response Headers**: `x-request-id` and `x-trace-id` for client correlation

**Rationale**:
- Leverages existing proven patterns
- No breaking changes to client APIs
- Seamless integration with current audit logging
- Follows OpenTelemetry semantic conventions

### 3. Error Handling Integration
We will normalize all error types to consistent OpenTelemetry format:

```typescript
interface NormalizedError {
  type: string;          // 'HTTPError', 'ValidationError', 'TimeoutError', etc.
  code: string;          // Error code from existing system
  message: string;       // Human-readable message
  httpStatusCode: number; // Standard HTTP status
  shouldLog: boolean;    // Rate-limited logging decision
  isSecurityRelevant: boolean; // Special handling for security events
}
```

**Rationale**:
- Consistent error reporting across all systems
- Maintains existing HTTPError semantics
- Enables intelligent rate limiting
- Special handling for security-sensitive events

### 4. Sampling Strategy
We will implement **adaptive sampling** based on endpoint characteristics:

```typescript
const samplingConfig = {
  default: { trace: 0.1, error: 1.0 },           // 10% normal, 100% errors
  highVolume: { sse: 0.01, ndjson: 0.05 },       // 1% SSE, 5% NDJSON
  adaptive: { enabled: true, maxTracesPerSecond: 1000 }
};
```

**Rationale**:
- Prevents trace explosion on high-volume streaming endpoints
- Maintains full observability for error conditions
- Adaptive limits prevent resource exhaustion
- Configurable based on operational needs

### 5. Metrics Mapping Strategy
We will map existing Prometheus metrics to OpenTelemetry semantic conventions:

| Existing Metric | OpenTelemetry Metric | Enhancement |
|---------------|---------------------|-------------|
| `http_requests_total` | `http.server.request.count` | Add transport label |
| `http_request_duration_seconds` | `http.server.request.duration` | Semantic buckets |
| `tool_executions_total` | `taskmcp.tool.duration` + counters | Detailed attribution |
| `health_check_status` | `taskmcp.health.check.status` | OTel semantic format |
| `auth_attempts_total` | `taskmcp.auth.attempts` | Security context |
| `rate_limit_hits_total` | `taskmcp.rate.limit.hits` | Transport context |

**Rationale**:
- Maintains operational continuity
- Enables gradual migration of dashboards
- Adds valuable context for observability
- Follows industry standards

### 6. Streaming Endpoint Instrumentation
We will implement specialized instrumentation for streaming endpoints:

**SSE Endpoints:**
- Connection lifecycle tracking
- Heartbeat metrics
- Bytes transferred tracking
- Connection gauge metrics

**NDJSON Endpoints:**
- Chunk processing metrics
- Response size measurement
- Processing time tracking
- Error rate monitoring

**Rationale**:
- High-volume endpoints require special handling
- Connection lifecycle is critical for debugging
- Performance impact must be minimized
- Resource usage monitoring essential

## Consequences

### Positive Consequences
1. **Zero Disruption**: Existing monitoring continues during transition
2. **Enhanced Observability**: Rich context and correlation across systems
3. **Standards Compliance**: OpenTelemetry semantic conventions followed
4. **Scalable Architecture**: Adaptive sampling handles high-volume scenarios
5. **Security Integration**: Enhanced audit logging with trace correlation
6. **Performance Awareness**: Streaming endpoints properly monitored

### Negative Consequences
1. **Complexity**: Dual export increases system complexity during transition
2. **Resource Overhead**: Additional CPU/memory for OpenTelemetry processing
3. **Learning Curve**: Team needs OpenTelemetry expertise
4. **Dependency Risk**: Additional external dependencies introduced

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Performance Impact | <5% overhead target, comprehensive performance testing |
| Data Loss During Migration | Dual export validation, gradual rollout |
| Complex Configuration | Environment-based configuration, comprehensive docs |
| Dependency Issues | Version pinning, compatibility testing |
| Operator Confusion | Detailed migration guide, training materials |

## Implementation Timeline

### Week 1: Foundation
- Package dependency installation
- OpenTelemetry initialization modules
- Correlation middleware implementation

### Week 2: Metrics Integration
- Enhanced MetricsCollector with dual export
- Streaming endpoint instrumentation
- Metrics validation and testing

### Week 3: Error Handling
- Error normalization and recording
- Rate limiting implementation
- Audit logger integration

### Week 4: Integration
- Fastify plugin development
- Integration test suite
- End-to-end validation

### Week 5: Performance
- Load testing and optimization
- Memory leak detection
- Performance baseline establishment

### Week 6: Deployment
- Documentation completion
- Migration guide creation
- Production rollout preparation

## Future Considerations

### Short-term (Next 3 months)
- Monitor performance impact in production
- Refine sampling strategies based on usage patterns
- Optimize high-volume endpoint handling

### Medium-term (3-6 months)
- Deprecate Prometheus metrics after migration
- Implement advanced correlation patterns
- Add custom business metrics

### Long-term (6+ months)
- Explore OpenTelemetry Collector deployment
- Implement canary analysis with observability
- Integrate with APM tools (DataDog, New Relic, etc.)

## Alternatives Considered

### Alternative 1: Big Bang Migration
- Replace all Prometheus metrics with OpenTelemetry at once
- **Rejected**: Too disruptive, high risk of data loss

### Alternative 2: OpenTelemetry Only (No Dual Export)
- Implement only OpenTelemetry from day one
- **Rejected**: Existing dashboards would break, high operational risk

### Alternative 3: Sidecar Pattern
- Deploy OpenTelemetry collector as sidecar
- **Rejected**: Added infrastructure complexity, deployment overhead

## Decision Rationale

The chosen strategy balances operational safety with technical innovation. The hybrid export approach provides:

1. **Risk Mitigation**: Gradual migration with rollback capability
2. **Operational Continuity**: No disruption to existing monitoring
3. **Validation Capability**: Side-by-side comparison for confidence
4. **Future-Proofing**: Standards-based observability foundation

This approach aligns with the project's reliability-first philosophy while enabling advanced observability capabilities required for Phase 5.

## References

- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Fastify OpenTelemetry Integration](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-fastify)
- [Phase 5 Requirements Document](./PHASE5_OVERVIEW.md)
- [Existing Instrumentation Specification](./instrumentation_spec.md)
- [Task MCP HTTP Server Architecture](../../../../packages/task-mcp-http/README.md)