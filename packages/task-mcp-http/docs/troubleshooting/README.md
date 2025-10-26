# Troubleshooting Guide - Task MCP HTTP Server

This guide provides comprehensive troubleshooting procedures for diagnosing and resolving issues with the Task MCP HTTP server.

## Overview

Effective troubleshooting requires a systematic approach using logs, metrics, and traces. This guide covers the tools and techniques needed to identify root causes and implement solutions quickly.

## Troubleshooting Methodology

### 1. Gather Information
- **Symptoms**: What is the user experiencing?
- **Scope**: How widespread is the issue?
- **Timeline**: When did the issue start?
- **Changes**: What changed recently?

### 2. Form Hypothesis
- **Most Likely Cause**: Based on symptoms and patterns
- **Alternative Causes**: Other potential explanations
- **Testable Predictions**: What should we see if hypothesis is correct?

### 3. Investigate Systematically
- **Check Logs**: Look for error patterns and anomalies
- **Analyze Metrics**: Identify trends and correlations
- **Review Traces**: Follow request flows through the system
- **Verify Configuration**: Check recent changes and deployments

### 4. Implement Solution
- **Quick Fix**: Temporary mitigation if needed
- **Root Cause Fix**: Address underlying issue
- **Prevention**: Prevent recurrence

## Troubleshooting Tools

### 1. Logs Analysis

#### Structured JSON Logs
The Task MCP HTTP server uses structured JSON logging with correlation IDs for easy analysis.

```bash
# View recent logs
kubectl logs -f deployment/task-mcp-http -n task-mcp --since=5m

# Filter by log level
kubectl logs deployment/task-mcp-http -n task-mcp | jq 'select(.level == "error")'

# Filter by correlation ID
kubectl logs deployment/task-mcp-http -n task-mcp | jq 'select(.correlationId == "req-123-456")'

# Filter by time range
kubectl logs deployment/task-mcp-http -n task-mcp --since=2025-10-26T10:00:00Z --until=2025-10-26T11:00:00Z
```

#### Log Search Patterns
```bash
# Search for HTTP errors
kubectl logs deployment/task-mcp-http -n task-mcp | grep -E "HTTP [45][0-9][0-9]"

# Search for exceptions
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "exception\|error"

# Search for timeouts
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "timeout"

# Search for authentication issues
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "auth\|unauthorized\|forbidden"
```

#### Log Analysis with jq
```bash
# Extract error messages
kubectl logs deployment/task-mcp-http -n task-mcp | jq 'select(.level == "error") | .message'

# Extract request durations
kubectl logs deployment/task-mcp-http -n task-mcp | jq 'select(.metrics) | .metrics.responseTime'

# Extract user IDs from failed requests
kubectl logs deployment/task-mcp-http -n task-mcp | jq 'select(.level == "error") | .context.userId'

# Count errors by type
kubectl logs deployment/task-mcp-http -n task-mcp | jq -r 'select(.level == "error") | .error.code' | sort | uniq -c
```

### 2. Metrics Analysis

#### Prometheus Queries
```bash
# HTTP request rate
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_requests_total[5m]))'

# HTTP error rate
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_requests_total{status=~"5.."}[5m])) / sum(rate(http_server_requests_total[5m])) * 100'

# Request latency percentiles
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_request_duration_bucket[5m])) by (le))'

# Active requests
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(http_server_active_requests)'

# Tool execution rate
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(tool_executions_total[5m]))'
```

#### Grafana Dashboard Analysis
- **Overview Dashboard**: Overall system health
- **API Dashboard**: HTTP request metrics and errors
- **Tools Dashboard**: Tool execution performance
- **Infrastructure Dashboard**: Resource utilization
- **Security Dashboard**: Authentication and rate limiting

#### Alert Analysis
```bash
# Check active alerts
curl http://alertmanager:9093/api/v1/alerts | jq '.data.alerts[]'

# Check alert history
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=ALERTS_FOR_STATE' \
  --data-urlencode 'start=1h' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1m'
```

### 3. Distributed Tracing

#### OpenTelemetry Traces
```bash
# Check trace sampling rate
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(traces_span_dropped_total[5m]))'

# Analyze trace latency
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(traces_span_duration_seconds_bucket[5m])) by (le))'
```

#### Trace Analysis in Grafana Tempo
- **Service Map**: Visualize service dependencies
- **Trace Search**: Find traces by attributes
- **Performance Analysis**: Identify bottlenecks
- **Error Analysis**: Find error patterns

