/**
 * @module types/events
 * @description Type definitions for Salesforce debug log events
 * @status COMPLETE
 * @see src/types/STATE.md
 * @dependencies src/types/common.ts
 * @lastModified 2026-01-31
 */

import type { Nanoseconds, Duration, Confidence } from './common';

// ============================================================================
// Event Type Enumeration
// ============================================================================

/**
 * All supported Salesforce debug log event types
 * Based on Salesforce Log Event Reference
 */
export type EventType =
  // Execution Flow
  | 'EXECUTION_STARTED'
  | 'EXECUTION_FINISHED'
  | 'CODE_UNIT_STARTED'
  | 'CODE_UNIT_FINISHED'
  // Method Events
  | 'METHOD_ENTRY'
  | 'METHOD_EXIT'
  | 'CONSTRUCTOR_ENTRY'
  | 'CONSTRUCTOR_EXIT'
  // System Method Events (built-in Apex methods)
  | 'SYSTEM_METHOD_ENTRY'
  | 'SYSTEM_METHOD_EXIT'
  | 'SYSTEM_CONSTRUCTOR_ENTRY'
  | 'SYSTEM_CONSTRUCTOR_EXIT'
  | 'SYSTEM_MODE_ENTER'
  | 'SYSTEM_MODE_EXIT'
  // SOQL Events
  | 'SOQL_EXECUTE_BEGIN'
  | 'SOQL_EXECUTE_END'
  | 'SOQL_EXECUTE_EXPLAIN'
  // DML Events
  | 'DML_BEGIN'
  | 'DML_END'
  // Limit Events
  | 'LIMIT_USAGE'
  | 'LIMIT_USAGE_FOR_NS'
  | 'CUMULATIVE_LIMIT_USAGE'
  | 'CUMULATIVE_LIMIT_USAGE_END'
  | 'CUMULATIVE_PROFILING'
  // Exception Events
  | 'EXCEPTION_THROWN'
  | 'FATAL_ERROR'
  // Variable Events
  | 'VARIABLE_SCOPE_BEGIN'
  | 'VARIABLE_SCOPE_END'
  | 'VARIABLE_ASSIGNMENT'
  | 'STATIC_VARIABLE_LIST'
  // Trigger Events
  | 'ENTERING_MANAGED_PKG'
  | 'PUSH_TRACE_FLAGS'
  | 'POP_TRACE_FLAGS'
  // Flow Events (comprehensive)
  | 'FLOW_START_INTERVIEW_BEGIN'
  | 'FLOW_START_INTERVIEW_END'
  | 'FLOW_START_INTERVIEWS_BEGIN'
  | 'FLOW_START_INTERVIEWS_END'
  | 'FLOW_START_INTERVIEW_LIMIT_USAGE'
  | 'FLOW_ELEMENT_BEGIN'
  | 'FLOW_ELEMENT_END'
  | 'FLOW_ELEMENT_DEFERRED'
  | 'FLOW_ELEMENT_LIMIT_USAGE'
  | 'FLOW_BULK_ELEMENT_BEGIN'
  | 'FLOW_BULK_ELEMENT_END'
  | 'FLOW_BULK_ELEMENT_DETAIL'
  | 'FLOW_BULK_ELEMENT_LIMIT_USAGE'
  | 'FLOW_CREATE_INTERVIEW_BEGIN'
  | 'FLOW_CREATE_INTERVIEW_END'
  | 'FLOW_INTERVIEW_FINISHED'
  | 'FLOW_INTERVIEW_FINISHED_LIMIT_USAGE'
  | 'FLOW_VALUE_ASSIGNMENT'
  | 'FLOW_ASSIGNMENT_DETAIL'
  | 'FLOW_ACTIONCALL_DETAIL'
  | 'FLOW_LOOP_DETAIL'
  | 'FLOW_RULE_DETAIL'
  | 'FLOW_SUBFLOW_DETAIL'
  | 'FLOW_COLLECTION_PROCESSOR_DETAIL'
  // Validation Events
  | 'VALIDATION_RULE'
  | 'VALIDATION_FORMULA'
  // Workflow Events
  | 'WF_ACTIONS_END'
  | 'WF_EMAIL_SENT'
  // Callout Events
  | 'CALLOUT_REQUEST'
  | 'CALLOUT_RESPONSE'
  // System Events
  | 'USER_DEBUG'
  | 'SYSTEM_DEBUG'
  | 'USER_INFO'
  | 'HEAP_ALLOCATE'
  | 'HEAP_DEALLOCATE'
  | 'STATEMENT_EXECUTE'
  | 'TOTAL_EMAIL_RECIPIENTS_QUEUED'
  // Duplicate Detection Events
  | 'DUPLICATE_DETECTION_RULE_INVOCATION'
  | 'DUPLICATE_DETECTION_MATCH_INVOCATION_SUMMARY'
  | 'DUPLICATE_DETECTION_MATCH_INVOCATION_DETAILS'
  | 'DUPLICATE_DETECTION_BEGIN'
  | 'DUPLICATE_DETECTION_END'
  // Testing/Profiling Events
  | 'TESTING_LIMITS'
  | 'CUMULATIVE_PROFILING_BEGIN'
  | 'CUMULATIVE_PROFILING_END'
  // Object References
  | 'REFERENCED_OBJECT_LIST'
  // Async Events
  | 'ASYNC_JOB_ENQUEUED'
  | 'FUTURE_CALL'
  | 'QUEUEABLE_JOB'
  | 'BATCH_APEX_START'
  | 'BATCH_APEX_END'
  // Unknown (for forward compatibility)
  | 'UNKNOWN';

