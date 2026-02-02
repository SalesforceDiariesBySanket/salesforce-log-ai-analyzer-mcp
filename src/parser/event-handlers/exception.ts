/**
 * @module parser/event-handlers/exception
 * @description Handler for EXCEPTION_THROWN and FATAL_ERROR events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

import type {
  LogToken,
  ExceptionEvent,
  EventHandler,
  ParseContext,
  EventType,
} from '../../types';

// ============================================================================
// Exception Event Handler
// ============================================================================

/**
 * Parses exception and fatal error events
 *
 * Log formats:
 * - EXCEPTION_THROWN|[line]|System.NullPointerException: message
 * - FATAL_ERROR|System.LimitException: message
 */
export const exceptionEventHandler: EventHandler<ExceptionEvent> = {
  eventTypes: ['EXCEPTION_THROWN', 'FATAL_ERROR'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): ExceptionEvent {
    const { segments, eventType } = token;

    // Combine all segments for parsing
    const combined = segments.join('|');

    // Parse exception type and message
    const { exceptionType, message } = parseExceptionString(combined);

    const event: ExceptionEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: eventType as ExceptionEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      exceptionType,
      message,
    };

    return event;
  },
};

// ============================================================================
// Parse Helpers
// ============================================================================

/**
 * Parse exception string into type and message
 *
 * @example
 * parseExceptionString("System.NullPointerException: Attempt to de-reference a null object")
 * // Returns: { exceptionType: "System.NullPointerException", message: "Attempt to de-reference a null object" }
 */
function parseExceptionString(str: string): {
  exceptionType: string;
  message: string;
} {
  // Remove line reference if present
  const cleaned = str.replace(/^\[[\d\s]*\]\|?/, '').trim();

  // Match exception type and message
  // Format: "System.ExceptionType: Message text here"
  const match = /^([\w.]+(?:Exception|Error)?):?\s*(.*)$/i.exec(cleaned);

  if (match && match[1]) {
    return {
      exceptionType: match[1],
      message: match[2] ?? '',
    };
  }

  // Fallback: couldn't parse, use entire string as message
  return {
    exceptionType: 'Unknown',
    message: cleaned,
  };
}

/**
 * Parse stack trace lines (when available in subsequent lines)
 */
export function parseStackTrace(lines: string[]): string[] {
  const stackLines: string[] = [];

  for (const line of lines) {
    // Stack trace lines typically start with "Class." or "Trigger."
    // Format: "Class.ClassName.methodName: line X, column Y"
    const trimmed = line.trim();

    if (/^(Class|Trigger)\.\w+/.test(trimmed)) {
      stackLines.push(trimmed);
    } else if (/^at\s+/.test(trimmed)) {
      // Java-style "at" prefix
      stackLines.push(trimmed);
    } else if (/^line\s+\d+/i.test(trimmed)) {
      // Line reference
      stackLines.push(trimmed);
    }
  }

  return stackLines;
}

// ============================================================================
// Exception Analysis Utilities
// ============================================================================

/**
 * Common Salesforce exception types
 */
export const EXCEPTION_TYPES: Record<string, {
  category: string;
  canFix: boolean;
  commonCause: string;
}> = {
  'System.NullPointerException': {
    category: 'NULL_REFERENCE',
    canFix: true,
    commonCause: 'Accessing property or method on null variable',
  },
  'System.LimitException': {
    category: 'GOVERNOR_LIMIT',
    canFix: true,
    commonCause: 'Governor limit exceeded (SOQL, DML, CPU, Heap)',
  },
  'System.QueryException': {
    category: 'QUERY',
    canFix: true,
    commonCause: 'Query returned no rows with limit or list index out of bounds',
  },
  'System.DmlException': {
    category: 'DML',
    canFix: true,
    commonCause: 'DML operation failed (validation, trigger, required field)',
  },
  'System.CalloutException': {
    category: 'CALLOUT',
    canFix: true,
    commonCause: 'HTTP callout failed (timeout, endpoint, auth)',
  },
  'System.TypeException': {
    category: 'TYPE',
    canFix: true,
    commonCause: 'Invalid type conversion or cast',
  },
  'System.ListException': {
    category: 'COLLECTION',
    canFix: true,
    commonCause: 'List index out of bounds',
  },
  'System.MathException': {
    category: 'MATH',
    canFix: true,
    commonCause: 'Division by zero or overflow',
  },
  'System.AsyncException': {
    category: 'ASYNC',
    canFix: true,
    commonCause: 'Async operation limit or chaining issue',
  },
  'System.SecurityException': {
    category: 'SECURITY',
    canFix: true,
    commonCause: 'CRUD/FLS violation or sharing issue',
  },
  'System.SObjectException': {
    category: 'SOBJECT',
    canFix: true,
    commonCause: 'Field not queryable or accessible',
  },
};

/**
 * Get exception metadata
 */
export function getExceptionInfo(exceptionType: string): {
  category: string;
  canFix: boolean;
  commonCause: string;
} {
  // Try exact match first
  const exactMatch = EXCEPTION_TYPES[exceptionType];
  if (exactMatch) {
    return exactMatch;
  }

  // Try partial match (namespace prefix)
  for (const [key, info] of Object.entries(EXCEPTION_TYPES)) {
    if (exceptionType.endsWith(key.split('.').pop() || '')) {
      return info;
    }
  }

  return {
    category: 'UNKNOWN',
    canFix: true,
    commonCause: 'Unknown exception type',
  };
}

/**
 * Check if exception is a governor limit exception
 */
export function isGovernorLimitException(exceptionType: string): boolean {
  return exceptionType.includes('LimitException');
}

/**
 * Check if exception is a null pointer exception
 */
export function isNullPointerException(exceptionType: string): boolean {
  return exceptionType.includes('NullPointerException');
}
