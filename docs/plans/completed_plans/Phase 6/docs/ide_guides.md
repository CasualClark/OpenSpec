# IDE Guide — Attaching Resources

## Claude Code (stdio)
- In the chat, type `@` and select your Task MCP server.
- Attach:
  - `change://router-init-fix/proposal`
  - `change://router-init-fix/tasks`
  - `changes://active` - List all active changes
  - `changes://archived` - List archived changes
- The IDE fetches contents out‑of‑band; tool results stay tiny.

## VS Code Extension
- Install the Task MCP extension from the marketplace
- Configure server endpoint in settings:
  ```json
  {
    "taskMcp.serverUrl": "http://localhost:8443",
    "taskMcp.authToken": "devtoken"
  }
  ```
- Use Command Palette (Ctrl+Shift+P) → "Task MCP: Attach Resource"

## Cursor IDE
- Add to `.cursorrules` or MCP settings:
  ```json
  {
    "mcpServers": {
      "task-mcp": {
        "command": "node",
        "args": ["./dist/index.js"],
        "env": {
          "AUTH_TOKENS": "devtoken"
        }
      }
    }
  }
  ```

## Troubleshooting
- **Connection refused**: Ensure server is running on port 8443
- **Auth failures**: Check AUTH_TOKENS environment variable matches IDE config
- **Resource not found**: Verify change slug exists and is properly formatted
- **Slow responses**: Use pagination for large change lists (`?page=2&limit=50`)

## Best Practices
- Only reference the resources you actually need to reduce context size
- For large listings, paginate via `changes://active?page=2&limit=50`
- Use specific resource paths instead of listing when possible
- Cache frequently accessed resources locally when working offline
