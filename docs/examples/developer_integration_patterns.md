# Developer Integration Patterns

_Last updated: 2025-10-23_

## Overview

This guide demonstrates common integration patterns for using the Task MCP API in various development workflows, with practical examples and best practices.

## Core Integration Patterns

### 1. Change Lifecycle Management

**Pattern**: Create → Edit → Validate → Archive

```typescript
class ChangeManager {
  constructor(private mcpClient: MCPClient) {}
  
  async createChange(title: string, template = 'feature'): Promise<string> {
    const slug = this.generateSlug(title);
    
    const result = await this.mcpClient.call('openspec', 'change.open', {
      title,
      slug,
      template,
      owner: process.env.USER || 'developer',
      ttl: 7200 // 2 hours
    });
    
    return result.slug;
  }
  
  async editChange(slug: string, editor = 'vscode'): Promise<void> {
    const proposalPath = `change://${slug}/proposal`;
    const tasksPath = `change://${slug}/tasks`;
    
    // Open files in preferred editor
    await this.openInEditor([proposalPath, tasksPath], editor);
  }
  
  async validateChange(slug: string): Promise<ValidationResult> {
    const deltaPath = `change://${slug}/delta`;
    const files = await this.mcpClient.listResources(deltaPath);
    
    // Validate each spec file
    const results = await Promise.all(
      files.map(file => this.validateSpecFile(file.path))
    );
    
    return {
      valid: results.every(r => r.valid),
      errors: results.flatMap(r => r.errors)
    };
  }
  
  async archiveChange(slug: string): Promise<Receipt> {
    const result = await this.mcpClient.call('openspec', 'change.archive', {
      slug
    });
    
    return result.receipt;
  }
  
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 64);
  }
}
```

### 2. Batch Operations

**Pattern**: Process multiple changes efficiently

```typescript
class BatchProcessor {
  constructor(private mcpClient: MCPClient) {}
  
  async archiveCompletedChanges(): Promise<BatchResult> {
    const activeChanges = await this.mcpClient.getResource('changes://active');
    const completedChanges = activeChanges.items.filter(change => 
      this.isChangeCompleted(change)
    );
    
    const results = await Promise.allSettled(
      completedChanges.map(change => 
        this.mcpClient.call('openspec', 'change.archive', { slug: change.slug })
      )
    );
    
    return {
      total: completedChanges.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      errors: results
        .filter(r => r.status === 'rejected')
        .map(r => (r as PromiseRejectedResult).reason)
    };
  }
  
  async cleanupStaleLocks(maxAgeHours = 24): Promise<CleanupResult> {
    const activeChanges = await this.mcpClient.getResource('changes://active');
    const staleChanges = activeChanges.items.filter(change => {
      const lockAge = this.calculateLockAge(change);
      return lockAge > maxAgeHours * 60 * 60 * 1000;
    });
    
    // Attempt to reclaim stale locks
    const results = await Promise.allSettled(
      staleChanges.map(change => 
        this.reclaimLock(change.slug, change.owner)
      )
    );
    
    return {
      locksChecked: activeChanges.items.length,
      staleFound: staleChanges.length,
      reclaimed: results.filter(r => r.status === 'fulfilled').length
    };
  }
  
  private isChangeCompleted(change: ChangeItem): boolean {
    // Implement completion criteria
    return change.status === 'ready-for-archive';
  }
}
```

### 3. Resource Monitoring

**Pattern**: Track resource usage and health

```typescript
class ResourceMonitor {
  constructor(private mcpClient: MCPClient) {}
  
  async getSystemHealth(): Promise<HealthStatus> {
    const [activeChanges, diskUsage, lockStatus] = await Promise.all([
      this.getActiveChangeCount(),
      this.getDiskUsage(),
      this.getLockHealth()
    ]);
    
    return {
      status: this.calculateHealthStatus(activeChanges, diskUsage, lockStatus),
      metrics: {
        activeChanges,
        diskUsage,
        lockHealth: lockStatus
      },
      recommendations: this.generateRecommendations(activeChanges, diskUsage)
    };
  }
  
