/**
 * @module types/issues
 * @description Type definitions for detected issues in Salesforce debug logs
 * @status COMPLETE
 * @see src/types/STATE.md
 * @dependencies src/types/common.ts, src/types/events.ts
 * @lastModified 2026-01-31
 */

import type { Confidence } from './common';
import type { EventNode } from './events';

// ============================================================================
// Issue Categories
// ============================================================================

/**
 * High-level issue categories for AI-friendly grouping
 */
export type IssueCategory =
  | 'PERFORMANCE' // CPU, heap, slow queries
  | 'GOVERNOR_LIMITS' // Near or exceeded limits
  | 'ERROR' // Exceptions, failures
  | 'ANTI_PATTERN' // SOQL in loop, N+1
  | 'SECURITY' // SOQL injection, hardcoded creds
  | 'DATA_QUALITY' // Null handling, type issues
  | 'BEST_PRACTICE' // Missing bulk patterns
  | 'MANAGED_PACKAGE'; // Vendor-related issues

/**
 * Specific issue types
 */
export type IssueType =
  // Performance Issues
  | 'CPU_TIMEOUT'
  | 'HEAP_LIMIT'
  | 'SLOW_QUERY'
  | 'NON_SELECTIVE_QUERY'
  | 'CPU_HOTSPOT'
  // Governor Limit Issues
  | 'SOQL_LIMIT_NEAR'
  | 'SOQL_LIMIT_EXCEEDED'
  | 'DML_LIMIT_NEAR'
  | 'DML_LIMIT_EXCEEDED'
  | 'CALLOUT_LIMIT'
  | 'HEAP_SIZE_WARNING'
  // Error Issues
  | 'EXCEPTION_THROWN'
  | 'FATAL_ERROR'
  | 'NULL_POINTER'
  | 'DML_EXCEPTION'
  | 'QUERY_EXCEPTION'
  // Anti-Pattern Issues
  | 'SOQL_IN_LOOP'
  | 'DML_IN_LOOP'
  | 'N_PLUS_ONE'
  | 'RECURSIVE_TRIGGER'
  | 'HARDCODED_ID'
  // Security Issues
  | 'SOQL_INJECTION_RISK'
  | 'HARDCODED_CREDENTIALS'
  | 'INSECURE_ENDPOINT'
  // Managed Package Issues
  | 'MANAGED_PACKAGE_ERROR'
  | 'VENDOR_BOUNDARY_ISSUE';

// ============================================================================
// Issue Severity
// ============================================================================

/**
 * Issue severity levels
 */
export type IssueSeverity =
  | 'CRITICAL' // Immediate action needed (errors, limit exceeded)
  | 'HIGH' // Should fix soon (near limits, major anti-patterns)
  | 'MEDIUM' // Should consider fixing (performance issues)
  | 'LOW' // Nice to fix (best practices)
  | 'INFO'; // Informational only

// ============================================================================
// Issue Attribution
// ============================================================================

/**
 * Who is responsible for the issue
 */
export type IssueAttribution =
  | 'USER_CODE' // Developer's own code
  | 'MANAGED_PACKAGE' // Vendor code (can't fix directly)
  | 'BOUNDARY' // Issue at integration point
  | 'PLATFORM' // Salesforce platform behavior
  | 'UNKNOWN'; // Cannot determine

/**
 * Attribution details with confidence
 */
export interface AttributionInfo {
  /** Who to attribute the issue to */
  attribution: IssueAttribution;
  /** Confidence in attribution */
  confidence: Confidence;
  /** Namespace if managed package */
  namespace?: string;
  /** Whether the code can be modified */
  canModify: boolean;
  /** AI guidance based on attribution */
  aiGuidance: string;
}

// ============================================================================
// Core Issue Interface
// ============================================================================

