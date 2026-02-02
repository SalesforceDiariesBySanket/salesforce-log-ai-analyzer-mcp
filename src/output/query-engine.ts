/**
 * @module output/query-engine
 * @description Query and filter events with various criteria
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type {
  EventNode,
  EventType,
  ParsedLog,
  SOQLEvent,
  DMLEvent,
  MethodEvent,
  ExceptionEvent,
  LimitEvent,
} from '../types/events';
import type { Issue, IssueCategory, IssueSeverity, IssueType } from '../types/issues';

// ============================================================================
// Query Types
// ============================================================================

/**
 * Event query filter criteria
 */
export interface EventFilter {
  /** Event types to include */
  types?: EventType[];

  /** Event types to exclude */
  excludeTypes?: EventType[];

  /** Namespace filter (include only these) */
  namespaces?: string[];

  /** Exclude events from these namespaces */
  excludeNamespaces?: string[];

  /** Line number range */
  lineRange?: { start: number; end: number };

  /** Timestamp range (nanoseconds) */
  timeRange?: { start: number; end: number };

  /** Minimum duration (nanoseconds) */
  minDuration?: number;

  /** Maximum duration (nanoseconds) */
  maxDuration?: number;

  /** Parent event ID (for tree queries) */
  parentId?: number;

  /** Only events with children */
  hasChildren?: boolean;

  /** Only root-level events */
  rootOnly?: boolean;

  /** Text search in event content */
  textSearch?: string;

  /** Custom predicate */
  predicate?: (event: EventNode) => boolean;
}

/**
 * Issue query filter criteria
 */
export interface IssueFilter {
  /** Issue types to include */
  types?: IssueType[];

  /** Issue categories to include */
  categories?: IssueCategory[];

  /** Minimum severity */
  minSeverity?: IssueSeverity;

  /** Specific severities to include */
  severities?: IssueSeverity[];

  /** Only fixable issues (user code) */
  fixableOnly?: boolean;

  /** Only issues in these namespaces */
  namespaces?: string[];

  /** Minimum confidence score */
  minConfidence?: number;

  /** Text search in title/description */
  textSearch?: string;

  /** Custom predicate */
  predicate?: (issue: Issue) => boolean;
}

/**
 * Sort options
 */
export interface SortOptions<T> {
  /** Field to sort by */
  field: keyof T | string;

  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  /** Page number (1-based) */
  page: number;

  /** Items per page */
  pageSize: number;
}

/**
 * Query result with pagination info
 */
export interface QueryResult<T> {
  /** Results for current page */
  items: T[];

  /** Total count (before pagination) */
  totalCount: number;

  /** Current page */
  page: number;

  /** Page size */
  pageSize: number;

  /** Total pages */
  totalPages: number;

  /** Has more pages */
  hasMore: boolean;
}

// ============================================================================
// Event Query Engine
// ============================================================================

/**
 * Query events from a parsed log
 */
export class EventQueryEngine {
  private events: EventNode[];
  private eventMap: Map<number, EventNode>;

  constructor(parsedLog: ParsedLog) {
    this.events = parsedLog.events;
    this.eventMap = new Map(this.events.map(e => [e.id, e]));
  }

  /**
   * Query events with filter
   */
  query(filter: EventFilter = {}): EventNode[] {
    let results = [...this.events];

    // Type filters
    if (filter.types && filter.types.length > 0) {
      results = results.filter(e => filter.types!.includes(e.type));
    }
    if (filter.excludeTypes && filter.excludeTypes.length > 0) {
      results = results.filter(e => !filter.excludeTypes!.includes(e.type));
    }

    // Namespace filters
    if (filter.namespaces && filter.namespaces.length > 0) {
      results = results.filter(e => e.namespace && filter.namespaces!.includes(e.namespace));
    }
    if (filter.excludeNamespaces && filter.excludeNamespaces.length > 0) {
      results = results.filter(e => !e.namespace || !filter.excludeNamespaces!.includes(e.namespace));
    }

    // Line range
    if (filter.lineRange) {
      results = results.filter(
        e => e.lineNumber >= filter.lineRange!.start && e.lineNumber <= filter.lineRange!.end
      );
    }

    // Time range
    if (filter.timeRange) {
      results = results.filter(
        e => e.timestamp >= filter.timeRange!.start && e.timestamp <= filter.timeRange!.end
      );
    }

    // Duration filters
    if (filter.minDuration !== undefined) {
      results = results.filter(e => e.duration !== undefined && e.duration >= filter.minDuration!);
    }
    if (filter.maxDuration !== undefined) {
      results = results.filter(e => e.duration !== undefined && e.duration <= filter.maxDuration!);
    }

    // Parent filter
    if (filter.parentId !== undefined) {
      results = results.filter(e => e.parentId === filter.parentId);
    }

    // Children filter
    if (filter.hasChildren !== undefined) {
      results = results.filter(e => 
        filter.hasChildren ? (e.children && e.children.length > 0) : (!e.children || e.children.length === 0)
      );
    }

    // Root only
    if (filter.rootOnly) {
      results = results.filter(e => e.parentId === -1);
    }

    // Text search
    if (filter.textSearch) {
      const searchLower = filter.textSearch.toLowerCase();
      results = results.filter(e => eventContainsText(e, searchLower));
    }

    // Custom predicate
    if (filter.predicate) {
      results = results.filter(filter.predicate);
    }

    return results;
  }