// ============================================================================
// Log Token (Raw Parsed Line)
// ============================================================================

/**
 * Represents a single tokenized line from a Salesforce debug log
 * 
 * NOTE: rawLine was intentionally removed to reduce memory footprint.
 * For a 20MB log, storing rawLine would 4-6x memory usage.
 * If debugging is needed, the line can be reconstructed from segments.
 *
 * @example
 * // Raw line: "12:34:56.789 (123456789)|METHOD_ENTRY|[42]|System.debug"
 * const token: LogToken = {
 *   lineNumber: 1,
 *   timestamp: 123456789,
 *   eventType: 'METHOD_ENTRY',
 *   segments: ['[42]', 'System.debug']
 * };
 */
export interface LogToken {
  /** 1-based line number in original file */
  lineNumber: number;

  /** Nanosecond timestamp from log */
  timestamp: Nanoseconds;

  /** Parsed event type */
  eventType: EventType;

  /** Pipe-delimited segments after event type */
  segments: string[];
}

// ============================================================================
// Event Node (Parsed Event in Tree)
// ============================================================================

/**
 * Base interface for all parsed events
 */
export interface BaseEvent {
  /** Unique ID within the log (auto-incremented) */
  id: number;

  /** Parent event ID (-1 for root events) */
  parentId: number;

  /** Event type */
  type: EventType;

  /** Nanosecond timestamp */
  timestamp: Nanoseconds;

  /** 1-based line number in original log */
  lineNumber: number;

  /** Duration in nanoseconds (for paired events) */
  duration?: Duration;

  /** Child events (for tree structure) */
  children?: EventNode[];

  /** Namespace if in managed package */
  namespace?: string;
}

// ============================================================================
// Specific Event Types
// ============================================================================

/**
 * Method entry/exit event
 */
export interface MethodEvent extends BaseEvent {
  type: 'METHOD_ENTRY' | 'METHOD_EXIT' | 'CONSTRUCTOR_ENTRY' | 'CONSTRUCTOR_EXIT';
  /** Full method signature */
  methodName: string;
  /** Class name */
  className: string;
  /** Source line reference (e.g., "[42]") */
  sourceLocation?: string;
}

/**
 * SOQL query event
 */
