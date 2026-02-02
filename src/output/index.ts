/**
 * @module output/index
 * @description AI-optimized output formatters (JSON, JSONL, summaries)
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts, src/analyzer/index.ts
 * @lastModified 2026-01-31
 */

// ============================================================================
// JSON Formatting
// ============================================================================

export {
  // Main formatters
  formatJSON,
  formatJSONObject,
  formatSummaryJSON,
  formatIssuesJSON,
  formatEventsJSON,
  // JSONL streaming
  generateJSONL,
  formatJSONL,
  // Types
  type JSONFormatOptions,
  type JSONOutput,
  type CompactEvent,
  type OutputIssue,
  type OutputSummary,
  type AIOutputContext,
  // Defaults
  defaultJSONOptions,
} from './json-formatter';

// ============================================================================
// JSONL Streaming (NEW - from formatters module)
// ============================================================================

export {
  // Advanced JSONL functions
  generateJSONLAsync,
  streamEventsJSONL,
  parseJSONL,
  // Types
  type JSONLRecordType,
  type JSONLRecord,
  type JSONLHeader,
  type JSONLFooter,
} from './formatters';

// ============================================================================
// ASCII Tree Rendering
// ============================================================================

export {
  renderTree,
  renderGitGraph,
  renderEnhancedTree,
  buildTreeFromEvents,
  generateTreeSummary,
  type TreeRenderOptions,
  type GitGraphOptions,
} from './tree-renderer';

// ============================================================================
// Query Engine
// ============================================================================

export {
  // Event querying
  EventQueryEngine,
  createEventQuery,
  // Issue querying
  IssueQueryEngine,
  createIssueQuery,
  // Convenience functions
  findSOQLInLoops,
  getExceptionContext,
  // Types
  type EventFilter,
  type IssueFilter,
  type SortOptions,
  type PaginationOptions,
  type QueryResult,
} from './query-engine';

// ============================================================================
// Confidence Emitter
// ============================================================================

export {
  // Main functions
  assessConfidence,
  enrichWithConfidence,
  getIssueConfidence,
  aggregateIssueConfidence,
  // Helpers
  getConfidenceLevel,
  getSeverityWeight,
  // Types
  type ConfidenceAssessment,
  type ConfidenceBreakdown,
  type ComponentConfidence,
  type ConfidenceLevel,
  type ConfidenceEnrichedOutput,
  type AIConfidenceGuidance,
} from './confidence-emitter';

// ============================================================================
// Problem Context Builder
// ============================================================================

export {
  // Main functions
  buildProblemContext,
  buildAllProblemContexts,
  buildTopIssueContexts,
  // Markdown conversion
  contextToMarkdown,
  contextsToMarkdown,
  // Utilities & Constants
  estimateTokens,
  DEFAULT_MAX_TOKENS,
  DEFAULT_CHARS_PER_TOKEN,
  // Types
  type ProblemContext,
  type ContextHeader,
  type IssueContext,
  type EventContext,
  type CompactEventSummary,
  type CodeSnippetContext,
  type GuidanceContext,
  type ContextOptions,
} from './problem-context';

// ============================================================================
// Re-export Summarizer from Analyzer (for convenience)
// ============================================================================

export {
  generateSummary,
  generateMinimalSummary,
  generateMarkdownSummary,
  StreamingSummarizer,
  MAX_SUMMARY_TOKENS,
  type LogSummary,
  type SummaryMetrics,
  type CompactIssue,
  type AIContext,
} from '../analyzer/summarizer';
