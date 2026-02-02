/**
 * @module analyzer/detectors/n-plus-one
 * @description Detects N+1 query patterns - queries executed once per record
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type {
  EventNode,
  SOQLEvent,
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
// N+1 Query Detection
// ============================================================================

/**
 * Detects N+1 query patterns in Salesforce logs
 * 
 * N+1 Pattern: 1 initial query + N queries per record returned
 * Example:
 *   SELECT Id FROM Account LIMIT 10  (returns 10 records)
 *   → 10x SELECT ... FROM Contact WHERE AccountId = :accId
 * 
 * Detection Strategy:
 * 1. Find initial "parent" queries
 * 2. Detect follow-up queries that correlate to parent result count
 * 3. Analyze query patterns to identify relationship-based lookups
 */
export const nPlusOneDetector: IssueDetector = {
  name: 'N+1 Query Detector',
  detects: ['N_PLUS_ONE'],

  detect(events: EventNode[]): Issue[] {
    const issues: Issue[] = [];
    const soqlEvents = extractSOQLBeginEvents(events);
    
    if (soqlEvents.length < 3) {
      return issues; // Need at least 1 + 2 queries to detect pattern
    }

    // Analyze query patterns for N+1 signatures
    const nPlusOnePatterns = detectNPlusOnePatterns(soqlEvents);
    
    for (const pattern of nPlusOnePatterns) {
      if (pattern.confidence.score >= 0.6) {
        issues.push(createNPlusOneIssue(pattern, events));
      }
    }

    return issues;
  },
};

// ============================================================================
// Types
// ============================================================================

interface QueryGroup {
  /** Normalized query pattern */
  pattern: string;
  /** Object type being queried */
  objectType: string;
  /** Field in WHERE clause (for relationship detection) */
  filterField?: string;
  /** All queries matching this pattern */
  queries: SOQLEvent[];
  /** Total rows returned */
  totalRows: number;
}

interface NPlusOnePattern {
  /** The initial "1" query */
  parentQuery: SOQLEvent;
  /** The "N" queries */
  childQueries: SOQLEvent[];
  /** Detected relationship */
  relationship: {
    parentObject: string;
    childObject: string;
    relationshipField: string;
  };
  /** Detection confidence */
  confidence: Confidence;
}

// ============================================================================
// Detection Logic
// ============================================================================

/**
 * Extract all SOQL_EXECUTE_BEGIN events
 */
function extractSOQLBeginEvents(events: EventNode[]): SOQLEvent[] {
  return events.filter(
    (e): e is SOQLEvent => e.type === 'SOQL_EXECUTE_BEGIN'
  );
}

/**
 * Detect N+1 query patterns
 */
function detectNPlusOnePatterns(soqlEvents: SOQLEvent[]): NPlusOnePattern[] {
  const patterns: NPlusOnePattern[] = [];
  const queryGroups = groupQueriesByPattern(soqlEvents);
  
  // Find groups with high repetition (the "N" part)
  const repeatedGroups = Array.from(queryGroups.values())
    .filter(g => g.queries.length >= 2);
  
  if (repeatedGroups.length === 0) {
    return patterns;
  }

  // For each repeated group, try to find a parent "1" query
  for (const childGroup of repeatedGroups) {
    const parentCandidate = findParentQuery(childGroup, soqlEvents);
    
    if (parentCandidate) {
      const conf = calculateNPlusOneConfidence(parentCandidate, childGroup);
      
      if (conf.score >= 0.5) {
        patterns.push({
          parentQuery: parentCandidate.query,
          childQueries: childGroup.queries,
          relationship: {
            parentObject: parentCandidate.objectType,
            childObject: childGroup.objectType,
            relationshipField: childGroup.filterField || 'Id',
          },
          confidence: conf,
        });
      }
    }
  }

  return patterns;
}

/**
 * Group queries by normalized pattern
 */
function groupQueriesByPattern(events: SOQLEvent[]): Map<string, QueryGroup> {
  const groups = new Map<string, QueryGroup>();

  for (const event of events) {
    if (!event.query) continue;

    const pattern = normalizeQuery(event.query);
    const objectType = extractObjectType(event.query);
    const filterField = extractFilterField(event.query);

    const existing = groups.get(pattern);
    if (existing) {
      existing.queries.push(event);
      existing.totalRows += event.rowCount || 0;
    } else {
      groups.set(pattern, {
        pattern,
        objectType,
        filterField,
        queries: [event],
        totalRows: event.rowCount || 0,
      });
    }
  }

  return groups;
}

/**
 * Find a candidate parent query for a group of repeated queries
 */
