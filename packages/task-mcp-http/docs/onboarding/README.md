# Team Onboarding Guide - Task MCP HTTP Server

This guide provides comprehensive onboarding materials for new team members working with the Task MCP HTTP server.

## Overview

The Task MCP HTTP server is a critical service that provides HTTP and Server-Sent Events (SSE) interfaces for the Anthropic MCP connector. This guide will help you get up to speed quickly with the architecture, tools, and processes.

## Onboarding Checklist

### Week 1: Foundation
- [ ] Read project overview and architecture
- [ ] Set up development environment
- [ ] Understand the codebase structure
- [ ] Review documentation and runbooks
- [ ] Meet the team and understand roles

### Week 2: Hands-On
- [ ] Set up local development environment
- [ ] Run the application locally
- [ ] Make a small test change
- [ ] Understand the testing framework
- [ ] Review CI/CD pipeline

### Week 3: Operations
- [ ] Learn monitoring and alerting
- [ ] Review SLOs and error budgets
- [ ] Practice using troubleshooting tools
- [ ] Shadow on-call engineer
- [ ] Participate in incident response drill

### Week 4: Integration
- [ ] Contribute to a real feature/fix
- [ ] Deploy to staging environment
- [ ] Participate in code review
- [ ] Join on-call rotation as backup
- [ ] Complete onboarding assessment

## Project Overview

### What is Task MCP HTTP Server?

The Task MCP HTTP server provides:
- **HTTP API**: RESTful interface for MCP tools
- **Server-Sent Events**: Real-time streaming for tool results
- **Authentication**: Bearer token-based security
- **Monitoring**: Comprehensive observability with OpenTelemetry
- **Reliability**: High availability with health checks and auto-scaling

### Key Features

#### Core Functionality
- Tool execution (`change.open`, `change.archive`)
- SSE streaming for real-time results
- NDJSON streaming for batch operations
- Structured JSON logging with correlation IDs

#### Observability
- OpenTelemetry metrics and tracing
- Prometheus integration
- Grafana dashboards
- SLO monitoring and alerting

#### Security
- Bearer token authentication
- Rate limiting
- CORS support
- Security audit logging

#### Reliability
- Health checks (liveness/readiness)
- Graceful shutdown
- Error handling and recovery
- Auto-scaling support

### Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client        │───▶│   NGINX         │───▶│   Task MCP      │
│   (Browser/CLI) │    │   (Load Balancer)│    │   HTTP Server   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                 │                        │
                                 ▼                        ▼
                        ┌─────────────────┐    ┌─────────────────┐
                        │   Prometheus    │    │   OpenTelemetry │
                        │   (Metrics)     │    │   (Tracing)     │
                        └─────────────────┘    └─────────────────┘
                                 │                        │
                                 ▼                        ▼
                        ┌─────────────────┐    ┌─────────────────┐
                        │   Grafana       │    │   AlertManager  │
                        │   (Dashboards)  │    │   (Alerts)      │
                        └─────────────────┘    └─────────────────┘
```

## Development Environment Setup

### Prerequisites

#### Required Software
- **Node.js**: Version 18.x or later
- **pnpm**: Package manager (preferred)
- **Docker**: Container runtime
- **kubectl**: Kubernetes CLI
- **Git**: Version control

#### Development Tools
- **VS Code**: Recommended IDE with extensions
- **Postman**: API testing
- **Docker Desktop**: Local container development

### Local Development Setup

#### 1. Clone Repository
```bash
git clone https://github.com/company/task-mcp.git
cd task-mcp/packages/task-mcp-http
```

#### 2. Install Dependencies
```bash
# Using pnpm (recommended)
pnpm install

# Or using npm
npm install
```

#### 3. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

#### 4. Generate TLS Certificates (Development)
```bash
# Install mkcert
brew install mkcert  # macOS
# Follow https://github.com/FiloSottile/mkcert for other platforms

# Create local CA
mkcert -install

