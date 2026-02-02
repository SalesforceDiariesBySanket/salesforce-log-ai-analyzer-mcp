/**
 * @module parser/event-handlers/soql
 * @description Handler for SOQL_EXECUTE_BEGIN, SOQL_EXECUTE_END, SOQL_EXECUTE_EXPLAIN events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

import type {
  LogToken,
  SOQLEvent,
  QueryPlan,
  EventHandler,
  ParseContext,
  EventType,
} from '../../types';

// ============================================================================
// SOQL Event Handler
// ============================================================================

/**
 * Parses SOQL query execution events
 *
 * Log formats:
 * - SOQL_EXECUTE_BEGIN|[line]|Aggregations:0|SELECT ...
 * - SOQL_EXECUTE_END|[line]|Rows:5
 * - SOQL_EXECUTE_EXPLAIN|[line]|...
 */
export const soqlEventHandler: EventHandler<SOQLEvent> = {
  eventTypes: ['SOQL_EXECUTE_BEGIN', 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_EXPLAIN'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): SOQLEvent {
    const { segments, eventType } = token;

    const event: SOQLEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: eventType as SOQLEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
    };

    switch (eventType) {
      case 'SOQL_EXECUTE_BEGIN':
        parseSOQLBegin(segments, event);
        break;
      case 'SOQL_EXECUTE_END':
        parseSOQLEnd(segments, event);
        break;
      case 'SOQL_EXECUTE_EXPLAIN':
        parseSOQLExplain(segments, event);
        break;
    }

    return event;
  },
};

// ============================================================================
// Parse Helpers
// ============================================================================

/**
 * Parse SOQL_EXECUTE_BEGIN segments
 * Format: [line]|Aggregations:0|SELECT Id, Name FROM Account
 */
function parseSOQLBegin(segments: string[], event: SOQLEvent): void {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;

    // Check for aggregations count
    const aggMatch = /^Aggregations:(\d+)$/i.exec(segment);
    if (aggMatch && aggMatch[1]) {
      event.aggregations = parseInt(aggMatch[1], 10);
      continue;
    }

    // Check for line reference
    if (/^\[\d+\]$/.test(segment)) {
      continue;
    }

    // The SOQL query is usually the last segment or after Aggregations
    if (segment.toUpperCase().startsWith('SELECT') || segment.toUpperCase().includes('FROM')) {
      // Collect the query (might span multiple segments if it contains pipes)
      event.query = segments.slice(i).join('|').trim();
      break;
    }
  }
}

/**
 * Parse SOQL_EXECUTE_END segments
 * Format: [line]|Rows:5
 */
function parseSOQLEnd(segments: string[], event: SOQLEvent): void {
  for (const segment of segments) {
    if (!segment) continue;
    // Check for row count
    const rowMatch = /^Rows:(\d+)$/i.exec(segment);
    if (rowMatch && rowMatch[1]) {
      event.rowCount = parseInt(rowMatch[1], 10);
      continue;
    }
  }
}

/**
 * Parse SOQL_EXECUTE_EXPLAIN segments
 * Format varies based on Salesforce version
 */
function parseSOQLExplain(segments: string[], event: SOQLEvent): void {
  // Query plan format:
  // TableEnumOrId, Cardinality, Cost, Fields, LeadingOperationType, RelativeCost, SobjectType
  // This is simplified - actual format may vary

  const queryPlan: Partial<QueryPlan> = {};

  for (const segment of segments) {
    if (!segment) continue;
    // Cardinality
    const cardMatch = /Cardinality[:\s]*(\d+)/i.exec(segment);
    if (cardMatch && cardMatch[1]) {
      queryPlan.cardinality = parseInt(cardMatch[1], 10);
    }

    // RelativeCost
    const costMatch = /RelativeCost[:\s]*([\d.]+)/i.exec(segment);
    if (costMatch && costMatch[1]) {
      queryPlan.relativeCost = parseFloat(costMatch[1]);
    }

    // SobjectType
    const typeMatch = /SobjectType[:\s]*(\w+)/i.exec(segment);
    if (typeMatch) {
      queryPlan.sobjectType = typeMatch[1];
    }

    // LeadingOperationType
    const opMatch = /LeadingOperationType[:\s]*(\w+)/i.exec(segment);
    if (opMatch) {
      queryPlan.leadingOperationType = opMatch[1];
    }
  }

  if (Object.keys(queryPlan).length > 0) {
    event.queryPlan = queryPlan as QueryPlan;
  }
}

/**
 * Extract SObject type from a SOQL query
 */
export function extractSObjectFromQuery(query: string): string | undefined {
  const fromMatch = /FROM\s+(\w+)/i.exec(query);
  return fromMatch ? fromMatch[1] : undefined;
}

/**
 * Check if query is potentially non-selective
 * (Simple heuristic - real detection needs EXPLAIN plan)
 */
export function isLikelyNonSelective(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // No WHERE clause
  if (!lowerQuery.includes('where')) {
    return true;
  }

  // LIKE with leading wildcard
  if (/%/.test(lowerQuery) && /like\s+'%/.test(lowerQuery)) {
    return true;
  }

  // NOT IN or != comparisons
  if (/not\s+in|!=/.test(lowerQuery)) {
    return true;
  }

  return false;
}

// Note: Default export removed per CONVENTIONS.md
// Use named import: import { soqlEventHandler } from './soql'
