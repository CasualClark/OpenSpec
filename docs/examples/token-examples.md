# Examples and Calculations - Task MCP Token Policy

_Last updated: 2025-10-23_

## Practical Token Usage Examples

### Real-World Scenario: Feature Development

#### Scenario: Adding User Authentication
Let's walk through a complete feature development cycle and calculate token usage.

#### Step 1: Change Creation
```json
// Input: ~85 tokens
{
  "title": "Add OAuth2 authentication",
  "slug": "add-oauth2-auth", 
  "rationale": "Enable Google and GitHub login",
  "owner": "dev@example.com",
  "template": "feature",
  "ttl": 7200
}

// Output: ~180 tokens (efficient)
{
  "apiVersion": "v1.0.0",
  "toolVersions": {
    "taskMcp": "1.0.0",
    "openspecCli": "3.2.1"
  },
  "slug": "add-oauth2-auth",
  "created": true,
  "locked": true,
  "status": "draft",
  "paths": {
    "root": "openspec/changes/add-oauth2-auth",
    "proposal": "openspec/changes/add-oauth2-auth/proposal.md",
    "tasks": "openspec/changes/add-oauth2-auth/tasks.md",
    "delta": "openspec/changes/add-oauth2-auth/delta/"
  },
  "resourceUris": {
    "proposal": "change://add-oauth2-auth/proposal",
    "tasks": "change://add-oauth2-auth/tasks", 
    "delta": "change://add-oauth2-auth/delta"
  }
}
```

**Token Cost**: 265 tokens total

#### Step 2: Content Access (IDE Mode)
```bash
# Resource access: 0 tokens (out-of-band)
@task:change://add-oauth2-auth/proposal
@task:change://add-oauth2-auth/tasks
@task:change://add-oauth2-auth/delta/auth-api.yml
```

**Token Cost**: 0 tokens (Claude Code handles attachment)

#### Step 3: Implementation Work
During implementation, you might make multiple calls:

```json
// List active changes: ~120 tokens
{
  "apiVersion": "v1.0.0",
  "page": 1,
  "pageSize": 10,
  "totalItems": 3,
  "items": [
    {"slug": "add-oauth2-auth", "title": "Add OAuth2 authentication", "status": "draft"},
    {"slug": "fix-login-bug", "title": "Fix login redirect bug", "status": "draft"}
  ]
}

// Resume change: ~150 tokens
{
  "apiVersion": "v1.0.0",
  "slug": "add-oauth2-auth",
  "created": false,
  "locked": true,
  "status": "draft"
}
```

**Token Cost**: 270 tokens for multiple operations

#### Step 4: Archive
```json
// Input: ~25 tokens
{
  "slug": "add-oauth2-auth"
}

// Output: ~320 tokens (compact receipt)
{
  "apiVersion": "v1.0.0",
  "toolVersions": {
    "taskMcp": "1.0.0",
    "openspecCli": "3.2.1"
  },
  "slug": "add-oauth2-auth",
  "archived": true,
  "receiptPath": "openspec/changes/add-oauth2-auth/receipt.json",
  "receipt": {
    "slug": "add-oauth2-auth",
    "title": "Add OAuth2 authentication",
    "apiVersion": "v1.0.0",
    "commits": ["a1b2c3d", "d4e5f6g"],
    "filesTouched": [
      "openspec/changes/add-oauth2-auth/proposal.md",
      "openspec/changes/add-oauth2-auth/tasks.md",
      "src/auth/OAuth2Service.ts",
      "src/auth/OAuth2Controller.ts"
    ],
    "tests": {
      "added": 3,
      "updated": 1,
      "passed": true
    },
    "archivedAt": "2025-10-23T15:30:00Z",
    "actor": {
      "type": "agent",
      "name": "Engineer"
    }
  }
}
```

**Token Cost**: 345 tokens

### Total Token Calculation for Feature Development