  /**
   * Query with pagination
   */
  queryPaginated(
    filter: EventFilter = {},
    pagination: PaginationOptions = { page: 1, pageSize: 50 },
    sort?: SortOptions<EventNode>
  ): QueryResult<EventNode> {
    let results = this.query(filter);

    // Sort
    if (sort) {
      results = sortEvents(results, sort);
    }

    // Paginate
    const totalCount = results.length;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);
    const start = (pagination.page - 1) * pagination.pageSize;
    const items = results.slice(start, start + pagination.pageSize);

    return {
      items,
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages,
      hasMore: pagination.page < totalPages,
    };
  }

  /**
   * Get event by ID
   */
  getById(id: number): EventNode | undefined {
    return this.eventMap.get(id);
  }

  /**
   * Get multiple events by IDs
   */
  getByIds(ids: number[]): EventNode[] {
    return ids.map(id => this.eventMap.get(id)).filter((e): e is EventNode => e !== undefined);
  }

  /**
   * Get children of an event
   */
  getChildren(parentId: number): EventNode[] {
    return this.events.filter(e => e.parentId === parentId);
  }

  /**
   * Get ancestors of an event (up to root)
   */
  getAncestors(eventId: number): EventNode[] {
    const ancestors: EventNode[] = [];
    let current = this.eventMap.get(eventId);

    while (current && current.parentId !== -1) {
      const parent = this.eventMap.get(current.parentId);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Get subtree of an event
   */
  getSubtree(eventId: number): EventNode[] {
    const result: EventNode[] = [];
    const collectSubtree = (id: number) => {
      const event = this.eventMap.get(id);
      if (event) {
        result.push(event);
        const children = this.getChildren(id);
        for (const child of children) {
          collectSubtree(child.id);
        }
      }
    };
    collectSubtree(eventId);
    return result;
  }

  // Type-specific queries

  /**
   * Get all SOQL events
   */
  getSOQLEvents(): SOQLEvent[] {
    return this.query({
      types: ['SOQL_EXECUTE_BEGIN', 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_EXPLAIN'],
    }) as SOQLEvent[];
  }

  /**
   * Get all DML events
   */
  getDMLEvents(): DMLEvent[] {
    return this.query({
      types: ['DML_BEGIN', 'DML_END'],
    }) as DMLEvent[];
  }

  /**
   * Get all method events
   */
  getMethodEvents(): MethodEvent[] {
    return this.query({
      types: ['METHOD_ENTRY', 'METHOD_EXIT', 'CONSTRUCTOR_ENTRY', 'CONSTRUCTOR_EXIT'],
    }) as MethodEvent[];
  }

  /**
   * Get all exception events
   */
  getExceptionEvents(): ExceptionEvent[] {
    return this.query({
      types: ['EXCEPTION_THROWN', 'FATAL_ERROR'],
    }) as ExceptionEvent[];
  }

  /**
   * Get all limit events
   */
  getLimitEvents(): LimitEvent[] {
    return this.query({
      types: ['LIMIT_USAGE', 'LIMIT_USAGE_FOR_NS', 'CUMULATIVE_LIMIT_USAGE', 'CUMULATIVE_LIMIT_USAGE_END'],
    }) as LimitEvent[];
  }

  /**
   * Get slow operations (events with duration > threshold)
   */
  getSlowOperations(thresholdMs: number): EventNode[] {
    const thresholdNs = thresholdMs * 1_000_000;
    return this.query({ minDuration: thresholdNs });
  }

  /**
   * Get events in managed packages only
   */
  getManagedPackageEvents(): EventNode[] {
    return this.events.filter(e => e.namespace && e.namespace.length > 0);
  }

  /**
   * Get unique namespaces
   */
  getNamespaces(): string[] {
    const namespaces = new Set<string>();
    for (const event of this.events) {
      if (event.namespace) {
        namespaces.add(event.namespace);
      }
    }
    return Array.from(namespaces);
  }

  /**
   * Get event count by type
   */
  getCountByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of this.events) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get timeline (events sorted by timestamp)
   */
  getTimeline(): EventNode[] {
    return [...this.events].sort((a, b) => a.timestamp - b.timestamp);
  }
}

// ============================================================================
// Issue Query Engine
// ============================================================================

/**
 * Query issues from analysis result
 */
export class IssueQueryEngine {
  private issues: Issue[];

  constructor(issues: Issue[]) {
    this.issues = issues;
  }

  /**
   * Query issues with filter
   */
  query(filter: IssueFilter = {}): Issue[] {
    let results = [...this.issues];

    // Type filter
    if (filter.types && filter.types.length > 0) {
      results = results.filter(i => filter.types!.includes(i.type));
    }

    // Category filter
    if (filter.categories && filter.categories.length > 0) {
      results = results.filter(i => filter.categories!.includes(i.category));
    }

    // Severity filters
    if (filter.minSeverity) {
      const minLevel = severityLevel(filter.minSeverity);
      results = results.filter(i => severityLevel(i.severity) >= minLevel);
    }
    if (filter.severities && filter.severities.length > 0) {
      results = results.filter(i => filter.severities!.includes(i.severity));
    }

    // Fixable only
    if (filter.fixableOnly) {
      results = results.filter(i => i.attribution.canModify);
    }

    // Namespace filter
    if (filter.namespaces && filter.namespaces.length > 0) {
      results = results.filter(i => 
        i.attribution.namespace && filter.namespaces!.includes(i.attribution.namespace)
      );
    }

    // Confidence filter
    if (filter.minConfidence !== undefined) {
      results = results.filter(i => i.confidence.score >= filter.minConfidence!);
    }

    // Text search
    if (filter.textSearch) {
      const searchLower = filter.textSearch.toLowerCase();
      results = results.filter(i =>
        i.title.toLowerCase().includes(searchLower) ||
        i.description.toLowerCase().includes(searchLower)
      );
    }

    // Custom predicate
    if (filter.predicate) {
      results = results.filter(filter.predicate);
    }

    return results;
  }

  /**
   * Query with pagination
   */
  queryPaginated(
    filter: IssueFilter = {},
    pagination: PaginationOptions = { page: 1, pageSize: 20 },
    sort?: SortOptions<Issue>
  ): QueryResult<Issue> {
    let results = this.query(filter);

    // Sort
    if (sort) {
      results = sortIssues(results, sort);
    }

    // Paginate
    const totalCount = results.length;
    const totalPages = Math.ceil(totalCount / pagination.pageSize);
    const start = (pagination.page - 1) * pagination.pageSize;
    const items = results.slice(start, start + pagination.pageSize);

    return {
      items,
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages,
      hasMore: pagination.page < totalPages,
    };
  }

  /**
   * Get critical and high severity issues
   */
  getCritical(): Issue[] {
    return this.query({ severities: ['CRITICAL', 'HIGH'] });
  }

  /**
   * Get fixable issues only
   */
  getFixable(): Issue[] {
    return this.query({ fixableOnly: true });
  }

  /**
   * Get issues by category
   */
  getByCategory(category: IssueCategory): Issue[] {
    return this.query({ categories: [category] });
  }

  /**
   * Group issues by category
   */
  groupByCategory(): Record<IssueCategory, Issue[]> {
    const groups: Record<IssueCategory, Issue[]> = {
      PERFORMANCE: [],
      GOVERNOR_LIMITS: [],
      ERROR: [],
      ANTI_PATTERN: [],
      SECURITY: [],
      DATA_QUALITY: [],
      BEST_PRACTICE: [],
      MANAGED_PACKAGE: [],
    };

    for (const issue of this.issues) {
      groups[issue.category].push(issue);
    }

    return groups;
  }

  /**
   * Group issues by severity
   */
  groupBySeverity(): Record<IssueSeverity, Issue[]> {
    const groups: Record<IssueSeverity, Issue[]> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
      INFO: [],
    };

    for (const issue of this.issues) {
      groups[issue.severity].push(issue);
    }

    return groups;
  }

  /**
   * Get related events for an issue
   */
  getRelatedEventIds(issueId: string): number[] {
    const issue = this.issues.find(i => i.id === issueId);
    return issue?.eventIds ?? [];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if event contains search text
 */
function eventContainsText(event: EventNode, searchLower: string): boolean {
  // Check type
  if (event.type.toLowerCase().includes(searchLower)) {
    return true;
  }

  // Check type-specific fields
  if ('query' in event && event.query?.toLowerCase().includes(searchLower)) {
    return true;
  }
  if ('methodName' in event && event.methodName?.toLowerCase().includes(searchLower)) {
    return true;
  }
  if ('className' in event && event.className?.toLowerCase().includes(searchLower)) {
    return true;
  }
  if ('message' in event && typeof event.message === 'string' && event.message.toLowerCase().includes(searchLower)) {
    return true;
  }
  if ('exceptionType' in event && event.exceptionType?.toLowerCase().includes(searchLower)) {
    return true;
  }
  if ('sobjectType' in event && event.sobjectType?.toLowerCase().includes(searchLower)) {
    return true;
  }

  return false;
}

/**
 * Sort events
 * Handles undefined/null values gracefully by pushing them to the end
 */
function sortEvents(events: EventNode[], sort: SortOptions<EventNode>): EventNode[] {
  return [...events].sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sort.field];
    const bVal = (b as unknown as Record<string, unknown>)[sort.field];

    // Handle undefined/null - push to end
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    let comparison = 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else {
      // Fallback: convert to string for comparison
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return sort.direction === 'desc' ? -comparison : comparison;
  });
}

