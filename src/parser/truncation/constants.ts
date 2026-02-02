/**
 * @module parser/truncation/constants
 * @description Constants for truncation detection and handling
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies none
 * @lastModified 2026-02-01
 */

// ============================================================================
// Truncation Detection Constants
// ============================================================================

/**
 * Known Salesforce truncation markers
 */
export const TRUNCATION_MARKERS = [
  '*** Skipped',
  '*** Truncated',
  '...Maximum Debug Log Size Reached...',
  'MAXIMUM DEBUG LOG SIZE REACHED',
  '* MAXIMUM DEBUG LOG SIZE REACHED *',
  '...log truncated...',
] as const;

/**
 * Size thresholds for detection
 */
export const SIZE_THRESHOLDS = {
  /** Salesforce hard limit (20MB) */
  SALESFORCE_MAX: 20 * 1024 * 1024,
  /** Warning threshold (95% of max) */
  WARNING_THRESHOLD: 19 * 1024 * 1024,
  /** Likely truncated threshold (99% of max) */
  LIKELY_TRUNCATED: 19.8 * 1024 * 1024,
} as const;

/**
 * Detection thresholds
 */
export const DETECTION_THRESHOLDS = {
  /** Number of unclosed events to consider suspicious */
  UNCLOSED_EVENTS_SUSPICIOUS: 5,
  /** Lines from end to consider "near end" */
  NEAR_END_LINE_COUNT: 10,
  /** Minimum stack trace entries for complete trace */
  MIN_STACK_TRACE_LENGTH: 2,
} as const;

/**
 * Confidence score weights
 */
export const CONFIDENCE_WEIGHTS = {
  /** Explicit marker - definitive */
  EXPLICIT_MARKER: 0.99,
  /** Size threshold + other indicators */
  SIZE_WITH_MULTIPLE: 0.95,
  /** Three or more indicators */
  THREE_INDICATORS: 0.9,
  /** Two indicators */
  TWO_INDICATORS: 0.8,
  /** Single indicator */
  SINGLE_INDICATOR: 0.6,
  /** No indicators - confident log is complete */
  NO_INDICATORS: 0.95,
} as const;
