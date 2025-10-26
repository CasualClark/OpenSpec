# High Error Rate Runbook

## Overview

This runbook provides procedures for responding to high error rate incidents for the Task MCP HTTP server. High error rate is defined as error rates exceeding the SLO threshold of 1% for HTTP requests.

## Symptoms

- HTTP error rate > 1% for sustained periods
- 5xx status codes increasing
- 4xx status codes elevated
- Alerts: `TaskMCPHighErrorRateFastBurn`, `TaskMCPHighErrorRateMediumBurn`, `TaskMCPHighErrorRateSlowBurn`
- User complaints about failed requests
- SLO error budget consumption accelerating

## Immediate Actions (0-5 minutes)

### 1. Assess Error Rate Impact
```bash
# Check current error rate in Grafana
# Dashboard: task-mcp-api
# Panel: HTTP Error Rate

# Check error breakdown
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_requests_total{status=~"5.."}[5m])) / sum(rate(http_server_requests_total[5m])) * 100'

# Check specific error codes
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum by (status) (rate(http_server_requests_total{status=~"4..|5.."}[5m]))'
```

### 2. Review Recent Logs
```bash
# Get recent error logs
kubectl logs -f deployment/task-mcp-http -n task-mcp --since=5m | grep -i "error\|exception\|fail"

# Check HTTP error patterns
kubectl logs deployment/task-mcp-http -n task-mcp --since=10m | grep -E "HTTP [45][0-9][0-9]"

# Check application errors
kubectl logs deployment/task-mcp-http -n task-mcp --since=10m | jq 'select(.level == "error")'
```

### 3. Identify Affected Endpoints
```bash
# Check error rate by endpoint
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum by (route) (rate(http_server_requests_total{status=~"5.."}[5m]))'

# Check top error sources
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=topk(10, sum by (route) (rate(http_server_requests_total{status=~"4..|5.."}[5m])))'
```

### 4. Verify Service Dependencies
```bash
# Check database connectivity
kubectl exec -it <pod-name> -n task-mcp -- curl -f http://database:5432/health

# Check external service status
kubectl exec -it <pod-name> -n task-mcp -- curl -f https://external-service.com/health

# Check network connectivity
kubectl exec -it <pod-name> -n task-mcp -- ping -c 3 google.com
```

## Troubleshooting Steps (5-15 minutes)

### 1. Analyze Error Patterns

#### HTTP 5xx Errors (Server Errors)
```bash
# Check 500 errors
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep " 500 "

# Check 502 errors (Bad Gateway)
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep " 502 "

# Check 503 errors (Service Unavailable)
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep " 503 "

# Check 504 errors (Gateway Timeout)
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep " 504 "
```

#### HTTP 4xx Errors (Client Errors)
```bash
# Check 400 errors (Bad Request)
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep " 400 "

# Check 401 errors (Unauthorized)
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep " 401 "

# Check 403 errors (Forbidden)
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep " 403 "

# Check 429 errors (Too Many Requests)
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep " 429 "
```

#### Application Errors
```bash
# Check JavaScript errors
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep -i "error\|exception"

# Check timeout errors
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep -i "timeout"

# Check memory errors
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep -i "memory\|heap"
```

### 2. Check Configuration Issues

#### Authentication Issues
```bash
# Check auth failures
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep -i "auth\|unauthorized\|forbidden"

# Check token validation
curl -X POST https://task-mcp.example.com/mcp \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"tool":"change.open","input":{"slug":"test"}}'

# Check rate limiting
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(rate_limit_hits_total[5m]))'
```

#### Resource Issues
```bash
# Check CPU usage
kubectl top pods -n task-mcp -l app=task-mcp-http

# Check memory usage
kubectl exec -it <pod-name> -n task-mcp -- cat /proc/meminfo

# Check file descriptors
kubectl exec -it <pod-name> -n task-mcp -- lsof | wc -l

# Check disk space
kubectl exec -it <pod-name> -n task-mcp -- df -h
```

### 3. Database and External Dependencies

#### Database Issues
```bash
# Check database connections
kubectl exec -it <pod-name> -n task-mcp -- netstat -an | grep :5432

# Check database query performance
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep -i "slow query\|timeout"

# Check database errors
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep -i "database\|connection"
```

#### External Service Issues
```bash
# Check external API calls
kubectl logs deployment/task-mcp-http -n task-mcp --since=15m | grep -i "external\|api"

# Check network latency
kubectl exec -it <pod-name> -n task-mcp -- ping -c 5 external-service.com

# Check DNS resolution
kubectl exec -it <pod-name> -n task-mcp -- nslookup external-service.com
```

## Recovery Actions (15+ minutes)

### 1. Immediate Mitigation

#### Scale Out Service
```bash
# Increase replicas to distribute load
kubectl scale deployment task-mcp-http --replicas=5 -n task-mcp

# Monitor scaling progress
kubectl get pods -n task-mcp -l app=task-mcp-http -w

# Check error rate after scaling
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_requests_total{status=~"5.."}[1m])) / sum(rate(http_server_requests_total[1m])) * 100'
```

#### Implement Rate Limiting
```bash
# Tighten rate limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"RATE_LIMIT","value":"30"}]}]}}}}'

# Restart to apply changes
kubectl rollout restart deployment/task-mcp-http -n task-mcp
```

#### Enable Circuit Breaker
```bash
# Update configuration to enable circuit breaker
kubectl patch configmap task-mcp-config -n task-mcp --patch '{"data":{"circuit_breaker_enabled":"true"}}'

# Restart service
kubectl rollout restart deployment/task-mcp-http -n task-mcp
```

### 2. Configuration Fixes

