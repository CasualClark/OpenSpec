# Proposal — Bugfix

## Title
<Short imperative title (e.g., "Fix memory leak in user session handler")>

## Bug Summary
<Describe the defect and repro steps. Include:
- What is happening vs. what should happen
- Frequency and impact
- Affected users/systems
- Error messages or logs>

## Reproduction Steps
1. **Step 1**: `<specific action>`
2. **Step 2**: `<specific action>`
3. **Step 3**: `<specific action>`
4. **Expected**: `<what should happen>`
5. **Actual**: `<what actually happens>`

## Root Cause Analysis
### Suspected Cause
<Initial hypothesis of what's broken based on investigation>

### Evidence
- [ ] Logs showing the error: `<@task:resource://path/to/logs>`
- [ ] Stack traces: `<@task:resource://path/to/stacktrace>`
- [ ] Reproduction case: `<@task:resource://path/to/repro>`
- [ ] Affected versions: `<list>`

### Investigation Notes
<Findings from debugging, code review, or system analysis>

## Fix Strategy
### High-Level Approach
<Describe the fix approach at a high level>

### Technical Details
- [ ] Code changes needed: `<describe>`
- [ ] Data migration required: `<yes/no and details>`
- [ ] Configuration changes: `<describe>`
- [ ] Cache invalidation: `<describe>`

### Risk Assessment
- **Breaking Changes**: `<yes/no and impact>`
- **Performance Impact**: `<describe>`
- **Rollback Complexity**: `<low/medium/high>`

## Context (links/handles only)
- Issue/PR reference: `<link or @task:change://slug>`
- Bug report: `<link or @task:resource://path/to/bug>`
- Related fixes: `<@task:change://related-slug>`
- Planning bundle handle (if present): `<pampax bundle handle>`

## Testing Strategy
### Regression Tests
- [ ] Unit test for the fix: `<describe>`
- [ ] Integration test: `<describe>`
- [ ] End-to-end test: `<describe>`
- [ ] Performance test: `<describe if needed>`

### Verification Steps
- [ ] Reproduction case passes
- [ ] No new errors introduced
- [ ] Related functionality still works
- [ ] Performance not degraded

## Acceptance Checklist
### Bug Resolution
- [ ] Original issue is resolved
- [ ] No side effects introduced
- [ ] Edge cases handled properly
- [ ] Error messages are clear

### Quality Assurance
- [ ] Repro test added and passing
- [ ] Regression guard in place
- [ ] Code coverage maintained/improved
- [ ] Documentation updated if needed

### Deployment Safety
- [ ] Feature flag available if risky
- [ ] Monitoring configured
- [ ] Rollback plan documented
- [ ] Communication plan ready

## Resource URIs (for Task MCP)
- Proposal: `@task:change://<slug>/proposal.md`
- Tasks: `@task:change://<slug>/tasks.md`
- Bug report: `@task:resource://path/to/bug`
- Reproduction case: `@task:resource://path/to/repro`

## Final Acceptance
- [ ] Repro test added and passing
- [ ] Regression guard in place
- [ ] Fix verified in staging
- [ ] No performance degradation
- [ ] Tasks merged into living specs on archive

---
## Template Usage Guide

### Good Examples
- **Title**: "Fix null pointer exception in user service" ✅
- **Repro**: "Clear, step-by-step reproduction" ✅
- **Root Cause**: "Specific code location and reason" ✅

### Bad Examples
- **Title**: "Fix bug" ❌
- **Repro**: "Sometimes it breaks" ❌
- **Root Cause**: "Something is wrong" ❌

### Bug Classification
Use these labels to categorize bugs:
- **Critical**: System down, data loss, security breach
- **High**: Major feature broken, significant user impact
- **Medium**: Feature partially broken, workaround available
- **Low**: Cosmetic issue, minor inconvenience

### Task MCP Integration
Use these resource patterns for bug fixes:
- `@task:change://slug/proposal.md` - Link to this proposal
- `@task:change://slug/tasks.md` - Link to task breakdown
- `@task:resource://path/to/bug` - Link to original bug report
- `@task:resource://path/to/logs` - Link to relevant logs

### Root Cause Analysis Tips
1. **Ask "why" five times**: Dig deep to find the real cause
2. **Look at the data**: Check logs, metrics, and user reports
3. **Consider recent changes**: What changed around the time the bug appeared?
4. **Think systematically**: Is it code, data, infrastructure, or process?
5. **Document everything**: Your analysis helps others learn

---
*Generated using OpenSpec bugfix template*