# Task MCP API Reference

_Last updated: 2025-10-23_

## Overview

The Task MCP API provides two core tools and three resource providers for managing OpenSpec changes through stdio communication. This reference covers all API endpoints, schemas, and usage patterns.

## Tools

### `change.open` - Create or Resume a Change

**Purpose**: Create a new change or resume an existing one with proper locking and scaffolding.

**Schema Reference**: 
- Input: [`/schemas/change.open.input.schema.json`](../schemas/change.open.input.schema.json)
- Output: [`/schemas/change.open.output.schema.json`](../schemas/change.open.output.schema.json)

**Request Example**:
```json
{
  "title": "Add user authentication",
  "slug": "user-auth-feature",
  "rationale": "Implement OAuth2 login for better security",
  "owner": "developer@example.com",
  "ttl": 7200,
  "template": "feature"
}
```

**Response Example**:
```json
{
  "apiVersion": "1.0",
  "toolVersions": {
    "task-mcp": "1.0.0"
  },
  "slug": "user-auth-feature",
  "locked": true,
  "owner": "developer@example.com",
  "path": "/home/user/project/openspec/changes/user-auth-feature",
  "created": false,
  "scaffolded": true
}
```

**Behavior**:
- **Idempotent**: Returns existing change if slug already exists
- **Locking**: Creates atomic lock file with owner and TTL
- **Scaffolding**: Creates `proposal.md`, `tasks.md`, and `specs/` directory if missing
- **Validation**: Enforces slug regex and path sandbox constraints

### `change.archive` - Archive a Completed Change

**Purpose**: Validate, archive, and generate receipt for a completed change.

**Schema Reference**:
- Input: [`/schemas/change.archive.input.schema.json`](../schemas/change.archive.input.schema.json)
- Output: [`/schemas/change.archive.output.schema.json`](../schemas/change.archive.output.schema.json)

**Request Example**:
```json
{
  "slug": "user-auth-feature"
}
```

**Response Example**:
```json
{
  "apiVersion": "1.0",
  "toolVersions": {
    "task-mcp": "1.0.0"
  },
  "slug": "user-auth-feature",
  "archived": true,
  "alreadyArchived": false,
  "receipt": {
    "slug": "user-auth-feature",
    "archivedAt": "2025-10-23T14:30:00Z",
    "checksum": "sha256:abc123...",
    "files": ["proposal.md", "tasks.md", "specs/auth-flow.md"]
  }
}
```

**Behavior**:
- **Validation**: Verifies change structure and required files
- **Archival**: Executes `openspec archive <slug> --yes` safely
- **Receipt Generation**: Creates comprehensive receipt with file checksums
- **Lock Release**: Automatically releases any active locks

## Resources

### `changes://active` - List Active Changes

**Purpose**: Paginated listing of all active (non-archived) changes.

**Schema Reference**: [`/schemas/changes.active.output.schema.json`](../schemas/changes.active.output.schema.json)

**URI Pattern**: `changes://active?page=1&pageSize=20`

**Response Example**:
```json
{
  "apiVersion": "1.0",
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 5,
    "hasNext": false
  },
  "items": [
    {
      "slug": "user-auth-feature",
      "title": "Add user authentication",
      "owner": "developer@example.com",
      "locked": true,
      "createdAt": "2025-10-23T12:00:00Z"
    }
  ]
}
```

### `change://{slug}/proposal` - Access Proposal Document

**Purpose**: Stream access to the `proposal.md` file for a specific change.

**URI Pattern**: `change://user-auth-feature/proposal`

**Usage**: Returns file stream content for IDE display/editing

### `change://{slug}/tasks` - Access Tasks Document

**Purpose**: Stream access to the `tasks.md` file for a specific change.

**URI Pattern**: `change://user-auth-feature/tasks`

**Usage**: Returns file stream content for IDE display/editing

### `change://{slug}/delta/**` - Access Specification Delta

**Purpose**: Tree access to all specification files in the `specs/` directory.

**URI Pattern**: `change://user-auth-feature/delta/**`

**Usage**: Returns file tree for IDE navigation and editing

## Error Handling

All API responses follow the error code conventions defined in [`contracts.md`](contracts.md):

### Common Error Responses

**Lock Conflict (ELOCKED)**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "ELOCKED",
    "message": "Change is locked by another owner",
    "details": {
      "owner": "other@example.com",
      "since": "2025-10-23T13:00:00Z",
      "ttl": 3600
    }
  }
}
```

**Invalid Slug (EBADSLUG)**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "EBADSLUG",
    "message": "Slug fails validation requirements",
    "details": {
      "pattern": "^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$",
      "provided": "invalid-slug!"
    }
  }
}
```

**Path Escape (EPATH_ESCAPE)**:
```json
{
  "apiVersion": "1.0",
  "error": {
    "code": "EPATH_ESCAPE",
    "message": "Attempted path traversal outside sandbox",
    "details": {
      "requested": "../../../etc/passwd",
      "allowed": "/home/user/project/openspec/"
    }
  }
}
```

## Versioning and Compatibility

- **API Version**: All responses include `apiVersion` field
- **Tool Versions**: Optional `toolVersions` map for component tracking
- **Backward Compatibility**: Non-breaking changes maintain same major version
- **Deprecation**: Breaking changes documented with migration guides

## Performance Considerations

- **Compact Output**: Tool responses minimize payload size
- **File Streaming**: Large artifacts returned as paths, not content
- **Pagination**: Resource listings support pagination
- **Caching**: Resource providers should implement appropriate caching