/**
 * Sort issues
 * Handles undefined/null values gracefully by pushing them to the end
 */
function sortIssues(issues: Issue[], sort: SortOptions<Issue>): Issue[] {
  return [...issues].sort((a, b) => {
    let comparison = 0;

    if (sort.field === 'severity') {
      comparison = severityLevel(a.severity) - severityLevel(b.severity);
    } else if (sort.field === 'confidence') {
      comparison = a.confidence.score - b.confidence.score;
    } else {
      const aVal = (a as unknown as Record<string, unknown>)[sort.field];
      const bVal = (b as unknown as Record<string, unknown>)[sort.field];

      // Handle undefined/null - push to end
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        // Fallback: convert to string for comparison
        comparison = String(aVal).localeCompare(String(bVal));
      }
    }

    return sort.direction === 'desc' ? -comparison : comparison;
  });
}

/**
 * Convert severity to numeric level for comparison
 */
function severityLevel(severity: IssueSeverity): number {
  const levels: Record<IssueSeverity, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFO: 1,
  };
  return levels[severity];
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create event query engine from parsed log
 */
export function createEventQuery(parsedLog: ParsedLog): EventQueryEngine {
  return new EventQueryEngine(parsedLog);
}

/**
 * Create issue query engine from issues array
 */
export function createIssueQuery(issues: Issue[]): IssueQueryEngine {
  return new IssueQueryEngine(issues);
}

