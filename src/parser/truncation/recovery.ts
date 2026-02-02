/**
 * @module parser/truncation/recovery
 * @description Recovery planning for truncated debug logs
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/truncation.ts
 * @lastModified 2026-02-01
 */

import type {
  TruncationDetection,
  TruncationRecoveryPlan,
  TruncationRecoveryStrategy,
  DebugLevelRecommendation,
} from '../../types/truncation';
import { confidence } from '../../types/common';

// ============================================================================
// Recovery Plan Creation
// ============================================================================

/**
 * Create a recovery plan for truncated logs
 * 
 * @param detection - Truncation detection result
 * @returns Recovery plan with strategies and recommendations
 */
export function createRecoveryPlan(detection: TruncationDetection): TruncationRecoveryPlan {
  if (!detection.isTruncated || detection.severity === 'NONE') {
    return {
      canRecover: true,
      confidence: confidence(1.0, ['No truncation - no recovery needed']),
      strategies: [],
      aiWorkingGuidance: ['Proceed with normal analysis'],
    };
  }

  const strategies: TruncationRecoveryStrategy[] = [];
  const debugRecommendations: DebugLevelRecommendation[] = [];

  // Strategy 1: Reduce debug levels
  strategies.push(createReduceDebugLevelsStrategy(detection));

  if (detection.truncationType === 'SIZE_LIMIT') {
    debugRecommendations.push(
      { category: 'Validation', recommendedLevel: 'ERROR', reason: 'Reduce noise' },
      { category: 'Workflow', recommendedLevel: 'ERROR', reason: 'Reduce noise' },
      { category: 'System', recommendedLevel: 'INFO', reason: 'Keep essential only' },
    );
  }

  // Strategy 2: Split operation
  strategies.push(createSplitOperationStrategy());

  // Strategy 3: Use targeted trace flags
  strategies.push(createTargetedTraceFlagsStrategy());

  // Strategy 4: Request extended logging (if critical)
  if (detection.severity === 'CRITICAL' || detection.severity === 'SEVERE') {
    strategies.push(createExtendedLoggingStrategy());
  }

  // AI working guidance
  const aiWorkingGuidance = [
    ...detection.aiRecommendations,
    'Focus analysis on events that are complete',
    'Flag findings as "partial" when data may be incomplete',
    'Recommend re-running with optimized debug levels if critical info missing',
  ];

  return {
    canRecover: true,
    confidence: confidence(0.8, ['Recovery strategies available']),
    strategies,
    debugLevelRecommendations: debugRecommendations.length > 0 ? debugRecommendations : undefined,
    aiWorkingGuidance,
  };
}

// ============================================================================
// Strategy Builders
// ============================================================================

/**
 * Create strategy for reducing debug levels
 */
function createReduceDebugLevelsStrategy(detection: TruncationDetection): TruncationRecoveryStrategy {
  return {
    name: 'Reduce Debug Levels',
    applicable: detection.truncationType === 'SIZE_LIMIT',
    steps: [
      'Open Developer Console or use Trace Flag API',
      'Lower debug levels for non-essential categories',
      'Set Validation, Workflow, System to NONE or ERROR',
      'Keep Apex and Database at needed levels',
      'Re-run the operation to capture a new log',
    ],
    expectedImprovement: '50-80% reduction in log size',
  };
}

/**
 * Create strategy for splitting operations
 */
function createSplitOperationStrategy(): TruncationRecoveryStrategy {
  return {
    name: 'Split Operation',
    applicable: true,
    steps: [
      'If processing many records, reduce batch size',
      'If complex transaction, break into smaller transactions',
      'Use targeted debug logs for specific code paths',
    ],
    expectedImprovement: 'Smaller log files, complete capture',
  };
}

/**
 * Create strategy for targeted trace flags
 */
function createTargetedTraceFlagsStrategy(): TruncationRecoveryStrategy {
  return {
    name: 'Targeted Trace Flags',
    applicable: true,
    steps: [
      'Identify the specific class or trigger causing issues',
      'Create a trace flag only for that component',
      'Use shorter duration (e.g., 5 minutes)',
      'Trigger only the specific operation',
    ],
    expectedImprovement: 'Focused log with complete information',
  };
}

/**
 * Create strategy for extended logging
 */
function createExtendedLoggingStrategy(): TruncationRecoveryStrategy {
  return {
    name: 'Request Extended Logging',
    applicable: true,
    notApplicableReason: undefined,
    steps: [
      'Contact Salesforce support for extended logging',
      'Enable checkpoint debugging in Developer Console',
      'Use ISVs partner tools with extended limits',
    ],
    expectedImprovement: 'Complete log capture for critical issues',
  };
}

