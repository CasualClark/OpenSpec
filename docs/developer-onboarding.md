# Developer Onboarding Guide - Task MCP

_Last updated: 2025-10-23_

## Welcome to Task MCP!

This guide will help you become productive with Task MCP quickly. Whether you're a new team member or an existing developer learning the Task MCP system, this guide covers everything you need to know.

## What is Task MCP?

Task MCP is a minimal, well-structured contract system for managing changes through OpenSpec. It provides:

- **Two core tools**: `change.open` and `change.archive`
- **Four resource patterns**: For efficient content access
- **Comprehensive error handling**: With versioning support
- **Token-efficient operations**: Optimized for different transport modes

## Your First Day

### 1. Environment Setup (30 minutes)

#### Install Prerequisites
```bash
# Check Node.js (need v18+)
node --version

# Check Python (need v3.8+)  
python3 --version

# Check Git (need v2.30+)
git --version
```

#### Setup Project
```bash
# Clone and setup
git clone https://github.com/your-org/openspec.git
cd openspec
npm install
pip install -r requirements.txt

# Verify installation
npm run test
```

#### Start Development Server
```bash
# In one terminal, start MCP server
task-mcp --stdio

# In another, verify it's working
mcp-call task change.open '{"title":"test","slug":"test-slug"}'
```

### 2. Core Concepts (45 minutes)

#### Changes: The Basic Unit
Every piece of work is a "change" with:
- **Slug**: Unique identifier (e.g., `add-user-auth`)
- **Proposal**: What and why you're changing
- **Tasks**: How you'll implement it
- **Deltas**: Actual specification changes
- **Receipt**: Audit trail when archived

#### Slugs: Naming Rules
```bash
# ✅ Good slugs
add-user-auth
fix-login-bug  
update-api-v2
refactor-auth-service

# ❌ Bad slugs
Add User Auth          # spaces/uppercase
add_user_auth          # underscores
add                    # too short
a-very-long-slug-that-exceeds-the-sixty-four-character-limit-and-is-invalid
```

#### Locks: Preventing Conflicts
```bash
# Create with lock (2 hours)
mcp-call task change.open '{
  "title": "Add user authentication",
  "slug": "add-user-auth", 
  "owner": "you@example.com",
  "ttl": 7200
}'

# Lock expires automatically, or you can archive early
mcp-call task change.archive '{"slug":"add-user-auth"}'
```

### 3. Your First Change (60 minutes)

#### Step 1: Plan Your Change
```bash
# Check what's already in progress
changes://active

# Create your change
mcp-call task change.open '{
  "title": "Add password reset feature",
  "slug": "add-password-reset",
  "template": "feature",
  "rationale": "Users need to reset forgotten passwords",
  "owner": "you@example.com",
  "ttl": 3600
}'
```

#### Step 2: Write Your Proposal
```bash
# Navigate to your change
cd openspec/changes/add-password-reset

# Edit proposal.md
vim proposal.md
```

**Template for proposal.md:**
```markdown
# Add Password Reset Feature

## Problem
Users cannot reset forgotten passwords, leading to account lockouts and support tickets.

## Solution
Implement password reset via email with secure token-based flow.

## Implementation
1. Add password reset endpoint to API
2. Create email service for reset tokens  
3. Build reset password UI
4. Add security validations (rate limiting, token expiration)

## Acceptance Criteria
- [ ] Users can request password reset via email
- [ ] Reset tokens expire after 1 hour
- [ ] Rate limiting prevents abuse
- [ ] Security audit passes

## Testing
- Unit tests for token generation/validation
- Integration tests for email flow
- Security tests for rate limiting
```

#### Step 3: Define Your Tasks
```bash
# Edit tasks.md
vim tasks.md
```

**Template for tasks.md:**
```markdown
# Tasks for Add Password Reset

## Backend Tasks
- [ ] Design reset token schema
- [ ] Implement reset token generation
- [ ] Add password reset endpoint
- [ ] Implement email service integration
- [ ] Add rate limiting
- [ ] Write backend tests

## Frontend Tasks  
- [ ] Design reset password UI
- [ ] Build reset request form
- [ ] Build new password form
- [ ] Add form validation
- [ ] Write frontend tests

## Integration Tasks
- [ ] Connect frontend to backend
- [ ] Add error handling
- [ ] Test end-to-end flow
- [ ] Security review
- [ ] Documentation updates
```

#### Step 4: Add Specification Deltas
```bash
# Create delta directory structure
mkdir -p delta/{api,ui,security}

# Add API specification
cat > delta/api/password-reset.yml << 'EOF'
openapi: 3.0.0
paths:
  /api/auth/reset-request:
    post:
      summary: Request password reset
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
      responses:
        '200':
          description: Reset email sent
        '429':
          description: Too many requests
  /api/auth/reset-confirm:
    post:
      summary: Confirm password reset
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                token:
                  type: string
                newPassword:
                  type: string
                  minLength: 8
      responses:
        '200':
          description: Password reset successful
        '400':
          description: Invalid or expired token
EOF

# Add UI specification
cat > delta/ui/reset-components.md << 'EOF'
# Password Reset UI Components

## ResetRequestForm
- Email input field
- Submit button
- Loading state
- Error display

## ResetConfirmForm  
- New password input
- Confirm password input
- Submit button
- Password strength indicator
- Loading state
- Error display

## Security Features
- Rate limiting indicator
- Token expiration notice
- Success confirmation
EOF
```

#### Step 5: Archive Your Change
```bash
# When complete, archive it
mcp-call task change.archive '{"slug":"add-password-reset"}'

# Review the receipt
cat openspec/changes/add-password-reset/receipt.json
```

## Daily Workflow

