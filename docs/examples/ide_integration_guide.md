# IDE Integration Guide

_Last updated: 2025-10-24_

## Overview

This guide explains how to integrate the Task MCP server with various IDEs and editors to provide seamless OpenSpec change management within your development environment. This version includes comprehensive documentation for the new pagination and streaming features.

## Prerequisites

1. **Task MCP Server**: Install and configure the Task MCP server (v2.1.0+)
2. **OpenSpec Project**: Initialize OpenSpec in your project directory
3. **MCP Client**: IDE must support Model Context Protocol (MCP)

## Quick Setup

### 1. Install Task MCP Server

```bash
# Install globally
npm install -g @openspec/task-mcp

# Or use locally
npm install @openspec/task-mcp
```

### 2. Configure MCP Client

Create or update your MCP client configuration:

```json
{
  "mcpServers": {
    "openspec": {
      "command": "task-mcp",
      "args": ["--stdio"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## Pagination & Streaming Features

### Pagination Overview

The `changes://active` resource now supports efficient pagination for large repositories:

- **Default page size**: 50 items
- **Maximum page size**: 1000 items  
- **Stable sorting**: By modified date (newest first), then created date, then slug
- **Token-based navigation**: Uses `nextPageToken` for consistent pagination
- **Backward compatibility**: Existing integrations continue to work

### Streaming Overview

Large files are automatically streamed when they exceed the streaming threshold:

- **Default streaming threshold**: 10MB
- **Chunk size**: 64KB (configurable)
- **Memory limit**: 50MB per operation
- **Progress feedback**: Available via callbacks
- **Automatic fallback**: Buffered reading for small files

## VS Code Integration

### Method 1: Using Claude Desktop Extension

1. **Install Claude Desktop Extension** from VS Code Marketplace
2. **Configure MCP Server** in settings:

```json
{
  "claude.desktop.mcpServers": {
    "openspec": {
      "command": "task-mcp",
      "args": ["--stdio"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

3. **Restart VS Code** and verify connection

### Method 2: Using MCP Extension Directly

1. **Install MCP Extension** for VS Code
2. **Add to workspace settings** (`.vscode/settings.json`):

```json
{
  "mcp.servers": {
    "openspec": {
      "command": "task-mcp",
      "args": ["--stdio"],
      "cwd": "${workspaceFolder}",
      "env": {
        "OPENSPEC_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

### VS Code Workflow

**Create New Change**:
```typescript
// Command Palette: "OpenSpec: Create Change"
// Or use integrated terminal
mcp-call openspec change.open '{
  "title": "Add user authentication",
  "slug": "user-auth-feature",
  "template": "feature"
}'
```

**Browse Active Changes with Pagination**:
```typescript
// First page with default page size (50)
mcp-resource changes://active

// Custom pagination
mcp-resource changes://active?page=1&pageSize=20

// Navigate using nextPageToken
mcp-resource changes://active?page=2&pageSize=20&nextPageToken=abc123
```

**Stream Large Files**:
```typescript
// Automatic streaming for files > 10MB
mcp-resource change://large-feature/proposal

// With progress feedback (extension implementation)
const progressCallback = (progress) => {
  console.log(`Progress: ${progress.percentage}% (${progress.bytesRead}/${progress.totalBytes})`);
};
mcp-resource change://large-feature/proposal --progress
```

**Edit Change Files**:
- Open `change://{slug}/proposal` to edit proposal
- Open `change://{slug}/tasks` to edit task list
- Browse `change://{slug}/delta/**` for specifications

### VS Code Extension Example

```typescript
// src/extension.ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Register pagination commands
  const paginateCommand = vscode.commands.registerCommand('openspec.paginateChanges', async () => {
    const pageSize = await vscode.window.showInputBox({
      prompt: 'Enter page size (1-1000)',
      value: '50'
    });
    
    if (pageSize) {
      const uri = `changes://active?page=1&pageSize=${pageSize}`;
      const result = await mcpResource(uri);
      showChangesInTreeView(result);
    }
  });

  // Register streaming commands
  const streamCommand = vscode.commands.registerCommand('openspec.streamLargeFile', async () => {
    const slug = await vscode.window.showInputBox({
      prompt: 'Enter change slug',
      placeHolder: 'large-feature'
    });
    
    if (slug) {
      await streamLargeFile(slug);
    }
  });

  context.subscriptions.push(paginateCommand, streamCommand);
}

