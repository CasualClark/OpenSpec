# Getting Started Guide - Task MCP

_Last updated: 2025-10-26_

## Overview

Task MCP provides a minimal, well-structured contract surface for managing changes through OpenSpec. This guide will help you get up and running in **4.5 minutes** with our simplified dockerless-first approach.

## Prerequisites

### Simplified Requirements
**You only need:**
- **Node.js**: v20.19.0 or higher
- **Git**: v2.30 or higher
- A terminal

```bash
# Quick check
node --version  # Should show v20.19.0+
git --version   # Should show git version
```

That's it! No Python, no global CLI installs, no complex configuration.

## 4.5-Minute Setup

### 1. Clone and Install (1 minute)

```bash
# Clone the repository
git clone https://github.com/Fission-AI/OpenSpec.git
cd OpenSpec

# Install dependencies  
npm install
```

### 2. Start Task MCP Server (30 seconds)

```bash
# Start in stdio mode (for IDE integration)
npm run dev

# Or start directly
node bin/openspec.js task-mcp --stdio
```

Leave this running in your terminal.

### 3. Create Your First Change (1 minute)

Open a **new terminal** and run:

```bash
# Create a simple change
npm run dev:cli change create \
  --title "Add user login feature" \
  --slug "add-user-login" \
  --template feature
```

You'll see output like:
```
✓ Created change: add-user-login
📁 Location: openspec/changes/add-user-login
🔓 Unlocked (no owner specified)
```

### 4. Edit Your Change (2 minutes)

```bash
# Navigate to your change
cd openspec/changes/add-user-login

# Edit the proposal (what and why)
vim proposal.md
# or use any editor: code proposal.md, nano proposal.md, etc.

# Edit the tasks (how and when)  
vim tasks.md
```

### 5. Archive Your Change (30 seconds)

```bash
# Go back to project root
cd ../../..

# Archive your completed change
npm run dev:cli change archive --slug add-user-login
```

You'll see:
```
✓ Archived change: add-user-login
📋 Receipt: openspec/changes/add-user-login/receipt.json
```

**🎉 You're done!** You just completed the full OpenSpec workflow.

## Quick Start

### 1. Start the MCP Server
```bash
# For IDE/stdio mode (recommended for development)
task-mcp --stdio

# For HTTPS/API mode (production)
task-mcp --https --port 3000
```

### 2. Create Your First Change
```bash
# Using MCP CLI
mcp-call task change.open '{
  "title": "Add user authentication",
  "slug": "add-user-auth",
  "rationale": "Implement OAuth2 login functionality",
  "owner": "dev@example.com",
  "template": "feature"
}'

# Using OpenSpec CLI
openspec change create \
  --title "Add user authentication" \
  --slug "add-user-auth" \
  --template feature
```

### 3. Work with Your Change
```bash
# Navigate to change directory
cd openspec/changes/add-user-auth

# Edit proposal and tasks
vim proposal.md
vim tasks.md

# Add specification deltas
mkdir -p delta
echo "openapi: 3.0.0" > delta/auth-api.yml
```

### 4. Archive Your Change
```bash
# Using MCP CLI
mcp-call task change.archive '{"slug": "add-user-auth"}'

# Using OpenSpec CLI
openspec change archive --slug add-user-auth
```

## Core Concepts

### Changes
Changes are the fundamental unit of work in Task MCP. Each change includes:
- **Proposal**: What and why (proposal.md)
- **Tasks**: How and when (tasks.md)  
- **Deltas**: Specification changes (delta/ directory)
- **Receipt**: Audit trail (receipt.json)

### Slugs
Slugs are unique identifiers for changes:
- **Format**: `^[a-z0-9]([a-z0-9\-]{1,62})[a-z0-9]$`
- **Examples**: `add-user-auth`, `fix-login-bug`, `update-api-v2`
- **Rules**: Lowercase, hyphens only, 3-64 characters

### Locks
Changes can be locked to prevent conflicts:
- **Owner**: Email address of the person working on the change
- **TTL**: Time-to-live in seconds (60-86400)
- **Expiration**: Locks automatically expire

## Development Workflow

### 1. Planning Phase
```bash
# List existing changes
changes://active

# Check if slug is available
mcp-call task change.open '{
  "title": "Test availability",
  "slug": "your-proposed-slug"
}'  # Will fail if taken
```

### 2. Implementation Phase
```bash
# Create change with proper template
mcp-call task change.open '{
  "title": "Your feature title",
  "slug": "your-feature-slug",
  "template": "feature",
  "owner": "your-email@example.com",
  "ttl": 7200
}'

# Work with resources in IDE
@task:change://your-feature-slug/proposal
@task:change://your-feature-slug/tasks
@task:change://your-feature-slug/delta
```

