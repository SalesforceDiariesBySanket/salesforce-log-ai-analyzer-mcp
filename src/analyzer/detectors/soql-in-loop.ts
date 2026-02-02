/**
 * @module analyzer/detectors/soql-in-loop
 * @description Detects SOQL queries executed inside loops - a critical Salesforce anti-pattern
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type {
  EventNode,
  SOQLEvent,
  MethodEvent,
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
// SOQL in Loop Detection
// ============================================================================

/**
 * Detects SOQL queries executed inside loops
 * 
 * This is one of the most critical anti-patterns in Salesforce:
 * - Each SOQL query inside a loop counts against the 100 SOQL limit
 * - Can cause governor limit exceptions and transaction failures
 * 
 * Detection Strategy:
 * 1. Track method call depth to identify loop-like execution patterns
 * 2. Identify repeated SOQL queries with similar signatures
 * 3. Analyze timing patterns to detect rapid repeated execution
 * 4. Check for identical queries executed multiple times in sequence
 */
export const soqlInLoopDetector: IssueDetector = {
  name: 'SOQL in Loop Detector',
  detects: ['SOQL_IN_LOOP'],

  detect(events: EventNode[]): Issue[] {
    const issues: Issue[] = [];
    const soqlEvents = extractSOQLEvents(events);
    
    if (soqlEvents.length < 2) {
      return issues;
    }

    // Strategy 1: Detect repeated identical queries
    const repeatedQueries = detectRepeatedQueries(soqlEvents, events);
    issues.push(...repeatedQueries);

    // Strategy 2: Detect queries in method invocation patterns
    const methodPatternQueries = detectMethodLoopPatterns(soqlEvents, events);
    issues.push(...methodPatternQueries);

    // Deduplicate issues (same query detected by multiple strategies)
    return deduplicateIssues(issues);
  },
};

// ============================================================================
// Detection Strategies
// ============================================================================

/**
 * Extract SOQL BEGIN events from the event list
 * NOTE: Only SOQL_EXECUTE_BEGIN is used to avoid double-counting queries
 * (Each query produces both BEGIN and END events)
 */
function extractSOQLEvents(events: EventNode[]): SOQLEvent[] {
  return events.filter(
    (e): e is SOQLEvent => e.type === 'SOQL_EXECUTE_BEGIN'
  );
}

/**
 * Strategy 1: Detect repeated identical or similar queries
 * 
 * Looks for queries that:
 * - Have identical structure (ignoring bind variable values)
 * - Execute multiple times in rapid succession
 * - Show pattern of N+1 behavior
 */
function detectRepeatedQueries(soqlEvents: SOQLEvent[], allEvents: EventNode[]): Issue[] {
  const issues: Issue[] = [];
  const queryGroups = groupSimilarQueries(soqlEvents);

  for (const [pattern, group] of queryGroups) {
    // Need at least 3 executions to consider it a loop pattern
    if (group.length >= 3) {
      const timingAnalysis = analyzeExecutionTiming(group);
      
      // High confidence if queries are rapid and similar count to limit approach
      const loopConfidence = calculateLoopConfidence(group, timingAnalysis);
      
      if (loopConfidence.score >= 0.6) {
        const issue = createSOQLInLoopIssue(pattern, group, loopConfidence, allEvents);
        issues.push(issue);
      }
    }
  }

  return issues;
}

/**
 * Strategy 2: Detect SOQL in method invocation patterns
 * 
 * Analyzes the call hierarchy to find:
 * - Same method called multiple times containing SOQL
 * - Trigger iteration patterns (once per record)
 * - Batch processing without query bulkification
 */
