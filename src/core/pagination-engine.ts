import { promises as fs } from 'fs';
import path from 'path';

/**
 * Core pagination types
 */
export interface PageRequest {
  page?: number;           // 1-indexed page number
  pageSize?: number;       // Items per page (default: 50, max: 100)
  nextPageToken?: string;  // Opaque continuation token
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  nextPageToken?: string;
  previousPageToken?: string;
  hasMore: boolean;
}

export interface PageToken {
  page: number;
  timestamp: string;  // ISO8601
  sortKey: string;    // Last item's sort key
}

export interface ChangeListItem {
  slug: string;
  title: string;
  mtime: string;
  isLocked: boolean;
  uri: string;
}

interface ChangeWithMetadata {
  slug: string;
  mtime: Date;
  sortKey: string;
  isLocked: boolean;
  path: string;
}

/**
 * PaginationEngine provides stable cursor-based pagination for change listings.
 * 
 * Key features:
 * - Stable sort by mtime DESC + slug ASC
 * - Token encode/decode using base64url JSON
 * - Page size limits (max 100)
 * - Directory scanning with mtime stat
 * - Lock file checking
 */
export class PaginationEngine {
  private readonly DEFAULT_PAGE_SIZE = 50;
  private readonly MAX_PAGE_SIZE = 100;
  private readonly MAX_TOKEN_SIZE = 1024; // 1KB limit for security

  /**
   * Generate stable pagination for change listings
   * 
   * Algorithm:
   * 1. Scan openspec/changes directory
   * 2. Stat each change directory for mtime
   * 3. Sort by (mtime DESC, slug ASC) for stability
   * 4. Apply cursor-based slicing
   * 5. Generate next/previous tokens
   */
  async paginate(
    rootPath: string,
    request: PageRequest
  ): Promise<PageResponse<ChangeListItem>> {
    
    // Decode token or use page number
    let cursor: PageToken;
    if (request.nextPageToken) {
      const decoded = this.decodeToken(request.nextPageToken);
      if (decoded) {
        cursor = decoded;
      } else {
        // Invalid token, fall back to page 1
        cursor = { page: 1, timestamp: '', sortKey: '' };
      }
    } else {
      cursor = { 
        page: request.page || 1, 
        timestamp: '', 
        sortKey: '' 
      };
    }
    
    const pageSize = Math.min(request.pageSize || this.DEFAULT_PAGE_SIZE, this.MAX_PAGE_SIZE);
    
    // Scan and collect all changes with metadata
    const changesPath = path.join(rootPath, 'openspec', 'changes');
    let slugs: string[];
    
    try {
      slugs = await fs.readdir(changesPath);
    } catch {
      // Directory doesn't exist or is inaccessible
      return {
        items: [],
        page: cursor.page,
        pageSize,
        totalItems: 0,
        totalPages: 0,
        hasMore: false
      };
    }
    
    const changes: ChangeWithMetadata[] = [];
    for (const slug of slugs) {
      const changePath = path.join(changesPath, slug);
      
      try {
        const stats = await fs.stat(changePath);
        
        // Skip if not a directory
        if (!stats.isDirectory()) continue;
        
        // Skip if locked (optional filter)
        const isLocked = await this.isLocked(changePath);
        
        changes.push({
          slug,
          mtime: stats.mtime,
          sortKey: `${stats.mtime.toISOString()}_${slug}`,
          isLocked,
          path: changePath
        });
      } catch (error) {
        // Skip directories that can't be accessed (permission issues, etc.)
        continue;
      }
    }
    
    // Stable sort: mtime DESC, then slug ASC
    changes.sort((a, b) => {
      if (a.mtime.getTime() !== b.mtime.getTime()) {
        return b.mtime.getTime() - a.mtime.getTime(); // DESC
      }
      return a.slug.localeCompare(b.slug); // ASC tiebreaker
    });
    
    // Apply cursor filtering if sortKey provided
    let filteredChanges = changes;
    let startIndex = 0;
    
    if (cursor.sortKey) {
      const cursorIndex = changes.findIndex(c => c.sortKey === cursor.sortKey);
      if (cursorIndex >= 0) {
        // Start from the item after the cursor
        filteredChanges = changes.slice(cursorIndex + 1);
        startIndex = 0; // Reset start index for cursor-based pagination
      } else {
        // Invalid sortKey, start from beginning
        filteredChanges = changes;
        startIndex = 0;
      }
    } else {
      // No cursor, use page-based indexing
      startIndex = (cursor.page - 1) * pageSize;
    }
    
    // Calculate pagination slice
    const totalItems = filteredChanges.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const endIndex = startIndex + pageSize;
    
    let pageItems = filteredChanges.slice(startIndex, endIndex);
    
    // Generate tokens
    const hasMore = endIndex < totalItems;
    const hasPrevious = cursor.page > 1 || cursor.sortKey !== '';
    
    let nextToken: string | undefined;
    if (hasMore && pageItems.length > 0) {
      nextToken = this.encodeToken({
        page: cursor.page + 1,
        timestamp: new Date().toISOString(),
        sortKey: pageItems[pageItems.length - 1].sortKey
      });
    }
    
    let previousToken: string | undefined;
    if (hasPrevious && pageItems.length > 0) {
      if (cursor.sortKey) {
        // For cursor-based pagination, find the item before our current start
        const originalIndex = changes.findIndex(c => c.sortKey === pageItems[0].sortKey);
        if (originalIndex > 0) {
          previousToken = this.encodeToken({
            page: Math.max(1, cursor.page - 1),
            timestamp: new Date().toISOString(),
            sortKey: changes[originalIndex - 1].sortKey
          });
        }
      } else if (cursor.page > 1) {
        // For page-based pagination, create a token pointing to the item before this page
        const previousStartIndex = startIndex - pageSize;
        if (previousStartIndex >= 0 && previousStartIndex < changes.length) {
          previousToken = this.encodeToken({
            page: cursor.page - 1,
            timestamp: new Date().toISOString(),
            sortKey: changes[previousStartIndex].sortKey
          });
        }
      }
    }
    
    // Transform to list items
    const items = await Promise.all(
      pageItems.map(c => this.toListItem(c))
    );
    
    return {
      items,
      page: cursor.page,
      pageSize,
      totalItems,
      totalPages,
      nextPageToken: nextToken,
      previousPageToken: previousToken,
      hasMore
    };
  }
  
