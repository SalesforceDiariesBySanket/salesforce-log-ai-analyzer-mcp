/**
 * @module managed/attribution-engine
 * @description Attribute issues to user code, managed packages, or boundaries
 * @status COMPLETE
 * @see src/managed/STATE.md
 * @dependencies src/types/managed.ts, src/types/issues.ts, src/types/events.ts
 * @lastModified 2026-01-31
 */

import type { EventNode, MethodEvent, ManagedPackageEvent } from '../types/events';
import type {
  Issue,
  IssueAttribution,
} from '../types/issues';
import type {
  NamespaceInfo,
  Attribution,
  AttributionEvidence,
  NamespaceStats,
  NamespaceSummary,
  AttributionEngine,
  VendorInfo,
} from '../types/managed';
import { confidence } from '../types/common';
import { detectNamespaces, detectBoundaryCrossings, getVendorInfo } from './namespace-detector';
// Visibility is classified via namespace info already

// ============================================================================
// Attribution Engine Implementation
// ============================================================================

/**
 * Main attribution engine
 */
export const attributionEngine: AttributionEngine = {
  attributeIssue,
  attributeIssues,
  generateSummary,
};

/**
 * Attribute a single issue to its source
 */
export function attributeIssue(
  issue: Issue,
  events: EventNode[],
  namespaces: NamespaceInfo[]
): Attribution {
  const evidence: AttributionEvidence[] = [];
  
  // Get events related to this issue
  const relatedEvents = events.filter(e => issue.eventIds.includes(e.id));
  
  if (relatedEvents.length === 0) {
    return createUnknownAttribution('No events found for this issue');
  }

  // Collect namespace evidence from related events
  const namespaceEvidence = analyzeNamespaceEvidence(relatedEvents, events);
  evidence.push(...namespaceEvidence);

  // Check for boundary crossing
  const boundaryEvidence = analyzeBoundaryEvidence(relatedEvents, events);
  evidence.push(...boundaryEvidence);

  // Analyze class names and method signatures
  const codeEvidence = analyzeCodeEvidence(relatedEvents);
  evidence.push(...codeEvidence);

  // Analyze stack trace if available from exception
  if (issue.aiContext.codeSnippet) {
    const stackEvidence = analyzeStackTraceEvidence(issue.aiContext.codeSnippet);
    evidence.push(...stackEvidence);
  }

  // Calculate attribution from evidence
  const attribution = calculateAttribution(evidence, namespaces);

  return attribution;
}

/**
 * Attribute multiple issues
 */
export function attributeIssues(
  issues: Issue[],
  events: EventNode[],
  namespaces: NamespaceInfo[]
): Map<string, Attribution> {
  const results = new Map<string, Attribution>();

  for (const issue of issues) {
    results.set(issue.id, attributeIssue(issue, events, namespaces));
  }

  return results;
}

/**
 * Generate comprehensive namespace summary
 */
export function generateSummary(
  events: EventNode[],
  namespaces: NamespaceInfo[],
  issues: Issue[]
): NamespaceSummary {
  // Calculate stats per namespace
  const stats = new Map<string, NamespaceStats>();
  
  // Initialize stats for each namespace
  for (const ns of namespaces) {
    stats.set(ns.namespace, createEmptyStats(ns.namespace));
  }

  // Calculate user code stats
  const userCodeStats = createEmptyStats('__user_code__');

  // Process events
  let totalExecutionTime = 0;
  
  for (const event of events) {
    const namespace = event.namespace;
    const targetStats = namespace ? stats.get(namespace) : userCodeStats;
    
    if (targetStats) {
      targetStats.eventCount++;
      
      if (event.type === 'SOQL_EXECUTE_BEGIN') {
        targetStats.soqlCount++;
      }
      
      if (event.type === 'DML_BEGIN') {
        targetStats.dmlCount++;
      }
      
      if (event.type === 'EXCEPTION_THROWN' || event.type === 'FATAL_ERROR') {
        targetStats.exceptionCount++;
      }
      
      if (event.duration) {
        targetStats.executionTimeNs += Number(event.duration);
        totalExecutionTime += Number(event.duration);
      }
    }
  }

  // Calculate execution time percentages
  if (totalExecutionTime > 0) {
    for (const stat of stats.values()) {
      stat.executionTimePercent = (stat.executionTimeNs / totalExecutionTime) * 100;
    }
    userCodeStats.executionTimePercent = (userCodeStats.executionTimeNs / totalExecutionTime) * 100;
  }

  // Attribute issues and count
  const issuesByAttribution = {
    userCode: 0,
    managedPackage: 0,
    boundary: 0,
    unknown: 0,
  };

  for (const issue of issues) {
    const attribution = attributeIssue(issue, events, namespaces);
    
    switch (attribution.source) {
      case 'USER_CODE':
        issuesByAttribution.userCode++;
        userCodeStats.issueCount++;
        break;
      case 'MANAGED_PACKAGE':
        issuesByAttribution.managedPackage++;
        if (attribution.namespace) {
          const nsStat = stats.get(attribution.namespace);
          if (nsStat) nsStat.issueCount++;
        }
        break;
      case 'BOUNDARY':
        issuesByAttribution.boundary++;
        break;
      default:
        issuesByAttribution.unknown++;
    }
  }

  // Detect boundary crossings
  const boundaryCrossings = detectBoundaryCrossings(events);
  
  // Count crossings per namespace
  for (const crossing of boundaryCrossings) {
    if (crossing.toNamespace) {
      const nsStat = stats.get(crossing.toNamespace);
      if (nsStat) nsStat.boundaryCrossings++;
    }
    if (crossing.fromNamespace) {
      const nsStat = stats.get(crossing.fromNamespace);
      if (nsStat) nsStat.boundaryCrossings++;
    }
  }

  return {
    namespaces,
    stats,
    userCodeStats,
    boundaryCrossings,
    issuesByAttribution,
  };
}