| Operation | Tokens | Cumulative |
|-----------|--------|------------|
| Create change | 265 | 265 |
| List active changes | 120 | 385 |
| Resume change | 150 | 535 |
| Archive change | 345 | 880 |

**Total: 880 tokens** (well under 25,000 limit)

## Inefficient vs Efficient Comparison

### Inefficient Approach (What NOT to Do)

```json
// ❌ Bad: Inline content in change.open
{
  "apiVersion": "v1.0.0",
  "slug": "add-oauth2-auth",
  "created": true,
  "locked": true,
  "proposalContent": "# Add OAuth2 Authentication\n\n## Problem\nUsers cannot authenticate using third-party providers...\n\n## Solution\nImplement OAuth2 with Google and GitHub providers...\n\n## Implementation\n1. Set up OAuth2 endpoints\n2. Configure provider credentials\n3. Implement token exchange\n4. Add user profile mapping\n5. Update authentication middleware\n\n## Acceptance Criteria\n- [ ] Users can login with Google\n- [ ] Users can login with GitHub\n- [ ] Token refresh works correctly\n- [ ] Profile data is properly mapped\n- [ ] Security audit passes\n\n## Testing\n- Unit tests for OAuth2 flow\n- Integration tests with providers\n- Security tests for token handling\n- UI tests for login flow",  // ~400 tokens
  "tasksContent": "# Tasks for OAuth2 Implementation\n\n## Backend Tasks\n- [ ] Research OAuth2 best practices\n- [ ] Design token storage schema\n- [ ] Implement OAuth2 endpoints\n- [ ] Add provider configuration\n- [ ] Implement token validation\n- [ ] Add refresh token logic\n- [ ] Write backend tests\n\n## Frontend Tasks\n- [ ] Design login UI mockups\n- [ ] Implement Google login button\n- [ ] Implement GitHub login button\n- [ ] Add loading states\n- [ ] Handle authentication errors\n- [ ] Update user session management\n- [ ] Write frontend tests\n\n## Integration Tasks\n- [ ] Connect frontend to OAuth2 endpoints\n- [ ] Add error handling for network issues\n- [ ] Implement token refresh in client\n- [ ] Update logout flow\n- [ ] Add authentication guards\n- [ ] End-to-end testing\n- [ ] Performance optimization\n- [ ] Security review",  // ~350 tokens
  "deltaFiles": [
    {
      "path": "delta/api/oauth2.yml",
      "content": "openapi: 3.0.0\npaths:\n  /api/auth/oauth2/google:\n    get:\n      summary: Initiate Google OAuth2 flow\n      parameters:\n        - name: redirect_uri\n          in: query\n          schema:\n            type: string\n      responses:\n        '302':\n          description: Redirect to Google\n  /api/auth/oauth2/google/callback:\n    get:\n      summary: Handle Google OAuth2 callback\n      parameters:\n        - name: code\n          in: query\n          schema:\n            type: string\n        - name: state\n          in: query\n          schema:\n            type: string\n      responses:\n        '200':\n          description: Authentication successful\n          content:\n            application/json:\n              schema:\n                type: object\n                properties:\n                  token:\n                    type: string\n                  user:\n                    $ref: '#/components/schemas/User'"  // ~300 tokens
    }
  ]
}

// Token cost: ~1,250 tokens just for change.open!
```

### Efficient Approach (What TO Do)

```json
// ✅ Good: Compact with resource URIs
{
  "apiVersion": "v1.0.0",
  "toolVersions": {
    "taskMcp": "1.0.0",
    "openspecCli": "3.2.1"
  },
  "slug": "add-oauth2-auth",
  "created": true,
  "locked": true,
  "status": "draft",
  "paths": {
    "root": "openspec/changes/add-oauth2-auth",
    "proposal": "openspec/changes/add-oauth2-auth/proposal.md",
    "tasks": "openspec/changes/add-oauth2-auth/tasks.md",
    "delta": "openspec/changes/add-oauth2-auth/delta/"
  },
  "resourceUris": {
    "proposal": "change://add-oauth2-auth/proposal",
    "tasks": "change://add-oauth2-auth/tasks",
    "delta": "change://add-oauth2-auth/delta"
  }
}

// Token cost: ~180 tokens
// Content accessed via: @task:change://add-oauth2-auth/proposal
```

