# docs/messages_api_example.md — Messages API using MCP connector (SSE)

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 256,
  "messages": [
    { "role": "user", "content": "Create a change called 'demo-change'" }
  ],
  "mcp_servers": [
    {
      "type": "url",
      "url": "https://task-mcp.example.com/sse",
      "name": "task-mcp",
      "authorization_token": "YOUR_TOKEN"
    }
  ]
}
```
