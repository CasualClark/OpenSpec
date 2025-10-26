# Quickstart - Task MCP

_Get productive in 5 minutes with just Node.js and git_

Last updated: 2025-10-26

## Prerequisites

**You only need:**
- Node.js 18+ 
- git
- A terminal

```bash
# Quick check
node --version  # Should show v18+
git --version   # Should show git version
```

## 5-Minute Setup

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

**Quick proposal template:**
```markdown
# Add User Login Feature

## Problem
Users cannot authenticate to access protected features.

## Solution  
Implement email/password login with session management.

## Acceptance Criteria
- [ ] Users can register with email/password
- [ ] Users can login with existing credentials
- [ ] Sessions expire after 24 hours
- [ ] Password validation enforces strong passwords
```

**Quick tasks template:**
```markdown
# Tasks for Add User Login

## Backend
- [ ] Design user schema
- [ ] Implement password hashing
- [ ] Create login endpoint
- [ ] Create registration endpoint
- [ ] Add session management

## Frontend
- [ ] Build login form
- [ ] Build registration form
- [ ] Add form validation
- [ ] Handle authentication state

## Testing
- [ ] Unit tests for auth functions
- [ ] Integration tests for endpoints
- [ ] E2E tests for login flow
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

## IDE Integration (Optional but Recommended)

### Claude Code Setup

If you use Claude Code, add Task MCP as a server:

```bash
# Add Task MCP to Claude Code
claude mcp add --transport stdio openspec -- node /path/to/OpenSpec/bin/openspec.js task-mcp --stdio
```

Now you can reference resources in Claude:

```
@task:change://add-user-login/proposal
@task:change://add-user-login/tasks
changes://active
```

### VS Code Setup

Add to your VS Code settings (`.vscode/settings.json`):

```json
{
  "mcp.servers": {
    "openspec": {
      "command": "node",
      "args": ["/path/to/OpenSpec/bin/openspec.js", "task-mcp", "--stdio"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

## Common Commands Cheat Sheet

```bash
# List all active changes
npm run dev:cli change list

# Create different change types
npm run dev:cli change create --title "Fix login bug" --slug "fix-login-bug" --template bugfix
npm run dev:cli change create --title "Hotfix security issue" --slug "hotfix-security" --template hotfix

# Work with existing changes
npm run dev:cli change show --slug add-user-login
npm run dev:cli change validate --slug add-user-login

# Archive when done
npm run dev:cli change archive --slug add-user-login
```

## Resource URI Patterns

Once you have Task MCP running in your IDE, you can reference:

- `@task:change://slug/proposal` - Read proposal content
- `@task:change://slug/tasks` - Read task list  
- `@task:change://slug/delta/filename` - Read specification files
- `changes://active` - List all active changes

## What Just Happened?

You used the **complete OpenSpec workflow**:

1. **Open**: Created a change with a unique slug (`add-user-login`)
2. **Edit**: Wrote a proposal (what/why) and tasks (how/when)
3. **Archive**: Stored the change with a receipt for audit trail

Each change includes:
- `proposal.md` - The problem statement and solution approach
- `tasks.md` - Implementation checklist
- `delta/` - Directory for specification changes
- `receipt.json` - Audit trail with timestamps and metadata

## Next Steps

- **Try different templates**: `bugfix`, `hotfix`, `refactor`
- **Add specifications**: Create files in the `delta/` directory
- **Team collaboration**: Check `changes://active` to see what others are working on
- **Advanced features**: Lock changes with `--owner` and `--ttl` parameters

## Troubleshooting

**"Command not found" errors:**
```bash
# Use the full path
node ./bin/openspec.js change create --title "Test" --slug "test"
```

**"Slug already exists":**
```bash
# Choose a different slug or check existing changes
npm run dev:cli change list
```

**Server not responding:**
```bash
# Make sure Task MCP server is running in another terminal
npm run dev
```

**Need help?**
- Check the full [Getting Started Guide](getting-started.md)
- Review [Developer Onboarding](developer-onboarding.md)
- Browse [IDE Integration Guide](examples/ide_integration_guide.md)

---

**Welcome to OpenSpec!** You now have a complete spec-driven development workflow running in minutes. 🚀