# Generate certificates
mkcert localhost 127.0.0.1 ::1
```

#### 5. Start Development Server
```bash
# Development mode with hot reload
pnpm dev:http

# Or start production server
pnpm start:http:dev
```

#### 6. Verify Setup
```bash
# Test health endpoint
curl -k https://localhost:8443/health/live

# Test API endpoint
curl -k -X POST https://localhost:8443/mcp \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"tool":"change.open","input":{"slug":"test"}}'
```

### IDE Setup (VS Code)

#### Recommended Extensions
```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "ms-vscode-remote.remote-containers",
    "ms-kubernetes-tools.vscode-kubernetes-tools",
    "humao.rest-client"
  ]
}
```

#### Workspace Settings
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true
  }
}
```

## Codebase Structure

### Directory Layout

```
packages/task-mcp-http/
├── src/                      # Source code
│   ├── health/              # Health check system
│   ├── logging/             # Structured logging
│   ├── otel/                # OpenTelemetry instrumentation
│   ├── routes/              # HTTP route handlers
│   ├── security/            # Security features
│   ├── config.ts            # Configuration management
│   └── index.ts             # Application entry point
├── test/                    # Test files
│   ├── integration/         # Integration tests
│   ├── load/               # Load tests
│   └── unit/               # Unit tests
├── docs/                    # Documentation
├── monitoring/              # Monitoring configuration
├── k8s/                     # Kubernetes manifests
├── docker/                  # Docker files
├── nginx/                   # NGINX configuration
└── scripts/                 # Utility scripts
```

### Core Components

#### 1. Health Checks (`src/health/`)
- **Registry**: Health check registration and execution
- **Monitor**: System health monitoring
- **Metrics**: Health check metrics collection

#### 2. Logging (`src/logging/`)
- **Structured Logger**: JSON logging with correlation IDs
- **Correlation**: Request tracing across services
- **Transports**: Multiple output destinations

#### 3. OpenTelemetry (`src/otel/`)
- **Metrics**: Application performance metrics
- **Tracing**: Distributed request tracing
- **Config**: OpenTelemetry configuration

#### 4. Routes (`src/routes/`)
- **MCP**: Tool execution endpoints
- **SSE**: Server-Sent Events streaming
- **Health**: Health check endpoints

#### 5. Security (`src/security/`)
- **Authentication**: Token-based auth
- **Rate Limiting**: Request throttling
- **CORS**: Cross-origin resource sharing

## Testing Guide

### Test Structure

#### Unit Tests
```bash
# Run unit tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

#### Integration Tests
```bash
# Run integration tests
pnpm test:integration

# Run specific test file
pnpm test src/routes/mcp.test.ts
```

#### Load Tests
```bash
# Run SSE load test
node test/load/sse-load-test.js

# Run NDJSON load test
node test/load/ndjson-load-test.js
```

### Writing Tests

#### Unit Test Example
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createStructuredLogger } from '../src/logging/index.js';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = createStructuredLogger({
      service: 'test-service',
      level: 'debug',
      enableConsole: false,
      enableFile: false,
    });
  });

  it('should log structured messages', () => {
    const messages = [];
    logger.on('log', (entry) => messages.push(entry));
    
    logger.info('Test message', { userId: '123' });
    
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe('Test message');
    expect(messages[0].context.userId).toBe('123');
  });
});
```

#### Integration Test Example
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/index.js';

