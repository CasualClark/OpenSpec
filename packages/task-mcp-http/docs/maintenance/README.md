# Maintenance Guide - Task MCP HTTP Server

This guide provides comprehensive procedures for maintaining the Task MCP HTTP server and its observability stack to ensure optimal performance and reliability.

## Overview

Regular maintenance is critical for the long-term health and performance of the Task MCP HTTP server. This guide covers scheduled maintenance, emergency procedures, and best practices for keeping the system running smoothly.

## Maintenance Schedule

### Daily Tasks

#### Health Checks
```bash
# Check service status
kubectl get pods -n task-mcp -l app=task-mcp-http

# Verify health endpoints
curl -f https://task-mcp.example.com/health/live
curl -f https://task-mcp.example.com/health/ready

# Check resource usage
kubectl top pods -n task-mcp -l app=task-mcp-http

# Review error rates
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_requests_total{status=~"5.."}[5m])) / sum(rate(http_server_requests_total[5m])) * 100'
```

#### Log Review
```bash
# Check for critical errors
kubectl logs deployment/task-mcp-http -n task-mcp --since=24h | grep -i "critical\|fatal"

# Review authentication failures
kubectl logs deployment/task-mcp-http -n task-mcp --since=24h | grep -i "auth.*fail"

# Check for performance issues
kubectl logs deployment/task-mcp-http -n task-mcp --since=24h | grep -i "timeout\|slow"
```

#### SLO Monitoring
```bash
# Check SLO compliance
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=task_mcp:api_success_rate:30d'

# Check error budget consumption
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=task_mcp:error_budget_remaining:30d'
```

### Weekly Tasks

#### Performance Analysis
```bash
# Analyze latency trends
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_request_duration_bucket[7d])) by (le))' \
  --data-urlencode 'start=7d' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1h'

# Check throughput trends
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=sum(rate(http_server_requests_total[5m]))' \
  --data-urlencode 'start=7d' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1h'
```

#### Resource Planning
```bash
# Review resource utilization
kubectl top nodes
kubectl top pods -n task-mcp

# Check scaling events
kubectl get events -n task-mcp --sort-by='.lastTimestamp' | grep -i "scale"

# Analyze storage usage
kubectl exec -it <pod-name> -n task-mcp -- df -h
```

#### Security Review
```bash
# Check security events
kubectl logs deployment/task-mcp-http -n task-mcp --since=7d | grep -i "security\|audit"

# Review authentication patterns
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=sum(rate(auth_attempts_total{status="failed"}[5m]))' \
  --data-urlencode 'start=7d' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1h'

# Check rate limit effectiveness
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=sum(rate(rate_limit_hits_total[5m]))' \
  --data-urlencode 'start=7d' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1h'
```

### Monthly Tasks

#### System Updates
```bash
# Check for security updates
kubectl get pods -n task-mcp -o jsonpath='{.items[*].spec.containers[*].image}' | tr ' ' '\n' | sort | uniq

# Review dependency updates
cd packages/task-mcp-http
npm outdated

# Check Kubernetes version updates
kubectl version
```

#### Capacity Planning
```bash
# Analyze growth trends
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=sum(rate(http_server_requests_total[5m]))' \
  --data-urlencode 'start=30d' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1d'

# Project future needs
# (Use external tools or spreadsheets for trend analysis)
```

#### Documentation Updates
- Review and update runbooks
- Update SLO documentation
- Refresh onboarding materials
- Archive old incident reports

### Quarterly Tasks

#### Architecture Review
- Evaluate current architecture
- Assess scalability needs
- Review technology choices
- Plan major upgrades

#### Performance Optimization
- Conduct performance audits
- Optimize database queries
- Review caching strategies
- Analyze bottlenecks

#### Security Audit
- Conduct security assessment
- Review access controls
- Update security policies
- Perform penetration testing

## Observability Stack Maintenance

### Prometheus Maintenance

#### Regular Tasks
```bash
# Check Prometheus health
curl http://prometheus:9090/api/v1/status/config

# Review storage usage
curl http://prometheus:9090/api/v1/status/tsdb

# Check target health
curl http://prometheus:9090/api/v1/targets

# Review rule performance
curl http://prometheus:9090/api/v1/rules'
```

#### Storage Management
```bash
# Check disk usage
kubectl exec -it prometheus-<pod> -n task-mcp-monitoring -- df -h

# Review retention settings
kubectl get configmap prometheus-config -n task-mcp-monitoring -o yaml

# Compact storage if needed
kubectl exec -it prometheus-<pod> -n task-mcp-monitoring -- promtool tsdb compact /prometheus
```

