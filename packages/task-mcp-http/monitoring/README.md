# Task MCP HTTP Server - Monitoring Stack

This directory contains a comprehensive monitoring and observability stack for the Task MCP HTTP server, including SLO dashboards, burn-rate alerts, and operational runbooks.

## Overview

The monitoring stack provides:

- **Service Level Objectives (SLOs)** with defined targets and error budgets
- **Multi-window burn-rate alerts** for proactive incident response
- **Comprehensive Grafana dashboards** for operations and development teams
- **Prometheus alerting rules** covering all critical metrics
- **AlertManager configuration** with notification routing and templates
- **Terraform infrastructure** for automated deployment
- **Detailed runbooks** for incident response

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Task MCP      │───▶│   Prometheus     │───▶│   Grafana       │
│   HTTP Server   │    │   (Metrics)      │    │   (Dashboards)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  AlertManager    │    │   Notification  │
                       │  (Alerts)        │    │   Channels      │
                       └──────────────────┘    └─────────────────┘
```

## Directory Structure

```
monitoring/
├── README.md                    # This file
├── SLOS.md                     # Service Level Objectives documentation
├── RUNBOOKS.md                 # Incident response runbooks
├── grafana/
│   └── dashboards/             # Grafana dashboard definitions
│       ├── overview.json       # System overview dashboard
│       ├── api.json            # HTTP API metrics dashboard
│       ├── tools.json          # Tool execution metrics dashboard
│       ├── streaming.json      # Streaming metrics dashboard
│       ├── infrastructure.json  # Infrastructure metrics dashboard
│       └── security.json       # Security metrics dashboard
├── prometheus/
│   └── rules/                  # Prometheus alerting rules
│       └── slo-alerts.yml      # SLO-based alerting rules
├── alertmanager/
│   ├── alertmanager.yml        # AlertManager configuration
│   └── templates/              # Notification templates
│       ├── slack.tmpl          # Slack notification templates
│       └── email.tmpl          # Email notification templates
└── terraform/                  # Infrastructure as Code
    └── main.tf                 # Terraform deployment configuration
```

## SLOs and Error Budgets

### Availability SLOs
- **API Endpoints**: 99.9% uptime (8.76 hours downtime/month max)
- **Health Checks**: 99.95% uptime (21.6 minutes downtime/month max)

### Latency SLOs
- **HTTP Requests**: p95 < 200ms, p99 < 500ms
- **Tool Execution**: p95 < 500ms, p99 < 2000ms
- **Streaming**: p95 < 100ms for first message

### Error Rate SLOs
- **HTTP Requests**: < 1% for all endpoints
- **Tool Execution**: < 0.1% for critical operations
- **Authentication**: < 5% (excluding intentional failures)

### Throughput SLOs
- **Request Rate**: > 1000 RPS sustained
- **Streaming**: > 1000 concurrent connections
- **Tool Execution**: > 100 executions/second

## Burn Rate Alerting

### Multi-Window Strategy
- **Fast Burn (1h)**: Triggers when error budget would be exhausted in < 2 hours
- **Medium Burn (6h)**: Triggers when error budget would be exhausted in < 6 hours
- **Slow Burn (24h)**: Triggers when error budget would be exhausted in < 24 hours

### Alert Severity Levels
- **Critical**: Service downtime, high error rates, critical latency issues
- **Warning**: Performance degradation, resource pressure, elevated error rates
- **Info**: Scaling events, configuration changes, informational alerts

## Dashboards

### Overview Dashboard
**UID:** `task-mcp-overview`

Key metrics:
- Service status and health
- Request rate and error rate
- p95 latency and resource usage
- Active connections and executions
- Overall health status

### API Dashboard
**UID:** `task-mcp-api`

Key metrics:
- Request rate by method and route
- Status code distribution
- Latency percentiles by route
- Error rate by status class
- Response size and active requests

### Tools Dashboard
**UID:** `task-mcp-tools`

Key metrics:
- Tool execution rate and duration
- Active executions and error rate
- Execution status by tool
- Hourly execution counts

### Streaming Dashboard
**UID:** `task-mcp-streaming`

Key metrics:
- Active streaming connections
- Message rate and transfer rate
- Connection duration percentiles
- Message distribution by type

### Infrastructure Dashboard
**UID:** `task-mcp-infrastructure`

Key metrics:
- CPU and memory usage
- Memory breakdown and uptime
- Active operations and rates
- Resource utilization trends

### Security Dashboard
**UID:** `task-mcp-security`

Key metrics:
- Authentication attempts and failures
- Rate limit hits and 4xx errors
- Request patterns by route
- Security event trends

## Alerting Rules

### SLO-Based Alerts
- **High Error Rate Fast Burn**: Critical alert for rapid error budget consumption
- **High Error Rate Medium Burn**: Warning alert for moderate error budget consumption
- **High Error Rate Slow Burn**: Info alert for slow error budget consumption
- **Latency Degradation**: Warning for p95 latency > 200ms
- **Critical Latency**: Critical for p99 latency > 500ms

### Infrastructure Alerts
- **High Memory Usage**: Warning at 85%, Critical at 95%
- **High CPU Usage**: Warning at 80%
- **Service Downtime**: Critical for health check failures
- **Resource Pressure**: Various thresholds for system resources

### Security Alerts
- **High Auth Failure Rate**: Warning for > 10% failure rate
- **Rate Limit Hits**: Info for frequent rate limiting
- **Suspicious Activity**: Various security-related alerts

## Notification Routing

### Critical Alerts
- **PagerDuty**: Immediate paging for on-call engineers
- **Slack**: #task-mcp-critical channel
- **Email**: task-mcp-team@company.com

### Warning Alerts
- **Slack**: #task-mcp-alerts channel
- **Email**: task-mcp-team@company.com

### Info Alerts
- **Slack**: #task-mcp-info channel

### Specialized Routing
- **Infrastructure**: infrastructure-team@company.com
- **Security**: security-team@company.com
- **Business**: product-team@company.com
- **SLO**: sre-team@company.com

## Deployment

### Prerequisites
- Kubernetes cluster (v1.20+)
- kubectl configured
- Terraform installed
- Helm installed

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd task-mcp-http/monitoring
   ```

