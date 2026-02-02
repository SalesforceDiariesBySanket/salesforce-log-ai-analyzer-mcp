/**
 * @module parser/tokenizer
 * @description Tokenizes raw Salesforce debug log lines into structured tokens
 * @status COMPLETE (REFACTORED for memory efficiency)
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 * 
 * PERFORMANCE NOTE:
 * This module provides two tokenization strategies:
 * 1. tokenizeLineFast() - Uses indexOf, ~10x faster, recommended for large logs
 * 2. tokenizeLine() - Uses regex, more readable, used as fallback
 * 
 * MEMORY NOTE:
 * rawLine is NO LONGER stored in LogToken to reduce memory footprint.
 * For a 20MB log, this saves ~20MB of redundant string storage.
 */

import type { LogToken, EventType, Nanoseconds } from '../types';
import { type Result, ok, err, type ParseError } from '../types';
import { PARSER_LIMITS } from '../constants';

// ============================================================================
// Constants (using centralized config)
// ============================================================================

/**
 * Maximum line length to process.
 * Lines longer than this are truncated before regex to prevent ReDoS.
 * 1MB is generous - normal log lines are <10KB.
 */
const MAX_LINE_LENGTH = PARSER_LIMITS.MAX_LINE_LENGTH;

/**
 * Regex pattern for parsing Salesforce debug log lines (fallback)
 * Format: "HH:MM:SS.mmm (nanoseconds)|EVENT_TYPE|..."
 *
 * Groups:
 * 1. Time string (HH:MM:SS.mmm)
 * 2. Nanoseconds timestamp
 * 3. Event type
 * 4. Rest of the line (segments)
 * 
 * NOTE: Prefer tokenizeLineFast() for large logs - regex is slower.
 */
const LOG_LINE_PATTERN =
  /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*\((\d+)\)\|([A-Z_]+(?:\[[^\]]*\])?)\|?(.*)$/;

/**
 * Pattern for header lines (not events)
 * Example: "48.0 APEX_CODE,FINEST;APEX_PROFILING,INFO..."
 */
const HEADER_PATTERN = /^\d+\.\d+\s+[A-Z_]+,/;

/**
 * Known event types for validation
 */
