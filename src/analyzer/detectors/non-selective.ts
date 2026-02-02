/**
 * @module analyzer/detectors/non-selective
 * @description Detects non-selective SOQL queries that can cause performance issues
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
// Non-Selective Query Detection
// ============================================================================

/**
 * Detects non-selective SOQL queries
 * 
 * Non-selective queries:
 * - Don't use indexed fields in WHERE clause
 * - Return large result sets
 * - Cause full table scans
 * - Can cause "Non-selective query" runtime errors
 * 
 * Detection Strategy:
 * 1. Analyze SOQL_EXECUTE_EXPLAIN events for query plans
 * 2. Check query patterns for missing filter criteria
 * 3. Detect queries with high row counts
 * 4. Identify queries missing standard indexed fields (Id, Name, Owner, etc.)
 */
export const nonSelectiveDetector: IssueDetector = {
  name: 'Non-Selective Query Detector',
  detects: ['NON_SELECTIVE_QUERY', 'SLOW_QUERY'],

  detect(events: EventNode[]): Issue[] {
    const issues: Issue[] = [];
    const soqlEvents = extractSOQLEvents(events);
    
    for (const event of soqlEvents) {
      // Strategy 1: Use query plan if available
      if (event.queryPlan) {
        const planIssue = analyzeQueryPlan(event);
        if (planIssue) {
          issues.push(planIssue);
          continue;
        }
      }

      // Strategy 2: Heuristic analysis of query text
      if (event.query) {
        const heuristicIssue = analyzeQueryHeuristics(event);
        if (heuristicIssue) {
          issues.push(heuristicIssue);
          continue;
        }
      }

      // Strategy 3: Row count analysis
      const rowCountIssue = analyzeRowCount(event);
      if (rowCountIssue) {
        issues.push(rowCountIssue);
      }
    }

    return issues;
  },
};

// ============================================================================
// Detection Strategies
// ============================================================================

/**
 * Extract SOQL events with potential issues
 */
function extractSOQLEvents(events: EventNode[]): SOQLEvent[] {
  return events.filter(
    (e): e is SOQLEvent =>
      e.type === 'SOQL_EXECUTE_BEGIN' ||
      e.type === 'SOQL_EXECUTE_END' ||
      e.type === 'SOQL_EXECUTE_EXPLAIN'
  );
}

/**
 * Analyze query plan from SOQL_EXECUTE_EXPLAIN events
 */
function analyzeQueryPlan(event: SOQLEvent): Issue | null {
  const plan = event.queryPlan;
  if (!plan) return null;

  const issues: string[] = [];
  let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

  // Check relative cost
  if (plan.relativeCost > 1) {
    issues.push(`High relative cost: ${plan.relativeCost}`);
    severity = plan.relativeCost > 2 ? 'HIGH' : 'MEDIUM';
  }

  // Check cardinality (expected rows)
  if (plan.cardinality > 10000) {
    issues.push(`High cardinality: ${plan.cardinality} expected rows`);
    severity = plan.cardinality > 100000 ? 'HIGH' : 'MEDIUM';
  }

  // Check leading operation type
  if (plan.leadingOperationType === 'TableScan') {
    issues.push('Full table scan detected');
    severity = 'HIGH';
  }

  if (issues.length === 0) return null;

  const conf = confidence(
    Math.min(0.95, 0.6 + (issues.length * 0.1)),
    ['Query plan analysis', ...issues]
  );

  return createNonSelectiveIssue(event, issues, conf, severity, 'QUERY_PLAN');
}

/**
 * Heuristic analysis of query text
 */