function detectMethodLoopPatterns(soqlEvents: SOQLEvent[], allEvents: EventNode[]): Issue[] {
  const issues: Issue[] = [];
  const methodEvents = allEvents.filter(
    (e): e is MethodEvent => e.type === 'METHOD_ENTRY' || e.type === 'METHOD_EXIT'
  );

  // Build method invocation counts
  const methodInvocations = new Map<string, { count: number; soqlCount: number; eventIds: number[] }>();

  for (const method of methodEvents) {
    if (method.type === 'METHOD_ENTRY') {
      const key = `${method.className}.${method.methodName}`;
      const existing = methodInvocations.get(key) || { count: 0, soqlCount: 0, eventIds: [] };
      existing.count++;
      existing.eventIds.push(method.id);
      methodInvocations.set(key, existing);
    }
  }

  // Find methods called multiple times
  for (const [methodKey, stats] of methodInvocations) {
    if (stats.count >= 3) {
      // Check if any of these method invocations contain SOQL
      const soqlInMethod = findSOQLInMethodScope(stats.eventIds, soqlEvents, allEvents);
      
      if (soqlInMethod.length > 0) {
        const conf = confidence(
          Math.min(0.95, 0.5 + (stats.count / 20)),
          [
            `Method ${methodKey} called ${stats.count} times`,
            `Contains ${soqlInMethod.length} SOQL queries`,
            'Pattern suggests loop execution',
          ],
          stats.count < 5 ? ['Low iteration count - may be false positive'] : undefined
        );

        const issue = createMethodPatternIssue(methodKey, stats, soqlInMethod, conf, allEvents);
        issues.push(issue);
      }
    }
  }

  return issues;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Group SOQL queries by their normalized pattern
 * Normalizes query by removing specific bind values
 */
function groupSimilarQueries(soqlEvents: SOQLEvent[]): Map<string, SOQLEvent[]> {
  const groups = new Map<string, SOQLEvent[]>();
  
  for (const event of soqlEvents) {
    if (event.type === 'SOQL_EXECUTE_BEGIN' && event.query) {
      const pattern = normalizeQueryPattern(event.query);
      const existing = groups.get(pattern) || [];
      existing.push(event);
      groups.set(pattern, existing);
    }
  }

  return groups;
}

/**
 * Normalize a SOQL query to detect similar queries
 * Replaces literal values with placeholders
 */
function normalizeQueryPattern(query: string): string {
  return query
    // Remove string literals
    .replace(/'[^']*'/g, "'?'")
    // Remove numeric literals
    .replace(/\b\d+\b/g, '?')
    // Remove whitespace differences
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Analyze timing between query executions
 */
function analyzeExecutionTiming(events: SOQLEvent[]): TimingAnalysis {
  if (events.length < 2) {
    return { avgGapNs: 0, minGapNs: 0, maxGapNs: 0, isRapidFire: false };
  }

  const gaps: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (prev && curr) {
      const gap = curr.timestamp - prev.timestamp;
      gaps.push(gap);
    }
  }

  if (gaps.length === 0) {
    return { avgGapNs: 0, minGapNs: 0, maxGapNs: 0, isRapidFire: false };
  }

  const avgGapNs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const minGapNs = Math.min(...gaps);
  const maxGapNs = Math.max(...gaps);

  // Consider "rapid fire" if average gap is less than 10ms (10,000,000 ns)
  const isRapidFire = avgGapNs < 10_000_000;

  return { avgGapNs, minGapNs, maxGapNs, isRapidFire };
}

interface TimingAnalysis {
  avgGapNs: number;
  minGapNs: number;
  maxGapNs: number;
  isRapidFire: boolean;
}

/**
 * Calculate confidence that queries are in a loop
 */
function calculateLoopConfidence(events: SOQLEvent[], timing: TimingAnalysis): Confidence {
  const reasons: string[] = [];
  const limitations: string[] = [];
  let score = 0.5; // Base score for having repeated queries

  // More repetitions = higher confidence
  if (events.length >= 10) {
    score += 0.2;
    reasons.push(`${events.length} identical queries executed`);
  } else if (events.length >= 5) {
    score += 0.1;
    reasons.push(`${events.length} identical queries executed`);
  } else {
    reasons.push(`${events.length} similar queries detected`);
  }

  // Rapid execution = higher confidence
  if (timing.isRapidFire) {
    score += 0.2;
    reasons.push('Queries executed in rapid succession');
  }

  // Consistent timing = higher confidence (loop behavior)
  const timingVariance = timing.maxGapNs - timing.minGapNs;
  if (timingVariance < 1_000_000) { // Less than 1ms variance
    score += 0.1;
    reasons.push('Consistent execution timing suggests loop');
  }

  // Add limitations
  if (events.length < 5) {
    limitations.push('Small sample size - may be intentional repeated queries');
  }
  if (!timing.isRapidFire) {
    limitations.push('Queries not in rapid succession - may be separate operations');
  }

  return confidence(Math.min(score, 1.0), reasons, limitations.length > 0 ? limitations : undefined);
}

/**
 * Find SOQL events that occur within a method's scope
 */
function findSOQLInMethodScope(
  methodEventIds: number[],
  soqlEvents: SOQLEvent[],
  allEvents: EventNode[]
): SOQLEvent[] {
  const result: SOQLEvent[] = [];
  const eventMap = new Map(allEvents.map(e => [e.id, e]));

  for (const soql of soqlEvents) {
    // Check if this SOQL's parent chain includes any of the method invocations
    let currentId = soql.parentId;
    while (currentId !== -1) {
      if (methodEventIds.includes(currentId)) {
        result.push(soql);
        break;
      }
      const parent = eventMap.get(currentId);
      currentId = parent?.parentId ?? -1;
    }
  }

  return result;
}

/**
 * Deduplicate issues based on overlapping event IDs
 */
function deduplicateIssues(issues: Issue[]): Issue[] {
  if (issues.length <= 1) return issues;

  const seen = new Set<string>();
  const result: Issue[] = [];

  for (const issue of issues) {
    // Create key from sorted event IDs
    const key = issue.eventIds.sort().join(',');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(issue);
    }
  }

  return result;
}

