# Proposal — Feature

## Title
<Short imperative title (e.g., "Add user authentication system")>

## Problem Statement
<What user problem are we solving? Be specific about the pain point and who is affected.>

## Rationale
<Why now? Impact, scope, risks, and business value. Include metrics if possible.>

## Success Criteria
- [ ] User can **<specific action>** with **<expected outcome>**
- [ ] **<Metric>** improves by **<target>**
- [ ] Performance: **<specific requirement>**
- [ ] Security: **<specific requirement>**

## Context (links/handles only)
- Planning bundle handle (if present): `<pampax bundle handle>`
- Related issues: `<issue links or @task:change://slug>`
- Design documents: `<@task:resource://path/to/design>`

## Technical Approach
### High-Level Design
<Architecture overview, key components, and data flow>

### Dependencies
- [ ] External services/APIs: `<list>`
- [ ] Internal systems: `<list>`
- [ ] Database changes: `<describe>`

### Risk Assessment
- **High Risk**: `<description and mitigation>`
- **Medium Risk**: `<description and mitigation>`
- **Low Risk**: `<description and mitigation>`

## Acceptance Checklist
### Functional Requirements
- [ ] All user scenarios work as specified
- [ ] Error handling covers edge cases
- [ ] Input validation is comprehensive
- [ ] Business logic is correct

### Non-Functional Requirements
- [ ] Performance meets benchmarks
- [ ] Security requirements satisfied
- [ ] Accessibility standards met
- [ ] Logging and monitoring in place

### Quality Gates
- [ ] Code coverage ≥ 80%
- [ ] All tests passing (unit, integration, e2e)
- [ ] Documentation updated
- [ ] Code review completed
- [ ] Security review passed

### Rollout Plan
- [ ] Feature flag implemented
- [ ] Gradual rollout strategy defined
- [ ] Monitoring alerts configured
- [ ] Rollback procedure documented

## Resource URIs (for Task MCP)
- Proposal: `@task:change://<slug>/proposal.md`
- Tasks: `@task:change://<slug>/tasks.md`
- Specs: `@task:change://<slug>/specs/`

## Final Acceptance
- [ ] Behavior verified in staging
- [ ] Performance benchmarks met
- [ ] Security scan clean
- [ ] Documentation complete
- [ ] Tasks merged into living specs on archive

---
## Template Usage Guide

### Good Examples
- **Title**: "Add OAuth2 authentication" ✅
- **Problem**: "Users cannot securely access third-party services" ✅
- **Success Criteria**: "User can authenticate with Google in < 3 seconds" ✅

### Bad Examples
- **Title**: "Auth stuff" ❌
- **Problem**: "We need auth" ❌
- **Success Criteria**: "It works" ❌

### Task MCP Integration
Use these resource patterns in your tasks:
- `@task:change://slug/proposal.md` - Link to this proposal
- `@task:change://slug/tasks.md` - Link to task breakdown
- `@task:resource://path/to/file` - Link to any resource

### Tips for Writing Great Proposals
1. **Start with the user**: Focus on the problem, not the solution
2. **Be specific**: Use numbers and measurable outcomes
3. **Think about rollback**: What happens if this fails?
4. **Consider edge cases**: What could go wrong?
5. **Plan for observability**: How will we know it's working?

---
*Generated using OpenSpec feature template*