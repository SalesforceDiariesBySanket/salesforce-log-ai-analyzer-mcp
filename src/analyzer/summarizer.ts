/**
 * @module analyzer/summarizer
 * @description Generate token-efficient summaries for AI consumption (<500 tokens)
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts, src/analyzer/index.ts, src/constants.ts
 * @lastModified 2026-01-31
 */

import type { ParsedLog, EventNode } from '../types/events';
import type { Issue, IssueSeverity } from '../types/issues';
import type { AnalysisResult } from './index';
import type { LimitSummary } from './detectors';
import { detectLogLevels } from './level-detector';
import { assessCapabilities } from './level-capabilities';
import { generateLimitationReport, getQuickReliabilityCheck } from './level-limitations';
import { LIMIT_THRESHOLDS, STATUS_INDICATORS } from '../constants';

// ============================================================================
// Token Estimation Constants
// ============================================================================

/**
 * Average tokens per character (approximation for GPT models)
 * Actual ratio varies: ~4 chars/token for English, ~2 chars/token for code
 */
const CHARS_PER_TOKEN = 3.5;

/**
 * Maximum tokens for summary output
 */
const MAX_SUMMARY_TOKENS = 500;

// ============================================================================
// Summary Types
// ============================================================================

/**
 * AI-optimized log summary
 * Designed to fit within 500 tokens
 */
export interface LogSummary {
  /** Log identification */
  logId?: string;

  /** Health score (0-100) */
  health: number;

  /** One-line status */
  status: string;

  /** Key metrics */
  metrics: SummaryMetrics;

  /** Top issues (max 3) */
  topIssues: CompactIssue[];

  /** Limit warnings (max 3) */
  limitWarnings: string[];

  /** Recommendations (max 5) */
  recommendations: string[];

  /** AI-specific context */
  aiContext: AIContext;

  /** Estimated token count */
  tokenCount: number;
}

/**
 * Compact metrics for summary
 */
export interface SummaryMetrics {
  /** Total events parsed */
  events: number;

  /** Total issues found */
  issues: number;

  /** Critical/high severity count */
  criticalHigh: number;

  /** SOQL queries executed */
  soqlCount: number;

  /** DML operations executed */
  dmlCount: number;

  /** Total CPU time (ms) */
  cpuTimeMs?: number;

  /** Peak heap size (bytes) */
  heapBytes?: number;
}

/**
 * Compact issue representation
 */
export interface CompactIssue {
  /** Issue type */
  type: string;

  /** Short description */
  desc: string;

  /** Severity (C/H/M/L/I) */
  sev: string;

  /** Can the user fix this? */
  fixable: boolean;
}

/**
 * AI-specific context
 */
export interface AIContext {
  /** Was the log truncated? */
  truncated: boolean;

  /** Truncation warning if applicable */
  truncationWarning?: string;

  /** Namespaces detected (managed packages) */
  namespaces: string[];

  /** Confidence in analysis (0-1) */
  confidence: number;

  /** Known limitations for this analysis */
  limitations: string[];

  /** Debug level information (Phase 6) */
  debugLevels?: DebugLevelContext;
}

/**
 * Debug level context for AI (Phase 6)
 */
export interface DebugLevelContext {
  /** How levels were detected */
  detectionMethod: 'HEADER' | 'INFERRED' | 'UNKNOWN';

  /** Detection confidence (0-1) */
  detectionConfidence: number;

  /** Detected levels as string */
  levelsString: string;

  /** Analysis reliability score (0-100) */
  reliabilityScore: number;

  /** Quick reliability assessment */
  reliabilityMessage: string;

  /** Unavailable detectors due to debug levels */
  unavailableDetectors: string[];

  /** Specific warnings about debug levels */
  warnings: string[];
}

// ============================================================================
// Main Summary Generator
// ============================================================================

/**
 * Generate AI-optimized summary from parsed log and analysis
 * 
 * Produces a summary under 500 tokens containing:
 * - Health score and status
 * - Key metrics
 * - Top 3 issues
 * - Critical limit warnings
 * - Actionable recommendations
 * 
 * @param parsedLog - Parsed log data
 * @param analysis - Analysis result from analyzers
 * @returns Token-efficient summary
 * 
 * @example
 * const summary = generateSummary(parsedLog, analysisResult);
 * console.log(summary.status); // "Critical problems - 3 high priority issues"
 */
