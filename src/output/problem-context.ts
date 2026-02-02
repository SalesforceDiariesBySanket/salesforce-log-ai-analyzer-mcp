/**
 * @module output/problem-context
 * @description Build AI-optimized problem context (<2000 tokens per issue)
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts, src/analyzer/index.ts
 * @lastModified 2026-02-01
 */

import type {
  EventNode,
  ParsedLog,
  SOQLEvent,
  DMLEvent,
  MethodEvent,
  ExceptionEvent,
} from '../types/events';
import type { Issue, IssueCategory } from '../types/issues';
import type { AnalysisResult } from '../analyzer';

// ============================================================================
// Type Guards
// ============================================================================

/** Type guard for SOQL events */
function isSOQLEvent(event: EventNode): event is SOQLEvent {
  return event.type === 'SOQL_EXECUTE_BEGIN' || 
         event.type === 'SOQL_EXECUTE_END' || 
         event.type === 'SOQL_EXECUTE_EXPLAIN';
}

/** Type guard for DML events */
function isDMLEvent(event: EventNode): event is DMLEvent {
  return event.type === 'DML_BEGIN' || event.type === 'DML_END';
}

/** Type guard for Method events */
function isMethodEvent(event: EventNode): event is MethodEvent {
  return event.type === 'METHOD_ENTRY' || 
         event.type === 'METHOD_EXIT' ||
         event.type === 'CONSTRUCTOR_ENTRY' ||
         event.type === 'CONSTRUCTOR_EXIT';
}

/** Type guard for Exception events */
function isExceptionEvent(event: EventNode): event is ExceptionEvent {
  return event.type === 'EXCEPTION_THROWN' || event.type === 'FATAL_ERROR';
}

// ============================================================================
// Constants & Configuration
// ============================================================================

/**
 * Default token limits (conservative for older models)
 * Can be overridden via ContextOptions for larger context windows
 */
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_CHARS_PER_TOKEN = 3.5;

/**
 * Configuration options for context generation
 * Allows callers to utilize full model context windows (e.g., 128k for GPT-4)
 */
export interface ContextOptions {
  /** Maximum tokens per context (default: 2000, increase for modern models) */
  maxTokens?: number;
  
  /** Chars per token estimate (default: 3.5, adjust for code-heavy content) */
  charsPerToken?: number;
  
  /** Include code snippets in context */
  includeCodeSnippets?: boolean;
  
  /** Include verbose guidance */
  verboseGuidance?: boolean;
}

const DEFAULT_OPTIONS: Required<ContextOptions> = {
  maxTokens: DEFAULT_MAX_TOKENS,
  charsPerToken: DEFAULT_CHARS_PER_TOKEN,
  includeCodeSnippets: true,
  verboseGuidance: true,
};

// ============================================================================
// Problem Context Types
// ============================================================================

/**
 * Complete problem context for a single issue
 * Designed to fit within 2000 tokens for AI consumption
 */
export interface ProblemContext {
  /** Context ID */
  id: string;

  /** Header with quick summary */
  header: ContextHeader;

  /** Issue details */
  issue: IssueContext;

  /** Relevant events (summarized) */
  events: EventContext;

  /** Code snippet if available */
  codeSnippet?: CodeSnippetContext;

  /** AI guidance */
  guidance: GuidanceContext;

  /** Estimated token count */
  tokenCount: number;
}

/**
 * Context header
 */
export interface ContextHeader {
  /** One-line problem summary */
  summary: string;

  /** Severity indicator */
  severity: string;

  /** Can the user fix this? */
  fixable: boolean;

  /** Primary affected component */
  component?: string;
}

/**
 * Issue context details
 */
export interface IssueContext {
  /** Issue type */
  type: string;

  /** Category */
  category: IssueCategory;

  /** Full description */
  description: string;

  /** Impact explanation */
  impact: string;

  /** Confidence indicator */
  confidence: string;

  /** Attribution */
  attribution: string;
}

/**
 * Relevant events context
 */
export interface EventContext {
  /** Number of related events */
  count: number;

  /** Key events (most relevant) */
  keyEvents: CompactEventSummary[];

