# Proposal — Chore

## Title
<Short imperative title (e.g., "Upgrade Node.js runtime to v20")>

## Scope
<Maintenance/refactor/cleanup scope. Be specific about what's included and excluded.>

### In Scope
- [ ] `<specific item 1>`
- [ ] `<specific item 2>`
- [ ] `<specific item 3>`

### Out of Scope
- [ ] `<specific exclusion 1>`
- [ ] `<specific exclusion 2>`
- [ ] `<specific exclusion 3>`

## Motivation
<Why this work is necessary. Include:
- Technical debt reduction
- Security improvements
- Performance benefits
- Maintainability gains
- Compliance requirements>

## Impact Assessment
### Benefits
- **Performance**: `<describe expected improvements>`
- **Security**: `<describe security benefits>`
- **Maintainability**: `<describe maintainability gains>`
- **Developer Experience**: `<describe DX improvements>`

### Risks
- **Breaking Changes**: `<yes/no and impact>`
- **Downtime**: `<expected if any>`
- **Rollback Complexity**: `<low/medium/high>`
- **Dependencies**: `<describe dependency impact>`

## Context (links/handles only)
- Related issues/PRs: `<link or @task:change://slug>`
- Documentation: `<@task:resource://path/to/docs>`
- Planning bundle handle (if present): `<pampax bundle handle>`
- Dependencies: `<@task:resource://path/to/deps>`

## Implementation Plan
### Phase 1: Preparation
- [ ] Backup current state
- [ ] Create test environment
- [ ] Verify rollback procedure
- [ ] Communicate to stakeholders

### Phase 2: Execution
- [ ] Apply changes in test environment
- [ ] Run full test suite
- [ ] Performance testing
- [ ] Security scanning

### Phase 3: Deployment
- [ ] Schedule maintenance window if needed
- [ ] Deploy to staging
- [ ] Final validation
- [ ] Deploy to production

### Phase 4: Cleanup
- [ ] Remove deprecated code/patterns
- [ ] Update documentation
- [ ] Clean up temporary files
- [ ] Update monitoring

## Acceptance Checklist
### Technical Requirements
- [ ] No behavior change in user-facing functionality
- [ ] All tests passing (unit, integration, e2e)
- [ ] Performance benchmarks met or improved
- [ ] Security scan clean

### Quality Assurance
- [ ] Code coverage maintained
- [ ] No new linting errors
- [ ] Type checking passes
- [ ] Documentation updated

### Operational Readiness
- [ ] CI/CD pipeline updated if needed
- [ ] Monitoring and alerts configured
- [ ] Runbooks updated
- [ ] Team training completed if needed

### Verification
- [ ] Manual testing completed
- [ ] Automated testing comprehensive
- [ ] Load testing successful
- [ ] Rollback tested

## Resource URIs (for Task MCP)
- Proposal: `@task:change://<slug>/proposal.md`
- Tasks: `@task:change://<slug>/tasks.md`
- Documentation: `@task:resource://path/to/docs`
- Dependencies: `@task:resource://path/to/deps`

## Final Acceptance
- [ ] No behavior change detected
- [ ] CI green across all environments
- [ ] Performance improved or maintained
- [ ] Documentation complete and accurate
- [ ] Tasks merged into living specs on archive

---
## Template Usage Guide

### Good Examples
- **Title**: "Upgrade React to v18" ✅
- **Scope**: "Clear inclusions and exclusions" ✅
- **Motivation**: "Specific benefits and risks" ✅

### Bad Examples
- **Title**: "Update stuff" ❌
- **Scope**: "Fix everything" ❌
- **Motivation**: "It's old" ❌

### Chore Categories
Use these categories to classify chores:
- **Upgrade**: Dependencies, runtime, frameworks
- **Refactor**: Code structure, patterns, architecture
- **Cleanup**: Dead code, unused dependencies, technical debt
- **Optimization**: Performance, build times, resource usage
- **Compliance**: Security, legal, standards

### Task MCP Integration
Use these resource patterns for chores:
- `@task:change://slug/proposal.md` - Link to this proposal
- `@task:change://slug/tasks.md` - Link to task breakdown
- `@task:resource://path/to/docs` - Link to relevant documentation
- `@task:resource://path/to/deps` - Link to dependency information

### Best Practices for Chores
1. **Be conservative**: Better to be safe than sorry with infrastructure
2. **Test thoroughly**: Chores can have unexpected side effects
3. **Document everything**: Future you will thank present you
4. **Communicate early**: Let stakeholders know what's happening
5. **Plan for rollback**: Always have a way back

### Risk Mitigation
- **Blue-green deployment**: Reduce downtime risk
- **Feature flags**: Enable gradual rollout
- **Monitoring**: Watch for anomalies
- **Rollback plan**: Test it before you need it
- **Communication**: Keep everyone informed

---
*Generated using OpenSpec chore template*