/**
 * @module parser/event-handlers/dml
 * @description Handler for DML_BEGIN and DML_END events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

import type {
  LogToken,
  DMLEvent,
  EventHandler,
  ParseContext,
  EventType,
} from '../../types';

// ============================================================================
// DML Event Handler
// ============================================================================

/**
 * Parses DML operation events
 *
 * Log formats:
 * - DML_BEGIN|[line]|Op:Insert|Type:Account|Rows:5
 * - DML_END|[line]|Rows:5
 */
export const dmlEventHandler: EventHandler<DMLEvent> = {
  eventTypes: ['DML_BEGIN', 'DML_END'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): DMLEvent {
    const { segments, eventType } = token;

    // Default values
    let operation: DMLEvent['operation'] = 'INSERT';
    let sobjectType = 'Unknown';
    let rowCount: number | undefined;

    for (const segment of segments) {
      if (!segment) continue;
      
      // Skip line reference
      if (/^\[\d+\]$/.test(segment)) {
        continue;
      }

      // Parse operation type
      const opMatch = /^Op:(\w+)$/i.exec(segment);
      if (opMatch && opMatch[1]) {
        operation = normalizeOperation(opMatch[1]);
        continue;
      }

      // Parse SObject type
      const typeMatch = /^Type:(\w+)$/i.exec(segment);
      if (typeMatch && typeMatch[1]) {
        sobjectType = typeMatch[1];
        continue;
      }

      // Parse row count
      const rowMatch = /^Rows:(\d+)$/i.exec(segment);
      if (rowMatch && rowMatch[1]) {
        rowCount = parseInt(rowMatch[1], 10);
        continue;
      }

      // Legacy format: "Insert|Account"
      if (isOperationType(segment)) {
        operation = normalizeOperation(segment);
        continue;
      }

      // Could be SObject type without prefix
      if (/^[A-Z]\w*(__c)?$/.test(segment)) {
        sobjectType = segment;
      }
    }

    const event: DMLEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: eventType as DMLEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      operation,
      sobjectType,
      rowCount,
    };

    return event;
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * DML operation types
 */
const OPERATION_TYPES: Record<string, DMLEvent['operation']> = {
  insert: 'INSERT',
  update: 'UPDATE',
  delete: 'DELETE',
  upsert: 'UPSERT',
  undelete: 'UNDELETE',
  merge: 'MERGE',
};

/**
 * Normalize operation string to enum value
 */
function normalizeOperation(op: string): DMLEvent['operation'] {
  const normalized = OPERATION_TYPES[op.toLowerCase()];
  return normalized || 'INSERT';
}

/**
 * Check if string is a valid operation type
 */
function isOperationType(str: string): boolean {
  return str.toLowerCase() in OPERATION_TYPES;
}

/**
 * Check if DML operation is a write operation
 * (affects data modification)
 */
export function isWriteOperation(op: DMLEvent['operation']): boolean {
  return ['INSERT', 'UPDATE', 'UPSERT', 'DELETE', 'MERGE'].includes(op);
}

/**
 * Estimate DML governor limit impact
 */
export function estimateDMLImpact(operation: DMLEvent['operation'], rowCount: number): number {
  // All DML operations count as 1 DML statement
  // But rows affect row count limits differently
  switch (operation) {
    case 'DELETE':
    case 'UNDELETE':
      return rowCount; // Each row is a separate operation
    case 'MERGE':
      return rowCount * 2; // Merge affects multiple records
    default:
      return rowCount;
  }
}