// ============================================================================
// Evidence Analysis
// ============================================================================

/**
 * Analyze namespace evidence from events
 */
function analyzeNamespaceEvidence(
  relatedEvents: EventNode[],
  _allEvents: EventNode[]
): AttributionEvidence[] {
  const evidence: AttributionEvidence[] = [];
  const namespaceSet = new Set<string>();

  for (const event of relatedEvents) {
    // Check for explicit namespace marker
    if (event.type === 'ENTERING_MANAGED_PKG') {
      const nsEvent = event as ManagedPackageEvent;
      namespaceSet.add(nsEvent.namespace);
      evidence.push({
        type: 'NAMESPACE_MARKER',
        description: `Event occurs in managed package: ${nsEvent.namespace}`,
        weight: 0.9,
        eventIds: [event.id],
      });
    }

    // Check for namespace on event
    if (event.namespace) {
      namespaceSet.add(event.namespace);
      if (!evidence.some(e => e.type === 'NAMESPACE_MARKER' && e.description.includes(event.namespace!))) {
        evidence.push({
          type: 'NAMESPACE_MARKER',
          description: `Event has namespace: ${event.namespace}`,
          weight: 0.8,
          eventIds: [event.id],
        });
      }
    }
  }

  // If no namespace found, it's likely user code
  if (namespaceSet.size === 0) {
    evidence.push({
      type: 'NAMESPACE_MARKER',
      description: 'No managed package namespace detected - likely user code',
      weight: 0.7,
      eventIds: relatedEvents.map(e => e.id),
    });
  }

  return evidence;
}

/**
 * Analyze boundary crossing evidence
 */
function analyzeBoundaryEvidence(
  relatedEvents: EventNode[],
  allEvents: EventNode[]
): AttributionEvidence[] {
  const evidence: AttributionEvidence[] = [];
  const relatedIds = new Set(relatedEvents.map(e => e.id));

  // Get all boundary crossings
  const crossings = detectBoundaryCrossings(allEvents);

  // Check if any crossings are near our related events
  for (const crossing of crossings) {
    // Check if crossing is within range of our events
    const isNearby = relatedEvents.some(e => 
      Math.abs(e.id - crossing.eventId) <= 5
    );

    if (isNearby || relatedIds.has(crossing.eventId)) {
      evidence.push({
        type: 'BOUNDARY_CROSSING',
        description: `Boundary crossing: ${crossing.direction.replace(/_/g, ' ').toLowerCase()} at ${crossing.crossingPoint || 'unknown'}`,
        weight: 0.85,
        eventIds: [crossing.eventId],
      });
    }
  }

  return evidence;
}

/**
 * Analyze code patterns from method events
 */
