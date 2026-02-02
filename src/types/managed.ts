/**
 * @module types/managed
 * @description Type definitions for managed package handling and attribution
 * @status COMPLETE
 * @see src/types/STATE.md
 * @dependencies src/types/common.ts, src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type { Confidence } from './common';
import type { Issue, IssueAttribution } from './issues';

// ============================================================================
// Namespace Types
// ============================================================================

/**
 * Namespace visibility levels
 */
export type NamespaceVisibility =
  | 'PUBLIC'      // Public, documented managed package
  | 'PRIVATE'     // Unlocked package or internal
  | 'UNKNOWN';    // Cannot determine

/**
 * Namespace category
 */
export type NamespaceCategory =
  | 'SALESFORCE_INTERNAL'  // Salesforce platform namespaces
  | 'ISV_PARTNER'          // ISV/Partner managed packages
  | 'APPEXCHANGE'          // AppExchange packages
  | 'UNLOCKED'             // Unlocked packages
  | 'USER'                 // User's own namespace
  | 'UNKNOWN';             // Cannot determine

// ============================================================================
// Namespace Information
// ============================================================================

/**
 * Complete namespace information
 */
export interface NamespaceInfo {
  /** The namespace prefix */
  namespace: string;
  
  /** Visibility level */
  visibility: NamespaceVisibility;
  
  /** Category of the namespace */
  category: NamespaceCategory;
  
  /** Whether this is a managed (locked) package */
  isManaged: boolean;
  
  /** Whether code is obfuscated */
  isObfuscated: boolean;
  
  /** Vendor information if known */
  vendor?: VendorInfo;
  
  /** Confidence in classification */
  confidence: Confidence;
}

/**
 * Information about a package vendor
 */
export interface VendorInfo {
  /** Vendor name */
  name: string;
  
  /** Product name */
  product: string;
  
  /** Support URL */
  supportUrl?: string;
  
  /** Documentation URL */
  documentationUrl?: string;
  
  /** Known contact info */
  contactInfo?: string;
  
  /** Common issues known for this package */
  knownIssues?: string[];
}

// ============================================================================
// Execution Context
// ============================================================================

/**
 * Execution context for tracking where code runs
 */
export interface ExecutionContext {
  /** Current namespace */
  namespace?: string;
  
  /** Stack of namespaces (for tracking boundary crossings) */
  namespaceStack: string[];
  
  /** Whether currently in managed package code */
  inManagedPackage: boolean;
  
  /** Current class/trigger name */
  currentCodeUnit?: string;
  
  /** Entry point namespace (where execution started) */
  entryPointNamespace?: string;
}

/**
 * Namespace boundary crossing
 */
export interface BoundaryCrossing {
  /** From namespace (undefined = user code) */
  fromNamespace?: string;
  
  /** To namespace (undefined = user code) */
  toNamespace?: string;
  
  /** Direction of crossing */
  direction: 'USER_TO_MANAGED' | 'MANAGED_TO_USER' | 'MANAGED_TO_MANAGED';
  
  /** Event ID where crossing occurred */
  eventId: number;
  
  /** Line number */
  lineNumber: number;
  
  /** Method/trigger that was called */
  crossingPoint?: string;
}

// ============================================================================
// Attribution Types
// ============================================================================

/**
 * Detailed attribution result
 */
export interface Attribution {
  /** High-level attribution */
  source: IssueAttribution;
  
  /** Specific namespace if applicable */
  namespace?: string;
  
  /** Confidence in attribution */
  confidence: Confidence;
  
  /** Whether the code can be modified */
  canModify: boolean;
  
  /** Whether code is visible/readable */
  canView: boolean;
  
  /** AI-focused guidance */
  aiGuidance: string;
  
  /** Actionable recommendations */
  recommendations: string[];
  
  /** Vendor to contact if managed package */
  vendorContact?: VendorInfo;
}

/**
 * Attribution evidence
 */
export interface AttributionEvidence {
  /** Type of evidence */
  type: AttributionEvidenceType;
  
  /** Description */
  description: string;
  
  /** Weight in attribution decision (0-1) */
  weight: number;
  
  /** Source event IDs */
  eventIds: number[];
}

/**
 * Types of attribution evidence
 */
