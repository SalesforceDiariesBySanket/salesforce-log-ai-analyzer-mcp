/**
 * @module parser/event-handlers/index
 * @description Exports all event handlers for the parser
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies All event handler modules
 * @lastModified 2026-02-01
 */

import type { EventHandler, EventNode, LogToken, ParseContext } from '../../types';

// Import all handlers
import { methodEventHandler, isMethodEntry, isMethodExit } from './method';
import { soqlEventHandler, extractSObjectFromQuery, isLikelyNonSelective } from './soql';
import { dmlEventHandler, isWriteOperation, estimateDMLImpact } from './dml';
import { limitEventHandler, parseCumulativeLimits, isLimitConcerning, isLimitExceeded, getLimitSeverity, GOVERNOR_LIMITS } from './limit';
import { exceptionEventHandler, parseStackTrace, getExceptionInfo, isGovernorLimitException, isNullPointerException, EXCEPTION_TYPES } from './exception';
import { managedPackageEventHandler, extractNamespace, hasNamespace, stripNamespace, getCodeAttribution, isKnownManagedPackage, getVendorInfo, KNOWN_NAMESPACES } from './managed-pkg';
import { debugEventHandler, variableAssignmentEventHandler, statementExecuteEventHandler, groupVariableHistory, findSkippedLines, buildExecutionTrace, findDebugMessages } from './debug';
import {
  heapEventHandler,
  systemMethodEventHandler,
  systemModeEventHandler,
  validationRuleEventHandler,
  validationFormulaEventHandler,
  flowValueAssignmentEventHandler,
  flowDetailEventHandler,
  workflowEventHandler,
  flowGenericEventHandler,
  miscEventHandler,
} from './system';

// ============================================================================
// Handler Registry
// ============================================================================

/**
 * All event handlers in priority order
 * Debug/variable/statement handlers are critical for LOGIC DEBUGGING
 */
export const eventHandlers: EventHandler[] = [
  methodEventHandler,
  soqlEventHandler,
  dmlEventHandler,
  limitEventHandler,
  exceptionEventHandler,
  managedPackageEventHandler,
  debugEventHandler,
  variableAssignmentEventHandler,
  statementExecuteEventHandler,
  // New comprehensive handlers
  heapEventHandler,
  systemMethodEventHandler,
  systemModeEventHandler,
  validationRuleEventHandler,
  validationFormulaEventHandler,
  flowValueAssignmentEventHandler,
  flowDetailEventHandler,
  workflowEventHandler,
  flowGenericEventHandler,
  miscEventHandler,
];

/**
 * Find the appropriate handler for a token
 */
export function findHandler(token: LogToken): EventHandler | null {
  for (const handler of eventHandlers) {
    if (handler.canHandle(token)) {
      return handler;
    }
  }
  return null;
}

/**
 * Handle a token with the appropriate handler
 */
export function handleToken(
  token: LogToken,
  context: ParseContext
): EventNode | null {
  const handler = findHandler(token);
  if (!handler) {
    return null;
  }
  return handler.handle(token, context);
}

// ============================================================================
// Re-exports
// ============================================================================

// Method handler exports
export { methodEventHandler, isMethodEntry, isMethodExit };

// SOQL handler exports
export { soqlEventHandler, extractSObjectFromQuery, isLikelyNonSelective };

// DML handler exports
export { dmlEventHandler, isWriteOperation, estimateDMLImpact };

// Limit handler exports
export { limitEventHandler, parseCumulativeLimits, isLimitConcerning, isLimitExceeded, getLimitSeverity, GOVERNOR_LIMITS };

// Exception handler exports
export { exceptionEventHandler, parseStackTrace, getExceptionInfo, isGovernorLimitException, isNullPointerException, EXCEPTION_TYPES };

// Managed package handler exports
export { managedPackageEventHandler, extractNamespace, hasNamespace, stripNamespace, getCodeAttribution, isKnownManagedPackage, getVendorInfo, KNOWN_NAMESPACES };

// Debug/Variable/Statement handler exports (LOGIC DEBUGGING)
export { debugEventHandler, variableAssignmentEventHandler, statementExecuteEventHandler, groupVariableHistory, findSkippedLines, buildExecutionTrace, findDebugMessages };

// System/Heap/Flow/Validation handler exports (COMPREHENSIVE EVENT CAPTURE)
export {
  heapEventHandler,
  systemMethodEventHandler,
  systemModeEventHandler,
  validationRuleEventHandler,
  validationFormulaEventHandler,
  flowValueAssignmentEventHandler,
  flowDetailEventHandler,
  workflowEventHandler,
  flowGenericEventHandler,
  miscEventHandler,
};