2. **Configure Terraform variables**
   ```bash
   cp terraform/terraform.tfvars.example terraform/terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

3. **Deploy monitoring stack**
   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply
   ```

4. **Access Dashboards**
   - Grafana: `http://grafana.task-mcp-monitoring.svc.cluster.local:3000`
   - Prometheus: `http://prometheus.task-mcp-monitoring.svc.cluster.local:9090`
   - AlertManager: `http://alertmanager.task-mcp-monitoring.svc.cluster.local:9093`

### Manual Deployment

If you prefer manual deployment without Terraform:

1. **Create namespace**
   ```bash
   kubectl create namespace task-mcp-monitoring
   ```

2. **Deploy Prometheus Operator**
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm install prometheus-operator prometheus-community/kube-prometheus-stack \
     --namespace task-mcp-monitoring \
     --values monitoring-values.yaml
   ```

3. **Apply configurations**
   ```bash
   kubectl apply -f prometheus/rules/
   kubectl apply -f alertmanager/
   kubectl apply -f grafana/dashboards/
   ```

## Configuration

### Prometheus Configuration
- **Retention**: 30 days
- **Scrape Interval**: 30 seconds
- **Evaluation Interval**: 30 seconds
- **Storage**: 50Gi (configurable)

### Grafana Configuration
- **Admin Password**: Set via Terraform variable
- **Plugins**: Pre-installed panels and plugins
- **Data Sources**: Auto-configured Prometheus datasource
- **Dashboards**: Auto-imported from ConfigMaps

### AlertManager Configuration
- **Global Settings**: SMTP and Slack integration
- **Route Configuration**: Multi-level routing based on severity
- **Templates**: Custom notification templates
- **Inhibition Rules**: Prevent alert noise

## Metrics

### Application Metrics (OpenTelemetry)
- `http_server_requests_total`: HTTP request counter
- `http_server_request_duration`: HTTP request latency histogram
- `http_server_active_requests`: Active HTTP requests gauge
- `tool_executions_total`: Tool execution counter
- `tool_execution_duration`: Tool execution latency histogram
- `tool_active_executions`: Active tool executions gauge
- `streaming_active_connections`: Active streaming connections gauge
- `streaming_messages_total`: Streaming message counter
- `streaming_bytes_transferred`: Bytes transferred histogram

### System Metrics (Prometheus)
- `process_cpu_usage_percent`: CPU usage percentage
- `process_memory_bytes`: Memory usage breakdown
- `process_uptime_seconds`: Process uptime
- `health_check_status`: Health check status

### Security Metrics
- `auth_attempts_total`: Authentication attempts counter
- `rate_limit_hits_total`: Rate limit hits counter

## Troubleshooting

### Common Issues

**Dashboards not showing data**
1. Check Prometheus targets: `curl http://prometheus:9090/api/v1/targets`
2. Verify ServiceMonitor configuration
3. Check service discovery labels

