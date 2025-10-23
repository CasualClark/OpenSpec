# Task MCP Documentation Index

_Last updated: 2025-10-23_

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
| `SLUG_CONFLICT` | Slug already locked | Wait or use different slug |
| `CHANGE_NOT_FOUND` | Change doesn't exist | Check archived changes |
| `INVALID_INPUT` | Validation failed | Check input format |
| `SCHEMA_VALIDATION_FAILED` | Pre-archive checks failed | Fix missing files/tests |

## 📖 Learning Paths

### Path 1: New Developer (First Day)
1. [Quickstart](examples/quickstart.md) - 5 minutes
2. [Getting Started](getting-started.md) - 30 minutes
3. [Create first change](developer-onboarding.md#your-first-change) - 60 minutes
4. [Review contracts](contracts.md) - 30 minutes

### Path 2: Experienced Developer (First Hour)
1. [Quickstart](examples/quickstart.md) - 5 minutes
2. [Contracts reference](contracts.md) - 20 minutes
3. [Token policy](token_policy.md) - 15 minutes
4. [Examples](token-examples.md) - 20 minutes

### Path 3: Team Lead (First 30 Minutes)
1. [Contracts overview](contracts.md#overview) - 10 minutes
2. [Error handling](contracts.md#error-codes-and-handling) - 10 minutes
3. [Security constraints](contracts.md#security-constraints) - 10 minutes

## 🛠 Development Resources

### Schema Files
**[docs/schemas/](schemas/)**
- `change.open.input.schema.json`
- `change.open.output.schema.json`
- `change.archive.input.schema.json`
- `change.archive.output.schema.json`
- `changes.active.output.schema.json`
- `receipt.schema.json`

### Phase Documentation
**[docs/phases/](phases/)**
- [Phase 0: Foundations & Contracts](phases/Phase_0_Foundations_&_Contracts.md) - Current phase
- [Phase 1: Core stdio Two Tools + Resources](phases/Phase_1_Core_stdio_Two_Tools_+_Resources.md)
- [Phase 2: Receipts & Validation](phases/Phase_2_Receipts_&_Validation.md)

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

### Work with Resources
```bash
# IDE mode - zero token cost
@task:change://your-slug/proposal
@task:change://your-slug/tasks
@task:change://your-slug/delta
```
**Full guide**: [Developer Onboarding → Resource Management](developer-onboarding.md#resource-management)

### Archive a Change
```bash
mcp-call task change.archive '{"slug":"your-slug"}'
```
**Full guide**: [Getting Started → Archive Your Change](getting-started.md#4-archive-your-change)

### Troubleshoot Issues
**Full guide**: [Troubleshooting Guide](troubleshooting.md)

## 📊 Token Efficiency

### Best Practices
- Use resource URIs in IDE mode
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

**Full reference**: [Contracts → Security Constraints](contracts.md#security-constraints)

### Versioning Policy
- API version: `v{major}.{minor}.{patch}`
- Semantic versioning rules
- Backward compatibility guarantees

**Full reference**: [Contracts → Versioning Policy](contracts.md#versioning-policy)

## 🤝 Community & Support

### Getting Help
1. Check [troubleshooting guide](troubleshooting.md)
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

### Current Phase (Phase 0)
- ✅ Foundations & Contracts
- ✅ Developer documentation
- ✅ Schema validation
- ✅ Token efficiency guidelines

### Upcoming Phases
- 🔄 Phase 1: Core stdio implementation
- 📋 Phase 2: Receipts & Validation
- 📋 Phase 3: Resources & IDE UX
- 📋 Phase 4: HTTPS/SSE for API

---

**Need help?** Start with the [Quickstart](examples/quickstart.md) or check the [Troubleshooting Guide](troubleshooting.md).

**Last updated**: 2025-10-23  
**Version**: Task MCP v1.0.0