**Savings: 1,070 tokens (85% reduction)**

## Transport Mode Comparisons

### stdio/IDE Mode (Claude Code)

#### Workflow Example
```bash
# 1. Create change: ~180 tokens
mcp-call task change.open '{"title":"Add auth","slug":"add-auth"}'

# 2. Access content: 0 tokens each
@task:change://add-auth/proposal    # Content attached automatically
@task:change://add-auth/tasks      # Content attached automatically
@task:change://add-auth/delta      # Directory attached automatically

# 3. Work with content: 0 additional tokens
# Content is available as attachments, not in prompt

# 4. Archive: ~320 tokens
mcp-call task change.archive '{"slug":"add-auth"}'
```

**Total Cost: ~500 tokens**

### HTTPS/SSE Mode (API)

#### Workflow Example
```json
// 1. Create change: ~180 tokens
{
  "slug": "add-auth",
  "paths": {
    "proposal": "openspec/changes/add-auth/proposal.md",
    "tasks": "openspec/changes/add-auth/tasks.md"
  }
}

// 2. Fetch content: Separate API calls (not MCP tokens)
GET /api/v1/files/openspec/changes/add-auth/proposal.md
GET /api/v1/files/openspec/changes/add-auth/tasks.md

// 3. Archive: ~320 tokens
{
  "slug": "add-auth",
  "archived": true,
  "receipt": { /* compact receipt */ }
}
```

**Total Cost: ~500 tokens + content fetch overhead**

## Pagination Examples

### Efficient List Operations

#### Small Lists (≤50 items)
```json
// No pagination needed
{
  "apiVersion": "v1.0.0",
  "page": 1,
  "pageSize": 50,
  "totalItems": 23,
  "items": [
    {"slug": "add-auth", "title": "Add authentication", "status": "draft"}
    // ... 22 more items
  ]
}
// Token cost: ~400 tokens
```

#### Large Lists (>50 items)
```json
// First page
{
  "apiVersion": "v1.0.0",
  "page": 1,
  "pageSize": 20,
  "totalItems": 156,
  "nextPageToken": "eyJwYWdlIjoyfQ",
  "items": [
    {"slug": "add-auth", "title": "Add authentication", "status": "draft"}
    // ... 19 more items
  ]
}
// Token cost: ~250 tokens per page
```

## Error Handling Examples

### Efficient Error Responses
```json
// ✅ Good: Concise but informative
{
  "error": {
    "code": "SLUG_CONFLICT",
    "message": "Locked by dev@example.com until 2025-10-23T17:00:00Z",
    "details": {"slug": "add-auth"}
  }
}
// Token cost: ~80 tokens
```

### Inefficient Error Responses
```json
// ❌ Bad: Verbose with unnecessary details
{
  "error": {
    "code": "SLUG_CONFLICT",
    "message": "The slug 'add-auth' is currently locked by another user. You cannot create a change with this slug until the existing lock expires or is released. The current lock is held by 'dev@example.com' and will expire on '2025-10-23T17:00:00Z'. Please choose a different slug or wait for the lock to expire.",
    "details": {
      "slug": "add-auth",
      "currentOwner": "dev@example.com",
      "expiresAt": "2025-10-23T17:00:00Z",
      "lockFile": "openspec/changes/add-auth/.lock",
      "serverTime": "2025-10-23T15:30:00Z",
      "requestId": "req_123456789",
      "suggestions": [
        "Try a different slug like 'add-auth-v2'",
        "Wait for the lock to expire",
        "Contact dev@example.com to coordinate"
      ]
    }
  }
}
// Token cost: ~350 tokens
```

