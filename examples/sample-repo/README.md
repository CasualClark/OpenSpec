# Sample OpenSpec Repository

A minimal but functional example repository demonstrating Task MCP integration with OpenSpec.

## Quick Start

This repository shows how to use Task MCP for managing changes in an OpenSpec-compliant project.

### Repository Structure

```
sample-repo/
├── openspec/
│   ├── changes/
│   │   └── example-feature/
│   │       ├── proposal.md
│   │       ├── tasks.md
│   │       └── specs/
│   │           └── README.md
│   └── openspec.json
├── src/
│   └── example.js
├── package.json
└── README.md
```

## OpenSpec Configuration

The `openspec/openspec.json` file defines the repository's OpenSpec configuration:

```json
{
  "apiVersion": "1.0",
  "kind": "OpenSpec",
  "metadata": {
    "name": "sample-repo",
    "description": "Sample repository for Task MCP demonstration"
  },
  "spec": {
    "changeTemplates": {
      "feature": "templates/proposal_feature.md",
      "bugfix": "templates/proposal_bugfix.md", 
      "chore": "templates/proposal_chore.md"
    },
    "taskTemplates": {
      "feature": "templates/tasks_feature.md",
      "bugfix": "templates/tasks_bugfix.md",
      "chore": "templates/tasks_chore.md"
    }
  }
}
```

## Task MCP Integration

### Creating a New Change

Use Task MCP to create a new change:

```bash
# Using the Messages API
curl -X POST https://your-task-mcp-server.com/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "tool": "change.open",
    "input": {
      "title": "Add user authentication",
      "slug": "user-auth-v2",
      "template": "feature",
      "rationale": "Implement secure user authentication with JWT tokens"
    }
  }'
```

### Resource References

Task MCP provides resource URIs for accessing change artifacts:

- `@task:change://user-auth-v2/proposal.md` - The change proposal
- `@task:change://user-auth-v2/tasks.md` - The task breakdown
- `@task:change://user-auth-v2/specs/` - Specification documents

### Example Change: `example-feature`

This repository includes an example change called `example-feature` that demonstrates:

- **Proposal**: A well-structured feature proposal with clear success criteria
- **Tasks**: Comprehensive task breakdown with subagent assignments
- **Specs**: Technical specifications and documentation

## Using the Templates

### Proposal Templates

The repository includes three proposal templates:

1. **Feature** (`templates/proposal_feature.md`)
   - For new features and functionality
   - Includes problem statement, success criteria, and technical approach

2. **Bugfix** (`templates/proposal_bugfix.md`)
   - For bug fixes and issue resolution
   - Includes reproduction steps, root cause analysis, and fix strategy

3. **Chore** (`templates/proposal_chore.md`)
   - For maintenance, refactoring, and upgrades
   - Includes scope definition, risk assessment, and implementation plan

### Task Templates

Corresponding task templates provide detailed breakdowns:

1. **Feature Tasks** (`templates/tasks_feature.md`)
   - Phased approach from discovery to deployment
   - Subagent assignments and dependencies
   - Quality gates and acceptance criteria

2. **Bugfix Tasks** (`templates/tasks_bugfix.md`)
   - Investigation, fix development, and validation
   - Emergency process for critical bugs
   - Regression testing and security validation

3. **Chore Tasks** (`templates/tasks_chore.md`)
   - Planning, implementation, and deployment
   - Risk mitigation and rollback procedures
   - Documentation and knowledge transfer

## Task MCP Subagents

The templates use these subagent specializations:

- **Architect**: System design and technical strategy
- **Engineer**: Core logic and implementation
- **Builder**: APIs and integration
- **DevOps**: Deployment and infrastructure
- **Reviewer**: Quality assurance and testing
- **Knowledge**: Research and documentation
- **Frontend**: User interface and experience

## Best Practices

### Writing Good Proposals

1. **Start with the user**: Focus on problems, not solutions
2. **Be specific**: Use measurable success criteria
3. **Consider risks**: Think about what could go wrong
4. **Plan for observability**: How will we know it's working?

### Managing Tasks

1. **Define clear dependencies**: What needs to come first?
2. **Assign appropriate subagents**: Match skills to work
3. **Include quality gates**: How do we know when it's done?
4. **Use resource references**: Link between related documents

### Resource URI Patterns

- `@task:change://slug/proposal.md` - Change proposal
- `@task:change://slug/tasks.md` - Task breakdown
- `@task:change://slug/specs/name.md` - Specification documents
- `@task:resource://path/to/file` - Any project resource

## Example Workflow

1. **Create Change**: Use Task MCP to create a new change with appropriate template
2. **Fill Proposal**: Complete the proposal with problem statement and success criteria
3. **Review Tasks**: Review and customize the task breakdown
4. **Execute Tasks**: Work through tasks using Task MCP subagents
5. **Archive Change**: Use Task MCP to archive completed change

## Integration Examples

See the Messages API example at `../messages_api_request.json` for a complete integration example.

## Getting Help

- Reference the OpenSpec documentation in the main repository
- Check the Phase 6 plans for detailed implementation guidance
- Review the completed plans for real-world examples

---

*This sample repository demonstrates Task MCP integration with OpenSpec. Use it as a reference for implementing Task MCP in your own projects.*