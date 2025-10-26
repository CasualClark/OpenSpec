# Tasks — Bugfix

**Change ID:** `<slug>`  
**Created:** `<timestamp>`  
**Type:** Bugfix

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

## Phase 1: Investigation & Analysis
- [ ] **Task**: Reproduce and isolate the bug
  - **Subagent**: Engineer
  - **Acceptance**: Reliable reproduction case, root cause identified, impact assessment
  - **Provides**: `bug-reproduction`, `root-cause-analysis`
  - **Resource**: `@task:change://<slug>/specs/investigation.md`

- [ ] **Task**: Assess impact and affected systems
  - **Subagent**: Reviewer
  - **Depends on**: `bug-reproduction`
  - **Acceptance**: Impact matrix, affected versions, user impact assessment, risk level
  - **Provides**: `impact-assessment`, `risk-evaluation`
  - **Resource**: `@task:change://<slug>/specs/impact.md`

- [ ] **Task**: Research similar issues and existing solutions
  - **Subagent**: Knowledge
  - **Depends on**: `root-cause-analysis`
  - **Acceptance**: Related issues catalog, solution approaches, best practices research
  - **Provides**: `issue-research`, `solution-options`
  - **Resource**: `@task:change://<slug>/specs/research.md`

## Phase 2: Fix Development
- [ ] **Task**: Design minimal fix approach
  - **Subagent**: Architect
  - **Depends on**: `root-cause-analysis`, `solution-options`
  - **Acceptance**: Fix strategy document, risk assessment, rollback plan, test strategy
  - **Provides**: `fix-design`, `test-plan`
  - **Resource**: `@task:change://<slug>/specs/fix-design.md`

- [ ] **Task**: Implement the minimal fix
  - **Subagent**: Engineer
  - **Depends on**: `fix-design`
  - **Acceptance**: Fix implemented, minimal code changes, no side effects, unit tests added
  - **Provides**: `fix-implementation`, `reproduction-test`
  - **Resource**: `@task:change://<slug>/specs/implementation.md`

- [ ] **Task**: Add comprehensive test coverage
  - **Subagent**: Reviewer
  - **Depends on**: `fix-implementation`
  - **Acceptance**: Reproduction test added, regression tests in place, edge cases covered
  - **Provides**: `test-coverage`, `regression-guards`
  - **Resource**: `@task:change://<slug>/specs/testing.md`

## Phase 3: Validation & Testing
- [ ] **Task**: Verify fix resolves the issue
  - **Subagent**: Engineer
  - **Depends on**: `test-coverage`
  - **Acceptance**: Original reproduction case passes, no new errors, functionality intact
  - **Provides**: `fix-validation`, `regression-test`
  - **Resource**: `@task:change://<slug>/specs/validation.md`

- [ ] **Task**: Comprehensive regression testing
  - **Subagent**: Reviewer
  - **Depends on**: `fix-validation`
  - **Acceptance**: Full regression test suite passes, performance not degraded, related features work
  - **Provides**: `regression-validation`, `performance-check`
  - **Resource**: `@task:change://<slug>/specs/regression.md`

- [ ] **Task**: Security and stability assessment
  - **Subagent**: Reviewer
  - **Depends on**: `fix-validation`
  - **Acceptance**: Security scan clean, stability verified, no new vulnerabilities
  - **Provides**: `security-validation`, `stability-check`
  - **Resource**: `@task:change://<slug>/specs/security.md`

## Phase 4: Release Preparation
- [ ] **Task**: Prepare release notes and documentation
  - **Subagent**: Knowledge
  - **Depends on**: `regression-validation`
  - **Acceptance**: Release notes drafted, user impact documented, workaround instructions
  - **Provides**: `release-notes`, `impact-documentation`
  - **Resource**: `@task:change://<slug>/specs/release-notes.md`

- [ ] **Task**: Plan deployment strategy
  - **Subagent**: DevOps
  - **Depends on**: `stability-check`
  - **Acceptance**: Deployment plan ready, rollback procedure tested, monitoring configured
  - **Provides**: `deployment-plan`, `monitoring-setup`
  - **Resource**: `@task:change://<slug>/specs/deployment.md`

- [ ] **Task**: Final quality gate validation
  - **Subagent**: Reviewer
  - **Depends on**: `deployment-plan`, `release-notes`
  - **Acceptance**: All quality gates passed, stakeholder approval, release ready
  - **Provides**: `final-validation`, `release-approval`
  - **Resource**: `@task:change://<slug>/specs/final-review.md`

