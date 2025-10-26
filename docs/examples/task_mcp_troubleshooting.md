# Task MCP Troubleshooting Guide

_Last updated: 2025-10-23_

## Overview

This comprehensive troubleshooting guide covers common issues, error scenarios, and solutions for Task MCP server deployment and usage.

## Quick Diagnostic Checklist

### Server Connectivity Issues

**Symptoms**:
- Server won't start
- Connection timeouts
- "Server not found" errors

**Diagnostic Steps**:
```bash
# 1. Verify installation
which task-mcp
task-mcp --version

# 2. Test server startup
task-mcp --stdio --test

# 3. Check configuration
task-mcp --validate-config

# 4. Test with verbose logging
task-mcp --stdio --debug --log-level debug
```

**Common Solutions**:
```bash
# Reinstall if corrupted
npm uninstall -g @openspec/task-mcp
npm install -g @openspec/task-mcp

# Check Node.js version (requires 16+)
node --version

# Verify permissions
chmod +x $(which task-mcp)
```

### Project Configuration Issues

**Symptoms**:
- "Not an OpenSpec project" errors
- Path validation failures
- Lock file permission errors

**Diagnostic Steps**:
```bash
# 1. Verify OpenSpec structure
ls -la openspec/
ls -la openspec/changes/

# 2. Check project initialization
openspec --version
openspec status

# 3. Validate project structure
task-mcp validate-project
```

**Common Solutions**:
```bash
# Initialize missing OpenSpec structure
openspec init

# Fix permissions
chmod 755 openspec/
chmod 700 openspec/changes/

# Repair corrupted lock files
find openspec/changes -name ".lock" -delete
```

## Error Code Reference

### ELOCKED - Lock Conflict

**Description**: Change is locked by another user or process

**Error Response**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "ELOCKED",
    "message": "Change is locked by another owner",
    "details": {
      "owner": "user@example.com",
      "since": "2025-10-23T14:30:00Z",
      "ttl": 3600,
      "hostname": "dev-machine.local"
    }
  }
}
```

**Causes & Solutions**:

1. **Another user has the change locked**
   ```bash
   # Check lock details
   cat openspec/changes/your-change/.lock
   
   # Contact the lock owner to release it
   # Or wait for TTL expiration
   ```

2. **Stale lock from crashed process**
   ```bash
   # Remove stale lock (if you're the owner or it's expired)
   rm openspec/changes/your-change/.lock
   
   # Or use reclaim mechanism
   task-mcp reclaim-lock your-change --owner your-email@example.com
   ```

3. **Lock TTL too short**
   ```bash
   # Request longer TTL when opening change
   mcp-call openspec change.open '{
     "title": "Your change",
     "slug": "your-change",
     "ttl": 14400
   }'
   ```

### EBADSLUG - Invalid Slug Format

**Description**: Slug doesn't match required pattern

**Error Response**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "EBADSLUG",
    "message": "Slug fails validation requirements",
    "details": {
      "pattern": "^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$",
      "provided": "invalid-slug!",
      "reason": "Contains invalid characters"
    }
  }
}
```

**Slug Rules**:
- Must start and end with lowercase letter or number
- Can contain hyphens in the middle
- 3-64 characters long
- Only lowercase letters, numbers, and hyphens

**Examples**:
```bash
# Valid slugs
user-auth-feature
bug-fix-123
api-refactor-v2

# Invalid slugs
User-Auth-Feature          # Uppercase letters
user_auth_feature          # Underscores
user-auth-feature-         # Ends with hyphen
-user-auth-feature         # Starts with hyphen
user-auth-feature!         # Special characters
```

**Solution**:
```bash
# Generate valid slug from title
slug=$(echo "Your Title Here" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g' | sed 's/^-//;s/-$//')
echo $slug  # your-title-here
```

### EPATH_ESCAPE - Path Traversal Attempt

**Description**: Attempted to access files outside OpenSpec sandbox

