# Service Downtime Runbook

## Overview

This runbook provides step-by-step procedures for responding to service downtime incidents for the Task MCP HTTP server. Service downtime is defined as the inability of the service to respond to legitimate requests.

## Symptoms

- Service status shows "DOWN" in monitoring dashboards
- Health check failures (`/health/live`, `/health/ready`)
- No metrics being collected by Prometheus
- HTTP 5xx errors or connection timeouts
- Alerts: `TaskMCPHealthCheckFailure`, `TaskMCPServiceDown`

## Immediate Actions (0-5 minutes)

### 1. Verify Service Status
```bash
# Check pod status
kubectl get pods -n task-mcp -l app=task-mcp-http

# Check pod details
kubectl describe pods -n task-mcp -l app=task-mcp-http

# Check recent events
kubectl get events -n task-mcp --sort-by='.lastTimestamp' | tail -20
```

### 2. Check Service Logs
```bash
# Get recent logs
kubectl logs -f deployment/task-mcp-http -n task-mcp --since=5m

# Check for crash patterns
kubectl logs deployment/task-mcp-http -n task-mcp --previous | grep -i error

# Check all pods
kubectl logs -l app=task-mcp-http -n task-mcp --tail=100
```

### 3. Verify Health Endpoints
```bash
# Test liveness probe
kubectl exec -it <pod-name> -n task-mcp -- curl -f http://localhost:3000/health/live

# Test readiness probe
kubectl exec -it <pod-name> -n task-mcp -- curl -f http://localhost:3000/health/ready

# Test from external
curl -f https://task-mcp.example.com/health/live
```

### 4. Check Recent Deployments
```bash
# Check rollout history
kubectl rollout history deployment/task-mcp-http -n task-mcp

# Check current revision
kubectl rollout status deployment/task-mcp-http -n task-mcp

# Check deployment details
kubectl describe deployment task-mcp-http -n task-mcp
```

## Troubleshooting Steps (5-15 minutes)

### 1. Identify Root Cause Category

#### Pod Issues
```bash
# Check if pods are running
kubectl get pods -n task-mcp -l app=task-mcp-http --field-selector=status.phase!=Running

# Check pod status details
kubectl get pods -n task-mcp -l app=task-mcp-http -o wide

# Check resource constraints
kubectl describe pod <pod-name> -n task-mcp | grep -A 10 "Limits\|Requests"
```

#### Resource Issues
```bash
# Check resource usage
kubectl top pods -n task-mcp -l app=task-mcp-http

# Check node resources
kubectl top nodes

# Check resource quotas
kubectl describe quota -n task-mcp
```

#### Network Issues
```bash
# Check service endpoints
kubectl get endpoints task-mcp-http -n task-mcp

# Check network policies
kubectl get networkpolicies -n task-mcp

# Test connectivity
kubectl exec -it <pod-name> -n task-mcp -- nslookup task-mcp-http
```

#### Configuration Issues
```bash
# Check configmaps
kubectl get configmaps -n task-mcp | grep task-mcp

# Check secrets
kubectl get secrets -n task-mcp | grep task-mcp

# Check environment variables
kubectl exec -it <pod-name> -n task-mcp -- env | grep -E "^TASK_MCP|^PORT|^HOST"
```

### 2. Common Scenarios and Solutions

#### Scenario A: Pod Crash Looping
```bash
# Identify crash reason
kubectl describe pod <pod-name> -n task-mcp

# Check previous container logs
kubectl logs <pod-name> -n task-mcp --previous

# Common fixes:
# - Resource limits too low
# - Configuration errors
# - Dependency failures
```

#### Scenario B: Pod Pending
```bash
# Check scheduling issues
kubectl describe pod <pod-name> -n task-mcp | grep -A 10 "Events"

# Common fixes:
# - Insufficient resources
# - Taints/Tolerations mismatch
# - Image pull issues
```

#### Scenario C: Service Not Ready
```bash
# Check service configuration
kubectl describe service task-mcp-http -n task-mcp

# Check selector match
kubectl get pods -n task-mcp -l app=task-mcp-http --show-labels

# Check endpoint creation
kubectl get endpoints task-mcp-http -n task-mcp
```

## Recovery Actions (15+ minutes)

### 1. Quick Recovery Options

#### Restart Service
```bash
# Restart deployment
kubectl rollout restart deployment/task-mcp-http -n task-mcp

# Monitor restart progress
kubectl rollout status deployment/task-mcp-http -n task-mcp --timeout=300s
```

#### Scale Up Replicas
```bash
# Increase replicas for redundancy
kubectl scale deployment task-mcp-http --replicas=3 -n task-mcp

# Check scaling status
kubectl get pods -n task-mcp -l app=task-mcp-http -w
```