#### Configuration Updates
```bash
# Reload configuration
curl -X POST http://prometheus:9090/-/reload

# Validate configuration
kubectl exec -it prometheus-<pod> -n task-mcp-monitoring -- promtool check config /etc/prometheus/prometheus.yml

# Test rule files
kubectl exec -it prometheus-<pod> -n task-mcp-monitoring -- promtool check rules /etc/prometheus/rules/*.yml
```

### Grafana Maintenance

#### Dashboard Management
```bash
# Export dashboards for backup
curl -u admin:password http://grafana:3000/api/dashboards/search > dashboards.json

# Check dashboard health
curl -u admin:password http://grafana:3000/api/health

# Review data source status
curl -u admin:password http://grafana:3000/api/datasources
```

#### User Management
```bash
# Review user accounts
curl -u admin:password http://grafana:3000/api/users

# Check permissions
curl -u admin:password http://grafana:3000/api/teams

# Update API keys
curl -u admin:password http://grafana:3000/api/auth/keys
```

#### Plugin Updates
```bash
# List installed plugins
kubectl exec -it grafana-<pod> -n task-mcp-monitoring -- grafana-cli plugins ls

# Update plugins
kubectl exec -it grafana-<pod> -n task-mcp-monitoring -- grafana-cli plugins update-all

# Install new plugins
kubectl exec -it grafana-<pod> -n task-mcp-monitoring -- grafana-cli plugins install <plugin-name>
```

### AlertManager Maintenance

#### Configuration Management
```bash
# Test alert routing
curl -X POST http://alertmanager:9093/api/v1/alerts -d '[{"labels":{"alertname":"Test"}}]'

# Check configuration
curl http://alertmanager:9093/api/v1/status

# Review silence rules
curl http://alertmanager:9093/api/v1/silences
```

#### Notification Testing
```bash
# Test Slack integration
curl -X POST https://hooks.slack.com/services/... -d '{"text":"Test notification"}'

# Test email configuration
# (Send test email through your email system)

# Test PagerDuty integration
# (Use PagerDuty API to test integration)
```

### OpenTelemetry Maintenance

#### Collector Management
```bash
# Check collector health
curl http://otel-collector:4318/health

# Review configuration
kubectl get configmap otel-collector-config -n task-mcp-monitoring -o yaml

# Check telemetry pipeline
curl http://otel-collector:4318/metrics
```

#### Performance Monitoring
```bash
# Check collector performance
curl http://otel-collector:4318/metrics | grep otelcol_

# Monitor sampling rates
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(otel_traces_sampler_sampled_total[5m])) / sum(rate(otel_traces_sampler_total[5m]))'

# Check for dropped spans/metrics
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(otel_processor_dropped_spans_total[5m]))'
```

## Application Maintenance

### Node.js Runtime Updates

#### Version Management
```bash
# Check current Node.js version
kubectl exec -it <pod-name> -n task-mcp -- node --version

# Review available updates
# Check Node.js release notes and security advisories

# Plan upgrade path
# Test in staging first
# Roll out gradually
```

#### Dependency Management
```bash
# Check for outdated dependencies
cd packages/task-mcp-http
npm outdated

# Update dependencies
npm update

# Audit for security vulnerabilities
npm audit

# Fix security issues
npm audit fix
```

### Configuration Management

#### Environment Variables
```bash
# Review current configuration
kubectl exec -it <pod-name> -n task-mcp -- env | grep TASK_MCP

# Update configuration
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"LOG_LEVEL","value":"info"}]}]}}}}'

# Validate configuration
kubectl exec -it <pod-name> -n task-mcp -- curl http://localhost:3000/health/ready
```

#### Secrets Management
```bash
# Review secrets
kubectl get secrets -n task-mcp | grep task-mcp

# Rotate secrets
kubectl create secret generic new-auth-tokens --from-literal=tokens="new-token1,new-token2" -n task-mcp --dry-run=client -o yaml | kubectl apply -f -

# Update secret references
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":[{"name":"task-mcp-http","envFrom":[{"secretRef":{"name":"new-auth-tokens"}}]}]}}}'
```

### Database Maintenance

#### Performance Optimization
```bash
# Check slow queries
kubectl logs deployment/task-mcp-http -n task-mcp | grep -i "slow query"

# Analyze query performance
# Use database-specific tools

# Update statistics
kubectl exec -it database-pod -n database -- psql -U user -d dbname -c "ANALYZE;"
```

#### Backup and Recovery
```bash
# Create backup
kubectl exec -it database-pod -n database -- pg_dump dbname > backup.sql

# Verify backup
# Test restore process

# Clean old backups
kubectl exec -it database-pod -n database -- find /backups -name "*.sql" -mtime +30 -delete
```

## Security Maintenance

### Certificate Management