export type AttributionEvidenceType =
  | 'NAMESPACE_MARKER'      // ENTERING_MANAGED_PKG event
  | 'CLASS_NAME_PREFIX'     // Class name has namespace prefix
  | 'METHOD_SIGNATURE'      // Method signature indicates package
  | 'BOUNDARY_CROSSING'     // Execution crossed boundary
  | 'OBFUSCATED_CODE'       // Code appears obfuscated
  | 'STACK_TRACE'           // Stack trace shows package
  | 'ERROR_MESSAGE'         // Error message mentions package
  | 'TRIGGER_NAME';         // Trigger name pattern

// ============================================================================
// Package Statistics
// ============================================================================

/**
 * Statistics for a namespace
 */
export interface NamespaceStats {
  /** Namespace */
  namespace: string;
  
  /** Total events in this namespace */
  eventCount: number;
  
  /** SOQL queries executed */
  soqlCount: number;
  
  /** DML operations executed */
  dmlCount: number;
  
  /** Exceptions thrown */
  exceptionCount: number;
  
  /** Total execution time (ns) */
  executionTimeNs: number;
  
  /** Percentage of total execution time */
  executionTimePercent: number;
  
  /** Issues attributed to this namespace */
  issueCount: number;
  
  /** Boundary crossings */
  boundaryCrossings: number;
}

/**
 * Summary of all namespace activity
 */
export interface NamespaceSummary {
  /** All detected namespaces */
  namespaces: NamespaceInfo[];
  
  /** Statistics per namespace */
  stats: Map<string, NamespaceStats>;
  
  /** User code stats (no namespace) */
  userCodeStats: NamespaceStats;
  
  /** All boundary crossings */
  boundaryCrossings: BoundaryCrossing[];
  
  /** Issues by attribution */
  issuesByAttribution: {
    userCode: number;
    managedPackage: number;
    boundary: number;
    unknown: number;
  };
}

// ============================================================================
// AI Guidance Types
// ============================================================================

/**
 * AI guidance for a managed package issue
 */
export interface ManagedPackageGuidance {
  /** Issue being addressed */
  issue: Issue;
  
  /** Attribution result */
  attribution: Attribution;
  
  /** Context explanation */
  contextExplanation: string;
  
  /** What the AI CAN help with */
  canHelpWith: string[];
  
  /** What the AI CANNOT help with */
  cannotHelpWith: string[];
  
  /** Workarounds that might be possible */
  possibleWorkarounds: string[];
  
  /** Questions to ask the user */
  clarifyingQuestions: string[];
  
  /** External resources */
  resources: ResourceLink[];
}

/**
 * External resource link
 */
export interface ResourceLink {
  /** Link title */
  title: string;
  
  /** URL */
  url: string;
  
  /** Type of resource */
  type: 'DOCUMENTATION' | 'SUPPORT' | 'FORUM' | 'KNOWN_ISSUE' | 'TRAILHEAD';
  
  /** Relevance to the issue */
  relevance: string;
}

// ============================================================================
// Detection Interfaces
// ============================================================================

/**
 * Namespace detector interface
 */
export interface NamespaceDetector {
  /** Extract all namespaces from events */
  detectNamespaces(events: import('./events').EventNode[]): NamespaceInfo[];
  
  /** Track namespace context through events */
  trackExecutionContext(events: import('./events').EventNode[]): ExecutionContext[];
  
  /** Detect boundary crossings */
  detectBoundaryCrossings(events: import('./events').EventNode[]): BoundaryCrossing[];
}

/**
 * Attribution engine interface
 */
export interface AttributionEngine {
  /** Attribute a single issue */
  attributeIssue(
    issue: Issue,
    events: import('./events').EventNode[],
    namespaces: NamespaceInfo[]
  ): Attribution;
  
  /** Attribute multiple issues */
  attributeIssues(
    issues: Issue[],
    events: import('./events').EventNode[],
    namespaces: NamespaceInfo[]
  ): Map<string, Attribution>;
  
  /** Generate namespace summary */
  generateSummary(
    events: import('./events').EventNode[],
    namespaces: NamespaceInfo[],
    issues: Issue[]
  ): NamespaceSummary;
}

/**
 * AI guidance generator interface
 */
export interface AIGuidanceGenerator {
  /** Generate guidance for an issue */
  generateGuidance(
    issue: Issue,
    attribution: Attribution,
    context: ExecutionContext[]
  ): ManagedPackageGuidance;
  
  /** Generate guidance for obfuscated code */
  generateObfuscationGuidance(
    namespace: NamespaceInfo,
    issues: Issue[]
  ): string;
  
  /** Generate vendor contact guidance */
  generateVendorContactGuidance(
    vendor: VendorInfo,
    issues: Issue[]
  ): string;
}