#### Update Resource Limits
```bash
# Increase CPU limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"cpu":"2000m"}}}]}}}}'

# Increase memory limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"memory":"4Gi"}}}]}}}}'
```

#### Adjust Timeouts
```bash
# Increase request timeout
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"REQUEST_TIMEOUT","value":"30000"}]}]}}}}'

# Increase database timeout
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"DB_TIMEOUT","value":"10000"}]}]}}}}'
```

### 3. Code and Deployment Fixes

#### Rollback Recent Changes
```bash
# Check deployment history
kubectl rollout history deployment/task-mcp-http -n task-mcp

# Rollback to previous version
kubectl rollout undo deployment/task-mcp-http -n task-mcp

# Monitor rollback progress
kubectl rollout status deployment/task-mcp-http -n task-mcp --timeout=300s
```

#### Apply Hotfix
```bash
# Deploy emergency fix
kubectl set image deployment/task-mcp-http task-mcp-http=task-mcp-http:hotfix-v1.0.1 -n task-mcp

# Monitor deployment
kubectl rollout status deployment/task-mcp-http -n task-mcp
```

#### Disable Problematic Features
```bash
# Disable feature flag
kubectl patch configmap task-mcp-config -n task-mcp --patch '{"data":{"feature_x_enabled":"false"}}'

# Restart service
kubectl rollout restart deployment/task-mcp-http -n task-mcp
```

## Verification Steps

### 1. Error Rate Verification
```bash
# Check current error rate
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_requests_total{status=~"5.."}[5m])) / sum(rate(http_server_requests_total[5m])) * 100'

# Verify error rate is below threshold (< 1%)
# Check error rate trend over last 15 minutes
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=sum(rate(http_server_requests_total{status=~"5.."}[5m])) / sum(rate(http_server_requests_total[5m])) * 100' \
  --data-urlencode 'start=15m' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1m'
```

### 2. Service Health Verification
```bash
# Test API endpoints
curl -X POST https://task-mcp.example.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"change.open","input":{"slug":"test"}}'

# Test health endpoints
curl -f https://task-mcp.example.com/health/live
curl -f https://task-mcp.example.com/health/ready
```

### 3. Monitoring Verification
```bash
# Check Grafana dashboards
# task-mcp-api: Error rate should be below 1%
# task-mcp-overview: Service status should be healthy

# Verify alerts have cleared
curl http://alertmanager:9093/api/v1/alerts | jq '.data.alerts[] | select(.labels.alertname=="TaskMCPHighErrorRateFastBurn")'
```

## Communication Procedures

### 1. Internal Communication
- **Slack**: #task-mcp-incidents channel
- **Status Updates**: Every 15 minutes during incident
- **Root Cause**: Share findings as they are discovered
- **Resolution**: Announce when error rate returns to normal

### 2. External Communication
- **Status Page**: Update if customer impact > 5 minutes
- **Customer Support**: Notify if error rate affects customers
- **Management**: Escalate if business impact is significant

### 3. Incident Documentation
- Create incident ticket with detailed timeline
- Document error patterns and root cause
- Capture recovery actions taken
- Update runbooks based on findings

## Prevention Measures

### 1. Monitoring Improvements
- Add more granular error rate alerts
- Implement error pattern detection
- Set up predictive alerting
- Monitor error rate by endpoint

### 2. Infrastructure Improvements
- Implement auto-scaling based on error rate
- Add circuit breakers for external dependencies
- Configure proper resource limits
- Implement canary deployments

### 3. Application Improvements
- Add better error handling and logging
- Implement retry logic with exponential backoff
- Add comprehensive health checks
- Improve input validation

## Specific Error Scenarios

### Scenario A: Database Connection Errors
```bash
# Symptoms: 503 errors, connection timeout messages
# Actions:
1. Check database connectivity
2. Increase connection pool size
3. Add database connection retry logic
4. Scale database if needed
```

### Scenario B: Authentication Failures
```bash
# Symptoms: 401/403 errors, auth service issues
# Actions:
1. Check authentication service status
2. Verify token configuration
3. Check auth service connectivity
4. Implement auth service fallback
```

### Scenario C: Resource Exhaustion
```bash
# Symptoms: 503 errors, memory/CPU issues
# Actions:
1. Check resource utilization
2. Scale up resources
3. Implement resource limits
4. Add resource monitoring
```

### Scenario D: External Service Failures
```bash
# Symptoms: 502/504 errors, timeout messages
# Actions:
1. Check external service status
2. Implement circuit breakers
3. Add timeout configurations
4. Provide graceful degradation
```

## Escalation Triggers

### Escalate to Engineering Lead if:
- Error rate > 5% for more than 5 minutes
- Multiple endpoints affected
- Root cause unknown after initial investigation
- Customer impact increasing

### Escalate to Engineering Manager if:
- Error rate > 10% for more than 10 minutes
- Critical business functions affected
- Customer complaints significant
- External communication required

## Related Runbooks

- [Service Downtime](service-downtime.md)
- [Performance Degradation](performance-degradation.md)
- [Memory Issues](memory-issues.md)
- [CPU Issues](cpu-issues.md)
- [Security Incidents](security-incidents.md)

## Contact Information

| Role | Contact | When to Contact |
|------|---------|-----------------|
| On-call Engineer | oncall@company.com | First point of contact |
| Engineering Lead | eng-lead@company.com | Escalation after 5 minutes |
| Engineering Manager | eng-manager@company.com | Escalation after 10 minutes |
| Database Team | dba@company.com | Database-related issues |
| Security Team | security@company.com | Authentication issues |

---

*Last updated: 2025-10-26*
*Version: 1.0*