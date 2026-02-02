/**
 * @module parser/event-handlers/system
 * @description Handler for System, Heap, Flow, and Validation events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-02-01
 * 
 * These events provide deep debugging insights:
 * - HEAP_ALLOCATE: Memory allocation tracking
 * - SYSTEM_METHOD_*: Built-in Apex method calls
 * - VALIDATION_RULE/FORMULA: Validation rule evaluation
 * - FLOW_VALUE_ASSIGNMENT: Flow variable values
 * - FLOW_*_DETAIL: Flow element execution details
 */

import type {
  LogToken,
  EventHandler,
  ParseContext,
  EventType,
  HeapAllocateEvent,
  SystemMethodEvent,
  SystemModeEvent,
  ValidationRuleEvent,
  ValidationFormulaEvent,
  FlowValueAssignmentEvent,
  FlowDetailEvent,
  WorkflowEvent,
  BaseEvent,
} from '../../types';

// ============================================================================
// Heap Allocate Event Handler
// ============================================================================

/**
 * Parses HEAP_ALLOCATE and HEAP_DEALLOCATE events
 * Shows memory allocation - useful for finding memory issues
 *
 * Log format:
 * - HEAP_ALLOCATE|[line]|Bytes:N
 * 
 * @example
 * 12:34:56.789 (123)|HEAP_ALLOCATE|[42]|Bytes:1024
 */
export const heapEventHandler: EventHandler<HeapAllocateEvent> = {
  eventTypes: ['HEAP_ALLOCATE', 'HEAP_DEALLOCATE'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): HeapAllocateEvent {
    const { segments } = token;

    // Parse source location (e.g., "[42]")
    const sourceLocation = segments[0] || undefined;

    // Parse bytes from "Bytes:N" format
    const bytesStr = segments[1] || '';
    const bytesMatch = bytesStr.match(/Bytes:(\d+)/);
    const bytes = bytesMatch?.[1] ? parseInt(bytesMatch[1], 10) : 0;

    // Extract line number from source location
    const lineMatch = sourceLocation?.match(/\[(\d+)\]/);
    const sourceLine = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : undefined;

    const event: HeapAllocateEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as HeapAllocateEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      sourceLocation,
      sourceLine,
      bytes,
    };

    return event;
  },
};

// ============================================================================
// System Method Event Handler
// ============================================================================

/**
 * Parses SYSTEM_METHOD_ENTRY, SYSTEM_METHOD_EXIT, SYSTEM_CONSTRUCTOR_ENTRY, SYSTEM_CONSTRUCTOR_EXIT
 * Built-in Apex methods like Database.query, System.debug, Map.keySet(), etc.
 *
 * Log format:
 * - SYSTEM_METHOD_ENTRY|[line]|MethodSignature
 * 
 * @example
 * 12:34:56.789 (123)|SYSTEM_METHOD_ENTRY|[65]|Map<Id,User>.keySet()
 * 12:34:56.789 (123)|SYSTEM_METHOD_ENTRY|[212]|Database.query(String)
 */
export const systemMethodEventHandler: EventHandler<SystemMethodEvent> = {
  eventTypes: ['SYSTEM_METHOD_ENTRY', 'SYSTEM_METHOD_EXIT', 'SYSTEM_CONSTRUCTOR_ENTRY', 'SYSTEM_CONSTRUCTOR_EXIT'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): SystemMethodEvent {
    const { segments } = token;

    // Parse source location (e.g., "[65]")
    const sourceLocation = segments[0] || undefined;

    // Method signature is the rest
    const methodSignature = segments.slice(1).join('|') || segments[0] || '<unknown>';

    // Extract line number from source location
    const lineMatch = sourceLocation?.match(/\[(\d+)\]/);
    const sourceLine = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : undefined;

    const event: SystemMethodEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as SystemMethodEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      sourceLocation,
      sourceLine,
      methodSignature,
    };

    return event;
  },
};

// ============================================================================
// System Mode Event Handler
// ============================================================================

/**
 * Parses SYSTEM_MODE_ENTER and SYSTEM_MODE_EXIT events
 *
 * Log format:
 * - SYSTEM_MODE_ENTER|MODE
 * - SYSTEM_MODE_EXIT|MODE
 */