## Critical Path (for high-priority bugs)
### Emergency Fix Process (for critical bugs)
- [ ] **Task**: Emergency hotfix implementation
  - **Subagent**: Engineer
  - **Acceptance**: Minimal fix deployed, issue resolved, hotfix tested
  - **Provides**: `hotfix-implementation`
  - **Resource**: `@task:change://<slug>/specs/hotfix.md`

- [ ] **Task**: Post-hotfix validation
  - **Subagent**: Reviewer
  - **Depends on**: `hotfix-implementation`
  - **Acceptance**: Hotfix working, no regressions, monitoring stable
  - **Provides**: `hotfix-validation`
  - **Resource**: `@task:change://<slug>/specs/hotfix-validation.md`

## Quality Gates (must pass before progression)
### Bug Resolution
- [ ] Original reproduction case resolved
- [ ] No new issues introduced
- [ ] Related functionality unaffected
- [ ] Performance not degraded

### Testing Coverage
- [ ] Reproduction test added and passing
- [ ] Regression tests comprehensive
- [ ] Edge cases covered
- [ ] Security tests passing

### Documentation
- [ ] Root cause documented
- [ ] Fix approach explained
- [ ] Release notes complete
- [ ] Knowledge base updated

### Operational Readiness
- [ ] Deployment plan validated
- [ ] Rollback procedure tested
- [ ] Monitoring configured
- [ ] Support team notified

## Resource URIs
- Proposal: `@task:change://<slug>/proposal.md`
- Tasks: `@task:change://<slug>/tasks.md`
- Investigation: `@task:change://<slug>/specs/investigation.md`
- Root Cause: `@task:change://<slug>/specs/root-cause.md`
- Fix Design: `@task:change://<slug>/specs/fix-design.md`
- Implementation: `@task:change://<slug>/specs/implementation.md`

## Bug Classification Guidelines
### Priority Levels
- **Critical**: System down, data loss, security breach → Use emergency process
- **High**: Major feature broken, significant user impact → Fast-track normal process
- **Medium**: Feature partially broken, workaround available → Normal process
- **Low**: Cosmetic issue, minor inconvenience → Normal process

### Complexity Levels
- **Simple**: Single file change, clear fix path → Engineer only
- **Medium**: Multiple files, some integration → Engineer + Reviewer
- **Complex**: Systemic issue, architectural impact → All subagents

## Task Dependencies Graph
```
Normal Process:
bug-reproduction → root-cause-analysis → impact-assessment
     ↓
solution-options → fix-design → fix-implementation → test-coverage
     ↓
fix-validation → regression-validation → security-validation
     ↓
release-notes + deployment-plan → final-validation

Emergency Process:
bug-reproduction → hotfix-implementation → hotfix-validation
```

## Notes for Task Execution
- **Speed vs. Quality**: Balance urgency with thoroughness
- **Documentation**: Document everything for future reference
- **Communication**: Keep stakeholders informed of progress
- **Testing**: Never skip regression testing
- **Rollback**: Always have a rollback plan

---
## Bugfix Template Usage Guide

### Bug Investigation Best Practices
1. **Reproduce first**: Never fix without reliable reproduction
2. **Isolate the problem**: Find the exact cause, not just symptoms
3. **Assess impact**: Understand who is affected and how badly
4. **Research thoroughly**: Look for similar issues and solutions
5. **Plan the fix**: Design before implementing

### Fix Implementation Principles
1. **Minimal changes**: Fix only what's broken
2. **Test comprehensively**: Cover the fix and related areas
3. **Document decisions**: Explain why you chose this approach
4. **Consider edge cases**: Think about what else could break
5. **Plan for rollback**: Know how to undo if needed

### Resource Patterns for Bugfixes
- `@task:change://slug/proposal.md` - Bug report and analysis
- `@task:change://slug/tasks.md` - Fix implementation tasks
- `@task:change://slug/specs/investigation.md` - Investigation findings
- `@task:change://slug/specs/root-cause.md` - Root cause analysis
- `@task:resource://path/to/logs` - Relevant log files
- `@task:resource://path/to/repro` - Reproduction scripts

### Emergency Response Checklist
- [ ] Acknowledge receipt (within 1 hour)
- [ ] Assess severity and impact (within 2 hours)
- [ ] Communicate to stakeholders (within 2 hours)
- [ ] Start investigation (within 4 hours)
- [ ] Deploy hotfix (within 24 hours for critical)
- [ ] Post-mortem and documentation (within 48 hours)

---
*Generated using OpenSpec bugfix tasks template*