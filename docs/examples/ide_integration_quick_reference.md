# IDE Integration Quick Reference

_Fast reference for implementing pagination and streaming in IDE integrations_

Last updated: 2025-10-24

## Quick Start

### Basic Pagination

```typescript
// Simple pagination request
const result = await mcpResource('changes://active?page=1&pageSize=20');
const data = JSON.parse(result);

console.log(`Page ${data.page || 1}: ${data.changes.length}/${data.total} changes`);
```

### Basic Streaming

```typescript
// Automatic streaming for files > 10MB
const result = await mcpResource('change://large-feature/proposal');

// With progress feedback
const result = await mcpResourceWithProgress(
  'change://large-feature/proposal',
  (progress) => console.log(`${progress.percentage}% complete`)
);
```

---

## URI Patterns

### Pagination

| Pattern | Description | Example |
|---------|-------------|---------|
| `changes://active` | First page, default size (50) | `changes://active` |
| `changes://active?page={n}` | Specific page | `changes://active?page=2` |
| `changes://active?pageSize={n}` | Custom page size | `changes://active?pageSize=100` |
| `changes://active?page={n}&pageSize={n}` | Full control | `changes://active?page=2&pageSize=20` |
| `changes://active?page={n}&pageSize={n}&nextPageToken={token}` | Token-based navigation | `changes://active?page=2&pageSize=20&nextPageToken=abc123` |

### Streaming

| Pattern | Description | Example |
|---------|-------------|---------|
| `change://{slug}/proposal` | Stream proposal file | `change://user-auth/proposal` |
| `change://{slug}/tasks` | Stream tasks file | `change://user-auth/tasks` |
| `change://{slug}/delta/**` | Stream specification files | `change://user-auth/delta/**` |

---

## Response Formats

### Pagination Response

```json
{
  "changes": [
    {
      "slug": "user-auth-feature",
      "title": "Add user authentication",
      "description": "Implement OAuth2 flow",
      "path": "/project/openspec/changes/user-auth-feature",
      "created": "2025-10-24T10:00:00Z",
      "modified": "2025-10-24T15:30:00Z",
      "hasProposal": true,
      "hasLock": false,
      "lockInfo": null,
      "specCount": 3,
      "taskCount": 5,
      "deltaCount": 2,
      "status": "in-progress"
    }
  ],
  "total": 127,
  "hasNextPage": true,
  "nextPageToken": "a1b2c3d4e5f6g7h8",
  "generated": "2025-10-24T16:00:00Z"
}
```

### Streaming Progress

```typescript
interface StreamingProgress {
  bytesRead: number;        // Current bytes read
  totalBytes: number;        // Total file size
  percentage: number;       // 0-100
  chunkNumber: number;      // Current chunk
  totalChunks: number;      // Estimated total chunks
  memoryUsage: number;      // Current memory usage in bytes
}
```

---

## Configuration Options

### Streaming Configuration

```typescript
interface StreamingConfig {
  chunkSize?: number;           // Default: 64KB
  maxMemoryUsage?: number;      // Default: 50MB
  streamingThreshold?: number;  // Default: 10MB
  progressInterval?: number;      // Default: 5 chunks
}
```

### MCP Server Configuration

```json
{
  "mcpServers": {
    "openspec": {
      "command": "task-mcp",
      "args": ["--stdio"],
      "cwd": "${workspaceFolder}",
      "streaming": {
        "threshold": 10485760,      // 10MB
        "chunkSize": 65536,         // 64KB
        "maxMemory": 52428800,      // 50MB
        "progressInterval": 5
      }
    }
  }
}
```

---

## Error Codes

### Pagination Errors

| Code | Description | Solution |
|-------|-------------|----------|
| `INVALID_PAGE` | Page number < 1 | Use page ≥ 1 |
| `INVALID_PAGE_SIZE` | Page size < 1 or > 1000 | Use size 1-1000 |
| `PAGE_SIZE_TOO_LARGE` | Page size > 1000 | Reduce page size |
| `INVALID_TOKEN` | nextPageToken invalid/expired | Refresh from page 1 |

