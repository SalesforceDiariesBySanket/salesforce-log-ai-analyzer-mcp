/**
 * @module analyzer/detectors/recursive-trigger
 * @description Detects recursive trigger execution patterns
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type {
  EventNode,
  CodeUnitEvent,
  DMLEvent,
} from '../../types/events';
import type {
  Issue,
  IssueDetector,
  AttributionInfo,
  AIIssueContext,
  EventSummary,
  FixPattern,
} from '../../types/issues';
import { confidence, type Confidence } from '../../types/common';

// ============================================================================
// Recursive Trigger Detection
// ============================================================================

/**
 * Detects recursive trigger execution patterns
 * 
 * Recursive Trigger Pattern:
 * - Trigger fires on object
 * - Trigger performs DML on same or related object
 * - This DML causes the trigger to fire again
 * - Can lead to maximum stack depth errors
 * 
 * Detection Strategy:
 * 1. Track CODE_UNIT_STARTED events for triggers
 * 2. Detect when same trigger fires multiple times
 * 3. Identify DML operations that cause re-entry
 * 4. Analyze call depth to identify recursion depth
 */
export const recursiveTriggerDetector: IssueDetector = {
  name: 'Recursive Trigger Detector',
  detects: ['RECURSIVE_TRIGGER'],

  detect(events: EventNode[]): Issue[] {
    const issues: Issue[] = [];
    
    // Extract trigger-related events
    const triggerEvents = extractTriggerEvents(events);
    const dmlEvents = extractDMLEvents(events);
    
    if (triggerEvents.length < 2) {
      return issues; // Need at least 2 trigger firings to detect recursion
    }

    // Detect direct recursion (same trigger fires multiple times)
    const directRecursion = detectDirectRecursion(triggerEvents, events);
    issues.push(...directRecursion);

    // Detect indirect recursion (Trigger A → DML → Trigger B → DML → Trigger A)
    const indirectRecursion = detectIndirectRecursion(triggerEvents, dmlEvents, events);
    issues.push(...indirectRecursion);

    return issues;
  },
};

// ============================================================================
// Types
// ============================================================================

interface TriggerExecution {
  /** The CODE_UNIT event */
  event: CodeUnitEvent;
  /** Trigger name */
  triggerName: string;
  /** Object type */
  objectType: string;
  /** Trigger type (before/after insert/update/delete) */
  triggerType: string;
  /** Depth in the execution stack */
  depth: number;
  /** DML events within this trigger */
  dmlOperations: DMLEvent[];
}

interface RecursionChain {
  /** Trigger execution sequence */
  triggers: TriggerExecution[];
  /** Type of recursion */
  type: 'DIRECT' | 'INDIRECT';
  /** Maximum depth reached */
  maxDepth: number;
  /** Confidence of detection */
  confidence: Confidence;
}

// ============================================================================
// Detection Logic
// ============================================================================

/**
 * Extract trigger-related CODE_UNIT events
 */
function extractTriggerEvents(events: EventNode[]): CodeUnitEvent[] {
  return events.filter(
    (e): e is CodeUnitEvent =>
      (e.type === 'CODE_UNIT_STARTED' || e.type === 'CODE_UNIT_FINISHED') &&
      'unitType' in e &&
      e.unitType === 'Trigger'
  );
}

/**
 * Extract DML events
 */
function extractDMLEvents(events: EventNode[]): DMLEvent[] {
  return events.filter(
    (e): e is DMLEvent => e.type === 'DML_BEGIN' || e.type === 'DML_END'
  );
}

/**
 * Detect direct recursion - same trigger fires multiple times
 */
function detectDirectRecursion(
  triggerEvents: CodeUnitEvent[],
  allEvents: EventNode[]
): Issue[] {
  const issues: Issue[] = [];
  const triggerCounts = new Map<string, CodeUnitEvent[]>();

  // Group by trigger name
  for (const event of triggerEvents) {
    if (event.type !== 'CODE_UNIT_STARTED') continue;
    
    const name = event.unitName || 'Unknown';
    const existing = triggerCounts.get(name) || [];
    existing.push(event);
    triggerCounts.set(name, existing);
  }

  // Find triggers that fire multiple times
  for (const [triggerName, executions] of triggerCounts) {
    if (executions.length >= 2) {
      // Analyze the execution pattern
      const recursionAnalysis = analyzeRecursionPattern(executions, allEvents);
      
      if (recursionAnalysis.isRecursion) {
        const conf = calculateDirectRecursionConfidence(executions, recursionAnalysis);
        
        if (conf.score >= 0.5) {
          issues.push(createRecursionIssue(
            triggerName,
            executions,
            'DIRECT',
            recursionAnalysis.maxDepth,
            conf,
            allEvents
          ));
        }
      }
    }
  }

  return issues;
}

