# OpenSpec Examples

This directory contains example implementations and integrations for Task MCP with OpenSpec.

## Contents

### Sample Repository (`sample-repo/`)
A minimal but functional example repository demonstrating:
- **OpenSpec structure** with proper configuration
- **Example change** showing complete proposal and tasks
- **Resource URI usage** for document linking
- **Template integration** with enhanced templates

### Messages API Example (`messages_api_request.json`)
A complete Anthropic Messages API request demonstrating:
- **Tool integration** with Task MCP
- **Change creation** using the `change.open` tool
- **Schema definitions** for all available tools
- **Small, focused outputs** suitable for API responses

## Sample Repository Walkthrough

### Repository Structure
```
sample-repo/
├── openspec/
│   ├── openspec.json          # OpenSpec configuration
│   └── changes/
│       └── example-feature/   # Example change
│           ├── proposal.md     # Change proposal
│           ├── tasks.md        # Task breakdown
│           └── specs/          # Specifications
│               └── README.md   # Spec overview
├── src/
│   └── example.js             # Example application
├── package.json               # Node.js project config
└── README.md                  # Repository documentation
```

### Key Features

#### OpenSpec Configuration
The `openspec.json` file defines:
- Template paths for proposals and tasks
- Directory structure for changes
- Slug validation patterns
- API version and metadata

#### Example Change: `example-feature`
Demonstrates a complete change workflow:
- **Proposal**: Well-structured feature proposal with clear success criteria
- **Tasks**: Comprehensive task breakdown with subagent assignments
- **Specs**: Technical specifications and documentation
- **Resource URIs**: Proper linking between documents

#### Template Integration
Shows how to use the enhanced templates:
- Proposal structure with comprehensive sections
- Task breakdown with phased approach
- Quality gates and acceptance criteria
- Resource URI patterns for linking

## Messages API Example

### Purpose
Demonstrates how to integrate Task MCP with the Anthropic Messages API for creating changes programmatically.

### Key Features
- **Tool definitions** for `change.open`, `changes.active`, and `change.archive`
- **Schema validation** with proper input patterns
- **Small outputs** focused on paths and handles only
- **SSE configuration** for real-time communication

### Usage
```bash
# Send request to Claude with Task MCP integration
curl -X POST https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -d @examples/messages_api_request.json
```

### Expected Response
Small, focused output with change information:
```json
{
  "content": [
    {
      "type": "text",
      "text": "I'll create the 'user-auth-v2' change for you using the feature template."
    },
    {
      "type": "tool_result",
      "tool_result": {
        "slug": "user-auth-v2",
        "path": "/path/to/openspec/changes/user-auth-v2",
        "proposal": "@task:change://user-auth-v2/proposal.md",
        "tasks": "@task:change://user-auth-v2/tasks.md"
      }
    }
  ]
}
```

## Integration Patterns

### Resource URI Usage
The examples demonstrate proper resource URI patterns:

#### Change Resources
- `@task:change://slug/proposal.md` - Link to change proposal
- `@task:change://slug/tasks.md` - Link to task breakdown
- `@task:change://slug/specs/name.md` - Link to specifications

#### General Resources
- `@task:resource://path/to/file` - Link to any project file
- `@task:resource://docs/name.md` - Link to documentation

### Task MCP Integration
#### Creating Changes
```javascript
// Using the Messages API
{
  "tool": "change.open",
  "input": {
    "title": "Add user authentication",
    "slug": "user-auth-v2", 
    "template": "feature",
    "rationale": "Implement secure user authentication"
  }
}
```

#### Listing Active Changes
```javascript
{
  "tool": "changes.active",
  "input": {}
}
```

#### Archiving Changes
```javascript
{
  "tool": "change.archive",
  "input": {
    "slug": "completed-feature"
  }
}
```

## Best Practices Demonstrated

### Proposal Structure
- **Clear problem statement** with user focus
- **Measurable success criteria** with specific outcomes
- **Comprehensive risk assessment** with mitigation strategies
- **Resource URI linking** for document connectivity

### Task Management
- **Phased approach** from discovery to deployment
- **Subagent specialization** with clear responsibilities
- **Dependency management** between related tasks
- **Quality gates** with progression criteria

### Documentation Standards
- **Consistent formatting** across all documents
- **Comprehensive coverage** of all aspects
- **Clear examples** with good vs. bad patterns
- **Reference quality** for template usage

## Using These Examples

### 1. Explore the Sample Repository
```bash
cd examples/sample-repo
ls -la openspec/changes/example-feature/
cat openspec/openspec.json
```

### 2. Test the Messages API
```bash
# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Send the request
curl -X POST https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d @examples/messages_api_request.json
```

### 3. Adapt for Your Project
- Copy the sample repository structure
- Customize the OpenSpec configuration
- Adapt the templates to your needs
- Modify the Messages API request for your use case

## Integration Checklist

### Repository Setup
- [ ] OpenSpec configuration created
- [ ] Template paths configured
- [ ] Directory structure established
- [ ] Example change created

### Template Integration
- [ ] Proposal templates customized
- [ ] Task templates adapted
- [ ] Resource URI patterns defined
- [ ] Quality gates established

### API Integration
- [ ] Messages API request configured
- [ ] Tool definitions verified
- [ ] Schema validation tested
- [ ] Response format confirmed

### Documentation
- [ ] README files created
- [ ] Usage examples provided
- [ ] Best practices documented
- [ ] Integration patterns explained

## Troubleshooting

### Common Issues

#### Template Not Found
- Verify template paths in `openspec.json`
- Check file permissions and locations
- Ensure templates are properly formatted

#### Resource URI Not Working
- Confirm slug format matches pattern
- Verify file paths are correct
- Check document permissions

#### API Integration Failing
- Validate Messages API request format
- Check authentication tokens
- Verify Task MCP server connectivity

### Getting Help

1. **Check the templates** - Review template usage guides
2. **Examine the sample** - Compare with working example
3. **Test the API** - Verify Messages API integration
4. **Consult documentation** - Reference main OpenSpec docs

---

*These examples provide a complete reference for implementing Task MCP with OpenSpec in real-world scenarios.*