// ============================================================================
// Issue Creation
// ============================================================================

let issueIdCounter = 0;

/**
 * Create an issue for repeated SOQL queries
 */
function createSOQLInLoopIssue(
  pattern: string,
  events: SOQLEvent[],
  conf: Confidence,
  _allEvents: EventNode[]
): Issue {
  const eventIds = events.map(e => e.id);
  const lineNumbers = events.map(e => e.lineNumber);
  const firstEvent = events[0];
  const queryPreview = firstEvent?.query?.substring(0, 100) || pattern;

  const aiContext = createAIContext(events);
  const attribution = createAttribution(events);

  return {
    id: `soql-loop-${++issueIdCounter}`,
    type: 'SOQL_IN_LOOP',
    category: 'ANTI_PATTERN',
    severity: events.length >= 20 ? 'CRITICAL' : events.length >= 10 ? 'HIGH' : 'MEDIUM',
    title: `SOQL query executed ${events.length} times`,
    description:
      `The query "${queryPreview}..." was executed ${events.length} times with similar structure. ` +
      `This pattern suggests SOQL inside a loop, which can hit the 100 SOQL limit ` +
      `(currently at ${Math.round((events.length / 100) * 100)}% usage from this pattern alone).`,
    eventIds,
    lineNumbers,
    confidence: conf,
    attribution,
    recommendations: [
      'Move the SOQL query outside the loop',
      'Use a Map to cache query results by key',
      'Collect all IDs first, then query in bulk with IN clause',
      'Consider using Custom Settings or Custom Metadata for frequently accessed data',
    ],
    aiContext,
  };
}

/**
 * Create an issue for method invocation patterns
 */
function createMethodPatternIssue(
  methodKey: string,
  stats: { count: number; eventIds: number[] },
  soqlEvents: SOQLEvent[],
  conf: Confidence,
  _allEvents: EventNode[]
): Issue {
  const eventIds = [...stats.eventIds, ...soqlEvents.map(e => e.id)];
  const lineNumbers = soqlEvents.map(e => e.lineNumber);
  const [_className, _methodName] = methodKey.split('.');

  return {
    id: `soql-loop-method-${++issueIdCounter}`,
    type: 'SOQL_IN_LOOP',
    category: 'ANTI_PATTERN',
    severity: stats.count >= 20 ? 'CRITICAL' : stats.count >= 10 ? 'HIGH' : 'MEDIUM',
    title: `Method ${methodKey} with SOQL called ${stats.count} times`,
    description:
      `The method ${methodKey} contains SOQL and was invoked ${stats.count} times. ` +
      `This pattern typically occurs when iterating over a collection and calling a method ` +
      `that performs a query for each iteration.`,
    eventIds,
    lineNumbers,
    confidence: conf,
    attribution: {
      attribution: 'USER_CODE',
      confidence: confidence(0.9, ['Method is in user code namespace']),
      canModify: true,
      aiGuidance: `Refactor ${methodKey} to accept a collection and perform bulk queries`,
    },
    recommendations: [
      `Refactor ${methodKey} to accept a List/Set of IDs`,
      'Move SOQL outside the loop before calling the method',
      'Pass queried data as a parameter instead of re-querying',
      'Use lazy loading with caching for repeated access patterns',
    ],
    aiContext: {
      relevantEvents: soqlEvents.slice(0, 5).map((e) => ({
        id: e.id,
        type: e.type,
        line: e.lineNumber,
        summary: e.query?.substring(0, 50) || 'SOQL query',
        durationMs: e.duration ? Number(e.duration) / 1_000_000 : undefined,
      })),
      fixPatterns: [
        {
          name: 'Bulk Query Pattern',
          description: 'Query all records at once using IN clause',
          before: `for (Id accId : accountIds) {\n  Account acc = [SELECT Id FROM Account WHERE Id = :accId];\n}`,
          after: `Map<Id, Account> accMap = new Map<Id, Account>(\n  [SELECT Id FROM Account WHERE Id IN :accountIds]\n);`,
          applicability: confidence(0.85, ['Common pattern', 'Well-documented solution']),
        },
      ],
    },
  };
}

