/**
 * @module analyzer/debug-level-validator
 * @description Validate debug levels and warn about insufficient data for detectors
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 * 
 * PURPOSE:
 * Different detectors require different debug levels to function correctly.
 * For example, CPU hotspot detection requires METHOD_ENTRY/EXIT events which
 * are only captured at FINE or finer debug levels for Apex Code.
 * 
 * This module validates the log's debug levels against detector requirements
 * and generates appropriate warnings for the AI agent.
 */

import type { LogMetadata, EventNode } from '../types/events';

// ============================================================================
// Debug Level Definitions
// ============================================================================

/**
 * Salesforce debug levels (ordered from least to most verbose)
 */
export type DebugLevel = 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST';

/**
 * Debug level numeric values for comparison
 */
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

/**
 * Debug level categories in Salesforce
 */
export type DebugCategory =
  | 'Apex_code'
  | 'Apex_profiling'
  | 'Callout'
  | 'Database'
  | 'System'
  | 'Validation'
  | 'Visualforce'
  | 'Workflow'
  | 'NBA'
  | 'Wave';

// ============================================================================
// Detector Requirements
// ============================================================================

/**
 * Requirements for a detector to function correctly
 */
export interface DetectorRequirement {
  /** Detector name */
  detectorName: string;

  /** Required debug categories and minimum levels */
  requiredLevels: Partial<Record<DebugCategory, DebugLevel>>;

  /** Required event types */
  requiredEventTypes: string[];

  /** Description of what's missing if requirements aren't met */
  insufficientDataMessage: string;
}

/**
 * Known detector requirements
 */
export const DETECTOR_REQUIREMENTS: DetectorRequirement[] = [
  {
    detectorName: 'CPU Hotspot Detector',
    requiredLevels: {
      Apex_code: 'FINE',
      Apex_profiling: 'FINE',
    },
    requiredEventTypes: ['METHOD_ENTRY', 'METHOD_EXIT'],
    insufficientDataMessage:
      'CPU hotspot detection requires Apex Code at FINE level or higher to capture METHOD_ENTRY/EXIT events',
  },
  {
    detectorName: 'SOQL in Loop Detector',
    requiredLevels: {
      Database: 'INFO',
      Apex_code: 'DEBUG',
    },
    requiredEventTypes: ['SOQL_EXECUTE_BEGIN', 'METHOD_ENTRY'],
    insufficientDataMessage:
      'SOQL-in-loop detection requires Database at INFO+ and Apex Code at DEBUG+ to correlate queries with method calls',
  },
  {
    detectorName: 'N+1 Query Detector',
    requiredLevels: {
      Database: 'INFO',
    },
    requiredEventTypes: ['SOQL_EXECUTE_BEGIN', 'SOQL_EXECUTE_END'],
    insufficientDataMessage:
      'N+1 query detection requires Database at INFO level to capture query details',
  },
  {
    detectorName: 'Recursive Trigger Detector',
    requiredLevels: {
      Apex_code: 'DEBUG',
      Workflow: 'INFO',
    },
    requiredEventTypes: ['CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED'],
    insufficientDataMessage:
      'Recursive trigger detection requires Apex Code at DEBUG+ to capture trigger execution flow',
  },
  {
    detectorName: 'Non-Selective Query Detector',
    requiredLevels: {
      Database: 'FINE',
    },
    requiredEventTypes: ['SOQL_EXECUTE_EXPLAIN'],
    insufficientDataMessage:
      'Non-selective query detection requires Database at FINE level for query plan analysis',
  },
  {
    detectorName: 'Governor Limits Analyzer',
    requiredLevels: {
      System: 'INFO',
    },
    requiredEventTypes: ['LIMIT_USAGE', 'CUMULATIVE_LIMIT_USAGE'],
    insufficientDataMessage:
      'Governor limits analysis requires System at INFO level to capture limit events',
  },
];

// ============================================================================
// Validation Result
// ============================================================================

/**
 * Result of debug level validation
 */
export interface DebugLevelValidation {
  /** Is the log sufficient for full analysis? */
  isSufficient: boolean;

  /** Overall confidence adjustment */
  confidenceAdjustment: number;

  /** Warnings for AI agent */
  warnings: DebugLevelWarning[];

  /** Detectors that may have incomplete data */
  affectedDetectors: string[];

  /** Recommendations for better debug levels */
  recommendations: string[];
}

/**
 * Warning about a specific debug level issue
 */
export interface DebugLevelWarning {
  /** Affected detector */
  detector: string;

  /** Severity of warning */
  severity: 'INFO' | 'WARNING' | 'ERROR';

  /** Warning message */
  message: string;

  /** Current level (if known) */
  currentLevel?: string;

  /** Required level */
  requiredLevel: string;