describe('API Integration', () => {
  let server: any;

  beforeAll(async () => {
    server = await createServer({
      port: 0, // Random port
      host: 'localhost',
    });
    await server.listen();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should handle health check', async () => {
    const response = await fetch(`http://localhost:${server.server.address().port}/health/live`);
    expect(response.status).toBe(200);
  });
});
```

## Monitoring and Observability

### Key Metrics

#### HTTP Metrics
- `http_server_requests_total`: Total HTTP requests
- `http_server_request_duration`: Request latency histogram
- `http_server_active_requests`: Current active requests

#### Tool Execution Metrics
- `tool_executions_total`: Tool execution count
- `tool_execution_duration`: Tool execution latency
- `tool_active_executions`: Active tool executions

#### Streaming Metrics
- `streaming_active_connections`: Active SSE connections
- `streaming_messages_total`: Messages sent
- `streaming_bytes_transferred`: Bytes transferred

### Dashboards

#### Grafana Dashboards
- **Overview**: `task-mcp-overview`
- **API Performance**: `task-mcp-api`
- **Tools**: `task-mcp-tools`
- **Streaming**: `task-mcp-streaming`
- **Infrastructure**: `task-mcp-infrastructure`
- **Security**: `task-mcp-security`

### SLOs

#### Availability
- **API Endpoints**: 99.9% uptime
- **Health Checks**: 99.95% uptime

#### Latency
- **HTTP Requests**: p95 < 200ms, p99 < 500ms
- **Tool Execution**: p95 < 500ms, p99 < 2000ms

#### Error Rate
- **HTTP Requests**: < 1%
- **Tool Execution**: < 0.1%

## Deployment and Operations

### Deployment Process

#### 1. Development
```bash
# Build application
pnpm build:http

# Run tests
pnpm test

# Deploy to staging
kubectl apply -f k8s/staging/
```

#### 2. Production
```bash
# Create deployment PR
# Get approval from code review
# Merge to main branch
# CI/CD pipeline deploys automatically
```

### Kubernetes Commands

#### Basic Operations
```bash
# Check deployment status
kubectl get deployments -n task-mcp

# Check pods
kubectl get pods -n task-mcp -l app=task-mcp-http

# Check logs
kubectl logs -f deployment/task-mcp-http -n task-mcp

# Scale deployment
kubectl scale deployment task-mcp-http --replicas=3 -n task-mcp

# Restart deployment
kubectl rollout restart deployment/task-mcp-http -n task-mcp
```

#### Debugging
```bash
# Exec into pod
kubectl exec -it <pod-name> -n task-mcp -- /bin/bash

# Port forward
kubectl port-forward svc/task-mcp-http 8443:8443 -n task-mcp

# Describe pod
kubectl describe pod <pod-name> -n task-mcp
```

## Incident Response

### Alert Types

#### Critical Alerts
- Service downtime
- High error rate (> 5%)
- Critical latency issues
- Health check failures

#### Warning Alerts
- Elevated error rate
- Performance degradation
- Resource pressure

#### Info Alerts
- Scaling events
- Configuration changes

### Response Procedure

#### 1. Acknowledge Alert
- Check monitoring dashboards
- Verify impact scope
- Communicate to team

#### 2. Investigate
- Review logs and metrics
- Identify root cause
- Document findings

#### 3. Resolve
- Implement fix
- Verify resolution
- Monitor for recurrence

### Escalation Matrix

| Level | Contact | Response Time | When to Escalate |
|-------|---------|---------------|------------------|
| 1 | On-call Engineer | 15 minutes | Initial response |
| 2 | Engineering Lead | 30 minutes | After 10 minutes |
| 3 | Engineering Manager | 1 hour | After 30 minutes |

## Team Roles and Responsibilities

### Engineering Roles

#### On-call Engineer
- First point of contact for incidents
- Initial triage and investigation
- Implement quick fixes
- Document findings

#### Engineering Lead
- Deep technical investigation
- Coordinate incident response
- Make architectural decisions
- Mentor team members

#### Engineering Manager
- Major incident management
- External communication
- Resource allocation
- Business impact assessment

### Cross-functional Teams

#### Security Team
- Security incident response
- Vulnerability management
- Security policy enforcement
- Compliance monitoring

#### Infrastructure Team
- Kubernetes cluster management
- Network and storage
- CI/CD pipeline
- Monitoring infrastructure

#### Product Team
- Feature requirements
- User feedback
- Business priorities
- Customer communication

## Communication Channels

### Internal Communication

#### Slack Channels
- `#task-mcp-team`: General team discussion
- `#task-mcp-incidents`: Incident response
- `#task-mcp-alerts`: Alert notifications
- `#task-mcp-releases`: Deployment announcements