#### TLS Certificate Updates
```bash
# Check certificate expiration
kubectl exec -it <pod-name> -n task-mcp -- openssl x509 -in /etc/ssl/certs/server.crt -noout -dates

# Update certificates
kubectl create secret tls task-mcp-tls --cert=path/to/tls.crt --key=path/to/tls.key -n task-mcp --dry-run=client -o yaml | kubectl apply -f -

# Restart service
kubectl rollout restart deployment/task-mcp-http -n task-mcp
```

#### Certificate Monitoring
```bash
# Set up certificate expiry monitoring
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=ssl_certificate_expiry_days'

# Alert on upcoming expiration
# Configure AlertManager rules for certificate expiry
```

### Access Control

#### RBAC Review
```bash
# Review current permissions
kubectl auth can-i --list --as=system:serviceaccount:task-mcp:default

# Update roles if needed
kubectl apply -f rbac-updates.yaml

# Test access
kubectl auth can-i create pods --as=system:serviceaccount:task-mcp:task-mcp-service
```

#### Security Policies
```bash
# Review network policies
kubectl get networkpolicies -n task-mcp

# Update security contexts
kubectl get pod <pod-name> -n task-mcp -o jsonpath='{.spec.securityContext}'

# Validate policy compliance
kubectl get pods -n task-mcp -o jsonpath='{.items[*].spec.securityContext}'
```

## Performance Maintenance

### Resource Optimization

#### CPU and Memory Tuning
```bash
# Analyze resource usage patterns
kubectl top pods -n task-mcp --containers

# Update resource limits
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","resources":{"limits":{"cpu":"2000m","memory":"4Gi"}}}]}}}}'

# Monitor impact
kubectl get events -n task-mcp --sort-by='.lastTimestamp' | tail -10
```

#### Autoscaling Configuration
```bash
# Review HPA settings
kubectl get hpa -n task-mcp

# Update scaling thresholds
kubectl patch hpa task-mcp-http -n task-mcp -p '{"spec":{"metrics":[{"resource":{"name":"cpu","target":{"type":"Utilization","averageUtilization":70}}}]}'

# Test scaling
kubectl scale deployment task-mcp-http --replicas=5 -n task-mcp
```

### Caintenance Optimization

#### Cache Management
```bash
# Check cache hit rates
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=cache_hit_ratio'

# Clear cache if needed
kubectl exec -it <pod-name> -n task-mcp -- curl -X POST http://localhost:3000/admin/cache/clear

# Tune cache settings
kubectl patch configmap task-mcp-config -n task-mcp --patch '{"data":{"cache_ttl":"300","cache_size":"1000"}}'
```

#### Database Optimization
```bash
# Check connection pool usage
curl -G 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=database_connections_active'

# Optimize connection settings
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"DB_POOL_SIZE","value":"20"}]}]}}}}'

# Monitor performance impact
curl -G 'http://prometheus:9090/api/v1/query_range' \
  --data-urlencode 'query=database_query_duration_seconds' \
  --data-urlencode 'start=1h' \
  --data-urlencode 'end=now' \
  --data-urlencode 'step=1m'
```

## Emergency Maintenance

### Incident Response

#### Quick Assessment
```bash
# Check service status
kubectl get pods -n task-mcp -l app=task-mcp-http

# Review recent errors
kubectl logs deployment/task-mcp-http -n task-mcp --since=1h | grep -i "error\|exception"

# Check resource constraints
kubectl describe pod <pod-name> -n task-mcp | grep -A 10 "Limits\|Requests"
```

#### Immediate Actions
```bash
# Restart service if needed
kubectl rollout restart deployment/task-mcp-http -n task-mcp

# Scale up resources
kubectl scale deployment task-mcp-http --replicas=5 -n task-mcp

# Enable debug logging
kubectl patch deployment task-mcp-http -n task-mcp -p '{"spec":{"template":{"spec":{"containers":[{"name":"task-mcp-http","env":[{"name":"LOG_LEVEL","value":"debug"}]}]}}}}'
```

### Hotfix Procedures

#### Emergency Patch
```bash
# Apply hotfix
kubectl set image deployment/task-mcp-http task-mcp-http=task-mcp-http:hotfix-v1.0.1 -n task-mcp

# Monitor rollout
kubectl rollout status deployment/task-mcp-http -n task-mcp --timeout=300s

# Verify fix
curl -f https://task-mcp.example.com/health/live
```

#### Rollback if Needed
```bash
# Check rollout history
kubectl rollout history deployment/task-mcp-http -n task-mcp

# Rollback to previous version
kubectl rollout undo deployment/task-mcp-http -n task-mcp

# Verify rollback
kubectl get pods -n task-mcp -l app=task-mcp-http
```

## Maintenance Automation

### Scheduled Tasks

#### Kubernetes CronJobs
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: task-mcp-daily-health-check
  namespace: task-mcp
