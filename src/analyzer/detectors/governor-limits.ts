/**
 * @module analyzer/detectors/governor-limits
 * @description Analyzes governor limit usage and detects potential limit violations
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type {
  EventNode,
  LimitEvent,
  LimitUsage,
} from '../../types/events';
import type {
  Issue,
  IssueDetector,
  AIIssueContext,
  EventSummary,
  FixPattern,
} from '../../types/issues';
import { confidence, type Confidence } from '../../types/common';

// ============================================================================
// Governor Limits Analysis
// ============================================================================

/**
 * Analyzes governor limit usage throughout the transaction
 * 
 * Salesforce Governor Limits protect shared resources:
 * - SOQL queries: 100 (sync) / 200 (async)
 * - DML statements: 150
 * - DML rows: 10,000
 * - CPU time: 10,000ms (sync) / 60,000ms (async)
 * - Heap size: 6MB (sync) / 12MB (async)
 * - Callouts: 100
 * 
 * Detection Strategy:
 * 1. Extract LIMIT_USAGE and LIMIT_USAGE_FOR_NS events
 * 2. Track limit progression throughout transaction
 * 3. Identify limits that exceed thresholds (80%+)
 * 4. Detect which namespaces consume the most limits
 */
export const governorLimitsDetector: IssueDetector = {
  name: 'Governor Limits Analyzer',
  detects: ['SOQL_LIMIT_NEAR', 'SOQL_LIMIT_EXCEEDED', 'DML_LIMIT_NEAR', 'DML_LIMIT_EXCEEDED', 'HEAP_SIZE_WARNING'],

  detect(events: EventNode[]): Issue[] {
    const issues: Issue[] = [];
    
    // Extract limit events
    const limitEvents = extractLimitEvents(events);
    
    if (limitEvents.length === 0) {
      return issues;
    }

    // Get final limit state (cumulative limits at end)
    const finalLimits = extractFinalLimits(limitEvents);
    
    // Analyze each limit for issues
    for (const limit of finalLimits) {
      const issue = analyzeLimit(limit, limitEvents);
      if (issue) {
        issues.push(issue);
      }
    }

    // Analyze namespace-specific usage
    const namespaceIssues = analyzeNamespaceLimits(limitEvents);
    issues.push(...namespaceIssues);

    return issues;
  },
};

// ============================================================================
// Governor Limit Definitions
// ============================================================================

interface LimitDefinition {
  /** Display name */
  name: string;
  /** Maximum value (sync context) */
  syncLimit: number;
  /** Maximum value (async context) */
  asyncLimit: number;
  /** Warning threshold percentage */
  warningThreshold: number;
  /** Critical threshold percentage */
  criticalThreshold: number;
  /** Issue type when near limit */
  nearIssueType: Issue['type'];
  /** Issue type when exceeded */
  exceededIssueType: Issue['type'];
  /** Recommendations */
  recommendations: string[];
}