### 3. Testing Phase
```bash
# Run schema validation
npm run validate-schemas

# Run tests
npm test

# Check linting
npm run lint

# Verify change completeness
openspec change validate --slug your-feature-slug
```

### 4. Archive Phase
```bash
# Archive change
mcp-call task change.archive '{"slug": "your-feature-slug"}'

# Review receipt
cat openspec/changes/your-feature-slug/receipt.json
```

## Common Patterns

### Feature Development
```bash
# Create feature change
mcp-call task change.open '{
  "title": "Add profile search",
  "slug": "add-profile-search",
  "template": "feature",
  "rationale": "Enable users to search profiles by name and skills"
}'

# Typical delta structure
delta/
├── api/
│   └── search-endpoint.yml
├── ui/
│   └── search-component.md
└── tests/
    └── search-integration.test.js
```

### Bug Fixes
```bash
# Create bugfix change
mcp-call task change.open '{
  "title": "Fix login redirect loop",
  "slug": "fix-login-redirect-loop",
  "template": "bugfix",
  "rationale": "Users get stuck in redirect loop on invalid credentials"
}'

# Focus on minimal, targeted changes
delta/
└── auth/
    └── login-handler.js
```

### Hotfixes
```bash
# Create hotfix change (higher priority)
mcp-call task change.open '{
  "title": "Fix security vulnerability in auth",
  "slug": "fix-auth-security-vuln",
  "template": "hotfix",
  "owner": "security@example.com",
  "ttl": 1800
}'
```

## Resource Management

### Using Resources in IDE
```bash
# Reference proposal content
@task:change://add-user-auth/proposal

# Reference tasks
@task:change://add-user-auth/tasks

# Reference specific delta files
@task:change://add-user-auth/delta/auth-api.yml
@task:change://add-user-auth/delta/ui/components.md
```

### Efficient Token Usage
```bash
# ✅ Good: Use resource URIs
@task:change://your-slug/proposal

# ❌ Bad: Inline content
echo "Large proposal content..."
```

## Validation and Testing

### Schema Validation
```bash
# Validate all schemas
npm run validate-schemas

# Validate specific schema
python3 -c "
import jsonschema
import json

with open('docs/schemas/change.open.input.schema.json') as f:
    schema = json.load(f)

# Validate your data
validator = jsonschema.Draft202012Validator(schema)
"
```

### Change Validation
```bash
# Validate change structure
openspec change validate --slug your-slug

# Check required files
ls -la openspec/changes/your-slug/proposal.md
ls -la openspec/changes/your-slug/tasks.md

# Test archive process
mcp-call task change.archive '{"slug": "your-slug"}'
```

## Configuration

### Environment Variables
```bash
# Debug mode
export TASK_MCP_DEBUG=true

# Compact mode (API usage)
export TASK_MCP_COMPACT=true

# Log level
export TASK_MCP_LOG_LEVEL=info  # debug, info, warn, error

# Server configuration
export TASK_MCP_PORT=3000
export TASK_MCP_HOST=localhost
```

### Configuration File
```json
{
  "apiVersion": "v1.0.0",
  "defaultTTL": 3600,
  "maxTTL": 86400,
  "tokenLimit": 2000,
  "enableResources": true,
  "sandboxPath": "openspec"
}
```

## Troubleshooting

### Common Issues
1. **Slug conflicts**: Check existing changes first
2. **Lock timeouts**: Increase TTL or wait for expiration
3. **Schema validation**: Verify JSON syntax and required fields
4. **Resource access**: Ensure stdio mode for IDE integration

### Debug Mode
```bash
# Enable debug logging
export TASK_MCP_DEBUG=true
export TASK_MCP_LOG_LEVEL=debug

# Run with verbose output
task-mcp --stdio --verbose
```

### Getting Help
- Check the [troubleshooting guide](troubleshooting.md)
- Review [contracts documentation](contracts.md)
- Consult [token policy](token_policy.md)
- Open an issue on GitHub

## Next Steps

1. **Read the full documentation**:
   - [Contracts](contracts.md) - Detailed API contracts
   - [Token Policy](token_policy.md) - Token usage guidelines
   - [Troubleshooting](troubleshooting.md) - Common issues

2. **Explore examples**:
   - Check `docs/examples/` for sample implementations
   - Review archived changes for patterns

3. **Join the community**:
   - GitHub discussions for questions
   - Contributing guidelines for development

4. **Practice with examples**:
   - Create a test change
   - Try different templates
   - Experiment with resource usage

Welcome to Task MCP! Happy coding!