### Streaming Errors

| Code | Description | Solution |
|-------|-------------|----------|
| `MEMORY_LIMIT_EXCEEDED` | Memory > 50MB | Reduce chunk size |
| `STREAMING_ERROR` | Connection interrupted | Retry with backoff |
| `FILE_TOO_LARGE` | File > max size | Increase limits |
| `TIMEOUT` | Operation timeout | Increase timeout |

---

## Performance Guidelines

### Page Size Recommendations

| Context | Recommended Page Size | Reason |
|---------|----------------------|---------|
| Mobile IDE | 10-20 | Limited screen space |
| Desktop IDE | 50-100 | Balance of speed/UX |
| API Usage | 100-200 | Bulk operations |
| Slow Network | 20-30 | Reduce latency impact |

### Chunk Size Recommendations

| File Size | Recommended Chunk Size | Reason |
|-----------|----------------------|---------|
| < 1MB | 16KB | Small files |
| 1-10MB | 32KB | Medium files |
| 10-100MB | 64KB | Large files |
| > 100MB | 128KB | Very large files |

### Memory Limits

| Operation | Recommended Limit | Reason |
|-----------|------------------|---------|
| Pagination | 10MB | Small data sets |
| Streaming | 50MB | Large file handling |
| Caching | 100MB | Balance performance/memory |

---

## Platform-Specific Examples

### VS Code Extension

```typescript
// Quick pagination implementation
async function loadChanges(page = 1, pageSize = 50) {
  const uri = `changes://active?page=${page}&pageSize=${pageSize}`;
  const result = await vscode.workspace.fs.readFile(
    vscode.Uri.parse(`mcp://openspec/${uri}`)
  );
  
  return JSON.parse(result.toString());
}