  /** Category with the issue */
  category: string;
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate debug levels for analysis requirements
 * 
 * @param metadata - Log metadata with debug levels
 * @param events - Parsed events (to check what's actually available)
 * @returns Validation result with warnings
 * 
 * @example
 * const validation = validateDebugLevels(parsedLog.metadata, parsedLog.events);
 * if (!validation.isSufficient) {
 *   console.warn('Analysis may be incomplete:', validation.warnings);
 * }
 */
export function validateDebugLevels(
  metadata: LogMetadata | undefined,
  events: EventNode[]
): DebugLevelValidation {
  const warnings: DebugLevelWarning[] = [];
  const affectedDetectors: string[] = [];
  const recommendations: string[] = [];

  // Get current debug levels from metadata
  const currentLevels = parseDebugLevels(metadata?.debugLevels);

  // Get available event types from the log
  const availableEventTypes = new Set(events.map(e => e.type));

  // Check each detector's requirements
  for (const requirement of DETECTOR_REQUIREMENTS) {
    const issues = checkDetectorRequirements(
      requirement,
      currentLevels,
      availableEventTypes
    );

    if (issues.length > 0) {
      warnings.push(...issues);
      affectedDetectors.push(requirement.detectorName);
    }
  }

  // Generate recommendations
  if (warnings.length > 0) {
    recommendations.push(
      'Consider increasing debug levels for more accurate analysis:',
      '• Apex Code: FINE (for method-level profiling)',
      '• Database: FINE (for query plan analysis)',
      '• System: INFO (for limit tracking)'
    );
  }

  // Calculate confidence adjustment
  const confidenceAdjustment = calculateConfidenceAdjustment(warnings);

  return {
    isSufficient: warnings.filter(w => w.severity !== 'INFO').length === 0,
    confidenceAdjustment,
    warnings,
    affectedDetectors,
    recommendations,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse debug levels from metadata string
 */
function parseDebugLevels(
  debugLevels: Record<string, string> | undefined
): Map<DebugCategory, DebugLevel> {
  const levels = new Map<DebugCategory, DebugLevel>();

  if (!debugLevels) {
    return levels;
  }

  for (const [category, level] of Object.entries(debugLevels)) {
    const normalizedCategory = category.replace(' ', '_') as DebugCategory;
    const normalizedLevel = level.toUpperCase() as DebugLevel;
    
    if (DEBUG_LEVEL_ORDER[normalizedLevel] !== undefined) {
      levels.set(normalizedCategory, normalizedLevel);
    }
  }

  return levels;
}

/**
 * Check if a detector's requirements are met
 */
function checkDetectorRequirements(
  requirement: DetectorRequirement,
  currentLevels: Map<DebugCategory, DebugLevel>,
  availableEventTypes: Set<string>
): DebugLevelWarning[] {
  const warnings: DebugLevelWarning[] = [];

  // Check debug level requirements
  for (const [category, requiredLevel] of Object.entries(requirement.requiredLevels)) {
    const currentLevel = currentLevels.get(category as DebugCategory);
    
    if (!currentLevel) {
      // Level unknown - check if required events exist
      const hasRequiredEvents = requirement.requiredEventTypes.some(t => 
        availableEventTypes.has(t)
      );

      if (!hasRequiredEvents) {
        warnings.push({
          detector: requirement.detectorName,
          severity: 'WARNING',
          message: `${requirement.insufficientDataMessage}. Debug level for ${category} is unknown.`,
          requiredLevel: requiredLevel,
          category: category,
        });
      }
    } else if (compareLevels(currentLevel, requiredLevel) < 0) {
      warnings.push({
        detector: requirement.detectorName,
        severity: 'WARNING',
        message: requirement.insufficientDataMessage,
        currentLevel: currentLevel,
        requiredLevel: requiredLevel,
        category: category,
      });
    }
  }

  // Check if required events are present (even if levels seem correct)
  const missingEvents = requirement.requiredEventTypes.filter(
    t => !availableEventTypes.has(t)
  );

  if (missingEvents.length === requirement.requiredEventTypes.length) {
    // All required events are missing
    warnings.push({
      detector: requirement.detectorName,
      severity: 'ERROR',
      message: `No ${missingEvents.join(' or ')} events found. ${requirement.insufficientDataMessage}`,
      requiredLevel: 'N/A',
      category: 'Events',
    });
  }

  return warnings;
}

/**
 * Compare two debug levels
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
function compareLevels(a: DebugLevel, b: DebugLevel): number {
  return DEBUG_LEVEL_ORDER[a] - DEBUG_LEVEL_ORDER[b];
}

/**
 * Calculate confidence adjustment based on warnings
 */
function calculateConfidenceAdjustment(warnings: DebugLevelWarning[]): number {
  let adjustment = 0;

  for (const warning of warnings) {
    switch (warning.severity) {
      case 'ERROR':
        adjustment -= 0.2;
        break;
      case 'WARNING':
        adjustment -= 0.1;
        break;
      case 'INFO':
        adjustment -= 0.02;
        break;
    }
  }

  // Cap the adjustment
  return Math.max(adjustment, -0.5);
}

// ============================================================================
// AI Guidance
// ============================================================================

/**
 * Generate AI guidance about debug level limitations
 */
export function generateDebugLevelGuidance(
  validation: DebugLevelValidation
): string[] {
  const guidance: string[] = [];

  if (!validation.isSufficient) {
    guidance.push(
      'IMPORTANT: Analysis may be incomplete due to insufficient debug levels.'
    );

    if (validation.affectedDetectors.length > 0) {
      guidance.push(
        `The following detectors may miss issues: ${validation.affectedDetectors.join(', ')}`
      );
    }

    guidance.push(
      'False negatives are possible - absence of detected issues does not guarantee code is issue-free.'
    );
  }

  return guidance;
}
