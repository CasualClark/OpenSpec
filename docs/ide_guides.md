# IDE Resource Attachment Guide

_How to discover and attach `@task:change://…` resources in your IDE_

Last updated: 2025-10-26

## Overview

Task MCP provides special resource URIs that let you reference OpenSpec change content directly in your IDE. This guide shows you how to discover, attach, and work with these resources efficiently.

## Quick Start: Resource Patterns

### Core Resource URIs

| Pattern | What it accesses | Example |
|---------|------------------|---------|
| `@task:change://slug/proposal` | Change proposal (what/why) | `@task:change://user-auth/proposal` |
| `@task:change://slug/tasks` | Task list (how/when) | `@task:change://user-auth/tasks` |
| `@task:change://slug/delta/file` | Specification files | `@task:change://user-auth/delta/api.yml` |
| `changes://active` | All active changes | `changes://active` |

### Discovery in IDE

Type `@` in your IDE prompt to see available resources:

```
> @task:change://user-auth/proposal
> @task:change://user-auth/tasks  
> changes://active
```

## Claude Code Integration

### Setup Task MCP Server

```bash
# Add Task MCP to Claude Code
claude mcp add --transport stdio openspec -- node /path/to/OpenSpec/bin/openspec.js task-mcp --stdio
```

### Using Resources in Claude Code

```bash
# Reference proposal content
> Can you review @task:change://user-auth/proposal and suggest improvements?

# Reference tasks
> What's the status of @task:change://user-auth/tasks?

# Compare multiple changes
> Compare @task:change://user-auth/proposal with @task:change://payment-integration/proposal

# List all active work
> Show me everything in changes://active
```

### Resource Discovery

Type `@` and select from autocomplete:
- `@task:change://` → Shows all available changes
- `changes://` → Shows pagination options

### Advanced Resource Patterns

```bash
# Reference specific files in delta directory
> @task:change://user-auth/delta/api/auth-endpoints.yml
> @task:change://user-auth/delta/ui/login-component.md

# Paginated active changes
> @changes://active?page=1&pageSize=20
> @changes://active?page=2&pageSize=20&nextPageToken=abc123
```

## VS Code Integration

### MCP Server Configuration

Add to `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "openspec": {
      "command": "node",
      "args": ["/path/to/OpenSpec/bin/openspec.js", "task-mcp", "--stdio"],
      "cwd": "${workspaceFolder}",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### Using Resources in VS Code

**With Claude Code Extension:**

1. Install Claude Code extension
2. Use `@` in Claude Code prompts
3. Resources appear in autocomplete

**Example VS Code workflow:**

```typescript
// In your code comments or Claude Code prompts
/**
 * TODO: Implement based on @task:change://user-auth/proposal
 * Tasks to complete: @task:change://user-auth/tasks
 */

// Reference API specifications
// See: @task:change://user-auth/delta/api/auth.yml
```

### Resource Browser Extension

Create a simple VS Code extension to browse resources:

```typescript
// src/extension.ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Register command to browse changes
  const browseCommand = vscode.commands.registerCommand('openspec.browseChanges', async () => {
    const result = await vscode.window.showQuickPick([
      'changes://active',
      'changes://active?page=1&pageSize=20'
    ], {
      placeHolder: 'Select resource to browse'
    });
    
    if (result) {
      // Open resource in new editor
      const uri = vscode.Uri.parse(`mcp://openspec/${result}`);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    }
  });

  context.subscriptions.push(browseCommand);
}
```

## JetBrains IDEs (IntelliJ, PyCharm, WebStorm)

### MCP Plugin Setup

1. Install MCP plugin from JetBrains Marketplace
2. Configure in `Settings > Tools > MCP`:

```xml
<!-- .idea/mcp-servers.xml -->
<application>
  <component name="McpServers">
    <server name="openspec">
      <option name="command" value="node" />
      <option name="args">
        <array>
          <option value="/path/to/OpenSpec/bin/openspec.js" />
          <option value="task-mcp" />
          <option value="--stdio" />
        </array>
      </option>
      <option name="workingDirectory" value="$PROJECT_DIR$" />
    </server>
  </component>
</application>
```

### Using Resources in JetBrains

**In the IDE terminal or AI chat:**

```bash
# Reference resources directly
> Analyze @task:change://user-auth/proposal

# Browse active changes
> Show changes://active

# Get specific files
> Check @task:change://user-auth/delta/database-schema.sql
```

**Resource Browser Plugin:**

```kotlin
// Kotlin example for JetBrains plugin
class OpenSpecResourceBrowser {
    suspend fun browseResources(): List<String> {
        val mcpClient = McpManager.getInstance().getClient("openspec")
        
        // Get active changes
        val activeChanges = mcpClient.getResource("changes://active")
        val data = Json.decodeFromString<PaginationData>(activeChanges)
        
        return data.changes.map { change ->
            "task:change://${change.slug}/proposal"
        }
    }
    