function analyzeQueryHeuristics(event: SOQLEvent): Issue | null {
  const query = event.query?.toUpperCase() || '';
  if (!query) return null;

  const issues: string[] = [];
  let score = 0;

  // Check for missing WHERE clause
  if (!query.includes('WHERE')) {
    issues.push('Query has no WHERE clause');
    score += 0.3;
  } else {
    // Analyze WHERE clause content
    const whereClause = extractWhereClause(query);
    
    // Check for non-selective patterns
    if (whereClause) {
      // LIKE with leading wildcard
      if (/%\w/.test(whereClause) || /LIKE\s+'%/.test(whereClause)) {
        issues.push('LIKE clause with leading wildcard (not indexable)');
        score += 0.25;
      }

      // NOT IN or != operators (often non-selective)
      if (/NOT\s+IN|!=|<>/.test(whereClause)) {
        issues.push('Negative filter (NOT IN, !=) may be non-selective');
        score += 0.15;
      }

      // OR conditions (can prevent index use)
      if (/\sOR\s/i.test(whereClause)) {
        issues.push('OR conditions may prevent index optimization');
        score += 0.1;
      }

      // Check for indexed field usage
      const usesIndexedField = checkForIndexedFields(whereClause, event);
      if (!usesIndexedField) {
        issues.push('No standard indexed fields (Id, Name, OwnerId) in filter');
        score += 0.2;
      }
    }
  }

  // Check for broad queries
  if (/SELECT\s+\*/.test(query) || /SELECT.*,.*,.*,.*,/.test(query)) {
    issues.push('Selecting many fields increases data transfer');
    score += 0.1;
  }

  // No LIMIT on large object queries
  if (!query.includes('LIMIT') && !query.includes('WHERE')) {
    issues.push('Query has no LIMIT clause');
    score += 0.2;
  }

  if (issues.length === 0) return null;

  const conf = confidence(
    Math.min(score, 0.85), // Cap at 0.85 since this is heuristic
    issues,
    ['Heuristic analysis - may not reflect actual query plan']
  );

  const severity = score >= 0.4 ? 'HIGH' : score >= 0.25 ? 'MEDIUM' : 'LOW';

  return createNonSelectiveIssue(event, issues, conf, severity, 'HEURISTIC');
}

/**
 * Analyze row count for potential issues
 */