  /** Timeline summary */
  timeline?: string;

  /** Pattern detected */
  pattern?: string;
}

/**
 * Compact event for context
 */
export interface CompactEventSummary {
  /** Event type */
  type: string;

  /** Line number */
  line: number;

  /** Brief description */
  brief: string;

  /** Key data point */
  keyData?: string;
}

/**
 * Code snippet context
 */
export interface CodeSnippetContext {
  /** File or class name */
  location: string;

  /** Line range */
  lines: string;

  /** The code snippet */
  code: string;

  /** What to look for */
  highlight: string;
}

/**
 * Guidance context
 */
export interface GuidanceContext {
  /** Root cause explanation */
  rootCause: string;

  /** Recommended fix */
  recommendedFix: string;

  /** Fix patterns */
  fixPatterns: string[];

  /** What the AI can help with */
  aiCanHelp: string[];

  /** What the AI cannot help with */
  aiCannotHelp: string[];
}

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build problem context for an issue
 * 
 * Creates an AI-optimized context containing:
 * - Issue summary and details
 * - Relevant events
 * - Code context
 * - Fix guidance
 * 
 * @param issue - The issue to build context for
 * @param parsedLog - Full parsed log
 * @param analysis - Analysis result
 * @param options - Configuration options (token limits, verbosity)
 * @returns Problem context within configured token limit
 * 
 * @example
 * // Default: 2000 token limit (safe for older models)
 * const context = buildProblemContext(issue, parsedLog, analysis);
 * 
 * // For GPT-4/Claude with large context windows:
 * const context = buildProblemContext(issue, parsedLog, analysis, { maxTokens: 8000 });
 */
export function buildProblemContext(
  issue: Issue,
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  options: ContextOptions = {}
): ProblemContext {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Build each section
  const header = buildHeader(issue);
  const issueContext = buildIssueContext(issue);
  const events = buildEventContext(issue, parsedLog);
  const codeSnippet = opts.includeCodeSnippets ? buildCodeSnippetContext(issue) : undefined;
  const guidance = buildGuidanceContext(issue, analysis);

  const context: ProblemContext = {
    id: `ctx-${issue.id}`,
    header,
    issue: issueContext,
    events,
    codeSnippet,
    guidance,
    tokenCount: 0,
  };

  // Calculate token count
  context.tokenCount = estimateTokens(context, opts.charsPerToken);

  // Trim if necessary
  if (context.tokenCount > opts.maxTokens) {
    return trimContext(context, opts.maxTokens, opts.charsPerToken);
  }

  return context;
}

/**
 * Build problem contexts for all issues
 */
export function buildAllProblemContexts(
  issues: Issue[],
  parsedLog: ParsedLog,
  analysis: AnalysisResult,
  options: ContextOptions = {}
): ProblemContext[] {
  return issues.map(issue => buildProblemContext(issue, parsedLog, analysis, options));
}

/**
 * Build context for top N issues
 */
export function buildTopIssueContexts(
  analysis: AnalysisResult,
  parsedLog: ParsedLog,
  count: number = 3,
  options: ContextOptions = {}
): ProblemContext[] {
  const topIssues = analysis.issues.slice(0, count);
  return buildAllProblemContexts(topIssues, parsedLog, analysis, options);
}

// ============================================================================
// Section Builders
// ============================================================================

/**
 * Build header section
 */
function buildHeader(issue: Issue): ContextHeader {
  return {
    summary: issue.title,
    severity: issue.severity,
    fixable: issue.attribution.canModify,
    component: extractComponent(issue),
  };
}

/**
 * Build issue context section
 */
function buildIssueContext(issue: Issue): IssueContext {
  return {
    type: issue.type.replace(/_/g, ' '),
    category: issue.category,
    description: truncate(issue.description, 200),
    impact: generateImpactStatement(issue),
    confidence: `${Math.round(issue.confidence.score * 100)}% (${issue.confidence.reasons[0] || 'detected'})`,
    attribution: generateAttributionStatement(issue),
  };
}

/**
 * Build event context section
 */