const KNOWN_EVENT_TYPES: Set<string> = new Set([
  // Execution Flow
  'EXECUTION_STARTED',
  'EXECUTION_FINISHED',
  'CODE_UNIT_STARTED',
  'CODE_UNIT_FINISHED',
  // Method Events
  'METHOD_ENTRY',
  'METHOD_EXIT',
  'CONSTRUCTOR_ENTRY',
  'CONSTRUCTOR_EXIT',
  // System Method Events
  'SYSTEM_METHOD_ENTRY',
  'SYSTEM_METHOD_EXIT',
  'SYSTEM_CONSTRUCTOR_ENTRY',
  'SYSTEM_CONSTRUCTOR_EXIT',
  'SYSTEM_MODE_ENTER',
  'SYSTEM_MODE_EXIT',
  // SOQL/DML Events
  'SOQL_EXECUTE_BEGIN',
  'SOQL_EXECUTE_END',
  'SOQL_EXECUTE_EXPLAIN',
  'DML_BEGIN',
  'DML_END',
  // Limit Events
  'LIMIT_USAGE',
  'LIMIT_USAGE_FOR_NS',
  'CUMULATIVE_LIMIT_USAGE',
  'CUMULATIVE_LIMIT_USAGE_END',
  'CUMULATIVE_PROFILING',
  // Exception Events
  'EXCEPTION_THROWN',
  'FATAL_ERROR',
  // Variable Events
  'VARIABLE_SCOPE_BEGIN',
  'VARIABLE_SCOPE_END',
  'VARIABLE_ASSIGNMENT',
  'STATIC_VARIABLE_LIST',
  // Managed Package Events
  'ENTERING_MANAGED_PKG',
  'PUSH_TRACE_FLAGS',
  'POP_TRACE_FLAGS',
  // Flow Events (comprehensive)
  'FLOW_START_INTERVIEW_BEGIN',
  'FLOW_START_INTERVIEW_END',
  'FLOW_START_INTERVIEWS_BEGIN',
  'FLOW_START_INTERVIEWS_END',
  'FLOW_START_INTERVIEW_LIMIT_USAGE',
  'FLOW_ELEMENT_BEGIN',
  'FLOW_ELEMENT_END',
  'FLOW_ELEMENT_DEFERRED',
  'FLOW_ELEMENT_LIMIT_USAGE',
  'FLOW_BULK_ELEMENT_BEGIN',
  'FLOW_BULK_ELEMENT_END',
  'FLOW_BULK_ELEMENT_DETAIL',
  'FLOW_BULK_ELEMENT_LIMIT_USAGE',
  'FLOW_CREATE_INTERVIEW_BEGIN',
  'FLOW_CREATE_INTERVIEW_END',
  'FLOW_INTERVIEW_FINISHED',
  'FLOW_INTERVIEW_FINISHED_LIMIT_USAGE',
  'FLOW_VALUE_ASSIGNMENT',
  'FLOW_ASSIGNMENT_DETAIL',
  'FLOW_ACTIONCALL_DETAIL',
  'FLOW_LOOP_DETAIL',
  'FLOW_RULE_DETAIL',
  'FLOW_SUBFLOW_DETAIL',
  'FLOW_COLLECTION_PROCESSOR_DETAIL',
  // Validation Events
  'VALIDATION_RULE',
  'VALIDATION_FORMULA',
  // Workflow Events
  'WF_ACTIONS_END',
  'WF_EMAIL_SENT',
  // Callout Events
  'CALLOUT_REQUEST',
  'CALLOUT_RESPONSE',
  // Debug/System Events
  'USER_DEBUG',
  'SYSTEM_DEBUG',
  'USER_INFO',
  'HEAP_ALLOCATE',
  'HEAP_DEALLOCATE',
  'STATEMENT_EXECUTE',
  'TOTAL_EMAIL_RECIPIENTS_QUEUED',
  // Duplicate Detection
  'DUPLICATE_DETECTION_RULE_INVOCATION',
  'DUPLICATE_DETECTION_MATCH_INVOCATION_SUMMARY',
  'DUPLICATE_DETECTION_MATCH_INVOCATION_DETAILS',
  'DUPLICATE_DETECTION_BEGIN',
  'DUPLICATE_DETECTION_END',
  // Async Events
  'ASYNC_JOB_ENQUEUED',
  'FUTURE_CALL',
  'QUEUEABLE_JOB',
  'BATCH_APEX_START',
  'BATCH_APEX_END',
  // Testing/Profiling
  'TESTING_LIMITS',
  'CUMULATIVE_PROFILING_BEGIN',
  'CUMULATIVE_PROFILING_END',
  // Object/Field References
  'REFERENCED_OBJECT_LIST',
]);

// ============================================================================
// Fast Tokenizer (Index-based, ~10x faster than regex)
// ============================================================================

/**
 * Fast tokenizer using indexOf instead of regex
 * Significantly faster for large logs (100k+ lines)
 * 
 * @param line - Raw line from debug log
 * @param lineNumber - 1-based line number in the original file
 * @returns Parsed token or null if line is not an event
 * 
 * @example
 * const result = tokenizeLineFast("12:34:56.789 (123456789)|METHOD_ENTRY|[42]|MyClass.doWork", 1);
 */
