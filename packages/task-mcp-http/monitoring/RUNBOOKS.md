# Task MCP HTTP Server - Runbooks

This document contains runbooks for common operational scenarios and incident response procedures for the Task MCP HTTP server.

## Table of Contents

1. [Service Downtime](#service-downtime)
2. [High Error Rate](#high-error-rate)
3. [Performance Degradation](#performance-degradation)
4. [Memory Issues](#memory-issues)
5. [CPU Issues](#cpu-issues)
6. [Streaming Issues](#streaming-issues)
7. [Security Incidents](#security-incidents)
8. [SLO Violations](#slo-violations)
9. [Escalation Procedures](#escalation-procedures)

---

## Service Downtime

### Symptoms
- Service status shows "DOWN"
- Health check failures
- No metrics being collected
- Alerts: `TaskMCPHealthCheckFailure`

### Immediate Actions (0-5 minutes)
1. **Check Service Status**
   ```bash
   kubectl get pods -n task-mcp-monitoring -l app=task-mcp-http
   kubectl logs -f deployment/task-mcp-http -n task-mcp
   ```

2. **Verify Health Endpoints**
   ```bash
   curl -f http://task-mcp-http:3000/health/live
   curl -f http://task-mcp-http:3000/health/ready
   ```

3. **Check Recent Deployments**
   ```bash
   kubectl rollout history deployment/task-mcp-http -n task-mcp
   ```

### Troubleshooting Steps (5-15 minutes)
1. **Restart Service**
   ```bash
   kubectl rollout restart deployment/task-mcp-http -n task-mcp
   ```

2. **Scale Up Replicas**
   ```bash
   kubectl scale deployment task-mcp-http --replicas=3 -n task-mcp
   ```

3. **Check Resource Constraints**
   ```bash
   kubectl describe pod <pod-name> -n task-mcp
   ```

4. **Verify Dependencies**
   - Database connectivity
   - External service availability
   - Network connectivity

### Recovery Actions (15+ minutes)
1. **Rollback Previous Deployment**
   ```bash
   kubectl rollout undo deployment/task-mcp-http -n task-mcp
   ```

2. **Emergency Patch**
   - Apply hotfix if root cause identified
   - Test in staging first

3. **Scale Resources**
   - Increase CPU/memory limits
   - Add more replicas

---

## High Error Rate

### Symptoms
- Error rate > 1% for HTTP requests
- 5xx status codes increasing
- Alerts: `TaskMCPHighErrorRateFastBurn`, `TaskMCPHighErrorRateMediumBurn`

### Immediate Actions (0-5 minutes)
1. **Check Error Dashboard**
   - Grafana: Task MCP API Dashboard
   - Identify error patterns and affected endpoints

2. **Review Recent Logs**
   ```bash
   kubectl logs -f deployment/task-mcp-http -n task-mcp --since=5m | grep ERROR
   ```

3. **Check Service Dependencies**
   - Database connections
   - External API status
   - Network connectivity

### Troubleshooting Steps (5-15 minutes)
1. **Analyze Error Patterns**
   ```bash
   # Check specific error types
   kubectl logs deployment/task-mcp-http -n task-mcp | grep "500\|502\|503"
   
   # Check authentication errors
   kubectl logs deployment/task-mcp-http -n task-mcp | grep "auth\|unauthorized"
   ```

2. **Verify Configuration**
   - Environment variables
   - Connection strings
   - API keys and secrets

3. **Check Resource Utilization**
   ```bash
   kubectl top pods -n task-mcp
   ```

### Recovery Actions (15+ minutes)
1. **Scale Out Service**
   ```bash
   kubectl scale deployment task-mcp-http --replicas=5 -n task-mcp
   ```

2. **Implement Circuit Breaker**
   - Enable rate limiting
   - Add retry logic

3. **Rollback Recent Changes**
   ```bash
   kubectl rollout undo deployment/task-mcp-http -n task-mcp
   ```

---

## Performance Degradation

### Symptoms
- p95 latency > 200ms
- p99 latency > 500ms
- Slow response times
- Alerts: `TaskMCPLatencyDegradation`, `TaskMCPCriticalLatency`

### Immediate Actions (0-5 minutes)
1. **Check Latency Dashboard**
   - Grafana: Task MCP API Dashboard
   - Identify slow endpoints

2. **Monitor Active Requests**
   ```bash
   kubectl exec -it <pod-name> -n task-mcp -- curl http://localhost:3000/metrics
   ```

3. **Check Database Performance**
   - Query execution times
   - Connection pool status

### Troubleshooting Steps (5-15 minutes)
1. **Profile Application**
   ```bash
   # Enable profiling if available
   kubectl exec -it <pod-name> -n task-mcp -- curl http://localhost:3000/debug/pprof/
   ```

2. **Check Resource Contention**
   - CPU usage patterns
   - Memory pressure
   - I/O wait times

3. **Analyze Database Queries**
   - Slow query logs
   - Index usage
   - Connection pool saturation

### Recovery Actions (15+ minutes)
1. **Scale Resources**
   ```bash
   kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"cpu":"2000m","memory":"4Gi"}}}]}}}}'
   ```

2. **Optimize Database**
   - Add missing indexes
   - Tune connection pool
   - Implement caching

3. **Enable Caching**
   - Redis/Memcached for frequent queries
   - CDN for static assets

---

## Memory Issues

### Symptoms
- Memory usage > 85%
- OOM (Out of Memory) errors
- Frequent garbage collection
- Alerts: `TaskMCPHighMemoryUsage`, `TaskMCPCriticalMemoryUsage`

### Immediate Actions (0-5 minutes)
1. **Check Memory Dashboard**
   - Grafana: Task MCP Infrastructure Dashboard
   - Monitor heap usage trends

2. **Get Memory Dump**
   ```bash
   kubectl exec -it <pod-name> -n task-mcp -- node --inspect=0.0.0.0:9229
   ```

3. **Check for Memory Leaks**
   ```bash
   kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "memory\|heap"
   ```

### Troubleshooting Steps (5-15 minutes)
1. **Analyze Heap Usage**
   ```bash
   # Node.js heap dump
   kubectl exec -it <pod-name> -n task-mcp -- node --heap-prof
   ```

2. **Check Memory Hotspots**
   - Large object allocations
   - Memory leak patterns
   - Cache size growth

3. **Review Recent Changes**
   - New features deployed
   - Configuration changes
   - Data volume increases

### Recovery Actions (15+ minutes)
1. **Increase Memory Limits**
   ```bash
   kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"memory":"8Gi"}}}]}}}}'
   ```

2. **Restart Service**
   ```bash
   kubectl rollout restart deployment/task-mcp-http -n task-mcp
   ```

3. **Implement Memory Optimization**
   - Stream processing for large data
   - Connection pooling
   - Cache size limits

---

## CPU Issues

### Symptoms
- CPU usage > 80%
- High request processing times
- System responsiveness degradation
- Alerts: `TaskMCPHighCPUUsage`

### Immediate Actions (0-5 minutes)
1. **Check CPU Dashboard**
   - Grafana: Task MCP Infrastructure Dashboard
   - Identify CPU usage patterns

2. **Monitor Process CPU**
   ```bash
   kubectl top pods -n task-mcp --containers
   ```

3. **Check for CPU-intensive Operations**
   ```bash
   kubectl exec -it <pod-name> -n task-mcp -- top -p 1
   ```

### Troubleshooting Steps (5-15 minutes)
1. **Profile CPU Usage**
   ```bash
   kubectl exec -it <pod-name> -n task-mcp -- node --cpu-prof
   ```

2. **Identify CPU Hotspots**
   - Inefficient algorithms
   - Excessive logging
   - Synchronous operations

3. **Check External Dependencies**
   - Database query performance
   - API response times
   - Network latency

### Recovery Actions (15+ minutes)
1. **Scale Out Service**
   ```bash
   kubectl scale deployment task-mcp-http --replicas=5 -n task-mcp
   ```

2. **Increase CPU Limits**
   ```bash
   kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"cpu":"4000m"}}}]}}}}'
   ```

3. **Optimize Code**
   - Implement async/await patterns
   - Add caching layers
   - Optimize algorithms

---

## Streaming Issues

### Symptoms
- Streaming connections dropping
- High latency for first message
- Connection limit reached
- Alerts: `TaskMCPStreamingConnectionLimit`

### Immediate Actions (0-5 minutes)
1. **Check Streaming Dashboard**
   - Grafana: Task MCP Streaming Dashboard
   - Monitor active connections

2. **Verify Connection Limits**
   ```bash
   kubectl exec -it <pod-name> -n task-mcp -- curl http://localhost:3000/metrics | grep streaming
   ```

3. **Check Network Connectivity**
   ```bash
   kubectl exec -it <pod-name> -n task-mcp -- netstat -an | grep :3000
   ```

### Troubalshooting Steps (5-15 minutes)
1. **Analyze Connection Patterns**
   - Client connection behavior
   - Connection duration
   - Message throughput

2. **Check Resource Limits**
   - File descriptor limits
   - Memory per connection
   - Network buffers

3. **Review Client Implementation**
   - Connection retry logic
   - Error handling
   - Resource cleanup

### Recovery Actions (15+ minutes)
1. **Increase Connection Limits**
   - Update application configuration
   - Adjust system limits

2. **Scale Streaming Service**
   ```bash
   kubectl scale deployment task-mcp-http --replicas=5 -n task-mcp
   ```

3. **Implement Connection Pooling**
   - Reuse connections
   - Implement backpressure
   - Add connection timeouts

---

## Security Incidents

### Symptoms
- High authentication failure rate
- Suspicious request patterns
- Rate limit triggers
- Alerts: `TaskMCPHighAuthFailureRate`, `TaskMCPRateLimitHits`

### Immediate Actions (0-5 minutes)
1. **Check Security Dashboard**
   - Grafana: Task MCP Security Dashboard
   - Monitor authentication patterns

2. **Review Access Logs**
   ```bash
   kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "auth\|login\|failed"
   ```

3. **Check for Brute Force Attacks**
   ```bash
   kubectl logs deployment/task-mcp-http -n task-mcp | grep "401\|403" | tail -100
   ```

### Troubleshooting Steps (5-15 minutes)
1. **Analyze Attack Patterns**
   - Source IP addresses
   - Target endpoints
   - Attack frequency

2. **Verify Security Configuration**
   - Authentication settings
   - Rate limit rules
   - SSL/TLS certificates

3. **Check for Vulnerabilities**
   - Recent security patches
   - Dependency updates
   - Configuration changes

### Recovery Actions (15+ minutes)
1. **Block Malicious IPs**
   ```bash
   # Add IPs to firewall rules
   kubectl annotate pod <pod-name> firewall.blocked-ips="<ip1>,<ip2>" -n task-mcp
   ```

2. **Tighten Security**
   - Reduce rate limits
   - Enable additional authentication
   - Implement IP whitelisting

3. **Security Audit**
   - Review access logs
   - Check for data breaches
   - Update security policies

---

## SLO Violations

### Symptoms
- Error budget consumption high
- Burn rate alerts
- SLO compliance dropping
- Alerts: Various SLO burn rate alerts

### Immediate Actions (0-5 minutes)
1. **Check SLO Dashboard**
   - Grafana: Task MCP Overview Dashboard
   - Review error budget status

2. **Identify Affected SLOs**
   - Availability
   - Latency
   - Error rate
   - Throughput

3. **Assess Impact**
   - User experience impact
   - Business impact
   - System stability

### Troubleshooting Steps (5-15 minutes)
1. **Analyze Root Cause**
   - Correlate with other alerts
   - Review recent changes
   - Check system metrics

2. **Calculate Error Budget**
   - Current consumption rate
   - Time to exhaustion
   - Required improvements

3. **Implement Mitigation**
   - Scale resources
   - Enable caching
   - Optimize queries

### Recovery Actions (15+ minutes)
1. **Service Recovery**
   - Fix underlying issues
   - Scale appropriately
   - Monitor recovery

2. **Error Budget Recovery**
   - Implement performance improvements
   - Add redundancy
   - Optimize architecture

3. **SLO Adjustment**
   - Review targets if unrealistic
   - Update measurement methods
   - Improve monitoring

---

## Escalation Procedures

### Level 1: On-call Engineer
**Response Time:** 15 minutes
**Actions:**
- Initial assessment
- Basic troubleshooting
- Implement quick fixes
- Document findings

**Escalation Triggers:**
- Service down > 10 minutes
- Critical SLO violation
- Security incident
- Unknown root cause after 30 minutes

### Level 2: Engineering Lead
**Response Time:** 30 minutes
**Actions:**
- Deep investigation
- Coordinate response
- Implement complex fixes
- Communicate with stakeholders

**Escalation Triggers:**
- Service down > 30 minutes
- Multiple systems affected
- Major security breach
- Unknown root cause after 1 hour

### Level 3: Engineering Manager
**Response Time:** 1 hour
**Actions:**
- Major incident management
- External communication
- Resource allocation
- Business impact assessment

**Escalation Triggers:**
- Service down > 1 hour
- Critical business impact
- Customer data breach
- Executive attention required

### Communication Channels

**Internal:**
- Slack: #task-mcp-incidents
- Email: task-mcp-team@company.com
- PagerDuty: On-call rotation

**External:**
- Status page: status.company.com
- Customer support: support@company.com
- Executive team: exec@company.com

### Post-Incident Process

1. **Incident Review (24 hours)**
   - Timeline reconstruction
   - Root cause analysis
   - Impact assessment
   - Action items

2. **Blameless Post-mortem (48 hours)**
   - Technical details
   - Process improvements
   - Prevention measures
   - Documentation updates

3. **Follow-up (1 week)**
   - Action item completion
   - Monitoring improvements
   - Training requirements
   - Process updates

---

## Contact Information

### On-call Team
- **Primary:** oncall@company.com
- **Secondary:** backup@company.com
- **Escalation:** manager@company.com

### Support Teams
- **Infrastructure:** infra@company.com
- **Security:** security@company.com
- **Database:** dba@company.com
- **Network:** network@company.com

### External Contacts
- **Cloud Provider:** AWS Support
- **CDN Provider:** Cloudflare Support
- **DNS Provider:** Route53 Support
- **Monitoring Provider:** Grafana Labs Support

---

## Useful Commands

### Kubernetes
```bash
# Get pod status
kubectl get pods -n task-mcp

# Get service logs
kubectl logs -f deployment/task-mcp-http -n task-mcp

# Exec into pod
kubectl exec -it <pod-name> -n task-mcp -- /bin/bash

# Port forward
kubectl port-forward svc/task-mcp-http 3000:3000 -n task-mcp

# Scale deployment
kubectl scale deployment task-mcp-http --replicas=3 -n task-mcp

# Restart deployment
kubectl rollout restart deployment/task-mcp-http -n task-mcp
```

### Monitoring
```bash
# Check Prometheus targets
curl http://prometheus:9090/api/v1/targets

# Query Prometheus metrics
curl 'http://prometheus:9090/api/v1/query?query=up{job="task-mcp-http"}'

# Check AlertManager alerts
curl http://alertmanager:9093/api/v1/alerts

# Get Grafana health
curl http://grafana:3000/api/health
```

### Debugging
```bash
# Check network connectivity
kubectl exec -it <pod-name> -n task-mcp -- nslookup task-mcp-http

# Check resource usage
kubectl top pods -n task-mcp

# Check events
kubectl get events -n task-mcp --sort-by='.lastTimestamp'

# Describe pod
kubectl describe pod <pod-name> -n task-mcp
```

---

## Documentation Links

- **Service Documentation:** https://docs.company.com/task-mcp
- **Monitoring Guide:** https://docs.company.com/task-mcp/monitoring
- **Security Guide:** https://docs.company.com/task-mcp/security
- **Architecture:** https://docs.company.com/task-mcp/architecture
- **API Reference:** https://docs.company.com/task-mcp/api

---

*Last updated: 2025-10-26*
*Version: 1.0*