/**
 * @module async/confidence-scorer
 * @description Score correlation confidence between parent and child logs
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/types/async.ts
 * @lastModified 2026-01-31
 */

import type {
  AsyncJobRef,
  AsyncApexJobRecord,
  CorrelationResult,
  CorrelationReason,
  MatchDetail,
} from '../types/async';
import type { ApexLogRecord } from '../types/capture';
import type { Confidence } from '../types/common';

// ============================================================================
// Constants
// ============================================================================

/**
 * Confidence weights for different match reasons
 */
const CONFIDENCE_WEIGHTS: Record<CorrelationReason, number> = {
  JOB_ID_MATCH: 0.95,          // Exact job ID match is very confident
  CLASS_NAME_MATCH: 0.70,      // Class name in operation
  TIMING_MATCH: 0.60,          // Timing correlation
  USER_MATCH: 0.40,            // Same user
  METHOD_SIGNATURE_MATCH: 0.80, // @future method signature
  SEQUENCE_MATCH: 0.65,        // Sequential execution
  BATCH_PATTERN: 0.75,         // Batch job pattern
};

/**
 * Confidence thresholds
 */
const THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.60,
  LOW: 0.40,
};

// ============================================================================
// Correlation Scorer Class
// ============================================================================

/**
 * Scores correlation confidence between logs
 *
 * @example
 * ```typescript
 * const scorer = new CorrelationScorer();
 * const confidence = scorer.calculateConfidence(matchDetails);
 * console.log(`Confidence: ${confidence} (${scorer.getConfidenceLevel(confidence)})`);
 * ```
 */
export class CorrelationScorer {

  /**
   * Calculate overall confidence from match details
   */
  calculateConfidence(matchDetails: MatchDetail[]): number {
    if (matchDetails.length === 0) {
      return 0;
    }

    // Use weighted combination of confidence scores
    let totalWeight = 0;
    let weightedSum = 0;

    for (const detail of matchDetails) {
      const weight = CONFIDENCE_WEIGHTS[detail.reason] || 0.5;
      weightedSum += detail.confidence * weight;
      totalWeight += weight;
    }

    const baseConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Boost for multiple matching reasons
    const multiMatchBoost = Math.min(0.1, (matchDetails.length - 1) * 0.03);

    // Penalize if only timing match (less reliable)
    const timingOnlyPenalty = matchDetails.length === 1 &&
      matchDetails[0]?.reason === 'TIMING_MATCH' ? 0.15 : 0;

    return Math.max(0, Math.min(1, baseConfidence + multiMatchBoost - timingOnlyPenalty));
  }

