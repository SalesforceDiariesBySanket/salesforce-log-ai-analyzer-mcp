/**
 * @module analyzer/level-limitations
 * @description Report analysis limitations based on debug levels
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/analyzer/level-detector.ts, src/analyzer/level-capabilities.ts
 * @lastModified 2026-01-31
 * 
 * PURPOSE:
 * When debug levels are insufficient, certain analysis becomes unreliable.
 * This module reports:
 * 1. What analysis is affected by low debug levels
 * 2. What false negatives are possible
 * 3. Recommendations for better debug levels
 * 
 * This is critical for AI agents to understand the reliability of analysis.
 */

import type { LogLevelDetection } from './level-detector';
import type { CapabilityAssessment } from './level-capabilities';
import type { DebugLevel, DebugCategory } from './debug-level-validator';
import { assessCapabilities, getRecommendedLevels } from './level-capabilities';

// ============================================================================
// Types
// ============================================================================

/**
 * A single limitation in analysis
 */
export interface AnalysisLimitation {
  /** Limitation identifier */
  id: string;

  /** Severity of limitation */
  severity: 'INFO' | 'WARNING' | 'CRITICAL';

  /** Short title */
  title: string;

  /** Detailed description */
  description: string;

  /** What analysis is affected */
  affectedAnalysis: string[];

  /** Potential false negatives */
  possibleFalseNegatives: string[];

  /** How to fix */
  remediation: string;

  /** Category causing the limitation */
  category?: DebugCategory;

  /** Current level */
  currentLevel?: DebugLevel;

  /** Required level */
  requiredLevel?: DebugLevel;
}

/**
 * Full limitation report
 */
export interface LimitationReport {
  /** Are there any significant limitations? */
  hasSignificantLimitations: boolean;

  /** Overall reliability score (0-100) */
  reliabilityScore: number;

  /** All limitations */
  limitations: AnalysisLimitation[];

  /** Summary for AI */
  summary: string;

  /** AI guidance */
  aiGuidance: string[];

  /** Recommended debug level configuration */
  recommendedConfig: DebugLevelConfig;

  /** What can be trusted */
  trustworthyResults: string[];

  /** What should be treated with caution */
  cautiousResults: string[];
}

/**
 * Debug level configuration recommendation
 */
export interface DebugLevelConfig {
  /** Recommended levels */
  levels: Partial<Record<DebugCategory, DebugLevel>>;

  /** Explanation */
  reason: string;