async function streamLargeFile(slug: string) {
  const uri = `change://${slug}/proposal`;
  
  // Show progress bar
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Streaming ${slug} proposal`,
    cancellable: true
  }, async (progress, token) => {
    const progressCallback = (progressInfo) => {
      const percentage = Math.round(progressInfo.percentage);
      progress.report({
        increment: percentage / 100,
        message: `${percentage}% (${progressInfo.bytesRead}/${progressInfo.totalBytes} bytes)`
      });
    };
    
    try {
      const result = await mcpResourceWithProgress(uri, progressCallback);
      showDocument(result.content);
    } catch (error) {
      vscode.window.showErrorMessage(`Streaming failed: ${error.message}`);
    }
  });
}
```

## JetBrains IDEs (IntelliJ, PyCharm, WebStorm)

### Setup

1. **Install MCP Plugin** from JetBrains Marketplace
2. **Configure MCP Server**:

```xml
<!-- File: .idea/mcp-servers.xml -->
<application>
  <component name="McpServers">
    <server name="openspec">
      <option name="command" value="task-mcp" />
      <option name="args">
        <array>
          <option value="--stdio" />
        </array>
      </option>
      <option name="workingDirectory" value="$PROJECT_DIR$" />
      <option name="streamingConfig">
        <map>
          <entry key="streamingThreshold" value="10485760" />
          <entry key="chunkSize" value="65536" />
          <entry key="maxMemoryUsage" value="52428800" />
        </map>
      </option>
    </server>
  </component>
</application>
```

### JetBrains Workflow

**Access MCP Tools**:
- `Tools → MCP → OpenSpec → Create Change`
- `Tools → MCP → OpenSpec → Archive Change`

**Paginated Resource Browser**:
```kotlin
// Kotlin example for JetBrains plugin
class OpenSpecPaginatedBrowser {
    private var currentPage = 1
    private val pageSize = 20
    private var nextPageToken: String? = null
    
    suspend fun loadChanges(page: Int = 1) {
        val uri = if (page == 1) {
            "changes://active?page=$page&pageSize=$pageSize"
        } else {
            "changes://active?page=$page&pageSize=$pageSize&nextPageToken=$nextPageToken"
        }
        
        val result = mcpClient.getResource(uri)
        val changes = parseChangesResult(result)
        
        updateChangesList(changes.changes)
        nextPageToken = changes.nextPageToken
        updatePaginationControls(changes.hasNextPage)
    }
    
    fun nextPage() {
        if (nextPageToken != null) {
            currentPage++
            loadChanges(currentPage)
        }
    }
    
    fun previousPage() {
        if (currentPage > 1) {
            currentPage--
            loadChanges(currentPage)
        }
    }
}
```

**Streaming Large Files**:
```kotlin
class OpenSpecStreamReader {
    suspend fun streamFile(slug: String, fileName: String): String {
        val uri = "change://$slug/$fileName"
        
        return withContext(Dispatchers.IO) {
            val progressIndicator = ProgressManager.getInstance().progressIndicator
            var lastProgress = 0
            
            val progressCallback = { progress: StreamingProgress ->
                val currentProgress = progress.percentage.toInt()
                if (currentProgress > lastProgress) {
                    progressIndicator?.fraction = progress.percentage / 100.0
                    progressIndicator?.text2 = "${currentProgress}% (${progress.bytesRead}/${progress.totalBytes})"
                    lastProgress = currentProgress
                }
            }
            
            mcpClient.getResourceWithProgress(uri, progressCallback)
        }
    }
}
```

## Vim/Neovim Integration

### Using MCP.nvim

1. **Install Plugin**:
```vim
Plug 'openspec/mcp.nvim'
```

2. **Configuration**:
```lua
require('mcp').setup({
  servers = {
    openspec = {
      cmd = {'task-mcp', '--stdio'},
      cwd = vim.fn.getcwd(),
      streaming = {
        threshold = 10 * 1024 * 1024, -- 10MB
        chunk_size = 64 * 1024, -- 64KB
        max_memory = 50 * 1024 * 1024 -- 50MB
      }
    }
  }
})
```

3. **Key Mappings**:
```vim
nnoremap <leader>oc :McpCall openspec change.open<CR>
nnoremap <leader>oa :McpCall openspec change.archive<CR>
nnoremap <leader>ob :McpResource changes://active<CR>
nnoremap <leader>op :McpResource changes://active?page=1&pageSize=20<CR>
nnoremap <leader>os :lua StreamLargeFile()<CR>
```

### Neovim Workflow

**Paginated Browsing**:
```lua
function BrowseChanges(page, pageSize)
  page = page or 1
  pageSize = pageSize or 50
  
  local uri = string.format("changes://active?page=%d&pageSize=%d", page, pageSize)
  local result = vim.fn.McpResource(uri)
  local data = vim.json.decode(result)
  
  -- Display changes in quickfix list
  local qf_items = {}
  for i, change in ipairs(data.changes) do
    table.insert(qf_items, {
      filename = string.format("change://%s/proposal", change.slug),
      lnum = 1,
      text = string.format("%s - %s (%s)", change.slug, change.title, change.status)
    })
  end
  
  vim.fn.setqflist(qf_items)
  vim.cmd('copen')
  
  -- Store pagination state
  vim.g.openspec_page = page
  vim.g.openspec_pageSize = pageSize
  vim.g.openspec_nextToken = data.nextPageToken
  vim.g.openspec_hasNext = data.hasNextPage
  
  -- Show pagination info
  vim.notify(string.format("Page %d of %d changes (%d total)", 
    page, data.total, #data.changes))
end

-- Navigation commands
function NextPage()
  if vim.g.openspec_hasNext then
    BrowseChanges(vim.g.openspec_page + 1, vim.g.openspec_pageSize)
  else
    vim.notify("No more pages")
  end
end

function PreviousPage()
  if vim.g.openspec_page > 1 then
    BrowseChanges(vim.g.openspec_page - 1, vim.g.openspec_pageSize)
  else
    vim.notify("Already on first page")
  end
end
```

**Streaming Large Files**:
```lua
function StreamLargeFile()
  local slug = vim.fn.input("Enter change slug: ")
  if slug == "" then return end
  
  local uri = string.format("change://%s/proposal", slug)
  
  -- Create floating window for progress
  local buf = vim.api.nvim_create_buf(false, true)
  local win = vim.api.nvim_open_win(buf, true, {
    relative = 'editor',
    width = 60,
    height = 4,
    col = math.floor((vim.o.columns - 60) / 2),
    row = math.floor((vim.o.lines - 4) / 2),
    border = 'rounded'
  })
  
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, {"Streaming file...", "", "", ""})
  
  -- Stream with progress
  local progress_callback = function(progress)
    local lines = {
      string.format("Streaming: %s", slug),
      string.format("Progress: %d%%", progress.percentage),
      string.format("Bytes: %d / %d", progress.bytesRead, progress.totalBytes),
      string.format("Memory: %s", format_bytes(progress.memoryUsage))
    }
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  end
  
  local result = vim.fn.McpResourceWithProgress(uri, progress_callback)
  vim.api.nvim_win_close(win, true)
  
  -- Open result in new buffer
  local new_buf = vim.api.nvim_create_buf(true, false)
  vim.api.nvim_buf_set_lines(new_buf, 0, -1, false, vim.split(result, "\n"))
  vim.api.nvim_win_set_buf(0, new_buf)
  vim.bo.filetype = 'markdown'
end

function format_bytes(bytes)
  local units = {'B', 'KB', 'MB', 'GB'}
  local size = bytes
  local unit_index = 1
  
  while size >= 1024 and unit_index < #units do
    size = size / 1024
    unit_index = unit_index + 1
  end
  
  return string.format("%.1f %s", size, units[unit_index])
end
```

## Emacs Integration

### Using MCP.el

1. **Install Package**:
```elisp
(use-package mcp
  :straight (mcp :type git :host github :repo "openspec/mcp.el"))
```

2. **Configuration**:
```elisp
(setq mcp-servers
      '((openspec . (:command "task-mcp" 
                      :args ("--stdio") 
                      :cwd default-directory
                      :streaming-config (:streaming-threshold 10485760
                                       :chunk-size 65536
                                       :max-memory-usage 52428800)))))
```

3. **Functions**:
```elisp
(defun mcp-openspec-browse-changes (&optional page page-size)
  "Browse OpenSpec changes with pagination."
  (interactive "nPage: \nnPage size: ")
  (setq page (or page 1))
  (setq page-size (or page-size 50))
  
  (let* ((uri (format "changes://active?page=%d&pageSize=%d" page page-size))
         (result (mcp-browse-resource "openspec" uri))
         (data (json-read-from-string result)))
    (mcp-openspec-show-changes data)
    (setq mcp-openspec-current-page page)
    (setq mcp-openspec-page-size page-size)
    (setq mcp-openspec-next-token (map-elt data 'nextPageToken))
    (setq mcp-openspec-has-next (map-elt data 'hasNextPage)))))

(defun mcp-openspec-show-changes (data)
  "Display changes in a tabulated list."
  (let ((changes (map-elt data 'changes))
        (total (map-elt data 'total))
        (entries '()))
    (dolist (change changes)
      (let* ((slug (map-elt change 'slug))
             (title (map-elt change 'title))
             (status (map-elt change 'status))
             (uri (format "change://%s/proposal" slug)))
        (push (list slug `[ ,slug ,title ,status ]) entries)))
    (tabulated-list-mode)
    (setq tabulated-list-format [("Slug" 20 t) ("Title" 40 t) ("Status" 15 t)])
    (setq tabulated-list-entries (nreverse entries))
    (tabulated-list-init-header)
    (tabulated-list-print)
    (setq mcp-openspec-mode t)))