function analyzeRowCount(event: SOQLEvent): Issue | null {
  // Only analyze SOQL_EXECUTE_END which has row count
  if (event.type !== 'SOQL_EXECUTE_END') return null;
  
  const rowCount = event.rowCount ?? 0;
  if (rowCount < 1000) return null;

  const issues: string[] = [];
  let severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

  if (rowCount >= 50000) {
    issues.push(`Very high row count: ${rowCount} rows returned`);
    severity = 'HIGH';
  } else if (rowCount >= 10000) {
    issues.push(`High row count: ${rowCount} rows returned`);
    severity = 'HIGH';
  } else {
    issues.push(`Moderate row count: ${rowCount} rows returned`);
  }

  // Check duration if available
  const durationMs = event.duration ? Number(event.duration) / 1_000_000 : 0;
  if (durationMs > 1000) {
    issues.push(`Slow query: ${Math.round(durationMs)}ms execution time`);
    severity = 'HIGH';
  } else if (durationMs > 500) {
    issues.push(`Moderate query time: ${Math.round(durationMs)}ms`);
  }

  const conf = confidence(
    rowCount >= 10000 ? 0.85 : 0.65,
    issues,
    ['High row count may be intentional for batch processing']
  );

  return createNonSelectiveIssue(event, issues, conf, severity, 'ROW_COUNT');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract WHERE clause from query
 */
function extractWhereClause(query: string): string | null {
  const match = query.match(/WHERE\s+(.+?)(?:ORDER BY|GROUP BY|LIMIT|$)/i);
  return match?.[1] ? match[1].trim() : null;
}

/**
 * Check if query uses standard indexed fields
 */
function checkForIndexedFields(whereClause: string, _event: SOQLEvent): boolean {
  // Standard indexed fields in Salesforce
  const indexedPatterns = [
    /\bID\s*=/i,
    /\bNAME\s*=/i,
    /\bOWNERID\s*=/i,
    /\bCREATEDBYID\s*=/i,
    /\bLASTMODIFIEDBYID\s*=/i,
    /\bCREATEDDATE\s*[<>=]/i,
    /\bLASTMODIFIEDDATE\s*[<>=]/i,
    /\bSYSTEMMODSTAMP\s*[<>=]/i,
    /\bRECORDTYPEID\s*=/i,
    /\bIN\s*:/i, // Bind variables often indexed
    /\b\w+__C\s*=\s*:/i, // Custom field with bind variable
  ];

  return indexedPatterns.some(pattern => pattern.test(whereClause));
}

// ============================================================================
// Issue Creation
// ============================================================================

let issueIdCounter = 0;

/**
 * Create a non-selective query issue
 */
function createNonSelectiveIssue(
  event: SOQLEvent,
  issueDescriptions: string[],
  conf: Confidence,
  severity: 'HIGH' | 'MEDIUM' | 'LOW',
  detectionMethod: 'QUERY_PLAN' | 'HEURISTIC' | 'ROW_COUNT'
): Issue {
  const queryPreview = event.query?.substring(0, 80) || 'Unknown query';
  const objectType = extractObjectType(event.query || '');

  const issueType = severity === 'HIGH' || issueDescriptions.some(i => i.includes('table scan'))
    ? 'NON_SELECTIVE_QUERY' as const
    : 'SLOW_QUERY' as const;

  return {
    id: `non-selective-${++issueIdCounter}`,
    type: issueType,
    category: 'PERFORMANCE',
    severity,
    title: issueType === 'NON_SELECTIVE_QUERY' 
      ? `Non-selective query on ${objectType}`
      : `Slow query on ${objectType}`,
    description:
      `Query "${queryPreview}..." may have performance issues. ` +
      `Issues detected: ${issueDescriptions.join('; ')}. ` +
      `Non-selective queries can cause runtime errors in triggers and fail during data loads.`,
    eventIds: [event.id],
    lineNumbers: [event.lineNumber],
    confidence: conf,
    attribution: createAttribution(event),
    recommendations: getRecommendations(issueDescriptions, event),
    aiContext: createAIContext(event, issueDescriptions, detectionMethod),
  };
}

/**
 * Extract object type from query
 */
function extractObjectType(query: string): string {
  const match = query.match(/FROM\s+(\w+)/i);
  return match?.[1] ?? 'Unknown';
}

/**
 * Create attribution info
 */
function createAttribution(event: SOQLEvent): AttributionInfo {
  if (event.namespace) {
    return {
      attribution: 'MANAGED_PACKAGE',
      confidence: confidence(0.8, ['Query has managed package namespace']),
      namespace: event.namespace,
      canModify: false,
      aiGuidance: `This query is from the ${event.namespace} package. Contact vendor about query optimization.`,
    };
  }

  return {
    attribution: 'USER_CODE',
    confidence: confidence(0.9, ['No managed package namespace']),
    canModify: true,
    aiGuidance: 'Add indexed filters or create custom indexes on frequently filtered fields.',
  };
}

/**
 * Get recommendations based on detected issues
 */
function getRecommendations(_issues: string[], _event: SOQLEvent): string[] {
  const recommendations: string[] = [];

  if (_issues.some(i => i.includes('no WHERE'))) {
    recommendations.push('Add WHERE clause to filter results');
    recommendations.push('Consider if all records are truly needed');
  }

  if (_issues.some(i => i.includes('leading wildcard'))) {
    recommendations.push('Avoid LIKE patterns with leading wildcards (e.g., "%search")');
    recommendations.push('Consider SOSL for full-text search instead');
  }

  if (_issues.some(i => i.includes('NOT IN') || i.includes('!='))) {
    recommendations.push('Rewrite negative filters as positive filters when possible');
    recommendations.push('Consider using formula fields to pre-calculate filter values');
  }

  if (_issues.some(i => i.includes('OR conditions'))) {
    recommendations.push('Split OR conditions into separate queries if performance is critical');
    recommendations.push('Consider using SOSL which handles OR conditions better');
  }

  if (_issues.some(i => i.includes('indexed fields'))) {
    recommendations.push('Filter on standard indexed fields: Id, Name, OwnerId, CreatedDate');
    recommendations.push('Request a custom index on frequently filtered fields via Salesforce support');
    recommendations.push('Consider using External ID fields (automatically indexed)');
  }

  if (_issues.some(i => i.includes('row count'))) {
    recommendations.push('Add LIMIT clause to restrict result size');
    recommendations.push('Use pagination with OFFSET or queryMore for large datasets');
    recommendations.push('Consider if batch processing with queryLocator is more appropriate');
  }

  if (_issues.some(i => i.includes('table scan'))) {
    recommendations.push('Add selective filter criteria to prevent full table scans');
    recommendations.push('Ensure filtered fields have indexes');
  }

  // Always include general best practices
  if (recommendations.length < 3) {
    recommendations.push('Use selective filters that return < 10% of total records');
    recommendations.push('Consider adding filters on indexed fields like CreatedDate');
  }

  return [...new Set(recommendations)]; // Remove duplicates
}

/**
 * Create AI-specific context
 */
function createAIContext(
  event: SOQLEvent,
  _issues: string[],
  detectionMethod: string
): AIIssueContext {
  const relevantEvents: EventSummary[] = [{
    id: event.id,
    type: event.type,
    line: event.lineNumber,
    summary: event.query?.substring(0, 100) || 'SOQL query',
    durationMs: event.duration ? Number(event.duration) / 1_000_000 : undefined,
  }];

  const fixPatterns: FixPattern[] = [
    {
      name: 'Add Indexed Filter',
      description: 'Filter on indexed fields for better performance',
      before: `SELECT Id, Name FROM Account WHERE Industry = 'Technology'`,
      after: `SELECT Id, Name FROM Account WHERE Industry = 'Technology' AND CreatedDate = LAST_N_DAYS:30`,
      applicability: confidence(0.85, ['Common optimization', 'Uses standard index']),
    },
    {
      name: 'Replace Wildcard Search',
      description: 'Use SOSL instead of LIKE with leading wildcards',
      before: `SELECT Id FROM Account WHERE Name LIKE '%search%'`,
      after: `FIND 'search' IN NAME FIELDS RETURNING Account(Id, Name)`,
      applicability: confidence(0.8, ['Better for text search', 'More efficient']),
    },
    {
      name: 'Add LIMIT Clause',
      description: 'Restrict result set size',
      before: `SELECT Id FROM Account WHERE Type = 'Customer'`,
      after: `SELECT Id FROM Account WHERE Type = 'Customer' LIMIT 200`,
      applicability: confidence(0.75, ['Good for safety', 'May need pagination']),
    },
    {
      name: 'Use External ID',
      description: 'Filter on External ID fields (auto-indexed)',
      before: `SELECT Id FROM Account WHERE Legacy_Id__c = '12345'`,
      after: `// Mark Legacy_Id__c as External ID in field settings\nSELECT Id FROM Account WHERE Legacy_Id__c = '12345'  // Now uses index`,
      applicability: confidence(0.7, ['Requires field configuration', 'Good for integrations']),
    },
  ];

  return {
    relevantEvents,
    metrics: {
      occurrences: 1,
      totalImpact: event.rowCount || 0,
      performanceImpactMs: event.duration ? Number(event.duration) / 1_000_000 : undefined,
    },
    fixPatterns,
    clarifyingQuestions: [
      'What fields are available on this object that could be indexed?',
      'Is there a date range that could limit the results?',
      'Could this query use a skinny table for better performance?',
      `How often is this query executed? (${detectionMethod} detection used)`,
    ],
    codeSnippet: event.query,
  };
}