/**
 * Create AI-specific context
 */
function createAIContext(events: SOQLEvent[]): AIIssueContext {
  const relevantEvents: EventSummary[] = events.slice(0, 5).map((e) => ({
    id: e.id,
    type: e.type,
    line: e.lineNumber,
    summary: e.query?.substring(0, 80) || 'SOQL query',
    durationMs: e.duration ? Number(e.duration) / 1_000_000 : undefined,
  }));

  const fixPatterns: FixPattern[] = [
    {
      name: 'Map Caching Pattern',
      description: 'Query once, store results in a Map for O(1) lookup',
      before: `for (Contact c : contacts) {\n  Account acc = [SELECT Id, Name FROM Account WHERE Id = :c.AccountId];\n}`,
      after: `Set<Id> accountIds = new Set<Id>();\nfor (Contact c : contacts) {\n  accountIds.add(c.AccountId);\n}\nMap<Id, Account> accMap = new Map<Id, Account>(\n  [SELECT Id, Name FROM Account WHERE Id IN :accountIds]\n);\nfor (Contact c : contacts) {\n  Account acc = accMap.get(c.AccountId);\n}`,
      applicability: confidence(0.9, ['Standard Salesforce best practice', 'Bulk API friendly']),
    },
    {
      name: 'Subquery Pattern',
      description: 'Use relationship queries to fetch related records in single query',
      before: `List<Account> accounts = [SELECT Id FROM Account WHERE ...];\nfor (Account acc : accounts) {\n  List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];\n}`,
      after: `List<Account> accounts = [SELECT Id, (SELECT Id FROM Contacts) FROM Account WHERE ...];\nfor (Account acc : accounts) {\n  List<Contact> contacts = acc.Contacts;\n}`,
      applicability: confidence(0.7, ['Works for parent-child relationships', 'May not apply to all scenarios']),
    },
  ];

  return {
    relevantEvents,
    metrics: {
      occurrences: events.length,
      totalImpact: events.length,
      limitPercentage: Math.round((events.length / 100) * 100),
    },
    fixPatterns,
    clarifyingQuestions: [
      'What data is being looked up in each iteration?',
      'Can the lookup data be queried in bulk before the loop?',
      'Is there a relationship between the iterated records and queried records?',
    ],
  };
}

/**
 * Create attribution info
 */
function createAttribution(events: SOQLEvent[]): AttributionInfo {
  // Check if any events are in a managed package namespace
  const hasNamespace = events.some(e => e.namespace && e.namespace !== '');
  
  if (hasNamespace) {
    const namespace = events.find(e => e.namespace)?.namespace || 'unknown';
    return {
      attribution: 'MANAGED_PACKAGE',
      confidence: confidence(0.8, ['Query originated in managed package namespace']),
      namespace,
      canModify: false,
      aiGuidance: `This query originates from the ${namespace} managed package. Contact the vendor for optimization.`,
    };
  }

  return {
    attribution: 'USER_CODE',
    confidence: confidence(0.9, ['No managed package namespace detected']),
    canModify: true,
    aiGuidance: 'This is user code - the query pattern can be refactored to use bulk patterns.',
  };
}