    suspend fun openResource(resourceUri: String) {
        val mcpClient = McpManager.getInstance().getClient("openspec")
        val content = mcpClient.getResource(resourceUri)
        
        // Open in new editor tab
        OpenFileInEditor(resourceUri, content)
    }
}
```

## Vim/Neovim Integration

### MCP.nvim Setup

```lua
-- Init.lua or .vimrc
require('mcp').setup({
  servers = {
    openspec = {
      cmd = {'node', '/path/to/OpenSpec/bin/openspec.js', 'task-mcp', '--stdio'},
      cwd = vim.fn.getcwd()
    }
  }
})

-- Key mappings for quick access
vim.keymap.set('n', '<leader>op', ':McpResource changes://active<CR>')
vim.keymap.set('n', '<leader>or', function()
  local slug = vim.fn.input("Change slug: ")
  vim.cmd('McpResource task:change://' .. slug .. '/proposal')
end)
```

### Resource Completion

```lua
-- Custom completion for Task MCP resources
local function openspec_completion()
  local resources = {
    "changes://active",
    "changes://active?page=1&pageSize=20"
  }
  
  -- Get active changes for dynamic completion
  local result = vim.fn.McpResource("changes://active?pageSize=10")
  local data = vim.json.decode(result)
  
  for _, change in ipairs(data.changes) do
    table.insert(resources, "task:change://" .. change.slug .. "/proposal")
    table.insert(resources, "task:change://" .. change.slug .. "/tasks")
  end
  
  return resources
end

-- Setup completion
vim.opt.completefunc = openspec_completion
```

## Emacs Integration

### MCP.el Setup

```elisp
;; Init.el
(use-package mcp
  :config
  (setq mcp-servers
        '((openspec . (:command "node"
                      :args ("/path/to/OpenSpec/bin/openspec.js" "task-mcp" "--stdio")
                      :cwd default-directory))))

