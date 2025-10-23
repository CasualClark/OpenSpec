# Troubleshooting Guide - Task MCP

_Last updated: 2025-10-23_

## Common Issues and Solutions

### Change Management Issues

#### Issue: `SLUG_CONFLICT` Error
**Symptom**: Cannot create a change, getting "Slug already exists with different owner"

**Causes**:
- Another developer is working on the same change
- Previous change wasn't properly archived
- Lock file exists but expired

**Solutions**:
```bash
# Check who owns the lock
cat openspec/changes/{slug}/.lock

# Wait for lock to expire (check TTL)
# Or contact the lock owner to release it

# Force archive (if you have permissions)
change.archive({"slug": "{slug}"})
```

**Prevention**:
- Always use descriptive, unique slugs
- Archive changes when complete
- Set appropriate TTL for your work session

#### Issue: `CHANGE_NOT_FOUND` Error
**Symptom**: Cannot access or archive a change that should exist

**Causes**:
- Change was already archived
- Typo in slug
- Change in different directory

**Solutions**:
```bash
# List all active changes
changes://active

# Check archived changes
ls -la openspec/changes/archived/

# Verify slug format (lowercase, hyphens only)
echo "your-slug" | grep -E '^[a-z0-9]([a-z0-9\-]{1,62})[a-z0-9]$'
```

### Schema Validation Issues

#### Issue: `INVALID_INPUT` Error
**Symptom**: Input validation fails with unclear error messages

**Common Causes**:
- Missing required fields
- Invalid email format for owner
- Slug violates naming rules

**Solutions**:
```bash
# Validate slug format manually
python3 -c "
import re
slug = 'your-slug-here'
pattern = r'^[a-z0-9]([a-z0-9\-]{1,62})[a-z0-9]$'
print('Valid' if re.match(pattern, slug) else 'Invalid')
"

# Validate email format
python3 -c "
import re
email = 'dev@example.com'
pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
print('Valid' if re.match(pattern, email) else 'Invalid')
"
```

#### Issue: `SCHEMA_VALIDATION_FAILED` Error
**Symptom**: Pre-archive validation fails

**Common Causes**:
- Missing required files (proposal.md, tasks.md)
- Invalid JSON in receipt
- Test failures

**Solutions**:
```bash
# Check required files exist
ls -la openspec/changes/{slug}/proposal.md
ls -la openspec/changes/{slug}/tasks.md

# Validate JSON syntax
python3 -m json.tool openspec/changes/{slug}/receipt.json

# Run tests manually
npm test
# or
pytest
```

### Token Policy Issues

#### Issue: Exceeding Token Limits
**Symptom**: Tool responses truncated or Claude Code context limit exceeded

**Causes**:
- Inefficient tool outputs with inline content
- Large file contents in responses
- Verbose error messages

**Solutions**:
```bash
# Check token usage (example)
echo "Response too large, use resource URIs instead"

# Use resource URIs for content access
@task:change://{slug}/proposal
@task:change://{slug}/tasks

# Enable compact mode
export TASK_MCP_COMPACT=true
```

#### Issue: Resource Attachment Not Working
**Symptom**: @task: resources not attaching in Claude Code

**Causes**:
- Not in stdio/IDE mode
- Resource URIs malformed
- MCP server not running

**Solutions**:
```bash
# Verify MCP server is running
ps aux | grep task-mcp

# Check resource URI format
echo "change://slug-name/resource"  # Correct format
echo "change://slug_name/resource"  # Wrong format

# Restart MCP server if needed
task-mcp --stdio
```

### Development Environment Issues

#### Issue: Schema Files Not Found
**Symptom**: Cannot validate against schemas

**Causes**:
- Missing schema files
- Incorrect schema paths
- Schema version mismatch

**Solutions**:
```bash
# Verify schema files exist
ls -la docs/schemas/

# Check schema syntax
python3 -m json.tool docs/schemas/change.open.input.schema.json

# Update schemas if needed
npm run update-schemas
```

#### Issue: CI Validation Failures
**Symptom**: GitHub Actions failing on schema validation

**Causes**:
- Outdated schema references
- Breaking changes in contracts
- Missing test coverage

**Solutions**:
```bash
# Run CI locally
act -j test

# Check schema validation
npm run validate-schemas

# Update test cases
npm run test:update
```

### Performance Issues

#### Issue: Slow Change Creation
**Symptom**: `change.open` taking > 10 seconds

**Causes**:
- Large repository size
- Network latency
- File system permissions

**Solutions**:
```bash
# Check repository size
du -sh .git/

# Benchmark file system
time ls openspec/changes/

# Check permissions
ls -la openspec/changes/
chmod 755 openspec/changes/
```

#### Issue: Memory Usage High
**Symptom**: MCP server consuming excessive memory

**Causes**:
- Large file caching
- Memory leaks
- Too many concurrent operations

**Solutions**:
```bash
# Monitor memory usage
ps aux | grep task-mcp

# Clear cache if available
task-mcp --clear-cache

# Restart server
pkill task-mcp && task-mcp --stdio
```

## Debugging Tools and Techniques

### Enable Debug Mode
```bash
export TASK_MCP_DEBUG=true
export TASK_MCP_LOG_LEVEL=debug
task-mcp --stdio
```

### Validate Manually
```bash
# Test change creation
echo '{"title":"test","slug":"test-slug"}' | task-mcp change.open

# Test archive
echo '{"slug":"test-slug"}' | task-mcp change.archive
```

### Check System Resources
```bash
# Disk space
df -h

# Memory usage
free -h

# Process status
ps aux | grep -E "(task-mcp|node)"
```

## Getting Help

### Log Collection
```bash
# Enable verbose logging
export TASK_MCP_VERBOSE=true

# Collect logs for support
task-mcp --stdio 2>&1 | tee task-mcp-debug.log
```

### Support Information to Include
1. Error messages (full output)
2. Commands executed
3. System information (OS, Node version)
4. Configuration files (sanitized)
5. Debug logs (if available)

### Community Resources
- GitHub Issues: Report bugs and request features
- Documentation: Check for latest updates
- Examples: Reference implementation patterns

## Prevention Checklist

### Before Starting Work
- [ ] Verify MCP server is running
- [ ] Check for existing changes with similar slugs
- [ ] Validate input parameters
- [ ] Set appropriate TTL

### During Development
- [ ] Use resource URIs for content access
- [ ] Keep tool responses compact
- [ ] Test schema validation locally
- [ ] Monitor token usage

### Before Archiving
- [ ] Run full test suite
- [ ] Validate all required files exist
- [ ] Check CI pipeline status
- [ ] Review change for completeness

### Regular Maintenance
- [ ] Archive completed changes promptly
- [ ] Clean up expired lock files
- [ ] Update documentation as needed
- [ ] Monitor system performance