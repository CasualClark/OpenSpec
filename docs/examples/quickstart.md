# Quickstart — Task MCP Only

_Last updated: 2025-10-23_

```bash
# Start stdio server (example)
task-mcp --stdio

# Open a change
mcp-call task change.open '{"title":"Router init fix","slug":"router-init-fix"}'

# Edit proposal.md, tasks.md, specs/ ...

# Archive
mcp-call task change.archive '{"slug":"router-init-fix"}'
```