  async monitorChangeActivity(slug: string): Promise<ActivityReport> {
    const changePath = `change://${slug}`;
    const [proposal, tasks, delta] = await Promise.all([
      this.mcpClient.getResource(`${changePath}/proposal`),
      this.mcpClient.getResource(`${changePath}/tasks`),
      this.mcpClient.listResources(`${changePath}/delta`)
    ]);
    
    return {
      slug,
      lastModified: this.getLatestModification(proposal, tasks, delta),
      fileCount: delta.length + 2, // +2 for proposal and tasks
      size: this.calculateTotalSize(proposal, tasks, delta),
      completeness: this.assessCompleteness(proposal, tasks, delta)
    };
  }
  
  private async getActiveChangeCount(): Promise<number> {
    const result = await this.mcpClient.getResource('changes://active?pageSize=1');
    return result.pagination.total;
  }
  
  private async getDiskUsage(): Promise<DiskUsage> {
    // Implement disk usage calculation
    return {
      total: 0,
      used: 0,
      available: 0,
      openspecUsage: 0
    };
  }
}
```

## IDE-Specific Patterns

### VS Code Extension Integration

```typescript
// VS Code Extension for OpenSpec
import * as vscode from 'vscode';
import { MCPClient } from '@openspec/mcp-client';

export class OpenSpecExtension {
  private mcpClient: MCPClient;
  private changeManager: ChangeManager;
  
  constructor() {
    this.mcpClient = new MCPClient({
      serverName: 'openspec',
      command: 'task-mcp',
      args: ['--stdio']
    });
    
    this.changeManager = new ChangeManager(this.mcpClient);
    this.registerCommands();
    this.registerResourceProvider();
  }
  
  private registerCommands(): void {
    const commands = [
      vscode.commands.registerCommand('openspec.createChange', this.createChange.bind(this)),
      vscode.commands.registerCommand('openspec.archiveChange', this.archiveChange.bind(this)),
      vscode.commands.registerCommand('openspec.refreshChanges', this.refreshChanges.bind(this))
    ];
    
    commands.forEach(cmd => this.context.subscriptions.push(cmd));
  }
  
  private registerResourceProvider(): void {
    const provider = new OpenSpecResourceProvider(this.mcpClient);
    vscode.workspace.registerFileSystemProvider('openspec', provider);
  }
  
