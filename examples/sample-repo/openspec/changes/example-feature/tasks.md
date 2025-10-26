# Tasks — Feature

**Change ID:** example-feature  
**Created:** 2025-10-26T00:00:00.000Z  
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
- [ ] **Task**: Research existing examples and best practices
  - **Subagent**: Knowledge
  - **Acceptance**: Research summary of existing examples, best practices document, requirements list
  - **Provides**: `example-research`, `best-practices`
  - **Resource**: `@task:change://example-feature/specs/research.md`

- [ ] **Task**: Design example structure and content
  - **Subagent**: Architect
  - **Depends on**: `example-research`, `best-practices`
  - **Acceptance**: Example structure design, content outline, resource URI plan
  - **Provides**: `example-design`, `content-outline`
  - **Resource**: `@task:change://example-feature/specs/design.md`

- [ ] **Task**: Define quality criteria and validation approach
  - **Subagent**: Reviewer
  - **Depends on**: `example-design`
  - **Acceptance**: Quality criteria checklist, validation test plan, example review process
  - **Provides**: `quality-criteria`, `validation-plan`
  - **Resource**: `@task:change://example-feature/specs/quality.md`

## Phase 2: Content Creation
- [ ] **Task**: Write example proposal content
  - **Subagent**: Knowledge
  - **Depends on**: `content-outline`
  - **Acceptance**: Proposal content complete, follows template format, clear and understandable
  - **Provides**: `proposal-content`, `template-example`
  - **Resource**: `@task:change://example-feature/proposal.md`

- [ ] **Task**: Create example task breakdown
  - **Subagent**: Orchestrator
  - **Depends on**: `example-design`
  - **Acceptance**: Task breakdown complete, subagent assignments appropriate, dependencies clear
  - **Provides**: `task-breakdown`, `subagent-assignments`
  - **Resource**: `@task:change://example-feature/tasks.md`

- [ ] **Task**: Implement resource URI examples
  - **Subagent**: Engineer
  - **Depends on**: `proposal-content`
  - **Acceptance**: Resource URIs functional, links work correctly, examples comprehensive
  - **Provides**: `resource-implementation`, `uri-examples`
  - **Resource**: `@task:change://example-feature/specs/resources.md`

## Phase 3: Integration & Documentation
- [ ] **Task**: Create specification documents
  - **Subagent**: Knowledge
  - **Depends on**: `task-breakdown`
  - **Acceptance**: All spec documents created, content accurate, format consistent
  - **Provides**: `spec-documents`, `documentation-complete`
  - **Resource**: `@task:change://example-feature/specs/README.md`

- [ ] **Task**: Validate example completeness and accuracy
  - **Subagent**: Reviewer
  - **Depends on**: `resource-implementation`, `spec-documents`
  - **Acceptance**: Example validation complete, all links functional, content accurate
  - **Provides**: `example-validation`, `accuracy-check`
  - **Resource**: `@task:change://example-feature/specs/validation.md`

- [ ] **Task**: Create usage guide and documentation
  - **Subagent**: Knowledge
  - **Depends on**: `example-validation`
  - **Acceptance**: Usage guide complete, documentation clear, examples helpful
  - **Provides**: `usage-guide`, `user-documentation`
  - **Resource**: `@task:resource://docs/example-usage.md`

## Phase 4: Review & Publication
- [ ] **Task**: Conduct comprehensive quality review
  - **Subagent**: Reviewer
  - **Depends on**: `usage-guide`
  - **Acceptance**: Quality review complete, all criteria met, stakeholder approval
  - **Provides**: `quality-review`, `final-approval`
  - **Resource**: `@task:change://example-feature/specs/review.md`

- [ ] **Task**: Prepare for publication and integration
  - **Subagent**: DevOps
  - **Depends on**: `final-approval`
  - **Acceptance**: Publication ready, integration tested, deployment prepared
  - **Provides**: `publication-ready`, `integration-tested`
  - **Resource**: `@task:change://example-feature/specs/publication.md`

- [ ] **Task**: Archive and finalize example
  - **Subagent**: Orchestrator
  - **Depends on**: `publication-ready`
  - **Acceptance**: Example archived, documentation updated, lessons learned recorded
  - **Provides**: `example-archived`, `finalization-complete`
  - **Resource**: `@task:change://example-feature/specs/archive.md`

## Quality Gates (must pass before progression)
### Content Quality
- [ ] All example content clear and understandable
- [ ] Resource URIs functional and correctly formatted
- [ ] Template structure followed consistently
- [ ] Best practices demonstrated properly

### Technical Quality
- [ ] No broken links or references
- [ ] All documents follow proper format
- [ ] Resource URI patterns correct
- [ ] Integration with Task MCP functional

### Educational Quality
- [ ] Example serves as clear reference
- [ ] Guidance comprehensive but not overwhelming
- [ ] Real-world applicability demonstrated
- [ ] Learning objectives achieved

### Documentation Quality
- [ ] All necessary documentation created
- [ ] Usage instructions clear
- [ ] Examples practical and relevant
- [ ] Reference quality maintained

## Resource URIs
- Proposal: `@task:change://example-feature/proposal.md`
- Tasks: `@task:change://example-feature/tasks.md`
- Specs Directory: `@task:change://example-feature/specs/`
- Research: `@task:change://example-feature/specs/research.md`
- Design: `@task:change://example-feature/specs/design.md`
- Quality: `@task:change://example-feature/specs/quality.md`

## Task Dependencies Graph
```
Discovery & Design:
example-research → best-practices → example-design → quality-criteria

Content Creation:
content-outline → proposal-content + task-breakdown + resource-implementation

Integration & Documentation:
task-breakdown → spec-documents + resource-implementation → example-validation
     ↓
usage-guide

Review & Publication:
usage-guide → quality-review → publication-ready → example-archived
```

## Notes for Task Execution
- This is a documentation-only change focused on creating examples
- All tasks should emphasize clarity and educational value
- Resource URIs should be tested for functionality
- Content should serve as a reference for real implementations
- Quality gates focus on educational effectiveness

---
## Task Template Usage Guide

### Writing Good Example Tasks
1. **Focus on clarity**: Examples should be easy to understand
2. **Demonstrate patterns**: Show best practices in action
3. **Be comprehensive**: Cover all important aspects
4. **Stay practical**: Focus on real-world applicability
5. **Test thoroughly**: Ensure all examples work

### Subagent Specializations for Examples
- **Knowledge**: Research, content creation, documentation
- **Architect**: Structure design, pattern definition
- **Engineer**: Technical implementation, resource URIs
- **Reviewer**: Quality validation, accuracy checking
- **Orchestrator**: Task coordination, final approval
- **DevOps**: Publication, integration, deployment

### Resource Patterns for Examples
- `@task:change://example-feature/proposal.md` - Example proposal
- `@task:change://example-feature/tasks.md` - Example tasks
- `@task:change://example-feature/specs/name.md` - Example specifications
- `@task:resource://docs/example-usage.md` - Usage documentation

### Example Quality Criteria
1. **Clarity**: Easy to understand and follow
2. **Completeness**: Covers all important aspects
3. **Accuracy**: Technical details correct
4. **Practicality**: Real-world applicability
5. **Relevance**: Current and useful

---
*Generated using OpenSpec feature tasks template*