**Error Response**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "EPATH_ESCAPE",
    "message": "Attempted path traversal outside sandbox",
    "details": {
      "requested": "../../../etc/passwd",
      "allowed": "/home/user/project/openspec/",
      "resolved": "/home/user/project/etc/passwd"
    }
  }
}
```

**Causes & Solutions**:

1. **Malicious input**
   - This is a security feature - the request is blocked as intended

2. **Incorrect slug resolution**
   ```bash
   # Ensure you're using correct slug format
   mcp-call openspec change.open '{
     "title": "Valid change",
     "slug": "valid-change"
   }'
   ```

3. **Symbolic link attacks**
   ```bash
   # Check for suspicious symlinks
   find openspec/ -type l -ls
   
   # Remove suspicious links
   find openspec/ -type l -delete
   ```

### EBADSHAPE_* - Change Structure Validation

**Description**: Change directory structure is invalid or incomplete

**Error Variants**:
- `EBADSHAPE_MISSING_FILE` - Required file missing
- `EBADSHAPE_INVALID_DELTA` - Malformed specs directory

**EBADSHAPE_MISSING_FILE**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "EBADSHAPE_MISSING_FILE",
    "message": "Required file missing from change",
    "details": {
      "missing": "proposal.md",
      "expected": ["proposal.md", "tasks.md", "specs/"]
    }
  }
}
```

**Solutions**:
```bash
# 1. Check change structure
ls -la openspec/changes/your-change/

# 2. Create missing files
touch openspec/changes/your-change/proposal.md
touch openspec/changes/your-change/tasks.md
mkdir -p openspec/changes/your-change/specs

# 3. Use scaffolding to fix structure
task-mcp scaffold your-change --template feature
```

**EBADSHAPE_INVALID_DELTA**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "EBADSHAPE_INVALID_DELTA",
    "message": "Invalid specs directory structure",
    "details": {
      "issues": [
        "specs directory not found",
        "contains non-markdown files",
        "invalid filename: spec!.md"
      ]
    }
  }
}
```

**Solutions**:
```bash
# 1. Fix specs directory
mkdir -p openspec/changes/your-change/specs

# 2. Remove invalid files
find openspec/changes/your-change/specs -name "*.md" -not -name "*.md" -delete

# 3. Rename invalid files
mv "openspec/changes/your-change/specs/spec!.md" "openspec/changes/your-change/specs/spec.md"
```

### EARCHIVED - Operation on Archived Change

**Description**: Attempted to modify an already archived change

**Error Response**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "EARCHIVED",
    "message": "Operation attempted on archived change",
    "details": {
      "slug": "completed-feature",
      "archivedAt": "2025-10-22T16:45:00Z",
      "receipt": "receipt.json"
    }
  }
}
```

**Solutions**:
```bash
# 1. Verify change is archived
ls -la openspec/changes/completed-feature/receipt.json

# 2. Create new change if needed
mcp-call openspec change.open '{
  "title": "New iteration of feature",
  "slug": "completed-feature-v2"
}'

# 3. Or restore from archive (advanced)
task-mcp restore completed-feature --force
```

## Performance Issues

### Slow Response Times

**Symptoms**:
- Commands taking >10 seconds
- Resource loading delays
- Intermittent timeouts

**Diagnostic Steps**:
```bash
# 1. Check system resources
top -p $(pgrep task-mcp)
iostat -x 1 5

# 2. Profile operation timing
time mcp-call openspec change.open '{"title":"test","slug":"test"}'

# 3. Check file system performance
dd if=/dev/zero of=/tmp/test bs=1M count=100
sync; echo 3 | sudo tee /proc/sys/vm/drop_caches
time dd if=/tmp/test of=/dev/null bs=1M

# 4. Monitor with debug logging
task-mcp --stdio --debug --profile
```

**Common Causes & Solutions**:

1. **Large change directories**
   ```bash
   # Clean up large files
   find openspec/changes -type f -size +10M -ls
   
   # Archive completed changes
   task-mcp archive-ready-changes
   ```

