# HTTPS/SSE Connector Examples (Task MCP Only)

_Last updated: 2025-10-23_

These examples show how a Messages API client calls the Task MCP over HTTPS/SSE.
Resources are **not** fetched by the connector; they are an IDE feature in stdio flows.

### Example: open then archive
```json
{
  "mcp_servers": {
    "task": {
      "url": "https://task.example.com/mcp",
      "capabilities": ["tools"],
      "authorization_token": "Bearer <token>"
    }
  },
  "tools": [
    {"server":"task","tool":"change.open","input":{"title":"Router init fix","slug":"router-init-fix"}},
    {"server":"task","tool":"change.archive","input":{"slug":"router-init-fix"}}
  ]
}
```
