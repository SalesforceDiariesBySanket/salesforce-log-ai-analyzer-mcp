/**
 * @module output/formatters/types
 * @description Type definitions for JSON/JSONL output formatting
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type { LogMetadata, ParseStats } from '../../types/events';
import type { IssueCategory, IssueSeverity } from '../../types/issues';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * JSON output format configuration
 */
export interface JSONFormatOptions {
  /** Include raw events in output */
  includeEvents?: boolean;

  /** Include full issue details */
  includeIssues?: boolean;

  /** Include metadata */
  includeMetadata?: boolean;

  /** Include parse stats */
  includeStats?: boolean;

  /** Include confidence scores */
  includeConfidence?: boolean;

  /** Maximum number of events to include */
  maxEvents?: number;

  /** Maximum number of issues to include */
  maxIssues?: number;

  /** Event types to include (filter) */
  eventTypes?: string[];

  /** Issue severities to include (filter) */
  severities?: IssueSeverity[];

  /** Issue categories to include (filter) */
  categories?: IssueCategory[];

  /** Indent size for pretty printing (0 = minified) */
  indent?: number;

  /** Include AI-specific context */
  includeAIContext?: boolean;

  /** Redact sensitive fields */
  redact?: boolean;

  /** Custom redaction patterns */
  redactionPatterns?: RegExp[];
}

/**
 * Default options
 */
export const DEFAULT_OPTIONS: Required<JSONFormatOptions> = {
  includeEvents: true,
  includeIssues: true,
  includeMetadata: true,
  includeStats: true,
  includeConfidence: true,
  maxEvents: 1000,
  maxIssues: 100,
  eventTypes: [],
  severities: [],
  categories: [],
  indent: 2,
  includeAIContext: true,
  redact: false,
  redactionPatterns: [],
};

// ============================================================================
// JSON Output Types
// ============================================================================

/**
 * Complete JSON output structure
 */
export interface JSONOutput {
  /** Output format version */
  version: string;

  /** Generation timestamp */
  generatedAt: string;

  /** Log metadata */
  metadata?: LogMetadata;

  /** Parse statistics */
  stats?: ParseStats;

  /** Summary (always included) */
  summary: OutputSummary;

  /** Events (optional) */
  events?: CompactEvent[];

  /** Issues (optional) */
  issues?: OutputIssue[];

  /** AI context (optional) */
  aiContext?: AIOutputContext;
}

/**
 * Compact event for JSON output
 */
export interface CompactEvent {
  /** Event ID */
  id: number;

  /** Event type */
  type: string;

  /** Line number */
  line: number;

  /** Timestamp (ns) */
  ts: number;

  /** Duration (ns) if applicable */
  dur?: number;

  /** Namespace if in managed package */
  ns?: string;

  /** Additional data (type-specific) */
  data?: Record<string, unknown>;
}

/**
 * Output issue format
 */
export interface OutputIssue {
  /** Issue ID */
  id: string;

  /** Issue type */
  type: string;

  /** Category */
  category: IssueCategory;

  /** Severity */
  severity: IssueSeverity;

  /** Title */
  title: string;

  /** Description */
  description: string;

  /** Related event IDs */
  events: number[];

  /** Source lines */
  lines: number[];

  /** Confidence (if enabled) */
  confidence?: number;

  /** Can the user fix this */
  canFix: boolean;

  /** Namespace (if managed package) */
  namespace?: string;

  /** Recommendations */
  recommendations: string[];
}

/**
 * Output summary format
 */
export interface OutputSummary {
  /** Health score */
  health: number;

  /** Total issues */
  totalIssues: number;

  /** Issues by severity */
  bySeverity: Record<string, number>;

  /** Issues by category */
  byCategory: Record<string, number>;

  /** One-line status */
  status: string;
}

/**
 * AI-specific output context
 */
export interface AIOutputContext {
  /** Analysis confidence */
  confidence: number;

  /** Confidence reasons */
  confidenceReasons: string[];

  /** Known limitations */
  limitations: string[];

  /** Was log truncated */
  truncated: boolean;

  /** Detected namespaces */
  namespaces: string[];

  /** Suggested next steps */
  nextSteps: string[];
}
