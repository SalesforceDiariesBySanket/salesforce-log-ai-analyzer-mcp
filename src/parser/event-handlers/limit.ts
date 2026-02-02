/**
 * @module parser/event-handlers/limit
 * @description Handler for LIMIT_USAGE and CUMULATIVE_LIMIT_USAGE events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts, src/constants.ts
 * @lastModified 2026-01-31
 */

import type {
  LogToken,
  LimitEvent,
  LimitUsage,
  EventHandler,
  ParseContext,
  EventType,
} from '../../types';
import { LIMIT_THRESHOLDS } from '../../constants';

// ============================================================================
// Limit Event Handler
// ============================================================================

/**
 * Parses governor limit usage events
 *
 * Log formats:
 * - LIMIT_USAGE|limit_name|used out of max
 * - LIMIT_USAGE_FOR_NS|namespace||limit_name: used out of max
 * - CUMULATIVE_LIMIT_USAGE
 * - CUMULATIVE_LIMIT_USAGE_END
 */
export const limitEventHandler: EventHandler<LimitEvent> = {
  eventTypes: [
    'LIMIT_USAGE',
    'LIMIT_USAGE_FOR_NS',
    'CUMULATIVE_LIMIT_USAGE',
    'CUMULATIVE_LIMIT_USAGE_END',
  ],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): LimitEvent {
    const { segments, eventType } = token;

    const event: LimitEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: eventType as LimitEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
    };

    switch (eventType) {
      case 'LIMIT_USAGE':
        parseSingleLimit(segments, event);
        break;
      case 'LIMIT_USAGE_FOR_NS':
        parseNamespaceLimit(segments, event);
        break;
      case 'CUMULATIVE_LIMIT_USAGE':
      case 'CUMULATIVE_LIMIT_USAGE_END':
        // These are markers; actual limits follow on subsequent lines
        event.limits = [];
        break;
    }

    return event;
  },
};

// ============================================================================
// Parse Helpers
// ============================================================================

/**
 * Parse single LIMIT_USAGE line
 * Format: LIMIT_NAME: used out of max
 */
function parseSingleLimit(segments: string[], event: LimitEvent): void {
  const combined = segments.join('|');

  // Try to match "LimitName: X out of Y" format
  const match = /^([^:]+):\s*(\d+)\s+out\s+of\s+(\d+)/i.exec(combined);
  if (match && match[1] && match[2] && match[3]) {
    event.limitName = match[1].trim();
    event.used = parseInt(match[2], 10);
    event.max = parseInt(match[3], 10);
  }
}

/**
 * Parse LIMIT_USAGE_FOR_NS line
 * Format: namespace||LIMIT_NAME: used out of max
 */
function parseNamespaceLimit(segments: string[], event: LimitEvent): void {
  if (segments.length >= 1) {
    event.namespace = segments[0] || undefined;
  }

  // Rest is similar to single limit
  const remaining = segments.slice(1).join('|');
  const match = /([^:]+):\s*(\d+)\s+out\s+of\s+(\d+)/i.exec(remaining);
  if (match && match[1] && match[2] && match[3]) {
    event.limitName = match[1].trim();
    event.used = parseInt(match[2], 10);
    event.max = parseInt(match[3], 10);
  }
}

/**
 * Parse cumulative limit section (multi-line)
 * Called when we see CUMULATIVE_LIMIT_USAGE marker
 */
export function parseCumulativeLimits(lines: string[]): LimitUsage[] {
  const limits: LimitUsage[] = [];

  for (const line of lines) {
    // Format: "Number of SOQL queries: 5 out of 100"
    const match = /^\s*([^:]+):\s*(\d+)\s+out\s+of\s+(\d+)/i.exec(line);
    if (match && match[1] && match[2] && match[3]) {
      const used = parseInt(match[2], 10);
      const max = parseInt(match[3], 10);
      limits.push({
        name: match[1].trim(),
        used,
        max,
        percentUsed: max > 0 ? (used / max) * 100 : 0,
      });
    }
  }

  return limits;
}

// ============================================================================
// Limit Analysis Utilities
// ============================================================================

/**
 * Known Salesforce governor limits with their names
 */
export const GOVERNOR_LIMITS: Record<string, { name: string; syncLimit: number; asyncLimit: number }> = {
  SOQL_QUERIES: { name: 'Number of SOQL queries', syncLimit: 100, asyncLimit: 200 },
  SOQL_ROWS: { name: 'Number of query rows', syncLimit: 50000, asyncLimit: 50000 },
  DML_STATEMENTS: { name: 'Number of DML statements', syncLimit: 150, asyncLimit: 150 },
  DML_ROWS: { name: 'Number of DML rows', syncLimit: 10000, asyncLimit: 10000 },
  CPU_TIME: { name: 'Maximum CPU time', syncLimit: 10000, asyncLimit: 60000 },
  HEAP_SIZE: { name: 'Maximum heap size', syncLimit: 6000000, asyncLimit: 12000000 },
  CALLOUTS: { name: 'Number of callouts', syncLimit: 100, asyncLimit: 100 },
  FUTURE_CALLS: { name: 'Number of future calls', syncLimit: 50, asyncLimit: 50 },
  QUEUEABLE_JOBS: { name: 'Number of queueable jobs', syncLimit: 50, asyncLimit: 1 },
};

/**
 * Check if a limit usage is concerning (near limit)
 */
export function isLimitConcerning(limit: LimitUsage): boolean {
  return limit.percentUsed >= LIMIT_THRESHOLDS.MEDIUM;
}

/**
 * Check if a limit is exceeded
 */
export function isLimitExceeded(limit: LimitUsage): boolean {
  return limit.used >= limit.max;
}

/**
 * Get severity based on limit percentage
 */
export function getLimitSeverity(percentUsed: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (percentUsed >= LIMIT_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (percentUsed >= LIMIT_THRESHOLDS.HIGH) return 'HIGH';
  if (percentUsed >= LIMIT_THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}