/**
 * Detect indirect recursion - chain of triggers causing re-entry
 */
function detectIndirectRecursion(
  triggerEvents: CodeUnitEvent[],
  dmlEvents: DMLEvent[],
  allEvents: EventNode[]
): Issue[] {
  const issues: Issue[] = [];
  
  // Build a graph of trigger → DML → trigger chains
  const chains = buildTriggerChains(triggerEvents, dmlEvents, allEvents);
  
  for (const chain of chains) {
    if (chain.triggers.length >= 3 && isCircularChain(chain)) {
      const conf = calculateIndirectRecursionConfidence(chain);
      
      if (conf.score >= 0.5) {
        const firstTrigger = chain.triggers[0];
        if (!firstTrigger) continue;
        issues.push(createRecursionIssue(
          firstTrigger.triggerName,
          chain.triggers.map(t => t.event),
          'INDIRECT',
          chain.maxDepth,
          conf,
          allEvents
        ));
      }
    }
  }

  return issues;
}

/**
 * Analyze execution pattern to determine if it's recursion
 */
function analyzeRecursionPattern(
  executions: CodeUnitEvent[],
  allEvents: EventNode[]
): { isRecursion: boolean; maxDepth: number; causedByDML: boolean } {
  // Calculate execution depths
  const depths = executions.map(e => calculateEventDepth(e, allEvents));
  const maxDepth = Math.max(...depths);

  // Recursion indicators:
  // 1. Increasing depths (nested calls)
  // 2. Same trigger appearing at different depths
  // 3. Executions happening in rapid succession

  let hasNestedExecution = false;
  for (let i = 1; i < depths.length; i++) {
    const currentDepth = depths[i];
    const prevDepth = depths[i - 1];
    if (currentDepth !== undefined && prevDepth !== undefined && currentDepth > prevDepth) {
      hasNestedExecution = true;
      break;
    }
  }

  // Check if triggered by DML
  const causedByDML = executions.some(e => {
    return findTriggeringDML(e, allEvents) !== null;
  });

  return {
    isRecursion: hasNestedExecution || (executions.length > 3 && causedByDML),
    maxDepth,
    causedByDML,
  };
}

/**
 * Calculate the depth of an event in the execution tree
 */
function calculateEventDepth(event: EventNode, allEvents: EventNode[]): number {
  let depth = 0;
  let currentId = event.parentId;
  const eventMap = new Map(allEvents.map(e => [e.id, e]));

  while (currentId !== -1 && depth < 100) {
    depth++;
    const parent = eventMap.get(currentId);
    currentId = parent?.parentId ?? -1;
  }

  return depth;
}

/**
 * Find the DML that triggered a specific trigger execution
 */
function findTriggeringDML(
  triggerEvent: CodeUnitEvent,
  allEvents: EventNode[]
): DMLEvent | null {
  const eventMap = new Map(allEvents.map(e => [e.id, e]));
  let currentId = triggerEvent.parentId;

  while (currentId !== -1) {
    const parent = eventMap.get(currentId);
    if (!parent) break;
    
    if (parent.type === 'DML_BEGIN' || parent.type === 'DML_END') {
      return parent as DMLEvent;
    }
    
    currentId = parent.parentId;
  }

  return null;
}

/**
 * Build chains of trigger → DML → trigger relationships
 */
