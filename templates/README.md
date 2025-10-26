# OpenSpec Templates

This directory contains enhanced templates for Task MCP integration with OpenSpec.

## Template Types

### Proposal Templates

Proposal templates define the structure for change proposals:

- **`proposal_feature.md`** - For new features and functionality
- **`proposal_bugfix.md`** - For bug fixes and issue resolution  
- **`proposal_chore.md`** - For maintenance, refactoring, and upgrades

### Task Templates

Task templates provide detailed breakdowns for executing changes:

- **`tasks_feature.md`** - Phased feature development with subagent assignments
- **`tasks_bugfix.md`** - Bug investigation, fix development, and validation
- **`tasks_chore.md`** - Maintenance work with risk mitigation

## Template Features

### Enhanced Structure
- **Clear sections** for description, acceptance criteria, dependencies
- **Comprehensive checklists** for quality gates and validation
- **Resource URI patterns** for Task MCP integration
- **Usage guidance** with good vs. bad examples

### Task MCP Integration
- **Subagent assignments** with clear responsibilities
- **Dependency management** between tasks
- **Resource URIs** for linking documents and artifacts
- **Quality gates** with acceptance criteria

### Best Practices
- **Template usage guides** with examples
- **Quality criteria** for each change type
- **Risk assessment** frameworks
- **Documentation standards**

## Using the Templates

### 1. Copy the Appropriate Template
```bash
# For a feature change
cp templates/proposal_feature.md openspec/changes/your-slug/proposal.md
cp templates/tasks_feature.md openspec/changes/your-slug/tasks.md

# For a bugfix
cp templates/proposal_bugfix.md openspec/changes/your-slug/proposal.md
cp templates/tasks_bugfix.md openspec/changes/your-slug/tasks.md

# For a chore
cp templates/proposal_chore.md openspec/changes/your-slug/proposal.md
cp templates/tasks_chore.md openspec/changes/your-slug/tasks.md
```

### 2. Customize the Content
- Replace placeholder text with your specific content
- Fill in all required sections
- Adjust task breakdown as needed
- Update resource URIs to match your change slug

### 3. Follow the Guidelines
- Use the provided checklists for quality assurance
- Follow the resource URI patterns for linking
- Reference the usage guides for best practices
- Ensure all acceptance criteria are met

## Resource URI Patterns

### Change Resources
- `@task:change://slug/proposal.md` - Change proposal
- `@task:change://slug/tasks.md` - Task breakdown
- `@task:change://slug/specs/name.md` - Specification documents

### General Resources
- `@task:resource://path/to/file` - Any project resource
- `@task:resource://docs/name.md` - Documentation files
- `@task:resource://config/file.json` - Configuration files

## Template Structure

### Proposal Template Sections
1. **Title** - Short, imperative description
2. **Problem/Scope** - What needs to be done
3. **Rationale/Motivation** - Why it's important
4. **Success Criteria** - Measurable outcomes
5. **Context** - Links and references
6. **Technical Approach** - How it will be done
7. **Acceptance Checklist** - Quality gates
8. **Resource URIs** - Task MCP links

### Task Template Sections
1. **Task Schema Reference** - Task structure definition
2. **Phased Breakdown** - Organized by development phases
3. **Subagent Assignments** - Who does what
4. **Dependencies** - Task relationships
5. **Quality Gates** - Progression criteria
6. **Resource URIs** - Document links
7. **Usage Guidance** - Best practices

## Quality Gates

### Common Gates (All Templates)
- [ ] All required sections completed
- [ ] Resource URIs correctly formatted
- [ ] Acceptance criteria measurable
- [ ] Quality checklists completed
- [ ] Documentation updated

### Feature-Specific Gates
- [ ] User scenarios defined
- [ ] Technical design complete
- [ ] Performance requirements specified
- [ ] Security considerations addressed

### Bugfix-Specific Gates
- [ ] Reproduction case documented
- [ ] Root cause identified
- [ ] Fix strategy defined
- [ ] Regression tests planned

### Chore-Specific Gates
- [ ] Scope clearly defined
- [ ] Risk assessment complete
- [ ] Rollback plan documented
- [ ] Impact analysis done

## Customization Guidelines

### Adapting Templates
1. **Keep the structure** - Maintain section organization
2. **Update examples** - Make them relevant to your project
3. **Adjust checklists** - Add project-specific requirements
4. **Customize resource URIs** - Match your repository structure

### Project-Specific Additions
- Add custom sections as needed
- Include project-specific quality gates
- Customize subagent assignments
- Add relevant resource patterns

## Best Practices

### Writing Proposals
1. **Start with the user** - Focus on problems, not solutions
2. **Be specific** - Use measurable success criteria
3. **Consider risks** - Think about what could go wrong
4. **Plan for observability** - How will we know it's working?

### Managing Tasks
1. **Define clear dependencies** - What needs to come first?
2. **Assign appropriately** - Match skills to work
3. **Include quality gates** - How do we know when it's done?
4. **Use resource references** - Link between related documents

### Resource URI Usage
1. **Be consistent** - Follow established patterns
2. **Test links** - Ensure URIs are functional
3. **Document usage** - Explain how to use resources
4. **Maintain links** - Update when documents move

## Examples and Reference

See the `/examples/` directory for:
- **Sample repository** with complete OpenSpec structure
- **Messages API example** with tool integration
- **Working change example** demonstrating template usage

## Support

For questions about template usage:
1. Check the template usage guides within each template
2. Reference the sample repository for working examples
3. Review the Messages API example for integration patterns
4. Consult the main OpenSpec documentation for detailed specifications

---

*These templates are designed to be immediately usable while providing comprehensive guidance for Task MCP integration with OpenSpec.*