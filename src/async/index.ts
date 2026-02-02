/**
 * @module async/index
 * @description Async job correlation between parent and child logs
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/types/async.ts, src/types/events.ts
 * @lastModified 2026-01-31
 */

// ============================================================================
// Job Extraction
// ============================================================================

export {
  JobExtractor,
  extractAsyncJobs,
  hasAsyncBoundaries,
  countAsyncJobs,
  type ExtractionContext,
} from './job-extractor';

// ============================================================================
// Job Tracking
// ============================================================================

export {
  JobTracker,
  createJobTracker,
  isTerminalStatus,
  isFailedStatus,
  type ClassNameQueryOptions,
  type RecentJobsOptions,
  type WaitOptions,
} from './job-tracker';

// ============================================================================
// Log Correlation
// ============================================================================

export {
  LogCorrelator,
  createLogCorrelator,
  isLikelyChildLog,
} from './log-correlator';

// ============================================================================
// Confidence Scoring
// ============================================================================

export {
  CorrelationScorer,
  quickConfidenceCheck,
  getConfidenceDescription,
  sortByConfidence,
  type ScoringResult,
} from './confidence-scorer';

// ============================================================================
// Unified View
// ============================================================================

export {
  UnifiedViewBuilder,
  createUnifiedViewBuilder,
  buildSimpleUnifiedView,
  flattenUnifiedEvents,
  type UnifiedViewOptions,
} from './unified-view';

// ============================================================================
// Re-export Types
// ============================================================================

export type {
  AsyncJobType,
  AsyncJobStatus,
  AsyncJobRef,
  AsyncApexJobRecord,
  CorrelationResult,
  CorrelationReason,
  MatchDetail,
  UnifiedView,
  UnifiedExecutionNode,
  UnifiedLogInfo,
  UnifiedSummary,
  CorrelationOptions,
  JobExtractionResult,
  JobTrackingResult,
} from '../types/async';
