/**
 * @module parser/truncation/impact
 * @description Impact analysis for truncated debug logs
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/truncation.ts, src/types/events.ts
 * @lastModified 2026-02-01
 */

import type { EventNode } from '../../types/events';
import type {
  TruncationDetection,
  TruncationAnalysisImpact,
} from '../../types/truncation';

// ============================================================================
// Impact Analysis
// ============================================================================

/**
 * Analyze the impact of truncation on analysis capabilities
 * 
 * @param detection - Truncation detection result
 * @param _events - Parsed events (for future use)
 * @returns Impact analysis with reliability assessments
 */
export function analyzeImpact(
  detection: TruncationDetection,
  _events: EventNode[]
): TruncationAnalysisImpact {
  if (!detection.isTruncated || detection.severity === 'NONE') {
    return createCompleteLogImpact();
  }

  const limitations: string[] = [];
  const stillAnalyzable: string[] = [];

  // Assess issue detection reliability
  const issueDetectionReliable = assessIssueDetection(detection, limitations, stillAnalyzable);

  // Assess performance metrics reliability
  const performanceMetricsReliable = assessPerformanceMetrics(detection, limitations, stillAnalyzable);

  // Assess limit analysis reliability
  const limitAnalysisReliable = assessLimitAnalysis(detection, limitations, stillAnalyzable);

  // Assess async correlation reliability
  const asyncCorrelationReliable = assessAsyncCorrelation(detection, limitations, stillAnalyzable);

  // Always analyzable
  stillAnalyzable.push('Events parsed before truncation point');
  stillAnalyzable.push('Code flow analysis (partial)');

  return {
    issueDetectionReliable,
    performanceMetricsReliable,
    limitAnalysisReliable,
    asyncCorrelationReliable,
    limitations,
    stillAnalyzable,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create impact for complete (non-truncated) log
 */
function createCompleteLogImpact(): TruncationAnalysisImpact {
  return {
    issueDetectionReliable: true,
    performanceMetricsReliable: true,
    limitAnalysisReliable: true,
    asyncCorrelationReliable: true,
    limitations: [],
    stillAnalyzable: [
      'All issue detection',
      'Performance analysis',
      'Limit tracking',
      'Async correlation',
    ],
  };
}

/**
 * Assess issue detection reliability
 */
function assessIssueDetection(
  detection: TruncationDetection,
  limitations: string[],
  stillAnalyzable: string[]
): boolean {
  if (detection.severity === 'CRITICAL' || detection.likelyLostInfo.includes('EXCEPTION_DETAILS')) {
    limitations.push('Exception details may be incomplete');
    return false;
  }
  
  stillAnalyzable.push('SOQL/DML anti-pattern detection');
  stillAnalyzable.push('Governor limit warnings (partial)');
  return true;
}

/**
 * Assess performance metrics reliability
 */
function assessPerformanceMetrics(
  detection: TruncationDetection,
  limitations: string[],
  stillAnalyzable: string[]
): boolean {
  if (detection.likelyLostInfo.includes('PERFORMANCE_DATA')) {
    limitations.push('Final execution times unavailable');
    return false;
  }
  
  if (detection.severity === 'MODERATE' || detection.severity === 'MINOR') {
    stillAnalyzable.push('CPU hotspot detection (events before truncation)');
  }
  return true;
}

/**
 * Assess limit analysis reliability
 */
function assessLimitAnalysis(
  detection: TruncationDetection,
  limitations: string[],
  stillAnalyzable: string[]
): boolean {
  if (detection.likelyLostInfo.includes('FINAL_LIMITS')) {
    limitations.push('Final limit summary missing - using in-progress limits');
    return false;
  }
  
  stillAnalyzable.push('Limit tracking from LIMIT_USAGE events');
  return true;
}

/**
 * Assess async correlation reliability
 */
function assessAsyncCorrelation(
  detection: TruncationDetection,
  limitations: string[],
  stillAnalyzable: string[]
): boolean {
  if (detection.likelyLostInfo.includes('ASYNC_CORRELATIONS')) {
    limitations.push('Async job correlation may be incomplete');
    return false;
  }
  
  stillAnalyzable.push('Async job extraction');
  return true;
}
