# Tasks — Chore

**Change ID:** `<slug>`  
**Created:** `<timestamp>`  
**Type:** Chore

## Task Schema Reference
```json
{
  "description": "string",
  "prompt": "string", 
  "subagent_type": "Engineer|Builder|DevOps|Architect|Reviewer|Knowledge",
  "provides": ["string"],
  "depends_on": ["string"],
  "acceptance": ["string"]
}
```

## Phase 1: Planning & Preparation
- [ ] **Task**: Analyze current state and requirements
  - **Subagent**: Knowledge
  - **Acceptance**: Current state documented, requirements clarified, success criteria defined
  - **Provides**: `state-analysis`, `requirements-definition`
  - **Resource**: `@task:change://<slug>/specs/analysis.md`

- [ ] **Task**: Create detailed execution plan
  - **Subagent**: Architect
  - **Depends on**: `requirements-definition`
  - **Acceptance**: Step-by-step plan, risk assessment, rollback strategy, timeline
  - **Provides**: `execution-plan`, `risk-mitigation`
  - **Resource**: `@task:change://<slug>/specs/plan.md`

- [ ] **Task**: Prepare test environment and backups
  - **Subagent**: DevOps
  - **Depends on**: `execution-plan`
  - **Acceptance**: Test environment ready, backups created, rollback procedure tested
  - **Provides**: `test-environment`, `backup-strategy`
  - **Resource**: `@task:change://<slug>/specs/preparation.md`

## Phase 2: Implementation
- [ ] **Task**: Apply core changes in test environment
  - **Subagent**: Engineer
  - **Depends on**: `test-environment`
  - **Acceptance**: Changes applied correctly, no errors, basic functionality preserved
  - **Provides**: `core-changes`, `initial-validation`
  - **Resource**: `@task:change://<slug>/specs/implementation.md`

- [ ] **Task**: Update build and deployment processes
  - **Subagent**: DevOps
  - **Depends on**: `core-changes`
  - **Acceptance**: Build scripts updated, CI/CD pipeline modified, deployment tested
  - **Provides**: `build-updates`, `deployment-changes`
  - **Resource**: `@task:change://<slug>/specs/build.md`

- [ ] **Task**: Update configuration and dependencies
  - **Subagent**: Builder
  - **Depends on**: `core-changes`
  - **Acceptance**: Configuration files updated, dependencies upgraded, environment variables set
  - **Provides**: `configuration-updates`, `dependency-changes`
  - **Resource**: `@task:change://<slug>/specs/configuration.md`

## Phase 3: Testing & Validation
- [ ] **Task**: Comprehensive testing in test environment
  - **Subagent**: Reviewer
  - **Depends on**: `configuration-updates`, `build-updates`
  - **Acceptance**: Full test suite passing, performance benchmarks met, no regressions
  - **Provides**: `comprehensive-testing`, `performance-validation`
  - **Resource**: `@task:change://<slug>/specs/testing.md`

- [ ] **Task**: Security and compliance validation
  - **Subagent**: Reviewer
  - **Depends on**: `comprehensive-testing`
  - **Acceptance**: Security scans clean, compliance checks passed, no vulnerabilities
  - **Provides**: `security-validation`, `compliance-checks`
  - **Resource**: `@task:change://<slug>/specs/security.md`

- [ ] **Task**: Documentation and knowledge transfer
  - **Subagent**: Knowledge
  - **Depends on**: `configuration-updates`
  - **Acceptance**: Documentation updated, runbooks revised, team training completed
  - **Provides**: `documentation-updates`, `knowledge-transfer`
  - **Resource**: `@task:change://<slug>/specs/documentation.md`

## Phase 4: Deployment
- [ ] **Task**: Deploy to staging environment
  - **Subagent**: DevOps
  - **Depends on**: `performance-validation`, `security-validation`
  - **Acceptance**: Staging deployment successful, smoke tests passing, monitoring active
  - **Provides**: `staging-deployment`, `staging-validation`
  - **Resource**: `@task:change://<slug>/specs/staging.md`

- [ ] **Task**: Final validation and user acceptance
  - **Subagent**: Reviewer
  - **Depends on**: `staging-deployment`
  - **Acceptance**: Stakeholder approval received, user validation complete, launch ready
  - **Provides**: `final-validation`, `stakeholder-approval`
  - **Resource**: `@task:change://<slug>/specs/validation.md`

- [ ] **Task**: Production deployment and monitoring
  - **Subagent**: DevOps
  - **Depends on**: `final-validation`
  - **Acceptance**: Production deployment successful, monitoring configured, rollback ready
  - **Provides**: `production-deployment`, `monitoring-setup`
  - **Resource**: `@task:change://<slug>/specs/production.md`

## Phase 5: Cleanup & Finalization
- [ ] **Task**: Remove deprecated code and cleanup
  - **Subagent**: Engineer
  - **Depends on**: `production-deployment`
  - **Acceptance**: Deprecated code removed, temporary files cleaned, repository tidy
  - **Provides**: `cleanup-completed`, `code-optimization`
  - **Resource**: `@task:change://<slug>/specs/cleanup.md`