  /** Expected improvement */
  improvement: string;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a comprehensive limitation report
 * 
 * @param detection - Result from level detector
 * @param capabilities - Optional pre-computed capability assessment
 * @returns Limitation report for AI consumption
 * 
 * @example
 * const detection = detectLogLevels(events, metadata);
 * const report = generateLimitationReport(detection);
 * if (report.hasSignificantLimitations) {
 *   console.log('Analysis limitations:', report.summary);
 * }
 */
export function generateLimitationReport(
  detection: LogLevelDetection,
  capabilities?: CapabilityAssessment
): LimitationReport {
  // Assess capabilities if not provided
  const caps = capabilities || assessCapabilities(detection);

  // Collect all limitations
  const limitations: AnalysisLimitation[] = [];

  // Check detection method limitations
  limitations.push(...checkDetectionMethodLimitations(detection));

  // Check category-specific limitations
  limitations.push(...checkCategoryLimitations(detection, caps));

  // Check detector-specific limitations
  limitations.push(...checkDetectorLimitations(caps));

  // Check for missing critical categories
  limitations.push(...checkMissingCategories(detection));

  // Calculate reliability score
  const reliabilityScore = calculateReliabilityScore(limitations, caps);

  // Determine significant limitations
  const hasSignificantLimitations = limitations.some(
    l => l.severity === 'WARNING' || l.severity === 'CRITICAL'
  );

  // Generate summary
  const summary = generateSummary(limitations, reliabilityScore);

  // Generate AI guidance
  const aiGuidance = generateAIGuidance(limitations, caps);

  // Recommended configuration
  const recommendedConfig = generateRecommendedConfig(detection, limitations);

  // Categorize results
  const { trustworthy, cautious } = categorizeResultTrust(caps);

  return {
    hasSignificantLimitations,
    reliabilityScore,
    limitations,
    summary,
    aiGuidance,
    recommendedConfig,
    trustworthyResults: trustworthy,
    cautiousResults: cautious,
  };
}

// ============================================================================
// Limitation Checkers
// ============================================================================

/**
 * Check limitations from detection method
 */
function checkDetectionMethodLimitations(
  detection: LogLevelDetection
): AnalysisLimitation[] {
  const limitations: AnalysisLimitation[] = [];

  if (detection.detectionMethod === 'UNKNOWN') {
    limitations.push({
      id: 'UNKNOWN_LEVELS',
      severity: 'WARNING',
      title: 'Debug levels unknown',
      description:
        'Could not determine the debug levels used to capture this log. Analysis reliability cannot be assessed.',
      affectedAnalysis: ['All detectors'],
      possibleFalseNegatives: [
        'Issues may be missed if debug levels were too low',
      ],
      remediation:
        'Ensure log includes debug level header or capture with known settings',
    });
  } else if (detection.detectionMethod === 'INFERRED') {
    limitations.push({
      id: 'INFERRED_LEVELS',
      severity: 'INFO',
      title: 'Debug levels inferred',
      description: `Debug levels were inferred from event types present (confidence: ${Math.round(detection.confidence * 100)}%)`,
      affectedAnalysis: [],
      possibleFalseNegatives: [],
      remediation: 'For higher confidence, use logs with explicit debug level headers',
    });
  }

  if (detection.confidence < 0.5) {
    limitations.push({
      id: 'LOW_CONFIDENCE',
      severity: 'WARNING',
      title: 'Low detection confidence',
      description: `Debug level detection confidence is only ${Math.round(detection.confidence * 100)}%`,
      affectedAnalysis: ['All detectors'],
      possibleFalseNegatives: ['Detection accuracy may be reduced'],
      remediation: 'Use logs with more events or explicit debug level configuration',
    });
  }

  return limitations;
}

/**
 * Check category-specific limitations
 */
function checkCategoryLimitations(
  detection: LogLevelDetection,
  _caps: CapabilityAssessment
): AnalysisLimitation[] {
  const limitations: AnalysisLimitation[] = [];
  const recommended = getRecommendedLevels();

  const DEBUG_LEVEL_ORDER: Record<DebugLevel, number> = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
    FINE: 5,
    FINER: 6,
    FINEST: 7,
  };

  // Check each recommended category
  for (const [category, recommendedLevel] of Object.entries(recommended) as [
    DebugCategory,
    DebugLevel
  ][]) {
    const currentLevel = detection.detectedLevels[category];

    if (!currentLevel) {
      limitations.push(createCategoryLimitation(
        category,
        undefined,
        recommendedLevel,
        'Category not detected'
      ));
    } else if (DEBUG_LEVEL_ORDER[currentLevel] < DEBUG_LEVEL_ORDER[recommendedLevel]) {
      limitations.push(createCategoryLimitation(
        category,
        currentLevel,
        recommendedLevel,
        'Level too low'
      ));
    }
  }

  return limitations;
}

/**
 * Create a category limitation
 */