export interface SOQLEvent extends BaseEvent {
  type: 'SOQL_EXECUTE_BEGIN' | 'SOQL_EXECUTE_END' | 'SOQL_EXECUTE_EXPLAIN';
  /** The SOQL query string */
  query?: string;
  /** Number of rows returned */
  rowCount?: number;
  /** Aggregations count */
  aggregations?: number;
  /** Query plan (for EXPLAIN) */
  queryPlan?: QueryPlan;
}

/**
 * Query plan from SOQL_EXECUTE_EXPLAIN
 */
export interface QueryPlan {
  /** Cardinality estimate */
  cardinality: number;
  /** Fields used for filtering */
  fields: string[];
  /** Leading operation type */
  leadingOperationType: string;
  /** Relative cost */
  relativeCost: number;
  /** Object type being queried */
  sobjectType: string;
}

/**
 * DML operation event
 */
export interface DMLEvent extends BaseEvent {
  type: 'DML_BEGIN' | 'DML_END';
  /** DML operation type */
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT' | 'UNDELETE' | 'MERGE';
  /** SObject type */
  sobjectType: string;
  /** Number of rows affected */
  rowCount?: number;
}

/**
 * Governor limit event
 */
export interface LimitEvent extends BaseEvent {
  type: 'LIMIT_USAGE' | 'LIMIT_USAGE_FOR_NS' | 'CUMULATIVE_LIMIT_USAGE' | 'CUMULATIVE_LIMIT_USAGE_END';
  /** Limit name */
  limitName?: string;
  /** Current usage */
  used?: number;
  /** Maximum allowed */
  max?: number;
  /** All limits (for cumulative) */
  limits?: LimitUsage[];
}

/**
 * Single limit usage entry
 */
export interface LimitUsage {
  /** Limit name (e.g., "Number of SOQL queries") */
  name: string;
  /** Current usage */
  used: number;
  /** Maximum allowed */
  max: number;
  /** Percentage used */
  percentUsed: number;
}

/**
 * Exception event
 */
export interface ExceptionEvent extends BaseEvent {
  type: 'EXCEPTION_THROWN' | 'FATAL_ERROR';
  /** Exception type (e.g., "System.NullPointerException") */
  exceptionType: string;
  /** Exception message */
  message: string;
  /** Stack trace lines */
  stackTrace?: string[];
}

/**
 * Managed package boundary event
 */
export interface ManagedPackageEvent extends BaseEvent {
  type: 'ENTERING_MANAGED_PKG';
  /** Namespace being entered */
  namespace: string;
}

/**
 * User/System debug statement
 * Critical for logic debugging - shows System.debug() output
 */
export interface DebugEvent extends BaseEvent {
  type: 'USER_DEBUG' | 'SYSTEM_DEBUG';
  /** Debug message */
  message: string;
  /** Log level (DEBUG, INFO, WARN, ERROR) */
  level?: string;
  /** Source line reference (e.g., "[42]") */
  sourceLocation?: string;
  /** Parsed source line number */
  sourceLine?: number;
}

/**
 * Variable assignment event
 * Critical for logic debugging - shows variable values at runtime
 * 
 * @example
 * VARIABLE_ASSIGNMENT|[42]|discount|150.00|0x1234
 * VARIABLE_ASSIGNMENT|[EXTERNAL]|this|{"name":"Test"}|0x5678
 */
export interface VariableAssignmentEvent extends BaseEvent {
  type: 'VARIABLE_ASSIGNMENT';
  /** Variable name being assigned */
  variableName: string;
  /** Parsed value (may be object, array, primitive, or null) */
  value: unknown;
  /** Detected value type */
  valueType: string;
  /** Raw string value from log */
  rawValue: string;
  /** Memory address (optional) */
  address?: string;
  /** Source line reference */
  sourceLocation?: string;
  /** Parsed source line number */
  sourceLine?: number;
  /** Whether this is an external/implicit assignment */
  isExternal: boolean;
}

