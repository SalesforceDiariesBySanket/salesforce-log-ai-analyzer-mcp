/**
 * @module output/formatters/event-formatter
 * @description Format EventNode to compact JSON representation
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

import type { EventNode } from '../../types/events';
import type { CompactEvent } from './types';

// ============================================================================
// Event Formatting
// ============================================================================

/**
 * Format single event to compact form
 * 
 * @param event - The event node to format
 * @returns Compact event representation
 */
export function formatEvent(event: EventNode): CompactEvent {
  const compact: CompactEvent = {
    id: event.id,
    type: event.type,
    line: event.lineNumber,
    ts: event.timestamp,
  };

  if (event.duration !== undefined) {
    compact.dur = event.duration;
  }

  if (event.namespace) {
    compact.ns = event.namespace;
  }

  // Add type-specific data
  const data: Record<string, unknown> = {};

  // SOQL events
  if ('query' in event && event.query) {
    data.query = event.query;
  }
  if ('rowCount' in event && event.rowCount !== undefined) {
    data.rows = event.rowCount;
  }

  // DML events
  if ('operation' in event) {
    data.op = event.operation;
  }
  if ('sobjectType' in event) {
    data.sobj = event.sobjectType;
  }

  // Method events
  if ('methodName' in event) {
    data.method = event.methodName;
  }
  if ('className' in event) {
    data.class = event.className;
  }

  // Exception events
  if ('exceptionType' in event) {
    data.exType = event.exceptionType;
  }
  if ('message' in event && typeof event.message === 'string') {
    data.msg = event.message;
  }

  // Limit events
  if ('limitType' in event) {
    data.limitType = event.limitType;
  }
  if ('used' in event) {
    data.used = event.used;
  }
  if ('max' in event) {
    data.max = event.max;
  }

  if (Object.keys(data).length > 0) {
    compact.data = data;
  }

  return compact;
}

/**
 * Format multiple events with filtering
 * 
 * @param events - Events to format
 * @param options - Filter options
 * @returns Filtered and formatted events
 */
export function formatEvents(
  events: EventNode[],
  options: {
    eventTypes?: string[];
    maxEvents?: number;
  } = {}
): CompactEvent[] {
  let filtered = events;

  // Apply type filter
  if (options.eventTypes && options.eventTypes.length > 0) {
    filtered = filtered.filter(e => options.eventTypes!.includes(e.type));
  }

  // Apply limit
  if (options.maxEvents && options.maxEvents > 0) {
    filtered = filtered.slice(0, options.maxEvents);
  }

  return filtered.map(e => formatEvent(e));
}