;; Key bindings
(global-set-key (kbd "C-c o a") (lambda () (interactive) (mcp-browse-resource "openspec" "changes://active")))
(global-set-key (kbd "C-c o r") 'mcp-openspec-browse-resource)
```

### Resource Browser

```elisp
(defun mcp-openspec-browse-resource ()
  "Browse OpenSpec resources with completion."
  (interactive)
  (let* ((changes-json (mcp-browse-resource "openspec" "changes://active?pageSize=20"))
         (changes (json-read-from-string changes-json))
         (resources '()))
    
    ;; Build resource list
    (dolist (change (map-elt changes 'changes))
      (let ((slug (map-elt change 'slug)))
        (push (format "task:change://%s/proposal" slug) resources)
        (push (format "task:change://%s/tasks" slug) resources)))
    
    ;; Add pagination resources
    (push "changes://active" resources)
    (push "changes://active?page=1&pageSize=50" resources)
    
    ;; Let user choose
    (let ((selected (completing-read "OpenSpec resource: " resources)))
      (when selected
        (let ((content (mcp-browse-resource "openspec" selected)))
          (with-current-buffer (get-buffer-create "*OpenSpec Resource*")
            (erase-buffer)
            (insert content)
            (goto-char (point-min))
            (markdown-mode)
            (switch-to-buffer (current-buffer))))))))
```

## Resource Attachment Patterns

### 1. Direct Reference

```bash
# Simple direct reference
@task:change://user-auth/proposal
```

### 2. Contextual Reference

```bash
# In conversation about specific change
> Based on @task:change://user-auth/proposal, should we add MFA?

# Compare approaches
> Compare @task:change://user-auth/proposal with @task:change://oauth2-integration/proposal
```

### 3. Multi-Resource Reference

```bash
# Reference multiple files from same change
@task:change://user-auth/proposal
@task:change://user-auth/tasks
@task:change://user-auth/delta/api.yml
```

### 4. Paginated Browsing

```bash
# Browse with pagination
@changes://active?page=1&pageSize=20
@changes://active?page=2&pageSize=20&nextPageToken=abc123
```

## Resource Content Types

### Proposal Resources (`/proposal`)
- **Format**: Markdown
- **Content**: Problem statement, solution approach, acceptance criteria
- **Use case**: Understanding what needs to be built and why

```markdown
# Add User Authentication

## Problem
Users cannot access protected features without authentication.

## Solution
Implement OAuth2-based authentication with social login options.

## Acceptance Criteria
- [ ] Users can login with Google/GitHub
- [ ] Sessions expire after 24 hours
- [ ] Security audit passes
```

### Tasks Resources (`/tasks`)
- **Format**: Markdown with checkboxes
- **Content**: Implementation checklist organized by area
- **Use case**: Tracking progress and planning work

```markdown
# Tasks for Add User Authentication

## Backend
- [ ] Design user schema
- [ ] Implement OAuth2 flow
- [ ] Add session management

## Frontend  
- [ ] Build login components
- [ ] Handle auth state
- [ ] Add logout functionality

## Testing
- [ ] Unit tests for auth
- [ ] Integration tests
- [ ] E2E test scenarios
```

### Delta Resources (`/delta/*`)
- **Format**: Varies (YAML, JSON, MD, etc.)
- **Content**: Specification changes, API definitions, database schemas
- **Use case**: Technical implementation details

```yaml
# delta/api/auth.yml
openapi: 3.0.0
paths:
  /auth/login:
    post:
      summary: User login
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                provider:
                  type: string
                token:
                  type: string
```

## Best Practices

### 1. Resource Discovery

- Always use `@` for autocomplete and discovery
- Check `changes://active` to see what's available
- Use pagination for large change sets

### 2. Efficient Usage

```bash
# ✅ Good: Use resource URIs
@task:change://user-auth/proposal

# ❌ Avoid: Pasting large content directly
[pasting entire proposal content here...]
```

### 3. Contextual References

```bash
# ✅ Good: Specific and contextual
"Review @task:change://user-auth/proposal for security implications"

# ❌ Less useful: Vague reference
"Check the proposal"
```

### 4. Multi-Change Analysis

```bash
# Compare related changes
@task:change://user-auth/proposal
@task:change://user-profile/proposal
@task:change://session-management/proposal

# What patterns emerge? What conflicts exist?
```

## Troubleshooting

### Resource Not Found

```bash
# Check if change exists
changes://active

# Verify slug spelling
@task:change://user-auth/proposal  # not user-authentication
```

### Server Not Responding

```bash
# Verify MCP server is running
claude mcp list

# Restart if needed
claude mcp remove openspec
claude mcp add --transport stdio openspec -- node /path/to/OpenSpec/bin/openspec.js task-mcp --stdio
```

### Large Content Issues

```bash
# Use pagination for active changes
changes://active?page=1&pageSize=20

# For large files, streaming is automatic
@task:change://large-feature/proposal  # Will stream if >10MB
```

### IDE-Specific Issues

**VS Code:**
- Check MCP extension is installed
- Verify workspace settings
- Restart VS Code after configuration changes

**JetBrains:**
- Ensure MCP plugin is enabled
- Check plugin configuration in Settings
- Verify file paths are absolute

**Vim/Neovim:**
- Check MCP.nvim installation
- Verify command paths
- Use `:checkhealth` for diagnostics

## Advanced Features

### Custom Resource Queries

```bash
# Paginated with filtering
changes://active?page=1&pageSize=50&filter=bugfix

# Time-based queries
changes://active?since=2025-10-20&until=2025-10-26

# Status filtering
changes://active?status=in-progress
```

### Resource Templates

Create templates for common resource patterns:

```bash
# Template for new feature review
"Review @task:change://FEATURE_SLUG/proposal and @task:change://FEATURE_SLUG/tasks. Focus on:
1. Technical feasibility
2. Security implications  
3. Testing requirements
4. Dependencies and risks"

# Template for progress check
"Check @task:change://FEATURE_SLUG/tasks. What's completed? What's blocked? Any issues?"
```

### Automation Scripts

```bash
# Script to review all active changes
for change in $(changes://active?pageSize=100 | jq -r '.changes[].slug'); do
  echo "Reviewing @task:change://$change/proposal"
done
```

## Integration Examples

### Code Review Workflow

```bash
# 1. Get context
@task:change://pr-123/proposal
@task:change://pr-123/tasks

# 2. Review implementation changes
@task:change://pr-123/delta/api.yml
@task:change://pr-123/delta/database.sql

# 3. Check related work
changes://active?filter=related-to-pr-123

# 4. Provide feedback
"Based on the proposal and tasks, here are my recommendations..."
```

### Planning Session

```bash
# 1. See what's active
changes://active?page=1&pageSize=20

# 2. Review upcoming work
@task:change://feature-a/proposal
@task:change://feature-b/proposal

# 3. Identify dependencies
"Compare @task:change://feature-a/tasks with @task:change://feature-b/tasks. Any conflicts or dependencies?"

# 4. Prioritize
"Based on the proposals, what should we work on first?"
```

### Debugging Incident

```bash
# 1. Find recent changes
changes://active?since=2025-10-25&filter=hotfix

# 2. Review what changed
@task:change://hotfix-auth-bug/proposal
@task:change://hotfix-auth-bug/delta/**

# 3. Understand impact
"What systems are affected by @task:change://hotfix-auth-bug/proposal?"
```

---

**Ready to integrate?** Start with the basic `@task:change://slug/proposal` pattern and build from there. The resource system is designed to be intuitive and discoverable.