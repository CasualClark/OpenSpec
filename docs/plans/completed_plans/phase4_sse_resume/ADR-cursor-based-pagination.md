# ADR: Cursor-Based Pagination Strategy with Opaque Token Encoding

## Status
Accepted

## Date
2025-10-25

## Context

OpenSpec Phase 3 requires stable pagination for change listings that can handle concurrent access without becoming inconsistent. The existing offset-based pagination (page numbers) has fundamental stability issues:

1. **Concurrent Modifications**: When items are added/removed while a user paginates, page boundaries shift, causing items to be skipped or duplicated
2. **Performance Issues**: Deep pagination (high page numbers) requires scanning and discarding many items
3. **Inconsistent State**: Multiple users see different results for the same page number

The Phase 3 plan specifies cursor-based pagination with opaque token encoding using the format `{page, timestamp, sortKey}` (lines 72-86 and 92-286).

## Decision

We chose **Enhanced Base64URL JSON Token Encoding** with deterministic sorting and cryptographic signing for stable pagination during concurrent access.

### Token Format
```
 nextPageToken = base64url(JSON.stringify({
   page: number,           // 1-indexed page number
   timestamp: string,      // ISO8601 creation time
   sortKey: string,        // Last item's sort key for positioning
   signature?: string      // HMAC for tamper protection (optional)
 }))
```

### Sort Key Strategy
```
sortKey = "${mtime.toISOString()}_${slug}"
// Example: "2025-10-25T14:30:00.123Z_feature-authentication"
```

## Alternatives Considered

### Option 1: Enhanced Base64URL JSON (Selected)
- **Pros**: Simple, debuggable, aligns with existing pseudocode, easy to implement
- **Cons**: Larger token size (~200-300 bytes), requires validation
- **Risks**: Token tampering (mitigated with HMAC), URL length limits

### Option 2: Compact Binary Token
- **Pros**: Small size (~50-100 bytes), tamper-proof with built-in signature
- **Cons**: Complex implementation, not human-readable, requires binary handling
- **Risks**: Encoding issues across platforms, debugging difficulty

### Option 3: Server-Side Cursor Store
- **Pros**: Very small tokens (just IDs), server control, easy invalidation
- **Cons**: Server state, storage requirements, cleanup complexity
- **Risks**: Memory leaks, scaling issues

### Option 4: Deterministic Offset Encoding
- **Pros**: Stateless, small tokens, no expiration needed
- **Cons**: Requires extremely stable sorting, sensitive to data changes
- **Risks**: Pagination drift, complex to maintain consistency

## Architectural Decisions

### 1. Token Format and Encoding
**Decision**: Base64URL-encoded JSON with HMAC signature
- Base64URL provides URL-safe encoding without URL encoding issues
- JSON maintains readability and extensibility
- HMAC prevents token tampering and ensures integrity

**Token Structure**:
```typescript
interface PageToken {
  page: number;           // Current page number (1-based)
  timestamp: string;      // Token creation time (ISO8601)
  sortKey: string;        // Last item's sort key for cursor positioning
  signature?: string;     // HMAC-SHA256 signature (when security enabled)
}
```

**Encoding Process**:
```typescript
function encodeToken(token: PageToken): string {
  const payload = {
    page: token.page,
    timestamp: token.timestamp,
    sortKey: token.sortKey
  };
  
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json).toString('base64url');
  
  // Add signature if security enabled
  if (securityEnabled) {
    const signature = crypto
      .createHmac('sha256', paginationSecret)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }
  
  return encoded;
}
```

### 2. Stability Guarantees
**Decision**: Deterministic sorting with cursor-based positioning

**Sorting Strategy**:
- Primary: `mtime DESC` (most recent first)
- Secondary: `slug ASC` (deterministic tiebreaker)
- Tertiary: `path ASC` (final tiebreaker)

**Stability Properties**:
- Items never disappear from pagination unless deleted
- New items appear at beginning (most recent)
- Concurrent modifications don't affect existing cursors
- Pagination is consistent across multiple requests

**Cursor Positioning**:
```typescript
// Find cursor position in sorted list
const cursorIndex = changes.findIndex(c => c.sortKey === cursor.sortKey);

// Start from next item after cursor
const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;

// Apply page size limit
const endIndex = Math.min(startIndex + pageSize, changes.length);
const pageItems = changes.slice(startIndex, endIndex);
```

### 3. Edge Case Handling
**Decision**: Graceful degradation with explicit error responses

**Empty Lists**:
- Return empty items array
- Set `hasMore: false`
- Omit `nextPageToken` (undefined)
- Page number = 1 (or requested page)

**Single Page Results**:
- Return all items
- Set `hasMore: false`
- Omit `nextPageToken`
- Set `totalPages: 1`

**Invalid Tokens**:
- Return validation error with code `INVALID_CURSOR_TOKEN`
- Include original token in error details for debugging
- Suggest starting pagination from page 1

**Expired Tokens**:
- Return error with code `EXPIRED_CURSOR_TOKEN`
- Include expiration time in error details
- Recommend fresh pagination request

**Concurrent Modifications**:
- Continue pagination from original cursor (may skip new items)
- Add `modificationWarning` flag when underlying data changed
- Provide `totalItems` based on current state (may differ from pagination state)

### 4. Security Considerations
**Decision**: Defense-in-depth with validation and optional signing

**Token Security**:
- Maximum token size: 1KB (prevent DoS via large tokens)
- Token format validation: strict base64url pattern
- Input sanitization: prevent injection attacks
- Rate limiting: prevent pagination abuse

