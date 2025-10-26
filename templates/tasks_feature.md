# Tasks — Feature

**Change ID:** `<slug>`  
**Created:** `<timestamp>`  
**Type:** Feature

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

## Phase 1: Discovery & Design
- [ ] **Task**: Research user requirements and existing solutions
  - **Subagent**: Knowledge
  - **Acceptance**: User research summary, competitive analysis, requirements document
  - **Provides**: `user-requirements`, `market-research`
  - **Resource**: `@task:change://<slug>/specs/requirements.md`

- [ ] **Task**: Create technical design and architecture
  - **Subagent**: Architect
  - **Depends on**: `user-requirements`, `market-research`
  - **Acceptance**: Architecture diagram, API design, data model, security considerations
  - **Provides**: `technical-design`, `api-spec`
  - **Resource**: `@task:change://<slug>/specs/design.md`

- [ ] **Task**: Define acceptance criteria and test strategy
  - **Subagent**: Reviewer
  - **Depends on**: `technical-design`
  - **Acceptance**: Test plan, acceptance criteria matrix, quality gates
  - **Provides**: `test-strategy`, `acceptance-criteria`
  - **Resource**: `@task:change://<slug>/specs/testing.md`

## Phase 2: Core Implementation
- [ ] **Task**: Implement core business logic and data models
  - **Subagent**: Engineer
  - **Depends on**: `technical-design`
  - **Acceptance**: Core functionality working, unit tests ≥ 80% coverage, type safety
  - **Provides**: `core-implementation`, `unit-tests`
  - **Resource**: `@task:change://<slug>/specs/implementation.md`

- [ ] **Task**: Build API endpoints and integration layer
  - **Subagent**: Builder
  - **Depends on**: `core-implementation`, `api-spec`
  - **Acceptance**: API endpoints functional, integration tests passing, documentation complete
  - **Provides**: `api-implementation`, `integration-tests`
  - **Resource**: `@task:change://<slug>/specs/api.md`

- [ ] **Task**: Implement security measures and validation
  - **Subagent**: Engineer
  - **Depends on**: `core-implementation`
  - **Acceptance**: Security tests passing, input validation complete, auth implemented
  - **Provides**: `security-implementation`, `validation-tests`
  - **Resource**: `@task:change://<slug>/specs/security.md`

## Phase 3: User Experience & Frontend
- [ ] **Task**: Design and implement user interface
  - **Subagent**: Frontend
  - **Depends on**: `api-implementation`
  - **Acceptance**: UI components functional, responsive design, accessibility compliance
  - **Provides**: `ui-implementation`, `component-tests`
  - **Resource**: `@task:change://<slug>/specs/ui.md`

- [ ] **Task**: Implement error handling and user feedback
  - **Subagent**: Builder
  - **Depends on**: `ui-implementation`
  - **Acceptance**: Error states handled, user feedback clear, loading states implemented
  - **Provides**: `error-handling`, `user-feedback`
  - **Resource**: `@task:change://<slug>/specs/ux.md`

## Phase 4: Integration & Testing
- [ ] **Task**: End-to-end integration testing
  - **Subagent**: Reviewer
  - **Depends on**: `ui-implementation`, `api-implementation`
  - **Acceptance**: E2E tests passing, user scenarios verified, performance benchmarks met
  - **Provides**: `e2e-tests`, `performance-validation`
  - **Resource**: `@task:change://<slug>/specs/e2e.md`

- [ ] **Task**: Security audit and penetration testing
  - **Subagent**: Reviewer
  - **Depends on**: `security-implementation`
  - **Acceptance**: Security scan clean, vulnerabilities addressed, compliance verified
  - **Provides**: `security-audit`, `compliance-report`
  - **Resource**: `@task:change://<slug>/specs/security-audit.md`

## Phase 5: Deployment & Documentation
- [ ] **Task**: Prepare deployment configuration and infrastructure
  - **Subagent**: DevOps
  - **Depends on**: `e2e-tests`
  - **Acceptance**: CI/CD pipeline updated, deployment scripts tested, monitoring configured
  - **Provides**: `deployment-config`, `monitoring-setup`
  - **Resource**: `@task:change://<slug>/specs/deployment.md`

- [ ] **Task**: Create user documentation and guides
  - **Subagent**: Knowledge
  - **Depends on**: `ui-implementation`
  - **Acceptance**: User guides complete, API documentation updated, examples provided
  - **Provides**: `user-documentation`, `api-docs`
  - **Resource**: `@task:change://<slug>/specs/docs.md`

- [ ] **Task**: Final quality review and validation
  - **Subagent**: Reviewer
  - **Depends on**: `deployment-config`, `user-documentation`
  - **Acceptance**: All quality gates passed, stakeholder approval received, launch ready
  - **Provides**: `final-review`, `launch-approval`
  - **Resource**: `@task:change://<slug>/specs/review.md`

## Quality Gates (must pass before progression)
### Code Quality
- [ ] All tests passing (unit, integration, e2e)
- [ ] Code coverage ≥ 80%
- [ ] No linting errors
- [ ] Type checking passes
- [ ] Security scan clean

### Performance
- [ ] Load tests meet benchmarks
- [ ] Memory usage within limits
- [ ] Response times acceptable
- [ ] No performance regressions

### User Experience
- [ ] All user scenarios working
- [ ] Accessibility standards met
- [ ] Error handling comprehensive
- [ ] Documentation complete

### Operational Readiness
- [ ] Monitoring and alerts configured
- [ ] Rollback procedure tested
- [ ] Team training completed
- [ ] Support documentation ready

## Resource URIs
- Proposal: `@task:change://<slug>/proposal.md`
- Tasks: `@task:change://<slug>/tasks.md`
- Specs Directory: `@task:change://<slug>/specs/`
- Requirements: `@task:change://<slug>/specs/requirements.md`
- Design: `@task:change://<slug>/specs/design.md`
- Testing: `@task:change://<slug>/specs/testing.md`

## Task Dependencies Graph
```
Discovery & Design:
user-requirements → technical-design → test-strategy

Core Implementation:
technical-design → core-implementation → api-implementation → security-implementation

User Experience:
api-implementation → ui-implementation → error-handling

Integration & Testing:
ui-implementation + security-implementation → e2e-tests + security-audit

Deployment & Documentation:
e2e-tests → deployment-config + user-documentation → final-review
```

## Notes for Task Execution
- Each task should estimate hours and identify blockers
- Update task status and link to completed work
- Use `@task:change://` references to link between tasks and resources
- Document decisions and trade-offs in relevant specs
- Escalate blockers to the orchestrator immediately

---
## Task Template Usage Guide

### Writing Good Tasks
1. **Be specific**: Clear acceptance criteria
2. **Define dependencies**: What needs to come first?
3. **Assign to right subagent**: Match skills to work
4. **Include quality gates**: How do we know it's done?
5. **Link resources**: Connect to relevant specs and docs

### Subagent Specializations
- **Architect**: System design, technical strategy
- **Engineer**: Core logic, algorithms, data structures
- **Builder**: APIs, integration, infrastructure
- **Frontend**: UI/UX, user interface
- **DevOps**: Deployment, monitoring, CI/CD
- **Reviewer**: Quality assurance, security, testing
- **Knowledge**: Research, documentation, user guides

### Resource Patterns
- `@task:change://slug/proposal.md` - Proposal document
- `@task:change://slug/tasks.md` - Task breakdown
- `@task:change://slug/specs/name.md` - Specification documents
- `@task:resource://path/to/file` - Any project resource

---
*Generated using OpenSpec feature tasks template*