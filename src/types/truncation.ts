/**
 * @module types/truncation
 * @description Type definitions for truncation detection and handling
 * @status COMPLETE
 * @see src/types/STATE.md
 * @dependencies src/types/common.ts, src/types/events.ts
 * @lastModified 2026-01-31
 */

import type { Confidence } from './common';
import type { EventNode } from './events';

// ============================================================================
// Truncation Types
// ============================================================================

/**
 * Types of log truncation that can occur
 */
export type TruncationType =
  | 'SIZE_LIMIT'     // 20MB Salesforce limit exceeded
  | 'LINE_LIMIT'     // Maximum lines exceeded
  | 'TIMEOUT'        // Execution timeout caused truncation
  | 'HEAP_LIMIT'     // Log generation stopped due to heap
  | 'MANUAL'         // User or system cancelled
  | 'UNKNOWN';       // Cannot determine reason

/**
 * Truncation severity levels
 */
export type TruncationSeverity =
  | 'NONE'           // No truncation detected
  | 'MINOR'          // Less than 5% estimated loss
  | 'MODERATE'       // 5-20% estimated loss
  | 'SEVERE'         // 20-50% estimated loss
  | 'CRITICAL';      // More than 50% estimated loss

// ============================================================================
// Enhanced Truncation Info
// ============================================================================

/**
 * Detailed truncation detection result
 */
export interface TruncationDetection {
  /** Whether truncation was detected */
  isTruncated: boolean;

  /** Type of truncation */
  truncationType: TruncationType;

  /** Severity assessment */
  severity: TruncationSeverity;

  /** Confidence in truncation detection */
  confidence: Confidence;

  /** Detection indicators */
  indicators: TruncationIndicator[];

  /** What information was likely lost */
  likelyLostInfo: LostInformationType[];

  /** Recommendations for AI */
  aiRecommendations: string[];
}

/**
 * Individual indicator of truncation
 */
export interface TruncationIndicator {
  /** Type of indicator */
  type: TruncationIndicatorType;
  
  /** Whether this indicator was found */
  found: boolean;
  
  /** Location in log (line number) */
  lineNumber?: number;
  
  /** Details about the indicator */
  details?: string;
}

/**
 * Types of truncation indicators
 */
export type TruncationIndicatorType =
  | 'EXPLICIT_MARKER'      // "*** Skipped" or "*** Truncated"
  | 'SIZE_THRESHOLD'       // Near or at 20MB
  | 'ABRUPT_ENDING'        // No EXECUTION_FINISHED
  | 'UNCLOSED_EVENTS'      // METHOD_ENTRY without EXIT
  | 'MISSING_LIMITS'       // No CUMULATIVE_LIMIT_USAGE_END
  | 'MID_LINE_CUT'         // Line cut in the middle
  | 'INCOMPLETE_STACKTRACE'; // Stack trace cut off

/**
 * Types of information that may be lost due to truncation
 */
export type LostInformationType =
  | 'EXCEPTION_DETAILS'    // Exception stack traces
  | 'FINAL_LIMITS'         // Final governor limit summary
  | 'EXECUTION_END'        // How execution concluded
  | 'NESTED_EVENTS'        // Deep call stack events
  | 'ASYNC_CORRELATIONS'   // Links to async jobs
  | 'DEBUG_OUTPUT'         // USER_DEBUG messages
  | 'PERFORMANCE_DATA';    // Timing/duration info

// ============================================================================
// Truncation Recovery
// ============================================================================

/**
 * Strategies for recovering from truncation
 */
export interface TruncationRecoveryStrategy {
  /** Strategy name */
  name: string;
  
  /** Whether this strategy is applicable */
  applicable: boolean;
  
  /** Reason if not applicable */
  notApplicableReason?: string;
  
  /** Steps to implement this strategy */
  steps: string[];
  
  /** Expected improvement */
  expectedImprovement: string;
}

/**
 * Recovery recommendations for truncated logs
 */
export interface TruncationRecoveryPlan {
  /** Overall assessment */
  canRecover: boolean;
  
  /** Confidence in recovery assessment */
  confidence: Confidence;
  
  /** Available strategies */
  strategies: TruncationRecoveryStrategy[];
  
  /** Debug level recommendations */
  debugLevelRecommendations?: DebugLevelRecommendation[];
  
  /** AI guidance for working with truncated data */
  aiWorkingGuidance: string[];
}

/**
 * Debug level adjustment recommendation
 */
export interface DebugLevelRecommendation {
  /** Category (Apex, Database, etc.) */
  category: string;
  
  /** Current level (if known) */
  currentLevel?: string;
  
  /** Recommended level */
  recommendedLevel: string;
  
  /** Reason for recommendation */
  reason: string;
}

// ============================================================================
// Truncation Analysis Result
// ============================================================================

/**
 * Complete truncation analysis result
 */
export interface TruncationAnalysis {
  /** Detection results */
  detection: TruncationDetection;
  
  /** Recovery plan */
  recoveryPlan: TruncationRecoveryPlan;
  
  /** Impact on analysis */
  analysisImpact: TruncationAnalysisImpact;
  
  /** Metadata about the analysis */
  metadata: TruncationAnalysisMetadata;
}

/**
 * How truncation impacts analysis capabilities
 */
export interface TruncationAnalysisImpact {
  /** Can we reliably detect issues? */
  issueDetectionReliable: boolean;
  
  /** Can we calculate performance metrics? */
  performanceMetricsReliable: boolean;
  
  /** Can we do limit analysis? */
  limitAnalysisReliable: boolean;
  
  /** Can we correlate async jobs? */
  asyncCorrelationReliable: boolean;
  
  /** Specific limitations */
  limitations: string[];
  
  /** What we CAN still analyze */
  stillAnalyzable: string[];
}

/**
 * Metadata about truncation analysis
 */
export interface TruncationAnalysisMetadata {
  /** Original log size in bytes */
  originalSize: number;
  
  /** Estimated complete size */
  estimatedCompleteSize?: number;
  
  /** Percent of log analyzed */
  analyzedPercent: number;
  
  /** Last successfully parsed line */
  lastParsedLine: number;
  
  /** Total lines in file */
  totalLines: number;
  
  /** Events before truncation point */
  eventsBeforeTruncation: number;
  
  /** Analysis timestamp */
  analyzedAt: Date;
}

// ============================================================================
// Truncation Handler Interface
// ============================================================================

/**
 * Interface for truncation handling
 */
export interface TruncationHandler {
  /** Detect truncation in content */
  detect(content: string, events: EventNode[]): TruncationDetection;
  
  /** Analyze truncation impact */
  analyzeImpact(detection: TruncationDetection, events: EventNode[]): TruncationAnalysisImpact;
  
  /** Generate recovery plan */
  createRecoveryPlan(detection: TruncationDetection): TruncationRecoveryPlan;
  
  /** Complete analysis */
  analyze(content: string, events: EventNode[]): TruncationAnalysis;
}