export function generateSummary(
  parsedLog: ParsedLog,
  analysis: AnalysisResult
): LogSummary {
  // Build metrics
  const metrics = buildMetrics(parsedLog, analysis);

  // Get top issues (max 3)
  const topIssues = getTopIssues(analysis.issues, 3);

  // Get limit warnings
  const limitWarnings = getLimitWarnings(analysis.limitSummary, 3);

  // Generate recommendations
  const recommendations = generateRecommendations(analysis, 5);

  // Build AI context
  const aiContext = buildAIContext(parsedLog, analysis);

  // Build status string
  const status = buildStatusString(analysis.summary.healthScore, metrics);

  const summary: LogSummary = {
    logId: parsedLog.metadata.logId,
    health: analysis.summary.healthScore,
    status,
    metrics,
    topIssues,
    limitWarnings,
    recommendations,
    aiContext,
    tokenCount: 0, // Will be calculated
  };

  // Calculate token count
  summary.tokenCount = estimateTokens(summary);

  // If over budget, trim
  if (summary.tokenCount > MAX_SUMMARY_TOKENS) {
    return trimSummary(summary);
  }

  return summary;
}

/**
 * Generate minimal summary (under 100 tokens)
 * For quick status checks
 */
export function generateMinimalSummary(analysis: AnalysisResult): string {
  const { summary } = analysis;
  const critHigh = summary.bySeverity.CRITICAL + summary.bySeverity.HIGH;

  const parts: string[] = [];

  // Health
  parts.push(`Health: ${summary.healthScore}/100`);

  // Issues
  if (summary.totalCount === 0) {
    parts.push('No issues');
  } else {
    parts.push(`${summary.totalCount} issues (${critHigh} critical/high)`);
  }

  // Top issue
  if (summary.topIssues.length > 0 && summary.topIssues[0]) {
    parts.push(`Top: ${summary.topIssues[0].type}`);
  }

  return parts.join(' | ');
}

/**
 * Generate markdown summary for human consumption
 */
export function generateMarkdownSummary(
  parsedLog: ParsedLog,
  analysis: AnalysisResult
): string {
  const summary = generateSummary(parsedLog, analysis);
  const lines: string[] = [];

  // Header
  lines.push('# Debug Log Analysis Summary');
  lines.push('');

  // Health badge
  const healthEmoji = getHealthEmoji(summary.health);
  lines.push(`## ${healthEmoji} Health Score: ${summary.health}/100`);
  lines.push('');
  lines.push(`**Status**: ${summary.status}`);
  lines.push('');

  // Metrics
  lines.push('## 📊 Metrics');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Events | ${summary.metrics.events.toLocaleString()} |`);
  lines.push(`| Issues | ${summary.metrics.issues} |`);
  lines.push(`| Critical/High | ${summary.metrics.criticalHigh} |`);
  lines.push(`| SOQL Queries | ${summary.metrics.soqlCount} |`);
  lines.push(`| DML Operations | ${summary.metrics.dmlCount} |`);
  if (summary.metrics.cpuTimeMs !== undefined) {
    lines.push(`| CPU Time | ${summary.metrics.cpuTimeMs}ms |`);
  }
  lines.push('');

  // Top Issues
  if (summary.topIssues.length > 0) {
    lines.push('## 🔴 Top Issues');
    lines.push('');
    for (const issue of summary.topIssues) {
      const sevIcon = getSeverityIcon(issue.sev);
      const fixIcon = issue.fixable ? '✏️' : '🔒';
      lines.push(`- ${sevIcon} **${issue.type}**: ${issue.desc} ${fixIcon}`);
    }
    lines.push('');
  }

  // Limit Warnings
  if (summary.limitWarnings.length > 0) {
    lines.push('## ⚠️ Limit Warnings');
    lines.push('');
    for (const warning of summary.limitWarnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  // Recommendations
  if (summary.recommendations.length > 0) {
    lines.push('## 💡 Recommendations');
    lines.push('');
    for (let i = 0; i < summary.recommendations.length; i++) {
      lines.push(`${i + 1}. ${summary.recommendations[i]}`);
    }
    lines.push('');
  }

  // AI Context
  if (summary.aiContext.truncated) {
    lines.push('## ⚠️ Analysis Limitations');
    lines.push('');
    lines.push(`> **Warning**: ${summary.aiContext.truncationWarning}`);
    lines.push('');
  }

  // Debug Level Information (Phase 6)
  if (summary.aiContext.debugLevels) {
    const dbg = summary.aiContext.debugLevels;
    lines.push('## 🔧 Debug Level Analysis');
    lines.push('');
    lines.push(`| Property | Value |`);
    lines.push(`|----------|-------|`);
    lines.push(`| Detection Method | ${dbg.detectionMethod} |`);
    lines.push(`| Detected Levels | ${dbg.levelsString} |`);
    lines.push(`| Reliability Score | ${dbg.reliabilityScore}% |`);
    lines.push(`| Reliability | ${dbg.reliabilityMessage} |`);
    lines.push('');

    if (dbg.unavailableDetectors.length > 0) {
      lines.push('**Unavailable Detectors** (due to debug levels):');
      for (const detector of dbg.unavailableDetectors) {
        lines.push(`- ${detector}`);
      }
      lines.push('');
    }

    if (dbg.warnings.length > 0) {
      lines.push('**Debug Level Warnings**:');
      for (const warning of dbg.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push('');
    }
  }

  if (summary.aiContext.namespaces.length > 0) {
    lines.push('## 📦 Managed Packages Detected');
    lines.push('');
    lines.push(summary.aiContext.namespaces.join(', '));
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Analysis confidence: ${Math.round(summary.aiContext.confidence * 100)}% | Token estimate: ${summary.tokenCount}*`);

  return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build metrics from parsed log and analysis
 */