function findParentQuery(
  childGroup: QueryGroup,
  allQueries: SOQLEvent[]
): { query: SOQLEvent; objectType: string } | null {
  // Look for a query that:
  // 1. Executed before the child queries
  // 2. Returns a number close to the child query count
  // 3. Queries a different object (parent object)

  const firstChildTimestamp = Math.min(...childGroup.queries.map(q => q.timestamp));
  const childCount = childGroup.queries.length;
  const childObject = childGroup.objectType;

  // Find queries before the first child
  const precedingQueries = allQueries.filter(
    q => q.timestamp < firstChildTimestamp && q.type === 'SOQL_EXECUTE_BEGIN'
  );

  for (const query of precedingQueries.reverse()) { // Start from most recent
    const parentObject = extractObjectType(query.query || '');
    
    // Skip if same object type
    if (parentObject === childObject) continue;
    
    // Check if row count correlates
    const rowCount = query.rowCount || 0;
    if (rowCount > 0 && isCountCorrelated(rowCount, childCount)) {
      return { query, objectType: parentObject };
    }
  }

  return null;
}

/**
 * Check if parent row count correlates with child query count
 */
function isCountCorrelated(parentRows: number, childQueryCount: number): boolean {
  // Exact match
  if (parentRows === childQueryCount) return true;
  
  // Within 20% (accounts for some filtering)
  const ratio = childQueryCount / parentRows;
  return ratio >= 0.8 && ratio <= 1.2;
}

/**
 * Calculate confidence for N+1 detection
 */
