# Proposal — Feature

## Title
Add example feature to demonstrate Task MCP

## Problem Statement
Users need a clear example of how to use Task MCP with OpenSpec for managing changes in a repository.

## Rationale
This example feature serves as a reference implementation showing:
- How to structure a proper change proposal
- How to break down work into tasks with subagent assignments
- How to use resource URIs for linking documents
- How to follow OpenSpec best practices

## Success Criteria
- [ ] Users can understand the change structure by reading this proposal
- [ ] Task breakdown demonstrates proper subagent assignments
- [ ] Resource URIs show how to link between documents
- [ ] Example serves as a template for real changes

## Context (links/handles only)
- Planning bundle handle (if present): `<pampax bundle handle>`
- Related issues: `@task:change://sample-setup`
- Design documents: `@task:resource://docs/task-mcp-integration.md`

## Technical Approach
### High-Level Design
This is a documentation-only change that demonstrates:
1. Proper proposal structure with clear problem statement
2. Comprehensive task breakdown with dependencies
3. Resource URI usage for document linking
4. Quality gates and acceptance criteria

### Dependencies
- [ ] External services/APIs: None
- [ ] Internal systems: Task MCP server
- [ ] Database changes: None

### Risk Assessment
- **High Risk**: None
- **Medium Risk**: None
- **Low Risk**: Documentation may become outdated

## Acceptance Checklist
### Functional Requirements
- [ ] Proposal is clear and understandable
- [ ] Success criteria are measurable
- [ ] Technical approach is sound
- [ ] Context provides necessary links

### Non-Functional Requirements
- [ ] Documentation follows template format
- [ ] Resource URIs are correctly formatted
- [ ] Example is comprehensive but not overwhelming
- [ ] Structure follows best practices

### Quality Gates
- [ ] Proposal reviewed by Knowledge subagent
- [ ] Task structure validated by Orchestrator
- [ ] Resource URIs tested for correctness
- [ ] Example approved by Reviewer

### Rollout Plan
- [ ] No feature flag needed (documentation only)
- [ ] Immediate publication
- [ ] No monitoring required
- [ ] No rollback needed

## Resource URIs (for Task MCP)
- Proposal: `@task:change://example-feature/proposal.md`
- Tasks: `@task:change://example-feature/tasks.md`
- Specs: `@task:change://example-feature/specs/`

## Final Acceptance
- [ ] Proposal structure validates template format
- [ ] Resource URIs are functional
- [ ] Example provides clear guidance
- [ ] Documentation complete
- [ ] Tasks merged into living specs on archive

---
## Template Usage Guide

### Good Examples
- **Title**: "Add example feature to demonstrate Task MCP" ✅
- **Problem**: "Users need clear example of Task MCP usage" ✅
- **Success Criteria**: "Users can understand structure by reading" ✅

### Bad Examples
- **Title**: "Example stuff" ❌
- **Problem**: "Need example" ❌
- **Success Criteria**: "It works" ❌

### Task MCP Integration
Use these resource patterns in your tasks:
- `@task:change://example-feature/proposal.md` - Link to this proposal
- `@task:change://example-feature/tasks.md` - Link to task breakdown
- `@task:resource://path/to/file` - Link to any resource

### Tips for Writing Great Proposals
1. **Start with the user**: Focus on the problem, not the solution
2. **Be specific**: Use numbers and measurable outcomes
3. **Think about rollback**: What happens if this fails?
4. **Consider edge cases**: What could go wrong?
5. **Plan for observability**: How will we know it's working?

---
*Generated using OpenSpec feature template*