export function tokenizeLineFast(
  line: string,
  lineNumber: number
): Result<LogToken | null, ParseError> {
  // Skip empty lines
  if (!line || line.length === 0) {
    return ok(null);
  }

  // Strip trailing CR for CRLF compatibility
  const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (cleanLine.length === 0) {
    return ok(null);
  }

  // Protect against massive lines (ReDoS prevention)
  // Truncate for processing but still extract the event type
  const safeLine = cleanLine.length > MAX_LINE_LENGTH ? cleanLine.substring(0, MAX_LINE_LENGTH) : cleanLine;

  // Quick check: valid log lines start with digit (timestamp)
  const firstChar = safeLine.charCodeAt(0);
  if (firstChar < 48 || firstChar > 57) { // '0' = 48, '9' = 57
    return ok(null);
  }

  // Check for header pattern (e.g., "48.0 APEX_CODE")
  // Headers have format: "XX.X CATEGORY" - check for space after version
  const spaceAfterVersion = safeLine.indexOf(' ');
  if (spaceAfterVersion > 0 && spaceAfterVersion < 6) {
    const afterSpace = safeLine.charCodeAt(spaceAfterVersion + 1);
    // If next char is uppercase letter, it's likely a header
    if (afterSpace >= 65 && afterSpace <= 90) {
      return ok(null);
    }
  }

  // Find the opening parenthesis for nanoseconds
  const parenOpen = safeLine.indexOf('(');
  if (parenOpen === -1 || parenOpen > 15) { // Timestamp is ~12 chars
    return ok(null);
  }

  // Find closing parenthesis
  const parenClose = safeLine.indexOf(')', parenOpen);
  if (parenClose === -1) {
    return ok(null);
  }

  // Extract and parse nanoseconds
  const nanosStr = safeLine.substring(parenOpen + 1, parenClose);
  const timestamp = parseInt(nanosStr, 10);
  if (isNaN(timestamp)) {
    return ok(null);
  }

  // Find first pipe after timestamp (start of event type)
  const firstPipe = safeLine.indexOf('|', parenClose);
  if (firstPipe === -1) {
    return ok(null);
  }

  // Find second pipe (end of event type)
  const secondPipe = safeLine.indexOf('|', firstPipe + 1);
  
  // Extract event type
  const rawEventType = secondPipe === -1 
    ? safeLine.substring(firstPipe + 1)
    : safeLine.substring(firstPipe + 1, secondPipe);

  // Normalize event type
  const eventType = normalizeEventType(rawEventType);

  // Extract segments (everything after event type)
  // Note: For truncated lines, segments may be incomplete
  const segments = secondPipe === -1 
    ? []
    : splitSegments(safeLine.substring(secondPipe + 1));

  const token: LogToken = {
    lineNumber,
    timestamp,
    eventType,
    segments,
  };

  return ok(token);
}

// ============================================================================
// Fallback Tokenizer (Fast -> Regex)
// ============================================================================

/**
 * Smart tokenizer that tries fast method first, falls back to regex
 * 
 * This provides the best of both worlds:
 * - Speed of index-based parsing for most lines
 * - Robustness of regex for edge cases
 * 
 * @param line - Raw line from debug log
 * @param lineNumber - 1-based line number in the original file
 * @returns Parsed token or null if line is not an event
 */
export function tokenizeLineWithFallback(
  line: string,
  lineNumber: number
): Result<LogToken | null, ParseError> {
  // Try fast tokenizer first
  const fastResult = tokenizeLineFast(line, lineNumber);
  
  // If fast tokenizer succeeded (including returning null for non-events), use it
  if (fastResult.success) {
    // If we got a token, return it
    if (fastResult.data !== null) {
      return fastResult;
    }
    
    // Fast returned null - but it might have missed a valid line
    // Only fallback to regex if line looks like it could be an event
    // (starts with digit and contains a pipe)
    if (line && line.length > 0) {
      const firstChar = line.charCodeAt(0);
      const hasPipe = line.indexOf('|') !== -1;
      
      if (firstChar >= 48 && firstChar <= 57 && hasPipe) {
        // Line looks event-like but fast parser returned null - try regex
        return tokenizeLine(line, lineNumber);
      }
    }
    
    // Definitely not an event line
    return fastResult;
  }
  
  // Fast tokenizer errored - fallback to regex
  return tokenizeLine(line, lineNumber);
}

// ============================================================================
// Regex Tokenizer (Fallback, more robust)
// ============================================================================

