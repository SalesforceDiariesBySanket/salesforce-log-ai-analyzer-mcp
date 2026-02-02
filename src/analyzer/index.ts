/**
 * @module analyzer/index
 * @description Issue detection and analysis orchestrator
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts, src/types/issues.ts, ./detectors, ./categorizer
 * @lastModified 2026-01-31
 */

import type { EventNode, ParsedLog } from '../types/events';
import type {
  Issue,
  IssueDetector,
  IssueDetectionResult,
  IssueCategory,
  IssueSeverity,
} from '../types/issues';
import { allDetectors, analyzeLimitSummary, type LimitSummary } from './detectors';
import { 
  categorizeIssues, 
  filterBySeverity, 
  filterFixable,
  createCompactSummary,
  generateAIGuidance,
  type CompactSummary,
} from './categorizer';

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze parsed log for issues
 * 
 * This is the main entry point for issue detection. It:
 * 1. Runs all detectors against the events
 * 2. Categorizes and prioritizes issues
 * 3. Returns a comprehensive analysis result
 * 
 * @param parsedLog - Parsed log from the parser module
 * @param options - Analysis options
 * @returns Categorized issue detection result
 * 
 * @example
 * const result = analyzeLog(parsedLog);
 * console.log(`Found ${result.summary.totalCount} issues`);
 * console.log(`Health score: ${result.summary.healthScore}/100`);
 */
export function analyzeLog(
  parsedLog: ParsedLog,
  options: AnalysisOptions = {}
): AnalysisResult {
  const events = parsedLog.events;
  
  // Select detectors to run
  const detectorsToRun = selectDetectors(options);
  
  // Run all detectors
  const allIssues: Issue[] = [];
  const detectorResults: Map<string, Issue[]> = new Map();
  
  for (const detector of detectorsToRun) {
    try {
      const issues = detector.detect(events);
      detectorResults.set(detector.name, issues);
      allIssues.push(...issues);
    } catch (error) {
      // Log error but continue with other detectors
      console.warn(`Detector ${detector.name} failed:`, error);
    }
  }
  
  // Categorize issues
  const categorized = categorizeIssues(allIssues);
  
  // Add limit summary
  const limitSummary = analyzeLimitSummary(events);
  
  // Generate metadata
  const metadata: AnalysisMetadata = {
    eventCount: events.length,
    detectorsRun: detectorsToRun.map(d => d.name),
    analysisTimeMs: 0, // Will be set by wrapper
    truncated: parsedLog.truncation?.isTruncated ?? false,
    logConfidence: parsedLog.confidence.score,
  };
  
  return {
    ...categorized,
    limitSummary,
    metadata,
    aiGuidance: generateAIGuidance(categorized),
  };
}

/**
 * Analyze events directly (without ParsedLog wrapper)
 */
export function analyzeEvents(
  events: EventNode[],
  options: AnalysisOptions = {}
): IssueDetectionResult {
  const detectorsToRun = selectDetectors(options);
  
  const allIssues: Issue[] = [];
  
  for (const detector of detectorsToRun) {
    try {
      const issues = detector.detect(events);
      allIssues.push(...issues);
    } catch (error) {
      console.warn(`Detector ${detector.name} failed:`, error);
    }
  }
  
  return categorizeIssues(allIssues);
}

// ============================================================================
// Detector Selection
// ============================================================================

/**
 * Select which detectors to run based on options
 */