function createCategoryLimitation(
  category: DebugCategory,
  currentLevel: DebugLevel | undefined,
  requiredLevel: DebugLevel,
  reason: string
): AnalysisLimitation {
  const categoryDescriptions: Record<DebugCategory, {
    affected: string[];
    falseNegatives: string[];
  }> = {
    Apex_code: {
      affected: ['CPU hotspot detection', 'Method timing', 'Execution flow'],
      falseNegatives: ['CPU hotspots', 'Slow methods', 'Recursive patterns'],
    },
    Apex_profiling: {
      affected: ['Managed package attribution', 'Namespace tracking'],
      falseNegatives: ['Vendor vs user code attribution'],
    },
    Database: {
      affected: ['SOQL analysis', 'DML analysis', 'Query performance'],
      falseNegatives: ['SOQL in loop', 'N+1 queries', 'Non-selective queries'],
    },
    System: {
      affected: ['Governor limit tracking', 'Heap analysis'],
      falseNegatives: ['Limit warnings', 'Memory issues'],
    },
    Callout: {
      affected: ['External callout tracking'],
      falseNegatives: ['Slow callouts', 'Callout limits'],
    },
    Workflow: {
      affected: ['Flow analysis'],
      falseNegatives: ['Flow performance issues'],
    },
    Validation: {
      affected: ['Validation rule tracking'],
      falseNegatives: ['Validation rule issues'],
    },
    Visualforce: {
      affected: ['Visualforce page analysis'],
      falseNegatives: ['VF performance issues'],
    },
    NBA: {
      affected: ['Next Best Action analysis'],
      falseNegatives: ['NBA issues'],
    },
    Wave: {
      affected: ['Analytics analysis'],
      falseNegatives: ['Analytics issues'],
    },
  };

  const desc = categoryDescriptions[category] || {
    affected: [`${category} analysis`],
    falseNegatives: [`${category} related issues`],
  };

  return {
    id: `${category.toUpperCase()}_LEVEL_LOW`,
    severity: currentLevel === undefined ? 'WARNING' : 'INFO',
    title: `${category.replace('_', ' ')} level: ${currentLevel || 'unknown'} (need ${requiredLevel})`,
    description: `${reason}: ${category} is at ${currentLevel || 'unknown'} but ${requiredLevel} is recommended`,
    affectedAnalysis: desc.affected,
    possibleFalseNegatives: desc.falseNegatives,
    remediation: `Set ${category.replace('_', ' ')} debug level to ${requiredLevel} or higher`,
    category,
    currentLevel,
    requiredLevel,
  };
}

/**
 * Check detector-specific limitations
 */
function checkDetectorLimitations(
  caps: CapabilityAssessment
): AnalysisLimitation[] {
  const limitations: AnalysisLimitation[] = [];

  for (const detector of caps.unavailableDetectors) {
    limitations.push({
      id: `DETECTOR_${detector.replace(/\s+/g, '_').toUpperCase()}_UNAVAILABLE`,
      severity: 'WARNING',
      title: `${detector} unavailable`,
      description: `The ${detector} cannot run due to insufficient debug levels`,
      affectedAnalysis: [detector],
      possibleFalseNegatives: getDetectorFalseNegatives(detector),
      remediation: `Increase debug levels to enable ${detector}`,
    });
  }

  for (const detector of caps.partialDetectors) {
    limitations.push({
      id: `DETECTOR_${detector.replace(/\s+/g, '_').toUpperCase()}_PARTIAL`,
      severity: 'INFO',
      title: `${detector} limited`,
      description: `The ${detector} has reduced accuracy due to debug level settings`,
      affectedAnalysis: [detector],
      possibleFalseNegatives: getDetectorFalseNegatives(detector),
      remediation: `Consider increasing debug levels for better ${detector} accuracy`,
    });
  }

  return limitations;
}

/**
 * Get potential false negatives for a detector
 */