/**
 * Tokenizes a single line from a Salesforce debug log using regex
 * 
 * NOTE: For better performance on large logs, prefer tokenizeLineFast()
 *
 * @param line - Raw line from debug log
 * @param lineNumber - 1-based line number in the original file
 * @returns Parsed token or null if line is not an event
 *
 * @example
 * const result = tokenizeLine("12:34:56.789 (123456789)|METHOD_ENTRY|[42]|MyClass.doWork", 1);
 * // Returns: { success: true, data: { type: 'METHOD_ENTRY', timestamp: 123456789, ... } }
 */
export function tokenizeLine(
  line: string,
  lineNumber: number
): Result<LogToken | null, ParseError> {
  // Skip empty lines
  if (!line || line.trim() === '') {
    return ok(null);
  }

  // Strip trailing CR for CRLF compatibility
  const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;

  // Protect against massive lines (ReDoS prevention)
  const safeLine = cleanLine.length > MAX_LINE_LENGTH ? cleanLine.substring(0, MAX_LINE_LENGTH) : cleanLine;

  // Skip header lines
  if (HEADER_PATTERN.test(safeLine)) {
    return ok(null);
  }

  // Try to match the log line pattern
  const match = LOG_LINE_PATTERN.exec(safeLine);
  if (!match) {
    // Not a standard log line - might be continuation or garbage
    return ok(null);
  }

  const [, _timeStr, nanosStr, rawEventType, rest] = match;

  // Parse nanoseconds timestamp
  const timestamp = parseNanoseconds(nanosStr ?? '');
  if (timestamp === null) {
    return err({
      code: 'TIMESTAMP_PARSE_ERROR',
      message: `Failed to parse timestamp: ${nanosStr}`,
      lineNumber,
      // Only include rawLine in errors, not in successful tokens
      rawLine: line,
    });
  }

  // Normalize event type (handle brackets like "CODE_UNIT_STARTED[EXTERNAL]")
  const eventType = normalizeEventType(rawEventType ?? '');

  // Split remaining segments by pipe
  const segments = rest ? splitSegments(rest) : [];

  // NOTE: rawLine is intentionally NOT stored to save memory
  const token: LogToken = {
    lineNumber,
    timestamp,
    eventType,
    segments,
  };

  return ok(token);
}

// ============================================================================
// Batch Tokenizer
// ============================================================================

/**
 * Tokenizes all lines from a debug log (batch mode)
 * 
 * WARNING: This loads the entire log into memory. For large logs (>10MB),
 * consider using tokenizeLogStream() instead.
 *
 * @param content - Full log content
 * @param useFallback - Use smart fallback tokenizer (default: true)
 * @returns Array of parsed tokens with line numbers
 */
export function tokenizeLog(
  content: string,
  useFallback: boolean = true
): Result<LogToken[], ParseError> {
  // Handle both LF and CRLF line endings
  const lines = content.split(/\r?\n/);
  const tokens: LogToken[] = [];
  const errors: ParseError[] = [];
  
  // Default to fallback mode for robustness
  const tokenizer = useFallback ? tokenizeLineWithFallback : tokenizeLineFast;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1; // 1-based
    const result = tokenizer(lines[i] ?? '', lineNumber);

    if (!result.success) {
      errors.push(result.error);
      continue;
    }

    if (result.data !== null) {
      tokens.push(result.data);
    }
  }

  // If we have critical errors and no tokens, fail
  if (tokens.length === 0 && errors.length > 0) {
    return err({
      code: 'INVALID_FORMAT',
      message: `Failed to parse any tokens. First error: ${errors[0]?.message ?? 'Unknown error'}`,
      context: { errorCount: errors.length },
    });
  }

  return ok(tokens);
}

// ============================================================================
// Streaming Tokenizer (Memory-Efficient)
// ============================================================================