function buildTriggerChains(
  triggerEvents: CodeUnitEvent[],
  dmlEvents: DMLEvent[],
  allEvents: EventNode[]
): RecursionChain[] {
  const chains: RecursionChain[] = [];
  const startTriggers = triggerEvents.filter(t => t.type === 'CODE_UNIT_STARTED');
  
  for (const startTrigger of startTriggers) {
    const chain: TriggerExecution[] = [];
    const visited = new Set<number>();
    
    buildChainRecursive(startTrigger, chain, visited, allEvents, triggerEvents, dmlEvents);
    
    if (chain.length >= 2) {
      const first = chain[0];
      const second = chain[1];
      chains.push({
        triggers: chain,
        type: chain.length === 2 && first && second && first.triggerName === second.triggerName ? 'DIRECT' : 'INDIRECT',
        maxDepth: Math.max(...chain.map(t => t.depth)),
        confidence: confidence(0.5, ['Chain detected']),
      });
    }
  }

  return chains;
}

/**
 * Recursively build a trigger chain
 */
function buildChainRecursive(
  trigger: CodeUnitEvent,
  chain: TriggerExecution[],
  visited: Set<number>,
  allEvents: EventNode[],
  triggerEvents: CodeUnitEvent[],
  dmlEvents: DMLEvent[]
): void {
  if (visited.has(trigger.id) || chain.length > 10) return;
  visited.add(trigger.id);

  const objectType = extractObjectFromTriggerName(trigger.unitName || '');
  const triggerType = extractTriggerType(trigger.unitName || '');
  const depth = calculateEventDepth(trigger, allEvents);
  
  // Find DML operations within this trigger's scope
  const triggerDML = findDMLInScope(trigger, dmlEvents, allEvents);

  chain.push({
    event: trigger,
    triggerName: trigger.unitName || 'Unknown',
    objectType,
    triggerType,
    depth,
    dmlOperations: triggerDML,
  });

  // Find subsequent triggers that might have been caused by this trigger's DML
  const subsequentTriggers = triggerEvents.filter(
    t => t.type === 'CODE_UNIT_STARTED' && 
         t.timestamp > trigger.timestamp &&
         !visited.has(t.id)
  );

  for (const subTrigger of subsequentTriggers) {
    // Check if this trigger could have been caused by our DML
    const subObjectType = extractObjectFromTriggerName(subTrigger.unitName || '');
    const matchingDML = triggerDML.find(d => d.sobjectType === subObjectType);
    
    if (matchingDML) {
      buildChainRecursive(subTrigger, chain, visited, allEvents, triggerEvents, dmlEvents);
      break; // Only follow one path for simplicity
    }
  }
}

/**
 * Find DML operations within a trigger's scope
 */
function findDMLInScope(
  trigger: CodeUnitEvent,
  dmlEvents: DMLEvent[],
  allEvents: EventNode[]
): DMLEvent[] {
  const result: DMLEvent[] = [];
  const triggerFinish = allEvents.find(
    e => e.type === 'CODE_UNIT_FINISHED' && 
         e.timestamp > trigger.timestamp &&
         ('unitName' in e && e.unitName === trigger.unitName)
  );

  if (!triggerFinish) return result;

  for (const dml of dmlEvents) {
    if (dml.timestamp > trigger.timestamp && dml.timestamp < triggerFinish.timestamp) {
      result.push(dml);
    }
  }

  return result;
}

/**
 * Check if a chain is circular (same trigger appears multiple times)
 */
function isCircularChain(chain: RecursionChain): boolean {
  const names = chain.triggers.map(t => t.triggerName);
  const uniqueNames = new Set(names);
  return uniqueNames.size < names.length;
}

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * Calculate confidence for direct recursion
 */
function calculateDirectRecursionConfidence(
  executions: CodeUnitEvent[],
  analysis: { isRecursion: boolean; maxDepth: number; causedByDML: boolean }
): Confidence {
  const reasons: string[] = [];
  const limitations: string[] = [];
  let score = 0.5;

  // More executions = higher confidence
  if (executions.length >= 10) {
    score += 0.25;
    reasons.push(`Trigger executed ${executions.length} times`);
  } else if (executions.length >= 5) {
    score += 0.15;
    reasons.push(`Trigger executed ${executions.length} times`);
  } else {
    reasons.push(`Trigger executed ${executions.length} times`);
    limitations.push('Low execution count - may be normal batch processing');
  }

  // Depth indicates recursion
  if (analysis.maxDepth >= 3) {
    score += 0.2;
    reasons.push(`Execution stack depth: ${analysis.maxDepth}`);
  }

  // DML-triggered recursion is most common pattern
  if (analysis.causedByDML) {
    score += 0.15;
    reasons.push('Recursion caused by DML operation');
  } else {
    limitations.push('No DML detected as recursion cause');
  }

  return confidence(Math.min(score, 1.0), reasons, limitations.length > 0 ? limitations : undefined);
}