function getDetectorFalseNegatives(detector: string): string[] {
  const mapping: Record<string, string[]> = {
    'CPU Hotspot Detector': [
      'CPU-intensive methods may not be identified',
      'Method execution times unavailable',
    ],
    'SOQL in Loop Detector': [
      'SOQL queries inside loops may be missed',
      'Query-to-method correlation limited',
    ],
    'N+1 Query Detector': [
      'N+1 query patterns may not be identified',
      'Related query grouping limited',
    ],
    'Non-Selective Query Detector': [
      'Non-selective queries cannot be identified',
      'Query execution plans not available',
    ],
    'Recursive Trigger Detector': [
      'Recursive trigger chains may be missed',
      'Trigger re-entry patterns unclear',
    ],
    'Governor Limits Analyzer': [
      'Limit usage may not be tracked',
      'Near-limit warnings unavailable',
    ],
  };

  return mapping[detector] || [`${detector} related issues may be missed`];
}

/**
 * Check for missing critical categories
 */
function checkMissingCategories(
  detection: LogLevelDetection
): AnalysisLimitation[] {
  const limitations: AnalysisLimitation[] = [];
  const critical: DebugCategory[] = ['Apex_code', 'Database', 'System'];

  for (const category of critical) {
    if (!detection.detectedLevels[category]) {
      limitations.push({
        id: `MISSING_${category.toUpperCase()}`,
        severity: 'CRITICAL',
        title: `Missing ${category.replace('_', ' ')} data`,
        description: `No ${category.replace('_', ' ')} events detected in the log`,
        affectedAnalysis: [`All ${category.replace('_', ' ')} related analysis`],
        possibleFalseNegatives: [
          `All ${category.replace('_', ' ')} issues will be missed`,
        ],
        remediation: `Enable ${category.replace('_', ' ')} logging in trace flag settings`,
      });
    }
  }

  return limitations;
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Calculate reliability score
 */
function calculateReliabilityScore(
  limitations: AnalysisLimitation[],
  caps: CapabilityAssessment
): number {
  let score = caps.overallScore;

  // Deduct for limitations
  for (const limitation of limitations) {
    switch (limitation.severity) {
      case 'CRITICAL':
        score -= 20;
        break;
      case 'WARNING':
        score -= 10;
        break;
      case 'INFO':
        score -= 2;
        break;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate summary
 */
function generateSummary(
  limitations: AnalysisLimitation[],
  reliabilityScore: number
): string {
  const criticalCount = limitations.filter(l => l.severity === 'CRITICAL').length;
  const warningCount = limitations.filter(l => l.severity === 'WARNING').length;

  if (criticalCount > 0) {
    return `CRITICAL: ${criticalCount} critical limitation(s) - analysis highly unreliable (${reliabilityScore}% reliability)`;
  } else if (warningCount > 0) {
    return `WARNING: ${warningCount} limitation(s) may affect analysis accuracy (${reliabilityScore}% reliability)`;
  } else if (limitations.length > 0) {
    return `Minor limitations present but analysis should be reliable (${reliabilityScore}% reliability)`;
  } else {
    return `No significant limitations - analysis is reliable (${reliabilityScore}% reliability)`;
  }
}

/**
 * Generate AI guidance
 */
function generateAIGuidance(
  limitations: AnalysisLimitation[],
  caps: CapabilityAssessment
): string[] {
  const guidance: string[] = [];

  // Critical warnings first
  const critical = limitations.filter(l => l.severity === 'CRITICAL');
  if (critical.length > 0) {
    guidance.push(
      'CRITICAL: Log has insufficient data for reliable analysis.'
    );
    guidance.push(
      'FALSE NEGATIVES ARE LIKELY - absence of detected issues does NOT mean code is issue-free.'
    );
  }

  // Summarize unavailable analysis
  if (caps.unavailableDetectors.length > 0) {
    guidance.push(
      `These detectors could not run: ${caps.unavailableDetectors.join(', ')}`
    );
  }

  // Specific false negative warnings
  const allFalseNegatives = new Set<string>();
  for (const limitation of limitations) {
    for (const fn of limitation.possibleFalseNegatives) {
      allFalseNegatives.add(fn);
    }
  }

  if (allFalseNegatives.size > 0) {
    guidance.push('Possible missed issues:');
    for (const fn of [...allFalseNegatives].slice(0, 5)) {
      guidance.push(`  • ${fn}`);
    }
  }

  // Remediation
  if (limitations.length > 0) {
    const remediations = [...new Set(limitations.map(l => l.remediation))];
    if (remediations.length <= 3) {
      guidance.push('To improve analysis:');
      for (const r of remediations) {
        guidance.push(`  • ${r}`);
      }
    } else {
      guidance.push(
        'Increase debug levels (Apex Code: FINE, Database: FINE, System: INFO) for comprehensive analysis.'
      );
    }
  }

  return guidance;
}

/**
 * Generate recommended debug level configuration
 */
function generateRecommendedConfig(
  detection: LogLevelDetection,
  limitations: AnalysisLimitation[]
): DebugLevelConfig {
  const recommended = getRecommendedLevels();
  
  // Check if current config is already good
  const DEBUG_LEVEL_ORDER: Record<DebugLevel, number> = {
    NONE: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4, FINE: 5, FINER: 6, FINEST: 7,
  };

  let needsImprovement = false;
  for (const [cat, level] of Object.entries(recommended) as [DebugCategory, DebugLevel][]) {
    const current = detection.detectedLevels[cat];
    if (!current || DEBUG_LEVEL_ORDER[current] < DEBUG_LEVEL_ORDER[level]) {
      needsImprovement = true;
      break;
    }
  }

  return {
    levels: recommended,
    reason: needsImprovement
      ? 'Current debug levels are insufficient for comprehensive analysis'
      : 'Current debug levels are adequate',
    improvement: needsImprovement
      ? `Would enable: ${limitations.filter(l => l.severity !== 'INFO').map(l => l.affectedAnalysis).flat().slice(0, 3).join(', ')}`
      : 'No improvement needed',
  };
}

/**
 * Categorize which results can be trusted
 */
function categorizeResultTrust(
  caps: CapabilityAssessment
): { trustworthy: string[]; cautious: string[] } {
  const trustworthy: string[] = [];
  const cautious: string[] = [];

  for (const cap of caps.capabilities) {
    if (cap.available && cap.confidence > 0.8) {
      trustworthy.push(cap.name);
    } else if (cap.partial || (cap.available && cap.confidence <= 0.8)) {
      cautious.push(cap.name);
    }
  }

  // Always trust basic parsing
  if (!trustworthy.includes('Basic Issue Detection')) {
    trustworthy.push('Error/Exception detection');
  }

  return { trustworthy, cautious };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a quick reliability assessment
 */
export function getQuickReliabilityCheck(
  detection: LogLevelDetection
): { reliable: boolean; message: string } {
  const caps = assessCapabilities(detection);
  
  if (caps.overallScore >= 70) {
    return {
      reliable: true,
      message: `Analysis reliable (${caps.overallScore}% capability)`,
    };
  } else if (caps.overallScore >= 40) {
    return {
      reliable: false,
      message: `Analysis partially reliable (${caps.overallScore}% capability) - some detectors limited`,
    };
  } else {
    return {
      reliable: false,
      message: `Analysis unreliable (${caps.overallScore}% capability) - increase debug levels`,
    };
  }
}

/**
 * Get limitations summary for display
 */
export function getLimitationsSummary(
  report: LimitationReport,
  maxItems: number = 5
): string[] {
  const summary: string[] = [];

  summary.push(report.summary);

  if (report.hasSignificantLimitations) {
    summary.push('');
    summary.push('Key limitations:');
    
    const significant = report.limitations
      .filter(l => l.severity !== 'INFO')
      .slice(0, maxItems);

    for (const lim of significant) {
      summary.push(`  • ${lim.title}`);
    }
  }

  return summary;
}

/**
 * Check if a specific analysis is reliable
 */
export function isAnalysisReliable(
  analysisName: string,
  report: LimitationReport
): boolean {
  return report.trustworthyResults.includes(analysisName);
}