const LIMIT_DEFINITIONS: Record<string, LimitDefinition> = {
  'Number of SOQL queries': {
    name: 'SOQL Queries',
    syncLimit: 100,
    asyncLimit: 200,
    warningThreshold: 70,
    criticalThreshold: 90,
    nearIssueType: 'SOQL_LIMIT_NEAR',
    exceededIssueType: 'SOQL_LIMIT_EXCEEDED',
    recommendations: [
      'Consolidate queries using relationship queries',
      'Move queries outside of loops',
      'Cache query results in Maps',
      'Use SOQL FOR loops for large datasets',
    ],
  },
  'Number of query rows': {
    name: 'Query Rows',
    syncLimit: 50000,
    asyncLimit: 50000,
    warningThreshold: 70,
    criticalThreshold: 90,
    nearIssueType: 'SOQL_LIMIT_NEAR',
    exceededIssueType: 'SOQL_LIMIT_EXCEEDED',
    recommendations: [
      'Add WHERE clause filters to reduce rows',
      'Use LIMIT clause to cap results',
      'Consider using Batch Apex for large datasets',
      'Filter data in application code only when necessary',
    ],
  },
  'Number of DML statements': {
    name: 'DML Statements',
    syncLimit: 150,
    asyncLimit: 150,
    warningThreshold: 70,
    criticalThreshold: 90,
    nearIssueType: 'DML_LIMIT_NEAR',
    exceededIssueType: 'DML_LIMIT_EXCEEDED',
    recommendations: [
      'Collect records into Lists and perform bulk DML',
      'Use Database.insert/update with allOrNone=false for partial success',
      'Consolidate DML operations at end of transaction',
      'Move DML-heavy processing to async context',
    ],
  },
  'Number of DML rows': {
    name: 'DML Rows',
    syncLimit: 10000,
    asyncLimit: 10000,
    warningThreshold: 70,
    criticalThreshold: 90,
    nearIssueType: 'DML_LIMIT_NEAR',
    exceededIssueType: 'DML_LIMIT_EXCEEDED',
    recommendations: [
      'Use Batch Apex for processing large record sets',
      'Consider using Queueable chaining for large operations',
      'Review if all records need to be processed in one transaction',
    ],
  },
  'Maximum CPU time': {
    name: 'CPU Time',
    syncLimit: 10000,
    asyncLimit: 60000,
    warningThreshold: 60,
    criticalThreshold: 85,
    nearIssueType: 'CPU_TIMEOUT',
    exceededIssueType: 'CPU_TIMEOUT',
    recommendations: [
      'Profile code to find CPU hotspots',
      'Move heavy processing to async context (6x more CPU time)',
      'Cache expensive calculations',
      'Reduce loop iterations through better filtering',
    ],
  },
  'Maximum heap size': {
    name: 'Heap Size',
    syncLimit: 6000000,
    asyncLimit: 12000000,
    warningThreshold: 70,
    criticalThreshold: 90,
    nearIssueType: 'HEAP_SIZE_WARNING',
    exceededIssueType: 'HEAP_LIMIT',
    recommendations: [
      'Use SOQL FOR loops to reduce memory footprint',
      'Set variables to null after use to allow garbage collection',
      'Avoid storing large data structures in memory',
      'Process records in smaller batches',
    ],
  },
  'Number of callouts': {
    name: 'Callouts',
    syncLimit: 100,
    asyncLimit: 100,
    warningThreshold: 70,
    criticalThreshold: 90,
    nearIssueType: 'CALLOUT_LIMIT',
    exceededIssueType: 'CALLOUT_LIMIT',
    recommendations: [
      'Batch multiple callouts into single requests where API allows',
      'Use Platform Events or Queueable for async callouts',
      'Cache external data to reduce callout frequency',
      'Consider using Salesforce Connect for external objects',
    ],
  },
};

// ============================================================================
// Detection Logic
// ============================================================================

/**
 * Extract limit-related events
 */
function extractLimitEvents(events: EventNode[]): LimitEvent[] {
  return events.filter(
    (e): e is LimitEvent =>
      e.type === 'LIMIT_USAGE' ||
      e.type === 'LIMIT_USAGE_FOR_NS' ||
      e.type === 'CUMULATIVE_LIMIT_USAGE' ||
      e.type === 'CUMULATIVE_LIMIT_USAGE_END'
  );
}

/**
 * Extract final cumulative limits from the log
 */
function extractFinalLimits(limitEvents: LimitEvent[]): LimitUsage[] {
  // Find the last CUMULATIVE_LIMIT_USAGE_END event
  const cumulativeEvents = limitEvents.filter(
    e => e.type === 'CUMULATIVE_LIMIT_USAGE' || e.type === 'CUMULATIVE_LIMIT_USAGE_END'
  );
  
  if (cumulativeEvents.length === 0) {
    // Fall back to individual limit events
    return extractLimitsFromIndividual(limitEvents);
  }
  
  const lastCumulative = cumulativeEvents[cumulativeEvents.length - 1];
  if (!lastCumulative) {
    return extractLimitsFromIndividual(limitEvents);
  }
  return lastCumulative.limits || [];
}

/**
 * Extract limits from individual LIMIT_USAGE events
 */