**Alerts not firing**
1. Check Prometheus rules: `curl http://prometheus:9090/api/v1/rules`
2. Verify rule syntax and evaluation
3. Check AlertManager configuration

**Notifications not sending**
1. Check AlertManager logs: `kubectl logs -f alertmanager-...`
2. Verify notification configuration
3. Test notification endpoints

### Debug Commands

```bash
# Check Prometheus targets
kubectl exec -it prometheus-... -n task-mcp-monitoring -- wget -qO- http://localhost:9090/api/v1/targets

# Check AlertManager alerts
kubectl exec -it alertmanager-... -n task-mcp-monitoring -- wget -qO- http://localhost:9093/api/v1/alerts

# Check Grafana health
kubectl exec -it grafana-... -n task-mcp-monitoring -- curl http://localhost:3000/api/health

# Port forward for local access
kubectl port-forward svc/prometheus-operated 9090:9090 -n task-mcp-monitoring
kubectl port-forward svc/grafana 3000:3000 -n task-mcp-monitoring
```

## Maintenance

### Regular Tasks

**Daily**
- Review SLO compliance
- Check alerting effectiveness
- Monitor resource usage

**Weekly**
- Review and tune alert thresholds
- Update dashboards as needed
- Check storage capacity

**Monthly**
- SLO target review and adjustment
- Performance trend analysis
- Documentation updates

**Quarterly**
- Complete SLO program assessment
- Architecture review
- Capacity planning

### Backup and Recovery

**Prometheus Data**
- Automated snapshots to S3
- 30-day retention policy
- Disaster recovery procedures documented

**Grafana Configuration**
- Version-controlled dashboards
- Database backups
- Export/import procedures

**AlertManager Configuration**
- Git-tracked configuration
- Template versioning
- Testing procedures

## Integration Points

### Existing Systems
- **OpenTelemetry Metrics**: Already implemented in the application
- **Health Check Endpoints**: `/health/live`, `/health/ready`, `/health/metrics`
- **Structured JSON Logs**: Compatible with log aggregation systems
- **NGINX Metrics**: Available from reverse proxy

### External Systems
- **PagerDuty**: On-call management and escalation
- **Slack**: Team communication and notifications
- **Email**: Formal incident notifications
- **Status Page**: External communication for outages

## Security Considerations

### Access Control
- RBAC for Kubernetes resources
- Grafana role-based access
- Prometheus authentication
- Network policies for inter-service communication

### Data Protection
- Encrypted storage for sensitive data
- Secure credential management
- Network encryption in transit
- Audit logging for access

### Compliance
- GDPR compliance for data handling
- SOC 2 controls for monitoring data
- Industry best practices for observability

## Performance and Scalability

### Resource Requirements
- **Prometheus**: 2 CPU cores, 4GB RAM, 50GB storage
- **Grafana**: 1 CPU core, 2GB RAM, 10GB storage
- **AlertManager**: 0.5 CPU core, 1GB RAM, 10GB storage

### Scaling Considerations
- Horizontal scaling for high availability
- Federation for multi-cluster deployments
- Remote write for long-term storage
- Load balancing for Grafana instances

### Optimization
- Metric retention policies
- Recording rules for expensive queries
- Efficient dashboard design
- Alert rule optimization

## Contributing

### Adding New Dashboards
1. Create dashboard JSON in `grafana/dashboards/`
2. Update Terraform configuration to include new dashboard
3. Add documentation to README
4. Test dashboard functionality

### Adding New Alerts
1. Define alert rules in `prometheus/rules/`
2. Test alert expressions
3. Update notification templates if needed
4. Document alert purpose and runbook

### Updating SLOs
1. Review SLO documentation in `SLOS.md`
2. Update alert thresholds accordingly
3. Update dashboard SLO panels
4. Communicate changes to stakeholders

## Support and Contacts

### Monitoring Team
- **Primary**: monitoring-team@company.com
- **On-call**: oncall-monitoring@company.com
- **Escalation**: monitoring-manager@company.com

### Documentation
- **Runbooks**: See `RUNBOOKS.md`
- **API Reference**: https://docs.company.com/task-mcp/api
- **Architecture**: https://docs.company.com/task-mcp/architecture

### External Resources
- **Prometheus Documentation**: https://prometheus.io/docs/
- **Grafana Documentation**: https://grafana.com/docs/
- **AlertManager Documentation**: https://prometheus.io/docs/alerting/latest/alertmanager/

---

## Version History

- **v1.0** (2025-10-26): Initial implementation with comprehensive SLO monitoring
- Future versions will include enhancements based on operational feedback

---

*Last updated: 2025-10-26*
*Maintained by: Task MCP Monitoring Team*