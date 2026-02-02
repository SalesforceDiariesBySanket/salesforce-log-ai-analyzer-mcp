/**
 * @module parser/index
 * @description Main parser orchestrator - converts raw log files to ParsedLog
 * @status COMPLETE (REFACTORED for streaming support)
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts, ./tokenizer.ts, ./ast-builder.ts, ./event-handlers
 * @lastModified 2026-01-31
 * 
 * MEMORY-EFFICIENT PARSING:
 * This module now provides two parsing strategies:
 * 
 * 1. parseLog(content) - Batch mode, loads entire file
 *    - Use for: Small logs (<10MB), when you need full ParsedLog result
 *    - Memory: O(n) where n = file size
 * 
 * 2. parseLogStream(lines) - Streaming mode, processes line by line
 *    - Use for: Large logs (>10MB), truncated logs, memory-constrained environments
 *    - Memory: O(1) constant - only holds current event
 *    - Note: Does not build tree structure (flat events only)
 */

import type {
  ParsedLog,
  EventNode,
  LogMetadata,
  TruncationInfo,
  ParseStats,
  ParseError,
  Result,
  Confidence,
} from '../types';
import { ok, err, confidence } from '../types';
import { PARSER_LIMITS } from '../constants';
import { tokenizeLog, tokenizeLogStream, tokenizeLogStreamAsync, parseLogHeader } from './tokenizer';
import { buildEventTree, createParseContext, updateParseContext } from './ast-builder';
import { handleToken } from './event-handlers';

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse a Salesforce debug log into structured events
 *
 * @param content - Raw debug log content
 * @param _options - Parser options (reserved for future use)
 * @returns Parsed log with events, tree, metadata, and stats
 *
 * @example
 * const result = parseLog(debugLogContent);
 * if (result.success) {
 *   console.log(`Parsed ${result.data.events.length} events`);
 *   console.log(`Health: ${result.data.stats.parsedLines}/${result.data.stats.totalLines} lines`);
 * }
 */
export function parseLog(
  content: string,
  _options: ParseOptions = {}
): Result<ParsedLog, ParseError> {
  const startTime = Date.now();

  // Validate input
  if (!content || content.trim() === '') {
    return err({
      code: 'EMPTY_LOG',
      message: 'Log content is empty',
    });
  }

  // Tokenize the log
  const tokenResult = tokenizeLog(content);
  if (!tokenResult.success) {
    return err(tokenResult.error);
  }

  const tokens = tokenResult.data;
  if (tokens.length === 0) {
    return err({
      code: 'INVALID_FORMAT',
      message: 'No valid log events found in content',
    });
  }

  // Parse header metadata
  const headerInfo = parseLogHeader(content);
  const metadata: LogMetadata = {
    apiVersion: headerInfo.apiVersion,
    debugLevels: headerInfo.debugLevels,
  };

  // Create parse context
  const context = createParseContext();

  // Process tokens into events
  const events: EventNode[] = [];
  const eventsByType: Record<string, number> = {};
  let failedTokens = 0;

  for (const token of tokens) {
    const event = handleToken(token, context);

    if (event) {
      events.push(event);
      updateParseContext(context, event);

      // Track by type
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    } else {
      failedTokens++;
    }
  }

  // Check for truncation
  const truncation = detectTruncation(content, events);

  // Build event tree
  const root = buildEventTree(events);

  // Calculate stats
  const totalLines = content.split('\n').length;
  const stats: ParseStats = {
    totalLines,
    parsedLines: tokens.length,
    failedLines: totalLines - tokens.length - failedTokens,
    eventCount: events.length,
    eventsByType,
    parseDurationMs: Date.now() - startTime,
  };

  // Calculate confidence
  const parseConfidence = calculateParseConfidence(stats, truncation);

  const parsedLog: ParsedLog = {
    events,
    root,
    metadata,
    truncation,
    confidence: parseConfidence,
    stats,
  };

  return ok(parsedLog);
}

// ============================================================================
// Options & Types
// ============================================================================

/**
 * Parser options
 */