  /**
   * Encode pagination token
   * Format: base64url(JSON({page, timestamp, sortKey}))
   */
  private encodeToken(token: PageToken): string {
    const json = JSON.stringify(token);
    const encoded = Buffer.from(json).toString('base64url');
    
    // Enforce size limit for security
    if (encoded.length > this.MAX_TOKEN_SIZE) {
      throw new Error('Token size exceeds maximum limit');
    }
    
    return encoded;
  }
  
  /**
   * Decode pagination token
   * Returns null if invalid
   */
  private decodeToken(token: string): PageToken | null {
    try {
      // Check size limit first
      if (token.length > this.MAX_TOKEN_SIZE) {
        return null;
      }
      
      // Validate base64url format
      if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
        return null;
      }
      
      const json = Buffer.from(token, 'base64url').toString('utf8');
      const parsed = JSON.parse(json);
      
      // Validate token structure
      if (!this.isValidPageToken(parsed)) {
        return null;
      }
      
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /**
   * Validate the structure of a decoded page token
   */
  private isValidPageToken(token: any): token is PageToken {
    return (
      typeof token === 'object' &&
      token !== null &&
      typeof token.page === 'number' &&
      token.page > 0 &&
      typeof token.timestamp === 'string' &&
      typeof token.sortKey === 'string'
    );
  }
  
  /**
   * Check if change is locked
   */
  private async isLocked(changePath: string): Promise<boolean> {
    const lockPath = path.join(changePath, '.lock');
    try {
      const lockData = await fs.readFile(lockPath, 'utf8');
      const lock = JSON.parse(lockData);
      
      // Validate lock structure
      if (typeof lock !== 'object' || lock === null) {
        return false;
      }
      
      if (typeof lock.since !== 'string' || typeof lock.ttl !== 'number') {
        return false;
      }
      
      const lockTime = new Date(lock.since).getTime();
      if (isNaN(lockTime)) {
        return false;
      }
      
      return Date.now() < lockTime + lock.ttl * 1000;
    } catch {
      return false;
    }
  }
  
  /**
   * Transform change metadata to list item
   */
  private async toListItem(
    change: ChangeWithMetadata
  ): Promise<ChangeListItem> {
    // Read proposal title (first line after # heading)
    const proposalPath = path.join(change.path, 'proposal.md');
    let title = change.slug;
    
    try {
      const content = await fs.readFile(proposalPath, 'utf8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
    } catch {
      // Use slug as fallback
    }
    
    return {
      slug: change.slug,
      title,
      mtime: change.mtime.toISOString(),
      isLocked: change.isLocked,
      uri: `change://${change.slug}`
    };
  }
}