function selectDetectors(options: AnalysisOptions): IssueDetector[] {
  let detectors = [...allDetectors];
  
  // Filter by enabled detectors
  if (options.enabledDetectors && options.enabledDetectors.length > 0) {
    detectors = detectors.filter(d => 
      options.enabledDetectors!.includes(d.name)
    );
  }
  
  // Filter by disabled detectors
  if (options.disabledDetectors && options.disabledDetectors.length > 0) {
    detectors = detectors.filter(d => 
      !options.disabledDetectors!.includes(d.name)
    );
  }
  
  // Filter by issue categories
  if (options.categories && options.categories.length > 0) {
    // Map categories to issue types
    const categoryMap: Record<IssueCategory, string[]> = {
      PERFORMANCE: ['CPU_HOTSPOT', 'CPU_TIMEOUT', 'SLOW_QUERY', 'NON_SELECTIVE_QUERY'],
      GOVERNOR_LIMITS: ['SOQL_LIMIT_NEAR', 'SOQL_LIMIT_EXCEEDED', 'DML_LIMIT_NEAR', 'DML_LIMIT_EXCEEDED', 'HEAP_SIZE_WARNING'],
      ERROR: ['EXCEPTION_THROWN', 'FATAL_ERROR'],
      ANTI_PATTERN: ['SOQL_IN_LOOP', 'DML_IN_LOOP', 'N_PLUS_ONE', 'RECURSIVE_TRIGGER'],
      SECURITY: ['SOQL_INJECTION_RISK'],
      DATA_QUALITY: ['NULL_POINTER'],
      BEST_PRACTICE: ['HARDCODED_ID'],
      MANAGED_PACKAGE: ['MANAGED_PACKAGE_ERROR', 'VENDOR_BOUNDARY_ISSUE'],
    };
    
    const enabledTypes = new Set<string>();
    for (const cat of options.categories) {
      for (const type of categoryMap[cat] || []) {
        enabledTypes.add(type);
      }
    }
    
    detectors = detectors.filter(d => 
      d.detects.some(type => enabledTypes.has(type))
    );
  }
  
  return detectors;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Analysis options
 */
export interface AnalysisOptions {
  /** Only run these detectors (by name) */
  enabledDetectors?: string[];
  /** Skip these detectors (by name) */
  disabledDetectors?: string[];
  /** Only analyze these categories */
  categories?: IssueCategory[];
  /** Minimum severity to report */
  minSeverity?: IssueSeverity;
  /** Include confidence scores in output */
  includeConfidence?: boolean;
}

/**
 * Analysis metadata
 */
export interface AnalysisMetadata {
  /** Number of events analyzed */
  eventCount: number;
  /** Names of detectors that ran */
  detectorsRun: string[];
  /** Time taken for analysis in ms */
  analysisTimeMs: number;
  /** Whether log was truncated */
  truncated: boolean;
  /** Confidence in the parsed log data */
  logConfidence: number;
}

/**
 * Complete analysis result
 */
export interface AnalysisResult extends IssueDetectionResult {
  /** Governor limit summary */
  limitSummary: LimitSummary;
  /** Analysis metadata */
  metadata: AnalysisMetadata;
  /** AI guidance text */
  aiGuidance: string;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick analysis - returns compact summary
 */
export function quickAnalyze(events: EventNode[]): CompactSummary {
  const result = analyzeEvents(events);
  return createCompactSummary(result);
}

/**
 * Get only critical and high severity issues
 */
export function getCriticalIssues(events: EventNode[]): Issue[] {
  const result = analyzeEvents(events);
  return filterBySeverity(result.issues, 'HIGH');
}

/**
 * Get only fixable issues (user code, not managed packages)
 */
export function getFixableIssues(events: EventNode[]): Issue[] {
  const result = analyzeEvents(events);
  return filterFixable(result.issues);
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  // Detectors
  allDetectors,
  analyzeLimitSummary,
  
  // Categorizer utilities
  categorizeIssues,
  filterBySeverity,
  filterFixable,
  createCompactSummary,
  generateAIGuidance,
  
  // Types
  type CompactSummary,
  type LimitSummary,
};

// Re-export from detectors
export * from './detectors';

// Re-export summarizer
export * from './summarizer';

// Re-export debug level validator
export {
  validateDebugLevels,
  generateDebugLevelGuidance,
  DETECTOR_REQUIREMENTS,
  type DebugLevelValidation,
  type DebugLevelWarning,
  type DetectorRequirement,
  type DebugLevel,
  type DebugCategory,
} from './debug-level-validator';

// Re-export level detector (Phase 6)
export {
  detectLogLevels,
  getDetectedCategories,
  hasMinimumLevel,
  summarizeDetection,
  getMissingHigherLevelEvents,
  type LogLevelDetection,
  type LevelEvidence,
} from './level-detector';

// Re-export level capabilities (Phase 6)
export {
  assessCapabilities,
  getDetectorCapabilities,
  getRecommendedLevels,
  getMinimumLevels,
  isCapabilityAvailable,
  getCapabilityNames,
  generateCapabilityGuidance,
  type AnalysisCapability,
  type CapabilityAssessment,
} from './level-capabilities';

// Re-export level limitations (Phase 6)
export {
  generateLimitationReport,
  getQuickReliabilityCheck,
  getLimitationsSummary,
  isAnalysisReliable,
  type AnalysisLimitation,
  type LimitationReport,
  type DebugLevelConfig,
} from './level-limitations';

// Re-export types
export type { Issue, IssueDetector, IssueDetectionResult } from '../types/issues';
