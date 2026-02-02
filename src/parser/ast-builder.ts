/**
 * @module parser/ast-builder
 * @description Builds an event tree (AST) from a flat list of parsed events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

import type {
  EventNode,
  BaseEvent,
  ParseContext,
  MethodEvent,
  Duration,
} from '../types';

// ============================================================================
// AST Builder
// ============================================================================

/**
 * Builds an event tree from a flat list of events
 * Handles nesting of method calls, code units, etc.
 *
 * @param events - Flat list of events in timestamp order
 * @returns Root event with nested children
 */
export function buildEventTree(events: EventNode[]): BaseEvent {
  // Create synthetic root event
  const root: BaseEvent = {
    id: 0,
    parentId: -1,
    type: 'EXECUTION_STARTED',
    timestamp: events[0]?.timestamp ?? 0,
    lineNumber: 0,
    children: [],
  };

  if (events.length === 0) {
    return root;
  }

  // Stack for tracking parent relationships
  const parentStack: EventNode[] = [root];

  // Map for quick lookups
  const eventMap = new Map<number, EventNode>();
  eventMap.set(root.id, root);

  for (const event of events) {
    // Get current parent (should always exist since we initialize with root)
    const currentParent = parentStack[parentStack.length - 1];
    if (!currentParent) continue;

    // Update event's parent ID
    event.parentId = currentParent.id;

    // Add to parent's children
    if (!currentParent.children) {
      currentParent.children = [];
    }
    currentParent.children.push(event);

    // Add to map
    eventMap.set(event.id, event);

    // Handle stack management based on event type
    if (isEntryEvent(event)) {
      // Push onto stack for nesting
      parentStack.push(event);
    } else if (isExitEvent(event)) {
      // Pop from stack
      if (parentStack.length > 1) {
        const entryEvent = parentStack.pop();
        // Calculate duration between entry and exit
        if (entryEvent && event.timestamp > entryEvent.timestamp) {
          entryEvent.duration = event.timestamp - entryEvent.timestamp;
        }
      }
    }
  }

  return root;
}

/**
 * Creates a parse context for event handlers
 */
export function createParseContext(): ParseContext {
  let eventIdCounter = 0;

  return {
    nextId: () => ++eventIdCounter,
    currentParentId: 0,
    parentStack: [0],
    eventMap: new Map(),
  };
}

/**
 * Updates the parse context after processing an event
 */
