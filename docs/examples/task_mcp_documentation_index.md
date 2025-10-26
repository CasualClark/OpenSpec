# Task MCP Documentation Index

_Last updated: 2025-10-23_

## Quick Start

- **[Quickstart Guide](quickstart.md)** - Get started in 5 minutes
- **[API Overview](task_mcp_api.md)** - Core concepts and basic usage
- **[Installation Guide](../getting-started.md)** - Complete setup instructions

## Core Documentation

### API Reference
- **[Complete API Reference](task_mcp_api_reference.md)** - Comprehensive API documentation
- **[Tool Documentation](task_mcp_api.md#tools)** - `change.open` and `change.archive` details
- **[Resource Providers](task_mcp_api.md#resources)** - Resource URI patterns and usage

### Integration Guides
- **[IDE Integration Guide](ide_integration_guide.md)** - VS Code, JetBrains, Vim, Emacs setup
- **[Developer Integration Patterns](developer_integration_patterns.md)** - Common patterns and examples
- **[Workflow Integration](developer_integration_patterns.md#workflow-integration-patterns)** - Git, CI/CD, team collaboration

### Security & Operations
- **[Security Guide](task_mcp_security_guide.md)** - Comprehensive security documentation
- **[Security Model](security_model.md)** - Core security principles
- **[Troubleshooting Guide](task_mcp_troubleshooting.md)** - Common issues and solutions

### Reference Materials
- **[Contracts](contracts.md)** - Error codes, versioning, resource naming
- **[Token Policy](token_policy.md)** - Rate limiting and usage policies
- **[JSON Schemas](../schemas/)** - Complete schema definitions

## Learning Path

### 1. Beginner (5 minutes)
1. Read [Quickstart Guide](quickstart.md)
2. Try the basic examples
3. Understand core concepts from [API Overview](task_mcp_api.md)

### 2. Intermediate (30 minutes)
1. Complete [Installation Guide](../getting-started.md)
2. Set up your preferred IDE using [IDE Integration Guide](ide_integration_guide.md)
3. Review [Security Model](security_model.md)
4. Study [Contracts](contracts.md) for error handling

### 3. Advanced (2 hours)
1. Read [Complete API Reference](task_mcp_api_reference.md)
2. Implement [Integration Patterns](developer_integration_patterns.md)
3. Review [Security Guide](task_mcp_security_guide.md) for production deployment
4. Understand [JSON Schemas](../schemas/) for validation

## By Use Case

### For Developers
- **Getting Started**: [Quickstart](quickstart.md) → [IDE Integration](ide_integration_guide.md)
- **Daily Work**: [API Reference](task_mcp_api_reference.md) → [Integration Patterns](developer_integration_patterns.md)
- **Troubleshooting**: [Troubleshooting Guide](task_mcp_troubleshooting.md)

### For DevOps Engineers
- **Deployment**: [Security Guide](task_mcp_security_guide.md) → [Contracts](contracts.md)
- **Monitoring**: [Integration Patterns](developer_integration_patterns.md#performance-optimization-patterns)
- **Security**: [Security Model](security_model.md) → [Security Guide](task_mcp_security_guide.md)

### For Team Leads
- **Team Collaboration**: [Integration Patterns](developer_integration_patterns.md#team-collaboration-patterns)
- **Best Practices**: [Security Guide](task_mcp_security_guide.md) → [Token Policy](token_policy.md)
- **Workflow Integration**: [Integration Patterns](developer_integration_patterns.md#workflow-integration-patterns)

## Phase-Specific Documentation

### Phase 0: Foundations & Contracts ✅
- [Phase 0 Plan](../phases/Phase_0_Foundations_&_Contracts.md)
- [Implementation Report](../implementation_reports/phase-0-review-report.md)
- [Completion Handoff](../handoffs/handoff_2025-10-23_phase-0-complete.md)

### Phase 1: Core stdio Two Tools + Resources 🚧
- [Phase 1 Plan](../phases/Phase_1_Core_stdio_Two_Tools_+_Resources.md)
- **Current Documentation** (this page and linked documents)
- Implementation Status: Documentation framework complete

### Future Phases
- [Phase 2: Receipts & Validation](../phases/Phase_2_Receipts_&_Validation.md)
- [Phase 3: Resources & IDE UX](../phases/Phase_3_Resources_&_IDE_UX.md)
- [Phase 4: HTTPS/SSE for API](../phases/Phase_4_HTTPS_SSE_for_API.md)

## Technical Specifications

### Schemas
- [`change.open.input.schema.json`](../schemas/change.open.input.schema.json) - Input schema for change creation
- [`change.open.output.schema.json`](../schemas/change.open.output.schema.json) - Output schema for change creation
- [`change.archive.input.schema.json`](../schemas/change.archive.input.schema.json) - Input schema for change archival
- [`change.archive.output.schema.json`](../schemas/change.archive.output.schema.json) - Output schema for change archival
- [`changes.active.output.schema.json`](../schemas/changes.active.output.schema.json) - Schema for active changes listing
- [`receipt.schema.json`](../schemas/receipt.schema.json) - Receipt format specification

### Error Codes
All error codes are documented in [Contracts](contracts.md#error-codes-task-mcp):

| Code | Description | Common Causes |
|------|-------------|---------------|
| `ENOCHANGE` | Change not found | Incorrect slug, already archived |
| `ELOCKED` | Change locked | Another user has the change |
| `EBADSLUG` | Invalid slug format | Invalid characters, wrong length |
| `EBADSHAPE_*` | Invalid change structure | Missing files, malformed specs |
| `EPATH_ESCAPE` | Path traversal attempt | Security violation |
| `EARCHIVED` | Operation on archived change | Trying to modify completed change |

### Resource URIs
- `changes://active?page=&pageSize=` - List active changes
- `change://{slug}/proposal` - Access proposal document
- `change://{slug}/tasks` - Access tasks document  
- `change://{slug}/delta/**` - Access specification files

## Contributing to Documentation

### Style Guide
- Use clear, concise language
- Include practical examples
- Follow established patterns from Phase 0 documentation
- Maintain consistent formatting and structure

### Template for New Documentation
```markdown
# Document Title

_Last updated: YYYY-MM-DD_

## Overview
[Brief description of document purpose]

## Sections
[Organize with clear headings]

## Examples
[Include practical, tested examples]

## Related Documentation
[Link to relevant documents]
```

### Review Process
1. Create documentation in draft
2. Test all examples and code snippets
3. Review for consistency with existing docs
4. Update this index with new document
5. Submit for review

## Support and Feedback

### Getting Help
- **Documentation Issues**: Report problems with documentation
- **API Questions**: Use GitHub Discussions
- **Bug Reports**: File issues with reproduction steps
- **Feature Requests**: Submit enhancement proposals

### Community Resources
- **GitHub Repository**: [openspec/task-mcp](https://github.com/openspec/task-mcp)
- **Documentation Site**: [docs.openspec.org](https://docs.openspec.org)
- **Discord Community**: Real-time discussions
- **Stack Overflow**: `openspec` and `task-mcp` tags

### Documentation Feedback
To provide feedback on documentation:
1. Check existing issues for similar feedback
2. Include specific document and section references
3. Suggest improvements with examples
4. Consider contributing improvements directly

---

**Last Updated**: 2025-10-23  
**Phase**: 1 - Core stdio Two Tools + Resources  
**Status**: Documentation Framework Complete ✅

This documentation index serves as the central navigation hub for all Task MCP documentation. It's designed to help users find the right information quickly based on their role, experience level, and specific needs.