export interface ParseOptions {
  /** Stop parsing after this many events */
  maxEvents?: number;
  /** Include continuation lines in event data */
  includeContinuations?: boolean;
  /** Skip building the tree (flat events only) */
  skipTree?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect if the log was truncated
 */
function detectTruncation(content: string, events: EventNode[]): TruncationInfo | undefined {
  // Check for explicit truncation markers
  const truncationMarkers = [
    '*** Skipped',
    '*** Truncated',
    '...Maximum Debug Log Size Reached...',
    'MAXIMUM DEBUG LOG SIZE REACHED',
  ];

  const hasTruncationMarker = truncationMarkers.some((marker) =>
    content.includes(marker)
  );

  // Check for size-based truncation using centralized constants
  const truncationThreshold = PARSER_LIMITS.SF_TRUNCATION_THRESHOLD * PARSER_LIMITS.TRUNCATION_DETECTION_PERCENT;
  const isSizeLimit = content.length >= truncationThreshold;

  // Check for abrupt ending (no proper close events)
  const hasProperEnding = events.some(
    (e) =>
      e.type === 'EXECUTION_FINISHED' ||
      e.type === 'CUMULATIVE_LIMIT_USAGE_END'
  );

  if (!hasTruncationMarker && !isSizeLimit && hasProperEnding) {
    return undefined;
  }

  // Find last complete event
  let lastCompleteEventId: number | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    // Consider events with durations as "complete"
    if (event && event.duration !== undefined) {
      lastCompleteEventId = event.id;
      break;
    }
  }

  let truncationType: TruncationInfo['truncationType'] = 'UNKNOWN';
  if (isSizeLimit) {
    truncationType = 'SIZE_LIMIT';
  } else if (hasTruncationMarker) {
    truncationType = content.includes('Skipped') ? 'LINE_LIMIT' : 'SIZE_LIMIT';
  }

  return {
    isTruncated: true,
    truncationType,
    lastCompleteEventId,
    warning:
      'This log appears to be truncated. Some events may be missing. ' +
      'Critical information like stack traces at the end may be lost.',
  };
}

/**
 * Calculate overall parse confidence
 */
function calculateParseConfidence(
  stats: ParseStats,
  truncation?: TruncationInfo
): Confidence {
  const reasons: string[] = [];
  const limitations: string[] = [];

  // Base score from parse success rate
  const parseRate = stats.parsedLines / stats.totalLines;
  let score = parseRate;

  if (parseRate >= 0.9) {
    reasons.push(`${(parseRate * 100).toFixed(1)}% of lines parsed successfully`);
  } else if (parseRate >= 0.7) {
    reasons.push(`${(parseRate * 100).toFixed(1)}% of lines parsed`);
    limitations.push('Some lines could not be parsed');
  } else {
    limitations.push(`Only ${(parseRate * 100).toFixed(1)}% of lines parsed`);
    score *= 0.8;
  }

  // Penalty for truncation
  if (truncation?.isTruncated) {
    score *= 0.7;
    limitations.push('Log was truncated - some events may be missing');
  }

  // Bonus for having diverse event types
  const typeCount = Object.keys(stats.eventsByType).length;
  if (typeCount >= 5) {
    reasons.push(`Found ${typeCount} different event types`);
  }

  return confidence(Math.max(0.1, Math.min(1, score)), reasons, limitations.length > 0 ? limitations : undefined);
}

// ============================================================================
// Streaming Parser (Memory-Efficient)
// ============================================================================

/**
 * Streaming event result - either an event or parse metadata
 */
export interface StreamEvent {
  type: 'event' | 'metadata' | 'truncation' | 'complete';
  event?: EventNode;
  metadata?: LogMetadata;
  truncation?: TruncationInfo;
  stats?: Partial<ParseStats>;
}

/**
 * Parse a log file in streaming mode (memory-efficient)
 * 
 * This generator yields events one at a time without building a full tree.
 * Use this for:
 * - Large logs (>10MB)
 * - Memory-constrained environments
 * - When you only need to iterate through events once
 * 
 * Limitations:
 * - Does not build event tree (parentId tracking only)
 * - Does not calculate full parse confidence
 * - Stats are estimated, not exact
 * 
 * @param lines - Iterable of log lines
 * @param options - Parser options
 * @yields StreamEvent objects containing parsed events
 * 
 * @example
 * // Parse from file line-by-line
 * for (const result of parseLogStream(lines)) {
 *   if (result.type === 'event' && result.event) {
 *     processEvent(result.event);
 *   }
 * }
 */
