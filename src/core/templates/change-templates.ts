import { promises as fs } from 'fs';
import * as path from 'path';
import { validate_slug, atomic_lock, AtomicLockError } from '../../utils/core-utilities.js';

export interface ChangeTemplateContext {
  title: string;
  slug: string;
  rationale?: string;
  owner?: string;
  ttl?: number;
}

export interface ChangeTemplate {
  type: 'feature' | 'bugfix' | 'chore';
  generateProposal: (context: ChangeTemplateContext) => string;
  generateTasks: (context: ChangeTemplateContext) => string;
  generateSpecs: (context: ChangeTemplateContext) => Promise<Record<string, string>>;
}

/**
 * Security: Validates that a path is safe and within the allowed base directory
 * Enhanced to protect against symlink-based path traversal attacks
 */
export async function validateSecurePath(basePath: string, targetPath: string): Promise<void> {
  // Resolve base path to absolute path
  const resolvedBase = path.resolve(basePath);
  
  // Resolve the target path and then resolve any symlinks to get the real path
  const resolvedTarget = path.resolve(basePath, targetPath);
  
  try {
    // Use fs.realpath to resolve all symbolic links in the path
    const realTargetPath = await fs.realpath(resolvedTarget);
    const realBasePath = await fs.realpath(resolvedBase);
    
    // Ensure the resolved target path is still within the resolved base path
    if (!realTargetPath.startsWith(realBasePath)) {
      throw new Error(`Path traversal detected via symlinks: ${targetPath} resolves to ${realTargetPath} which escapes base directory ${realBasePath}`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Path doesn't exist - validate directory components that do exist
      // This catches cases where symlinks in the path chain point outside the base directory
      
      // First check the basic logical path traversal
      if (!resolvedTarget.startsWith(resolvedBase)) {
        throw new Error(`Path traversal detected: ${targetPath} escapes base directory ${basePath}`);
      }
      
      // Now check each directory component for symlink traversal
      const pathParts = targetPath.split(path.sep);
      let currentPath = basePath;
      
      for (const part of pathParts) {
        if (!part || part === '.') continue;
        if (part === '..') {
          currentPath = path.dirname(currentPath);
          continue;
        }
        
        const testPath = path.join(currentPath, part);
        
        try {
          const realTestPath = await fs.realpath(testPath);
          const realCurrentPath = await fs.realpath(currentPath);
          
          if (!realTestPath.startsWith(realCurrentPath)) {
            throw new Error(`Path traversal detected via symlinks in path component: ${part} resolves to ${realTestPath} which escapes ${realCurrentPath}`);
          }
        } catch (componentError: any) {
          // If this component doesn't exist, we can't validate it further
          // but we've already checked the logical path above
          if (componentError.code !== 'ENOENT') {
            throw componentError;
          }
        }
        
        currentPath = testPath;
      }
      
      return;
    }
    
    if (error.code === 'ELOOP') {
      throw new Error(`Circular symlink detected in path: ${targetPath}`);
    }
    
    // Re-throw other filesystem errors with context
    throw new Error(`Security validation failed for path ${targetPath}: ${error.message}`);
  }
}

/**
 * Feature Template: For new functionality and features
 */
export const featureTemplate: ChangeTemplate = {
  type: 'feature',
  
  generateProposal: (context: ChangeTemplateContext): string => {
    const { title, slug, rationale, owner } = context;
    const date = new Date().toISOString().split('T')[0];
    
    return `# Change: ${title}

**Slug:** \`${slug}\`  
**Date:** ${date}  
**Owner:** ${owner || 'TBD'}  
**Type:** Feature

## Why

${rationale || 'TODO: Describe why this change is needed and what problem it solves.'}

## What Changes

- [ ] **Implementation**: Core functionality for ${title}
- [ ] **Testing**: Comprehensive test coverage
- [ ] **Documentation**: Update relevant documentation
- [ ] **Validation**: Ensure change meets acceptance criteria

## Deltas

### ADDED Requirements

#### Feature: ${title}

##### Scenario: Basic functionality
**Given** the system is properly configured  
**When** the new feature is invoked  
**Then** the expected behavior occurs

##### Scenario: Error handling
**Given** invalid input or configuration  
**When** the feature is invoked  
**Then** appropriate error handling occurs

#### API Changes (if applicable)

##### Scenario: API compatibility
**Given** existing API consumers  
**When** the new API endpoints are used  
**Then** backward compatibility is maintained

### MODIFIED Requirements

#### System Integration

##### Scenario: Integration testing
**Given** the feature is integrated with existing systems  
**When** end-to-end testing is performed  
**Then** all integrations work correctly

## Success Metrics

- [ ] Feature works as specified in scenarios
- [ ] Test coverage ≥ 80%
- [ ] Performance benchmarks met
- [ ] Documentation is complete and accurate

## Rollback Plan

- [ ] Database migrations are reversible
- [ ] Feature flags can disable new functionality
- [ ] Rollback procedures documented and tested

---
*Generated using OpenSpec feature template*
`;
  },
  
  generateTasks: (context: ChangeTemplateContext): string => {
    const { title, slug } = context;
    
    return `# Tasks: ${title}

**Change ID:** ${slug}  
**Created:** ${new Date().toISOString()}

## Phase 1: Planning & Design
- [ ] Review and refine requirements
- [ ] Create technical design document
- [ ] Define acceptance criteria
- [ ] Estimate effort and timeline

## Phase 2: Implementation
- [ ] Set up development environment
- [ ] Implement core functionality
- [ ] Add error handling and validation
- [ ] Integrate with existing systems

## Phase 3: Testing
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Perform manual testing
- [ ] Conduct security review

## Phase 4: Documentation
- [ ] Update API documentation
- [ ] Create user guides
- [ ] Update changelog
- [ ] Document deployment procedures

## Phase 5: Release
- [ ] Code review completed
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Deploy to production

## Notes
- Each task should include estimated hours and assignee
- Update task status as work progresses
- Blockers should be documented and escalated

---
*Generated using OpenSpec feature template*
`;
  },
  
  generateSpecs: async (context: ChangeTemplateContext): Promise<Record<string, string>> => {
    const { slug } = context;
    
    return {
      'README.md': `# Specifications for Change: ${slug}

This directory contains detailed specifications for the change proposal.

## Structure

- \`proposal.md\` - Main change proposal
- \`tasks.md\` - Task breakdown and tracking
- \`specs/\` - Detailed specifications and scenarios

## Validation

Run \`openspec change validate ${slug}\` to check compliance.

---
*Generated using OpenSpec feature template*
`
    };
  }
};

/**
 * Bugfix Template: For fixing defects and issues
 */
export const bugfixTemplate: ChangeTemplate = {
  type: 'bugfix',
  
  generateProposal: (context: ChangeTemplateContext): string => {
    const { title, slug, rationale, owner } = context;
    const date = new Date().toISOString().split('T')[0];
    
    return `# Change: ${title}

**Slug:** \`${slug}\`  
**Date:** ${date}  
**Owner:** ${owner || 'TBD'}  
**Type:** Bugfix

## Why

${rationale || 'TODO: Describe the bug being fixed and its impact.'}

## Bug Description

- **Symptoms:** What users experience
- **Root Cause:** Technical explanation of the issue
- **Impact:** Severity and affected components
- **Reproduction Steps:** How to reproduce the bug

## What Changes

- [ ] **Root Cause Fix**: Address the underlying issue
- [ ] **Regression Tests**: Prevent future occurrences
- [ ] **Data Cleanup**: Fix any corrupted data if needed
- [ ] **Monitoring**: Add alerts for early detection

## Deltas

### MODIFIED Requirements

#### Bug Fix: ${title}

##### Scenario: Bug reproduction
**Given** the conditions that trigger the bug  
**When** the problematic action is performed  
**Then** the bug should no longer occur

##### Scenario: No regression
**Given** normal operating conditions  
**When** standard workflows are executed  
**Then** existing functionality remains unaffected

#### Data Integrity (if applicable)

##### Scenario: Data consistency
**Given** potentially affected data  
**When** data validation checks run  
**Then** all data is consistent and valid

### REMOVED Requirements

#### Defective Code

##### Scenario: Code removal
**Given** the defective code paths  
**When** the fix is applied  
**Then** problematic code is removed or corrected

## Success Metrics

- [ ] Bug is completely resolved
- [ ] No regression in existing functionality
- [ ] All edge cases are handled
- [ ] Performance is not degraded

## Rollback Plan

- [ ] Code changes can be reverted
- [ ] Data migrations are reversible
- [ ] Emergency procedures documented

---
*Generated using OpenSpec bugfix template*
`;
  },
  
  generateTasks: (context: ChangeTemplateContext): string => {
    const { title, slug } = context;
    
    return `# Tasks: ${title}

**Change ID:** ${slug}  
**Created:** ${new Date().toISOString()}

## Phase 1: Investigation
- [ ] Reproduce the bug consistently
- [ ] Identify root cause
- [ ] Assess impact and scope
- [ ] Determine fix approach

## Phase 2: Fix Development
- [ ] Develop minimal fix
- [ ] Write reproduction test case
- [ ] Implement the fix
- [ ] Verify fix resolves issue

## Phase 3: Testing & Validation
- [ ] Run full test suite
- [ ] Perform regression testing
- [ ] Test edge cases
- [ ] Validate in staging environment

## Phase 4: Documentation
- [ ] Document root cause
- [ ] Update troubleshooting guides
- [ ] Add monitoring/alerts if needed
- [ ] Update knowledge base

## Phase 5: Release
- [ ] Code review completed
- [ ] All tests passing
- [ ] Production validation
- [ ] Monitor post-deployment

## Bug-Specific Tasks
- [ ] Identify all affected user workflows
- [ ] Check for similar issues in other areas
- [ ] Consider data cleanup if needed
- [ ] Plan communication to users if impactful

## Notes
- Prioritize quick resolution for critical bugs
- Ensure fix doesn't introduce new issues
- Document lessons learned

---
*Generated using OpenSpec bugfix template*
`;
  },
  
  generateSpecs: async (context: ChangeTemplateContext): Promise<Record<string, string>> => {
    const { slug } = context;
    
    return {
      'README.md': `# Specifications for Bugfix: ${slug}

This directory contains specifications for the bugfix.

## Bug Information

- Root cause analysis
- Reproduction steps
- Fix validation criteria

## Testing

- Regression test cases
- Edge case coverage
- Performance impact assessment

## Validation

Run \`openspec change validate ${slug}\` to check compliance.

---
*Generated using OpenSpec bugfix template*
`
    };
  }
};

/**
 * Chore Template: For maintenance, refactoring, and operational tasks
 */
export const choreTemplate: ChangeTemplate = {
  type: 'chore',
  
  generateProposal: (context: ChangeTemplateContext): string => {
    const { title, slug, rationale, owner } = context;
    const date = new Date().toISOString().split('T')[0];
    
    return `# Change: ${title}

**Slug:** \`${slug}\`  
**Date:** ${date}  
**Owner:** ${owner || 'TBD'}  
**Type:** Chore

## Why

${rationale || 'TODO: Describe why this maintenance task is necessary.'}

## Background

- **Purpose:** What this chore accomplishes
- **Scope:** Systems and components affected
- **Frequency:** One-time or recurring task
- **Dependencies:** Any prerequisites

## What Changes

- [ ] **Maintenance**: Perform the required maintenance
- [ ] **Documentation**: Update relevant documentation
- [ ] **Verification**: Ensure changes work as expected
- [ ] **Cleanup**: Remove temporary artifacts

## Deltas

### MODIFIED Requirements

#### Maintenance: ${title}

##### Scenario: Maintenance completion
**Given** the maintenance task is performed  
**When** system operation resumes  
**Then** the system operates correctly with improvements

##### Scenario: No disruption
**Given** normal system operation  
**When** maintenance activities occur  
**Then** user experience is minimally impacted

### ADDED Requirements

#### Improvements (if applicable)

##### Scenario: Enhancement validation
**Given** the improvements are implemented  
**When** the system is tested  
**Then** performance or functionality is enhanced

#### Documentation Updates

##### Scenario: Documentation accuracy
**Given** updated documentation  
**When** reviewed by stakeholders  
**Then** documentation accurately reflects changes

## Success Metrics

- [ ] Maintenance task completed successfully
- [ ] System stability maintained
- [ ] Documentation is up-to-date
- [ ] No unexpected side effects

## Rollback Plan

- [ ] Changes can be reverted if needed
- [ ] Backup procedures in place
- [ ] Emergency contacts notified

---
*Generated using OpenSpec chore template*
`;
  },
  
  generateTasks: (context: ChangeTemplateContext): string => {
    const { title, slug } = context;
    
    return `# Tasks: ${title}

**Change ID:** ${slug}  
**Created:** ${new Date().toISOString()}

## Phase 1: Preparation
- [ ] Review maintenance requirements
- [ ] Schedule maintenance window
- [ ] Prepare backup procedures
- [ ] Notify stakeholders

## Phase 2: Execution
- [ ] Perform maintenance activities
- [ ] Monitor system health
- [ ] Document any issues
- [ ] Verify completion

## Phase 3: Validation
- [ ] Test affected functionality
- [ ] Verify system performance
- [ ] Check error logs
- [ ] Validate with stakeholders

## Phase 4: Documentation
- [ ] Update technical documentation
- [ ] Record maintenance results
- [ ] Update procedures if needed
- [ ] Archive maintenance logs

## Phase 5: Cleanup
- [ ] Remove temporary files
- [ ] Clean up work artifacts
- [ ] Update monitoring
- [ ] Close maintenance window

## Maintenance-Specific Tasks
- [ ] Verify backup integrity
- [ ] Test rollback procedures
- [ ] Update runbooks
- [ ] Schedule follow-up if needed

## Notes
- Document any deviations from plan
- Note any unexpected findings
- Record lessons learned for future maintenance

---
*Generated using OpenSpec chore template*
`;
  },
  
  generateSpecs: async (context: ChangeTemplateContext): Promise<Record<string, string>> => {
    const { slug } = context;
    
    return {
      'README.md': `# Specifications for Chore: ${slug}

This directory contains specifications for the maintenance task.

## Maintenance Details

- Task scope and objectives
- Step-by-step procedures
- Validation criteria

## Documentation

- Updated procedures
- System changes
- Operational impact

## Validation

Run \`openspec change validate ${slug}\` to check compliance.

---
*Generated using OpenSpec chore template*
`
    };
  }
};

/**
 * Template registry for easy access
 */
export const changeTemplates: Record<string, ChangeTemplate> = {
  feature: featureTemplate,
  bugfix: bugfixTemplate,
  chore: choreTemplate
};

/**
 * Main template manager for OpenSpec changes
 */
export class ChangeTemplateManager {
  private openspecPath: string;
  
  constructor(basePath: string = process.cwd()) {
    this.openspecPath = path.join(basePath, 'openspec');
  }
  
  /**
   * Creates a new change from a template
   */
  async createChange(
    templateType: 'feature' | 'bugfix' | 'chore',
    context: ChangeTemplateContext
  ): Promise<string> {
    // Validate inputs
    if (!templateType || !changeTemplates[templateType]) {
      throw new Error(`Invalid template type: ${templateType}. Must be one of: ${Object.keys(changeTemplates).join(', ')}`);
    }
    
    if (!context.title || typeof context.title !== 'string') {
      throw new Error('Title is required and must be a string');
    }
    
    if (!context.slug || !validate_slug(context.slug)) {
      throw new Error(`Invalid slug: ${context.slug}. Must match pattern: ^[a-z0-9](?:[a-z0-9\\-]{1,62})[a-z0-9]$`);
    }
    
    // Security: Validate all paths before creation
    const changesDir = path.join(this.openspecPath, 'changes');
    const changeDir = path.join(changesDir, context.slug);
    const specsDir = path.join(changeDir, 'specs');
    
    // Ensure paths are within allowed bounds (with symlink protection)
    await validateSecurePath(this.openspecPath, `changes/${context.slug}`);
    await validateSecurePath(this.openspecPath, `changes/${context.slug}/specs`);
    
    // Acquire lock for atomic operation
    const lockDir = path.join(this.openspecPath, '.locks');
    const lockPath = path.join(lockDir, `change-${context.slug}.lock`);
    const lockOwner = context.owner || process.env.USER || 'unknown';
    const lockTtl = context.ttl || 3600; // Default 1 hour
    
    // Ensure lock directory exists
    await fs.mkdir(lockDir, { recursive: true });
    
    try {
      await atomic_lock(lockPath, lockOwner, lockTtl);
    } catch (error) {
      if (error instanceof AtomicLockError) {
        throw new Error(`Change "${context.slug}" is locked by ${error.lockInfo?.owner} since ${new Date(error.lockInfo?.since || 0).toISOString()}`);
      }
      throw error;
    }
    
    try {
      // Create directory structure
      await fs.mkdir(this.openspecPath, { recursive: true });
      await fs.mkdir(changesDir, { recursive: true });
      
      // Check if change already exists
      try {
        await fs.access(changeDir);
        throw new Error(`Change "${context.slug}" already exists at ${changeDir}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // Directory doesn't exist, proceed with creation
      }
      
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(specsDir, { recursive: true });
      
      const template = changeTemplates[templateType];
      
      // Generate files
      const proposalContent = template.generateProposal(context);
      const tasksContent = template.generateTasks(context);
      const specFiles = await template.generateSpecs(context);
      
      // Write files with security validation
      const proposalPath = path.join(changeDir, 'proposal.md');
      const tasksPath = path.join(changeDir, 'tasks.md');
      
      await validateSecurePath(this.openspecPath, `changes/${context.slug}/proposal.md`);
      await validateSecurePath(this.openspecPath, `changes/${context.slug}/tasks.md`);
      
      await fs.writeFile(proposalPath, proposalContent, 'utf-8');
      await fs.writeFile(tasksPath, tasksContent, 'utf-8');
      
      // Write spec files
      for (const [filename, content] of Object.entries(specFiles)) {
        const specPath = path.join(specsDir, filename);
        await validateSecurePath(this.openspecPath, `changes/${context.slug}/specs/${filename}`);
        await fs.writeFile(specPath, content, 'utf-8');
      }
      
      return changeDir;
      
    } finally {
      // Clean up lock file
      try {
        await fs.unlink(lockPath);
      } catch {
        // Lock cleanup is best effort
      }
    }
  }
  
  /**
   * Validates that a change structure matches template expectations
   */
  async validateChangeStructure(slug: string): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    // Validate slug format
    if (!validate_slug(slug)) {
      issues.push(`Invalid slug format: ${slug}`);
    }
    
    // Check directory structure
    const changeDir = path.join(this.openspecPath, 'changes', slug);
    const proposalPath = path.join(changeDir, 'proposal.md');
    const tasksPath = path.join(changeDir, 'tasks.md');
    const specsDir = path.join(changeDir, 'specs');
    
    try {
      await fs.access(changeDir);
    } catch {
      issues.push(`Change directory does not exist: ${changeDir}`);
      return { valid: false, issues };
    }
    
    try {
      await fs.access(proposalPath);
    } catch {
      issues.push(`Required file missing: proposal.md`);
    }
    
    try {
      await fs.access(tasksPath);
    } catch {
      issues.push(`Required file missing: tasks.md`);
    }
    
    try {
      await fs.access(specsDir);
    } catch {
      issues.push(`Required directory missing: specs/`);
    }
    
    // Validate file contents
    if (issues.length === 0) {
      try {
        const proposalContent = await fs.readFile(proposalPath, 'utf-8');
        if (!proposalContent.includes('# Change:')) {
          issues.push('proposal.md must include a "# Change:" header');
        }
        
        const tasksContent = await fs.readFile(tasksPath, 'utf-8');
        if (!tasksContent.includes('# Tasks:')) {
          issues.push('tasks.md must include a "# Tasks:" header');
        }
      } catch (error) {
        issues.push(`Error reading files: ${error}`);
      }
    }
    
    return { valid: issues.length === 0, issues };
  }
  
  /**
   * Lists available template types
   */
  getAvailableTemplates(): string[] {
    return Object.keys(changeTemplates);
  }
  
  /**
   * Gets template information
   */
  getTemplateInfo(templateType: string): ChangeTemplate | null {
    return changeTemplates[templateType] || null;
  }
}