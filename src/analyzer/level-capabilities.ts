/**
 * @module analyzer/level-capabilities
 * @description Map debug levels to detection capabilities
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/analyzer/level-detector.ts, src/analyzer/debug-level-validator.ts
 * @lastModified 2026-01-31
 * 
 * PURPOSE:
 * Different debug levels enable different analysis capabilities.
 * This module maps detected debug levels to:
 * 1. Which detectors can run effectively
 * 2. What metrics can be accurately measured
 * 3. What level of detail is available
 * 
 * This helps the AI understand what analysis is reliable vs speculative.
 */

import type { LogLevelDetection } from './level-detector';
import type { DebugLevel, DebugCategory } from './debug-level-validator';

// ============================================================================
// Types
// ============================================================================

/**
 * Analysis capability based on debug levels
 */
export interface AnalysisCapability {
  /** Capability name */
  name: string;

  /** Whether this capability is fully available */
  available: boolean;

  /** Partial availability (some features work) */
  partial: boolean;

  /** Confidence level (0-1) */
  confidence: number;

  /** What's missing if not fully available */
  missingFor?: string;

  /** Required debug level */
  requiredLevel?: string;
}

/**
 * Full capability assessment
 */
export interface CapabilityAssessment {
  /** Overall capability score (0-100) */
  overallScore: number;

  /** Individual capabilities */
  capabilities: AnalysisCapability[];

  /** Fully available detectors */
  availableDetectors: string[];

  /** Partially available detectors */
  partialDetectors: string[];

  /** Unavailable detectors */
  unavailableDetectors: string[];

  /** Available metrics */
  availableMetrics: string[];

  /** Unavailable metrics */
  unavailableMetrics: string[];

  /** Summary for AI */
  summary: string;
}

/**
 * Capability definition
 */
interface CapabilityDefinition {
  name: string;
  description: string;
  requirements: Partial<Record<DebugCategory, DebugLevel>>;
  detectors?: string[];
  metrics?: string[];
}

// ============================================================================
// Capability Definitions
// ============================================================================

/**
 * All analysis capabilities and their requirements
 */
const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  {
    name: 'Basic Issue Detection',
    description: 'Detect exceptions, errors, and basic limit issues',
    requirements: {
      Apex_code: 'ERROR',
      System: 'INFO',
    },
    detectors: ['Governor Limits Analyzer'],
    metrics: ['exceptionCount', 'errorCount'],
  },
  {
    name: 'SOQL Analysis',
    description: 'Analyze SOQL queries, detect SOQL-in-loop and N+1 patterns',
    requirements: {
      Database: 'INFO',
    },
    detectors: ['SOQL in Loop Detector', 'N+1 Query Detector'],
    metrics: ['soqlCount', 'soqlRows'],
  },
  {
    name: 'DML Analysis',
    description: 'Analyze DML operations and bulk patterns',
    requirements: {
      Database: 'INFO',
    },
    detectors: [],
    metrics: ['dmlCount', 'dmlRows'],
  },
  {
    name: 'Query Performance',
    description: 'Analyze query execution plans and selectivity',
    requirements: {
      Database: 'FINE',
    },
    detectors: ['Non-Selective Query Detector'],
    metrics: ['queryPlanAvailable', 'selectivityScores'],
  },
  {
    name: 'CPU Profiling',
    description: 'Method-level CPU time analysis and hotspot detection',
    requirements: {
      Apex_code: 'FINE',
      Apex_profiling: 'FINE',
    },
    detectors: ['CPU Hotspot Detector'],
    metrics: ['methodTimes', 'cpuHotspots'],
  },
  {
    name: 'Execution Flow',
    description: 'Track code unit and method execution flow',
    requirements: {
      Apex_code: 'DEBUG',
    },
    detectors: ['Recursive Trigger Detector'],
    metrics: ['codeUnits', 'triggerFlow'],
  },
  {
    name: 'Variable Tracking',
    description: 'Track variable assignments and values',
    requirements: {
      Apex_code: 'FINER',
    },
    detectors: [],
    metrics: ['variableValues'],
  },
  {
    name: 'Statement Level',
    description: 'Line-by-line execution tracking',
    requirements: {
      Apex_code: 'FINEST',
    },
    detectors: [],
    metrics: ['statementCount', 'lineByLine'],
  },
  {
    name: 'Heap Analysis',
    description: 'Track heap allocations and memory usage',
    requirements: {
      System: 'FINER',
    },
    detectors: [],
    metrics: ['heapAllocations', 'memoryPattern'],
  },
  {
    name: 'Flow Analysis',
    description: 'Analyze Salesforce Flow execution',
    requirements: {
      Workflow: 'INFO',
    },
    detectors: [],
    metrics: ['flowInterviews', 'flowElements'],
  },
  {
    name: 'Callout Tracking',
    description: 'Track external HTTP callouts',
    requirements: {
      Callout: 'INFO',
    },
    detectors: [],
    metrics: ['calloutCount', 'calloutTimes'],
  },
  {
    name: 'Managed Package Attribution',
    description: 'Attribute events to managed packages',
    requirements: {
      Apex_profiling: 'INFO',
    },
    detectors: [],
    metrics: ['namespaceUsage'],
  },
];