#### Force New Pod
```bash
# Delete problematic pods
kubectl delete pod <pod-name> -n task-mcp --force

# Wait for new pods to be created
kubectl get pods -n task-mcp -l app=task-mcp-http -w
```

### 2. Configuration Fixes

#### Update Resource Limits
```bash
# Increase memory limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"memory":"2Gi"}}}]}}}}'

# Increase CPU limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"cpu":"1000m"}}}]}}}}'
```

#### Update Environment Variables
```bash
# Patch environment variables
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"LOG_LEVEL","value":"debug"}]}]}}}}'
```

### 3. Advanced Recovery

#### Rollback Previous Deployment
```bash
# Check rollout history
kubectl rollout history deployment/task-mcp-http -n task-mcp

# Rollback to previous revision
kubectl rollout undo deployment/task-mcp-http -n task-mcp

# Rollback to specific revision
kubectl rollout undo deployment/task-mcp-http -n task-mcp --to-revision=2
```

#### Emergency Patch
```bash
# Edit deployment directly (use with caution)
kubectl edit deployment task-mcp-http -n task-mcp

# Or apply patch from file
kubectl patch deployment task-mcp-http -n task-mcp --patch-file=emergency-patch.json
```

#### Manual Intervention
```bash
# Exec into pod for debugging
kubectl exec -it <pod-name> -n task-mcp -- /bin/bash

# Check process status
ps aux | grep node

# Check port binding
netstat -tlnp | grep :3000

# Manual health check
curl -f http://localhost:3000/health/live
```

## Verification Steps

### 1. Service Health Verification
```bash
# All pods running
kubectl get pods -n task-mcp -l app=task-mcp-http

# All pods ready
kubectl get pods -n task-mcp -l app=task-mcp-http --field-selector=status.phase=Running

# Health endpoints responding
curl -f https://task-mcp.example.com/health/live
curl -f https://task-mcp.example.com/health/ready
```

### 2. Functionality Verification
```bash
# Test API endpoint
curl -X POST https://task-mcp.example.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"change.open","input":{"slug":"test"}}'

# Test metrics endpoint
curl https://task-mcp.example.com/metrics

# Check monitoring dashboards
# Grafana: task-mcp-overview dashboard should show healthy status
```

### 3. Monitoring Verification
```bash
# Check Prometheus targets
curl http://prometheus:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="task-mcp-http")'

# Check metrics collection
curl 'http://prometheus:9090/api/v1/query?query=up{job="task-mcp-http"}'

# Verify alerts cleared
curl http://alertmanager:9093/api/v1/alerts | jq '.data.alerts[] | select(.labels.alertname=="TaskMCPHealthCheckFailure")'
```

## Communication Procedures

### 1. Internal Communication
- **Slack**: Post updates in #task-mcp-incidents
- **Status**: Use standard status format (Investigating, Identified, Monitoring, Resolved)
- **Timeline**: Document key actions and timestamps

### 2. External Communication
- **Status Page**: Update if downtime exceeds 5 minutes
- **Customer Support**: Notify if customer impact is expected
- **Management**: Escalate if business impact is significant

### 3. Incident Documentation
- Create incident ticket with detailed timeline
- Document root cause analysis
- Capture lessons learned
- Update runbooks based on findings

## Prevention Measures

### 1. Monitoring Improvements
- Add more granular health checks
- Implement synthetic monitoring
- Set up predictive alerting
- Monitor resource usage trends

### 2. Infrastructure Improvements
- Implement pod disruption budgets
- Add horizontal pod autoscaling
- Configure resource quotas properly
- Implement multi-zone deployment

### 3. Process Improvements
- Improve deployment procedures
- Add more testing stages
- Implement canary deployments
- Regular chaos engineering exercises

## Escalation Triggers

### Escalate to Engineering Lead if:
- Service down > 10 minutes
- Multiple restart attempts failed
- Root cause unknown after initial investigation
- Business impact increasing

### Escalate to Engineering Manager if:
- Service down > 30 minutes
- Critical business functions affected
- Customer complaints increasing
- External communication required

## Related Runbooks

- [High Error Rate](high-error-rate.md)
- [Performance Degradation](performance-degradation.md)
- [Memory Issues](memory-issues.md)
- [CPU Issues](cpu-issues.md)

## Contact Information

| Role | Contact | When to Contact |
|------|---------|-----------------|
| On-call Engineer | oncall@company.com | First point of contact |
| Engineering Lead | eng-lead@company.com | Escalation after 10 minutes |
| Engineering Manager | eng-manager@company.com | Escalation after 30 minutes |
| Infrastructure Team | infra@company.com | Infrastructure-related issues |
| Security Team | security@company.com | Security-related incidents |

---

*Last updated: 2025-10-26*
*Version: 1.0*