## Common Issues and Solutions

### 1. Service Unavailable

#### Symptoms
- 503 Service Unavailable errors
- Health check failures
- Connection timeouts

#### Investigation Steps
```bash
# Check pod status
kubectl get pods -n task-mcp -l app=task-mcp-http

# Check service endpoints
kubectl get endpoints task-mcp-http -n task-mcp

# Check resource constraints
kubectl describe pod <pod-name> -n task-mcp | grep -A 10 "Limits\|Requests"

# Check recent deployments
kubectl rollout history deployment/task-mcp-http -n task-mcp
```

#### Common Solutions
```bash
# Restart service
kubectl rollout restart deployment/task-mcp-http -n task-mcp

# Scale up resources
kubectl scale deployment task-mcp-http --replicas=3 -n task-mcp

# Increase resource limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"memory":"2Gi"}}}]}}}}'

# Rollback deployment
kubectl rollout undo deployment/task-mcp-http -n task-mcp
```

### 2. High Latency

#### Symptoms
- Slow response times
- p95 latency > 200ms
- p99 latency > 500ms

#### Investigation Steps
```bash
# Check latency metrics
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_request_duration_bucket[5m])) by (le))'

# Check by endpoint
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_request_duration_bucket[5m])) by (le, route))'

# Check resource usage
kubectl top pods -n task-mcp -l app=task-mcp-http

# Check database performance
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "slow query\|database"
```

#### Common Solutions
```bash
# Scale service
kubectl scale deployment task-mcp-http --replicas=5 -n task-mcp

# Increase CPU limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"cpu":"2000m"}}}]}}}}'

# Enable caching
kubectl patch configmap task-mcp-config -n task-mcp --patch '{"data":{"cache_enabled":"true"}}'

# Optimize database queries
# (Requires code changes)
```

### 3. Memory Issues

#### Symptoms
- OOM (Out of Memory) errors
- High memory usage > 85%
- Frequent garbage collection

#### Investigation Steps
```bash
# Check memory usage
kubectl top pods -n task-mcp -l app=task-mcp-http

# Check memory metrics
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=process_memory_bytes / 1024 / 1024'

# Check for memory leaks
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "memory\|heap"

# Check memory trends
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=process_memory_bytes' \
  --data-urlencode 'start=1h' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1m'
```

#### Common Solutions
```bash
# Increase memory limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"memory":"4Gi"}}}]}}}}'

# Restart service to clear memory
kubectl rollout restart deployment/task-mcp-http -n task-mcp

# Enable memory profiling
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"NODE_OPTIONS","value":"--max-old-space-size=4096"}]}]}}}}'
```

### 4. Authentication Issues

#### Symptoms
- 401 Unauthorized errors
- 403 Forbidden errors
- High authentication failure rate

#### Investigation Steps
```bash
# Check auth failure rate
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(auth_attempts_total{status="failed"}[5m]))'

# Check auth logs
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "auth\|unauthorized\|forbidden"

# Check token configuration
kubectl get secrets -n task-mcp | grep auth

# Test authentication
curl -X POST https://task-mcp.example.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"change.open","input":{"slug":"test"}}'
```

#### Common Solutions
```bash
# Update auth tokens
kubectl create secret generic auth-tokens --from-literal=tokens="token1,token2" -n task-mcp --dry-run=client -o yaml | kubectl apply -f -

# Restart service
kubectl rollout restart deployment/task-mcp-http -n task-mcp

# Check auth service connectivity
kubectl exec -it <pod-name> -n task-mcp -- curl -f http://auth-service:8080/health
```

### 5. Streaming Issues

#### Symptoms
- SSE connections dropping
- High latency for first message
- Connection limit reached

#### Investigation Steps
```bash
# Check active streaming connections
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(streaming_active_connections)'

# Check connection duration
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(streaming_connection_duration_bucket[5m])) by (le))'

# Check streaming logs
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "sse\|streaming\|connection"

# Check network connectivity
kubectl exec -it <pod-name> -n task-mcp -- netstat -an | grep :3000
```

#### Common Solutions
```bash
# Increase connection limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"MAX_CONNECTIONS","value":"2000"}]}]}}}}'

# Scale service
kubectl scale deployment task-mcp-http --replicas=5 -n task-mcp

# Tune connection timeouts
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"CONNECTION_TIMEOUT","value":"30000"}]}]}}}}'
```

