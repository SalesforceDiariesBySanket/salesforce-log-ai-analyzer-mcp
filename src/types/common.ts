/**
 * @module types/common
 * @description Shared utility types used across all modules
 * @status COMPLETE
 * @see src/types/STATE.md
 * @dependencies none
 * @lastModified 2026-01-31
 */

// ============================================================================
// Result Type (Error Handling Without Throwing)
// ============================================================================

/**
 * Represents the outcome of an operation that can fail
 * @template T - The success data type
 * @template E - The error type (defaults to Error)
 *
 * @example
 * const result = parseLog(content);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.message);
 * }
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Creates a successful Result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Creates a failed Result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Standardized error structure for all modules
 */
export interface AppError {
  /** Machine-readable error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Original error if wrapping */
  cause?: Error;
}

/**
 * Parser-specific errors
 */
export type ParseErrorCode =
  | 'EMPTY_LOG'
  | 'INVALID_FORMAT'
  | 'TRUNCATED_LOG'
  | 'UNSUPPORTED_EVENT'
  | 'MALFORMED_LINE'
  | 'TIMESTAMP_PARSE_ERROR';

export interface ParseError extends AppError {
  code: ParseErrorCode;
  lineNumber?: number;
  /** Raw line content - only populated on parse errors, not stored in tokens for memory efficiency */
  rawLine?: string;
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Confidence level for probabilistic outputs
 * Used throughout the system for AI-friendly uncertainty
 */
export interface Confidence {
  /** Score from 0.0 to 1.0 */
  score: number;
  /** Reasons supporting this confidence */
  reasons: string[];
  /** Known limitations affecting confidence */
  limitations?: string[];
}

/**
 * Creates a confidence object
 */
export function confidence(
  score: number,
  reasons: string[],
  limitations?: string[]
): Confidence {
  return {
    score: Math.max(0, Math.min(1, score)),
    reasons,
    limitations,
  };
}

// ============================================================================
// Time Types
// ============================================================================

/**
 * Nanosecond timestamp (Salesforce log format)
 */
export type Nanoseconds = number;

/**
 * Millisecond timestamp (JavaScript Date)
 */
export type Milliseconds = number;

/**
 * Duration in nanoseconds
 */
export type Duration = number;

// ============================================================================
// Generic Utility Types
// ============================================================================

/**
 * Makes specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specific properties required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Extracts the data type from a Result
 */
export type ResultData<R> = R extends Result<infer T, unknown> ? T : never;

/**
 * Extracts the error type from a Result
 */
export type ResultError<R> = R extends Result<unknown, infer E> ? E : never;