export const systemModeEventHandler: EventHandler<SystemModeEvent> = {
  eventTypes: ['SYSTEM_MODE_ENTER', 'SYSTEM_MODE_EXIT'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): SystemModeEvent {
    const { segments } = token;
    const mode = segments[0] || 'UNKNOWN';

    const event: SystemModeEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as SystemModeEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      mode,
    };

    return event;
  },
};

// ============================================================================
// Validation Rule Event Handler
// ============================================================================

/**
 * Parses VALIDATION_RULE events
 * Shows which validation rules were evaluated
 *
 * Log format:
 * - VALIDATION_RULE|RuleId|RuleName
 * 
 * @example
 * 12:34:56.789 (123)|VALIDATION_RULE|03d2A000001DdWo|CC_Currency_Field_Required
 */
export const validationRuleEventHandler: EventHandler<ValidationRuleEvent> = {
  eventTypes: ['VALIDATION_RULE'],

  canHandle(token: LogToken): boolean {
    return token.eventType === 'VALIDATION_RULE';
  },

  handle(token: LogToken, context: ParseContext): ValidationRuleEvent {
    const { segments } = token;

    const ruleId = segments[0] || '';
    const ruleName = segments[1] || '';

    const event: ValidationRuleEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: 'VALIDATION_RULE',
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      ruleId,
      ruleName,
    };

    return event;
  },
};

// ============================================================================
// Validation Formula Event Handler
// ============================================================================

/**
 * Parses VALIDATION_FORMULA events
 * Shows the formula being evaluated and field values
 *
 * Log format:
 * - VALIDATION_FORMULA|Formula|FieldValues
 * 
 * @example
 * 12:34:56.789 (123)|VALIDATION_FORMULA|AND(Profile.Name = "Admin")|Profile.Name=System Administrator
 */
export const validationFormulaEventHandler: EventHandler<ValidationFormulaEvent> = {
  eventTypes: ['VALIDATION_FORMULA'],

  canHandle(token: LogToken): boolean {
    return token.eventType === 'VALIDATION_FORMULA';
  },

  handle(token: LogToken, context: ParseContext): ValidationFormulaEvent {
    const { segments } = token;

    const formula = segments[0] || '';
    const fieldValues = segments.slice(1).join('|') || undefined;

    const event: ValidationFormulaEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: 'VALIDATION_FORMULA',
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      formula,
      fieldValues,
    };

    return event;
  },
};

// ============================================================================
// Flow Value Assignment Event Handler
// ============================================================================

/**
 * Parses FLOW_VALUE_ASSIGNMENT events
 * Critical for Flow debugging - shows variable values within Flows
 *
 * Log format:
 * - FLOW_VALUE_ASSIGNMENT|InterviewId|VariableName|Value
 * 
 * @example
 * 12:34:56.789 (123)|FLOW_VALUE_ASSIGNMENT|abc123|$Record|{Id=001...}
 */
export const flowValueAssignmentEventHandler: EventHandler<FlowValueAssignmentEvent> = {
  eventTypes: ['FLOW_VALUE_ASSIGNMENT'],

  canHandle(token: LogToken): boolean {
    return token.eventType === 'FLOW_VALUE_ASSIGNMENT';
  },

  handle(token: LogToken, context: ParseContext): FlowValueAssignmentEvent {
    const { segments } = token;

    const interviewId = segments[0] || '';
    const variableName = segments[1] || '';
    const value = segments.slice(2).join('|') || '';

    const event: FlowValueAssignmentEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: 'FLOW_VALUE_ASSIGNMENT',
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      interviewId,
      variableName,
      value,
    };

    return event;
  },
};

// ============================================================================
// Flow Detail Event Handler
// ============================================================================

/**
 * Parses Flow detail events
 * Shows detailed info about flow element execution
 *
 * Log format varies by type:
 * - FLOW_ASSIGNMENT_DETAIL|InterviewId|Detail
 * - FLOW_ACTIONCALL_DETAIL|InterviewId|Detail
 * - FLOW_LOOP_DETAIL|InterviewId|Detail
 */
