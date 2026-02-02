/**
 * @module output/formatters/jsonl-formatter
 * @description JSONL (JSON Lines) streaming formatter for memory-efficient output
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 * 
 * JSONL FORMAT:
 * Each line is a valid JSON object, enabling:
 * - Streaming writes (no need to hold entire output in memory)
 * - Streaming reads (process line-by-line)
 * - Easy concatenation of multiple outputs
 * - Better error recovery (one bad line doesn't break everything)
 */

import type { ParsedLog, EventNode, ParseStats, LogMetadata } from '../../types/events';
import type { AnalysisResult } from '../../analyzer';
import type { JSONFormatOptions } from './types';
import { DEFAULT_OPTIONS } from './types';
import { formatEvent } from './event-formatter';
import { formatIssue } from './issue-formatter';
import { buildOutputSummary, buildAIContext } from './summary-builder';

// ============================================================================
// JSONL Record Types
// ============================================================================

/**
 * JSONL record type discriminator
 */
export type JSONLRecordType = 'header' | 'summary' | 'event' | 'issue' | 'aiContext' | 'footer';

/**
 * Base JSONL record
 */
export interface JSONLRecord {
  recordType: JSONLRecordType;
}

/**
 * Header record (first line)
 */
export interface JSONLHeader extends JSONLRecord {
  recordType: 'header';
  version: string;
  generatedAt: string;
  metadata?: LogMetadata;
  stats?: ParseStats;
}

/**
 * Footer record (last line)
 */
export interface JSONLFooter extends JSONLRecord {
  recordType: 'footer';
  eventCount: number;
  issueCount: number;
  complete: boolean;
}

// ============================================================================
// Streaming Generator
// ============================================================================

/**
 * Generate JSONL output as a generator (memory-efficient)
 * 
 * @param parsedLog - Parsed log data
 * @param analysis - Analysis result
 * @param options - Formatting options
 * @yields JSON string for each line
 * 
 * @example
 * // Stream to file
 * const stream = fs.createWriteStream('output.jsonl');
 * for (const line of generateJSONL(parsedLog, analysis)) {
 *   stream.write(line + '\n');
 * }
 * stream.end();
 */
export function* generateJSONL(
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  options: JSONFormatOptions = {}
): Generator<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Header line
  yield JSON.stringify({
    recordType: 'header',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: opts.includeMetadata ? parsedLog.metadata : undefined,
    stats: opts.includeStats ? parsedLog.stats : undefined,
  } satisfies JSONLHeader);

  // Summary line
  yield JSON.stringify({
    recordType: 'summary',
    ...buildOutputSummary(analysis),
  });

  // Event lines (streamed one by one)
  if (opts.includeEvents) {
    let events = parsedLog.events;
    
    if (opts.eventTypes.length > 0) {
      events = events.filter(e => opts.eventTypes.includes(e.type));
    }
    
    let count = 0;
    for (const event of events) {
      if (count >= opts.maxEvents) break;
      
      const formatted = formatEvent(event);
      yield JSON.stringify({
        recordType: 'event',
        ...formatted,
      });
      count++;
    }
  }

  // Issue lines
  if (opts.includeIssues) {
    let issues = analysis.issues;
    
    if (opts.severities.length > 0) {
      issues = issues.filter(i => opts.severities.includes(i.severity));
    }
    if (opts.categories.length > 0) {
      issues = issues.filter(i => opts.categories.includes(i.category));
    }
    
    let count = 0;
    for (const issue of issues) {
      if (count >= opts.maxIssues) break;
      
      const formatted = formatIssue(issue, opts.includeConfidence);
      yield JSON.stringify({
        recordType: 'issue',
        ...formatted,
      });
      count++;
    }
  }

  // AI Context line
  if (opts.includeAIContext) {
    yield JSON.stringify({
      recordType: 'aiContext',
      ...buildAIContext(parsedLog, analysis),
    });
  }

  // Footer line
  yield JSON.stringify({
    recordType: 'footer',
    eventCount: opts.includeEvents ? Math.min(parsedLog.events.length, opts.maxEvents) : 0,
    issueCount: opts.includeIssues ? Math.min(analysis.issues.length, opts.maxIssues) : 0,
    complete: true,
  } satisfies JSONLFooter);
}

// ============================================================================
// Async Streaming Generator
// ============================================================================

/**
 * Async generator for JSONL output (for very large logs)
 * 
 * @param parsedLog - Parsed log data
 * @param analysis - Analysis result
 * @param options - Formatting options
 * @yields JSON string for each line
 */
export async function* generateJSONLAsync(
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  options: JSONFormatOptions = {}
): AsyncGenerator<string> {
  for (const line of generateJSONL(parsedLog, analysis, options)) {
    yield line;
  }
}

// ============================================================================
// Event-Only Streaming
// ============================================================================

/**
 * Stream events as JSONL (for piping directly from parser)
 * 
 * @param events - Event generator or array
 * @param maxEvents - Maximum events to emit
 * @yields JSON string for each event
 */
export function* streamEventsJSONL(
  events: Iterable<EventNode>,
  maxEvents: number = 10000
): Generator<string> {
  let count = 0;
  
  // Header
  yield JSON.stringify({
    recordType: 'header',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    streamType: 'events-only',
  });

  for (const event of events) {
    if (count >= maxEvents) break;
    
    yield JSON.stringify({
      recordType: 'event',
      ...formatEvent(event),
    });
    count++;
  }

  // Footer
  yield JSON.stringify({
    recordType: 'footer',
    eventCount: count,
    complete: count < maxEvents,
  });
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Convert JSONL generator to string
 * 
 * @param parsedLog - Parsed log data
 * @param analysis - Analysis result
 * @param options - Formatting options
 * @returns JSONL string (newline-separated)
 */
export function formatJSONL(
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  options: JSONFormatOptions = {}
): string {
  const lines: string[] = [];
  for (const line of generateJSONL(parsedLog, analysis, options)) {
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Parse a JSONL string back to records
 * 
 * @param jsonl - JSONL string
 * @returns Array of parsed records
 */
export function parseJSONL<T = unknown>(jsonl: string): T[] {
  return jsonl
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as T);
}
