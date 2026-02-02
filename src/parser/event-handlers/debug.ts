/**
 * @module parser/event-handlers/debug
 * @description Handler for USER_DEBUG, VARIABLE_ASSIGNMENT, STATEMENT_EXECUTE events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-02-01
 * 
 * These events are critical for LOGIC DEBUGGING:
 * - USER_DEBUG: System.debug() output - shows developer's debugging messages
 * - VARIABLE_ASSIGNMENT: Variable values at runtime - shows data flow
 * - STATEMENT_EXECUTE: Line execution - shows which code paths were taken
 */

import type {
  LogToken,
  EventHandler,
  ParseContext,
  EventType,
  DebugEvent,
  VariableAssignmentEvent,
  StatementExecuteEvent,
} from '../../types';

// ============================================================================
// Debug Event Handler (USER_DEBUG, SYSTEM_DEBUG)
// ============================================================================

/**
 * Parses USER_DEBUG and SYSTEM_DEBUG events
 *
 * Log format:
 * - USER_DEBUG|[line]|DEBUG|message
 * - USER_DEBUG|[line]|INFO|message
 * - SYSTEM_DEBUG|[line]|message
 * 
 * @example
 * 12:34:56.789 (123)|USER_DEBUG|[42]|DEBUG|Order total: 1500.00
 * 12:34:56.789 (123)|USER_DEBUG|[43]|INFO|Processing complete
 */
export const debugEventHandler: EventHandler<DebugEvent> = {
  eventTypes: ['USER_DEBUG', 'SYSTEM_DEBUG'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): DebugEvent {
    const { segments } = token;

    // Parse source location (e.g., "[42]")
    const sourceLocation = segments[0] || undefined;

    // Parse log level and message
    // Format: [line]|LEVEL|message or [line]|message
    let level: string | undefined;
    let message: string;

    if (segments.length >= 3) {
      // Has level: [42]|DEBUG|message
      level = segments[1];
      message = segments.slice(2).join('|');
    } else if (segments.length === 2) {
      // No level: [42]|message
      message = segments[1] || '';
    } else {
      message = segments[0] || '';
    }

    // Extract line number from source location
    const lineMatch = sourceLocation?.match(/\[(\d+)\]/);
    const sourceLine = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : undefined;

    const event: DebugEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as DebugEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      message,
      level,
      sourceLocation,
      sourceLine,
    };

    return event;
  },
};

// ============================================================================
// Variable Assignment Event Handler
// ============================================================================

/**
 * Parses VARIABLE_ASSIGNMENT events
 *
 * Log format:
 * - VARIABLE_ASSIGNMENT|[line]|variableName|value|address
 * - VARIABLE_ASSIGNMENT|[EXTERNAL]|this|{...}|address
 * 
 * @example
 * 12:34:56.789 (123)|VARIABLE_ASSIGNMENT|[42]|discount|150.00|0x1234
 * 12:34:56.789 (123)|VARIABLE_ASSIGNMENT|[EXTERNAL]|this|{"name":"Test"}|0x5678
 */
export const variableAssignmentEventHandler: EventHandler<VariableAssignmentEvent> = {
  eventTypes: ['VARIABLE_ASSIGNMENT'],

  canHandle(token: LogToken): boolean {
    return token.eventType === 'VARIABLE_ASSIGNMENT';
  },

  handle(token: LogToken, context: ParseContext): VariableAssignmentEvent {
    const { segments } = token;

    // Parse source location (e.g., "[42]" or "[EXTERNAL]")
    const sourceLocation = segments[0] || undefined;
    const isExternal = sourceLocation === '[EXTERNAL]';

    // Parse variable name
    const variableName = segments[1] || '<unknown>';

    // Parse value (can be complex JSON)
    const rawValue = segments[2] || '';
    
    // Parse memory address (optional)
    const address = segments[3] || undefined;

    // Try to parse JSON value, otherwise keep as string
    let value: unknown = rawValue;
    let valueType: string = 'String';
    
    if (rawValue.startsWith('{') || rawValue.startsWith('[')) {
      try {
        value = JSON.parse(rawValue);
        valueType = Array.isArray(value) ? 'List' : 'Object';
      } catch {
        // Keep as string if JSON parsing fails
        value = rawValue;
      }
    } else if (rawValue === 'null') {
      value = null;
      valueType = 'null';
    } else if (rawValue === 'true' || rawValue === 'false') {
      value = rawValue === 'true';
      valueType = 'Boolean';
    } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      value = parseFloat(rawValue);
      valueType = rawValue.includes('.') ? 'Decimal' : 'Integer';
    }

    // Extract line number from source location
    const lineMatch = sourceLocation?.match(/\[(\d+)\]/);
    const sourceLine = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : undefined;

    const event: VariableAssignmentEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: 'VARIABLE_ASSIGNMENT',
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      variableName,
      value,
      valueType,
      rawValue,
      address,
      sourceLocation,
      sourceLine,
      isExternal,
    };

    return event;
  },
};