// ============================================================================
// Debug Level Order
// ============================================================================

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

// ============================================================================
// Main Function
// ============================================================================

/**
 * Assess analysis capabilities based on detected debug levels
 * 
 * @param detection - Result from level detector
 * @returns Capability assessment
 * 
 * @example
 * const detection = detectLogLevels(events, metadata);
 * const capabilities = assessCapabilities(detection);
 * console.log('Available detectors:', capabilities.availableDetectors);
 */
export function assessCapabilities(
  detection: LogLevelDetection
): CapabilityAssessment {
  const capabilities: AnalysisCapability[] = [];
  const availableDetectors = new Set<string>();
  const partialDetectors = new Set<string>();
  const unavailableDetectors = new Set<string>();
  const availableMetrics = new Set<string>();
  const unavailableMetrics = new Set<string>();

  // Assess each capability
  for (const def of CAPABILITY_DEFINITIONS) {
    const assessment = assessCapability(def, detection);
    capabilities.push(assessment);

    // Track detectors
    for (const detector of def.detectors || []) {
      if (assessment.available) {
        availableDetectors.add(detector);
      } else if (assessment.partial) {
        partialDetectors.add(detector);
      } else {
        unavailableDetectors.add(detector);
      }
    }

    // Track metrics
    for (const metric of def.metrics || []) {
      if (assessment.available || assessment.partial) {
        availableMetrics.add(metric);
      } else {
        unavailableMetrics.add(metric);
      }
    }
  }

  // Remove partial detectors that are fully available
  for (const detector of availableDetectors) {
    partialDetectors.delete(detector);
  }

  // Remove unavailable detectors that are partial or available
  for (const detector of availableDetectors) {
    unavailableDetectors.delete(detector);
  }
  for (const detector of partialDetectors) {
    unavailableDetectors.delete(detector);
  }

  // Calculate overall score
  const availableCount = capabilities.filter(c => c.available).length;
  const partialCount = capabilities.filter(c => c.partial && !c.available).length;
  const overallScore = Math.round(
    ((availableCount * 100 + partialCount * 50) / capabilities.length)
  );

  // Generate summary
  const summary = generateCapabilitySummary(
    overallScore,
    availableDetectors.size,
    partialDetectors.size,
    unavailableDetectors.size
  );

  return {
    overallScore,
    capabilities,
    availableDetectors: [...availableDetectors],
    partialDetectors: [...partialDetectors],
    unavailableDetectors: [...unavailableDetectors],
    availableMetrics: [...availableMetrics],
    unavailableMetrics: [...unavailableMetrics],
    summary,
  };
}

/**
 * Assess a single capability
 */