function extractLimitsFromIndividual(limitEvents: LimitEvent[]): LimitUsage[] {
  const limits = new Map<string, LimitUsage>();
  
  for (const event of limitEvents) {
    if (event.type === 'LIMIT_USAGE' && event.limitName) {
      const existing = limits.get(event.limitName);
      const used = event.used ?? 0;
      const max = event.max ?? 100;
      
      // Keep the highest usage
      if (!existing || used > existing.used) {
        limits.set(event.limitName, {
          name: event.limitName,
          used,
          max,
          percentUsed: (used / max) * 100,
        });
      }
    }
  }
  
  return Array.from(limits.values());
}

/**
 * Analyze a single limit for issues
 */
function analyzeLimit(limit: LimitUsage, allEvents: LimitEvent[]): Issue | null {
  const definition = LIMIT_DEFINITIONS[limit.name];
  if (!definition) {
    // Unknown limit type - use generic thresholds
    if (limit.percentUsed < 70) return null;
  } else {
    if (limit.percentUsed < definition.warningThreshold) return null;
  }

  const def = definition || createGenericDefinition(limit.name);
  const isExceeded = limit.used >= limit.max;
  const severity = getSeverity(limit.percentUsed, def);
  
  const conf = confidence(
    isExceeded ? 1.0 : Math.min(0.95, 0.6 + (limit.percentUsed / 200)),
    [
      `${limit.used} of ${limit.max} (${Math.round(limit.percentUsed)}%)`,
      isExceeded ? 'LIMIT EXCEEDED' : severity === 'HIGH' ? 'Near limit' : 'Warning threshold',
    ]
  );

  return createLimitIssue(limit, def, severity, isExceeded, conf, allEvents);
}

/**
 * Analyze namespace-specific limit usage
 */