function buildMetrics(parsedLog: ParsedLog, analysis: AnalysisResult): SummaryMetrics {
  const { stats } = parsedLog;
  const { summary, limitSummary } = analysis;

  // Count SOQL and DML from events
  const soqlCount = stats.eventsByType['SOQL_EXECUTE_BEGIN'] || 0;
  const dmlCount = stats.eventsByType['DML_BEGIN'] || 0;

  // Get CPU time from limits
  let cpuTimeMs: number | undefined;
  let heapBytes: number | undefined;

  if (limitSummary.limitUsage) {
    for (const [name, usage] of Object.entries(limitSummary.limitUsage)) {
      if (name.includes('CPU')) {
        cpuTimeMs = usage.used;
      }
      if (name.includes('Heap')) {
        heapBytes = usage.used;
      }
    }
  }

  return {
    events: stats.eventCount,
    issues: summary.totalCount,
    criticalHigh: summary.bySeverity.CRITICAL + summary.bySeverity.HIGH,
    soqlCount,
    dmlCount,
    cpuTimeMs,
    heapBytes,
  };
}

/**
 * Get top N issues in compact format
 */
function getTopIssues(issues: Issue[], maxCount: number): CompactIssue[] {
  // Already sorted by priority from categorizer
  return issues.slice(0, maxCount).map(issue => ({
    type: issue.type.replace(/_/g, ' '),
    desc: truncateString(issue.title, 60),
    sev: severityToShort(issue.severity),
    fixable: issue.attribution.canModify,
  }));
}

/**
 * Get limit warnings
 */