### Morning: Planning
```bash
# Check what's active
changes://active

# Resume your work or start new
mcp-call task change.open '{
  "title": "Your task for today",
  "slug": "daily-task-slug",
  "owner": "you@example.com",
  "ttl": 28800  # 8 hours
}'
```

### During Work: Resource Usage
```bash
# Reference your proposal
@task:change://your-slug/proposal

# Reference your tasks
@task:change://your-slug/tasks

# Reference specific deltas
@task:change://your-slug/delta/api/endpoint.yml
```

### End of Day: Cleanup
```bash
# Archive completed changes
mcp-call task change.archive '{"slug":"completed-task"}'

# Check what's still in progress
changes://active

# Update locks if needed (extend TTL)
# Or archive and resume tomorrow
```

## Common Patterns

### Feature Development
```bash
# Standard feature template
mcp-call task change.open '{
  "title": "Add [feature name]",
  "slug": "add-[feature-name]",
  "template": "feature",
  "rationale": "Business justification for feature"
}'
```

### Bug Fixes
```bash
# Bug fix template
mcp-call task change.open '{
  "title": "Fix [bug description]",
  "slug": "fix-[bug-description]",
  "template": "bugfix",
  "rationale": "Impact and root cause of bug"
}'
```

### Hotfixes (Urgent)
```bash
# Hotfix template (shorter TTL)
mcp-call task change.open '{
  "title": "Hotfix: [critical issue]",
  "slug": "hotfix-[critical-issue]",
  "template": "hotfix",
  "owner": "you@example.com",
  "ttl": 1800,  # 30 minutes
  "rationale": "Critical security/stability issue"
}'
```

## Best Practices

### Slug Naming
- Be descriptive but concise
- Use kebab-case (hyphens only)
- Include the type prefix (add-, fix-, update-, refactor-)
- Keep under 64 characters

### Proposal Writing
- Start with the problem statement
- Clearly define the solution approach
- List specific acceptance criteria
- Include testing requirements

### Task Management
- Break work into small, testable chunks
- Use checkboxes for tracking progress
- Include both implementation and testing tasks
- Consider security and documentation

### Resource Usage
- Always use resource URIs in IDE mode
- Keep tool responses compact
- Let Claude Code handle content attachment
- Monitor token usage for API mode

## Troubleshooting

### "Slug already exists"
```bash
# Check who owns it
cat openspec/changes/existing-slug/.lock

# Wait or choose different slug
# Or contact owner to coordinate
```

### "Change not found"
```bash
# Check if it was archived
ls openspec/changes/archived/

# Verify slug spelling
# Use changes://active to list all
```

### Validation failures
```bash
# Check required files
ls openspec/changes/your-slug/proposal.md
ls openspec/changes/your-slug/tasks.md

# Run validation manually
npm run validate-schemas
openspec change validate --slug your-slug
```

## Team Collaboration

### Coordinating Work
- Check `changes://active` before starting
- Use descriptive slugs to avoid conflicts
- Communicate about large features
- Review each other's proposals

### Code Review Process
1. Create change with clear proposal
2. Implement with comprehensive tasks
3. Run all validations locally
4. Archive for peer review
5. Address feedback in new change if needed

### Knowledge Sharing
- Document decisions in proposals
- Include examples in deltas
- Share patterns with team
- Update documentation

## Advanced Topics

### Token Efficiency
```bash
# Monitor your token usage
export TASK_MCP_DEBUG=true

# Use compact mode for API
export TASK_MCP_COMPACT=true

# Prefer resources over inline content
@task:change://slug/proposal  # Good
# vs
echo "Large content..."       # Bad
```

### Custom Templates
You can extend the template system:
```bash
# Create custom template in your project
cp templates/feature.md templates/security.md

# Use it in change.open
mcp-call task change.open '{
  "title": "Security audit",
  "slug": "security-audit-q1",
  "template": "security"
}'
```

### Automation
```bash
# Script for daily setup
#!/bin/bash
DATE=$(date +%Y-%m-%d)
mcp-call task change.open "{
  \"title\": \"Daily work $DATE\",
  \"slug\": \"daily-$DATE\",
  \"owner\": \"$EMAIL\",
  \"ttl\": 28800
}"
```

## Resources

### Documentation
- [Getting Started](getting-started.md) - Technical setup
- [Contracts](contracts.md) - API reference
- [Token Policy](token_policy.md) - Usage guidelines
- [Troubleshooting](troubleshooting.md) - Common issues

### Examples
- `docs/examples/` - Sample implementations
- Archived changes - Real-world patterns
- Template library - Common structures

### Community
- GitHub discussions - Questions and answers
- Team chat - Real-time help
- Weekly sync - Progress and blockers

## Your First Week Checklist

### Day 1: Setup
- [ ] Environment installed and working
- [ ] Created first test change
- [ ] Understand basic workflow
- [ ] Read core documentation

### Day 2-3: Practice
- [ ] Complete a small feature change
- [ ] Try different templates
- [ ] Practice resource usage
- [ ] Review team's active changes

### Day 4-5: Integration
- [ ] Join team planning/discussion
- [ ] Contribute to existing change
- [ ] Set up your development workflow
- [ ] Ask questions and get feedback

## Getting Help

### Immediate Help
- Check [troubleshooting guide](troubleshooting.md)
- Review error messages carefully
- Try debug mode: `export TASK_MCP_DEBUG=true`

### Team Help
- Ask in team chat
- Tag experienced members
- Share your change slug for context

### Long-term Learning
- Review archived changes for patterns
- Participate in code reviews
- Contribute to documentation
- Share your learnings with others

Welcome aboard! We're excited to have you working with Task MCP. 🚀