**Data Protection**:
```typescript
interface SecurityConfig {
  enableTokenSigning: boolean;     // HMAC signature
  tokenExpiration: number;         // Hours (default: 24)
  maxTokenSize: number;           // Bytes (default: 1024)
  rateLimitPerMinute: number;     // Requests (default: 60)
}
```

**Path Validation**:
- Validate all paths are within expected directories
- Prevent directory traversal attacks
- Canonicalize paths before processing
- Enforce permission checks

**Memory Protection**:
- Limit page size to maximum 100 items
- Implement streaming for large result sets
- Monitor memory usage during pagination
- Cleanup resources on errors

## Implementation Details

### 1. Pagination Engine Interface
```typescript
interface PageRequest {
  page?: number;           // 1-indexed page number
  pageSize?: number;       // Items per page (default: 50, max: 100)
  nextPageToken?: string;  // Opaque continuation token
}

interface PageResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  nextPageToken?: string;
  previousPageToken?: string;
  hasMore: boolean;
  modificationWarning?: boolean;  // Data changed since pagination started
}
```

### 2. Token Validation
```typescript
function validateToken(token: string): PageToken | null {
  // Check size limit
  if (token.length > MAX_TOKEN_SIZE) {
    return null;
  }
  
  // Split signature if present
  const [encoded, signature] = token.split('.');
  
  // Validate format
  if (!/^[a-zA-Z0-9_-]+$/.test(encoded)) {
    return null;
  }
  
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    
    // Validate structure
    if (!isValidPageToken(parsed)) {
      return null;
    }
    
    // Verify signature if security enabled
    if (signature && securityEnabled) {
      const expectedSignature = crypto
        .createHmac('sha256', paginationSecret)
        .update(encoded)
        .digest('base64url');
      
      if (signature !== expectedSignature) {
        return null;
      }
    }
    
    return parsed;
  } catch (error) {
    return null;
  }
}
```

### 3. Error Handling
```typescript
enum PaginationErrorCode {
  INVALID_CURSOR_TOKEN = 'INVALID_CURSOR_TOKEN',
  EXPIRED_CURSOR_TOKEN = 'EXPIRED_CURSOR_TOKEN',
  PAGE_SIZE_TOO_LARGE = 'PAGE_SIZE_TOO_LARGE',
  INVALID_PAGE_NUMBER = 'INVALID_PAGE_NUMBER',
  CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION'
}

interface PaginationError {
  code: PaginationErrorCode;
  message: string;
  details: {
    originalToken?: string;
    currentPage?: number;
    timestamp?: string;
    suggestion?: string;
  };
}
```

## Performance Considerations

### 1. Token Size Optimization
- Average token size: ~150-200 bytes
- Maximum token size: 1KB (configurable)
- URL length compatibility: safe for most browsers/proxies

### 2. Caching Strategy
- Cache directory listings for 5 seconds
- Cache file stats for 10 seconds
- Invalidation on file system changes
- Cache keys based on directory mtime

### 3. Memory Management
- Stream directory scanning for large repositories
- Limit concurrent pagination operations
- Cleanup resources on token expiration
- Monitor heap usage during operations

## Testing Strategy

### 1. Unit Tests
```typescript
describe('CursorPagination', () => {
  test('encodes and decodes tokens correctly');
  test('validates token format and size');
  test('handles invalid tokens gracefully');
  test('maintains sort order stability');
  test('detects concurrent modifications');
  test('enforces page size limits');
});
```

### 2. Integration Tests
```typescript
describe('PaginationIntegration', () => {
  test('navigates through all pages without duplicates');
  test('handles new items during pagination');
  test('handles deleted items during pagination');
  test('maintains performance with 1000+ items');
  test('respects security limits');
});
```

### 3. Performance Tests
```typescript
describe('PaginationPerformance', () => {
  test('first page < 50ms with 100 items');
  test('deep pagination < 120ms with 1000+ items');
  test('memory usage < 10MB during pagination');
  test('concurrent pagination handles 10+ clients');
});
```

## Migration Plan

### Phase 1: Implementation (Week 1)
- Implement token encoding/decoding
- Add pagination engine with cursor support
- Create comprehensive validation
- Write unit and integration tests

### Phase 2: Integration (Week 1)
- Update resource provider for cursor pagination
- Add backward compatibility with page numbers
- Update schemas and documentation
- Performance testing and optimization

### Phase 3: Rollout (Week 2)
- Deploy with feature flag
- Monitor performance and errors
- Gradual client migration
- Deprecate page-based pagination

## Rollback Plan

### Immediate Rollback
- Disable cursor pagination feature flag
- Fall back to existing page-based pagination
- Clear any cached token data
- Monitor system stability

### Full Rollback
- Revert pagination engine changes
- Restore previous resource provider
- Rollback schema changes
- Communicate to clients about temporary limitations

## Monitoring and Observability

### Key Metrics
- Pagination request latency (p50, p95, p99)
- Token validation success/failure rates
- Concurrent modification detection frequency
- Memory usage during pagination operations
- Cache hit/miss ratios

### Alerting
- Pagination latency > 200ms
- Token validation failure rate > 5%
- Memory usage > 100MB during pagination
- Concurrent modification rate > 10%

## Consequences

This design provides:

- **Stability**: Consistent pagination regardless of concurrent modifications
- **Security**: Tamper-proof tokens with validation and rate limiting
- **Performance**: Efficient pagination with caching and streaming
- **Compatibility**: Backward compatible with existing page-based approach
- **Extensibility**: Token format supports future enhancements

The cursor-based pagination system eliminates the fundamental instability issues with offset-based pagination while maintaining excellent performance and security characteristics. The opaque token approach provides a clean API surface while allowing sophisticated internal implementation.

---

*Document Version: 1.0*  
*Last Updated: 2025-10-25*  
*Review Date: 2025-10-26*