/**
 * Statement execution event
 * Critical for logic debugging - shows which code lines were executed
 * Gaps in line numbers indicate branches that were NOT taken
 * 
 * @example
 * STATEMENT_EXECUTE|[42]
 * STATEMENT_EXECUTE|[43]
 * STATEMENT_EXECUTE|[45]  // Line 44 was skipped (else branch not taken)
 */
export interface StatementExecuteEvent extends BaseEvent {
  type: 'STATEMENT_EXECUTE';
  /** Source line reference (e.g., "[42]") */
  sourceLocation?: string;
  /** Parsed source line number */
  sourceLine?: number;
}

/**
 * Heap allocation event
 * Shows memory allocation - useful for finding memory leaks
 */
export interface HeapAllocateEvent extends BaseEvent {
  type: 'HEAP_ALLOCATE' | 'HEAP_DEALLOCATE';
  /** Source line reference */
  sourceLocation?: string;
  /** Parsed source line number */
  sourceLine?: number;
  /** Bytes allocated */
  bytes: number;
}

/**
 * System method entry/exit event
 * Built-in Apex methods like Database.query, System.debug, etc.
 */
export interface SystemMethodEvent extends BaseEvent {
  type: 'SYSTEM_METHOD_ENTRY' | 'SYSTEM_METHOD_EXIT' | 'SYSTEM_CONSTRUCTOR_ENTRY' | 'SYSTEM_CONSTRUCTOR_EXIT';
  /** Source line reference */
  sourceLocation?: string;
  /** Parsed source line number */
  sourceLine?: number;
  /** Method signature */
  methodSignature: string;
}

/**
 * System mode change event
 * Tracks when execution context changes (e.g., entering system mode)
 */
export interface SystemModeEvent extends BaseEvent {
  type: 'SYSTEM_MODE_ENTER' | 'SYSTEM_MODE_EXIT';
  /** Mode entered/exited */
  mode: string;
}

/**
 * Validation rule event
 * Shows which validation rules were evaluated
 */
export interface ValidationRuleEvent extends BaseEvent {
  type: 'VALIDATION_RULE';
  /** Validation rule ID */
  ruleId: string;
  /** Rule name/API name */
  ruleName: string;
}

/**
 * Validation formula event
 * Shows the formula being evaluated and field values
 */
export interface ValidationFormulaEvent extends BaseEvent {
  type: 'VALIDATION_FORMULA';
  /** The formula expression */
  formula: string;
  /** Field values used in evaluation */
  fieldValues?: string;
}

/**
 * Flow value assignment event
 * Critical for Flow debugging - shows variable values within Flows
 */
export interface FlowValueAssignmentEvent extends BaseEvent {
  type: 'FLOW_VALUE_ASSIGNMENT';
  /** Flow interview ID */
  interviewId: string;
  /** Variable name */
  variableName: string;
  /** Assigned value */
  value: string;
}

/**
 * Flow element detail events
 * Shows detailed info about flow element execution
 */
export interface FlowDetailEvent extends BaseEvent {
  type: 'FLOW_ASSIGNMENT_DETAIL' | 'FLOW_ACTIONCALL_DETAIL' | 'FLOW_LOOP_DETAIL' | 'FLOW_RULE_DETAIL' | 'FLOW_SUBFLOW_DETAIL' | 'FLOW_COLLECTION_PROCESSOR_DETAIL';
  /** Flow interview ID */
  interviewId: string;
  /** Element details */
  detail: string;
}

/**
 * Workflow event
 */
export interface WorkflowEvent extends BaseEvent {
  type: 'WF_ACTIONS_END' | 'WF_EMAIL_SENT';
  /** Workflow details */
  detail?: string;
}

/**
 * Code unit (trigger, class, etc.)
 */
export interface CodeUnitEvent extends BaseEvent {
  type: 'CODE_UNIT_STARTED' | 'CODE_UNIT_FINISHED';
  /** Code unit type */
  unitType: 'Trigger' | 'Class' | 'Validation' | 'Workflow' | 'Flow' | 'Unknown';
  /** Code unit name */
  unitName: string;
}