function buildEventContext(issue: Issue, parsedLog: ParsedLog): EventContext {
  // Get related events
  const eventMap = new Map(parsedLog.events.map(e => [e.id, e]));
  const relatedEvents = issue.eventIds
    .map(id => eventMap.get(id))
    .filter((e): e is EventNode => e !== undefined);

  // Build key events (max 5)
  const keyEvents = relatedEvents.slice(0, 5).map(e => summarizeEvent(e));

  // Generate timeline
  const timeline = relatedEvents.length > 1 ? generateTimeline(relatedEvents) : undefined;

  // Detect pattern
  const pattern = detectPattern(relatedEvents, issue);

  return {
    count: relatedEvents.length,
    keyEvents,
    timeline,
    pattern,
  };
}

/**
 * Build code snippet context
 */
function buildCodeSnippetContext(issue: Issue): CodeSnippetContext | undefined {
  const aiContext = issue.aiContext;

  // Use code snippet from issue if available
  if (aiContext.codeSnippet) {
    return {
      location: extractLocation(issue),
      lines: formatLineRange(issue.lineNumbers),
      code: truncate(aiContext.codeSnippet, 300),
      highlight: getHighlightInstruction(issue),
    };
  }

  // Try to construct from event summaries
  if (aiContext.relevantEvents.length > 0) {
    const firstEvent = aiContext.relevantEvents[0];
    if (firstEvent) {
      return {
        location: `Line ${firstEvent.line}`,
        lines: formatLineRange(issue.lineNumbers),
        code: `// ${firstEvent.summary}`,
        highlight: getHighlightInstruction(issue),
      };
    }
  }

  return undefined;
}

/**
 * Build guidance context
 */