/**
 * Represents a detected issue in the log
 *
 * @example
 * const issue: Issue = {
 *   id: 'issue-1',
 *   type: 'SOQL_IN_LOOP',
 *   category: 'ANTI_PATTERN',
 *   severity: 'HIGH',
 *   title: 'SOQL query inside loop',
 *   description: 'Found SOQL query executed 150 times inside a loop',
 *   eventIds: [42, 45, 48],
 *   lineNumbers: [156, 157, 158],
 *   confidence: { score: 0.95, reasons: ['Pattern detected', 'High repetition'] },
 *   attribution: { attribution: 'USER_CODE', confidence: {...}, canModify: true, aiGuidance: '...' },
 *   recommendations: ['Move query outside loop', 'Use Map for caching'],
 *   aiContext: { ... }
 * };
 */
export interface Issue {
  /** Unique issue ID */
  id: string;

  /** Specific issue type */
  type: IssueType;

  /** High-level category */
  category: IssueCategory;

  /** Severity level */
  severity: IssueSeverity;

  /** Short title for display */
  title: string;

  /** Detailed description */
  description: string;

  /** Related event IDs from the parsed log */
  eventIds: number[];

  /** Source line numbers */
  lineNumbers: number[];

  /** Detection confidence */
  confidence: Confidence;

  /** Attribution information */
  attribution: AttributionInfo;

  /** Actionable recommendations */
  recommendations: string[];

  /** AI-specific context for deeper analysis */
  aiContext: AIIssueContext;
}

// ============================================================================
// AI-Specific Context
// ============================================================================

/**
 * Context optimized for AI consumption
 * Kept under 2000 tokens per issue
 */
export interface AIIssueContext {
  /** Code snippet causing the issue (if available) */
  codeSnippet?: string;

  /** Relevant events (summarized) */
  relevantEvents: EventSummary[];

  /** Related issues (for pattern detection) */
  relatedIssueIds?: string[];

  /** Metrics for this issue */
  metrics?: IssueMetrics;

  /** Suggested fix patterns */
  fixPatterns?: FixPattern[];

  /** Questions the AI should consider asking the user */
  clarifyingQuestions?: string[];
}

/**
 * Summarized event for AI context
 */
export interface EventSummary {
  /** Event ID */
  id: number;
  /** Event type */
  type: string;
  /** Line number */
  line: number;
  /** Brief description */
  summary: string;
  /** Duration if applicable */
  durationMs?: number;
}

/**
 * Metrics related to an issue
 */
export interface IssueMetrics {
  /** Number of occurrences */
  occurrences?: number;
  /** Total impact (e.g., total rows, total time) */
  totalImpact?: number;
  /** Percentage of limit consumed */
  limitPercentage?: number;
  /** Performance impact in ms */
  performanceImpactMs?: number;
}

/**
 * Suggested fix pattern
 */
export interface FixPattern {
  /** Pattern name */
  name: string;
  /** Description */
  description: string;
  /** Before code example */
  before?: string;
  /** After code example */
  after?: string;
  /** Applicable to this issue */
  applicability: Confidence;
}

// ============================================================================
// Issue Detection Result
// ============================================================================

/**
 * Result of running all issue detectors
 */
export interface IssueDetectionResult {
  /** All detected issues */
  issues: Issue[];

  /** Issues grouped by category */
  byCategory: Record<IssueCategory, Issue[]>;

  /** Issues grouped by severity */
  bySeverity: Record<IssueSeverity, Issue[]>;

  /** Summary for AI */
  summary: IssueSummary;
}

/**
 * Summary of all issues for AI consumption
 */
export interface IssueSummary {
  /** Total issue count */
  totalCount: number;

  /** Counts by severity */
  bySeverity: Record<IssueSeverity, number>;

  /** Counts by category */
  byCategory: Record<IssueCategory, number>;

  /** Top 3 most critical issues */
  topIssues: Pick<Issue, 'id' | 'type' | 'title' | 'severity'>[];

  /** Overall health score (0-100) */
  healthScore: number;

  /** One-line summary for AI */
  oneLiner: string;
}

// ============================================================================
// Issue Detector Interface
// ============================================================================

/**
 * Interface for issue detector implementations
 */
export interface IssueDetector {
  /** Detector name */
  name: string;

  /** Issue types this detector finds */
  detects: IssueType[];

  /** Run detection on parsed events */
  detect(events: EventNode[]): Issue[];
}