/**
 * Async job event
 */
export interface AsyncJobEvent extends BaseEvent {
  type: 'ASYNC_JOB_ENQUEUED' | 'FUTURE_CALL' | 'QUEUEABLE_JOB' | 'BATCH_APEX_START' | 'BATCH_APEX_END';
  /** Job ID */
  jobId?: string;
  /** Job type */
  jobType: 'Future' | 'Queueable' | 'Batch' | 'Scheduled';
  /** Class name */
  className?: string;
}

// ============================================================================
// Union Type for All Events
// ============================================================================

/**
 * Union of all possible event types
 */
export type EventNode =
  | MethodEvent
  | SOQLEvent
  | DMLEvent
  | LimitEvent
  | ExceptionEvent
  | ManagedPackageEvent
  | DebugEvent
  | VariableAssignmentEvent
  | StatementExecuteEvent
  | HeapAllocateEvent
  | SystemMethodEvent
  | SystemModeEvent
  | ValidationRuleEvent
  | ValidationFormulaEvent
  | FlowValueAssignmentEvent
  | FlowDetailEvent
  | WorkflowEvent
  | CodeUnitEvent
  | AsyncJobEvent
  | BaseEvent;

// ============================================================================
// Parsed Log Structure
// ============================================================================

/**
 * Log metadata extracted from header
 */
export interface LogMetadata {
  /** API version */
  apiVersion?: string;
  /** Debug log ID */
  logId?: string;
  /** User ID who generated the log */
  userId?: string;
  /** Log start time */
  startTime?: Date;
  /** Log length in bytes */
  logLength?: number;
  /** Debug level settings */
  debugLevels?: Record<string, string>;
}

/**
 * Complete parsed log structure
 */
export interface ParsedLog {
  /** Flat array of all events */
  events: EventNode[];

  /** Root event (tree structure) */
  root: BaseEvent;

  /** Log metadata */
  metadata: LogMetadata;

  /** Truncation information if log was cut */
  truncation?: TruncationInfo;

  /** Parse confidence */
  confidence: Confidence;

  /** Parsing stats */
  stats: ParseStats;
}

/**
 * Truncation detection info
 */
export interface TruncationInfo {
  /** Whether the log was truncated */
  isTruncated: boolean;
  /** Truncation type */
  truncationType?: 'SIZE_LIMIT' | 'LINE_LIMIT' | 'TIMEOUT' | 'UNKNOWN';
  /** Last complete event before truncation */
  lastCompleteEventId?: number;
  /** Lines lost estimate */
  estimatedLinesLost?: number;
  /** Warning message for AI */
  warning: string;
}

/**
 * Parsing statistics
 */
export interface ParseStats {
  /** Total lines in log */
  totalLines: number;
  /** Lines successfully parsed */
  parsedLines: number;
  /** Lines that failed to parse */
  failedLines: number;
  /** Total events created */
  eventCount: number;
  /** Events by type */
  eventsByType: Record<string, number>;
  /** Parse duration in ms */
  parseDurationMs: number;
}

// ============================================================================
// Event Handler Interface
// ============================================================================

/**
 * Interface for event handlers
 */
export interface EventHandler<T extends EventNode = EventNode> {
  /** Event types this handler can process */
  eventTypes: EventType[];

  /** Check if this handler can process the token */
  canHandle(token: LogToken): boolean;

  /** Parse the token into an event */
  handle(token: LogToken, context: ParseContext): T;
}

/**
 * Context passed to event handlers during parsing
 */
export interface ParseContext {
  /** Auto-incrementing event ID */
  nextId: () => number;

  /** Current parent event ID */
  currentParentId: number;

  /** Stack of parent IDs for tree building */
  parentStack: number[];

  /** Current namespace (if in managed package) */
  currentNamespace?: string;

  /** Previous event for context */
  previousEvent?: EventNode;

  /** Map of event ID to event for lookups */
  eventMap: Map<number, EventNode>;
}
