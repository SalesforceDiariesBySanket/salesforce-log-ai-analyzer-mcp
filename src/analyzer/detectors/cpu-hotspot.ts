/**
 * @module analyzer/detectors/cpu-hotspot
 * @description Detects CPU hotspots - methods consuming excessive execution time
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts, src/constants.ts
 * @lastModified 2026-01-31
 */

import type {
  EventNode,
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
import { confidence } from '../../types/common';
import { LIMIT_THRESHOLDS } from '../../constants';

// ============================================================================
// CPU Hotspot Detection
// ============================================================================

/**
 * Detects CPU hotspots - methods consuming excessive execution time
 * 
 * CPU Timeout in Salesforce:
 * - Synchronous limit: 10,000ms (10 seconds)
 * - Async limit: 60,000ms (60 seconds)
 * 
 * Detection Strategy:
 * 1. Calculate exclusive time for each method (time spent in method, not children)
 * 2. Rank methods by total exclusive time
 * 3. Identify methods called frequently with high per-call time
 * 4. Detect methods approaching or exceeding CPU time budgets
 * 
 * Note: Requires at least FINE debug level for METHOD_ENTRY/EXIT events
 */
export const cpuHotspotDetector: IssueDetector = {
  name: 'CPU Hotspot Detector',
  detects: ['CPU_HOTSPOT', 'CPU_TIMEOUT'],

  detect(events: EventNode[]): Issue[] {
    const issues: Issue[] = [];
    
    // Extract method events
    const methodEvents = extractMethodEvents(events);
    
    if (methodEvents.length < 2) {
      // Need METHOD_ENTRY and METHOD_EXIT pairs
      return issues;
    }

    // Calculate method timing statistics
    const methodStats = calculateMethodStats(methodEvents);
    
    if (methodStats.size === 0) {
      return issues;
    }

    // Detect CPU timeout risk
    const totalCpuMs = calculateTotalCpuTime(methodStats);
    if (totalCpuMs > 5000) { // More than 50% of sync limit
      issues.push(createCpuTimeoutRiskIssue(totalCpuMs, methodStats));
    }

    // Find hotspots (top N methods by exclusive time)
    const hotspots = findHotspots(methodStats, totalCpuMs);
    for (const hotspot of hotspots) {
      issues.push(createHotspotIssue(hotspot, totalCpuMs, methodStats));
    }

    // Find methods with high per-invocation cost
    const expensiveMethods = findExpensiveMethods(methodStats);
    for (const expensive of expensiveMethods) {
      // Avoid duplicates with hotspots
      const existingIds = issues.flatMap(i => i.eventIds);
      if (!expensive.eventIds.some(id => existingIds.includes(id))) {
        issues.push(createExpensiveMethodIssue(expensive, methodStats));
      }
    }

    return issues;
  },
};

// ============================================================================
// Types
// ============================================================================

interface MethodStats {
  /** Method signature (class.method) */
  signature: string;
  /** Class name */
  className: string;
  /** Method name */
  methodName: string;
  /** Number of invocations */
  invocations: number;
  /** Total inclusive time (including children) in ns */
  totalInclusiveNs: number;
  /** Total exclusive time (excluding children) in ns */
  totalExclusiveNs: number;
  /** Average time per invocation in ns */
  avgTimeNs: number;
  /** Maximum single invocation time in ns */
  maxTimeNs: number;
  /** Event IDs for this method */
  eventIds: number[];
  /** Line numbers */
  lineNumbers: number[];
  /** Namespace if in managed package */
  namespace?: string;
}

interface HotspotInfo {
  stats: MethodStats;
  percentOfTotal: number;
  rank: number;
}

// ============================================================================
// Detection Logic
// ============================================================================

/**
 * Extract method entry/exit events
 */
function extractMethodEvents(events: EventNode[]): MethodEvent[] {
  return events.filter(
    (e): e is MethodEvent =>
      e.type === 'METHOD_ENTRY' ||
      e.type === 'METHOD_EXIT' ||
      e.type === 'CONSTRUCTOR_ENTRY' ||
      e.type === 'CONSTRUCTOR_EXIT'
  );
}

/**
 * Calculate timing statistics for all methods
 */
function calculateMethodStats(methodEvents: MethodEvent[]): Map<string, MethodStats> {
  const stats = new Map<string, MethodStats>();
  const entryStack: { event: MethodEvent; childTime: number }[] = [];
  
  for (const event of methodEvents) {
    const signature = `${event.className}.${event.methodName}`;
    
    if (event.type === 'METHOD_ENTRY' || event.type === 'CONSTRUCTOR_ENTRY') {
      entryStack.push({ event, childTime: 0 });
    } else if (event.type === 'METHOD_EXIT' || event.type === 'CONSTRUCTOR_EXIT') {
      // Find matching entry
      const entryIndex = findMatchingEntry(entryStack, event);
      if (entryIndex === -1) continue;
      
      const entry = entryStack[entryIndex];
      if (!entry) continue;
      entryStack.splice(entryIndex, 1);
      
      // Calculate times
      const duration = event.duration ?? (event.timestamp - entry.event.timestamp);
      const inclusiveTimeNs = Number(duration);
      const exclusiveTimeNs = inclusiveTimeNs - entry.childTime;
      
      // Add this method's time as child time to parent
      const parentEntry = entryStack[entryStack.length - 1];
      if (parentEntry) {
        parentEntry.childTime += inclusiveTimeNs;
      }
      
      // Update stats
      const existing = stats.get(signature);
      if (existing) {
        existing.invocations++;
        existing.totalInclusiveNs += inclusiveTimeNs;
        existing.totalExclusiveNs += Math.max(0, exclusiveTimeNs);
        existing.maxTimeNs = Math.max(existing.maxTimeNs, inclusiveTimeNs);
        existing.eventIds.push(entry.event.id, event.id);
        if (!existing.lineNumbers.includes(event.lineNumber)) {
          existing.lineNumbers.push(event.lineNumber);
        }
      } else {
        stats.set(signature, {
          signature,
          className: event.className,
          methodName: event.methodName,
          invocations: 1,
          totalInclusiveNs: inclusiveTimeNs,
          totalExclusiveNs: Math.max(0, exclusiveTimeNs),
          avgTimeNs: inclusiveTimeNs,
          maxTimeNs: inclusiveTimeNs,
          eventIds: [entry.event.id, event.id],
          lineNumbers: [event.lineNumber],
          namespace: event.namespace,
        });
      }
    }
  }
  
  // Calculate averages
  for (const method of stats.values()) {
    method.avgTimeNs = method.totalInclusiveNs / method.invocations;
  }
  
  return stats;
}

/**
 * Find matching entry event for an exit event
 */
function findMatchingEntry(
  stack: { event: MethodEvent; childTime: number }[],
  exitEvent: MethodEvent
): number {
  // Search from the end (most recent first)
  for (let i = stack.length - 1; i >= 0; i--) {
    const stackEntry = stack[i];
    if (!stackEntry) continue;
    const entry = stackEntry.event;
    if (
      entry.className === exitEvent.className &&
      entry.methodName === exitEvent.methodName
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Calculate total CPU time from method stats
 */
function calculateTotalCpuTime(stats: Map<string, MethodStats>): number {
  // Sum exclusive times to avoid double-counting
  let totalNs = 0;
  for (const method of stats.values()) {
    totalNs += method.totalExclusiveNs;
  }
  return totalNs / 1_000_000; // Convert to ms
}

/**
 * Find top CPU-consuming methods
 */
function findHotspots(stats: Map<string, MethodStats>, totalCpuMs: number): HotspotInfo[] {
  const methods = Array.from(stats.values());
  
  // Sort by exclusive time (what the method itself does)
  methods.sort((a, b) => b.totalExclusiveNs - a.totalExclusiveNs);
  
  const hotspots: HotspotInfo[] = [];
  const totalNs = totalCpuMs * 1_000_000;
  
  // Skip hotspot detection if total CPU time is trivially small (<50ms)
  // These are fast operations where percentages are misleading
  if (totalCpuMs < 50) {
    return hotspots;
  }
  
  for (let i = 0; i < Math.min(5, methods.length); i++) {
    const method = methods[i];
    if (!method) continue;
    const percentOfTotal = (method.totalExclusiveNs / totalNs) * 100;
    const exclusiveMs = method.totalExclusiveNs / 1_000_000;
    
    // Only include if method is significant:
    // - Takes >5% of total CPU time AND
    // - Takes at least 50ms (to avoid flagging trivially fast operations)
    if (percentOfTotal >= 5 && exclusiveMs >= 50) {
      hotspots.push({
        stats: method,
        percentOfTotal,
        rank: i + 1,
      });
    }
  }
  
  return hotspots;
}

/**
 * Find methods with high per-invocation cost but may not be top overall
 */
function findExpensiveMethods(stats: Map<string, MethodStats>): MethodStats[] {
  const expensive: MethodStats[] = [];
  
  for (const method of stats.values()) {
    const avgTimeMs = method.avgTimeNs / 1_000_000;
    
    // Method takes more than 100ms average
    if (avgTimeMs > 100) {
      expensive.push(method);
    }
    // Or method takes more than 500ms in any single call
    else if (method.maxTimeNs / 1_000_000 > 500) {
      expensive.push(method);
    }
  }
  
  return expensive;
}

// ============================================================================
// Issue Creation
// ============================================================================

let issueIdCounter = 0;

/**
 * Create a CPU timeout risk issue
 */
function createCpuTimeoutRiskIssue(
  totalCpuMs: number,
  stats: Map<string, MethodStats>
): Issue {
  const percentUsed = (totalCpuMs / 10000) * 100;
  const severity = percentUsed >= LIMIT_THRESHOLDS.HIGH ? 'CRITICAL' 
    : percentUsed >= LIMIT_THRESHOLDS.WARNING ? 'HIGH' 
    : 'MEDIUM';
  
  // Get top methods for context
  const topMethods = Array.from(stats.values())
    .sort((a, b) => b.totalExclusiveNs - a.totalExclusiveNs)
    .slice(0, 5);
  
  const conf = confidence(
    Math.min(0.95, 0.5 + (percentUsed / 200)),
    [
      `Total CPU time: ${Math.round(totalCpuMs)}ms of 10,000ms limit`,
      `${Math.round(percentUsed)}% of limit used`,
      `${stats.size} unique methods profiled`,
    ],
    percentUsed < 50 ? ['May have more time if profiling overhead removed'] : undefined
  );

  return {
    id: `cpu-timeout-risk-${++issueIdCounter}`,
    type: 'CPU_TIMEOUT',
    category: 'PERFORMANCE',
    severity,
    title: `CPU timeout risk: ${Math.round(percentUsed)}% of limit used`,
    description:
      `Transaction used ${Math.round(totalCpuMs)}ms of the 10,000ms CPU limit (${Math.round(percentUsed)}%). ` +
      `This is close to the limit and may cause CPU timeout errors. ` +
      `Top CPU consumers: ${topMethods.slice(0, 3).map(m => m.signature).join(', ')}.`,
    eventIds: topMethods.flatMap(m => m.eventIds.slice(0, 2)),
    lineNumbers: topMethods.flatMap(m => m.lineNumbers.slice(0, 1)),
    confidence: conf,
    attribution: {
      attribution: 'USER_CODE',
      confidence: confidence(0.7, ['Overall CPU usage analysis']),
      canModify: true,
      aiGuidance: 'Review top CPU consumers and optimize or move to async processing.',
    },
    recommendations: [
      'Profile the top CPU-consuming methods for optimization opportunities',
      'Move heavy processing to async context (Queueable, Batch)',
      'Cache repeated calculations in static variables',
      'Reduce loop iterations by filtering data earlier',
      'Consider using lazy evaluation for expensive operations',
    ],
    aiContext: createTimeoutRiskContext(totalCpuMs, topMethods),
  };
}

/**
 * Create a hotspot issue
 */
function createHotspotIssue(
  hotspot: HotspotInfo,
  totalCpuMs: number,
  _allStats: Map<string, MethodStats>
): Issue {
  const { stats, percentOfTotal, rank } = hotspot;
  const exclusiveMs = stats.totalExclusiveNs / 1_000_000;
  const avgMs = stats.avgTimeNs / 1_000_000;
  
  const severity = percentOfTotal >= 30 ? 'HIGH' : percentOfTotal >= 15 ? 'MEDIUM' : 'LOW';
  
  const conf = confidence(
    Math.min(0.9, 0.6 + (percentOfTotal / 100)),
    [
      `Rank #${rank} CPU consumer`,
      `${Math.round(percentOfTotal)}% of total CPU time`,
      `${stats.invocations} invocations`,
      `${Math.round(exclusiveMs)}ms total exclusive time`,
    ]
  );

  return {
    id: `cpu-hotspot-${++issueIdCounter}`,
    type: 'CPU_HOTSPOT',
    category: 'PERFORMANCE',
    severity,
    title: `CPU hotspot: ${stats.signature} (${Math.round(percentOfTotal)}% of CPU)`,
    description:
      `Method ${stats.signature} consumed ${Math.round(exclusiveMs)}ms ` +
      `(${Math.round(percentOfTotal)}% of total ${Math.round(totalCpuMs)}ms CPU time). ` +
      `Called ${stats.invocations} time${stats.invocations > 1 ? 's' : ''} with ` +
      `${Math.round(avgMs)}ms average per call.`,
    eventIds: stats.eventIds,
    lineNumbers: stats.lineNumbers,
    confidence: conf,
    attribution: createAttribution(stats),
    recommendations: getHotspotRecommendations(stats),
    aiContext: createHotspotContext(stats, percentOfTotal, rank),
  };
}

/**
 * Create an expensive method issue
 */
function createExpensiveMethodIssue(
  method: MethodStats,
  _allStats: Map<string, MethodStats>
): Issue {
  const avgMs = method.avgTimeNs / 1_000_000;
  const maxMs = method.maxTimeNs / 1_000_000;
  
  const severity = avgMs >= 500 ? 'HIGH' : avgMs >= 200 ? 'MEDIUM' : 'LOW';
  
  const conf = confidence(
    avgMs >= 200 ? 0.85 : 0.7,
    [
      `${Math.round(avgMs)}ms average execution time`,
      `${Math.round(maxMs)}ms maximum execution time`,
      method.invocations > 1 ? `Called ${method.invocations} times` : 'Single invocation',
    ],
    method.invocations === 1 ? ['Only one invocation - may be atypical'] : undefined
  );

  return {
    id: `expensive-method-${++issueIdCounter}`,
    type: 'CPU_HOTSPOT',
    category: 'PERFORMANCE',
    severity,
    title: `Expensive method: ${method.signature} (${Math.round(avgMs)}ms avg)`,
    description:
      `Method ${method.signature} has high per-call cost: ` +
      `${Math.round(avgMs)}ms average, ${Math.round(maxMs)}ms maximum. ` +
      `This may indicate an optimization opportunity.`,
    eventIds: method.eventIds,
    lineNumbers: method.lineNumbers,
    confidence: conf,
    attribution: createAttribution(method),
    recommendations: getHotspotRecommendations(method),
    aiContext: createHotspotContext(method, 0, 0),
  };
}

/**
 * Create attribution info
 */
function createAttribution(stats: MethodStats): AttributionInfo {
  if (stats.namespace) {
    return {
      attribution: 'MANAGED_PACKAGE',
      confidence: confidence(0.9, ['Method is in managed package namespace']),
      namespace: stats.namespace,
      canModify: false,
      aiGuidance: `This method is in the ${stats.namespace} package. Consider caching its results or reducing call frequency.`,
    };
  }

  return {
    attribution: 'USER_CODE',
    confidence: confidence(0.9, ['No managed package namespace']),
    canModify: true,
    aiGuidance: 'Review the method for algorithmic improvements or caching opportunities.',
  };
}

/**
 * Get recommendations based on method characteristics
 */
function getHotspotRecommendations(stats: MethodStats): string[] {
  const recommendations: string[] = [];

  // High invocation count
  if (stats.invocations > 10) {
    recommendations.push('Consider caching results if inputs repeat');
    recommendations.push('Reduce call frequency by batching operations');
  }

  // High per-call time
  const avgMs = stats.avgTimeNs / 1_000_000;
  if (avgMs > 100) {
    recommendations.push('Profile method internals to find slow operations');
    recommendations.push('Consider moving to asynchronous processing');
    recommendations.push('Check for SOQL/DML inside loops within this method');
  }

  // General recommendations
  recommendations.push('Use early exit patterns to avoid unnecessary work');
  recommendations.push('Consider lazy loading for data not always needed');
  
  // Method-specific patterns
  if (stats.methodName.toLowerCase().includes('process') || 
      stats.methodName.toLowerCase().includes('handle')) {
    recommendations.push('Break large processing methods into smaller units');
  }

  if (stats.methodName.toLowerCase().includes('query') ||
      stats.methodName.toLowerCase().includes('get') ||
      stats.methodName.toLowerCase().includes('fetch')) {
    recommendations.push('Consider query optimization or caching query results');
  }

  return [...new Set(recommendations)].slice(0, 6);
}

/**
 * Create AI context for timeout risk
 */
function createTimeoutRiskContext(
  totalCpuMs: number,
  topMethods: MethodStats[]
): AIIssueContext {
  const relevantEvents: EventSummary[] = topMethods.slice(0, 5).map((m, _i) => ({
    id: m.eventIds[0] || 0,
    type: 'METHOD_ENTRY',
    line: m.lineNumbers[0] || 0,
    summary: `#${_i + 1}: ${m.signature} - ${Math.round(m.totalExclusiveNs / 1_000_000)}ms (${m.invocations} calls)`,
  }));

  return {
    relevantEvents,
    metrics: {
      totalImpact: Math.round(totalCpuMs),
      limitPercentage: Math.round((totalCpuMs / 10000) * 100),
    },
    fixPatterns: [
      {
        name: 'Async Processing',
        description: 'Move heavy processing to async context',
        before: `public void processRecords(List<Account> accounts) {\n  for (Account acc : accounts) {\n    heavyOperation(acc);\n  }\n}`,
        after: `public void processRecords(List<Account> accounts) {\n  System.enqueueJob(new ProcessAccountsQueueable(accounts));\n}\n\npublic class ProcessAccountsQueueable implements Queueable {\n  // 60s CPU limit instead of 10s\n}`,
        applicability: confidence(0.8, ['Standard pattern', 'Increases CPU limit 6x']),
      },
    ],
    clarifyingQuestions: [
      'Is this a synchronous or asynchronous context?',
      'Can any of this processing be deferred or batched?',
      'Are there redundant calculations that could be cached?',
    ],
  };
}

/**
 * Create AI context for hotspot
 */
function createHotspotContext(
  stats: MethodStats,
  _percentOfTotal: number,
  _rank: number
): AIIssueContext {
  const relevantEvents: EventSummary[] = [{
    id: stats.eventIds[0] || 0,
    type: 'METHOD_ENTRY',
    line: stats.lineNumbers[0] || 0,
    summary: `${stats.signature} - ${stats.invocations} invocations`,
    durationMs: stats.avgTimeNs / 1_000_000,
  }];

  const fixPatterns: FixPattern[] = [
    {
      name: 'Result Caching',
      description: 'Cache expensive computation results',
      before: `public String computeExpensive(Id recordId) {\n  // Expensive computation\n  return result;\n}`,
      after: `private static Map<Id, String> computeCache = new Map<Id, String>();\n\npublic String computeExpensive(Id recordId) {\n  if (!computeCache.containsKey(recordId)) {\n    // Expensive computation\n    computeCache.put(recordId, result);\n  }\n  return computeCache.get(recordId);\n}`,
      applicability: confidence(0.85, ['Common optimization', 'Works for idempotent operations']),
    },
    {
      name: 'Bulk Processing',
      description: 'Process records in bulk instead of one-by-one',
      before: `for (Account acc : accounts) {\n  processAccount(acc);\n}`,
      after: `processAccounts(accounts); // Single method handling all records`,
      applicability: confidence(0.75, ['Reduces overhead', 'May require refactoring']),
    },
  ];

  return {
    relevantEvents,
    metrics: {
      occurrences: stats.invocations,
      performanceImpactMs: stats.totalExclusiveNs / 1_000_000,
    },
    fixPatterns,
    clarifyingQuestions: [
      `What does ${stats.methodName} do internally?`,
      `Is ${stats.className} called with the same inputs repeatedly?`,
      'Can this method be parallelized or made async?',
    ],
  };
}