  /**
   * Get confidence level from score
   */
  getConfidenceLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= THRESHOLDS.HIGH) return 'HIGH';
    if (score >= THRESHOLDS.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Score a potential correlation
   */
  scoreCorrelation(
    jobRef: AsyncJobRef,
    candidateLog: ApexLogRecord,
    asyncJob?: AsyncApexJobRecord
  ): ScoringResult {
    const matchDetails: MatchDetail[] = [];
    const reasons: CorrelationReason[] = [];

    // Score job ID match
    if (asyncJob && jobRef.jobId === asyncJob.Id) {
      reasons.push('JOB_ID_MATCH');
      matchDetails.push({
        reason: 'JOB_ID_MATCH',
        confidence: 0.95,
        description: `Exact job ID match`,
        evidence: asyncJob.Id,
      });
    }

    // Score class name match
    const classNameScore = this.scoreClassNameMatch(jobRef, candidateLog, asyncJob);
    if (classNameScore.matched && classNameScore.detail) {
      reasons.push('CLASS_NAME_MATCH');
      matchDetails.push(classNameScore.detail);
    }

    // Score timing match
    const timingScore = this.scoreTimingMatch(jobRef, candidateLog, asyncJob);
    if (timingScore.matched && timingScore.detail) {
      reasons.push('TIMING_MATCH');
      matchDetails.push(timingScore.detail);
    }

    // Score method signature for @future
    if (jobRef.jobType === 'FUTURE' && jobRef.methodName) {
      const methodScore = this.scoreMethodMatch(jobRef, candidateLog);
      if (methodScore.matched && methodScore.detail) {
        reasons.push('METHOD_SIGNATURE_MATCH');
        matchDetails.push(methodScore.detail);
      }
    }

    // Score batch pattern
    if (jobRef.jobType === 'BATCH' && asyncJob) {
      const batchScore = this.scoreBatchPattern(asyncJob, candidateLog);
      if (batchScore.matched && batchScore.detail) {
        reasons.push('BATCH_PATTERN');
        matchDetails.push(batchScore.detail);
      }
    }

    const confidence = this.calculateConfidence(matchDetails);

    return {
      confidence,
      level: this.getConfidenceLevel(confidence),
      matchDetails,
      reasons,
      isMatch: confidence >= THRESHOLDS.LOW,
    };
  }

  /**
   * Compare two correlations and determine which is better
   */
  compareCorrelations(a: CorrelationResult, b: CorrelationResult): number {
    // Higher confidence wins
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }

    // More match reasons wins
    if (a.matchReasons.length !== b.matchReasons.length) {
      return b.matchReasons.length - a.matchReasons.length;
    }

    // Job ID match wins over others
    const aHasJobId = a.matchReasons.includes('JOB_ID_MATCH');
    const bHasJobId = b.matchReasons.includes('JOB_ID_MATCH');
    if (aHasJobId !== bHasJobId) {
      return aHasJobId ? -1 : 1;
    }

    return 0;
  }

  /**
   * Build a confidence object for the correlation
   */
  buildConfidence(
    score: number,
    matchDetails: MatchDetail[]
  ): Confidence {
    const reasons = matchDetails.map(d => d.description);

    return {
      score,
      reasons,
    };
  }

  // ============================================================================
  // Private Scoring Methods
  // ============================================================================

  /**
   * Score class name match
   */
  private scoreClassNameMatch(
    jobRef: AsyncJobRef,
    log: ApexLogRecord,
    asyncJob?: AsyncApexJobRecord
  ): MatchScoreResult {
    const className = jobRef.className;
    if (className === 'Unknown') {
      return { matched: false };
    }

    const operation = (log.Operation || '').toLowerCase();
    const classLower = className.toLowerCase();

    // Direct class name match in operation
    if (operation.includes(classLower)) {
      return {
        matched: true,
        detail: {
          reason: 'CLASS_NAME_MATCH',
          confidence: 0.8,
          description: `Class "${className}" found in log operation`,
          evidence: log.Operation,
        },
      };
    }

    // Check with namespace prefix removed
    const classWithoutNs = classLower.split('.').pop() || classLower;
    if (operation.includes(classWithoutNs)) {
      return {
        matched: true,
        detail: {
          reason: 'CLASS_NAME_MATCH',
          confidence: 0.65,
          description: `Class "${classWithoutNs}" found in log operation (without namespace)`,
          evidence: log.Operation,
        },
      };
    }

    // Check async job class name
    if (asyncJob && asyncJob.ApexClassName.toLowerCase() === classLower) {
      return {
        matched: true,
        detail: {
          reason: 'CLASS_NAME_MATCH',
          confidence: 0.85,
          description: `AsyncApexJob class matches`,
          evidence: asyncJob.ApexClassName,
        },
      };
    }

    return { matched: false };
  }

  /**
   * Score timing match
   */
  private scoreTimingMatch(
    jobRef: AsyncJobRef,
    log: ApexLogRecord,
    asyncJob?: AsyncApexJobRecord
  ): MatchScoreResult {
    const logTime = new Date(log.StartTime).getTime();
    const enqueuedTime = jobRef.enqueuedAt / 1000000;

    // Log should start after job was enqueued
    if (logTime < enqueuedTime - 5000) {
      return { matched: false };
    }

    const timeDiff = logTime - enqueuedTime;

    // Within 60 seconds is a good match
    if (timeDiff >= -5000 && timeDiff <= 60000) {
      const confidence = timeDiff < 10000 ? 0.8 :
                        timeDiff < 30000 ? 0.6 :
                        0.4;
      return {
        matched: true,
        detail: {
          reason: 'TIMING_MATCH',
          confidence,
          description: `Log started ${Math.round(timeDiff / 1000)}s after job enqueued`,
          evidence: `Enqueued: ${new Date(enqueuedTime).toISOString()}, Log: ${log.StartTime}`,
        },
      };
    }

    // Check against async job timing if available
    if (asyncJob) {
      const jobCreated = new Date(asyncJob.CreatedDate).getTime();
      const jobDiff = logTime - jobCreated;

      if (jobDiff >= -5000 && jobDiff <= 120000) {
        return {
          matched: true,
          detail: {
            reason: 'TIMING_MATCH',
            confidence: jobDiff < 30000 ? 0.7 : 0.5,
            description: `Log started ${Math.round(jobDiff / 1000)}s after AsyncApexJob created`,
            evidence: `Job created: ${asyncJob.CreatedDate}, Log: ${log.StartTime}`,
          },
        };
      }
    }

    return { matched: false };
  }

  /**
   * Score @future method signature match
   */
  private scoreMethodMatch(
    jobRef: AsyncJobRef,
    log: ApexLogRecord
  ): MatchScoreResult {
    if (!jobRef.methodName) {
      return { matched: false };
    }

    const operation = (log.Operation || '').toLowerCase();
    const methodLower = jobRef.methodName.toLowerCase();

    if (operation.includes(methodLower)) {
      return {
        matched: true,
        detail: {
          reason: 'METHOD_SIGNATURE_MATCH',
          confidence: 0.85,
          description: `@future method "${jobRef.methodName}" found in operation`,
          evidence: log.Operation,
        },
      };
    }

    // Check for class.method pattern
    const fullSignature = `${jobRef.className}.${jobRef.methodName}`.toLowerCase();
    if (operation.includes(fullSignature)) {
      return {
        matched: true,
        detail: {
          reason: 'METHOD_SIGNATURE_MATCH',
          confidence: 0.9,
          description: `Full @future signature "${jobRef.className}.${jobRef.methodName}" matched`,
          evidence: log.Operation,
        },
      };
    }

    return { matched: false };
  }

  /**
   * Score batch job pattern
   */
  private scoreBatchPattern(
    asyncJob: AsyncApexJobRecord,
    log: ApexLogRecord
  ): MatchScoreResult {
    // Check if it's a batch job type
    if (asyncJob.JobType !== 'BatchApex' && asyncJob.JobType !== 'BatchApexWorker') {
      return { matched: false };
    }

    const operation = (log.Operation || '').toLowerCase();

    // Check for batch-specific operations
    if (operation.includes('batch') ||
        operation.includes('start()') ||
        operation.includes('execute()') ||
        operation.includes('finish()')) {
      return {
        matched: true,
        detail: {
          reason: 'BATCH_PATTERN',
          confidence: 0.75,
          description: `Batch execution pattern detected`,
          evidence: `Job: ${asyncJob.JobItemsProcessed}/${asyncJob.TotalJobItems} items`,
        },
      };
    }

    return { matched: false };
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Result of scoring a correlation
 */
export interface ScoringResult {
  /** Overall confidence score (0-1) */
  confidence: number;

  /** Confidence level */
  level: 'HIGH' | 'MEDIUM' | 'LOW';

  /** Match details */
  matchDetails: MatchDetail[];

  /** Matched reasons */
  reasons: CorrelationReason[];

  /** Whether this meets minimum threshold */
  isMatch: boolean;
}

/**
 * Result of a single match score check
 */
interface MatchScoreResult {
  /** Whether a match was found */
  matched: boolean;

  /** Match detail if matched */
  detail?: MatchDetail;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick confidence check for a potential correlation
 */
export function quickConfidenceCheck(
  jobRef: AsyncJobRef,
  candidateLog: ApexLogRecord
): number {
  const scorer = new CorrelationScorer();
  const result = scorer.scoreCorrelation(jobRef, candidateLog);
  return result.confidence;
}

/**
 * Get confidence level description
 */
export function getConfidenceDescription(score: number): string {
  if (score >= 0.85) {
    return 'High confidence - very likely the correct child log';
  }
  if (score >= 0.6) {
    return 'Medium confidence - probably the correct child log';
  }
  if (score >= 0.4) {
    return 'Low confidence - might be the correct child log';
  }
  return 'Very low confidence - unlikely to be the correct child log';
}

/**
 * Sort correlations by confidence
 */
export function sortByConfidence(correlations: CorrelationResult[]): CorrelationResult[] {
  const scorer = new CorrelationScorer();
  return [...correlations].sort((a, b) => scorer.compareCorrelations(a, b));
}