function buildGuidanceContext(issue: Issue, _analysis: AnalysisResult): GuidanceContext {
  const fixPatterns = issue.aiContext.fixPatterns || [];

  return {
    rootCause: generateRootCauseExplanation(issue),
    recommendedFix: issue.recommendations[0] || 'Review the affected code',
    fixPatterns: fixPatterns.slice(0, 2).map(p => `${p.name}: ${p.description}`),
    aiCanHelp: generateAICanHelp(issue),
    aiCannotHelp: generateAICannotHelp(issue),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract component name from issue
 */
function extractComponent(issue: Issue): string | undefined {
  // Try to get from event summaries
  for (const event of issue.aiContext.relevantEvents) {
    if (event.summary.includes('.')) {
      const parts = event.summary.split('.');
      return parts[0];
    }
  }
  return undefined;
}

/**
 * Generate impact statement
 */
function generateImpactStatement(issue: Issue): string {
  const metrics = issue.aiContext.metrics;

  switch (issue.category) {
    case 'PERFORMANCE':
      if (metrics?.performanceImpactMs) {
        return `Performance impact: ${metrics.performanceImpactMs}ms`;
      }
      return 'May cause slow execution';

    case 'GOVERNOR_LIMITS':
      if (metrics?.limitPercentage) {
        return `Using ${metrics.limitPercentage}% of governor limit`;
      }
      return 'Risks hitting governor limits';

    case 'ANTI_PATTERN':
      if (metrics?.occurrences) {
        return `Detected ${metrics.occurrences} occurrences`;
      }
      return 'Violates Salesforce best practices';

    case 'ERROR':
      return 'Causes runtime errors';

    case 'SECURITY':
      return 'Potential security vulnerability';

    case 'DATA_QUALITY':
      return 'May cause data issues';

    case 'MANAGED_PACKAGE':
      return 'Issue in managed package code';

    default:
      return 'May impact application behavior';
  }
}

/**
 * Generate attribution statement
 */
function generateAttributionStatement(issue: Issue): string {
  const { attribution, namespace, canModify } = issue.attribution;

  switch (attribution) {
    case 'USER_CODE':
      return 'Your code - you can fix this directly';
    case 'MANAGED_PACKAGE':
      return `Managed package (${namespace || 'unknown'}) - cannot modify directly`;
    case 'BOUNDARY':
      return `Integration point with ${namespace || 'external code'} - review your inputs`;
    case 'PLATFORM':
      return 'Salesforce platform behavior - may need workaround';
    default:
      return canModify ? 'Source uncertain - likely your code' : 'Source uncertain - may be external';
  }
}

/**
 * Summarize a single event
 */
function summarizeEvent(event: EventNode): CompactEventSummary {
  const summary: CompactEventSummary = {
    type: event.type,
    line: event.lineNumber,
    brief: generateEventBrief(event),
  };

  // Add key data point
  const keyData = extractKeyData(event);
  if (keyData) {
    summary.keyData = keyData;
  }

  return summary;
}

/**
 * Generate brief description for event
 */
function generateEventBrief(event: EventNode): string {
  // Use type guards for proper type narrowing
  if (isSOQLEvent(event)) {
    if (event.type === 'SOQL_EXECUTE_BEGIN') {
      return 'SOQL query executed';
    }
    return `Query returned ${event.rowCount ?? '?'} rows`;
  }

  if (isDMLEvent(event)) {
    if (event.type === 'DML_BEGIN') {
      return `${event.operation ?? 'DML'} on ${event.sobjectType ?? 'object'}`;
    }
    return `DML affected ${event.rowCount ?? '?'} rows`;
  }

  if (isMethodEvent(event)) {
    const action = event.type === 'METHOD_ENTRY' || event.type === 'CONSTRUCTOR_ENTRY' 
      ? 'Entered' 
      : 'Exited';
    return `${action} ${event.methodName ?? 'method'}`;
  }

  if (isExceptionEvent(event)) {
    if (event.type === 'EXCEPTION_THROWN') {
      return `Exception: ${event.exceptionType ?? 'error'}`;
    }
    return `Fatal: ${event.message ?? 'error'}`;
  }

  if (event.type === 'LIMIT_USAGE') {
    return 'Limit checkpoint';
  }

  return event.type.replace(/_/g, ' ').toLowerCase();
}

/**
 * Extract key data from event
 */
function extractKeyData(event: EventNode): string | undefined {
  if ('query' in event && event.query) {
    return truncate(event.query, 50);
  }
  if ('message' in event && typeof event.message === 'string') {
    return truncate(event.message, 50);
  }
  if ('methodName' in event && event.methodName) {
    return event.methodName;
  }
  return undefined;
}

/**
 * Generate timeline summary
 */
function generateTimeline(events: EventNode[]): string {
  if (events.length < 2) return '';

  const first = events[0];
  const last = events[events.length - 1];
  
  if (!first || !last) return '';
  
  const durationNs = last.timestamp - first.timestamp;
  const durationMs = Math.round(durationNs / 1_000_000);

  return `${events.length} events over ${durationMs}ms (lines ${first.lineNumber}-${last.lineNumber})`;
}

/**
 * Detect pattern in events
 */
function detectPattern(events: EventNode[], issue: Issue): string | undefined {
  if (events.length < 2) return undefined;

  // Count event types
  const typeCounts = new Map<string, number>();
  for (const event of events) {
    typeCounts.set(event.type, (typeCounts.get(event.type) || 0) + 1);
  }

  // Check for repetition
  for (const [type, count] of typeCounts) {
    if (count > 3) {
      return `Repeated ${type.replace(/_/g, ' ')} (${count}x)`;
    }
  }

  // Issue-specific patterns
  switch (issue.type) {
    case 'SOQL_IN_LOOP':
      return 'SOQL query inside loop iteration';
    case 'N_PLUS_ONE':
      return 'Query per record pattern';
    case 'RECURSIVE_TRIGGER':
      return 'Trigger calling itself';
    default:
      return undefined;
  }
}

/**
 * Extract location from issue
 */
function extractLocation(issue: Issue): string {
  if (issue.lineNumbers.length > 0) {
    return `Line ${issue.lineNumbers[0]}`;
  }

  // Try to get from event summaries
  for (const event of issue.aiContext.relevantEvents) {
    if (event.line) {
      return `Line ${event.line}`;
    }
  }

  return 'Unknown location';
}

/**
 * Format line range
 */
function formatLineRange(lines: number[]): string {
  if (lines.length === 0) return 'unknown';
  if (lines.length === 1) return `${lines[0]}`;

  const sorted = [...lines].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

/**
 * Get highlight instruction for code
 */
function getHighlightInstruction(issue: Issue): string {
  switch (issue.type) {
    case 'SOQL_IN_LOOP':
      return 'Look for SOQL query inside for/while loop';
    case 'DML_IN_LOOP':
      return 'Look for DML statement inside loop';
    case 'N_PLUS_ONE':
      return 'Look for query that fetches related records one at a time';
    case 'RECURSIVE_TRIGGER':
      return 'Look for trigger/method that calls itself';
    case 'NON_SELECTIVE_QUERY':
      return 'Look for query without selective WHERE clause';
    case 'NULL_POINTER':
      return 'Look for variable access without null check';
    default:
      return 'Review the highlighted code section';
  }
}

/**
 * Generate root cause explanation
 */
function generateRootCauseExplanation(issue: Issue): string {
  const explanations: Record<string, string> = {
    SOQL_IN_LOOP: 'A SOQL query is being executed inside a loop, causing multiple database round-trips.',
    DML_IN_LOOP: 'DML operations inside a loop cause multiple database commits.',
    N_PLUS_ONE: 'Instead of bulk-fetching related records, code queries them one at a time.',
    RECURSIVE_TRIGGER: 'A trigger is causing itself to fire again, creating a recursion chain.',
    NON_SELECTIVE_QUERY: 'Query lacks selective filters, forcing full table scan.',
    CPU_HOTSPOT: 'A code section is consuming excessive CPU time.',
    NULL_POINTER: 'Code accesses a property on a null object reference.',
    EXCEPTION_THROWN: 'An unhandled exception occurred during execution.',
    SOQL_LIMIT_NEAR: 'Approaching the 100 SOQL queries per transaction limit.',
    DML_LIMIT_NEAR: 'Approaching the 150 DML statements per transaction limit.',
  };

  return explanations[issue.type] || issue.description;
}

/**
 * Generate what AI can help with
 */
function generateAICanHelp(issue: Issue): string[] {
  const canHelp: string[] = [];

  if (issue.attribution.canModify) {
    canHelp.push('Suggest code refactoring');
    canHelp.push('Explain the anti-pattern');
    canHelp.push('Show correct implementation');
  }

  canHelp.push('Explain why this is a problem');
  canHelp.push('Suggest testing approaches');

  if (issue.category === 'ANTI_PATTERN') {
    canHelp.push('Show bulkification patterns');
  }

  return canHelp.slice(0, 4);
}

/**
 * Generate what AI cannot help with
 */
function generateAICannotHelp(issue: Issue): string[] {
  const cannotHelp: string[] = [];

  if (!issue.attribution.canModify) {
    cannotHelp.push('Modify managed package code directly');
  }

  if (issue.attribution.attribution === 'MANAGED_PACKAGE') {
    cannotHelp.push('Fix vendor code - contact vendor support');
  }

  if (issue.confidence.score < 0.7) {
    cannotHelp.push('Guarantee this is the actual root cause');
  }

  return cannotHelp;
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Estimate tokens for an object
 */
function estimateTokens(obj: unknown, charsPerToken: number = DEFAULT_CHARS_PER_TOKEN): number {
  const json = JSON.stringify(obj);
  return Math.ceil(json.length / charsPerToken);
}

/**
 * Trim context to fit within token budget
 */
function trimContext(
  context: ProblemContext,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN
): ProblemContext {
  const trimmed = { ...context };

  // First, trim events
  if (trimmed.events.keyEvents.length > 3) {
    trimmed.events = {
      ...trimmed.events,
      keyEvents: trimmed.events.keyEvents.slice(0, 3),
    };
  }

  // Trim guidance
  if (estimateTokens(trimmed, charsPerToken) > maxTokens) {
    trimmed.guidance = {
      ...trimmed.guidance,
      fixPatterns: trimmed.guidance.fixPatterns.slice(0, 1),
      aiCanHelp: trimmed.guidance.aiCanHelp.slice(0, 2),
      aiCannotHelp: trimmed.guidance.aiCannotHelp.slice(0, 1),
    };
  }

  // Remove code snippet if still over
  if (estimateTokens(trimmed, charsPerToken) > maxTokens) {
    delete trimmed.codeSnippet;
  }

  // Truncate description
  if (estimateTokens(trimmed, charsPerToken) > maxTokens) {
    trimmed.issue = {
      ...trimmed.issue,
      description: truncate(trimmed.issue.description, 100),
    };
  }

  trimmed.tokenCount = estimateTokens(trimmed, charsPerToken);
  return trimmed;
}

// ============================================================================
// Markdown Output
// ============================================================================

/**
 * Convert problem context to markdown
 */
export function contextToMarkdown(context: ProblemContext): string {
  const lines: string[] = [];

  // Header
  lines.push(`## ${context.header.severity}: ${context.header.summary}`);
  lines.push('');
  lines.push(`**Fixable**: ${context.header.fixable ? 'Yes ✏️' : 'No 🔒'}`);
  if (context.header.component) {
    lines.push(`**Component**: ${context.header.component}`);
  }
  lines.push('');

  // Issue details
  lines.push('### Issue Details');
  lines.push('');
  lines.push(`- **Type**: ${context.issue.type}`);
  lines.push(`- **Category**: ${context.issue.category}`);
  lines.push(`- **Confidence**: ${context.issue.confidence}`);
  lines.push(`- **Attribution**: ${context.issue.attribution}`);
  lines.push('');
  lines.push(context.issue.description);
  lines.push('');
  lines.push(`**Impact**: ${context.issue.impact}`);
  lines.push('');

  // Events
  if (context.events.keyEvents.length > 0) {
    lines.push('### Related Events');
    lines.push('');
    if (context.events.timeline) {
      lines.push(`*${context.events.timeline}*`);
      lines.push('');
    }
    for (const event of context.events.keyEvents) {
      lines.push(`- Line ${event.line}: ${event.brief}${event.keyData ? ` (${event.keyData})` : ''}`);
    }
    if (context.events.pattern) {
      lines.push('');
      lines.push(`**Pattern**: ${context.events.pattern}`);
    }
    lines.push('');
  }

  // Code snippet
  if (context.codeSnippet) {
    lines.push('### Code Context');
    lines.push('');
    lines.push(`**Location**: ${context.codeSnippet.location} (lines ${context.codeSnippet.lines})`);
    lines.push('');
    lines.push('```apex');
    lines.push(context.codeSnippet.code);
    lines.push('```');
    lines.push('');
    lines.push(`💡 ${context.codeSnippet.highlight}`);
    lines.push('');
  }

  // Guidance
  lines.push('### Resolution Guidance');
  lines.push('');
  lines.push(`**Root Cause**: ${context.guidance.rootCause}`);
  lines.push('');
  lines.push(`**Recommended Fix**: ${context.guidance.recommendedFix}`);
  lines.push('');

  if (context.guidance.fixPatterns.length > 0) {
    lines.push('**Fix Patterns**:');
    for (const pattern of context.guidance.fixPatterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push('');
  }

  lines.push('**AI Can Help With**:');
  for (const item of context.guidance.aiCanHelp) {
    lines.push(`- ✅ ${item}`);
  }
  lines.push('');

  if (context.guidance.aiCannotHelp.length > 0) {
    lines.push('**AI Cannot Help With**:');
    for (const item of context.guidance.aiCannotHelp) {
      lines.push(`- ❌ ${item}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Context ID: ${context.id} | Tokens: ~${context.tokenCount}*`);

  return lines.join('\n');
}

/**
 * Convert multiple contexts to markdown
 */
export function contextsToMarkdown(contexts: ProblemContext[]): string {
  return contexts.map(c => contextToMarkdown(c)).join('\n\n');
}

// ============================================================================
// Exports
// ============================================================================

export {
  DEFAULT_MAX_TOKENS,
  DEFAULT_CHARS_PER_TOKEN,
  estimateTokens,
  truncate,
};