/**
 * Quick filter: get SOQL events in loops
 * Useful for debugging SOQL-in-loop issues
 */
export function findSOQLInLoops(parsedLog: ParsedLog): SOQLEvent[] {
  const query = new EventQueryEngine(parsedLog);
  const soqlEvents = query.getSOQLEvents();

  // Find SOQLs with METHOD_ENTRY parent that appears multiple times
  const methodCounts = new Map<number, number>();
  for (const event of parsedLog.events) {
    if (event.type === 'METHOD_ENTRY' || event.type === 'METHOD_EXIT') {
      const count = methodCounts.get(event.parentId) || 0;
      methodCounts.set(event.parentId, count + 1);
    }
  }

  return soqlEvents.filter(soql => {
    const ancestors = query.getAncestors(soql.id);
    return ancestors.some(a => 
      (a.type === 'METHOD_ENTRY' || a.type === 'METHOD_EXIT') && 
      (methodCounts.get(a.parentId) || 0) > 1
    );
  });
}

/**
 * Quick filter: get events around an exception
 */
export function getExceptionContext(
  parsedLog: ParsedLog,
  exceptionEventId: number,
  contextLines: number = 10
): EventNode[] {
  const query = new EventQueryEngine(parsedLog);
  const exception = query.getById(exceptionEventId);
  
  if (!exception) return [];

  // Get events in line range around exception
  return query.query({
    lineRange: {
      start: Math.max(1, exception.lineNumber - contextLines),
      end: exception.lineNumber + contextLines,
    },
  });
}
