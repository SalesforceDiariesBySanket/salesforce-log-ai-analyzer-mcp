/**
 * @module managed/index
 * @description Managed package detection, attribution, and AI guidance
 * @status COMPLETE
 * @see src/managed/STATE.md
 * @dependencies src/types/managed.ts, src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

// ============================================================================
// Namespace Detection
// ============================================================================

export {
  namespaceDetector,
  detectNamespaces,
  trackExecutionContext,
  detectBoundaryCrossings,
  isKnownNamespace,
  getVendorInfo,
  getAllKnownNamespaces,
  KNOWN_NAMESPACES,
} from './namespace-detector';

// ============================================================================
// Visibility Classification
// ============================================================================

export {
  classifyVisibility,
  classifyNamespaces,
  isObfuscated,
  getCodeAccessibility,
  type VisibilityClassification,
  type VisibilityEvidence,
  type VisibilityEvidenceType,
} from './visibility-classifier';

// ============================================================================
// Attribution Engine
// ============================================================================

export {
  attributionEngine,
  attributeIssue,
  attributeIssues,
  generateSummary,
  quickAttributeIssue,
  getAttributionSummary,
} from './attribution-engine';

// ============================================================================
// AI Guidance
// ============================================================================

export {
  aiGuidanceGenerator,
  generateGuidance,
  generateObfuscationGuidance,
  generateVendorContactGuidance,
  generateQuickGuidance,
  getAILimitationStatement,
} from './ai-guidance';

// ============================================================================
// Main Analysis Function
// ============================================================================

import type { EventNode } from '../types/events';
import type { Issue } from '../types/issues';
import type { NamespaceSummary, ManagedPackageGuidance } from '../types/managed';
import { detectNamespaces, trackExecutionContext } from './namespace-detector';
import { attributeIssue, generateSummary } from './attribution-engine';
import { generateGuidance } from './ai-guidance';

/**
 * Comprehensive managed package analysis
 * 
 * This is the main entry point for Phase 4 managed package handling.
 * It detects namespaces, attributes issues, and generates guidance.
 * 
 * @param events - Parsed log events
 * @param issues - Detected issues
 * @returns Namespace summary and guidance for each issue
 * 
 * @example
 * const analysis = analyzeManagedPackages(events, issues);
 * console.log(`Found ${analysis.summary.namespaces.length} namespaces`);
 * for (const guidance of analysis.guidance) {
 *   console.log(guidance.attribution.aiGuidance);
 * }
 */
export function analyzeManagedPackages(
  events: EventNode[],
  issues: Issue[]
): ManagedPackageAnalysis {
  // Detect namespaces
  const namespaces = detectNamespaces(events);
  
  // Track execution context
  const executionContexts = trackExecutionContext(events);
  
  // Generate namespace summary
  const summary = generateSummary(events, namespaces, issues);
  
  // Generate guidance for each issue
  const guidance: ManagedPackageGuidance[] = [];
  
  for (const issue of issues) {
    const attribution = attributeIssue(issue, events, namespaces);
    const issueGuidance = generateGuidance(issue, attribution, executionContexts);
    guidance.push(issueGuidance);
  }
  
  return {
    summary,
    guidance,
    namespaces,
    executionContexts,
  };
}

/**
 * Result of managed package analysis
 */
export interface ManagedPackageAnalysis {
  /** Namespace summary with stats */
  summary: NamespaceSummary;
  
  /** Guidance for each issue */
  guidance: ManagedPackageGuidance[];
  
  /** Detected namespaces */
  namespaces: import('../types/managed').NamespaceInfo[];
  
  /** Execution context trace */
  executionContexts: import('../types/managed').ExecutionContext[];
}
