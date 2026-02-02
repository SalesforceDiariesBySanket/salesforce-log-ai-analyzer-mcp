/**
 * @module output/json-formatter
 * @description Format ParsedLog and AnalysisResult as JSON with various options
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts, src/analyzer/index.ts
 * @lastModified 2026-01-31
 */

import type { ParsedLog, EventNode, LogMetadata, ParseStats } from '../types/events';
import type { Issue, IssueCategory, IssueSeverity } from '../types/issues';
import type { AnalysisResult } from '../analyzer';

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
const DEFAULT_OPTIONS: Required<JSONFormatOptions> = {
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

// ============================================================================
// Main Formatters
// ============================================================================

/**
 * Format parsed log and analysis result as JSON
 * 
 * @param parsedLog - Parsed log data
 * @param analysis - Analysis result
 * @param options - Formatting options
 * @returns JSON string
 * 
 * @example
 * const json = formatJSON(parsedLog, analysis);
 * await fs.writeFile('output.json', json);
 */
export function formatJSON(
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  options: JSONFormatOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const output = buildJSONOutput(parsedLog, analysis, opts);

  if (opts.redact) {
    redactSensitiveData(output, opts.redactionPatterns);
  }

  return JSON.stringify(output, null, opts.indent || undefined);
}

/**
 * Format as JSON object (not stringified)
 */
export function formatJSONObject(
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  options: JSONFormatOptions = {}
): JSONOutput {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const output = buildJSONOutput(parsedLog, analysis, opts);

  if (opts.redact) {
    redactSensitiveData(output, opts.redactionPatterns);
  }

  return output;
}

/**
 * Format summary only (minimal JSON)
 */
export function formatSummaryJSON(
  analysis: AnalysisResult,
  options: { indent?: number } = {}
): string {
  const summary = buildOutputSummary(analysis);
  return JSON.stringify(summary, null, options.indent ?? 2);
}

/**
 * Format issues only
 */
export function formatIssuesJSON(
  analysis: AnalysisResult,
  options: JSONFormatOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let issues = analysis.issues;

  // Apply filters
  if (opts.severities.length > 0) {
    issues = issues.filter(i => opts.severities.includes(i.severity));
  }
  if (opts.categories.length > 0) {
    issues = issues.filter(i => opts.categories.includes(i.category));
  }

  // Apply limit
  issues = issues.slice(0, opts.maxIssues);

  const outputIssues = issues.map(i => formatIssue(i, opts.includeConfidence));
  return JSON.stringify(outputIssues, null, opts.indent || undefined);
}

/**
 * Format events only
 */
export function formatEventsJSON(
  parsedLog: ParsedLog,
  options: JSONFormatOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let events = parsedLog.events;

  // Apply type filter
  if (opts.eventTypes.length > 0) {
    events = events.filter(e => opts.eventTypes.includes(e.type));
  }

  // Apply limit
  events = events.slice(0, opts.maxEvents);

  const compactEvents = events.map(e => formatEvent(e));
  return JSON.stringify(compactEvents, null, opts.indent || undefined);
}

// ============================================================================
// Builder Functions
// ============================================================================

/**
 * Build complete JSON output
 */
function buildJSONOutput(
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  opts: Required<JSONFormatOptions>
): JSONOutput {
  const output: JSONOutput = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    summary: buildOutputSummary(analysis),
  };

  // Metadata
  if (opts.includeMetadata) {
    output.metadata = parsedLog.metadata;
  }

  // Stats
  if (opts.includeStats) {
    output.stats = parsedLog.stats;
  }

  // Events
  if (opts.includeEvents) {
    let events = parsedLog.events;

    // Apply type filter
    if (opts.eventTypes.length > 0) {
      events = events.filter(e => opts.eventTypes.includes(e.type));
    }

    // Apply limit
    events = events.slice(0, opts.maxEvents);

    output.events = events.map(e => formatEvent(e));
  }

  // Issues
  if (opts.includeIssues) {
    let issues = analysis.issues;

    // Apply severity filter
    if (opts.severities.length > 0) {
      issues = issues.filter(i => opts.severities.includes(i.severity));
    }

    // Apply category filter
    if (opts.categories.length > 0) {
      issues = issues.filter(i => opts.categories.includes(i.category));
    }

    // Apply limit
    issues = issues.slice(0, opts.maxIssues);

    output.issues = issues.map(i => formatIssue(i, opts.includeConfidence));
  }

  // AI Context
  if (opts.includeAIContext) {
    output.aiContext = buildAIContext(parsedLog, analysis);
  }

  return output;
}

/**
 * Build output summary
 */
function buildOutputSummary(analysis: AnalysisResult): OutputSummary {
  const { summary } = analysis;

  return {
    health: summary.healthScore,
    totalIssues: summary.totalCount,
    bySeverity: summary.bySeverity as Record<string, number>,
    byCategory: summary.byCategory as Record<string, number>,
    status: summary.oneLiner,
  };
}

/**
 * Format single event to compact form
 */
function formatEvent(event: EventNode): CompactEvent {
  const compact: CompactEvent = {
    id: event.id,
    type: event.type,
    line: event.lineNumber,
    ts: event.timestamp,
  };

  if (event.duration !== undefined) {
    compact.dur = event.duration;
  }

  if (event.namespace) {
    compact.ns = event.namespace;
  }

  // Add type-specific data
  const data: Record<string, unknown> = {};

  // SOQL events
  if ('query' in event && event.query) {
    data.query = event.query;
  }
  if ('rowCount' in event && event.rowCount !== undefined) {
    data.rows = event.rowCount;
  }

  // DML events
  if ('operation' in event) {
    data.op = event.operation;
  }
  if ('sobjectType' in event) {
    data.sobj = event.sobjectType;
  }

  // Method events
  if ('methodName' in event) {
    data.method = event.methodName;
  }
  if ('className' in event) {
    data.class = event.className;
  }

  // Exception events
  if ('exceptionType' in event) {
    data.exType = event.exceptionType;
  }
  if ('message' in event && typeof event.message === 'string') {
    data.msg = event.message;
  }

  if (Object.keys(data).length > 0) {
    compact.data = data;
  }

  return compact;
}