export function updateParseContext(
  context: ParseContext,
  event: EventNode
): void {
  // Store event in map
  context.eventMap.set(event.id, event);

  // Update stack based on event type
  if (isEntryEvent(event)) {
    context.parentStack.push(event.id);
    context.currentParentId = event.id;
  } else if (isExitEvent(event)) {
    if (context.parentStack.length > 1) {
      context.parentStack.pop();
      context.currentParentId = context.parentStack[context.parentStack.length - 1] ?? 0;
    }
  }

  // Update previous event reference
  context.previousEvent = event;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if event is an "entry" type that should push to stack
 */
function isEntryEvent(event: EventNode): boolean {
  const entryTypes = [
    'METHOD_ENTRY',
    'CONSTRUCTOR_ENTRY',
    'CODE_UNIT_STARTED',
    'SOQL_EXECUTE_BEGIN',
    'DML_BEGIN',
    'FLOW_START_INTERVIEW_BEGIN',
    'FLOW_ELEMENT_BEGIN',
    'EXECUTION_STARTED',
    'ENTERING_MANAGED_PKG',
    // System method events (built-in Apex methods)
    'SYSTEM_METHOD_ENTRY',
    'SYSTEM_CONSTRUCTOR_ENTRY',
    'SYSTEM_MODE_ENTER',
  ];

  return entryTypes.includes(event.type);
}

/**
 * Check if event is an "exit" type that should pop from stack
 */
function isExitEvent(event: EventNode): boolean {
  const exitTypes = [
    'METHOD_EXIT',
    'CONSTRUCTOR_EXIT',
    'CODE_UNIT_FINISHED',
    'SOQL_EXECUTE_END',
    'DML_END',
    'FLOW_START_INTERVIEW_END',
    'FLOW_ELEMENT_END',
    'EXECUTION_FINISHED',
    // System method events (built-in Apex methods)
    'SYSTEM_METHOD_EXIT',
    'SYSTEM_CONSTRUCTOR_EXIT',
    'SYSTEM_MODE_EXIT',
  ];

  return exitTypes.includes(event.type);
}

/**
 * Find matching entry event for an exit event
 */
export function findMatchingEntry(
  exitEvent: EventNode,
  eventMap: Map<number, EventNode>
): EventNode | null {
  const exitToEntry: Record<string, string[]> = {
    METHOD_EXIT: ['METHOD_ENTRY'],
    CONSTRUCTOR_EXIT: ['CONSTRUCTOR_ENTRY'],
    CODE_UNIT_FINISHED: ['CODE_UNIT_STARTED'],
    SOQL_EXECUTE_END: ['SOQL_EXECUTE_BEGIN'],
    DML_END: ['DML_BEGIN'],
    EXECUTION_FINISHED: ['EXECUTION_STARTED'],
    FLOW_START_INTERVIEW_END: ['FLOW_START_INTERVIEW_BEGIN'],
    FLOW_ELEMENT_END: ['FLOW_ELEMENT_BEGIN'],
    // System method events
    SYSTEM_METHOD_EXIT: ['SYSTEM_METHOD_ENTRY'],
    SYSTEM_CONSTRUCTOR_EXIT: ['SYSTEM_CONSTRUCTOR_ENTRY'],
    SYSTEM_MODE_EXIT: ['SYSTEM_MODE_ENTER'],
  };

  const possibleEntryTypes = exitToEntry[exitEvent.type] || [];

  // Search backwards through events for matching entry
  // This is a simplified approach - real matching would use the stack
  for (const [, event] of eventMap) {
    if (possibleEntryTypes.includes(event.type)) {
      // Check if this entry could match the exit
      // For methods, check class/method name match
      if (isMethodEvent(event) && isMethodEvent(exitEvent)) {
        if (
          (event as MethodEvent).className === (exitEvent as MethodEvent).className &&
          (event as MethodEvent).methodName === (exitEvent as MethodEvent).methodName
        ) {
          return event;
        }
      } else {
        // Generic match by type
        return event;
      }
    }
  }

  return null;
}

/**
 * Type guard for MethodEvent
 */
function isMethodEvent(event: EventNode): event is MethodEvent {
  return (
    event.type === 'METHOD_ENTRY' ||
    event.type === 'METHOD_EXIT' ||
    event.type === 'CONSTRUCTOR_ENTRY' ||
    event.type === 'CONSTRUCTOR_EXIT'
  );
}

/**
 * Calculate total duration for a subtree
 */
export function calculateSubtreeDuration(event: EventNode): Duration {
  let total = event.duration || 0;

  if (event.children) {
    for (const child of event.children) {
      total += calculateSubtreeDuration(child);
    }
  }

  return total;
}

/**
 * Flatten event tree back to array
 */
export function flattenEventTree(root: EventNode): EventNode[] {
  const result: EventNode[] = [];

  function traverse(event: EventNode): void {
    result.push(event);
    if (event.children) {
      for (const child of event.children) {
        traverse(child);
      }
    }
  }

  traverse(root);
  return result;
}

/**
 * Get max depth of event tree
 */
export function getTreeDepth(root: EventNode): number {
  if (!root.children || root.children.length === 0) {
    return 1;
  }

  let maxChildDepth = 0;
  for (const child of root.children) {
    const childDepth = getTreeDepth(child);
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth;
    }
  }

  return 1 + maxChildDepth;
}
