# Task MCP Documentation Index

_Last updated: 2025-10-25_

## 📚 Documentation Overview

This index helps you find the right documentation for your needs. Task MCP provides a minimal, well-structured contract surface for managing changes through OpenSpec.

## 🚀 Quick Start (New to Task MCP?)

### 5-Minute Quickstart
**[docs/examples/quickstart.md](examples/quickstart.md)**
- Get started in 5 minutes
- Complete working example
- Common workflows

### 30-Minute Setup
**[docs/getting-started.md](getting-started.md)**
- Environment setup
- Installation instructions
- First change creation

## 👥 Developer Onboarding

### Comprehensive Tutorial
**[docs/developer-onboarding.md](developer-onboarding.md)**
- 2-hour onboarding program
- Step-by-step examples
- Best practices
- Team collaboration

### Daily Workflow Reference
- Morning planning
- Development work
- End-of-day cleanup
- Common patterns

## 📋 Reference Documentation

### API Contracts
**[docs/contracts.md](contracts.md)**
- Complete API reference
- JSON schemas
- Error codes
- Security constraints
- Versioning policy

### Token Policy
**[docs/token_policy.md](token_policy.md)**
- Token efficiency guidelines
- Transport-specific patterns
- Optimization strategies
- Monitoring guidelines

### Token Examples
**[docs/token-examples.md](token-examples.md)**
- Real-world calculations
- Efficiency comparisons
- Performance optimization
- Budget planning

## 🔧 Phase 1: Task MCP API & Integration Documentation

### 🚀 **NEW: Phase 1 Documentation Framework**

#### API Reference & Integration
**[docs/examples/task_mcp_api_reference.md](examples/task_mcp_api_reference.md)**
- Complete API reference for all tools and resources
- Detailed request/response examples
- Error handling patterns
- Performance considerations

#### IDE Integration Guide
**[docs/examples/ide_integration_guide.md](examples/ide_integration_guide.md)**
- VS Code, JetBrains, Vim, Emacs setup
- Configuration examples
- Workflow integration
- Resource navigation patterns

#### Developer Integration Patterns
**[docs/examples/developer_integration_patterns.md](examples/developer_integration_patterns.md)**
- Common integration patterns
- Batch operations and monitoring
- Workflow automation
- Performance optimization

#### Security Guide
**[docs/examples/task_mcp_security_guide.md](examples/task_mcp_security_guide.md)**
- Comprehensive security documentation
- Threat model and mitigation
- Lock file security
- Path sandboxing details
- Best practices for deployment

#### Troubleshooting Guide
**[docs/examples/task_mcp_troubleshooting.md](examples/task_mcp_troubleshooting.md)**
- Common issues and solutions
- Error code reference
- Performance debugging
- Recovery procedures

#### Documentation Navigation
**[docs/examples/task_mcp_documentation_index.md](examples/task_mcp_documentation_index.md)**
- Central navigation for Phase 1 docs
- Learning paths by role and experience
- Quick reference materials

### Core API Documentation
**[docs/examples/task_mcp_api.md](examples/task_mcp_api.md)**
- Tool semantics and usage
- Resource provider documentation
- Basic integration examples

### Security Model
**[docs/examples/security_model.md](examples/security_model.md)**
- Core security principles
- Path and slug rules
- Locking mechanisms
- Transport security

## 🔧 Phase 4: SSE HTTP API Documentation

### 🚀 **NEW: Phase 4 SSE & HTTP Implementation**

#### HTTP API Reference
**[docs/api_reference.md](api_reference.md)**
- Complete REST API documentation
- SSE and NDJSON endpoints
- Authentication and security
- Error handling and status codes
- Performance considerations

#### SSE Implementation Guidelines
**[docs/sse_guidelines.md](sse_guidelines.md)**
- Server-Sent Events protocol overview
- Client integration examples (JavaScript, Python, curl)
- Connection management and troubleshooting
- Performance optimization strategies
- Security best practices

#### Messages API Integration
**[docs/messages_api_example.md](messages_api_example.md)**
- Anthropic Messages API integration
- Real-time streaming examples
- Error handling and retry logic
- Performance optimization patterns
- Production deployment examples

#### Docker Strategy & Deployment
**[docs/docker_strategy.md](docker_strategy.md)**
- Complete Docker deployment guide
- Multi-stage builds and security
- Production configurations
- Monitoring and observability
- Backup and recovery procedures

#### Security Configuration
**[docs/security.md](security.md)**
- Authentication and authorization
- Rate limiting and CORS
- Security headers and TLS
- Audit logging and monitoring
- Security best practices checklist

#### Performance Documentation
**[docs/performance.md](performance.md)**
- Performance benchmarks and metrics
- Load testing results
- Optimization strategies
- Monitoring and alerting
- Troubleshooting performance issues