  private async createChange(): Promise<void> {
    const title = await vscode.window.showInputBox({
      prompt: 'Enter change title',
      placeHolder: 'e.g., Add user authentication'
    });
    
    if (!title) return;
    
    try {
      const slug = await this.changeManager.createChange(title);
      vscode.window.showInformationMessage(`Created change: ${slug}`);
      
      // Open the change in editor
      const uri = vscode.Uri.parse(`openspec://changes/${slug}/proposal`);
      await vscode.window.showTextDocument(uri);
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create change: ${error.message}`);
    }
  }
}
```

### JetBrains Plugin Integration

```kotlin
// JetBrains Plugin for OpenSpec
class OpenSpecToolWindow : DumbAwareToolWindowFactory {
    private val mcpClient = MCPClient("task-mcp", listOf("--stdio"))
    private val changeManager = ChangeManager(mcpClient)
    
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentManager = toolWindow.contentManager
        val content = contentManager.factory.createContent(
            OpenSpecChangesPanel(project, changeManager).panel,
            null,
            false
        )
        contentManager.addContent(content)
    }
}

class OpenSpecChangesPanel(
    private val project: Project,
    private val changeManager: ChangeManager
) {
    val panel: JPanel = JPanel(BorderLayout())
    private val changesList = JBList<ChangeItem>()
    private val refreshButton = JButton("Refresh")
    
    init {
        setupUI()
        loadChanges()
    }
    
    private fun setupUI() {
        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT))
        toolbar.add(refreshButton)
        toolbar.add(JButton("Create Change").apply {
            addActionListener { createNewChange() }
        })
        
        panel.add(toolbar, BorderLayout.NORTH)
        panel.add(JScrollPane(changesList), BorderLayout.CENTER)
        
        refreshButton.addActionListener { loadChanges() }
        changesList.addListSelectionListener { showChangeDetails() }
    }
    
    private fun loadChanges() {
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val changes = changeManager.getActiveChanges()
                ApplicationManager.getApplication().invokeLater {
                    changesList.setListData(changes.toTypedArray())
                }
            } catch (e: Exception) {
                ApplicationManager.getApplication().invokeLater {
                    Messages.showErrorDialog(project, "Failed to load changes: ${e.message}", "Error")
                }
            }
        }
    }
}
```

## Workflow Integration Patterns

### 1. Git Workflow Integration

```bash
#!/bin/bash
# Git pre-commit hook for OpenSpec changes

OPENSPEC_DIR="openspec"
CHANGES_DIR="$OPENSPEC_DIR/changes"

# Check if we're committing changes to OpenSpec
if git diff --cached --name-only | grep -q "^$OPENSPEC_DIR/"; then
    echo "Validating OpenSpec changes..."
    
    # Validate all active changes
    for change_dir in "$CHANGES_DIR"/*; do
        if [ -d "$change_dir" ] && [ ! -f "$change_dir/receipt.json" ]; then
            slug=$(basename "$change_dir")
            
            # Validate change structure
            if ! task-mcp validate-change "$slug"; then
                echo "Error: Change $slug failed validation"
                exit 1
            fi
            
            # Check for lock conflicts
            if [ -f "$change_dir/.lock" ]; then
                lock_owner=$(jq -r '.owner' "$change_dir/.lock")
                if [ "$lock_owner" != "$(git config user.email)" ]; then
                    echo "Error: Change $slug is locked by $lock_owner"
                    exit 1
                fi
            fi
        fi
    done
    
    echo "OpenSpec validation passed"
fi

exit 0
```

### 2. CI/CD Pipeline Integration

```yaml
# GitHub Actions workflow for OpenSpec
name: OpenSpec Validation

on:
  push:
    paths: ['openspec/**']
  pull_request:
    paths: ['openspec/**']

jobs:
  validate-openspec:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install Task MCP
      run: npm install -g @openspec/task-mcp
      
    - name: Validate OpenSpec Changes
      run: |
        # Start Task MCP server
        task-mcp --stdio &
        MCP_PID=$!
        
        # Wait for server to start
        sleep 2
        
        # Validate all changes
        for change_dir in openspec/changes/*; do
          if [ -d "$change_dir" ] && [ ! -f "$change_dir/receipt.json" ]; then
            slug=$(basename "$change_dir")
            echo "Validating change: $slug"
            
            # Validate structure
            if ! task-mcp validate-change "$slug"; then
              echo "Change $slug failed validation"
              exit 1
            fi
            
            # Check lock status
            if [ -f "$change_dir/.lock" ]; then
              echo "Warning: Change $slug has active lock"
            fi
          fi
        done
        
        # Cleanup
        kill $MCP_PID
        
    - name: Archive Completed Changes
      if: github.ref == 'refs/heads/main'
      run: |
        # Archive changes marked as ready
        task-mcp archive-ready-changes
```

### 3. Team Collaboration Patterns

```typescript
class CollaborationManager {
  constructor(private mcpClient: MCPClient) {}
  
  async assignChange(slug: string, assignee: string): Promise<void> {
    // Check if change is locked
    const lockInfo = await this.getLockInfo(slug);
    if (lockInfo.locked && lockInfo.owner !== assignee) {
      throw new Error(`Change ${slug} is locked by ${lockInfo.owner}`);
    }
    
    // Update change metadata
    const proposalPath = `change://${slug}/proposal`;
    const proposal = await this.mcpClient.getResource(proposalPath);
    
    const updatedProposal = this.updateAssignee(proposal, assignee);
    await this.mcpClient.updateResource(proposalPath, updatedProposal);
    
    // Notify team members
    await this.notifyAssignment(slug, assignee);
  }
  
  async requestReview(slug: string, reviewers: string[]): Promise<void> {
    const reviewRequest = {
      slug,
      requestedAt: new Date().toISOString(),
      reviewers,
      status: 'pending'
    };
    
    // Create review request file
    const reviewPath = `change://${slug}/review-request.json`;
    await this.mcpClient.createResource(reviewPath, reviewRequest);
    
    // Send notifications
    await this.notifyReviewers(slug, reviewers);
  }
  
  async mergeChange(slug: string, approver: string): Promise<void> {
    // Validate change is ready for merge
    const validationResult = await this.validateForMerge(slug);
    if (!validationResult.valid) {
      throw new Error(`Change not ready for merge: ${validationResult.errors.join(', ')}`);
    }
    
    // Archive the change
    const receipt = await this.mcpClient.call('openspec', 'change.archive', { slug });
    
    // Update project status
    await this.updateProjectStatus(slug, 'merged');
    
    // Notify team
    await this.notifyMerge(slug, approver, receipt);
  }
}
```

## Error Handling Patterns

### 1. Resilient Operations

```typescript
class ResilientMCPClient {
  constructor(private baseClient: MCPClient) {}
  