function calculateNPlusOneConfidence(
  parent: { query: SOQLEvent; objectType: string },
  childGroup: QueryGroup
): Confidence {
  const reasons: string[] = [];
  const limitations: string[] = [];
  let score = 0.5;

  const parentRows = parent.query.rowCount || 0;
  const childCount = childGroup.queries.length;

  // Exact count match = high confidence
  if (parentRows === childCount) {
    score += 0.3;
    reasons.push(`Parent query returned ${parentRows} rows, followed by exactly ${childCount} child queries`);
  } else if (parentRows > 0) {
    score += 0.15;
    reasons.push(`Parent query returned ${parentRows} rows, detected ${childCount} child queries`);
    limitations.push('Child query count differs slightly from parent row count');
  }

  // Check for common relationship patterns
  const hasRelationshipField = childGroup.filterField && 
    (childGroup.filterField.endsWith('Id') || childGroup.filterField.endsWith('__c'));
  
  if (hasRelationshipField) {
    score += 0.1;
    reasons.push(`Child queries filter on ${childGroup.filterField} (relationship field)`);
  }

  // Timing analysis
  const queryTimes = childGroup.queries.map(q => q.timestamp);
  const avgGap = calculateAverageGap(queryTimes);
  if (avgGap < 10_000_000) { // Less than 10ms between queries
    score += 0.1;
    reasons.push('Child queries executed in rapid succession');
  }

  // Common N+1 object patterns
  const commonPatterns = [
    ['Account', 'Contact'],
    ['Account', 'Opportunity'],
    ['Opportunity', 'OpportunityLineItem'],
    ['Order', 'OrderItem'],
    ['Case', 'CaseComment'],
  ];

  const parentType = parent.objectType ?? '';
  const childType = childGroup.objectType ?? '';

  for (const pattern of commonPatterns) {
    const parentObj = pattern[0];
    const childObj = pattern[1];
    if (!parentObj || !childObj) continue;
    if (
      (parentType.includes(parentObj) && childType.includes(childObj)) ||
      (parentType.includes(childObj) && childType.includes(parentObj))
    ) {
      score += 0.1;
      reasons.push(`Common parent-child relationship: ${parentType} → ${childType}`);
      break;
    }
  }

  if (childCount < 5) {
    limitations.push('Low repetition count - may be intentional');
  }

  return confidence(Math.min(score, 1.0), reasons, limitations.length > 0 ? limitations : undefined);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize query for pattern matching
 */
function normalizeQuery(query: string): string {
  return query
    .replace(/'[^']*'/g, "'?'")
    .replace(/\b\d+\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Extract the object type from a SOQL query
 */
function extractObjectType(query: string): string {
  const match = query.match(/FROM\s+(\w+)/i);
  return match && match[1] ? match[1] : 'Unknown';
}

/**
 * Extract the filter field from WHERE clause
 */
function extractFilterField(query: string): string | undefined {
  // Look for simple WHERE field = :value pattern
  const match = query.match(/WHERE\s+(\w+)\s*=/i);
  return match ? match[1] : undefined;
}

/**
 * Calculate average gap between timestamps
 */
function calculateAverageGap(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  
  const sorted = [...timestamps].sort((a, b) => a - b);
  let totalGap = 0;
  
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prev = sorted[i - 1];
    if (curr !== undefined && prev !== undefined) {
      totalGap += curr - prev;
    }
  }
  
  return totalGap / (sorted.length - 1);
}

// ============================================================================
// Issue Creation
// ============================================================================

let issueIdCounter = 0;

/**
 * Create an N+1 issue
 */
function createNPlusOneIssue(pattern: NPlusOnePattern, _allEvents: EventNode[]): Issue {
  const { parentQuery, childQueries, relationship, confidence: conf } = pattern;
  
  const eventIds = [parentQuery.id, ...childQueries.map(q => q.id)];
  const lineNumbers = [parentQuery.lineNumber, ...childQueries.map(q => q.lineNumber)];

  return {
    id: `n-plus-one-${++issueIdCounter}`,
    type: 'N_PLUS_ONE',
    category: 'ANTI_PATTERN',
    severity: childQueries.length >= 20 ? 'CRITICAL' : childQueries.length >= 10 ? 'HIGH' : 'MEDIUM',
    title: `N+1 Query: 1 + ${childQueries.length} queries`,
    description:
      `Detected N+1 query pattern: One query on ${relationship.parentObject} ` +
      `followed by ${childQueries.length} queries on ${relationship.childObject}. ` +
      `This consumes ${childQueries.length + 1} of 100 allowed SOQL queries. ` +
      `Use relationship queries or Maps to consolidate into 1-2 queries.`,
    eventIds,
    lineNumbers,
    confidence: conf,
    attribution: createAttribution(parentQuery, childQueries),
    recommendations: [
      `Use a parent-child subquery: SELECT Id, (SELECT Id FROM ${relationship.childObject}s) FROM ${relationship.parentObject}`,
      `Query all ${relationship.childObject} records with IN clause on ${relationship.relationshipField}`,
      `Use Apex Maps to cache queried data and avoid repeated lookups`,
      `Consider SOQL FOR loops with efficient data processing`,
    ],
    aiContext: createAIContext(pattern),
  };
}

/**
 * Create attribution info
 */
function createAttribution(parentQuery: SOQLEvent, childQueries: SOQLEvent[]): AttributionInfo {
  const hasNamespace = parentQuery.namespace || childQueries.some(q => q.namespace);
  
  if (hasNamespace) {
    const namespace = parentQuery.namespace || childQueries.find(q => q.namespace)?.namespace || 'unknown';
    return {
      attribution: 'MANAGED_PACKAGE',
      confidence: confidence(0.8, ['Queries originated in managed package namespace']),
      namespace,
      canModify: false,
      aiGuidance: `This N+1 pattern originates from the ${namespace} package. Contact vendor for optimization options.`,
    };
  }

  return {
    attribution: 'USER_CODE',
    confidence: confidence(0.9, ['No managed package namespace detected']),
    canModify: true,
    aiGuidance: 'Refactor to use relationship queries or Map-based caching.',
  };
}

/**
 * Create AI-specific context
 */
function createAIContext(pattern: NPlusOnePattern): AIIssueContext {
  const { parentQuery, childQueries, relationship } = pattern;

  const relevantEvents: EventSummary[] = [
    {
      id: parentQuery.id,
      type: 'SOQL_EXECUTE_BEGIN',
      line: parentQuery.lineNumber,
      summary: `Parent: ${parentQuery.query?.substring(0, 60) || 'Query'}...`,
      durationMs: parentQuery.duration ? Number(parentQuery.duration) / 1_000_000 : undefined,
    },
    ...childQueries.slice(0, 3).map((q, i) => ({
      id: q.id,
      type: 'SOQL_EXECUTE_BEGIN' as const,
      line: q.lineNumber,
      summary: `Child ${i + 1}: ${q.query?.substring(0, 60) || 'Query'}...`,
      durationMs: q.duration ? Number(q.duration) / 1_000_000 : undefined,
    })),
  ];

  const fixPatterns: FixPattern[] = [
    {
      name: 'Relationship Subquery',
      description: 'Use parent-child relationship query to fetch all data in one query',
      before: `List<Account> accounts = [SELECT Id FROM Account WHERE ...];\nfor (Account acc : accounts) {\n  List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];\n}`,
      after: `List<Account> accounts = [SELECT Id, (SELECT Id FROM Contacts) FROM Account WHERE ...];\nfor (Account acc : accounts) {\n  List<Contact> contacts = acc.Contacts;\n}`,
      applicability: confidence(0.9, ['Standard Salesforce pattern', 'Works for parent-child relationships']),
    },
    {
      name: 'Bulk Query with Map',
      description: 'Collect all IDs, query once, use Map for lookups',
      before: `for (Account acc : accounts) {\n  List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];\n}`,
      after: `Set<Id> accountIds = new Map<Id, Account>(accounts).keySet();\nMap<Id, List<Contact>> contactsByAcct = new Map<Id, List<Contact>>();\nfor (Contact c : [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds]) {\n  if (!contactsByAcct.containsKey(c.AccountId)) {\n    contactsByAcct.put(c.AccountId, new List<Contact>());\n  }\n  contactsByAcct.get(c.AccountId).add(c);\n}`,
      applicability: confidence(0.85, ['Works for any relationship', 'More complex but flexible']),
    },
  ];

  return {
    relevantEvents,
    metrics: {
      occurrences: childQueries.length + 1,
      totalImpact: childQueries.length + 1,
      limitPercentage: Math.round(((childQueries.length + 1) / 100) * 100),
    },
    fixPatterns,
    clarifyingQuestions: [
      `Is there a standard Salesforce relationship between ${relationship.parentObject} and ${relationship.childObject}?`,
      'Are all child records needed, or can filtering reduce the query scope?',
      'Would caching the data in a static Map be beneficial for repeated access?',
    ],
  };
}
