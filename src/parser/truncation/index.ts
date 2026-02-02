/**
 * @module parser/truncation/index
 * @description Main entry point for truncation handling - re-exports from split modules
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies ./detection, ./recovery, ./impact, ./constants
 * @lastModified 2026-02-01
 */

import type { EventNode } from '../../types/events';
import type {
  TruncationDetection,
  TruncationRecoveryPlan,
  TruncationAnalysisImpact,
  TruncationAnalysis,
  TruncationAnalysisMetadata,
  TruncationHandler,
} from '../../types/truncation';

import { detectTruncation } from './detection';
import { createRecoveryPlan } from './recovery';
import { analyzeImpact } from './impact';
import { SIZE_THRESHOLDS } from './constants';

// ============================================================================
// Re-exports
// ============================================================================

export * from './constants';
export * from './detection';
export * from './recovery';
export * from './impact';

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Complete truncation handler implementation
 */
export const truncationHandler: TruncationHandler = {
  detect(content: string, events: EventNode[]): TruncationDetection {
    return detectTruncation(content, events);
  },

  analyzeImpact(detection: TruncationDetection, events: EventNode[]): TruncationAnalysisImpact {
    return analyzeImpact(detection, events);
  },

  createRecoveryPlan(detection: TruncationDetection): TruncationRecoveryPlan {
    return createRecoveryPlan(detection);
  },

  analyze(content: string, events: EventNode[]): TruncationAnalysis {
    return analyzeTruncation(content, events);
  },
};

// ============================================================================
// Complete Analysis
// ============================================================================

/**
 * Perform complete truncation analysis
 * 
 * @param content - Raw log content
 * @param events - Parsed events from the log
 * @returns Complete truncation analysis with detection, recovery plan, and impact
 * 
 * @example
 * ```typescript
 * const analysis = analyzeTruncation(logContent, parsedEvents);
 * if (analysis.detection.isTruncated) {
 *   console.log('Severity:', analysis.detection.severity);
 *   console.log('Recommendations:', analysis.recoveryPlan.aiWorkingGuidance);
 * }
 * ```
 */
export function analyzeTruncation(
  content: string,
  events: EventNode[]
): TruncationAnalysis {
  const detection = detectTruncation(content, events);
  const recoveryPlan = createRecoveryPlan(detection);
  const impact = analyzeImpact(detection, events);

  const contentSize = Buffer.byteLength(content, 'utf-8');
  const lines = content.split('\n');

  const metadata: TruncationAnalysisMetadata = {
    originalSize: contentSize,
    estimatedCompleteSize: detection.isTruncated
      ? Math.round(contentSize / 0.95) // Rough estimate
      : contentSize,
    analyzedPercent: detection.isTruncated
      ? Math.min(100, Math.round((contentSize / SIZE_THRESHOLDS.SALESFORCE_MAX) * 100))
      : 100,
    lastParsedLine: events[events.length - 1]?.lineNumber ?? 0,
    totalLines: lines.length,
    eventsBeforeTruncation: events.length,
    analyzedAt: new Date(),
  };

  return {
    detection,
    recoveryPlan,
    analysisImpact: impact,
    metadata,
  };
}