  async callWithRetry(
    tool: string, 
    params: any, 
    maxRetries = 3,
    backoffMs = 1000
  ): Promise<any> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.baseClient.call('openspec', tool, params);
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          await this.delay(backoffMs * attempt);
        }
      }
    }
    
    throw lastError;
  }
  
  async callWithFallback(
    tool: string,
    params: any,
    fallback: () => Promise<any>
  ): Promise<any> {
    try {
      return await this.baseClient.call('openspec', tool, params);
    } catch (error) {
      console.warn(`Primary operation failed, using fallback: ${error.message}`);
      return await fallback();
    }
  }
  
  private isNonRetryableError(error: Error): boolean {
    const nonRetryableCodes = ['EBADSLUG', 'EPATH_ESCAPE', 'EARCHIVED'];
    return nonRetryableCodes.includes(error.code);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2. Graceful Degradation

```typescript
class GracefulMCPIntegration {
  constructor(private mcpClient: MCPClient) {}
  
  async getChangeSummary(slug: string): Promise<PartialChangeSummary> {
    try {
      // Try to get full summary from MCP
      const [proposal, tasks, delta] = await Promise.all([
        this.mcpClient.getResource(`change://${slug}/proposal`),
        this.mcpClient.getResource(`change://${slug}/tasks`),
        this.mcpClient.listResources(`change://${slug}/delta`)
      ]);
      
      return {
        slug,
        title: this.extractTitle(proposal),
        taskCount: this.countTasks(tasks),
        specCount: delta.length,
        status: 'complete'
      };
      
    } catch (error) {
      // Fallback to basic file system access
      console.warn(`MCP access failed, using fallback: ${error.message}`);
      
      try {
        const changePath = path.join(process.cwd(), 'openspec', 'changes', slug);
        const proposalContent = await fs.readFile(path.join(changePath, 'proposal.md'), 'utf8');
        
        return {
          slug,
          title: this.extractTitle(proposalContent),
          status: 'partial'
        };
        
      } catch (fallbackError) {
        return {
          slug,
          status: 'unavailable',
          error: fallbackError.message
        };
      }
    }
  }
}
```

## Performance Optimization Patterns

### 1. Caching Strategy

```typescript
class CachedMCPClient {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  constructor(private baseClient: MCPClient) {}
  
  async getResource(uri: string): Promise<any> {
    const cacheKey = uri;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    
    const data = await this.baseClient.getResource(uri);
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
  
  async invalidateCache(pattern?: string): Promise<void> {
    if (pattern) {
      for (const [key] of this.cache) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}
```

### 2. Batch Processing

```typescript
class BatchMCPClient {
  constructor(private baseClient: MCPClient) {}
  
  async batchCall(operations: BatchOperation[]): Promise<BatchResult[]> {
    const results = await Promise.allSettled(
      operations.map(op => this.baseClient.call('openspec', op.tool, op.params))
    );
    
    return results.map((result, index) => ({
      id: operations[index].id,
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null
    }));
  }
  
  async parallelResourceAccess(uris: string[]): Promise<ResourceResult[]> {
    const results = await Promise.allSettled(
      uris.map(uri => this.baseClient.getResource(uri))
    );
    
    return results.map((result, index) => ({
      uri: uris[index],
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null
    }));
  }
}
```

These integration patterns provide a comprehensive foundation for building robust applications and workflows on top of the Task MCP API. Choose the patterns that best fit your specific use case and requirements.