#### Email Lists
- `task-mcp-team@company.com`: Team communications
- `oncall@company.com`: On-call notifications
- `ops-team@company.com`: Operations updates

### External Communication

#### Status Page
- `status.company.com`: Service status
- Incident updates
- Maintenance notifications

#### Customer Support
- Support ticket integration
- Customer notifications
- Impact assessment

## Learning Resources

### Documentation

#### Internal
- [Operations Runbooks](../operations/README.md)
- [Troubleshooting Guide](../troubleshooting/README.md)
- [SLO Documentation](../slos/README.md)
- [Security Guide](../security/README.md)

#### External
- [Node.js Documentation](https://nodejs.org/docs/)
- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)

### Training Materials

#### Courses
- Kubernetes Fundamentals
- Monitoring and Observability
- Site Reliability Engineering
- Security Best Practices

#### Workshops
- Incident Response Drills
- Performance Tuning
- Security Auditing
- Chaos Engineering

## Assessment and Certification

### Knowledge Assessment

#### Technical Skills
- [ ] Understanding of system architecture
- [ ] Ability to debug issues
- [ ] Knowledge of monitoring tools
- [ ] Understanding of SLOs and error budgets

#### Operational Skills
- [ ] Incident response procedures
- [ ] Troubleshooting methodology
- [ ] Communication during incidents
- [ ] Documentation practices

### Practical Assessment

#### Hands-on Tasks
- [ ] Deploy application to staging
- [ ] Debug a production issue
- [ ] Respond to a simulated incident
- [ ] Contribute to documentation

### Certification Process

1. **Complete Training**: Finish all required modules
2. **Pass Assessment**: Demonstrate knowledge and skills
3. **Shadow Experience**: Complete shadow shifts
4. **Independent Duty**: Serve as backup on-call
5. **Full Certification**: Earn independent on-call status

## Frequently Asked Questions

### Development
**Q: How do I add a new tool?**
A: Add the tool to the tool registry and implement the handler in `src/routes/mcp.ts`.

**Q: How do I add new metrics?**
A: Use the OpenTelemetry metrics API in `src/otel/metrics.ts`.

**Q: How do I test changes locally?**
A: Use `pnpm dev:http` for development with hot reload.

### Operations
**Q: How do I check service health?**
A: Use `/health/live` and `/health/ready` endpoints.

**Q: How do I debug performance issues?**
A: Check Grafana dashboards and analyze traces.

**Q: How do I handle alerts?**
A: Follow the incident response runbooks.

### Deployment
**Q: How do I deploy to production?**
A: Merge to main branch and let CI/CD handle deployment.

**Q: How do I rollback?**
A: Use `kubectl rollout undo deployment/task-mcp-http`.

## Support and Resources

### Getting Help

#### Immediate Assistance
- **Slack**: #task-mcp-team
- **On-call**: oncall@company.com
- **Emergency**: Page on-call engineer

#### Technical Support
- **Documentation**: This guide and runbooks
- **Code Reviews**: Team pull requests
- **Mentoring**: Senior team members

#### Learning Resources
- **Internal Wiki**: Company documentation
- **Training Library**: Courses and workshops
- **Book Club**: Technical reading group

### Contributing

#### Code Contributions
1. Create feature branch
2. Implement changes with tests
3. Submit pull request
4. Address review feedback
5. Merge after approval

#### Documentation Contributions
1. Identify documentation gaps
2. Draft improvements
3. Submit for review
4. Update based on feedback
5. Publish updates

#### Process Improvements
1. Identify inefficiencies
2. Propose solutions
3. Discuss with team
4. Implement changes
5. Measure impact

---

*Last updated: 2025-10-26*
*Version: 1.0*
*Maintained by: Task MCP Team*