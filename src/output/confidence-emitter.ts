/**
 * @module output/confidence-emitter
 * @description Add confidence scores and uncertainty information to analysis outputs
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/common.ts, src/types/events.ts, src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type { Confidence } from '../types/common';
import type { ParsedLog } from '../types/events';
import type { Issue } from '../types/issues';
import type { AnalysisResult } from '../analyzer';

// ============================================================================
// Confidence Types
// ============================================================================

/**
 * Overall confidence assessment
 */
export interface ConfidenceAssessment {
  /** Overall confidence score (0-1) */
  overall: number;

  /** Confidence breakdown */
  breakdown: ConfidenceBreakdown;

  /** Human-readable summary */
  summary: string;

  /** Detailed reasons */
  reasons: string[];

  /** Known limitations affecting confidence */
  limitations: string[];

  /** Suggestions to improve confidence */
  improvementSuggestions: string[];

  /** Confidence level (HIGH/MEDIUM/LOW/VERY_LOW) */
  level: ConfidenceLevel;
}

/**
 * Confidence breakdown by component
 */
export interface ConfidenceBreakdown {
  /** Parse confidence */
  parsing: ComponentConfidence;

  /** Detection confidence */
  detection: ComponentConfidence;

  /** Attribution confidence */
  attribution: ComponentConfidence;

  /** Completeness confidence (truncation impact) */
  completeness: ComponentConfidence;
}

/**
 * Single component confidence
 */
export interface ComponentConfidence {
  /** Score (0-1) */
  score: number;

  /** What affects this score */
  factors: string[];

  /** Any warnings */
  warnings?: string[];
}

/**
 * Confidence level categories
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';

/**
 * Output with confidence metadata
 */
export interface ConfidenceEnrichedOutput<T> {
  /** Original data */
  data: T;

  /** Confidence assessment */
  confidence: ConfidenceAssessment;

  /** AI guidance for interpreting results */
  aiGuidance: AIConfidenceGuidance;
}

/**
 * AI-specific guidance about confidence
 */
export interface AIConfidenceGuidance {
  /** Should the AI trust this analysis? */
  trustLevel: string;

  /** What the AI should be cautious about */
  cautions: string[];

  /** What the AI can confidently state */
  canConfidentlyState: string[];

  /** What the AI should hedge on */
  shouldHedgeOn: string[];

  /** Suggested caveats to include */
  suggestedCaveats: string[];
}

// ============================================================================
// Main Confidence Emitter
// ============================================================================

/**
 * Generate confidence assessment for parsed log and analysis
 * 
 * @param parsedLog - Parsed log data
 * @param analysis - Analysis result
 * @returns Confidence assessment
 * 
 * @example
 * const confidence = assessConfidence(parsedLog, analysisResult);
 * if (confidence.level === 'LOW') {
 *   console.warn('Results may not be accurate:', confidence.limitations);
 * }
 */
export function assessConfidence(
  parsedLog: ParsedLog,
  analysis: AnalysisResult
): ConfidenceAssessment {
  // Calculate component confidences
  const parsing = assessParsingConfidence(parsedLog);
  const detection = assessDetectionConfidence(analysis);
  const attribution = assessAttributionConfidence(analysis);
  const completeness = assessCompletenessConfidence(parsedLog);

  // Calculate overall score (weighted average)
  const weights = {
    parsing: 0.25,
    detection: 0.30,
    attribution: 0.20,
    completeness: 0.25,
  };

  const overall =
    parsing.score * weights.parsing +
    detection.score * weights.detection +
    attribution.score * weights.attribution +
    completeness.score * weights.completeness;

  // Collect all reasons and limitations
  const reasons = [
    ...parsing.factors,
    ...detection.factors,
    ...attribution.factors,
    ...completeness.factors,
  ];

  const limitations: string[] = [];
  const allWarnings = [
    ...(parsing.warnings || []),
    ...(detection.warnings || []),
    ...(attribution.warnings || []),
    ...(completeness.warnings || []),
  ];
  limitations.push(...allWarnings);

  // Generate improvement suggestions
  const improvementSuggestions = generateImprovementSuggestions(
    parsing,
    detection,
    attribution,
    completeness,
    parsedLog
  );

  // Determine confidence level
  const level = getConfidenceLevel(overall);

  // Generate summary
  const summary = generateConfidenceSummary(level, overall, limitations);

  return {
    overall: Math.round(overall * 100) / 100,
    breakdown: {
      parsing,
      detection,
      attribution,
      completeness,
    },
    summary,
    reasons,
    limitations,
    improvementSuggestions,
    level,
  };
}