2. **Slow file system**
   ```bash
   # Check for file system issues
   fsck -n /dev/sda1
   
   # Consider moving to faster storage
   mv openspec/ /fast-storage/
   ln -s /fast-storage/openspec openspec
   ```

3. **Memory pressure**
   ```bash
   # Check memory usage
   free -h
   
   # Optimize Node.js memory
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

### Memory Leaks

**Symptoms**:
- Memory usage continuously increasing
- Server crashes after extended use
- System becomes unresponsive

**Diagnostic Steps**:
```bash
# 1. Monitor memory usage
watch -n 1 'ps aux | grep task-mcp'

# 2. Generate heap dump
kill -USR2 $(pgrep task-mcp)

# 3. Use Node.js profiler
node --inspect task-mcp --stdio
```

**Solutions**:
```bash
# 1. Restart server periodically
systemctl restart task-mcp

# 2. Limit memory usage
export NODE_OPTIONS="--max-old-space-size=2048"

# 3. Use process manager
pm2 start task-mcp --name openspec-mcp --max-memory-restart 1G
```

## IDE Integration Issues

### VS Code Extension Problems

**Symptoms**:
- Extension not loading
- Commands not available
- Resource provider errors

**Diagnostic Steps**:
```json
// Check VS Code developer console
// Help → Toggle Developer Tools → Console

// Check extension settings
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

**Common Solutions**:
```bash
# 1. Reload VS Code window
Ctrl+Shift+P → "Developer: Reload Window"

# 2. Check extension installation
code --list-extensions | grep openspec

# 3. Clear extension cache
rm -rf ~/.vscode/extensions/user-data/workspaceStorage

# 4. Test MCP connection manually
mcp-test-connection openspec
```

### JetBrains Plugin Issues

**Symptoms**:
- Plugin not showing in tools
- Connection errors
- Resource loading failures

**Diagnostic Steps**:
```kotlin
// Check plugin logs
// Help → Show Log in Finder/Explorer

// Verify plugin installation
Settings → Plugins → Installed → OpenSpec
```

**Solutions**:
```bash
# 1. Invalidate caches
File → Invalidate Caches → Invalidate and Restart

# 2. Reset plugin settings
rm -rf ~/.config/JetBrains/IntelliJIdea*/options/openspec.xml

# 3. Reinstall plugin
rm -rf ~/.config/JetBrains/IntelliJIdea*/plugins/OpenSpec
```

## Network and Transport Issues

### HTTPS/SSE Connection Problems

**Symptoms**:
- TLS handshake failures
- Connection timeouts
- Certificate errors

**Diagnostic Steps**:
```bash
# 1. Test TLS connection
openssl s_client -connect localhost:443 -servername localhost

# 2. Check certificate
openssl x509 -in /path/to/cert.pem -text -noout

# 3. Test HTTP endpoint
curl -v https://localhost/healthz

# 4. Monitor network traffic
tcpdump -i lo port 443
```

**Solutions**:
```bash
# 1. Fix certificate issues
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# 2. Configure proper TLS settings
ciphers=ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256
minVersion=TLSv1.2

# 3. Check firewall settings
ufw status
ufw allow 443/tcp
```

### Rate Limiting Issues

**Symptoms**:
- 429 Too Many Requests errors
- Requests being dropped
- Performance degradation

**Diagnostic Steps**:
```bash
# 1. Check rate limit status
curl -I https://localhost/api/rate-limit

# 2. Monitor request patterns
tail -f /var/log/openspec-access.log | grep "rate-limit"

# 3. Check client identification
curl -H "X-Client-ID: test" https://localhost/api/status
```

**Solutions**:
```bash
# 1. Adjust rate limits
# In server configuration
rateLimits: {
  default: { requests: 100, window: 60000 },
  authenticated: { requests: 1000, window: 60000 }
}

# 2. Implement client-side throttling
const throttle = require('lodash.throttle');
const throttledCall = throttle(mcpCall, 1000);

# 3. Use API keys for higher limits
curl -H "X-API-Key: your-key" https://localhost/api/call
```