- [ ] **Task**: Post-deployment monitoring and optimization
  - **Subagent**: DevOps
  - **Depends on**: `monitoring-setup`
  - **Acceptance**: System stable, performance optimized, alerts configured
  - **Provides**: `post-deployment-monitoring`, `optimization-complete`
  - **Resource**: `@task:change://<slug>/specs/monitoring.md`

- [ ] **Task**: Final documentation and knowledge archival
  - **Subagent**: Knowledge
  - **Depends on**: `cleanup-completed`
  - **Acceptance**: Final documentation complete, lessons learned documented, knowledge archived
  - **Provides**: `final-documentation`, `lessons-learned`
  - **Resource**: `@task:change://<slug>/specs/finalization.md`

## Quality Gates (must pass before progression)
### Functional Requirements
- [ ] No behavior change in user-facing functionality
- [ ] All existing features work as before
- [ ] Configuration changes validated
- [ ] Data integrity preserved

### Technical Requirements
- [ ] All tests passing (unit, integration, e2e)
- [ ] Code coverage maintained
- [ ] No linting errors
- [ ] Type checking passes
- [ ] Build process successful

### Performance & Security
- [ ] Performance benchmarks met or improved
- [ ] Security scan clean
- [ ] No new vulnerabilities
- [ ] Resource usage acceptable

### Operational Readiness
- [ ] Documentation updated and accurate
- [ ] Monitoring and alerts configured
- [ ] Rollback procedure tested
- [ ] Team trained if needed

## Resource URIs
- Proposal: `@task:change://<slug>/proposal.md`
- Tasks: `@task:change://<slug>/tasks.md`
- Analysis: `@task:change://<slug>/specs/analysis.md`
- Plan: `@task:change://<slug>/specs/plan.md`
- Implementation: `@task:change://<slug>/specs/implementation.md`
- Testing: `@task:change://<slug>/specs/testing.md`

## Task Dependencies Graph
```
Planning & Preparation:
state-analysis → requirements-definition → execution-plan
     ↓
test-environment → backup-strategy

Implementation:
test-environment → core-changes → build-updates + configuration-updates

Testing & Validation:
build-updates + configuration-updates → comprehensive-testing → security-validation
     ↓
documentation-updates

Deployment:
comprehensive-testing + security-validation → staging-deployment → final-validation
     ↓
production-deployment

Cleanup & Finalization:
production-deployment → cleanup-completed → post-deployment-monitoring
     ↓
final-documentation
```

## Chore Type Specific Guidelines
### Upgrade Tasks
- [ ] Version compatibility verified
- [ ] Breaking changes identified
- [ ] Migration path planned
- [ ] Rollback strategy tested

### Refactor Tasks
- [ ] Code quality improved
- [ ] Performance optimized
- [ ] Maintainability enhanced
- [ ] Tests updated accordingly

### Cleanup Tasks
- [ ] Dead code removed
- [ ] Unused dependencies cleaned
- [ ] Documentation updated
- [ ] No functionality lost

### Optimization Tasks
- [ ] Performance measured before/after
- [ ] Resource usage optimized
- [ ] Bottlenecks addressed
- [ ] Monitoring enhanced

## Notes for Task Execution
- **Conservative approach**: Better to be safe with infrastructure changes
- **Thorough testing**: Chores can have unexpected side effects
- **Clear communication**: Keep stakeholders informed
- **Documentation**: Document everything for future reference
- **Rollback ready**: Always have a way back

---
## Chore Template Usage Guide

### Planning Best Practices
1. **Understand current state**: Document exactly what exists now
2. **Define success clearly**: What does "done" look like?
3. **Assess risks thoroughly**: What could go wrong?
4. **Plan for rollback**: How do we undo if needed?
5. **Communicate early**: Let stakeholders know what's happening

### Execution Principles
1. **Test environments first**: Never test in production
2. **Incremental changes**: Small, reversible steps
3. **Comprehensive testing**: Test everything that could be affected
4. **Monitor closely**: Watch for unexpected behavior
5. **Document continuously**: Keep documentation up to date

### Resource Patterns for Chores
- `@task:change://slug/proposal.md` - Chore proposal and scope
- `@task:change://slug/tasks.md` - Implementation tasks
- `@task:change://slug/specs/analysis.md` - Current state analysis
- `@task:change://slug/specs/plan.md` - Detailed execution plan
- `@task:resource://path/to/config` - Configuration files
- `@task:resource://path/to/docs` - Relevant documentation

### Risk Mitigation Strategies
- **Blue-green deployment**: Reduce downtime risk
- **Feature flags**: Enable gradual rollout
- **Canary releases**: Test with small user groups
- **Comprehensive monitoring**: Watch for anomalies
- **Automated rollback**: Quick recovery from issues

### Common Chore Patterns
- **Dependency upgrades**: Security patches, feature updates
- **Runtime upgrades**: Node.js, Python, Java versions
- **Framework updates**: React, Angular, Spring versions
- **Tool updates**: Build tools, linters, test frameworks
- **Infrastructure updates**: Docker, Kubernetes, cloud services

---
*Generated using OpenSpec chore tasks template*