spec:
  schedule: "0 8 * * *"  # Daily at 8 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: health-check
            image: curlimages/curl:latest
            command:
            - /bin/sh
            - -c
            - |
              curl -f https://task-mcp.example.com/health/live || \
              curl -X POST https://hooks.slack.com/services/... -d '{"text":"Health check failed"}'
          restartPolicy: OnFailure
```

#### Monitoring Scripts
```bash
#!/bin/bash
# maintenance-check.sh

# Check service health
if ! curl -f https://task-mcp.example.com/health/live; then
  echo "Health check failed" >&2
  exit 1
fi

# Check error rate
ERROR_RATE=$(curl -s 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_requests_total{status=~"5.."}[5m])) / sum(rate(http_server_requests_total[5m])) * 100' \
  | jq -r '.data.result[0].value[1]')

if (( $(echo "$ERROR_RATE > 1" | bc -l) )); then
  echo "High error rate: $ERROR_RATE%" >&2
  exit 1
fi

echo "All checks passed"
```

### Automated Updates

#### Dependency Updates
```bash
#!/bin/bash
# update-dependencies.sh

cd packages/task-mcp-http

# Update patch versions
npm update

# Check for security updates
npm audit

# Run tests
npm test

# If tests pass, create PR
if [ $? -eq 0 ]; then
  git add package.json package-lock.json
  git commit -m "chore: update dependencies"
  git push origin update-dependencies
  # Create PR using your API
fi
```

#### Certificate Renewal
```bash
#!/bin/bash
# renew-certificates.sh

# Check certificate expiry
EXPIRY_DAYS=$(kubectl exec -it <pod-name> -n task-mcp -- openssl x509 -in /etc/ssl/certs/server.crt -noout -checkend 2592000 | grep -c "not expire")

if [ $EXPIRY_DAYS -eq 0 ]; then
  echo "Certificate expires within 30 days, renewing..."
  
  # Generate new certificate
  # (Your certificate renewal process)
  
  # Update Kubernetes secret
  kubectl create secret tls task-mcp-tls --cert=new-cert.crt --key=new-key.key -n task-mcp --dry-run=client -o yaml | kubectl apply -f -
  
  # Restart service
  kubectl rollout restart deployment/task-mcp-http -n task-mcp
  
  echo "Certificate renewed successfully"
fi
```

## Maintenance Documentation

### Change Management

#### Maintenance Windows
- **Scheduled Maintenance**: Every Sunday 2-4 AM UTC
- **Emergency Maintenance**: As needed with proper notification
- **Communication**: Notify stakeholders 24 hours in advance

#### Change Records
```markdown
## Maintenance Log

### 2025-10-26
- **Type**: Scheduled Maintenance
- **Description**: Updated Node.js runtime to v18.19.0
- **Impact**: Brief service interruption (2 minutes)
- **Result**: Successfully completed, performance improved by 5%

### 2025-10-25
- **Type**: Emergency Maintenance
- **Description**: Hotfix for memory leak in streaming module
- **Impact**: Service restart required
- **Result**: Memory usage stabilized
```

### Knowledge Base

#### Common Issues and Solutions
1. **High Memory Usage**: Restart service and investigate memory leaks
2. **Database Timeouts**: Check connection pool and optimize queries
3. **SSL Certificate Expiry**: Automate renewal process
4. **Performance Degradation**: Scale resources and optimize code

#### Performance Benchmarks
- **Normal Request Rate**: 500-1000 RPS
- **Acceptable Latency**: p95 < 200ms, p99 < 500ms
- **Error Rate**: < 1%
- **Resource Usage**: CPU < 70%, Memory < 80%

## Maintenance Tools and Resources

### Monitoring Tools
- **Grafana**: Dashboards and alerts
- **Prometheus**: Metrics collection
- **AlertManager**: Alert management
- **Kibana**: Log analysis (if available)

### Automation Tools
- **Kubernetes**: Container orchestration
- **Helm**: Package management
- **Terraform**: Infrastructure as code
- **GitHub Actions**: CI/CD pipeline

### Communication Tools
- **Slack**: Team communication
- **PagerDuty**: On-call management
- **Status Page**: External communication
- **Email**: Formal notifications

## Training and Knowledge Sharing

### Maintenance Training

#### Basic Skills
- Kubernetes operations
- Monitoring and alerting
- Troubleshooting techniques
- Safety procedures

#### Advanced Skills
- Performance optimization
- Security hardening
- Capacity planning
- Disaster recovery

### Documentation Standards
- Use clear, concise language
- Include step-by-step procedures
- Provide examples and commands
- Keep documentation up to date

### Knowledge Transfer
- Regular team meetings
- Documentation reviews
- Shadowing opportunities
- Cross-training sessions

---

*Last updated: 2025-10-26*
*Version: 1.0*
*Maintained by: Task MCP Operations Team*