function getLimitWarnings(limitSummary: LimitSummary, maxCount: number): string[] {
  const warnings: string[] = [];

  if (limitSummary.limitUsage) {
    // Sort by percentage used
    const entries = Object.entries(limitSummary.limitUsage)
      .filter(([_, usage]) => usage.percentUsed > 50)
      .sort((a, b) => b[1].percentUsed - a[1].percentUsed);

    for (const [name, usage] of entries.slice(0, maxCount)) {
      const status = usage.percentUsed >= LIMIT_THRESHOLDS.HIGH ? STATUS_INDICATORS.CRITICAL 
        : usage.percentUsed >= LIMIT_THRESHOLDS.MEDIUM ? STATUS_INDICATORS.WARNING 
        : STATUS_INDICATORS.OK;
      warnings.push(`${status} ${name}: ${usage.used}/${usage.max} (${Math.round(usage.percentUsed)}%)`);
    }
  }

  return warnings;
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(analysis: AnalysisResult, maxCount: number): string[] {
  const recommendations: string[] = [];
  const seen = new Set<string>();

  // Get unique recommendations from top issues
  for (const issue of analysis.issues) {
    for (const rec of issue.recommendations) {
      if (!seen.has(rec) && recommendations.length < maxCount) {
        seen.add(rec);
        recommendations.push(rec);
      }
    }
  }

  // Add generic recommendations if we have room
  if (recommendations.length < maxCount && analysis.summary.healthScore < 50) {
    recommendations.push('Consider enabling debug logging at FINEST level for more detail');
  }

  return recommendations;
}

/**
 * Build AI-specific context
 */
function buildAIContext(parsedLog: ParsedLog, _analysis: AnalysisResult): AIContext {
  // Collect namespaces
  const namespaces = new Set<string>();
  for (const event of parsedLog.events) {
    if (event.namespace) {
      namespaces.add(event.namespace);
    }
  }

  // Collect limitations
  const limitations: string[] = [];
  if (parsedLog.truncation?.isTruncated) {
    limitations.push('Log was truncated - some events may be missing');
  }
  if (parsedLog.confidence.limitations) {
    limitations.push(...parsedLog.confidence.limitations);
  }

  // Build debug level context (Phase 6)
  const debugLevelContext = buildDebugLevelContext(parsedLog);
  
  // Add debug level limitations
  if (debugLevelContext.warnings.length > 0) {
    limitations.push(...debugLevelContext.warnings.slice(0, 2));
  }

  return {
    truncated: parsedLog.truncation?.isTruncated ?? false,
    truncationWarning: parsedLog.truncation?.warning,
    namespaces: Array.from(namespaces),
    confidence: Math.min(parsedLog.confidence.score, debugLevelContext.detectionConfidence),
    limitations,
    debugLevels: debugLevelContext,
  };
}

/**
 * Build debug level context for AI (Phase 6)
 */
function buildDebugLevelContext(parsedLog: ParsedLog): DebugLevelContext {
  // Detect debug levels
  const detection = detectLogLevels(parsedLog.events, parsedLog.metadata);
  
  // Assess capabilities
  const capabilities = assessCapabilities(detection);
  
  // Generate limitation report
  const limitationReport = generateLimitationReport(detection, capabilities);
  
  // Get quick reliability check
  const reliabilityCheck = getQuickReliabilityCheck(detection);

  // Build levels string
  const levelsString = Object.entries(detection.detectedLevels)
    .map(([cat, level]) => `${cat}: ${level}`)
    .join(', ') || 'Unknown';

  // Build warnings
  const warnings: string[] = [];
  
  if (!reliabilityCheck.reliable) {
    warnings.push(reliabilityCheck.message);
  }
  
  if (capabilities.unavailableDetectors.length > 0) {
    warnings.push(
      `Detectors disabled due to low debug levels: ${capabilities.unavailableDetectors.join(', ')}`
    );
  }

  if (limitationReport.hasSignificantLimitations) {
    const criticalLimitations = limitationReport.limitations
      .filter(l => l.severity === 'CRITICAL' || l.severity === 'WARNING')
      .slice(0, 2);
    
    for (const lim of criticalLimitations) {
      if (!warnings.includes(lim.title)) {
        warnings.push(lim.title);
      }
    }
  }

  return {
    detectionMethod: detection.detectionMethod,
    detectionConfidence: detection.confidence,
    levelsString,
    reliabilityScore: limitationReport.reliabilityScore,
    reliabilityMessage: reliabilityCheck.message,
    unavailableDetectors: capabilities.unavailableDetectors,
    warnings,
  };
}

/**
 * Build status string
 */
function buildStatusString(healthScore: number, metrics: SummaryMetrics): string {
  let status: string;

  if (healthScore >= 90) {
    status = 'Excellent';
  } else if (healthScore >= 75) {
    status = 'Good';
  } else if (healthScore >= 60) {
    status = 'Fair';
  } else if (healthScore >= 40) {
    status = 'Poor';
  } else {
    status = 'Critical';
  }

  if (metrics.criticalHigh > 0) {
    status += ` - ${metrics.criticalHigh} high priority issue${metrics.criticalHigh > 1 ? 's' : ''}`;
  } else if (metrics.issues > 0) {
    status += ` - ${metrics.issues} issue${metrics.issues > 1 ? 's' : ''} detected`;
  } else {
    status += ' - No issues detected';
  }

  return status;
}

/**
 * Estimate token count for an object
 */
function estimateTokens(obj: unknown): number {
  const json = JSON.stringify(obj);
  return Math.ceil(json.length / CHARS_PER_TOKEN);
}

/**
 * Trim summary to fit within token budget
 */
function trimSummary(summary: LogSummary): LogSummary {
  const trimmed = { ...summary };

  // Trim recommendations first
  while (trimmed.recommendations.length > 2 && estimateTokens(trimmed) > MAX_SUMMARY_TOKENS) {
    trimmed.recommendations.pop();
  }

  // Trim limit warnings
  while (trimmed.limitWarnings.length > 1 && estimateTokens(trimmed) > MAX_SUMMARY_TOKENS) {
    trimmed.limitWarnings.pop();
  }

  // Trim issues
  while (trimmed.topIssues.length > 1 && estimateTokens(trimmed) > MAX_SUMMARY_TOKENS) {
    trimmed.topIssues.pop();
  }

  // Trim AI context limitations
  if (estimateTokens(trimmed) > MAX_SUMMARY_TOKENS) {
    trimmed.aiContext.limitations = trimmed.aiContext.limitations.slice(0, 1);
  }

  trimmed.tokenCount = estimateTokens(trimmed);
  return trimmed;
}

/**
 * Truncate string to max length
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Convert severity to short code
 */
function severityToShort(severity: IssueSeverity): string {
  const map: Record<IssueSeverity, string> = {
    CRITICAL: 'C',
    HIGH: 'H',
    MEDIUM: 'M',
    LOW: 'L',
    INFO: 'I',
  };
  return map[severity];
}

/**
 * Get health emoji
 */
function getHealthEmoji(health: number): string {
  if (health >= 90) return '🟢';
  if (health >= 75) return '🟡';
  if (health >= 50) return '🟠';
  return '🔴';
}

/**
 * Get severity icon
 */
function getSeverityIcon(sev: string): string {
  const map: Record<string, string> = {
    C: '🔴',
    H: '🟠',
    M: '🟡',
    L: '🔵',
    I: 'ℹ️',
  };
  return map[sev] || '⚪';
}

// ============================================================================
// Streaming Summary Generator
// ============================================================================

/**
 * Generate summary incrementally as events are processed
 * Useful for streaming large logs
 */
export class StreamingSummarizer {
  private eventCount = 0;
  private soqlCount = 0;
  private dmlCount = 0;
  private exceptionCount = 0;
  private namespaces = new Set<string>();
  private issues: CompactIssue[] = [];

  /**
   * Process an event
   */
  processEvent(event: EventNode): void {
    this.eventCount++;

    if (event.type === 'SOQL_EXECUTE_BEGIN') {
      this.soqlCount++;
    } else if (event.type === 'DML_BEGIN') {
      this.dmlCount++;
    } else if (event.type === 'EXCEPTION_THROWN' || event.type === 'FATAL_ERROR') {
      this.exceptionCount++;
    }

    if (event.namespace) {
      this.namespaces.add(event.namespace);
    }
  }

  /**
   * Add an issue
   */
  addIssue(issue: Issue): void {
    this.issues.push({
      type: issue.type.replace(/_/g, ' '),
      desc: truncateString(issue.title, 60),
      sev: severityToShort(issue.severity),
      fixable: issue.attribution.canModify,
    });
  }

  /**
   * Get current summary
   */
  getSummary(): Partial<LogSummary> {
    return {
      metrics: {
        events: this.eventCount,
        issues: this.issues.length,
        criticalHigh: this.issues.filter(i => i.sev === 'C' || i.sev === 'H').length,
        soqlCount: this.soqlCount,
        dmlCount: this.dmlCount,
      },
      topIssues: this.issues.slice(0, 3),
      aiContext: {
        truncated: false,
        namespaces: Array.from(this.namespaces),
        confidence: 1.0,
        limitations: [],
      },
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.eventCount = 0;
    this.soqlCount = 0;
    this.dmlCount = 0;
    this.exceptionCount = 0;
    this.namespaces.clear();
    this.issues = [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  MAX_SUMMARY_TOKENS,
  estimateTokens,
  truncateString,
  severityToShort,
};