(defun mcp-openspec-next-page ()
  "Navigate to next page of changes."
  (interactive)
  (when mcp-openspec-has-next
    (mcp-openspec-browse-changes (1+ mcp-openspec-current-page) mcp-openspec-page-size)))

(defun mcp-openspec-previous-page ()
  "Navigate to previous page of changes."
  (interactive)
  (when (> mcp-openspec-current-page 1)
    (mcp-openspec-browse-changes (1- mcp-openspec-current-page) mcp-openspec-page-size)))

(defun mcp-openspec-stream-file (slug file)
  "Stream a large file from OpenSpec change."
  (interactive 
   (list (read-string "Change slug: ")
         (completing-read "File: " '("proposal" "tasks" "README"))))
  
  (let* ((uri (format "change://%s/%s" slug file))
         (progress-reporter (make-progress-reporter 
                            (format "Streaming %s/%s..." slug file)
                            0 100))
         (progress-callback (lambda (progress)
                             (progress-reporter-update 
                              progress-reporter 
                              (round (map-elt progress 'percentage))))))
    (let ((result (mcp-browse-resource-with-progress "openspec" uri progress-callback)))
      (progress-reporter-done progress-reporter)
      (with-current-buffer (get-buffer-create (format "*%s/%s*" slug file))
        (erase-buffer)
        (insert result)
        (goto-char (point-min))
        (markdown-mode)
        (switch-to-buffer (current-buffer))))))
```

## Sublime Text Integration

### Using MCP Package

1. **Install via Package Control**: Search for "MCP Client"
2. **Configure** in `Preferences > Package Settings > MCP > Settings`:

```json
{
  "servers": {
    "openspec": {
      "command": "task-mcp",
      "args": ["--stdio"],
      "cwd": "${folder}",
      "streaming": {
        "threshold": 10485760,
        "chunkSize": 65536,
        "maxMemory": 52428800,
        "progressInterval": 5
      }
    }
  }
}
```

3. **Commands**:
- `Ctrl+Shift+P → MCP: Call Tool → openspec → change.open`
- `Ctrl+Shift+P → MCP: Browse Resource → changes://active`
- `Ctrl+Shift+P → MCP: Browse Paginated Resource → changes://active`

### Sublime Text Plugin Example

```python
import sublime
import sublime_plugin
import json

class OpenspecPaginateChangesCommand(sublime_plugin.WindowCommand):
    def run(self, page=1, page_size=50):
        uri = f"changes://active?page={page}&pageSize={page_size}"
        self.window.active_view().run_command("mcp_browse_resource", {
            "server": "openspec",
            "uri": uri,
            "callback": "on_changes_loaded"
        })
    
    def on_changes_loaded(self, result):
        try:
            data = json.loads(result)
            self.show_changes(data)
        except json.JSONDecodeError as e:
            sublime.error_message(f"Failed to parse changes: {e}")
    
    def show_changes(self, data):
        changes = data.get('changes', [])
        total = data.get('total', 0)
        page = data.get('page', 1)
        
        # Create new view with changes
        view = self.window.new_file()
        view.set_name(f"Changes (Page {page})")
        view.set_scratch(True)
        
        content = f"# OpenSpec Changes - Page {page}\n\n"
        content += f"Total: {total} changes\n\n"
        
        for change in changes:
            slug = change.get('slug', '')
            title = change.get('title', '')
            status = change.get('status', '')
            content += f"- **{slug}**: {title} ({status})\n"
        
        view.run_command("insert", {"characters": content})
        view.set_syntax_file("Packages/Markdown/Markdown.sublime-syntax")

class OpenspecStreamFileCommand(sublime_plugin.WindowCommand):
    def run(self):
        self.window.show_input_panel("Change slug:", "", self.on_slug, None, None)
    
    def on_slug(self, slug):
        if not slug:
            return
        
        self.window.show_input_panel("File:", "proposal", 
                                  lambda f: self.stream_file(slug, f), 
                                  None, None)
    
    def stream_file(self, slug, filename):
        uri = f"change://{slug}/{filename}"
        
        # Show progress in status bar
        self.window.active_view().set_status("openspec", f"Streaming {slug}/{filename}...")
        
        def progress_callback(progress):
            percentage = progress.get('percentage', 0)
            self.window.active_view().set_status(
                "openspec", 
                f"Streaming {slug}/{filename}: {percentage}%"
            )
        
        def on_complete(result):
            self.window.active_view().erase_status("openspec")
            view = self.window.new_file()
            view.set_name(f"{slug}/{filename}")
            view.set_scratch(True)
            view.run_command("insert", {"characters": result})
            view.set_syntax_file("Packages/Markdown/Markdown.sublime-syntax")
        
        self.window.active_view().run_command("mcp_browse_resource_with_progress", {
            "server": "openspec",
            "uri": uri,
            "progress_callback": progress_callback,
            "callback": on_complete
        })
```

## Common Integration Patterns

### Resource Navigation

All IDEs can access Task MCP resources using standard URI patterns:

```bash
# Paginated active changes
changes://active?page=1&pageSize=20
changes://active?page=2&pageSize=20&nextPageToken=abc123

# Access specific change files
change://user-auth-feature/proposal
change://user-auth-feature/tasks
change://user-auth-feature/delta/specs/auth-flow.md

# Streaming large files (automatic)
change://large-feature/proposal  # > 10MB will stream automatically
```

### Pagination Best Practices

1. **Use reasonable page sizes**: 20-100 items for most UIs
2. **Cache pages**: Store current page data for faster navigation
3. **Handle empty results**: Show appropriate messages for no changes
4. **Display pagination controls**: Previous/Next, page numbers, total count
5. **Respect rate limits**: Don't fetch multiple pages simultaneously

```typescript
// Example pagination implementation
class ChangePaginator {
  private cache = new Map<string, any>();
  private currentPage = 1;
  private pageSize = 50;
  private nextPageToken: string | null = null;

  async loadPage(page: number, pageSize?: number) {
    const cacheKey = `page-${page}-${pageSize || this.pageSize}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const uri = this.buildUri(page, pageSize);
    const result = await this.mcpResource(uri);
    const data = JSON.parse(result);
    
    this.cache.set(cacheKey, data);
    this.currentPage = page;
    this.nextPageToken = data.nextPageToken;
    
    return data;
  }

  private buildUri(page: number, pageSize?: number) {
    const ps = pageSize || this.pageSize;
    let uri = `changes://active?page=${page}&pageSize=${ps}`;
    
    if (page > 1 && this.nextPageToken) {
      uri += `&nextPageToken=${this.nextPageToken}`;
    }
    
    return uri;
  }

  async hasNextPage() {
    if (this.currentPage === 0) return false;
    
    const data = await this.loadPage(this.currentPage);
    return data.hasNextPage;
  }

  async getNextPage() {
    if (await this.hasNextPage()) {
      return this.loadPage(this.currentPage + 1);
    }
    throw new Error('No next page available');
  }
}
```

### Streaming Best Practices

1. **Show progress**: Always display progress for large files
2. **Handle interruptions**: Support cancellation of streaming operations
3. **Memory management**: Monitor memory usage during streaming
4. **Error handling**: Gracefully handle network or file errors
5. **User feedback**: Show clear status messages

```typescript
// Example streaming implementation
class FileStreamer {
  async streamFile(
    slug: string, 
    filename: string,
    onProgress?: (progress: StreamingProgress) => void,
    cancellationToken?: CancellationToken
  ): Promise<string> {
    const uri = `change://${slug}/${filename}`;
    
    return new Promise((resolve, reject) => {
      let isCancelled = false;
      
      if (cancellationToken) {
        cancellationToken.onCancellationRequested(() => {
          isCancelled = true;
          reject(new Error('Streaming cancelled'));
        });
      }

      const progressCallback = (progress: StreamingProgress) => {
        if (isCancelled) return;
        
        if (onProgress) {
          onProgress(progress);
        }
        
        // Check memory usage
        if (progress.memoryUsage > 40 * 1024 * 1024) { // 40MB
          console.warn('High memory usage during streaming');
        }
      };

      this.mcpResourceWithProgress(uri, progressCallback)
        .then(result => {
          if (!isCancelled) {
            resolve(result);
          }
        })
        .catch(reject);
    });
  }
}
```

### Error Handling

Implement proper error handling for pagination and streaming:

```typescript
try {
  const result = await mcpCall('openspec', 'change.open', params);
  // Handle success
} catch (error) {
  if (error.code === 'INVALID_PAGE') {
    // Show pagination error dialog
    showPaginationError(error.message);
  } else if (error.code === 'STREAMING_ERROR') {
    // Show streaming error with retry option
    showStreamingError(error.message, () => retryStreaming());
  } else if (error.code === 'MEMORY_LIMIT_EXCEEDED') {
    // Show memory error and suggest smaller chunks
    showMemoryError(error.message);
  } else if (error.code === 'ELOCKED') {
    // Show lock conflict dialog
    showLockConflictDialog(error.details);
  } else if (error.code === 'EBADSLUG') {
    // Show validation error
    showValidationError(error.message);
  }
}
```

### Status Indicators

Display change status and streaming progress in IDE:

- **Lock Status**: Show when changes are locked
- **Archive Status**: Indicate archived vs active changes
- **Validation Status**: Show shape validation errors
- **Streaming Progress**: Show progress bars for large files
- **Pagination Info**: Display current page and total count
- **Memory Usage**: Monitor and display memory consumption

## Performance Optimization

### IDE-Specific Tips

**VS Code**:
- Enable file watching for OpenSpec directory
- Configure workspace exclusions for `.openspec/changes`
- Use built-in progress API for streaming operations
- Cache pagination results in extension context

**JetBrains**:
- Use file system notifications for resource updates
- Configure memory settings for large projects
- Implement background pagination preloading
- Use EDT-safe progress indicators

**Vim/Neovim**:
- Use async operations for MCP calls
- Configure LSP-style completion for change slugs
- Use floating windows for progress display
- Implement lazy loading for large change lists

**Emacs**:
- Use async processes for MCP operations
- Implement tabulated-list for change browsing
- Use progress-reporter for streaming feedback
- Cache results in buffer-local variables

### Resource Caching

Implement client-side caching for better performance:

```typescript
// Multi-level caching strategy
class ResourceCache {
  private memoryCache = new Map<string, CacheEntry>();
  private diskCache: DiskCache;
  private readonly MEMORY_LIMIT = 50 * 1024 * 1024; // 50MB

  async get(uri: string): Promise<any | null> {
    // Check memory cache first
    const memEntry = this.memoryCache.get(uri);
    if (memEntry && !this.isExpired(memEntry)) {
      return memEntry.data;
    }

    // Check disk cache
    const diskEntry = await this.diskCache.get(uri);
    if (diskEntry && !this.isExpired(diskEntry)) {
      // Promote to memory cache
      this.setMemoryCache(uri, diskEntry.data);
      return diskEntry.data;
    }

    return null;
  }

  async set(uri: string, data: any, ttl: number = 300000) { // 5 minutes
    this.setMemoryCache(uri, data, ttl);
    await this.diskCache.set(uri, data, ttl);
  }

  private setMemoryCache(uri: string, data: any, ttl: number = 300000) {
    // Check memory limit
    if (this.getCurrentMemoryUsage() > this.MEMORY_LIMIT) {
      this.evictOldest();
    }

    this.memoryCache.set(uri, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }
}
```

### Pagination Optimization

```typescript
// Optimized pagination with prefetching
class OptimizedPaginator {
  private prefetchQueue: Promise<any>[] = [];
  private readonly PREFETCH_DISTANCE = 2;

  async loadPage(page: number): Promise<any> {
    // Prefetch next pages
    this.prefetchNextPages(page);
    
    return this.loadPageInternal(page);
  }

  private prefetchNextPages(currentPage: number) {
    for (let i = 1; i <= this.PREFETCH_DISTANCE; i++) {
      const nextPage = currentPage + i;
      if (!this.isPageCached(nextPage)) {
        this.prefetchQueue.push(
          this.loadPageInternal(nextPage).catch(() => null) // Ignore prefetch errors
        );
      }
    }
  }

  private async loadPageInternal(page: number): Promise<any> {
    // Check if already being prefetched
    const prefetchIndex = this.prefetchQueue.findIndex(
      p => p && p.page === page
    );
    
    if (prefetchIndex >= 0) {
      const result = await this.prefetchQueue[prefetchIndex];
      this.prefetchQueue.splice(prefetchIndex, 1);
      return result;
    }

    // Load normally
    return this.mcpResource(this.buildUri(page));
  }
}
```

## Troubleshooting

### Common Issues

**Pagination Problems**:

*Invalid page parameters*:
```
Error: INVALID_PAGE: Page number must be greater than 0
```
**Solution**: Ensure page parameter is ≥ 1

*Page size too large*:
```
Error: PAGE_SIZE_TOO_LARGE: Page size cannot exceed 1000
```
**Solution**: Use smaller page sizes (20-100 recommended)

*Next page token invalid*:
```
Error: INVALID_TOKEN: nextPageToken is invalid or expired
```
**Solution**: Refresh from page 1 or use latest token

**Streaming Issues**:

*Memory limit exceeded*:
```
Error: MEMORY_LIMIT_EXCEEDED: Memory usage exceeded 50MB
```
**Solution**: Reduce streaming threshold or chunk size

*Streaming interrupted*:
```
Error: STREAMING_ERROR: Connection interrupted during streaming
```
**Solution**: Check network connection and retry

*File too large*:
```
Error: FILE_TOO_LARGE: File size exceeds maximum allowed
```
**Solution**: Increase maxFileSize in security config

**Connection Issues**:

*Server not found*:
- Verify Task MCP server installation
- Check command path in configuration
- Ensure server is running in correct directory

*Permission errors*:
- Verify file permissions on OpenSpec directory
- Check lock file ownership
- Ensure server has write access

*Resource loading issues*:
- Verify OpenSpec project structure
- Check for corrupted lock files
- Validate change directory structure

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Enable debug logging
task-mcp --stdio --debug --log-level debug

# Enable streaming debug
task-mcp --stdio --debug-streaming --log-level debug

# Test pagination
task-mcp --test-pagination --page 1 --pageSize 10

# Test streaming
task-mcp --test-streaming --file large-file.md
```

### Health Checks

Verify server connectivity and performance:

```bash
# Test server startup
task-mcp --stdio --test

# Check configuration
task-mcp --validate-config

# Test pagination performance
task-mcp --benchmark-pagination --changes 1000 --pageSize 50

# Test streaming performance  
task-mcp --benchmark-streaming --file-size 50MB
```

### Performance Monitoring

Monitor pagination and streaming performance:

```typescript
// Performance monitoring
class PerformanceMonitor {
  private metrics = new Map<string, number[]>();

  recordPaginationTime(pageSize: number, duration: number) {
    const key = `pagination-${pageSize}`;
    this.addMetric(key, duration);
  }

  recordStreamingMetrics(fileSize: number, duration: number, memoryUsage: number) {
    this.addMetric('streaming-duration', duration);
    this.addMetric('streaming-memory', memoryUsage);
    this.addMetric('streaming-throughput', fileSize / duration);
  }

  getAverage(key: string): number {
    const values = this.metrics.get(key) || [];
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  getReport(): string {
    return `
Performance Report:
- Avg Pagination (50 items): ${this.getAverage('pagination-50')}ms
- Avg Streaming Duration: ${this.getAverage('streaming-duration')}ms
- Avg Memory Usage: ${this.getAverage('streaming-memory')}MB
- Avg Throughput: ${this.getAverage('streaming-throughput')}MB/s
    `.trim();
  }
}
```

## Security Considerations

### Path Validation

All IDE integrations should respect the sandbox security model:

- Only access resources under `openspec/` directory
- Validate all user-provided slugs and paths
- Implement proper escaping for shell commands
- Check nextPageToken validity before use

```typescript
function validateSlug(slug: string): boolean {
  // Only allow alphanumeric, hyphens, and underscores
  return /^[a-zA-Z0-9_-]+$/.test(slug) && slug.length <= 100;
}

function validatePageToken(token: string): boolean {
  // Validate nextPageToken format
  return /^[a-f0-9]{16}$/.test(token);
}
```

### Authentication

For enterprise deployments:

- Use TLS-encrypted HTTPS connections
- Implement bearer token authentication
- Configure rate limiting per IDE session
- Audit all resource access attempts

### Memory Security

Prevent memory exhaustion attacks:

- Enforce strict memory limits
- Monitor streaming memory usage
- Implement automatic cleanup
- Validate file sizes before streaming

```typescript
const SECURITY_CONFIG = {
  maxPageSize: 1000,
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxMemoryUsage: 50 * 1024 * 1024, // 50MB
  streamingThreshold: 10 * 1024 * 1024, // 10MB
  requestTimeout: 30000 // 30 seconds
};
```

## Advanced Features

### Custom Streaming Configuration

Configure streaming parameters per IDE or project:

```json
{
  "openspec": {
    "streaming": {
      "threshold": 5242880,      // 5MB for mobile IDEs
      "chunkSize": 32768,         // 32KB chunks
      "maxMemory": 20971520,      // 20MB limit
      "progressInterval": 10,      // Report every 10 chunks
      "compression": true,         // Enable compression
      "caching": {
        "enabled": true,
        "ttl": 300000,            // 5 minutes
        "maxEntries": 100
      }
    }
  }
}
```

### Batch Operations

Perform multiple operations efficiently:

```typescript
// Batch pagination request
async function batchPaginate(pageSizes: number[]): Promise<any[]> {
  const promises = pageSizes.map(pageSize => 
    mcpResource(`changes://active?page=1&pageSize=${pageSize}`)
  );
  
  return Promise.all(promises);
}

// Batch streaming with concurrency control
async function batchStream(files: string[], maxConcurrency: number = 3): Promise<string[]> {
  const semaphore = new Semaphore(maxConcurrency);
  
  const streamFile = async (file: string) => {
    await semaphore.acquire();
    try {
      return await mcpResource(file);
    } finally {
      semaphore.release();
    }
  };
  
  return Promise.all(files.map(streamFile));
}
```

### Real-time Updates

Implement real-time change notifications:

```typescript
// Watch for changes and update pagination
class ChangeWatcher {
  private watchers: Map<string, any> = new Map();
  
  watchChanges(onChange: (change: any) => void) {
    const watcher = fs.watch('openspec/changes', (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        this.handleChange(filename, onChange);
      }
    });
    
    this.watchers.set('changes', watcher);
  }

  private async handleChange(filename: string, onChange: (change: any) => void) {
    // Invalidate cache for affected pages
    this.invalidatePaginationCache();
    
    // Notify listeners
    const change = await this.getChangeInfo(filename);
    onChange(change);
  }
}
```

## Migration Guide

### Upgrading from v1.x to v2.x

**Breaking Changes**:
- Pagination now uses `changes://active` instead of `changes://`
- Streaming is automatic for files > 10MB
- `nextPageToken` replaces offset-based pagination

**Migration Steps**:

1. Update resource URIs:
```typescript
// Old
changes://?page=1&pageSize=20

// New  
changes://active?page=1&pageSize=20
```

2. Handle nextPageToken:
```typescript
// Old
const offset = (page - 1) * pageSize;

// New
let uri = `changes://active?page=${page}&pageSize=${pageSize}`;
if (nextPageToken) {
  uri += `&nextPageToken=${nextPageToken}`;
}
```

3. Add streaming support:
```typescript
// Automatic - no changes needed for basic usage
// Optional: Add progress callbacks
mcpResourceWithProgress(uri, progressCallback);
```

### Configuration Migration

Update existing MCP configurations:

```json
{
  "mcpServers": {
    "openspec": {
      "command": "task-mcp",
      "args": ["--stdio"],
      "cwd": "${workspaceFolder}",
      "version": "2.1.0",
      "features": {
        "pagination": true,
        "streaming": true,
        "memoryMonitoring": true
      }
    }
  }
}
```

## Support and Contributing

### Getting Help

- **Documentation**: [OpenSpec Docs](https://docs.openspec.dev)
- **Issues**: [GitHub Issues](https://github.com/openspec/openspec/issues)
- **Discussions**: [GitHub Discussions](https://github.com/openspec/openspec/discussions)
- **Community**: [Discord Server](https://discord.gg/openspec)

### Contributing

Contributions to improve IDE integration are welcome:

1. **Bug Reports**: Use the issue template with IDE details
2. **Feature Requests**: Describe the use case and IDE platform
3. **Pull Requests**: Follow the contribution guidelines
4. **Documentation**: Improve this guide with real-world examples

### IDE-Specific Resources

- **VS Code**: [Extension Development Guide](https://code.visualstudio.com/api)
- **JetBrains**: [Plugin Development](https://plugins.jetbrains.com/docs/intellij/)
- **Neovim**: [Plugin Development](https://neovim.io/doc/user/dev.html)
- **Emacs**: [Package Development](https://www.gnu.org/software/emacs/manual/html_node/elisp/)

---

*This guide covers Task MCP v2.1.0+ with pagination and streaming features. For older versions, see the archived documentation.*