// Quick streaming implementation
async function streamFile(slug: string, filename: string) {
  const uri = `change://${slug}/${filename}`;
  
  return await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Streaming ${filename}...`
  }, async (progress) => {
    return await mcpResourceWithProgress(uri, (p) => {
      progress.report({ increment: p.percentage / 100 });
    });
  });
}
```

### JetBrains Plugin

```kotlin
// Quick pagination implementation
suspend fun loadChanges(page: Int = 1, pageSize: Int = 50): PaginationData {
    val uri = "changes://active?page=$page&pageSize=$pageSize"
    val result = mcpClient.getResource(uri)
    return Json.decodeFromString<PaginationData>(result)
}

// Quick streaming implementation
suspend fun streamFile(slug: String, filename: String): String {
    val uri = "change://$slug/$filename"
    
    return withContext(Dispatchers.IO) {
        val progressIndicator = ProgressManager.getInstance().progressIndicator
        
        mcpClient.getResourceWithProgress(uri) { progress ->
            progressIndicator?.fraction = progress.percentage / 100.0
            progressIndicator?.text2 = "${progress.percentage}%"
        }
    }
}
```

### Neovim Plugin

```lua
-- Quick pagination implementation
function load_changes(page, page_size)
  page = page or 1
  page_size = page_size or 50
  
  local uri = string.format("changes://active?page=%d&pageSize=%d", page, page_size)
  local result = vim.fn.McpResource(uri)
  return vim.json.decode(result)
end

-- Quick streaming implementation
function stream_file(slug, filename)
  local uri = string.format("change://%s/%s", slug, filename)
  
  local progress_callback = function(progress)
    vim.notify(string.format("Streaming: %d%%", progress.percentage))
  end
  
  return vim.fn.McpResourceWithProgress(uri, progress_callback)
end
```

---

## Troubleshooting Checklist

### Before Integration

- [ ] Task MCP server v2.1.0+ installed
- [ ] MCP client supports pagination/streaming
- [ ] Network connectivity verified
- [ ] Memory limits configured appropriately
- [ ] Error handling implemented

### Common Issues

**Slow pagination**:
```typescript
// Fix: Reduce page size
const result = await mcpResource('changes://active?page=1&pageSize=20');
```

**Memory errors**:
```typescript
// Fix: Configure streaming limits
const config = {
  chunkSize: 32 * 1024,     // 32KB
  maxMemoryUsage: 25 * 1024 * 1024  // 25MB
};
```

**Progress not updating**:
```typescript
// Fix: Use proper progress callback
const result = await mcpResourceWithProgress(uri, (progress) => {
  console.log(`${progress.percentage}%: ${progress.bytesRead}/${progress.totalBytes}`);
});
```

### Debug Commands

```bash
# Test pagination
curl "mcp://openspec/changes://active?page=1&pageSize=10"

# Test streaming
curl "mcp://openspec/change://test/proposal"

# Check server health
curl "mcp://openspec/changes://active?health=true"

# Enable debug logging
task-mcp --stdio --debug --log-level debug
```

---

## Migration from v1.x

### Breaking Changes

1. **URI Changes**:
   ```typescript
   // Old
   changes://?page=1&pageSize=20
   
   // New
   changes://active?page=1&pageSize=20
   ```

2. **Token-based Pagination**:
   ```typescript
   // Old (offset-based)
   changes://active?offset=50&limit=20
   
   // New (token-based)
   changes://active?page=3&pageSize=20&nextPageToken=abc123
   ```

3. **Streaming is Automatic**:
   ```typescript
   // Old (manual)
   streamFile(uri, { chunkSize: 32768 })
   
   // New (automatic)
   mcpResource(uri) // Streams automatically for >10MB files
   ```

### Migration Steps

1. Update URI patterns to use `changes://active`
2. Replace offset-based pagination with token-based
3. Remove manual streaming configuration (now automatic)
4. Update error handling for new error codes
5. Test with Task MCP v2.1.0+

---

## Best Practices

### Performance

1. **Use appropriate page sizes**: 20-100 items for most UIs
2. **Implement caching**: Cache pagination results for 5 minutes
3. **Prefetch strategically**: Load next page when user reaches bottom
4. **Monitor memory usage**: Keep streaming memory < 50MB
5. **Handle errors gracefully**: Implement retry with exponential backoff

### User Experience

1. **Show progress indicators**: Always show progress for streaming
2. **Provide feedback**: Display clear error messages
3. **Enable cancellation**: Allow users to cancel long operations
4. **Maintain responsiveness**: Use async operations
5. **Cache intelligently**: Cache based on access patterns

### Security

1. **Validate inputs**: Check all parameters before requests
2. **Sanitize slugs**: Validate change slug format
3. **Respect limits**: Honor server-side limits
4. **Handle tokens securely**: Don't expose nextPageToken in URLs
5. **Monitor access**: Log resource access for auditing

---

## API Reference

### Core Functions

```typescript
// Basic resource access
await mcpResource(uri: string): Promise<string>;

// Resource access with progress
await mcpResourceWithProgress(
  uri: string,
  onProgress: (progress: StreamingProgress) => void
): Promise<string>;

// Resource access with configuration
await mcpResourceWithConfig(
  uri: string,
  config: StreamingConfig
): Promise<string>;
```

### Utility Functions

```typescript
// Validate pagination parameters
function validatePaginationParams(page: number, pageSize: number): ValidationResult;

// Generate optimal streaming config
function getOptimalStreamingConfig(fileSize: number): StreamingConfig;

// Format file size for display
function formatFileSize(bytes: number): string;

// Calculate estimated time remaining
function calculateETA(progress: StreamingProgress): number;
```

---

*This quick reference provides essential information for implementing pagination and streaming in IDE integrations. For detailed examples, see the full IDE Integration Guide.*