/**
 * Calculate confidence for indirect recursion
 */
function calculateIndirectRecursionConfidence(chain: RecursionChain): Confidence {
  const reasons: string[] = [];
  const limitations: string[] = [];
  let score = 0.5;

  reasons.push(`Chain of ${chain.triggers.length} trigger executions`);

  if (chain.maxDepth >= 3) {
    score += 0.2;
    reasons.push(`Maximum depth: ${chain.maxDepth}`);
  }

  // Check for DML in chain
  const hasDML = chain.triggers.some(t => t.dmlOperations.length > 0);
  if (hasDML) {
    score += 0.15;
    reasons.push('DML operations found in trigger chain');
  }

  if (chain.triggers.length < 4) {
    limitations.push('Short chain - may be normal execution flow');
  }

  return confidence(Math.min(score, 1.0), reasons, limitations.length > 0 ? limitations : undefined);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract object name from trigger name
 * E.g., "AccountTrigger" → "Account"
 */
function extractObjectFromTriggerName(triggerName: string): string {
  // Common patterns: AccountTrigger, Account_Trigger, SBQQ__QuoteTrigger
  const patterns = [
    /^(\w+?)_?Trigger$/i,
    /^(\w+?)_?Before/i,
    /^(\w+?)_?After/i,
    /^([\w_]+)__(\w+?)Trigger$/i, // Managed package: ns__ObjectTrigger
  ];

  for (const pattern of patterns) {
    const match = triggerName.match(pattern);
    if (match) {
      const lastGroup = match[match.length - 1];
      if (lastGroup) return lastGroup; // Return last capturing group
    }
  }

  return triggerName;
}

/**
 * Extract trigger type from trigger name or context
 */
function extractTriggerType(triggerName: string): string {
  const lower = triggerName.toLowerCase();
  
  if (lower.includes('before') && lower.includes('insert')) return 'beforeInsert';
  if (lower.includes('before') && lower.includes('update')) return 'beforeUpdate';
  if (lower.includes('before') && lower.includes('delete')) return 'beforeDelete';
  if (lower.includes('after') && lower.includes('insert')) return 'afterInsert';
  if (lower.includes('after') && lower.includes('update')) return 'afterUpdate';
  if (lower.includes('after') && lower.includes('delete')) return 'afterDelete';
  
  return 'unknown';
}

// ============================================================================
// Issue Creation
// ============================================================================

let issueIdCounter = 0;

/**
 * Create a recursive trigger issue
 */
function createRecursionIssue(
  triggerName: string,
  executions: CodeUnitEvent[],
  type: 'DIRECT' | 'INDIRECT',
  maxDepth: number,
  conf: Confidence,
  _allEvents: EventNode[]
): Issue {
  const eventIds = executions.map(e => e.id);
  const lineNumbers = executions.map(e => e.lineNumber);

  const severity = 
    maxDepth >= 5 ? 'CRITICAL' :
    maxDepth >= 3 ? 'HIGH' :
    executions.length >= 10 ? 'HIGH' : 'MEDIUM';

  return {
    id: `recursive-trigger-${++issueIdCounter}`,
    type: 'RECURSIVE_TRIGGER',
    category: 'ANTI_PATTERN',
    severity,
    title: `${type === 'DIRECT' ? 'Direct' : 'Indirect'} trigger recursion: ${triggerName}`,
    description:
      `${triggerName} executed ${executions.length} times with max depth of ${maxDepth}. ` +
      `${type === 'DIRECT' 
        ? 'The trigger is calling itself through DML operations.' 
        : 'Multiple triggers are causing each other to re-fire.'} ` +
      `This can cause "maximum trigger depth exceeded" errors and unexpected behavior.`,
    eventIds,
    lineNumbers,
    confidence: conf,
    attribution: createAttribution(triggerName, executions),
    recommendations: [
      'Implement a static Boolean flag to prevent re-entry',
      'Use a static Set<Id> to track already-processed records',
      'Consider using the TriggerHandler pattern with recursion control',
      'Move logic to a Queueable if updates must cascade',
      'Review DML operations - can they be batched outside the trigger?',
    ],
    aiContext: createAIContext(triggerName, executions, type, maxDepth),
  };
}

/**
 * Create attribution info
 */
function createAttribution(
  triggerName: string,
  _executions: CodeUnitEvent[]
): AttributionInfo {
  // Check for managed package namespace
  const namespaceMatch = triggerName.match(/^(\w+)__/);
  
  if (namespaceMatch) {
    return {
      attribution: 'MANAGED_PACKAGE',
      confidence: confidence(0.9, ['Trigger has managed package namespace prefix']),
      namespace: namespaceMatch[1],
      canModify: false,
      aiGuidance: `This trigger is in the ${namespaceMatch[1]} package. You cannot modify it directly - consider data architecture changes or contacting the vendor.`,
    };
  }

  return {
    attribution: 'USER_CODE',
    confidence: confidence(0.9, ['No managed package namespace detected']),
    canModify: true,
    aiGuidance: 'Implement recursion prevention using static variables or a trigger framework.',
  };
}

/**
 * Create AI-specific context
 */
function createAIContext(
  triggerName: string,
  executions: CodeUnitEvent[],
  _type: 'DIRECT' | 'INDIRECT',
  maxDepth: number
): AIIssueContext {
  const relevantEvents: EventSummary[] = executions.slice(0, 5).map((e, i) => ({
    id: e.id,
    type: e.type,
    line: e.lineNumber,
    summary: `Execution ${i + 1}: ${e.unitName}`,
  }));

  const fixPatterns: FixPattern[] = [
    {
      name: 'Static Boolean Guard',
      description: 'Use a static Boolean to prevent re-entry',
      before: `trigger AccountTrigger on Account (after update) {\n  // DML that causes recursion\n  update relatedRecords;\n}`,
      after: `trigger AccountTrigger on Account (after update) {\n  if (AccountTriggerHandler.isFirstRun) {\n    AccountTriggerHandler.isFirstRun = false;\n    // DML that was causing recursion\n    update relatedRecords;\n  }\n}\n\npublic class AccountTriggerHandler {\n  public static Boolean isFirstRun = true;\n}`,
      applicability: confidence(0.9, ['Standard pattern', 'Simple to implement']),
    },
    {
      name: 'Processed IDs Set',
      description: 'Track processed record IDs to prevent re-processing',
      before: `trigger AccountTrigger on Account (after update) {\n  for (Account acc : Trigger.new) {\n    // Process each record\n  }\n}`,
      after: `trigger AccountTrigger on Account (after update) {\n  for (Account acc : Trigger.new) {\n    if (!AccountTriggerHandler.processedIds.contains(acc.Id)) {\n      AccountTriggerHandler.processedIds.add(acc.Id);\n      // Process the record\n    }\n  }\n}\n\npublic class AccountTriggerHandler {\n  public static Set<Id> processedIds = new Set<Id>();\n}`,
      applicability: confidence(0.85, ['Handles partial re-runs', 'More granular control']),
    },
    {
      name: 'Trigger Framework',
      description: 'Use a trigger framework with built-in recursion control',
      before: `trigger AccountTrigger on Account (after update) {\n  // Ad-hoc trigger logic\n}`,
      after: `trigger AccountTrigger on Account (after update) {\n  TriggerDispatcher.run(new AccountTriggerHandler());\n}\n\n// Handler extends TriggerHandler which has recursion control built-in`,
      applicability: confidence(0.75, ['Best for new projects', 'Requires framework setup']),
    },
  ];

  return {
    relevantEvents,
    metrics: {
      occurrences: executions.length,
      totalImpact: maxDepth,
    },
    fixPatterns,
    clarifyingQuestions: [
      'Is recursion prevention already implemented? If so, why is it not working?',
      `What DML operations does ${triggerName} perform that might cause re-entry?`,
      'Are there related triggers on child/parent objects that might be part of a chain?',
      'Should the cascading updates be handled asynchronously (Queueable)?',
    ],
  };
}
