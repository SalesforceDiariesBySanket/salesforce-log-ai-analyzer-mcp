/**
 * @module output/formatters/summary-builder
 * @description Build output summary and AI context
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/events.ts, src/analyzer/index.ts
 * @lastModified 2026-01-31
 */

import type { ParsedLog } from '../../types/events';
import type { AnalysisResult } from '../../analyzer';
import type { OutputSummary, AIOutputContext } from './types';

// ============================================================================
// Summary Building
// ============================================================================

/**
 * Build output summary from analysis result
 * 
 * @param analysis - Analysis result
 * @returns Output summary
 */
export function buildOutputSummary(analysis: AnalysisResult): OutputSummary {
  const { summary } = analysis;

  return {
    health: summary.healthScore,
    totalIssues: summary.totalCount,
    bySeverity: summary.bySeverity as Record<string, number>,
    byCategory: summary.byCategory as Record<string, number>,
    status: summary.oneLiner,
  };
}

// ============================================================================
// AI Context Building
// ============================================================================

/**
 * Category-specific advice for AI agents
 */
const CATEGORY_ADVICE: Record<string, string> = {
  PERFORMANCE: 'Review performance hotspots and optimize slow code paths',
  GOVERNOR_LIMITS: 'Refactor code to reduce resource consumption',
  ERROR: 'Investigate and fix error conditions',
  ANTI_PATTERN: 'Refactor anti-patterns to follow Salesforce best practices',
  SECURITY: 'Review security concerns and implement proper input validation',
  DATA_QUALITY: 'Add null checks and data validation',
  BEST_PRACTICE: 'Consider implementing best practice patterns',
  MANAGED_PACKAGE: 'Contact vendor support for managed package issues',
};

/**
 * Build AI-specific output context
 * 
 * @param parsedLog - Parsed log data
 * @param analysis - Analysis result
 * @returns AI output context
 */
export function buildAIContext(
  parsedLog: ParsedLog,
  analysis: AnalysisResult
): AIOutputContext {
  // Collect namespaces
  const namespaces = new Set<string>();
  for (const event of parsedLog.events) {
    if (event.namespace) {
      namespaces.add(event.namespace);
    }
  }

  // Generate next steps
  const nextSteps: string[] = [];

  // Prioritize critical issues
  if (analysis.summary.bySeverity.CRITICAL > 0) {
    nextSteps.push('Address critical issues immediately');
  }

  // Add category-specific advice
  const topCategory = Object.entries(analysis.summary.byCategory)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])[0];

  if (topCategory) {
    const advice = CATEGORY_ADVICE[topCategory[0]];
    if (advice) {
      nextSteps.push(advice);
    }
  }

  // Add truncation warning
  if (parsedLog.truncation?.isTruncated) {
    nextSteps.push('Note: Log was truncated - some issues may be missing');
  }

  // Add confidence warning
  if (parsedLog.confidence.score < 0.7) {
    nextSteps.push('Confidence is low - verify findings manually');
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