export function* parseLogStream(
  lines: Iterable<string>,
  options: ParseOptions = {}
): Generator<StreamEvent, void, undefined> {
  const context = createParseContext();
  const eventsByType: Record<string, number> = {};
  let eventCount = 0;
  let lineCount = 0;
  let parsedLines = 0;
  const headerLines: string[] = [];

  // We need to iterate over raw lines first to capture headers,
  // then pass to tokenizer. Use a peekable approach.
  const lineIterator = lines[Symbol.iterator]();
  const bufferedLines: string[] = [];
  
  // Capture first 5 lines for header parsing
  for (let i = 0; i < 5; i++) {
    const result = lineIterator.next();
    if (result.done) break;
    bufferedLines.push(result.value);
    headerLines.push(result.value);
  }
  
  // Parse header metadata from captured lines
  const headerContent = headerLines.join('\n');
  const headerInfo = parseLogHeader(headerContent);
  
  yield {
    type: 'metadata',
    metadata: {
      apiVersion: headerInfo.apiVersion,
      debugLevels: headerInfo.debugLevels,
    },
  };
  
  // Create a combined iterator: buffered lines + remaining lines
  function* combinedLines(): Generator<string> {
    for (const line of bufferedLines) {
      yield line;
    }
    let result = lineIterator.next();
    while (!result.done) {
      yield result.value;
      result = lineIterator.next();
    }
  }

  for (const token of tokenizeLogStream(combinedLines())) {
    lineCount = token.lineNumber;

    const event = handleToken(token, context);

    if (event) {
      eventCount++;
      parsedLines++;
      updateParseContext(context, event);
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;

      yield {
        type: 'event',
        event,
      };

      // Check max events limit
      if (options.maxEvents && eventCount >= options.maxEvents) {
        break;
      }
    }
  }

  // Yield final stats
  yield {
    type: 'complete',
    stats: {
      totalLines: lineCount,
      parsedLines,
      eventCount,
      eventsByType,
    },
  };
}

/**
 * Async streaming parser for file streams
 * 
 * @param lines - Async iterable of log lines (e.g., readline interface)
 * @param options - Parser options
 * @yields StreamEvent objects containing parsed events
 * 
 * @example
 * const rl = readline.createInterface({ input: fs.createReadStream('large.log') });
 * for await (const result of parseLogStreamAsync(rl)) {
 *   if (result.type === 'event') processEvent(result.event);
 * }
 */
export async function* parseLogStreamAsync(
  lines: AsyncIterable<string>,
  options: ParseOptions = {}
): AsyncGenerator<StreamEvent, void, undefined> {
  const context = createParseContext();
  const eventsByType: Record<string, number> = {};
  let eventCount = 0;
  let lineCount = 0;
  let parsedLines = 0;

  yield {
    type: 'metadata',
    metadata: {},
  };

  for await (const token of tokenizeLogStreamAsync(lines)) {
    lineCount = token.lineNumber;

    const event = handleToken(token, context);

    if (event) {
      eventCount++;
      parsedLines++;
      updateParseContext(context, event);
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;

      yield {
        type: 'event',
        event,
      };

      if (options.maxEvents && eventCount >= options.maxEvents) {
        break;
      }
    }
  }

  yield {
    type: 'complete',
    stats: {
      totalLines: lineCount,
      parsedLines,
      eventCount,
      eventsByType,
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

// Re-export from submodules
export { 
  tokenizeLog, 
  tokenizeLine, 
  tokenizeLineFast,
  tokenizeLogStream,
  tokenizeLogStreamAsync,
  parseLogHeader, 
  isContinuationLine 
} from './tokenizer';
export { buildEventTree, createParseContext, updateParseContext, flattenEventTree, getTreeDepth } from './ast-builder';
export * from './event-handlers';