/**
 * Generator that tokenizes lines one at a time (streaming mode)
 * 
 * This is the preferred approach for large logs (>10MB) as it:
 * 1. Never loads entire file into memory
 * 2. Yields tokens one at a time
 * 3. Can be stopped early if needed
 * 
 * @param lines - Iterable of log lines (e.g., from readline or split)
 * @param useFallback - Use smart fallback tokenizer (default: true)
 * @yields Parsed tokens one at a time
 * 
 * @example
 * // From file stream
 * const lineReader = readline.createInterface({ input: fs.createReadStream('log.txt') });
 * for await (const token of tokenizeLogStream(lineReader)) {
 *   processToken(token);
 * }
 * 
 * @example
 * // From string (still more memory-efficient than tokenizeLog)
 * const lines = content.split('\n');
 * for (const token of tokenizeLogStream(lines)) {
 *   processToken(token);
 * }
 */
export function* tokenizeLogStream(
  lines: Iterable<string>,
  useFallback: boolean = true
): Generator<LogToken, void, undefined> {
  const tokenizer = useFallback ? tokenizeLineWithFallback : tokenizeLineFast;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    const result = tokenizer(line, lineNumber);

    if (result.success && result.data !== null) {
      yield result.data;
    }
    // Note: In streaming mode, we silently skip errors to maintain flow
    // Callers who need error info should use tokenizeLog()
  }
}

/**
 * Async generator for tokenizing lines from async iterables (e.g., file streams)
 * 
 * @param lines - Async iterable of log lines
 * @param useFallback - Use smart fallback tokenizer (default: true)
 * @yields Parsed tokens one at a time
 */
export async function* tokenizeLogStreamAsync(
  lines: AsyncIterable<string>,
  useFallback: boolean = true
): AsyncGenerator<LogToken, void, undefined> {
  const tokenizer = useFallback ? tokenizeLineWithFallback : tokenizeLineFast;
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber++;
    const result = tokenizer(line, lineNumber);

    if (result.success && result.data !== null) {
      yield result.data;
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse nanoseconds from string
 */
function parseNanoseconds(str: string): Nanoseconds | null {
  const num = parseInt(str, 10);
  return isNaN(num) ? null : num;
}

/**
 * Normalize event type by removing brackets and validating
 */
function normalizeEventType(raw: string): EventType {
  // Handle bracketed event types like "CODE_UNIT_STARTED[EXTERNAL]"
  const baseName = raw.replace(/\[.*\]$/, '');

  if (KNOWN_EVENT_TYPES.has(baseName)) {
    return baseName as EventType;
  }

  return 'UNKNOWN';
}

/**
 * Split segments by pipe, handling edge cases
 */
function splitSegments(rest: string): string[] {
  if (!rest) return [];

  // Simple split by pipe
  const segments = rest.split('|');

  // Trim whitespace from each segment
  return segments.map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * Check if a line is a continuation of a previous event
 * (e.g., multi-line SOQL queries)
 */
export function isContinuationLine(line: string): boolean {
  // Continuation lines don't match the timestamp pattern
  return !LOG_LINE_PATTERN.test(line) && !HEADER_PATTERN.test(line) && line.trim() !== '';
}

/**
 * Extract header metadata from log
 */
export function parseLogHeader(content: string): {
  apiVersion?: string;
  debugLevels?: Record<string, string>;
} {
  const lines = content.split('\n').slice(0, 5); // Header is in first few lines
  const result: { apiVersion?: string; debugLevels?: Record<string, string> } = {};

  for (const line of lines) {
    // Check for API version line: "48.0 APEX_CODE,FINEST;..."
    const versionMatch = /^(\d+\.\d+)\s+([A-Z_,;]+)/.exec(line);
    if (versionMatch) {
      result.apiVersion = versionMatch[1];

      // Parse debug levels
      const levels: Record<string, string> = {};
      const levelPairs = (versionMatch[2] ?? '').split(';');
      for (const pair of levelPairs) {
        const [category, level] = pair.split(',');
        if (category && level) {
          levels[category] = level;
        }
      }
      result.debugLevels = levels;
      break;
    }
  }

  return result;
}