export const flowDetailEventHandler: EventHandler<FlowDetailEvent> = {
  eventTypes: [
    'FLOW_ASSIGNMENT_DETAIL',
    'FLOW_ACTIONCALL_DETAIL',
    'FLOW_LOOP_DETAIL',
    'FLOW_RULE_DETAIL',
    'FLOW_SUBFLOW_DETAIL',
    'FLOW_COLLECTION_PROCESSOR_DETAIL',
  ],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): FlowDetailEvent {
    const { segments } = token;

    const interviewId = segments[0] || '';
    const detail = segments.slice(1).join('|') || '';

    const event: FlowDetailEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as FlowDetailEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      interviewId,
      detail,
    };

    return event;
  },
};

// ============================================================================
// Workflow Event Handler
// ============================================================================

/**
 * Parses WF_ACTIONS_END and WF_EMAIL_SENT events
 */
export const workflowEventHandler: EventHandler<WorkflowEvent> = {
  eventTypes: ['WF_ACTIONS_END', 'WF_EMAIL_SENT'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): WorkflowEvent {
    const { segments } = token;
    const detail = segments.join('|') || undefined;

    const event: WorkflowEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as WorkflowEvent['type'],
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      detail,
    };

    return event;
  },
};

// ============================================================================
// Generic Flow Event Handler (for remaining Flow events)
// ============================================================================

/**
 * Parses remaining Flow events as generic events
 * These are structural flow events (begin/end, interviews, etc.)
 */
export const flowGenericEventHandler: EventHandler<BaseEvent> = {
  eventTypes: [
    'FLOW_START_INTERVIEW_BEGIN',
    'FLOW_START_INTERVIEW_END',
    'FLOW_START_INTERVIEWS_BEGIN',
    'FLOW_START_INTERVIEWS_END',
    'FLOW_START_INTERVIEW_LIMIT_USAGE',
    'FLOW_ELEMENT_BEGIN',
    'FLOW_ELEMENT_END',
    'FLOW_ELEMENT_DEFERRED',
    'FLOW_ELEMENT_LIMIT_USAGE',
    'FLOW_BULK_ELEMENT_BEGIN',
    'FLOW_BULK_ELEMENT_END',
    'FLOW_BULK_ELEMENT_DETAIL',
    'FLOW_BULK_ELEMENT_LIMIT_USAGE',
    'FLOW_CREATE_INTERVIEW_BEGIN',
    'FLOW_CREATE_INTERVIEW_END',
    'FLOW_INTERVIEW_FINISHED',
    'FLOW_INTERVIEW_FINISHED_LIMIT_USAGE',
  ],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): BaseEvent {
    const event: BaseEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as EventType,
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
    };

    return event;
  },
};

// ============================================================================
// Generic Misc Event Handler (for remaining events)
// ============================================================================

/**
 * Code unit event with trigger info
 */
interface CodeUnitEventParsed extends BaseEvent {
  type: 'CODE_UNIT_STARTED' | 'CODE_UNIT_FINISHED';
  /** Code unit type */
  unitType?: 'Trigger' | 'Class' | 'Validation' | 'Workflow' | 'Flow' | 'Anonymous' | 'Unknown';
  /** Code unit name */
  unitName?: string;
  /** Object name for triggers */
  triggerObject?: string;
  /** Trigger operation (BeforeInsert, AfterUpdate, etc.) */
  triggerOperation?: string;
}

/**
 * Parses miscellaneous events as generic events
 */
export const miscEventHandler: EventHandler<BaseEvent> = {
  eventTypes: [
    'USER_INFO',
    'TOTAL_EMAIL_RECIPIENTS_QUEUED',
    'CUMULATIVE_PROFILING',
    'STATIC_VARIABLE_LIST',
    'VARIABLE_SCOPE_BEGIN',
    'VARIABLE_SCOPE_END',
    'DUPLICATE_DETECTION_RULE_INVOCATION',
    'DUPLICATE_DETECTION_MATCH_INVOCATION_SUMMARY',
    'DUPLICATE_DETECTION_MATCH_INVOCATION_DETAILS',
    'DUPLICATE_DETECTION_BEGIN',
    'DUPLICATE_DETECTION_END',
    'CALLOUT_REQUEST',
    'CALLOUT_RESPONSE',
    'CODE_UNIT_STARTED',
    'CODE_UNIT_FINISHED',
    'EXECUTION_STARTED',
    'EXECUTION_FINISHED',
    'PUSH_TRACE_FLAGS',
    'POP_TRACE_FLAGS',
    'TESTING_LIMITS',
    'CUMULATIVE_PROFILING_BEGIN',
    'CUMULATIVE_PROFILING_END',
    'REFERENCED_OBJECT_LIST',
  ],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): BaseEvent {
    // Special handling for CODE_UNIT events to extract trigger info
    if (token.eventType === 'CODE_UNIT_STARTED' || token.eventType === 'CODE_UNIT_FINISHED') {
      return parseCodeUnitEvent(token, context);
    }

    const event: BaseEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as EventType,
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
    };

    return event;
  },
};