## Real-World Token Budget Planning

### Daily Development Budget (25,000 token limit)

#### Conservative Planning (80% of limit = 20,000 tokens)
```bash
# Morning planning session: ~500 tokens
changes://active + change.open

# Development work (4-6 changes): ~3,000 tokens
6 × (change operations + resuming work)

# Content access: ~0 tokens (stdio mode)
@task:change://... resources

# Testing and validation: ~1,000 tokens
Schema validation + error handling

# End of day cleanup: ~1,500 tokens
Archiving completed changes

# Buffer for unexpected issues: ~14,000 tokens
```

#### Heavy Usage Planning (95% of limit = 23,750 tokens)
```bash
# Complex feature development: ~8,000 tokens
Multiple iterations, extensive testing

# API mode usage: ~5,000 tokens
No resource efficiency benefits

# Large team collaboration: ~3,000 tokens
Many concurrent changes

# Error recovery and debugging: ~2,000 tokens
Troubleshooting, retries

# Documentation and examples: ~5,750 tokens
Rich examples, detailed responses
```

## Performance Optimization Examples

### Response Compression
```json
// ✅ Compressed field names
{
  "slug": "add-auth",
  "stat": "draft",
  "paths": {
    "root": "openspec/changes/add-auth",
    "prop": ".../proposal.md",
    "task": ".../tasks.md"
  }
}
// Token cost: ~120 tokens

// ❌ Verbose field names
{
  "slug": "add-auth",
  "status": "draft",
  "paths": {
    "root": "openspec/changes/add-auth",
    "proposal": "openspec/changes/add-auth/proposal.md",
    "tasks": "openspec/changes/add-auth/tasks.md"
  }
}
// Token cost: ~160 tokens
```

### Selective Field Inclusion
```json
// ✅ List operation - minimal fields
{
  "items": [
    {"slug": "add-auth", "title": "Add authentication", "status": "draft"}
  ]
}
// Token cost: ~80 tokens

// ❌ List operation - all fields
{
  "items": [
    {
      "slug": "add-auth",
      "title": "Add authentication", 
      "status": "draft",
      "template": "feature",
      "createdAt": "2025-10-23T10:00:00Z",
      "updatedAt": "2025-10-23T14:15:00Z",
      "owner": "dev@example.com",
      "locked": true,
      "paths": {"root": "openspec/changes/add-auth"}
    }
  ]
}
// Token cost: ~200 tokens
```

## Monitoring and Alerting Examples

### Token Usage Monitoring
```bash
# Debug mode output
[TASK_MCP] change.open: input=85 tokens, output=180 tokens, total=265
[TASK_MCP] change.archive: input=25 tokens, output=320 tokens, total=345
[TASK_MCP] Daily usage: 2,450 / 25,000 tokens (9.8%)
```

### Alert Thresholds
```bash
# Warning at 70% usage
[TASK_MCP] WARNING: Daily usage at 17,500 / 25,000 tokens (70%)

# Critical at 90% usage  
[TASK_MCP] CRITICAL: Daily usage at 22,500 / 25,000 tokens (90%)

# Limit reached
[TASK_MCP] ERROR: Daily limit exceeded, switching to ultra-compact mode
```

## Best Practices Summary

### Do's
- ✅ Use resource URIs in stdio mode
- ✅ Keep responses under 2,000 tokens
- ✅ Implement pagination for large lists
- ✅ Use concise error messages
- ✅ Monitor token usage regularly

### Don'ts
- ❌ Inline large content in tool outputs
- ❌ Use verbose field names unnecessarily
- ❌ Include debugging info in responses
- ❌ Return full objects for list operations
- ❌ Ignore token budget planning

By following these examples and calculations, you can optimize your Task MCP usage for maximum efficiency while staying well within token limits.