function analyzeNamespaceLimits(limitEvents: LimitEvent[]): Issue[] {
  const issues: Issue[] = [];
  const namespaceUsage = new Map<string, Map<string, number>>();
  
  for (const event of limitEvents) {
    if (event.type === 'LIMIT_USAGE_FOR_NS' && event.namespace) {
      if (!namespaceUsage.has(event.namespace)) {
        namespaceUsage.set(event.namespace, new Map());
      }
      
      const nsMap = namespaceUsage.get(event.namespace)!;
      if (event.limitName && event.used !== undefined) {
        const existing = nsMap.get(event.limitName) || 0;
        nsMap.set(event.limitName, Math.max(existing, event.used));
      }
    }
  }
  
  // Check for managed packages consuming significant resources
  for (const [namespace, limits] of namespaceUsage) {
    if (namespace === '' || namespace === 'default') continue;
    
    const soqlUsage = limits.get('Number of SOQL queries') || 0;
    const dmlUsage = limits.get('Number of DML statements') || 0;
    
    // Alert if managed package uses more than 30% of limits
    if (soqlUsage > 30 || dmlUsage > 45) {
      issues.push(createNamespaceIssue(namespace, limits, limitEvents));
    }
  }
  
  return issues;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a generic definition for unknown limit types
 */
function createGenericDefinition(name: string): LimitDefinition {
  return {
    name,
    syncLimit: 100,
    asyncLimit: 100,
    warningThreshold: 70,
    criticalThreshold: 90,
    nearIssueType: 'GOVERNOR_LIMITS' as Issue['type'],
    exceededIssueType: 'GOVERNOR_LIMITS' as Issue['type'],
    recommendations: [
      'Review code for limit usage optimization',
      'Consider async processing for heavy operations',
    ],
  };
}

/**
 * Get severity based on percentage used
 */
function getSeverity(percentUsed: number, def: LimitDefinition): Issue['severity'] {
  if (percentUsed >= 100) return 'CRITICAL';
  if (percentUsed >= def.criticalThreshold) return 'HIGH';
  if (percentUsed >= def.warningThreshold) return 'MEDIUM';
  return 'LOW';
}

// ============================================================================
// Issue Creation
// ============================================================================

let issueIdCounter = 0;

/**
 * Create a limit issue
 */
function createLimitIssue(
  limit: LimitUsage,
  def: LimitDefinition,
  severity: Issue['severity'],
  isExceeded: boolean,
  conf: Confidence,
  allEvents: LimitEvent[]
): Issue {
  const issueType = isExceeded ? def.exceededIssueType : def.nearIssueType;
  const status = isExceeded ? 'EXCEEDED' : severity === 'HIGH' ? 'CRITICAL' : 'WARNING';
  
  // Find related limit events for context
  const relatedEvents = allEvents.filter(
    e => e.limitName === limit.name || 
         (e.limits && e.limits.some(l => l.name === limit.name))
  );

  return {
    id: `limit-${++issueIdCounter}`,
    type: issueType,
    category: 'GOVERNOR_LIMITS',
    severity,
    title: `${def.name} limit ${status}: ${Math.round(limit.percentUsed)}%`,
    description:
      `Governor limit "${limit.name}" is at ${limit.used} of ${limit.max} ` +
      `(${Math.round(limit.percentUsed)}%). ` +
      `${isExceeded 
        ? 'This limit has been exceeded and will cause a runtime error.' 
        : 'This is approaching the limit and may fail with more data.'}`,
    eventIds: relatedEvents.map(e => e.id).slice(0, 5),
    lineNumbers: relatedEvents.map(e => e.lineNumber).slice(0, 5),
    confidence: conf,
    attribution: {
      attribution: 'USER_CODE',
      confidence: confidence(0.7, ['Overall limit consumption']),
      canModify: true,
      aiGuidance: `Review ${def.name.toLowerCase()} usage and apply optimizations.`,
    },
    recommendations: def.recommendations,
    aiContext: createLimitContext(limit, def, relatedEvents),
  };
}

/**
 * Create a namespace-specific issue
 */
function createNamespaceIssue(
  namespace: string,
  limits: Map<string, number>,
  allEvents: LimitEvent[]
): Issue {
  const limitSummary = Array.from(limits.entries())
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ');

  const conf = confidence(0.85, [
    `Managed package ${namespace} consuming significant resources`,
    limitSummary,
  ]);

  const relatedEvents = allEvents.filter(e => e.namespace === namespace);

  return {
    id: `namespace-limit-${++issueIdCounter}`,
    type: 'MANAGED_PACKAGE_ERROR',
    category: 'MANAGED_PACKAGE',
    severity: 'MEDIUM',
    title: `Managed package ${namespace} high limit usage`,
    description:
      `The ${namespace} managed package is consuming significant governor limits: ${limitSummary}. ` +
      `This reduces the budget available for your custom code.`,
    eventIds: relatedEvents.map(e => e.id).slice(0, 3),
    lineNumbers: relatedEvents.map(e => e.lineNumber).slice(0, 3),
    confidence: conf,
    attribution: {
      attribution: 'MANAGED_PACKAGE',
      confidence: confidence(0.95, ['Explicitly tracked to namespace']),
      namespace,
      canModify: false,
      aiGuidance: `The ${namespace} package is consuming limits. Consider contacting the vendor or reducing triggers/integrations that invoke package code.`,
    },
    recommendations: [
      `Review what triggers or processes invoke ${namespace} code`,
      'Contact the package vendor about optimization options',
      'Consider reducing batch sizes that trigger package execution',
      'Check package settings for configurable behaviors that might reduce resource usage',
    ],
    aiContext: {
      relevantEvents: relatedEvents.slice(0, 5).map(e => ({
        id: e.id,
        type: e.type,
        line: e.lineNumber,
        summary: `${e.limitName}: ${e.used}/${e.max}`,
      })),
      metrics: {
        occurrences: limits.size,
      },
    },
  };
}

/**
 * Create AI context for limit issue
 */
function createLimitContext(
  limit: LimitUsage,
  def: LimitDefinition,
  events: LimitEvent[]
): AIIssueContext {
  const relevantEvents: EventSummary[] = events.slice(0, 5).map(e => ({
    id: e.id,
    type: e.type,
    line: e.lineNumber,
    summary: e.limitName ? `${e.limitName}: ${e.used}/${e.max}` : 'Limit event',
  }));

  const fixPatterns: FixPattern[] = [];
  
  // Add specific fix patterns based on limit type
  if (limit.name.includes('SOQL')) {
    fixPatterns.push({
      name: 'Query Consolidation',
      description: 'Combine multiple queries into one',
      before: `for (Account acc : accounts) {\n  List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];\n}`,
      after: `Map<Id, List<Contact>> contactsByAccount = new Map<Id, List<Contact>>();\nfor (Contact c : [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds]) {\n  // Group by AccountId\n}`,
      applicability: confidence(0.85, ['Standard SOQL optimization pattern']),
    });
  }

  if (limit.name.includes('DML')) {
    fixPatterns.push({
      name: 'Bulk DML',
      description: 'Collect records and perform single DML',
      before: `for (Account acc : accounts) {\n  acc.Status__c = 'Active';\n  update acc;\n}`,
      after: `for (Account acc : accounts) {\n  acc.Status__c = 'Active';\n}\nupdate accounts;  // Single DML for all records`,
      applicability: confidence(0.9, ['Standard bulkification pattern']),
    });
  }

  if (limit.name.includes('heap')) {
    fixPatterns.push({
      name: 'SOQL FOR Loop',
      description: 'Process records without loading all into memory',
      before: `List<Account> accounts = [SELECT Id, Name FROM Account];\nfor (Account acc : accounts) {\n  // Process\n}`,
      after: `for (Account acc : [SELECT Id, Name FROM Account]) {\n  // Process - only loads 200 at a time\n}`,
      applicability: confidence(0.8, ['Reduces heap usage for large queries']),
    });
  }

  return {
    relevantEvents,
    metrics: {
      totalImpact: limit.used,
      limitPercentage: Math.round(limit.percentUsed),
    },
    fixPatterns,
    clarifyingQuestions: [
      'Is this code running in synchronous or asynchronous context?',
      `What operations are consuming the most ${def.name.toLowerCase()}?`,
      'Can any processing be moved to Batch Apex or Queueable?',
    ],
  };
}

// ============================================================================
// Additional Exports
// ============================================================================

/**
 * Analyze limits and return a summary (for use by other modules)
 */
export function analyzeLimitSummary(events: EventNode[]): LimitSummary {
  const limitEvents = extractLimitEvents(events);
  const finalLimits = extractFinalLimits(limitEvents);
  
  const limitUsage: Record<string, LimitUsageInfo> = {};
  const criticalLimits: string[] = [];
  const warningLimits: string[] = [];
  
  for (const limit of finalLimits) {
    const def = LIMIT_DEFINITIONS[limit.name] || createGenericDefinition(limit.name);
    
    limitUsage[limit.name] = {
      used: limit.used,
      max: limit.max,
      percentUsed: limit.percentUsed,
      status: getStatus(limit.percentUsed, def),
    };
    
    if (limit.percentUsed >= def.criticalThreshold) {
      criticalLimits.push(limit.name);
    } else if (limit.percentUsed >= def.warningThreshold) {
      warningLimits.push(limit.name);
    }
  }
  
  return {
    limitUsage,
    criticalLimits,
    warningLimits,
    overallHealth: criticalLimits.length > 0 ? 'CRITICAL' : warningLimits.length > 0 ? 'WARNING' : 'HEALTHY',
  };
}

function getStatus(percentUsed: number, def: LimitDefinition): 'OK' | 'WARNING' | 'CRITICAL' | 'EXCEEDED' {
  if (percentUsed >= 100) return 'EXCEEDED';
  if (percentUsed >= def.criticalThreshold) return 'CRITICAL';
  if (percentUsed >= def.warningThreshold) return 'WARNING';
  return 'OK';
}

export interface LimitSummary {
  limitUsage: Record<string, LimitUsageInfo>;
  criticalLimits: string[];
  warningLimits: string[];
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface LimitUsageInfo {
  used: number;
  max: number;
  percentUsed: number;
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'EXCEEDED';
}