/**
 * Parse CODE_UNIT event to extract trigger info
 * 
 * Example formats:
 * - CODE_UNIT_STARTED|[EXTERNAL]|01q000000001234|AccountTrigger on Account
 * - CODE_UNIT_STARTED|[EXTERNAL]|01q000000001234|trigger AccountTrigger on Account trigger event BeforeInsert
 * - CODE_UNIT_STARTED|[EXTERNAL]|Validation:Account:001xx...
 * - CODE_UNIT_FINISHED|AccountTrigger on Account
 * - CODE_UNIT_FINISHED|trigger AccountTrigger on Account trigger event BeforeInsert
 */
function parseCodeUnitEvent(token: LogToken, context: ParseContext): CodeUnitEventParsed {
  const event: CodeUnitEventParsed = {
    id: context.nextId(),
    parentId: context.currentParentId,
    type: token.eventType as 'CODE_UNIT_STARTED' | 'CODE_UNIT_FINISHED',
    timestamp: token.timestamp,
    lineNumber: token.lineNumber,
  };

  // Get the detail segments from the token
  const segments = token.segments || [];
  
  // Find the code unit description (usually last segment, or after the ID)
  let codeUnitDesc = '';
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (segment && !segment.startsWith('[') && !segment.match(/^[0-9a-zA-Z]{15,18}$/)) {
      // Not a line reference or Salesforce ID
      codeUnitDesc = segment;
      break;
    }
  }

  // Check for Salesforce ID in segments
  for (const segment of segments) {
    if (segment && segment.match(/^01[pqrt][0-9a-zA-Z]{12,15}$/)) {
      // This is a Salesforce ID (01p=ApexClass, 01q=ApexTrigger, etc.)
      // ID prefix indicates type
      if (segment.startsWith('01q')) {
        event.unitType = 'Trigger';
      } else if (segment.startsWith('01p')) {
        event.unitType = 'Class';
      }
    }
  }

  // Parse trigger patterns
  // Pattern: "trigger TriggerName on ObjectName trigger event OperationType"
  const triggerEventPattern = /trigger\s+(\w+)\s+on\s+(\w+)(?:\s+trigger\s+event\s+(\w+))?/i;
  const triggerMatch = codeUnitDesc.match(triggerEventPattern);
  
  if (triggerMatch) {
    event.unitType = 'Trigger';
    event.unitName = triggerMatch[1];
    event.triggerObject = triggerMatch[2];
    if (triggerMatch[3]) {
      event.triggerOperation = triggerMatch[3];
    }
  } else {
    // Pattern: "TriggerName on ObjectName" 
    const simplePattern = /(\w+(?:Trigger)?)\s+on\s+(\w+)/i;
    const simpleMatch = codeUnitDesc.match(simplePattern);
    
    if (simpleMatch) {
      event.unitType = event.unitType || 'Trigger';
      event.unitName = simpleMatch[1];
      event.triggerObject = simpleMatch[2];
    } else if (codeUnitDesc.startsWith('Validation:')) {
      event.unitType = 'Validation';
      event.unitName = codeUnitDesc;
    } else if (codeUnitDesc.includes('Workflow:')) {
      event.unitType = 'Workflow';
      event.unitName = codeUnitDesc;
    } else if (codeUnitDesc.includes('Flow:') || codeUnitDesc.includes('flow')) {
      event.unitType = 'Flow';
      event.unitName = codeUnitDesc;
    } else if (codeUnitDesc) {
      // Store the description as unitName for other code units
      event.unitName = codeUnitDesc;
    }
  }

  return event;
}