## Advanced Troubleshooting

### 1. Performance Profiling

#### Node.js Profiling
```bash
# Enable CPU profiling
kubectl exec -it <pod-name> -n task-mcp -- node --cpu-prof --prof-process=/tmp/cpu-profile.txt

# Enable heap profiling
kubectl exec -it <pod-name> -n task-mcp -- node --heap-prof

# Collect heap dump
kubectl exec -it <pod-name> -n task-mcp -- node --inspect=0.0.0.0:9229
```

#### Application Performance Monitoring
```bash
# Check OpenTelemetry overhead
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=otel_processor_cpu_overhead_percent'

# Check trace sampling
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=otel_traces_sampler_sampled_total / otel_traces_sampler_total * 100'
```

### 2. Network Troubleshooting

#### Connectivity Testing
```bash
# Test DNS resolution
kubectl exec -it <pod-name> -n task-mcp -- nslookup task-mcp-http

# Test network connectivity
kubectl exec -it <pod-name> -n task-mcp -- telnet database 5432

# Check network policies
kubectl get networkpolicies -n task-mcp

# Check service connectivity
kubectl exec -it <pod-name> -n task-mcp -- curl -f http://task-mcp-http:3000/health/live
```

#### Load Balancer Issues
```bash
# Check load balancer status
kubectl describe service task-mcp-http -n task-mcp

# Check ingress configuration
kubectl get ingress -n task-mcp

# Check external connectivity
curl -I https://task-mcp.example.com/health/live
```

### 3. Database Troubleshooting

#### Connection Issues
```bash
# Check database connections
kubectl exec -it <pod-name> -n task-mcp -- netstat -an | grep :5432

# Check connection pool
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "connection pool"

# Test database connectivity
kubectl exec -it <pod-name> -n task-mcp -- psql -h database -U user -d dbname -c "SELECT 1;"
```

#### Performance Issues
```bash
# Check slow queries
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "slow query"

# Check database metrics
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=pg_stat_activity_count'

# Check database locks
kubectl exec -it <pod-name> -n task-mcp -- psql -h database -U user -d dbname -c "SELECT * FROM pg_locks;"
```

## Troubleshooting Checklist

### Initial Assessment
- [ ] Check service status and health
- [ ] Review recent deployments and changes
- [ ] Identify affected users and scope
- [ ] Check monitoring dashboards
- [ ] Review active alerts

### Data Collection
- [ ] Collect relevant logs
- [ ] Gather metrics data
- [ ] Analyze traces if available
- [ ] Document error patterns
- [ ] Check configuration changes

### Analysis
- [ ] Correlate events and metrics
- [ ] Identify root cause hypotheses
- [ ] Test hypotheses with data
- [ ] Verify findings with multiple sources
- [ ] Document analysis process

### Resolution
- [ ] Implement immediate fix if needed
- [ ] Address root cause
- [ ] Verify resolution
- [ ] Monitor for recurrence
- [ ] Document lessons learned

## Escalation Guidelines

### When to Escalate
- Issue persists > 30 minutes
- Root cause unclear
- Multiple systems affected
- Customer impact significant
- Requires specialized expertise

### Escalation Process
1. Notify engineering lead
2. Provide detailed incident summary
3. Share all collected data
4. Document attempted solutions
5. Follow escalation matrix

## Resources and References

### Documentation
- [Operations Runbooks](../operations/README.md)
- [SLO Documentation](../slos/README.md)
- [Security Guide](../security/README.md)
- [API Documentation](../api/README.md)

### Tools and Dashboards
- Grafana: http://grafana.task-mcp.example.com
- Prometheus: http://prometheus.task-mcp.example.com
- AlertManager: http://alertmanager.task-mcp.example.com
- Kibana (if available): http://kibana.task-mcp.example.com

### Contact Information
| Team | Contact | When to Contact |
|------|---------|-----------------|
| On-call Engineer | oncall@company.com | First point of contact |
| Engineering Lead | eng-lead@company.com | Escalation after 30 minutes |
| Database Team | dba@company.com | Database-related issues |
| Security Team | security@company.com | Security-related issues |
| Infrastructure Team | infra@company.com | Infrastructure issues |

---

*Last updated: 2025-10-26*
*Version: 1.0*