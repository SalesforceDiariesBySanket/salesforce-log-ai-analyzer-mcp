/**
 * @module parser/event-handlers/method
 * @description Handler for METHOD_ENTRY, METHOD_EXIT, CONSTRUCTOR_ENTRY, CONSTRUCTOR_EXIT events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

import type {
  LogToken,
  MethodEvent,
  EventHandler,
  ParseContext,
  EventType,
} from '../../types';

// ============================================================================
// Method Event Handler
// ============================================================================

/**
 * Parses method and constructor entry/exit events
 *
 * Log formats:
 * - METHOD_ENTRY|[line]|signature
 * - METHOD_ENTRY|[line]|class.method
 * - METHOD_EXIT|[line]|signature
 * - CONSTRUCTOR_ENTRY|[line]|class.<init>
 */
export const methodEventHandler: EventHandler<MethodEvent> = {
  eventTypes: [
    'METHOD_ENTRY',
    'METHOD_EXIT',
    'CONSTRUCTOR_ENTRY',
    'CONSTRUCTOR_EXIT',
  ],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): MethodEvent {
    const { segments } = token;

    // Parse source location (e.g., "[42]")
    const sourceLocation = segments[0] || undefined;

    // Parse method signature from remaining segments
    const signaturePart = segments.slice(1).join('|') || segments[0] || '';
    const { className, methodName } = parseMethodSignature(signaturePart);

    const event: MethodEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as MethodEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      methodName,
      className,
      sourceLocation,
    };

    return event;
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse method signature into class and method names
 *
 * @example
 * parseMethodSignature("MyClass.doWork") // { className: "MyClass", methodName: "doWork" }
 * parseMethodSignature("ns__MyClass.doWork") // { className: "ns__MyClass", methodName: "doWork" }
 * parseMethodSignature("[42]|MyClass") // { className: "MyClass", methodName: "<unknown>" }
 */
function parseMethodSignature(signature: string): {
  className: string;
  methodName: string;
} {
  // Clean up the signature
  const cleaned = signature
    .replace(/^\[[\d\s]*\]\|?/, '') // Remove line reference
    .trim();

  if (!cleaned) {
    return { className: '<unknown>', methodName: '<unknown>' };
  }

  // Handle static methods like "System.debug"
  // Handle instance methods like "MyClass.doWork"
  // Handle constructors like "MyClass.<init>"
  const lastDotIndex = cleaned.lastIndexOf('.');

  if (lastDotIndex === -1) {
    // No dot - might be just a class name or method name
    return { className: cleaned, methodName: '<unknown>' };
  }

  const className = cleaned.substring(0, lastDotIndex);
  const methodName = cleaned.substring(lastDotIndex + 1);

  // Handle nested classes (e.g., "Outer.Inner.method")
  // In this case, we want className to be "Outer.Inner" and methodName to be "method"

  return {
    className: className || '<unknown>',
    methodName: methodName || '<unknown>',
  };
}

/**
 * Check if method event is an entry (pushes to stack)
 */
export function isMethodEntry(type: EventType): boolean {
  return type === 'METHOD_ENTRY' || type === 'CONSTRUCTOR_ENTRY';
}

/**
 * Check if method event is an exit (pops from stack)
 */
export function isMethodExit(type: EventType): boolean {
  return type === 'METHOD_EXIT' || type === 'CONSTRUCTOR_EXIT';
}