function assessCapability(
  definition: CapabilityDefinition,
  detection: LogLevelDetection
): AnalysisCapability {
  let fullyMet = true;
  let partiallyMet = false;
  let totalConfidence = 0;
  let requirements = 0;
  let missingCategory: string | undefined;
  let requiredLevel: string | undefined;

  for (const [category, requiredLvl] of Object.entries(definition.requirements)) {
    requirements++;
    const currentLevel = detection.detectedLevels[category as DebugCategory];

    if (currentLevel) {
      const current = DEBUG_LEVEL_ORDER[currentLevel];
      const required = DEBUG_LEVEL_ORDER[requiredLvl];

      if (current >= required) {
        totalConfidence += 1;
        partiallyMet = true;
      } else {
        fullyMet = false;
        missingCategory = category;
        requiredLevel = requiredLvl;
        // Partial credit if close
        if (current >= required - 1) {
          totalConfidence += 0.5;
          partiallyMet = true;
        }
      }
    } else {
      fullyMet = false;
      missingCategory = category;
      requiredLevel = requiredLvl;
      
      // Check if inferred from events
      if (detection.evidence.some(e => e.category === category)) {
        totalConfidence += 0.3;
        partiallyMet = true;
      }
    }
  }

  const confidence = requirements > 0 ? totalConfidence / requirements : 0;

  return {
    name: definition.name,
    available: fullyMet && confidence > 0.8,
    partial: partiallyMet && !fullyMet,
    confidence: Math.min(confidence * detection.confidence, 1),
    missingFor: fullyMet ? undefined : missingCategory,
    requiredLevel: fullyMet ? undefined : requiredLevel,
  };
}

/**
 * Generate capability summary
 */
function generateCapabilitySummary(
  score: number,
  available: number,
  partial: number,
  unavailable: number
): string {
  const total = available + partial + unavailable;

  if (score >= 80) {
    return `Full analysis capability (${score}%): All ${available} detectors fully available`;
  } else if (score >= 50) {
    return `Partial analysis capability (${score}%): ${available} detectors available, ${partial} partial, ${unavailable} unavailable`;
  } else if (score >= 20) {
    return `Limited analysis capability (${score}%): Only ${available}/${total} detectors available. Consider increasing debug levels.`;
  } else {
    return `Minimal analysis capability (${score}%): Debug levels too low for effective analysis. Increase to at least DEBUG.`;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get capabilities for a specific detector
 */
export function getDetectorCapabilities(
  detectorName: string,
  detection: LogLevelDetection
): AnalysisCapability | null {
  // Find capability that includes this detector
  const capDef = CAPABILITY_DEFINITIONS.find(
    def => def.detectors?.includes(detectorName)
  );

  if (!capDef) {
    return null;
  }

  return assessCapability(capDef, detection);
}

/**
 * Get recommended debug levels for full capability
 */
export function getRecommendedLevels(): Partial<Record<DebugCategory, DebugLevel>> {
  return {
    Apex_code: 'FINE',
    Apex_profiling: 'FINE',
    Database: 'FINE',
    System: 'INFO',
    Callout: 'INFO',
    Workflow: 'INFO',
  };
}

/**
 * Get minimum debug levels for basic analysis
 */
export function getMinimumLevels(): Partial<Record<DebugCategory, DebugLevel>> {
  return {
    Apex_code: 'DEBUG',
    Database: 'INFO',
    System: 'INFO',
  };
}

/**
 * Check if a specific capability is available
 */
export function isCapabilityAvailable(
  capabilityName: string,
  detection: LogLevelDetection
): boolean {
  const def = CAPABILITY_DEFINITIONS.find(d => d.name === capabilityName);
  
  if (!def) {
    return false;
  }

  const assessment = assessCapability(def, detection);
  return assessment.available;
}

/**
 * Get all capability names
 */
export function getCapabilityNames(): string[] {
  return CAPABILITY_DEFINITIONS.map(d => d.name);
}

/**
 * Generate AI guidance for capability gaps
 */
export function generateCapabilityGuidance(
  assessment: CapabilityAssessment
): string[] {
  const guidance: string[] = [];

  if (assessment.overallScore < 50) {
    guidance.push(
      'IMPORTANT: Debug log levels are too low for comprehensive analysis.'
    );
    guidance.push(
      'Results may be incomplete. Recommend re-running with higher debug levels.'
    );
  }

  if (assessment.unavailableDetectors.length > 0) {
    guidance.push(
      `The following detectors cannot run: ${assessment.unavailableDetectors.join(', ')}`
    );
  }

  if (assessment.partialDetectors.length > 0) {
    guidance.push(
      `These detectors may have reduced accuracy: ${assessment.partialDetectors.join(', ')}`
    );
  }

  // Specific recommendations
  for (const cap of assessment.capabilities) {
    if (!cap.available && cap.missingFor && cap.requiredLevel) {
      guidance.push(
        `For ${cap.name}: Set ${cap.missingFor} to ${cap.requiredLevel} or higher`
      );
    }
  }

  return guidance;
}