## 🔧 Troubleshooting & Support

### Common Issues
**[docs/troubleshooting.md](troubleshooting.md)**
- Error resolution
- Debugging tools
- Prevention checklist
- Getting help

### Error Codes Reference
| Error Code | Description | Quick Fix |
|------------|-------------|-----------|
| `ENOCHANGE` | Change not found | Check slug and archived changes |
| `ELOCKED` | Change locked by another user | Wait or reclaim lock |
| `EBADSLUG` | Invalid slug format | Use valid slug pattern |
| `EBADSHAPE_*` | Invalid change structure | Fix missing files/malformed specs |
| `EPATH_ESCAPE` | Path traversal attempt | Security feature - blocked |
| `EARCHIVED` | Operation on archived change | Create new change or restore |

## 📖 Learning Paths

### Path 1: New Developer (First Day)
1. [Quickstart](examples/quickstart.md) - 5 minutes
2. [Getting Started](getting-started.md) - 30 minutes
3. [Create first change](developer-onboarding.md#your-first-change) - 60 minutes
4. [API Reference](examples/task_mcp_api_reference.md) - 45 minutes

### Path 2: Experienced Developer (First Hour)
1. [Quickstart](examples/quickstart.md) - 5 minutes
2. [API Reference](examples/task_mcp_api_reference.md) - 20 minutes
3. [IDE Integration](examples/ide_integration_guide.md) - 15 minutes
4. [Integration Patterns](examples/developer_integration_patterns.md) - 20 minutes

### Path 3: DevOps Engineer (First 30 Minutes)
1. [Security Guide](examples/task_mcp_security_guide.md) - 15 minutes
2. [Contracts reference](contracts.md) - 10 minutes
3. [Troubleshooting](examples/task_mcp_troubleshooting.md) - 5 minutes

### Path 4: API/HTTP Developer (First 45 Minutes)
1. [HTTP API Reference](api_reference.md) - 20 minutes
2. [SSE Guidelines](sse_guidelines.md) - 15 minutes
3. [Messages API Integration](messages_api_example.md) - 10 minutes

### Path 5: Team Lead (First 45 Minutes)
1. [Documentation Index](examples/task_mcp_documentation_index.md) - 10 minutes
2. [Integration Patterns](examples/developer_integration_patterns.md#team-collaboration-patterns) - 15 minutes
3. [Security Model](examples/security_model.md) - 10 minutes
4. [Token Policy](token_policy.md) - 10 minutes

## 🛠 Development Resources

### Schema Files
**[docs/schemas/](schemas/)**
- `change.open.input.schema.json` - Change creation input schema
- `change.open.output.schema.json` - Change creation output schema
- `change.archive.input.schema.json` - Change archival input schema
- `change.archive.output.schema.json` - Change archival output schema
- `changes.active.output.schema.json` - Active changes listing schema
- `receipt.schema.json` - Receipt format specification

### Phase Documentation
**[docs/phases/](phases/)**
- ✅ [Phase 0: Foundations & Contracts](phases/Phase_0_Foundations_&_Contracts.md) - Complete
- ✅ [Phase 1: Core stdio Two Tools + Resources](phases/Phase_1_Core_stdio_Two_Tools_+_Resources.md) - Complete
- ✅ [Phase 2: Receipts & Validation](phases/Phase_2_Receipts_&_Validation.md) - Complete
- ✅ [Phase 3: Resources & IDE UX](phases/Phase_3_Resources_&_IDE_UX.md) - Complete
- ✅ [Phase 4: HTTPS/SSE for API](phases/Phase_4_HTTPS_SSE_for_API.md) - **NEW: Complete**

### Implementation Reports
**[docs/implementation_reports/](implementation_reports/)**
- [Phase 0 Review Report](implementation_reports/phase-0-review-report.md) - Complete analysis
- [Phase 4 SSE Implementation Report](implementation_reports/impl_2025-10-25.md) - **NEW: Complete analysis**

### Handoffs
**[docs/handoffs/](handoffs/)**
- [Phase 0 Completion Handoff](handoffs/handoff_2025-10-23_phase-0-complete.md) - Detailed transition document
- [Phase 4 Completion Handoff](handoffs/handoff_2025-10-25_phase4-complete.md) - **NEW: Production ready**

## 🎯 Common Tasks

### Create a Change
```bash
# Quick reference
mcp-call task change.open '{
  "title": "Your feature title",
  "slug": "your-feature-slug",
  "template": "feature"
}'
```
**Full guide**: [Getting Started → Create Your First Change](getting-started.md#2-create-your-first-change)

### Create a Change via HTTP API
```bash
# HTTP API with SSE
curl -X POST https://your-domain.com/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -H "Accept: text/event-stream" \
  -d '{
    "tool": "change.open",
    "input": {
      "title": "Your feature title",
      "slug": "your-feature-slug",
      "template": "feature"
    }
  }'
```
**Full guide**: [HTTP API Reference → change.open](api_reference.md#change-open)

### Work with Resources
```bash
# IDE mode - zero token cost
@task:change://your-slug/proposal
@task:change://your-slug/tasks
@task:change://your-slug/delta
```
**Full guide**: [IDE Integration Guide → Resource Navigation](examples/ide_integration_guide.md#resource-navigation)

### Archive a Change
```bash
mcp-call task change.archive '{"slug":"your-slug"}'
```
**Full guide**: [API Reference → change.archive](examples/task_mcp_api_reference.md#change-archive---archive-a-completed-change)

### IDE Setup
**VS Code**:
```json
{
  "claude.desktop.mcpServers": {
    "openspec": {
      "command": "task-mcp",
      "args": ["--stdio"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```
**Full guide**: [IDE Integration Guide](examples/ide_integration_guide.md)

### HTTP API Quick Start
```javascript
// JavaScript client for SSE
const response = await fetch('/sse', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token',
    'Accept': 'text/event-stream'
  },
  body: JSON.stringify({
    tool: 'change.open',
    input: { title: 'Test', slug: 'test' }
  })
});
```
**Full guide**: [SSE Guidelines](sse_guidelines.md)

### Troubleshoot Issues
**Full guide**: [Troubleshooting Guide](examples/task_mcp_troubleshooting.md)

## 📊 Token Efficiency

### Best Practices
- Use resource URIs in IDE mode (zero token cost)
- Keep responses under 2,000 tokens
- Implement pagination for lists
- Use concise error messages

### Examples and Calculations
**Full guide**: [Token Examples](token-examples.md)

### Monitoring
```bash
# Enable debug mode
export TASK_MCP_DEBUG=true

# Monitor usage
task-mcp --stdio --verbose
```

## 🔒 Security & Compliance

### Security Constraints
- Path sandboxing to `openspec/` directory
- Slug normalization and validation
- Lock enforcement with TTL
- Input validation against schemas

**Full reference**: [Security Guide](examples/task_mcp_security_guide.md)

### HTTP API Security
- Bearer token authentication
- Rate limiting (configurable)
- CORS configuration
- Security headers (CSP, HSTS, etc.)
- TLS/SSL support

**Full reference**: [Security Configuration](security.md)

### Versioning Policy
- API version: `v{major}.{minor}.{patch}`
- Semantic versioning rules
- Backward compatibility guarantees

**Full reference**: [Contracts → Versioning Policy](contracts.md#versioning-policy)

## 🤝 Community & Support

### Getting Help
1. Check [troubleshooting guide](examples/task_mcp_troubleshooting.md)
2. Search existing [GitHub issues](https://github.com/your-org/openspec/issues)
3. Ask in team chat
4. Create new issue with detailed information

### Contributing
- Documentation improvements welcome
- Example contributions appreciated
- Bug reports encouraged
- Feature requests discussed

## 📋 Documentation Quality

### Standards
- All examples tested and verified
- Token calculations validated
- Troubleshooting covers common issues
- Onboarding produces productive developers

### Feedback
- Documentation satisfaction: > 4.5/5 rating
- Onboarding time: < 2 hours to productive
- First change success: > 95%
- Issue resolution: < 5 minutes for common problems

## 🗺 Roadmap

### Current Phase (Phase 4) ✅ **NEW: Complete**
- ✅ SSE HTTP API implementation (Complete)
- ✅ NDJSON transport support (Complete)
- ✅ Messages API integration (Complete)
- ✅ Docker deployment strategy (Complete)
- ✅ Production security configuration (Complete)
- ✅ Performance optimization (Complete)

### Completed Phases ✅
- ✅ Phase 0: Foundations & Contracts
- ✅ Phase 1: Core stdio implementation
- ✅ Phase 2: Receipts & Validation
- ✅ Phase 3: Resources & IDE UX
- ✅ Phase 4: HTTPS/SSE for API

### Upcoming Phases
- 📋 Phase 5: Observability & Reliability (Planning)
- 📋 Phase 6: Advanced Features & Scaling (Future)

---

**Need help?** Start with the [Quickstart](examples/quickstart.md), check the [HTTP API Reference](api_reference.md), or review the [Phase 4 Documentation Index](examples/task_mcp_documentation_index.md).

**Last updated**: 2025-10-25  
**Version**: Task MCP v1.0.0  
**Current Phase**: 4 - HTTPS/SSE for API ✅ **Complete**  
**Documentation Status**: Production Ready ✅