// ============================================================================
// Debug Level Optimization
// ============================================================================

/**
 * Get optimized debug level recommendations based on suspected issue
 * 
 * @param suspectedIssue - Type of issue being investigated
 * @returns Array of debug level recommendations
 */
export function getOptimizedDebugLevels(
  suspectedIssue: 'SOQL' | 'CPU' | 'TRIGGER' | 'CALLOUT' | 'FLOW' | 'GENERAL'
): DebugLevelRecommendation[] {
  const baseRecommendations: DebugLevelRecommendation[] = [
    { category: 'Validation', recommendedLevel: 'NONE', reason: 'Not needed for most debugging' },
    { category: 'Visualforce', recommendedLevel: 'NONE', reason: 'Not needed for most debugging' },
    { category: 'NBA', recommendedLevel: 'NONE', reason: 'Not needed for most debugging' },
    { category: 'Wave', recommendedLevel: 'NONE', reason: 'Not needed for most debugging' },
  ];

  switch (suspectedIssue) {
    case 'SOQL':
      return [
        ...baseRecommendations,
        { category: 'Database', recommendedLevel: 'FINEST', reason: 'Capture all query details' },
        { category: 'Apex_code', recommendedLevel: 'FINE', reason: 'Capture method flow' },
        { category: 'Apex_profiling', recommendedLevel: 'FINEST', reason: 'Capture timing' },
        { category: 'Workflow', recommendedLevel: 'ERROR', reason: 'Reduce noise' },
        { category: 'System', recommendedLevel: 'INFO', reason: 'Minimal system logs' },
      ];

    case 'CPU':
      return [
        ...baseRecommendations,
        { category: 'Apex_code', recommendedLevel: 'FINE', reason: 'Capture method entry/exit' },
        { category: 'Apex_profiling', recommendedLevel: 'FINEST', reason: 'Capture detailed timing' },
        { category: 'Database', recommendedLevel: 'FINE', reason: 'Capture query timing' },
        { category: 'System', recommendedLevel: 'DEBUG', reason: 'Track CPU allocation' },
        { category: 'Workflow', recommendedLevel: 'ERROR', reason: 'Reduce noise' },
      ];

    case 'TRIGGER':
      return [
        ...baseRecommendations,
        { category: 'Apex_code', recommendedLevel: 'FINEST', reason: 'Capture all trigger flow' },
        { category: 'Database', recommendedLevel: 'FINE', reason: 'Capture DML operations' },
        { category: 'Workflow', recommendedLevel: 'FINER', reason: 'Track workflow triggers' },
        { category: 'System', recommendedLevel: 'INFO', reason: 'Track recursion' },
      ];

    case 'CALLOUT':
      return [
        ...baseRecommendations,
        { category: 'Callout', recommendedLevel: 'FINEST', reason: 'Capture full request/response' },
        { category: 'Apex_code', recommendedLevel: 'FINE', reason: 'Capture method flow' },
        { category: 'System', recommendedLevel: 'DEBUG', reason: 'Track HTTP details' },
        { category: 'Database', recommendedLevel: 'ERROR', reason: 'Reduce noise' },
        { category: 'Workflow', recommendedLevel: 'ERROR', reason: 'Reduce noise' },
      ];

    case 'FLOW':
      return [
        ...baseRecommendations,
        { category: 'Workflow', recommendedLevel: 'FINEST', reason: 'Capture all flow details' },
        { category: 'Validation', recommendedLevel: 'INFO', reason: 'Track validation rules' },
        { category: 'Apex_code', recommendedLevel: 'FINE', reason: 'Capture invocable actions' },
        { category: 'Database', recommendedLevel: 'FINE', reason: 'Track flow DML' },
        { category: 'System', recommendedLevel: 'INFO', reason: 'Track flow errors' },
      ];

    case 'GENERAL':
    default:
      return [
        ...baseRecommendations,
        { category: 'Apex_code', recommendedLevel: 'FINE', reason: 'Balanced capture' },
        { category: 'Database', recommendedLevel: 'FINE', reason: 'Balanced capture' },
        { category: 'Workflow', recommendedLevel: 'INFO', reason: 'Track major workflow events' },
        { category: 'System', recommendedLevel: 'INFO', reason: 'Track system events' },
        { category: 'Callout', recommendedLevel: 'INFO', reason: 'Track callout events' },
      ];
  }
}