## Data Recovery and Repair

### Corrupted Change Directories

**Symptoms**:
- Validation errors on valid changes
- Missing files in existing changes
- Lock file corruption

**Recovery Procedures**:
```bash
# 1. Backup before repair
cp -r openspec/changes openspec/changes.backup.$(date +%Y%m%d)

# 2. Repair individual change
task-mcp repair-change your-change

# 3. Validate all changes
task-mcp validate-all-changes

# 4. Rebuild indexes
task-mcp rebuild-indexes
```

**Manual Repair**:
```bash
# 1. Fix missing files
for dir in openspec/changes/*/; do
  [ ! -f "$dir/proposal.md" ] && touch "$dir/proposal.md"
  [ ! -f "$dir/tasks.md" ] && touch "$dir/tasks.md"
  [ ! -d "$dir/specs" ] && mkdir -p "$dir/specs"
done

# 2. Fix permissions
find openspec/changes -type d -exec chmod 755 {} \;
find openspec/changes -type f -exec chmod 644 {} \;

# 3. Remove corrupted locks
find openspec/changes -name ".lock" -size 0 -delete
```

### Database/Index Corruption

**Symptoms**:
- Resource listing errors
- Inconsistent change counts
- Search failures

**Recovery**:
```bash
# 1. Rebuild from file system
task-mcp rebuild-database --force

# 2. Verify integrity
task-mcp verify-database

# 3. Export/import if needed
task-mcp export-changes > backup.json
task-mcp import-changes backup.json
```

## Advanced Troubleshooting

### Debug Mode Operation

```bash
# Enable comprehensive debugging
task-mcp --stdio \
  --debug \
  --log-level debug \
  --profile \
  --trace
```

**Debug Output Includes**:
- Request/response payloads
- Internal state transitions
- Performance metrics
- Stack traces for errors

### Performance Profiling

```bash
# CPU profiling
node --prof task-mcp --stdio
node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --inspect task-mcp --stdio
# Then connect Chrome DevTools

# Heap snapshots
node --heap-prof task-mcp --stdio
```

### Network Debugging

```bash
# Capture MCP protocol traffic
tcpdump -i lo -w mcp-traffic.pcap port 3000 &
tcpdump_pid=$!

# Run your test
mcp-call openspec change.open '{"title":"test","slug":"test"}'

# Stop capture
kill $tcpdump_pid
wireshark mcp-traffic.pcap
```

## Getting Help

### Community Resources

1. **GitHub Issues**: Report bugs and request features
2. **Documentation**: Check latest docs at docs.openspec.org
3. **Discord Community**: Real-time help and discussions
4. **Stack Overflow**: Tag questions with `openspec` and `task-mcp`

### Bug Report Template

```markdown
## Bug Report

**Environment**:
- OS: [e.g., Ubuntu 20.04]
- Node.js: [e.g., 18.17.0]
- Task MCP: [e.g., 1.0.0]
- IDE: [e.g., VS Code 1.82]

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happened]

**Error Messages**:
```
[Paste full error output]
```

**Additional Context**:
[Any other relevant information]
```

### Support Request Information

When requesting support, please include:

1. **Environment Details**
   ```bash
   uname -a
   node --version
   npm list -g @openspec/task-mcp
   ```

2. **Configuration**
   ```bash
   cat ~/.openspec/config.json
   cat openspec/openspec.json
   ```

3. **Logs**
   ```bash
   # Last 100 lines of logs
   tail -n 100 /var/log/openspec.log
   
   # Debug output
   task-mcp --stdio --debug 2>&1 | head -50
   ```

4. **Reproduction Case**
   - Minimal example that reproduces the issue
   - Steps to reproduce
   - Expected vs actual behavior

This troubleshooting guide should help resolve most common issues with Task MCP. For complex problems, don't hesitate to reach out to the community for assistance.