// ============================================================================
// Statement Execute Event Handler
// ============================================================================

/**
 * Parses STATEMENT_EXECUTE events
 *
 * Log format:
 * - STATEMENT_EXECUTE|[line]
 * 
 * @example
 * 12:34:56.789 (123)|STATEMENT_EXECUTE|[42]
 * 12:34:56.789 (124)|STATEMENT_EXECUTE|[43]
 * 12:34:56.789 (125)|STATEMENT_EXECUTE|[45]  // Line 44 was skipped (branch not taken)
 */
export const statementExecuteEventHandler: EventHandler<StatementExecuteEvent> = {
  eventTypes: ['STATEMENT_EXECUTE'],

  canHandle(token: LogToken): boolean {
    return token.eventType === 'STATEMENT_EXECUTE';
  },

  handle(token: LogToken, context: ParseContext): StatementExecuteEvent {
    const { segments } = token;

    // Parse source location (e.g., "[42]")
    const sourceLocation = segments[0] || undefined;

    // Extract line number from source location
    const lineMatch = sourceLocation?.match(/\[(\d+)\]/);
    const sourceLine = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : undefined;

    const event: StatementExecuteEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: 'STATEMENT_EXECUTE',
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      sourceLocation,
      sourceLine,
    };

    return event;
  },
};

// ============================================================================
// Helper Functions for Logic Debugging
// ============================================================================

/**
 * Group variable assignments by variable name
 * Useful for tracking how a variable changes over time
 */
export function groupVariableHistory(
  events: VariableAssignmentEvent[]
): Map<string, VariableAssignmentEvent[]> {
  const history = new Map<string, VariableAssignmentEvent[]>();
  
  for (const event of events) {
    const existing = history.get(event.variableName) || [];
    existing.push(event);
    history.set(event.variableName, existing);
  }
  
  return history;
}

/**
 * Find gaps in statement execution (branches not taken)
 * Returns line numbers that were skipped
 */
export function findSkippedLines(
  events: StatementExecuteEvent[]
): number[] {
  if (events.length < 2) return [];
  
  const skipped: number[] = [];
  const sortedEvents = [...events].sort((a, b) => 
    (a.sourceLine || 0) - (b.sourceLine || 0)
  );
  
  for (let i = 1; i < sortedEvents.length; i++) {
    const prev = sortedEvents[i - 1]?.sourceLine;
    const curr = sortedEvents[i]?.sourceLine;
    
    if (prev && curr && curr - prev > 1) {
      // Lines between prev and curr were skipped
      for (let line = prev + 1; line < curr; line++) {
        skipped.push(line);
      }
    }
  }
  
  return skipped;
}

/**
 * Build execution trace for a method
 * Combines statement execution with variable assignments
 */
export interface ExecutionStep {
  line: number;
  timestamp: number;
  type: 'statement' | 'variable' | 'debug';
  detail?: string;
  value?: unknown;
}

export function buildExecutionTrace(
  statements: StatementExecuteEvent[],
  variables: VariableAssignmentEvent[],
  debugs: DebugEvent[]
): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  
  // Add statement executions
  for (const stmt of statements) {
    if (stmt.sourceLine) {
      steps.push({
        line: stmt.sourceLine,
        timestamp: stmt.timestamp,
        type: 'statement',
      });
    }
  }
  
  // Add variable assignments
  for (const variable of variables) {
    if (variable.sourceLine) {
      steps.push({
        line: variable.sourceLine,
        timestamp: variable.timestamp,
        type: 'variable',
        detail: variable.variableName,
        value: variable.value,
      });
    }
  }
  
  // Add debug statements
  for (const debug of debugs) {
    if (debug.sourceLine) {
      steps.push({
        line: debug.sourceLine,
        timestamp: debug.timestamp,
        type: 'debug',
        detail: debug.message,
      });
    }
  }
  
  // Sort by timestamp
  steps.sort((a, b) => a.timestamp - b.timestamp);
  
  return steps;
}

/**
 * Extract debug messages that match a pattern
 * Useful for finding specific debug output
 */
export function findDebugMessages(
  events: DebugEvent[],
  pattern: string | RegExp
): DebugEvent[] {
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  return events.filter(e => regex.test(e.message));
}
