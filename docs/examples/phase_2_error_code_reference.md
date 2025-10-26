# Phase 2 Error Code Reference

_Comprehensive reference for all EBADSHAPE_* and EARCHIVED_* error codes with troubleshooting guides_

Last updated: 2025-10-24

## Table of Contents

1. [EBADSHAPE_* Error Codes](#ebadshape_-error-codes)
2. [EARCHIVED_* Error Codes](#earchived_-error-codes)
3. [Error Handling Patterns](#error-handling-patterns)
4. [Troubleshooting Guides](#troubleshooting-guides)
5. [Error Recovery Strategies](#error-recovery-strategies)

---

## EBADSHAPE_* Error Codes

Change structure validation errors that indicate issues with the change directory structure, content, or security violations.

### File Existence Errors

#### EBADSHAPE_PROPOSAL_MISSING

**Severity:** critical  
**Message:** `proposal.md file is missing`  
**Hint:** `Create proposal.md with change description and rationale`

**Description:**
The required `proposal.md` file is missing from the change directory. This file contains the change proposal and rationale.

**Common Causes:**
- Change directory created manually without proper scaffolding
- File deleted accidentally
- File name misspelled (e.g., `proposal.txt` instead of `proposal.md`)

**Solutions:**

```bash
# Create a basic proposal file
cat > openspec/changes/your-slug/proposal.md << 'EOF'
# Change: Your Change Title

**Slug:** `your-slug`  
**Date:** $(date +%Y-%m-%d)  
**Owner:** your-name  
**Type:** Feature

## Why
Describe the rationale for this change.

## What Changes
- [ ] **Implementation**: Core functionality
- [ ] **Testing**: Test coverage
- [ ] **Documentation**: Update docs

## Success Criteria
- [ ] Feature works as expected
- [ ] Tests pass
- [ ] Documentation updated
EOF
```

```typescript
// Programmatic creation
import { promises as fs } from 'fs';
import path from 'path';

async function createProposal(changePath: string, title: string, rationale: string) {
  const proposalContent = `# Change: ${title}

**Slug:** \`${path.basename(changePath)}\`  
**Date:** ${new Date().toISOString().split('T')[0]}  
**Owner:** ${process.env.USER || 'unknown'}  
**Type:** Feature

## Why
${rationale}

## What Changes
- [ ] **Implementation**: Core functionality for ${title}
- [ ] **Testing**: Comprehensive test coverage
- [ ] **Documentation**: Update relevant documentation

## Success Criteria
- [ ] Feature works as expected
- [ ] Tests pass
- [ ] Documentation updated
`;

  await fs.writeFile(path.join(changePath, 'proposal.md'), proposalContent);
}
```

#### EBADSHAPE_TASKS_MISSING

**Severity:** critical  
**Message:** `tasks.md file is missing`  
**Hint:** `Create tasks.md with implementation tasks`

**Description:**
The required `tasks.md` file is missing from the change directory. This file contains the task breakdown and implementation plan.

**Common Causes:**
- Change directory created manually without proper scaffolding
- File deleted accidentally
- File name misspelled

**Solutions:**

```bash
# Create a basic tasks file
cat > openspec/changes/your-slug/tasks.md << 'EOF'
# Implementation Tasks

## Phase 1: Planning
- [ ] Review and approve proposal
- [ ] Create detailed specifications
- [ ] Set up development environment

## Phase 2: Implementation
- [ ] Implement core functionality
- [ ] Write unit tests
- [ ] Write integration tests

## Phase 3: Testing
- [ ] Run test suite
- [ ] Perform manual testing
- [ ] Fix any issues found

## Phase 4: Documentation
- [ ] Update API documentation
- [ ] Write user guide
- [ ] Update changelog

## Phase 5: Release
- [ ] Code review
- [ ] Merge to main branch
- [ ] Deploy to production
EOF
```

#### EBADSHAPE_SPECS_MISSING

**Severity:** high  
**Message:** `specs/ directory is missing`  
**Hint:** `Create specs/ directory with specification files`

**Description:**
The optional but expected `specs/` directory is missing from the change directory. This directory should contain detailed specifications.

**Common Causes:**
- Change directory created manually
- Specs directory not needed for simple changes

**Solutions:**

```bash
# Create specs directory with basic structure
mkdir -p openspec/changes/your-slug/specs
cat > openspec/changes/your-slug/specs/README.md << 'EOF'
# Specifications

This directory contains detailed specifications for the change.

## Files
- `api.md` - API specifications
- `database.md` - Database schema changes
- `ui.md` - UI/UX specifications
EOF
```

#### EBADSHAPE_DIRECTORY_INVALID

**Severity:** critical  
**Message:** `Change path is not a valid directory`  
**Hint:** `Ensure path points to a valid directory`

**Description:**
The specified path is not a valid directory or does not exist.

**Common Causes:**
- Path typo
- Directory deleted
- Path points to a file instead of directory
- Insufficient permissions

**Solutions:**

```bash
# Check if directory exists
if [ -d "openspec/changes/your-slug" ]; then
  echo "Directory exists"
else
  echo "Directory does not exist"
  mkdir -p "openspec/changes/your-slug"
fi

# Check path permissions
ls -la openspec/changes/your-slug
```

```typescript
// Programmatic check and creation
import { promises as fs } from 'fs';
import path from 'path';

async function ensureChangeDirectory(changePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(changePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${changePath}`);
    }
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Directory doesn't exist, create it
      await fs.mkdir(changePath, { recursive: true });
      return true;
    }
    throw error;
  }
}
```

### Content Validation Errors

#### EBADSHAPE_PROPOSAL_INVALID

**Severity:** medium  
**Message:** `Proposal structure or content issues`  
**Hint:** `Fix proposal structure and content`

**Description:**
The `proposal.md` file exists but has structural or content issues.

**Common Causes:**
- Empty file
- Invalid markdown syntax
- Missing required sections
- Binary content in text file

**Solutions:**

```bash
# Validate proposal structure
validate_proposal() {
  local file="$1"
  
  # Check if file is empty
  if [ ! -s "$file" ]; then
    echo "Error: Proposal file is empty"
    return 1
  fi
  
  # Check for required sections
  local required_sections=("Why" "What Changes" "Success Criteria")
  for section in "${required_sections[@]}"; do
    if ! grep -q "^## $section" "$file"; then
      echo "Error: Missing required section: $section"
      return 1
    fi
  done
  
  echo "Proposal structure is valid"
  return 0
}

validate_proposal "openspec/changes/your-slug/proposal.md"
```

```typescript
// Programmatic validation
import { promises as fs } from 'fs';

interface ProposalValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

async function validateProposal(filePath: string): Promise<ProposalValidationResult> {
  const result: ProposalValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Check if empty
    if (!content.trim()) {
      result.isValid = false;
      result.errors.push('Proposal file is empty');
      return result;
    }
    
    // Check for required sections
    const requiredSections = ['Why', 'What Changes', 'Success Criteria'];
    for (const section of requiredSections) {
      if (!content.includes(`## ${section}`)) {
        result.isValid = false;
        result.errors.push(`Missing required section: ${section}`);
      }
    }
    
    // Check for common issues
    if (content.includes('TODO:')) {
      result.warnings.push('Proposal contains TODO comments');
    }
    
  } catch (error) {
    result.isValid = false;
    result.errors.push(`Failed to read proposal: ${error}`);
  }
  
  return result;
}
```

#### EBADSHAPE_TASKS_INVALID

**Severity:** medium  
**Message:** `Tasks structure or format issues`  
**Hint:** `Fix tasks structure and ensure proper format`

**Description:**
The `tasks.md` file exists but has structural or formatting issues.

**Common Causes:**
- Empty file
- No recognizable task list format
- Invalid markdown syntax
- Binary content

**Solutions:**

```bash
# Validate tasks structure
validate_tasks() {
  local file="$1"
  
  # Check if file is empty
  if [ ! -s "$file" ]; then
    echo "Error: Tasks file is empty"
    return 1
  fi
  
  # Check for task list items
  if ! grep -q "\- \[ \]" "$file" && ! grep -q "\- \[x\]" "$file"; then
    echo "Error: No task list items found"
    return 1
  fi
  
  echo "Tasks structure is valid"
  return 0
}

validate_tasks "openspec/changes/your-slug/tasks.md"
```

#### EBADSHAPE_CONTENT_EMPTY

**Severity:** medium  
**Message:** `File is empty`  
**Hint:** `Add meaningful content to the file`

**Description:**
A required file exists but is empty.

**Solutions:**

```bash
# Check and fix empty files
fix_empty_files() {
  local change_dir="$1"
  
  for file in "$change_dir/proposal.md" "$change_dir/tasks.md"; do
    if [ -f "$file" ] && [ ! -s "$file" ]; then
      echo "Fixing empty file: $file"
      
      if [[ "$file" == *"proposal.md" ]]; then
        cat > "$file" << 'EOF'
# Change Proposal

**Date:** $(date +%Y-%m-%d)  
**Owner:** $(whoami)  

## Why
TODO: Add rationale for this change

## What Changes
- [ ] TODO: List implementation tasks

## Success Criteria
- [ ] TODO: Define success criteria
EOF
      elif [[ "$file" == *"tasks.md" ]]; then
        cat > "$file" << 'EOF'
# Implementation Tasks

## Phase 1: Planning
- [ ] Review requirements
- [ ] Create implementation plan

## Phase 2: Implementation
- [ ] Implement core functionality
- [ ] Write tests

## Phase 3: Testing & Review
- [ ] Run test suite
- [ ] Code review
- [ ] Documentation updates
EOF
      fi
    fi
  done
}

fix_empty_files "openspec/changes/your-slug"
```

#### EBADSHAPE_CONTENT_BINARY

**Severity:** high  
**Message:** `Binary content detected in text file`  
**Hint:** `Ensure file contains valid text content`

**Description:**
A file that should contain text content contains binary data.

**Solutions:**

```bash
# Check for binary files
check_binary_files() {
  local change_dir="$1"
  
  for file in "$change_dir"/*.md; do
    if [ -f "$file" ]; then
      # Check if file contains binary content
      if file --mime "$file" | grep -q "binary"; then
        echo "Error: Binary content detected in: $file"
        echo "Please replace with text content"
      fi
    fi
  done
}

check_binary_files "openspec/changes/your-slug"
```

#### EBADSHAPE_TASKS_NO_STRUCTURE

**Severity:** medium  
**Message:** `Tasks have no recognizable list format`  
**Hint:** `Add tasks in proper markdown list format`

**Description:**
The tasks file exists but doesn't contain recognizable task list items.

**Solutions:**

```bash
# Fix tasks with no structure
fix_tasks_structure() {
  local file="$1"
  
  if [ -f "$file" ]; then
    # Check if file has task list items
    if ! grep -q "\- \[ \]" "$file" && ! grep -q "\- \[x\]" "$file"; then
      echo "Adding task structure to: $file"
      
      # Add basic task structure at the beginning
      temp_file=$(mktemp)
      cat > "$temp_file" << 'EOF'
# Implementation Tasks

## Phase 1: Planning
- [ ] Review requirements and specifications
- [ ] Set up development environment

## Phase 2: Implementation
- [ ] Implement core functionality
- [ ] Write unit tests
- [ ] Write integration tests

## Phase 3: Testing & Review
- [ ] Run complete test suite
- [ ] Perform manual testing
- [ ] Code review and feedback

## Phase 4: Documentation
- [ ] Update technical documentation
- [ ] Write user documentation
- [ ] Update changelog

## Phase 5: Release
- [ ] Final testing and validation
- [ ] Deploy to staging
- [ ] Deploy to production

---

EOF
      
      # Append original content if it exists
      if [ -s "$file" ]; then
        cat "$file" >> "$temp_file"
      fi
      
      mv "$temp_file" "$file"
    fi
  fi
}

fix_tasks_structure "openspec/changes/your-slug/tasks.md"
```

#### EBADSHAPE_DELTA_INVALID

**Severity:** medium  
**Message:** `Delta file format or syntax errors`  
**Hint:** `Fix delta file format and syntax`

**Description:**
Delta files in the specs directory have format or syntax errors.

**Solutions:**

```bash
# Validate delta files
validate_delta_files() {
  local specs_dir="$1"
  
  for file in "$specs_dir"/*.json "$specs_dir"/*.yaml "$specs_dir"/*.yml; do
    if [ -f "$file" ]; then
      echo "Validating: $file"
      
      case "$file" in
        *.json)
          if ! jq empty "$file" 2>/dev/null; then
            echo "Error: Invalid JSON in $file"
            echo "Run: jq '.' \"$file\" to see syntax errors"
          fi
          ;;
        *.yaml|*.yml)
          if ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
            echo "Error: Invalid YAML in $file"
            echo "Run: python3 -c \"import yaml; print(yaml.safe_load(open('$file')))\" to see syntax errors"
          fi
          ;;
      esac
    fi
  done
}

validate_delta_files "openspec/changes/your-slug/specs"
```

### Security Errors

#### EBADSHAPE_SECURITY_VIOLATION

**Severity:** critical  
**Message:** `Security issues detected (XSS, injection, etc.)`  
**Hint:** `Remove or sanitize security-sensitive content`

**Description:**
Security violations detected in file content, such as XSS patterns, injection attempts, or other security threats.

**Common Causes:**
- HTML script tags in markdown files
- SQL injection patterns
- Command injection attempts
- Suspicious JavaScript code

**Solutions:**

```bash
# Check for security violations
check_security_violations() {
  local file="$1"
  
  # Check for common security issues
  local patterns=(
    "<script"
    "javascript:"
    "eval("
    "document.cookie"
    "SELECT.*FROM"
    "DROP TABLE"
    "rm -rf"
    "\$\("
    "`.*`"
  )
  
  for pattern in "${patterns[@]}"; do
    if grep -i "$pattern" "$file" >/dev/null 2>&1; then
      echo "Security violation detected in $file: $pattern"
      echo "Line numbers:"
      grep -n "$pattern" "$file"
    fi
  done
}

# Fix common security issues
fix_security_violations() {
  local file="$1"
  
  # Escape HTML tags
  sed -i 's/<script[^>]*>/\\<script\\>/g' "$file"
  sed -i 's/<\/script>/\\<\\/script\\>/g' "$file"
  
  # Escape code blocks that might be dangerous
  sed -i 's/`rm -rf/`rm -rf/g' "$file"
  sed -i 's/\$(/\\$(/g' "$file"
}

check_security_violations "openspec/changes/your-slug/proposal.md"
```

#### EBADSHAPE_PATH_TRAVERSAL

**Severity:** critical  
**Message:** `Path traversal attempts detected`  
**Hint:** `Use safe file paths without traversal`

**Description:**
Path traversal attempts detected in file paths or references.

**Solutions:**

```bash
# Check for path traversal patterns
check_path_traversal() {
  local change_dir="$1"
  
  # Look for path traversal patterns in all files
  find "$change_dir" -type f -exec grep -l "\.\./" {} \; | while read file; do
    echo "Path traversal detected in: $file"
    grep -n "\.\./" "$file"
  done
}

# Fix path traversal issues
fix_path_traversal() {
  local file="$1"
  
  # Replace relative path traversal with absolute paths
  sed -i 's|\.\./openspec/|openspec/|g' "$file"
  sed -i 's|\.\.\/|\/|g' "$file"
}

check_path_traversal "openspec/changes/your-slug"
```

#### EBADSHAPE_SIZE_EXCEEDED

**Severity:** high  
**Message:** `File exceeds size limits`  
**Hint:** `Reduce file size or increase limits`

**Description:**
File size exceeds configured limits (default: 1MB).

**Solutions:**

```bash
# Check file sizes
check_file_sizes() {
  local change_dir="$1"
  local max_size=$((1024 * 1024)) # 1MB
  
  find "$change_dir" -type f -exec du -b {} \; | while read size file; do
    if [ "$size" -gt "$max_size" ]; then
      echo "File too large: $file (${size} bytes, max: ${max_size} bytes)"
      echo "Size in MB: $(echo "scale=2; $size / 1024 / 1024" | bc)"
    fi
  done
}

# Compress large files
compress_large_files() {
  local change_dir="$1"
  local max_size=$((1024 * 1024)) # 1MB
  
  find "$change_dir" -type f -exec du -b {} \; | while read size file; do
    if [ "$size" -gt "$max_size" ]; then
      echo "Compressing large file: $file"
      gzip -c "$file" > "$file.gz"
      echo "Compressed to: $file.gz ($(du -b "$file.gz" | cut -f1) bytes)"
    fi
  done
}

check_file_sizes "openspec/changes/your-slug"
```

### System Errors

#### EBADSHAPE_IO_ERROR

**Severity:** high  
**Message:** `File system I/O errors`  
**Hint:** `Check file system permissions and disk space`

**Description:**
File system I/O errors during validation.

**Solutions:**

```bash
# Check file system health
check_filesystem_health() {
  local change_dir="$1"
  
  # Check if directory is accessible
  if [ ! -r "$change_dir" ] || [ ! -x "$change_dir" ]; then
    echo "Error: Cannot access directory: $change_dir"
    echo "Check permissions:"
    ls -ld "$change_dir"
    return 1
  fi
  
  # Check disk space
  df -h "$(dirname "$change_dir")"
  
  # Check for file system errors
  local mount_point=$(df --output=target "$change_dir" | tail -1)
  if command -v fsck >/dev/null 2>&1; then
    echo "Consider running: sudo fsck -f $mount_point"
  fi
}

check_filesystem_health "openspec/changes/your-slug"
```

#### EBADSHAPE_PERMISSION_DENIED

**Severity:** high  
**Message:** `Permission/access denied errors`  
**Hint:** `Check file permissions and user access`

**Solutions:**

```bash
# Fix permission issues
fix_permissions() {
  local change_dir="$1"
  local user=$(whoami)
  
  # Check current permissions
  echo "Current permissions:"
  ls -la "$change_dir"
  
  # Fix directory permissions
  chmod 755 "$change_dir"
  
  # Fix file permissions
  find "$change_dir" -type f -name "*.md" -exec chmod 644 {} \;
  
  # Change ownership if needed
  if [ "$(stat -c %U "$change_dir")" != "$user" ]; then
    echo "Changing ownership to $user"
    sudo chown -R "$user:$user" "$change_dir"
  fi
  
  echo "Fixed permissions:"
  ls -la "$change_dir"
}

fix_permissions "openspec/changes/your-slug"
```

#### EBADSHAPE_UNKNOWN_ERROR

**Severity:** medium  
**Message:** `Unexpected validation errors`  
**Hint:** `Report issue with system details`

**Solutions:**

```bash
# Collect system information for debugging
collect_debug_info() {
  local change_dir="$1"
  
  echo "=== Debug Information ==="
  echo "Date: $(date)"
  echo "User: $(whoami)"
  echo "Working Directory: $(pwd)"
  echo "Change Directory: $change_dir"
  echo ""
  
  echo "=== System Information ==="
  uname -a
  echo ""
  
  echo "=== Directory Contents ==="
  ls -la "$change_dir"
  echo ""
  
  echo "=== File Details ==="
  find "$change_dir" -type f -exec file {} \;
  echo ""
  
  echo "=== Disk Space ==="
  df -h "$(dirname "$change_dir")"
  echo ""
  
  echo "=== Permissions ==="
  getfacl "$change_dir" 2>/dev/null || ls -ld "$change_dir"
}

collect_debug_info "openspec/changes/your-slug"
```

---

## EARCHIVED_* Error Codes

Archive operation errors that occur during the change archiving process.

### Archive Operation Errors

#### EARCHIVED_ALREADY_ARCHIVED

**Severity:** low  
**Message:** `Change is already archived`  
**Hint:** `Use existing receipt or specify different change`

**Description:**
Attempted to archive a change that has already been archived.

**Solutions:**

```bash
# Check if change is already archived
check_archived_status() {
  local slug="$1"
  local receipt_path="openspec/changes/$slug/receipt.json"
  
  if [ -f "$receipt_path" ]; then
    echo "Change $slug is already archived"
    echo "Archived at: $(jq -r '.archivedAt' "$receipt_path")"
    echo "Commits: $(jq -r '.commits | length' "$receipt_path")"
    return 0
  else
    echo "Change $slug is not archived"
    return 1
  fi
}

# View existing receipt
view_receipt() {
  local slug="$1"
  local receipt_path="openspec/changes/$slug/receipt.json"
  
  if [ -f "$receipt_path" ]; then
    echo "=== Receipt for $slug ==="
    jq '.' "$receipt_path"
  else
    echo "No receipt found for $slug"
  fi
}

check_archived_status "your-slug"
view_receipt "your-slug"
```

#### EARCHIVED_LOCK_FAILED

**Severity:** high  
**Message:** `Failed to acquire change lock`  
**Hint:** `Check if change is being processed by another process`

**Description:**
Failed to acquire lock on the change directory, indicating another process is working on it.

**Solutions:**

```bash
# Check lock status
check_lock_status() {
  local slug="$1"
  local lock_path="openspec/changes/$slug/.lock"
  
  if [ -f "$lock_path" ]; then
    echo "Lock exists for $slug"
    echo "Lock details:"
    cat "$lock_path"
    
    # Check if lock is stale
    local lock_info=$(cat "$lock_path")
    local lock_time=$(echo "$lock_info" | jq -r '.since // 0')
    local current_time=$(date +%s000)
    local lock_age=$((current_time - lock_time))
    
    echo "Lock age: $((lock_age / 1000)) seconds"
    
    # Remove stale lock (older than 1 hour)
    if [ $lock_age -gt 3600000 ]; then
      echo "Lock appears to be stale, removing..."
      rm "$lock_path"
      echo "Stale lock removed"
    else
      echo "Lock is active, please wait or contact lock owner"
    fi
  else
    echo "No lock found for $slug"
  fi
}

# Force remove lock (use with caution)
force_remove_lock() {
  local slug="$1"
  local lock_path="openspec/changes/$slug/.lock"
  
  if [ -f "$lock_path" ]; then
    echo "WARNING: Force removing lock for $slug"
    echo "This may interrupt another process"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      rm "$lock_path"
      echo "Lock removed"
    else
      echo "Operation cancelled"
    fi
  else
    echo "No lock to remove"
  fi
}

check_lock_status "your-slug"
```

#### EARCHIVED_VALIDATION_FAILED

**Severity:** high  
**Message:** `Change structure validation failed`  
**Hint:** `Fix validation errors before archiving`

**Description:**
Change structure validation failed during archive process.

**Solutions:**

```bash
# Run validation and fix issues
validate_and_fix() {
  local slug="$1"
  
  echo "Validating change: $slug"
  
  # Run validation
  if ! openspec validate "$slug"; then
    echo "Validation failed, attempting to fix common issues..."
    
    local change_dir="openspec/changes/$slug"
    
    # Fix missing files
    if [ ! -f "$change_dir/proposal.md" ]; then
      echo "Creating missing proposal.md"
      create_basic_proposal "$change_dir"
    fi
    
    if [ ! -f "$change_dir/tasks.md" ]; then
      echo "Creating missing tasks.md"
      create_basic_tasks "$change_dir"
    fi
    
    # Fix empty files
    fix_empty_files "$change_dir"
    
    # Re-validate
    echo "Re-validating after fixes..."
    openspec validate "$slug"
  else
    echo "Validation passed"
  fi
}

create_basic_proposal() {
  local dir="$1"
  cat > "$dir/proposal.md" << 'EOF'
# Change Proposal

**Date:** $(date +%Y-%m-%d)  
**Owner:** $(whoami)  

## Why
TODO: Add rationale for this change

## What Changes
- [ ] TODO: List implementation tasks

## Success Criteria
- [ ] TODO: Define success criteria
EOF
}

create_basic_tasks() {
  local dir="$1"
  cat > "$dir/tasks.md" << 'EOF'
# Implementation Tasks

## Phase 1: Planning
- [ ] Review requirements
- [ ] Create implementation plan

## Phase 2: Implementation
- [ ] Implement core functionality
- [ ] Write tests

## Phase 3: Testing & Review
- [ ] Run test suite
- [ ] Code review
- [ ] Documentation updates
EOF
}

validate_and_fix "your-slug"
```

#### EARCHIVED_COMMAND_FAILED

**Severity:** critical  
**Message:** `Archive command execution failed`  
**Hint:** `Check OpenSpec CLI installation and configuration`

**Description:**
The underlying OpenSpec archive command failed to execute.

**Solutions:**

```bash
# Check OpenSpec CLI setup
check_openspec_setup() {
  echo "=== OpenSpec CLI Check ==="
  
  # Check if openspec is installed
  if ! command -v openspec >/dev/null 2>&1; then
    echo "Error: OpenSpec CLI is not installed"
    echo "Install with: npm install -g @openspec/openspec-cli"
    return 1
  fi
  
  echo "OpenSpec CLI found: $(which openspec)"
  echo "Version: $(openspec --version)"
  
  # Check if we're in a git repository
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "Error: Not in a git repository"
    echo "OpenSpec requires a git repository"
    return 1
  fi
  
  echo "Git repository: $(git rev-parse --show-toplevel)"
  
  # Check openspec directory structure
  if [ ! -d "openspec" ]; then
    echo "Error: openspec directory not found"
    echo "Create with: mkdir -p openspec/changes"
    return 1
  fi
  
  echo "OpenSpec directory structure found"
  
  # Test openspec command
  echo "Testing OpenSpec command..."
  if openspec list >/dev/null 2>&1; then
    echo "OpenSpec command works correctly"
    return 0
  else
    echo "Error: OpenSpec command failed"
    echo "Check configuration and permissions"
    return 1
  fi
}

# Fix common OpenSpec issues
fix_openspec_issues() {
  echo "Attempting to fix OpenSpec issues..."
  
  # Create openspec directory structure
  mkdir -p openspec/changes
  mkdir -p openspec/specs
  
  # Initialize git if needed
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "Initializing git repository..."
    git init
  fi
  
  # Create basic openspec config if missing
  if [ ! -f "openspec.config.json" ]; then
    cat > openspec.config.json << 'EOF'
{
  "version": "1.0",
  "changesDirectory": "openspec/changes",
  "specsDirectory": "openspec/specs",
  "archiveDirectory": "openspec/archived"
}
EOF
    echo "Created openspec.config.json"
  fi
  
  echo "OpenSpec setup complete"
}

check_openspec_setup
if [ $? -ne 0 ]; then
  fix_openspec_issues
fi
```

#### EARCHIVED_RECEIPT_FAILED

**Severity:** medium  
**Message:** `Failed to generate receipt`  
**Hint:** `Check git repository status and permissions`

**Description:**
Failed to generate or write receipt after successful archive.

**Solutions:**

```bash
# Check receipt generation issues
check_receipt_generation() {
  local slug="$1"
  local change_dir="openspec/changes/$slug"
  local receipt_path="$change_dir/receipt.json"
  
  echo "Checking receipt generation for: $slug"
  
  # Check git repository status
  echo "Git repository status:"
  git status --porcelain
  
  # Check git history
  echo "Recent commits:"
  git log --oneline -5
  
  # Check file permissions
  echo "Directory permissions:"
  ls -la "$change_dir"
  
  # Try manual receipt generation
  echo "Attempting manual receipt generation..."
  
  local archived_at=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  local commits=$(git log --oneline --max-count=10 -- "$change_dir" | wc -l)
  local files=$(find "$change_dir" -name "*.md" -o -name "*.ts" -o -name "*.js" | wc -l)
  
  cat > "$receipt_path" << EOF
{
  "slug": "$slug",
  "commits": ["manual-generation"],
  "filesTouched": [],
  "tests": {
    "added": 0,
    "updated": 0,
    "passed": false
  },
  "archivedAt": "$archived_at",
  "actor": {
    "type": "process",
    "name": "manual-fix",
    "model": "task-mcp-server"
  },
  "toolVersions": {
    "taskMcp": "2.1.0",
    "openspecCli": "0.13.0",
    "change.archive": "1.0.0"
  }
}
EOF
  
  echo "Manual receipt created: $receipt_path"
  echo "Content:"
  cat "$receipt_path"
}

check_receipt_generation "your-slug"
```

---

## Error Handling Patterns

### Structured Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // EBADSHAPE_* or EARCHIVED_*
    message: string;        // Human-readable description
    hint: string;          // Actionable guidance
    severity: 'low' | 'medium' | 'high' | 'critical';
    path?: string;         // File path if applicable
    details?: any;         // Additional context
  };
}
```

### Error Classification

| Severity | Action Required | Examples |
|----------|----------------|----------|
| **critical** | Immediate action required | Missing required files, security violations |
| **high** | Fix before proceeding | Permission issues, I/O errors |
| **medium** | Fix recommended | Content structure issues, format errors |
| **low** | Informational | Already archived, optional warnings |

### Error Recovery Workflow

```typescript
class ErrorHandler {
  async handleValidationError(error: ValidationError): Promise<RecoveryAction> {
    switch (error.code) {
      case 'EBADSHAPE_PROPOSAL_MISSING':
        return RecoveryAction.CREATE_PROPOSAL;
        
      case 'EBADSHAPE_TASKS_MISSING':
        return RecoveryAction.CREATE_TASKS;
        
      case 'EBADSHAPE_SECURITY_VIOLATION':
        return RecoveryAction.SANITIZE_CONTENT;
        
      case 'EBADSHAPE_PERMISSION_DENIED':
        return RecoveryAction.FIX_PERMISSIONS;
        
      default:
        return RecoveryAction.MANUAL_INTERVENTION;
    }
  }
  
  async executeRecovery(action: RecoveryAction, context: ErrorContext): Promise<boolean> {
    switch (action) {
      case RecoveryAction.CREATE_PROPOSAL:
        await this.createProposal(context.slug);
        return true;
        
      case RecoveryAction.CREATE_TASKS:
        await this.createTasks(context.slug);
        return true;
        
      case RecoveryAction.SANITIZE_CONTENT:
        await this.sanitizeContent(context.path);
        return true;
        
      case RecoveryAction.FIX_PERMISSIONS:
        await this.fixPermissions(context.path);
        return true;
        
      default:
        return false;
    }
  }
}
```

---

## Troubleshooting Guides

### Common Validation Workflows

#### 1. Complete Change Validation

```bash
#!/bin/bash
# validate-change.sh - Complete validation and fix workflow

set -e

SLUG="$1"
if [ -z "$SLUG" ]; then
  echo "Usage: $0 <change-slug>"
  exit 1
fi

CHANGE_DIR="openspec/changes/$SLUG"

echo "=== Validating Change: $SLUG ==="

# Check if change directory exists
if [ ! -d "$CHANGE_DIR" ]; then
  echo "Error: Change directory does not exist: $CHANGE_DIR"
  exit 1
fi

# Run OpenSpec validation
echo "Running OpenSpec validation..."
if openspec validate "$SLUG"; then
  echo "✓ Validation passed"
else
  echo "✗ Validation failed, attempting fixes..."
  
  # Fix common issues
  echo "Checking for missing files..."
  if [ ! -f "$CHANGE_DIR/proposal.md" ]; then
    echo "Creating proposal.md..."
    create_basic_proposal "$CHANGE_DIR"
  fi
  
  if [ ! -f "$CHANGE_DIR/tasks.md" ]; then
    echo "Creating tasks.md..."
    create_basic_tasks "$CHANGE_DIR"
  fi
  
  # Fix empty files
  echo "Checking for empty files..."
  find "$CHANGE_DIR" -name "*.md" -empty -exec echo "Fixing empty file: {}" \; -exec rm {} \;
  create_basic_proposal "$CHANGE_DIR"
  create_basic_tasks "$CHANGE_DIR"
  
  # Re-validate
  echo "Re-validating after fixes..."
  if openspec validate "$SLUG"; then
    echo "✓ Validation passed after fixes"
  else
    echo "✗ Validation still failed"
    echo "Manual intervention required"
    exit 1
  fi
fi

echo "=== Validation Complete ==="
```

#### 2. Archive Troubleshooting

```bash
#!/bin/bash
# archive-troubleshoot.sh - Archive troubleshooting script

set -e

SLUG="$1"
if [ -z "$SLUG" ]; then
  echo "Usage: $0 <change-slug>"
  exit 1
fi

echo "=== Archive Troubleshooting for: $SLUG ==="

# 1. Check prerequisites
echo "1. Checking prerequisites..."
check_prerequisites "$SLUG"

# 2. Check lock status
echo "2. Checking lock status..."
check_lock_status "$SLUG"

# 3. Run validation
echo "3. Running validation..."
if ! openspec validate "$SLUG"; then
  echo "Validation failed - fix validation issues first"
  exit 1
fi

# 4. Check OpenSpec CLI
echo "4. Checking OpenSpec CLI..."
check_openspec_setup

# 5. Attempt archive
echo "5. Attempting archive..."
if openspec archive "$SLUG"; then
  echo "✓ Archive successful"
  
  # Verify receipt
  if [ -f "openspec/changes/$SLUG/receipt.json" ]; then
    echo "✓ Receipt generated"
    echo "Receipt summary:"
    jq -r '"Commits: \(.commits | length), Files: \(.filesTouched | length), Tests Passed: \(.tests.passed)"' "openspec/changes/$SLUG/receipt.json"
  else
    echo "⚠ Receipt not found"
  fi
else
  echo "✗ Archive failed"
  echo "Check logs above for specific error"
  exit 1
fi

echo "=== Archive Troubleshooting Complete ==="
```

#### 3. Security Audit

```bash
#!/bin/bash
# security-audit.sh - Security audit for OpenSpec changes

SLUG="$1"
if [ -z "$SLUG" ]; then
  echo "Usage: $0 <change-slug>"
  exit 1
fi

CHANGE_DIR="openspec/changes/$SLUG"

echo "=== Security Audit for: $SLUG ==="

# Check for path traversal
echo "1. Checking for path traversal..."
if find "$CHANGE_DIR" -type f -exec grep -l "\.\./" {} \; | head -5; then
  echo "⚠ Path traversal patterns found"
else
  echo "✓ No path traversal patterns"
fi

# Check for security violations
echo "2. Checking for security violations..."
security_patterns=(
  "<script"
  "javascript:"
  "eval("
  "document\.cookie"
  "SELECT.*FROM"
  "DROP TABLE"
  "rm -rf"
  "\$\("
)

vulnerabilities_found=false
for pattern in "${security_patterns[@]}"; do
  if find "$CHANGE_DIR" -type f -exec grep -i "$pattern" {} \; | head -3; then
    echo "⚠ Security pattern found: $pattern"
    vulnerabilities_found=true
  fi
done

if [ "$vulnerabilities_found" = false ]; then
  echo "✓ No obvious security violations"
fi

# Check file permissions
echo "3. Checking file permissions..."
if find "$CHANGE_DIR" -type f -perm /o+w | head -3; then
  echo "⚠ World-writable files found"
else
  echo "✓ No world-writable files"
fi

# Check for binary files
echo "4. Checking for binary files in text locations..."
if find "$CHANGE_DIR" -name "*.md" -exec file {} \; | grep -v "text"; then
  echo "⚠ Binary content found in markdown files"
else
  echo "✓ No binary content in text files"
fi

# Check file sizes
echo "5. Checking file sizes..."
large_files=$(find "$CHANGE_DIR" -size +1M -exec ls -lh {} \;)
if [ -n "$large_files" ]; then
  echo "⚠ Large files found:"
  echo "$large_files"
else
  echo "✓ No unusually large files"
fi

echo "=== Security Audit Complete ==="
```

---

## Error Recovery Strategies

### Automated Recovery

```typescript
class ErrorRecoveryService {
  async attemptRecovery(error: ValidationError, context: RecoveryContext): Promise<RecoveryResult> {
    const strategies = this.getRecoveryStrategies(error.code);
    
    for (const strategy of strategies) {
      try {
        const result = await this.executeStrategy(strategy, context);
        if (result.success) {
          return {
            success: true,
            strategy: strategy.name,
            message: `Recovery successful using ${strategy.name}`
          };
        }
      } catch (recoveryError) {
        console.warn(`Recovery strategy ${strategy.name} failed:`, recoveryError);
      }
    }
    
    return {
      success: false,
      message: 'All recovery strategies failed',
      requiresManualIntervention: true
    };
  }
  
  private getRecoveryStrategies(errorCode: string): RecoveryStrategy[] {
    const strategyMap: Record<string, RecoveryStrategy[]> = {
      'EBADSHAPE_PROPOSAL_MISSING': [
        { name: 'create-proposal', execute: this.createProposal.bind(this) }
      ],
      'EBADSHAPE_TASKS_MISSING': [
        { name: 'create-tasks', execute: this.createTasks.bind(this) }
      ],
      'EBADSHAPE_PERMISSION_DENIED': [
        { name: 'fix-permissions', execute: this.fixPermissions.bind(this) }
      ],
      'EBADSHAPE_CONTENT_EMPTY': [
        { name: 'populate-content', execute: this.populateContent.bind(this) }
      ],
      'EARCHIVED_LOCK_FAILED': [
        { name: 'wait-and-retry', execute: this.waitAndRetry.bind(this) },
        { name: 'remove-stale-lock', execute: this.removeStaleLock.bind(this) }
      ]
    };
    
    return strategyMap[errorCode] || [];
  }
}
```

### Manual Recovery Procedures

#### 1. Recover from Corrupted Change Directory

```bash
#!/bin/bash
# recover-corrupted-change.sh - Recover corrupted change directory

SLUG="$1"
BACKUP_DIR="$2"
CHANGE_DIR="openspec/changes/$SLUG"

if [ -z "$SLUG" ] || [ -z "$BACKUP_DIR" ]; then
  echo "Usage: $0 <change-slug> <backup-directory>"
  exit 1
fi

echo "=== Recovering Corrupted Change: $SLUG ==="

# 1. Backup current state
echo "1. Creating backup of current state..."
if [ -d "$CHANGE_DIR" ]; then
  cp -r "$CHANGE_DIR" "${CHANGE_DIR}.backup.$(date +%s)"
  echo "Backup created: ${CHANGE_DIR}.backup.$(date +%s)"
fi

# 2. Restore from backup if available
if [ -d "$BACKUP_DIR" ]; then
  echo "2. Restoring from backup..."
  rm -rf "$CHANGE_DIR"
  cp -r "$BACKUP_DIR" "$CHANGE_DIR"
  echo "Restored from backup"
else
  echo "2. Creating fresh change directory..."
  rm -rf "$CHANGE_DIR"
  mkdir -p "$CHANGE_DIR"
fi

# 3. Recreate required files
echo "3. Recreating required files..."
if [ ! -f "$CHANGE_DIR/proposal.md" ]; then
  create_basic_proposal "$CHANGE_DIR"
fi

if [ ! -f "$CHANGE_DIR/tasks.md" ]; then
  create_basic_tasks "$CHANGE_DIR"
fi

# 4. Validate recovered change
echo "4. Validating recovered change..."
if openspec validate "$SLUG"; then
  echo "✓ Change recovered successfully"
else
  echo "✗ Validation failed after recovery"
  echo "Manual intervention required"
  exit 1
fi

echo "=== Recovery Complete ==="
```

#### 2. Recover from Failed Archive

```bash
#!/bin/bash
# recover-failed-archive.sh - Recover from failed archive operation

SLUG="$1"
CHANGE_DIR="openspec/changes/$SLUG"

if [ -z "$SLUG" ]; then
  echo "Usage: $0 <change-slug>"
  exit 1
fi

echo "=== Recovering Failed Archive: $SLUG ==="

# 1. Check current state
echo "1. Checking current state..."
if [ -f "$CHANGE_DIR/receipt.json" ]; then
  echo "Receipt exists - checking validity..."
  if jq empty "$CHANGE_DIR/receipt.json" 2>/dev/null; then
    echo "✓ Valid receipt found - archive may have succeeded"
    exit 0
  else
    echo "Receipt is corrupted - removing..."
    rm "$CHANGE_DIR/receipt.json"
  fi
fi

# 2. Remove any locks
echo "2. Removing locks..."
if [ -f "$CHANGE_DIR/.lock" ]; then
  echo "Removing lock file..."
  rm "$CHANGE_DIR/.lock"
fi

# 3. Validate change structure
echo "3. Validating change structure..."
if ! openspec validate "$SLUG"; then
  echo "Validation failed - fixing issues..."
  # Run validation fix script
  ./validate-change.sh "$SLUG"
fi

# 4. Retry archive
echo "4. Retrying archive..."
if openspec archive "$SLUG"; then
  echo "✓ Archive successful on retry"
  
  # Verify receipt
  if [ -f "$CHANGE_DIR/receipt.json" ]; then
    echo "✓ Receipt generated successfully"
  else
    echo "⚠ Archive succeeded but no receipt generated"
  fi
else
  echo "✗ Archive failed on retry"
  echo "Manual investigation required"
  exit 1
fi

echo "=== Archive Recovery Complete ==="
```

### Prevention Strategies

#### 1. Pre-commit Validation

```bash
#!/bin/bash
# pre-commit-validate.sh - Pre-commit validation for OpenSpec changes

echo "=== Pre-commit Validation ==="

# Find all changed OpenSpec files
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep "openspec/changes/" || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "No OpenSpec changes to validate"
  exit 0
fi

# Extract unique change slugs
CHANGES=$(echo "$CHANGED_FILES" | cut -d'/' -f3 | sort -u)

VALIDATION_FAILED=false

for slug in $CHANGES; do
  echo "Validating change: $slug"
  
  if ! openspec validate "$slug"; then
    echo "✗ Validation failed for $slug"
    VALIDATION_FAILED=true
    
    # Show validation errors
    echo "Validation errors:"
    openspec validate "$slug" 2>&1 | grep -E "(EBADSHAPE_|EARCHIVED_)" || true
  else
    echo "✓ Validation passed for $slug"
  fi
done

if [ "$VALIDATION_FAILED" = true ]; then
  echo ""
  echo "Commit blocked due to validation failures"
  echo "Fix the issues and try again"
  exit 1
fi

echo "✓ All changes validated successfully"
exit 0
```

#### 2. Continuous Monitoring

```typescript
// monitoring/change-monitor.ts
export class ChangeMonitor {
  private metricsCollector: OpenSpecMetricsCollector;
  private alertService: AlertService;
  
  async monitorChanges(): Promise<void> {
    const changes = await this.getActiveChanges();
    
    for (const change of changes) {
      await this.monitorChange(change);
    }
  }
  
  private async monitorChange(change: ChangeInfo): Promise<void> {
    // Check for long-running changes
    if (this.isChangeStale(change)) {
      await this.alertService.sendAlert({
        type: 'stale-change',
        slug: change.slug,
        message: `Change ${change.slug} has been inactive for ${this.getInactiveDays(change)} days`,
        severity: 'medium'
      });
    }
    
    // Check for validation failures
    const validationResult = await this.validateChange(change.slug);
    if (!validationResult.isValid) {
      await this.alertService.sendAlert({
        type: 'validation-failure',
        slug: change.slug,
        message: `Validation failed for ${change.slug}: ${validationResult.errors.map(e => e.code).join(', ')}`,
        severity: 'high'
      });
    }
    
    // Check for security issues
    const securityResult = await this.securityScan(change.slug);
    if (securityResult.issues.length > 0) {
      await this.alertService.sendAlert({
        type: 'security-issue',
        slug: change.slug,
        message: `Security issues found in ${change.slug}: ${securityResult.issues.map(i => i.type).join(', ')}`,
        severity: 'critical'
      });
    }
  }
}
```

---

*Error Code Reference completed: 2025-10-24*  
*Next Review: After Phase 3 implementation*