/**
 * Format single issue
 */
function formatIssue(issue: Issue, includeConfidence: boolean): OutputIssue {
  const output: OutputIssue = {
    id: issue.id,
    type: issue.type,
    category: issue.category,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    events: issue.eventIds,
    lines: issue.lineNumbers,
    canFix: issue.attribution.canModify,
    recommendations: issue.recommendations,
  };

  if (includeConfidence) {
    output.confidence = issue.confidence.score;
  }

  if (issue.attribution.namespace) {
    output.namespace = issue.attribution.namespace;
  }

  return output;
}

/**
 * Build AI context
 */
function buildAIContext(parsedLog: ParsedLog, analysis: AnalysisResult): AIOutputContext {
  // Collect namespaces
  const namespaces = new Set<string>();
  for (const event of parsedLog.events) {
    if (event.namespace) {
      namespaces.add(event.namespace);
    }
  }

  // Generate next steps
  const nextSteps: string[] = [];

  if (analysis.summary.bySeverity.CRITICAL > 0) {
    nextSteps.push('Address critical issues immediately');
  }

  const topCategory = Object.entries(analysis.summary.byCategory)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    [0];

  if (topCategory) {
    const categoryAdvice: Record<string, string> = {
      PERFORMANCE: 'Review performance hotspots and optimize slow code paths',
      GOVERNOR_LIMITS: 'Refactor code to reduce resource consumption',
      ERROR: 'Investigate and fix error conditions',
      ANTI_PATTERN: 'Refactor anti-patterns to follow Salesforce best practices',
      SECURITY: 'Review security concerns and implement proper input validation',
      DATA_QUALITY: 'Add null checks and data validation',
      BEST_PRACTICE: 'Consider implementing best practice patterns',
      MANAGED_PACKAGE: 'Contact vendor support for managed package issues',
    };

    const advice = categoryAdvice[topCategory[0]];
    if (advice) {
      nextSteps.push(advice);
    }
  }

  return {
    confidence: parsedLog.confidence.score,
    confidenceReasons: parsedLog.confidence.reasons,
    limitations: parsedLog.confidence.limitations || [],
    truncated: parsedLog.truncation?.isTruncated ?? false,
    namespaces: Array.from(namespaces),
    nextSteps,
  };
}

// ============================================================================
// Redaction
// ============================================================================

/**
 * Default sensitive patterns
 */
const DEFAULT_REDACTION_PATTERNS: RegExp[] = [
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Phone numbers
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  // Salesforce IDs (15 or 18 char)
  /\b[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?\b/g,
  // Credit card patterns
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  // SSN patterns
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
];

/**
 * Redact sensitive data from output
 */
function redactSensitiveData(
  output: JSONOutput,
  customPatterns: RegExp[]
): void {
  const patterns = [...DEFAULT_REDACTION_PATTERNS, ...customPatterns];

  // Redact string recursively
  const redactValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
      let redacted = value;
      for (const pattern of patterns) {
        redacted = redacted.replace(pattern, '[REDACTED]');
      }
      return redacted;
    }

    if (Array.isArray(value)) {
      return value.map(redactValue);
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const redactedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        redactedObj[key] = redactValue(val);
      }
      return redactedObj;
    }

    return value;
  };

  // Redact events
  if (output.events) {
    output.events = output.events.map(e => redactValue(e) as CompactEvent);
  }

  // Redact issues
  if (output.issues) {
    output.issues = output.issues.map(i => redactValue(i) as OutputIssue);
  }
}

// ============================================================================
// Streaming JSON
// ============================================================================

/**
 * Generate JSON lines format (JSONL) for streaming
 * Each line is a valid JSON object
 */
export function* generateJSONL(
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  options: JSONFormatOptions = {}
): Generator<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Header line
  yield JSON.stringify({
    type: 'header',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: opts.includeMetadata ? parsedLog.metadata : undefined,
  });

  // Summary line
  yield JSON.stringify({
    type: 'summary',
    ...buildOutputSummary(analysis),
  });

  // Event lines
  if (opts.includeEvents) {
    let events = parsedLog.events;
    
    if (opts.eventTypes.length > 0) {
      events = events.filter(e => opts.eventTypes.includes(e.type));
    }
    
    events = events.slice(0, opts.maxEvents);

    for (const event of events) {
      const formatted = formatEvent(event);
      yield JSON.stringify({
        recordType: 'event',
        ...formatted,
      });
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
    
    issues = issues.slice(0, opts.maxIssues);

    for (const issue of issues) {
      const formatted = formatIssue(issue, opts.includeConfidence);
      yield JSON.stringify({
        recordType: 'issue',
        ...formatted,
      });
    }
  }

  // AI Context line
  if (opts.includeAIContext) {
    yield JSON.stringify({
      type: 'aiContext',
      ...buildAIContext(parsedLog, analysis),
    });
  }

  // Footer line
  yield JSON.stringify({
    type: 'footer',
    eventCount: opts.includeEvents ? Math.min(parsedLog.events.length, opts.maxEvents) : 0,
    issueCount: opts.includeIssues ? Math.min(analysis.issues.length, opts.maxIssues) : 0,
  });
}

/**
 * Convert JSONL generator to string
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

// ============================================================================
// Exports
// ============================================================================

export { DEFAULT_OPTIONS as defaultJSONOptions };