function analyzeCodeEvidence(relatedEvents: EventNode[]): AttributionEvidence[] {
  const evidence: AttributionEvidence[] = [];

  const methodEvents = relatedEvents.filter(
    (e): e is MethodEvent => e.type === 'METHOD_ENTRY' || e.type === 'METHOD_EXIT'
  );

  for (const method of methodEvents) {
    // Check for namespace prefix in class name
    const classNameMatch = method.className?.match(/^([a-zA-Z_][a-zA-Z0-9_]*)__/);
    if (classNameMatch) {
      evidence.push({
        type: 'CLASS_NAME_PREFIX',
        description: `Class name has namespace prefix: ${classNameMatch[1]}`,
        weight: 0.75,
        eventIds: [method.id],
      });
    }

    // Check for trigger patterns
    if (method.className?.includes('Trigger') || method.className?.includes('Handler')) {
      evidence.push({
        type: 'TRIGGER_NAME',
        description: `Trigger/Handler class: ${method.className}`,
        weight: 0.5,
        eventIds: [method.id],
      });
    }

    // Check for obfuscated method names (managed package indicator)
    if (method.methodName && isLikelyObfuscated(method.methodName)) {
      evidence.push({
        type: 'OBFUSCATED_CODE',
        description: `Obfuscated method name: ${method.methodName}`,
        weight: 0.7,
        eventIds: [method.id],
      });
    }
  }

  return evidence;
}

/**
 * Analyze stack trace for attribution clues
 */
function analyzeStackTraceEvidence(codeSnippet: string): AttributionEvidence[] {
  const evidence: AttributionEvidence[] = [];

  // Check for namespace patterns in code snippet/stack trace
  const namespacePattern = /([A-Z][a-zA-Z0-9_]{1,14})__\w+/g;
  const matches = codeSnippet.match(namespacePattern);

  if (matches) {
    const uniqueNamespaces = new Set(matches.map(m => m.split('__')[0]));
    for (const ns of uniqueNamespaces) {
      evidence.push({
        type: 'STACK_TRACE',
        description: `Stack trace references namespace: ${ns}`,
        weight: 0.65,
        eventIds: [],
      });
    }
  }

  // Check for managed package error patterns
  const managedPkgErrorPatterns = [
    /UNABLE_TO_LOCK_ROW.*managed/i,
    /FIELD_CUSTOM_VALIDATION_EXCEPTION.*\w{2,15}__/,
    /Apex script unhandled.*\w{2,15}\./,
  ];

  for (const pattern of managedPkgErrorPatterns) {
    if (pattern.test(codeSnippet)) {
      evidence.push({
        type: 'ERROR_MESSAGE',
        description: 'Error message indicates managed package involvement',
        weight: 0.6,
        eventIds: [],
      });
      break;
    }
  }

  return evidence;
}

// ============================================================================
// Attribution Calculation
// ============================================================================

/**
 * Calculate final attribution from evidence
 */
function calculateAttribution(
  evidence: AttributionEvidence[],
  _namespaces: NamespaceInfo[]
): Attribution {
  // Score each attribution type
  let userCodeScore = 0;
  let managedScore = 0;
  let boundaryScore = 0;
  const reasons: string[] = [];
  const recommendations: string[] = [];
  let detectedNamespace: string | undefined;

  for (const e of evidence) {
    switch (e.type) {
      case 'NAMESPACE_MARKER':
        if (e.description.includes('No managed package')) {
          userCodeScore += e.weight;
        } else {
          managedScore += e.weight;
          // Extract namespace from description
          const nsMatch = e.description.match(/namespace[:\s]+(\w+)/i);
          if (nsMatch) detectedNamespace = nsMatch[1];
        }
        break;
      
      case 'BOUNDARY_CROSSING':
        boundaryScore += e.weight;
        break;
      
      case 'CLASS_NAME_PREFIX':
      case 'OBFUSCATED_CODE':
      case 'STACK_TRACE':
        managedScore += e.weight;
        const prefixMatch = e.description.match(/prefix[:\s]+(\w+)/i) || 
                          e.description.match(/namespace[:\s]+(\w+)/i);
        if (prefixMatch) detectedNamespace = prefixMatch[1];
        break;
      
      case 'TRIGGER_NAME':
        // Triggers could be either user or managed
        userCodeScore += e.weight * 0.5;
        managedScore += e.weight * 0.5;
        break;
      
      case 'ERROR_MESSAGE':
        managedScore += e.weight;
        break;
    }
  }

  // Determine source
  let source: IssueAttribution;
  let confidenceScore: number;

  // Check for boundary (both user and managed involvement)
  if (boundaryScore > 0.5 && userCodeScore > 0 && managedScore > 0) {
    source = 'BOUNDARY';
    confidenceScore = Math.min(0.9, boundaryScore);
    reasons.push('Issue occurs at boundary between user code and managed package');
    recommendations.push('Review the integration point between your code and the managed package');
    recommendations.push('Ensure you\'re following the package\'s documented API patterns');
  }
  // Managed package
  else if (managedScore > userCodeScore && managedScore > 0.3) {
    source = 'MANAGED_PACKAGE';
    confidenceScore = Math.min(0.9, 0.5 + managedScore);
    reasons.push('Evidence suggests issue originates in managed package code');
    recommendations.push('Contact the package vendor for support');
    recommendations.push('Check for known issues or updates for the package');
  }
  // User code
  else if (userCodeScore > managedScore) {
    source = 'USER_CODE';
    confidenceScore = Math.min(0.9, 0.5 + userCodeScore);
    reasons.push('Evidence suggests issue originates in your code');
    recommendations.push('Review the code at the indicated location');
    recommendations.push('Apply the recommended fix pattern');
  }
  // Unknown
  else {
    source = 'UNKNOWN';
    confidenceScore = 0.5;
    reasons.push('Cannot determine issue source with confidence');
    recommendations.push('Review both user code and managed package interactions');
  }

  // Get vendor info if managed package
  let vendorContact: VendorInfo | undefined;
  if (detectedNamespace) {
    vendorContact = getVendorInfo(detectedNamespace);
  }

  // Determine if code can be modified
  const canModify = source === 'USER_CODE' || source === 'BOUNDARY';
  const canView = source !== 'MANAGED_PACKAGE';

  // Generate AI guidance
  const aiGuidance = generateAIGuidanceText(source, detectedNamespace, vendorContact);

  return {
    source,
    namespace: detectedNamespace,
    confidence: confidence(confidenceScore, reasons),
    canModify,
    canView,
    aiGuidance,
    recommendations,
    vendorContact,
  };
}