/**
 * Enrich output with confidence metadata
 */
export function enrichWithConfidence<T>(
  data: T,
  parsedLog: ParsedLog,
  analysis: AnalysisResult
): ConfidenceEnrichedOutput<T> {
  const confidence = assessConfidence(parsedLog, analysis);
  const aiGuidance = generateAIGuidance(confidence);

  return {
    data,
    confidence,
    aiGuidance,
  };
}

/**
 * Get confidence for a specific issue
 */
export function getIssueConfidence(issue: Issue): ComponentConfidence {
  const factors: string[] = [];
  const warnings: string[] = [];

  // Base confidence from issue
  const baseScore = issue.confidence.score;
  factors.push(...issue.confidence.reasons);

  // Attribution impact
  if (issue.attribution.attribution === 'UNKNOWN') {
    warnings.push('Could not determine if this is user code or managed package');
  }
  if (!issue.attribution.canModify) {
    factors.push('Issue is in managed package - cannot directly fix');
  }

  // Event coverage
  if (issue.eventIds.length === 0) {
    warnings.push('No specific events linked to this issue');
  }

  return {
    score: baseScore,
    factors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================================================
// Component Confidence Assessors
// ============================================================================

/**
 * Assess parsing confidence
 */
function assessParsingConfidence(parsedLog: ParsedLog): ComponentConfidence {
  const factors: string[] = [];
  const warnings: string[] = [];
  let score = parsedLog.confidence.score;

  // Check parse success rate
  const { stats } = parsedLog;
  const parseRate = stats.parsedLines / stats.totalLines;

  if (parseRate >= 0.99) {
    factors.push('Excellent parse rate (99%+)');
  } else if (parseRate >= 0.95) {
    factors.push('Good parse rate (95%+)');
  } else if (parseRate >= 0.90) {
    factors.push('Acceptable parse rate (90%+)');
    score *= 0.9;
  } else {
    warnings.push(`Low parse rate (${Math.round(parseRate * 100)}%)`);
    score *= 0.7;
  }

  // Check for failed lines
  if (stats.failedLines > 0) {
    warnings.push(`${stats.failedLines} lines failed to parse`);
    score *= Math.max(0.5, 1 - (stats.failedLines / stats.totalLines) * 2);
  }

  // Check event diversity
  const eventTypes = Object.keys(stats.eventsByType).length;
  if (eventTypes < 3) {
    warnings.push('Limited event type diversity - log may be incomplete');
    score *= 0.8;
  } else {
    factors.push(`${eventTypes} different event types detected`);
  }

  // Add limitations from parsed log
  if (parsedLog.confidence.limitations) {
    warnings.push(...parsedLog.confidence.limitations);
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    factors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Assess detection confidence
 */
function assessDetectionConfidence(analysis: AnalysisResult): ComponentConfidence {
  const factors: string[] = [];
  const warnings: string[] = [];
  let score = 1.0;

  const { issues, metadata } = analysis;

  // Check issue confidence scores
  if (issues.length > 0) {
    const avgConfidence = issues.reduce((sum, i) => sum + i.confidence.score, 0) / issues.length;
    
    if (avgConfidence >= 0.8) {
      factors.push('High average issue confidence');
    } else if (avgConfidence >= 0.6) {
      factors.push('Moderate issue confidence');
      score *= 0.9;
    } else {
      warnings.push('Low average issue confidence');
      score *= 0.7;
    }

    // Check for low-confidence issues
    const lowConfidenceIssues = issues.filter(i => i.confidence.score < 0.5);
    if (lowConfidenceIssues.length > 0) {
      warnings.push(`${lowConfidenceIssues.length} issues have low confidence`);
    }
  }

  // Check detector coverage
  factors.push(`${metadata.detectorsRun.length} detectors executed`);

  // Check event count
  if (metadata.eventCount < 10) {
    warnings.push('Very few events to analyze');
    score *= 0.6;
  } else if (metadata.eventCount < 100) {
    factors.push('Limited event data');
    score *= 0.9;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    factors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Assess attribution confidence
 */
function assessAttributionConfidence(analysis: AnalysisResult): ComponentConfidence {
  const factors: string[] = [];
  const warnings: string[] = [];
  let score = 1.0;

  const { issues } = analysis;

  if (issues.length === 0) {
    factors.push('No issues to attribute');
    return { score: 1.0, factors };
  }

  // Check attribution results
  const unknownAttribution = issues.filter(i => i.attribution.attribution === 'UNKNOWN');
  if (unknownAttribution.length > 0) {
    const pct = Math.round((unknownAttribution.length / issues.length) * 100);
    warnings.push(`${pct}% of issues have unknown attribution`);
    score *= Math.max(0.5, 1 - (unknownAttribution.length / issues.length) * 0.5);
  }

  // Check attribution confidence
  const avgAttribConfidence = issues.reduce((sum, i) => sum + i.attribution.confidence.score, 0) / issues.length;
  
  if (avgAttribConfidence >= 0.8) {
    factors.push('High attribution confidence');
  } else if (avgAttribConfidence >= 0.6) {
    factors.push('Moderate attribution confidence');
    score *= 0.9;
  } else {
    warnings.push('Low attribution confidence');
    score *= 0.7;
  }

  // Check for managed package complexity
  const managedPkgIssues = issues.filter(i => i.attribution.attribution === 'MANAGED_PACKAGE');
  if (managedPkgIssues.length > 0) {
    factors.push(`${managedPkgIssues.length} issues attributed to managed packages`);
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    factors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Assess completeness confidence (truncation impact)
 */
function assessCompletenessConfidence(parsedLog: ParsedLog): ComponentConfidence {
  const factors: string[] = [];
  const warnings: string[] = [];
  let score = 1.0;

  const { truncation, stats } = parsedLog;

  if (truncation?.isTruncated) {
    warnings.push(`Log was truncated: ${truncation.warning}`);
    
    // Estimate impact based on truncation type
    switch (truncation.truncationType) {
      case 'SIZE_LIMIT':
        warnings.push('Log hit size limit - significant data may be missing');
        score *= 0.5;
        break;
      case 'TIMEOUT':
        warnings.push('Log collection timed out - execution may not be complete');
        score *= 0.6;
        break;
      case 'LINE_LIMIT':
        warnings.push('Log hit line limit');
        score *= 0.7;
        break;
      default:
        score *= 0.7;
    }

    // Estimate lines lost
    if (truncation.estimatedLinesLost) {
      const lostPct = Math.round((truncation.estimatedLinesLost / (stats.totalLines + truncation.estimatedLinesLost)) * 100);
      warnings.push(`Estimated ${lostPct}% of log data lost`);
      score *= Math.max(0.3, 1 - (lostPct / 100) * 0.7);
    }
  } else {
    factors.push('Log appears complete (no truncation detected)');
  }

  // Check for suspicious patterns
  const hasExecutionStart = (stats.eventsByType['EXECUTION_STARTED'] ?? 0) > 0;
  const hasExecutionEnd = (stats.eventsByType['EXECUTION_FINISHED'] ?? 0) > 0;

  if (hasExecutionStart && !hasExecutionEnd) {
    warnings.push('Execution started but never finished - log may be incomplete');
    score *= 0.7;
  } else if (hasExecutionStart && hasExecutionEnd) {
    factors.push('Complete execution lifecycle captured');
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    factors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get confidence level from score
 */
function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.8) return 'HIGH';
  if (score >= 0.6) return 'MEDIUM';
  if (score >= 0.4) return 'LOW';
  return 'VERY_LOW';
}

/**
 * Generate confidence summary
 */
function generateConfidenceSummary(
  level: ConfidenceLevel,
  score: number,
  limitations: string[]
): string {
  const pct = Math.round(score * 100);

  switch (level) {
    case 'HIGH':
      return `High confidence analysis (${pct}%). Results are reliable.`;
    case 'MEDIUM':
      return `Moderate confidence analysis (${pct}%). Results are likely accurate but should be verified.`;
    case 'LOW':
      return `Low confidence analysis (${pct}%). Results should be treated as preliminary.${limitations.length > 0 ? ` Key concerns: ${limitations[0]}` : ''}`;
    case 'VERY_LOW':
      return `Very low confidence analysis (${pct}%). Results may not be accurate.${limitations.length > 0 ? ` Major issues: ${limitations.slice(0, 2).join(', ')}` : ''}`;
  }
}

/**
 * Generate improvement suggestions
 */
function generateImprovementSuggestions(
  parsing: ComponentConfidence,
  detection: ComponentConfidence,
  attribution: ComponentConfidence,
  completeness: ComponentConfidence,
  parsedLog: ParsedLog
): string[] {
  const suggestions: string[] = [];

  // Parsing improvements
  if (parsing.score < 0.8) {
    suggestions.push('Ensure debug log format is standard Salesforce format');
  }

  // Detection improvements
  if (detection.score < 0.8) {
    if (parsedLog.stats.eventCount < 100) {
      suggestions.push('Capture a longer operation or more log data');
    }
  }

  // Completeness improvements
  if (completeness.score < 0.8) {
    if (parsedLog.truncation?.isTruncated) {
      suggestions.push('Increase debug log size limit in Salesforce (Setup > Debug Logs)');
      suggestions.push('Consider capturing logs for a smaller scope');
    }
    suggestions.push('Enable FINEST log level for more detailed events');
  }

  // Attribution improvements
  if (attribution.score < 0.8) {
    suggestions.push('Ensure managed package namespaces are properly logged');
  }

  return suggestions;
}

/**
 * Generate AI guidance based on confidence
 */
function generateAIGuidance(confidence: ConfidenceAssessment): AIConfidenceGuidance {
  const trustLevel = getTrustLevel(confidence.level);
  const cautions: string[] = [];
  const canConfidentlyState: string[] = [];
  const shouldHedgeOn: string[] = [];
  const suggestedCaveats: string[] = [];

  // Build guidance based on confidence level
  if (confidence.level === 'HIGH') {
    canConfidentlyState.push('The analysis detected specific issues in the log');
    canConfidentlyState.push('Issue attribution (user code vs managed package) is reliable');
    canConfidentlyState.push('Recommendations are applicable');
  } else if (confidence.level === 'MEDIUM') {
    canConfidentlyState.push('Major issues are likely correctly identified');
    shouldHedgeOn.push('Specific counts and metrics');
    shouldHedgeOn.push('Minor issue detection');
    suggestedCaveats.push('Results are based on available log data');
  } else {
    shouldHedgeOn.push('All issue detections');
    shouldHedgeOn.push('Attribution accuracy');
    shouldHedgeOn.push('Completeness of analysis');
    suggestedCaveats.push('Analysis confidence is limited due to data quality');
  }

  // Add specific cautions based on limitations
  for (const limitation of confidence.limitations) {
    if (limitation.includes('truncat')) {
      cautions.push('Some issues may be missing due to log truncation');
      suggestedCaveats.push('Log was truncated - analysis may be incomplete');
    }
    if (limitation.includes('parse')) {
      cautions.push('Some log lines could not be parsed');
    }
    if (limitation.includes('unknown attribution')) {
      cautions.push('Source of some issues could not be determined');
    }
  }

  return {
    trustLevel,
    cautions,
    canConfidentlyState,
    shouldHedgeOn,
    suggestedCaveats,
  };
}

/**
 * Get trust level description
 */
function getTrustLevel(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH':
      return 'Results can be trusted. Present findings directly.';
    case 'MEDIUM':
      return 'Results are generally reliable. Include minor caveats.';
    case 'LOW':
      return 'Results should be treated as preliminary. Include significant caveats.';
    case 'VERY_LOW':
      return 'Results have significant uncertainty. Present as tentative observations.';
  }
}

// ============================================================================
// Aggregate Confidence
// ============================================================================

/**
 * Calculate aggregate confidence from multiple issues
 */
export function aggregateIssueConfidence(issues: Issue[]): Confidence {
  if (issues.length === 0) {
    return {
      score: 1.0,
      reasons: ['No issues to aggregate'],
    };
  }

  // Calculate weighted average
  let totalWeight = 0;
  let weightedSum = 0;
  const reasons: string[] = [];
  const limitations: string[] = [];

  for (const issue of issues) {
    // Weight by severity
    const weight = getSeverityWeight(issue.severity);
    weightedSum += issue.confidence.score * weight;
    totalWeight += weight;

    // Collect unique reasons
    for (const reason of issue.confidence.reasons) {
      if (!reasons.includes(reason)) {
        reasons.push(reason);
      }
    }

    // Collect limitations
    if (issue.confidence.limitations) {
      for (const lim of issue.confidence.limitations) {
        if (!limitations.includes(lim)) {
          limitations.push(lim);
        }
      }
    }
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    score: Math.round(score * 100) / 100,
    reasons: reasons.slice(0, 5), // Limit reasons
    limitations: limitations.length > 0 ? limitations.slice(0, 3) : undefined,
  };
}

/**
 * Get weight for severity level
 */
function getSeverityWeight(severity: string): number {
  const weights: Record<string, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFO: 1,
  };
  return weights[severity] || 1;
}

// ============================================================================
// Exports
// ============================================================================

export {
  getConfidenceLevel,
  getSeverityWeight,
};