/**
 * Generate AI guidance text
 */
function generateAIGuidanceText(
  source: IssueAttribution,
  namespace?: string,
  vendor?: VendorInfo
): string {
  switch (source) {
    case 'USER_CODE':
      return 'This issue is in user-controlled code. You can help the user fix it directly by modifying their Apex classes, triggers, or configuration.';
    
    case 'MANAGED_PACKAGE':
      if (vendor) {
        return `This issue originates in ${vendor.product} (${vendor.name}) managed package. ` +
          `The code is not modifiable. Recommend the user contact ${vendor.name} support` +
          (vendor.supportUrl ? ` at ${vendor.supportUrl}` : '') +
          '. Focus on workarounds at the integration boundary.';
      }
      return `This issue originates in managed package "${namespace || 'unknown'}". ` +
        'The code cannot be viewed or modified. Focus on workarounds and vendor contact.';
    
    case 'BOUNDARY':
      return 'This issue occurs at the boundary between user code and a managed package. ' +
        'You can help optimize the user\'s side of the integration. ' +
        'Review how user code calls into the managed package and ensure it follows best practices.';
    
    default:
      return 'Cannot determine if this issue is in user code or a managed package. ' +
        'Analyze the call stack carefully before recommending changes.';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a method name appears obfuscated
 */
function isLikelyObfuscated(name: string): boolean {
  // Very short non-standard names
  if (name.length <= 2 && !/^(do|go|is|on)$/i.test(name)) {
    return true;
  }

  // Single letters
  if (/^[a-z]$/i.test(name)) {
    return true;
  }

  // Alphanumeric gibberish
  if (/^[a-z][0-9a-z]+$/i.test(name) && name.length <= 5) {
    return true;
  }

  return false;
}

/**
 * Create empty namespace stats
 */
function createEmptyStats(namespace: string): NamespaceStats {
  return {
    namespace,
    eventCount: 0,
    soqlCount: 0,
    dmlCount: 0,
    exceptionCount: 0,
    executionTimeNs: 0,
    executionTimePercent: 0,
    issueCount: 0,
    boundaryCrossings: 0,
  };
}

/**
 * Create unknown attribution
 */
function createUnknownAttribution(reason: string): Attribution {
  return {
    source: 'UNKNOWN',
    confidence: confidence(0.3, [reason]),
    canModify: false,
    canView: false,
    aiGuidance: 'Cannot determine issue attribution. Analyze manually.',
    recommendations: ['Review the issue manually', 'Check the full log for context'],
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick attribution check for a single issue
 */
export function quickAttributeIssue(issue: Issue, events: EventNode[]): IssueAttribution {
  const namespaces = detectNamespaces(events);
  const attribution = attributeIssue(issue, events, namespaces);
  return attribution.source;
}

/**
 * Get attribution summary string
 */
export function getAttributionSummary(attribution: Attribution): string {
  const parts: string[] = [];
  
  parts.push(`Source: ${attribution.source.replace(/_/g, ' ')}`);
  
  if (attribution.namespace) {
    parts.push(`Namespace: ${attribution.namespace}`);
  }
  
  parts.push(`Confidence: ${Math.round(attribution.confidence.score * 100)}%`);
  parts.push(`Can modify: ${attribution.canModify ? 'Yes' : 'No'}`);
  
  return parts.join(' | ');
}

// ============================================================================
// Exports
// ============================================================================
