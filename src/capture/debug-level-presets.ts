/**
 * @module capture/debug-level-presets
 * @description Debug level presets optimized for different analysis types
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts
 * @lastModified 2026-01-31
 */

import type {
  DebugLevel,
  DebugLogLevel,
  DebugLogCategory,
  DebugLevelPreset,
} from '../types/capture';

// ============================================================================
// Debug Level Constants
// ============================================================================

/** All debug log categories */
export const ALL_CATEGORIES: DebugLogCategory[] = [
  'Apex_code',
  'Apex_profiling',
  'Callout',
  'Database',
  'System',
  'Validation',
  'Visualforce',
  'Workflow',
  'NBA',
  'Wave',
];

/** Log levels in order of verbosity */
export const LOG_LEVEL_ORDER: DebugLogLevel[] = [
  'NONE',
  'ERROR',
  'WARN',
  'INFO',
  'DEBUG',
  'FINE',
  'FINER',
  'FINEST',
];

// ============================================================================
// Preset Definitions
// ============================================================================

/**
 * Minimal preset - lowest overhead, basic error detection
 */
export const PRESET_MINIMAL: DebugLevelPreset = {
  name: 'minimal',
  description: 'Minimal logging for production environments with low overhead',
  optimizedFor: ['exceptions', 'critical_errors'],
  expectedLogSize: 'small',
  performanceImpact: 'low',
  debugLevel: {
    developerName: 'SFDebug_Minimal',
    masterLabel: 'SF Debug Analyzer - Minimal',
    levels: {
      Apex_code: 'ERROR',
      Apex_profiling: 'NONE',
      Callout: 'ERROR',
      Database: 'ERROR',
      System: 'ERROR',
      Validation: 'ERROR',
      Visualforce: 'ERROR',
      Workflow: 'ERROR',
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

/**
 * SOQL Analysis preset - optimized for query performance issues
 */
export const PRESET_SOQL_ANALYSIS: DebugLevelPreset = {
  name: 'soql_analysis',
  description: 'Optimized for detecting SOQL performance issues (N+1, non-selective, SOQL in loops)',
  optimizedFor: ['soql_in_loop', 'n_plus_one', 'non_selective_query', 'query_performance'],
  expectedLogSize: 'medium',
  performanceImpact: 'medium',
  debugLevel: {
    developerName: 'SFDebug_SOQL',
    masterLabel: 'SF Debug Analyzer - SOQL Analysis',
    levels: {
      Apex_code: 'DEBUG',      // Need method entry/exit for loop detection
      Apex_profiling: 'FINE',  // Need profiling for performance
      Callout: 'ERROR',
      Database: 'FINEST',      // Maximum detail for SOQL analysis
      System: 'DEBUG',
      Validation: 'INFO',
      Visualforce: 'ERROR',
      Workflow: 'INFO',
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

/**
 * Governor Limits preset - optimized for limit consumption analysis
 */
export const PRESET_GOVERNOR_LIMITS: DebugLevelPreset = {
  name: 'governor_limits',
  description: 'Optimized for tracking governor limit consumption',
  optimizedFor: ['governor_limits', 'cpu_time', 'heap_size', 'soql_queries', 'dml_statements'],
  expectedLogSize: 'medium',
  performanceImpact: 'medium',
  debugLevel: {
    developerName: 'SFDebug_Limits',
    masterLabel: 'SF Debug Analyzer - Governor Limits',
    levels: {
      Apex_code: 'DEBUG',
      Apex_profiling: 'FINEST',  // Maximum profiling for CPU analysis
      Callout: 'INFO',
      Database: 'FINE',
      System: 'DEBUG',
      Validation: 'INFO',
      Visualforce: 'INFO',
      Workflow: 'DEBUG',
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

/**
 * Triggers preset - optimized for trigger analysis
 */
export const PRESET_TRIGGERS: DebugLevelPreset = {
  name: 'triggers',
  description: 'Optimized for detecting trigger issues (recursion, bulkification)',
  optimizedFor: ['recursive_trigger', 'trigger_performance', 'bulkification'],
  expectedLogSize: 'large',
  performanceImpact: 'medium',
  debugLevel: {
    developerName: 'SFDebug_Triggers',
    masterLabel: 'SF Debug Analyzer - Trigger Analysis',
    levels: {
      Apex_code: 'FINE',       // Need CODE_UNIT events for trigger tracking
      Apex_profiling: 'FINE',
      Callout: 'ERROR',
      Database: 'FINE',        // Track DML operations
      System: 'DEBUG',
      Validation: 'DEBUG',
      Visualforce: 'ERROR',
      Workflow: 'DEBUG',       // Workflow can trigger recursion
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

/**
 * CPU Hotspots preset - optimized for CPU performance analysis
 */
export const PRESET_CPU_HOTSPOTS: DebugLevelPreset = {
  name: 'cpu_hotspots',
  description: 'Optimized for finding CPU-intensive code',
  optimizedFor: ['cpu_hotspots', 'method_performance', 'slow_code'],
  expectedLogSize: 'large',
  performanceImpact: 'high',
  debugLevel: {
    developerName: 'SFDebug_CPU',
    masterLabel: 'SF Debug Analyzer - CPU Hotspots',
    levels: {
      Apex_code: 'FINER',      // Detailed method timing
      Apex_profiling: 'FINEST', // Maximum profiling
      Callout: 'INFO',
      Database: 'DEBUG',
      System: 'DEBUG',
      Validation: 'INFO',
      Visualforce: 'INFO',
      Workflow: 'INFO',
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

/**
 * Exception Debugging preset - full stack traces
 */
export const PRESET_EXCEPTIONS: DebugLevelPreset = {
  name: 'exceptions',
  description: 'Optimized for exception debugging with full stack traces',
  optimizedFor: ['exceptions', 'null_pointer', 'dml_exception', 'query_exception'],
  expectedLogSize: 'medium',
  performanceImpact: 'medium',
  debugLevel: {
    developerName: 'SFDebug_Exceptions',
    masterLabel: 'SF Debug Analyzer - Exception Debugging',
    levels: {
      Apex_code: 'FINER',      // Full stack traces
      Apex_profiling: 'DEBUG',
      Callout: 'DEBUG',
      Database: 'DEBUG',
      System: 'FINE',          // System errors
      Validation: 'DEBUG',
      Visualforce: 'DEBUG',
      Workflow: 'DEBUG',
      NBA: 'ERROR',
      Wave: 'ERROR',
    },
  },
};

/**
 * Callout Analysis preset - HTTP and external service debugging
 */
export const PRESET_CALLOUTS: DebugLevelPreset = {
  name: 'callouts',
  description: 'Optimized for HTTP callout and external service debugging',
  optimizedFor: ['callout_performance', 'http_errors', 'external_services'],
  expectedLogSize: 'medium',
  performanceImpact: 'medium',
  debugLevel: {
    developerName: 'SFDebug_Callouts',
    masterLabel: 'SF Debug Analyzer - Callout Analysis',
    levels: {
      Apex_code: 'DEBUG',
      Apex_profiling: 'DEBUG',
      Callout: 'FINEST',       // Maximum callout detail
      Database: 'INFO',
      System: 'DEBUG',
      Validation: 'ERROR',
      Visualforce: 'ERROR',
      Workflow: 'ERROR',
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

/**
 * Visualforce preset - VF page debugging
 */
export const PRESET_VISUALFORCE: DebugLevelPreset = {
  name: 'visualforce',
  description: 'Optimized for Visualforce page debugging',
  optimizedFor: ['visualforce_performance', 'vf_errors', 'view_state'],
  expectedLogSize: 'large',
  performanceImpact: 'high',
  debugLevel: {
    developerName: 'SFDebug_VF',
    masterLabel: 'SF Debug Analyzer - Visualforce',
    levels: {
      Apex_code: 'DEBUG',
      Apex_profiling: 'FINE',
      Callout: 'INFO',
      Database: 'DEBUG',
      System: 'DEBUG',
      Validation: 'DEBUG',
      Visualforce: 'FINEST',   // Maximum VF detail
      Workflow: 'INFO',
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

/**
 * Workflow/Process Builder preset
 */
export const PRESET_WORKFLOW: DebugLevelPreset = {
  name: 'workflow',
  description: 'Optimized for Workflow Rules and Process Builder debugging',
  optimizedFor: ['workflow_issues', 'process_builder', 'field_updates'],
  expectedLogSize: 'medium',
  performanceImpact: 'medium',
  debugLevel: {
    developerName: 'SFDebug_Workflow',
    masterLabel: 'SF Debug Analyzer - Workflow',
    levels: {
      Apex_code: 'DEBUG',
      Apex_profiling: 'INFO',
      Callout: 'INFO',
      Database: 'DEBUG',
      System: 'DEBUG',
      Validation: 'DEBUG',
      Visualforce: 'ERROR',
      Workflow: 'FINEST',      // Maximum workflow detail
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

/**
 * Full Diagnostic preset - everything at maximum (use sparingly)
 */
export const PRESET_FULL_DIAGNOSTIC: DebugLevelPreset = {
  name: 'full_diagnostic',
  description: 'Maximum logging for comprehensive debugging (HIGH IMPACT)',
  optimizedFor: ['all'],
  expectedLogSize: 'large',
  performanceImpact: 'high',
  debugLevel: {
    developerName: 'SFDebug_Full',
    masterLabel: 'SF Debug Analyzer - Full Diagnostic',
    levels: {
      Apex_code: 'FINEST',
      Apex_profiling: 'FINEST',
      Callout: 'FINEST',
      Database: 'FINEST',
      System: 'FINEST',
      Validation: 'FINEST',
      Visualforce: 'FINEST',
      Workflow: 'FINEST',
      NBA: 'FINE',
      Wave: 'FINE',
    },
  },
};

/**
 * AI Optimized preset - balanced for AI analysis
 */
export const PRESET_AI_OPTIMIZED: DebugLevelPreset = {
  name: 'ai_optimized',
  description: 'Balanced preset optimized for AI-assisted debugging',
  optimizedFor: ['ai_analysis', 'general_debugging'],
  expectedLogSize: 'medium',
  performanceImpact: 'medium',
  debugLevel: {
    developerName: 'SFDebug_AI',
    masterLabel: 'SF Debug Analyzer - AI Optimized',
    levels: {
      Apex_code: 'FINE',       // Good method detail without noise
      Apex_profiling: 'FINE',  // Performance metrics
      Callout: 'DEBUG',
      Database: 'FINE',        // SOQL/DML analysis
      System: 'DEBUG',
      Validation: 'DEBUG',
      Visualforce: 'INFO',
      Workflow: 'DEBUG',
      NBA: 'NONE',
      Wave: 'NONE',
    },
  },
};

// ============================================================================
// Preset Registry
// ============================================================================

/**
 * All available presets
 */
export const PRESETS: Map<string, DebugLevelPreset> = new Map([
  ['minimal', PRESET_MINIMAL],
  ['soql_analysis', PRESET_SOQL_ANALYSIS],
  ['governor_limits', PRESET_GOVERNOR_LIMITS],
  ['triggers', PRESET_TRIGGERS],
  ['cpu_hotspots', PRESET_CPU_HOTSPOTS],
  ['exceptions', PRESET_EXCEPTIONS],
  ['callouts', PRESET_CALLOUTS],
  ['visualforce', PRESET_VISUALFORCE],
  ['workflow', PRESET_WORKFLOW],
  ['full_diagnostic', PRESET_FULL_DIAGNOSTIC],
  ['ai_optimized', PRESET_AI_OPTIMIZED],
]);

/**
 * Gets a preset by name
 */
export function getPreset(name: string): DebugLevelPreset | undefined {
  return PRESETS.get(name.toLowerCase());
}

/**
 * Lists all available preset names
 */
export function listPresetNames(): string[] {
  return Array.from(PRESETS.keys());
}

/**
 * Lists all presets with descriptions
 */
export function listPresets(): Array<{ name: string; description: string; impact: string }> {
  return Array.from(PRESETS.values()).map(preset => ({
    name: preset.name,
    description: preset.description,
    impact: preset.performanceImpact,
  }));
}

// ============================================================================
// Issue Type to Preset Mapping
// ============================================================================

/**
 * Maps issue types to recommended presets
 */
const ISSUE_TYPE_PRESETS: Record<string, string[]> = {
  // SOQL issues
  'soql_in_loop': ['soql_analysis', 'ai_optimized'],
  'n_plus_one': ['soql_analysis', 'ai_optimized'],
  'non_selective_query': ['soql_analysis', 'governor_limits'],
  'soql_without_where': ['soql_analysis'],
  'soql_without_limit': ['soql_analysis'],
  
  // Performance issues
  'cpu_time_limit': ['cpu_hotspots', 'governor_limits'],
  'cpu_hotspot': ['cpu_hotspots'],
  'slow_method': ['cpu_hotspots', 'ai_optimized'],
  
  // Trigger issues
  'recursive_trigger': ['triggers', 'ai_optimized'],
  'trigger_performance': ['triggers', 'cpu_hotspots'],
  'bulkification': ['triggers', 'soql_analysis'],
  
  // Exception issues
  'null_pointer': ['exceptions', 'ai_optimized'],
  'dml_exception': ['exceptions', 'triggers'],
  'query_exception': ['exceptions', 'soql_analysis'],
  'limit_exception': ['governor_limits', 'exceptions'],
  
  // Governor limits
  'soql_limit': ['governor_limits', 'soql_analysis'],
  'dml_limit': ['governor_limits', 'triggers'],
  'cpu_limit': ['governor_limits', 'cpu_hotspots'],
  'heap_limit': ['governor_limits', 'ai_optimized'],
  
  // Callout issues
  'callout_limit': ['callouts', 'governor_limits'],
  'callout_timeout': ['callouts'],
  'callout_error': ['callouts', 'exceptions'],
  
  // Other
  'workflow': ['workflow'],
  'visualforce': ['visualforce'],
  'general': ['ai_optimized', 'minimal'],
};

/**
 * Gets recommended presets for an issue type
 */
export function getPresetsForIssueType(issueType: string): DebugLevelPreset[] {
  const presetNames = ISSUE_TYPE_PRESETS[issueType.toLowerCase()] || ['ai_optimized'];
  return presetNames.map(name => PRESETS.get(name)!).filter(Boolean);
}

/**
 * Gets the best preset for a set of issue types
 */
export function getBestPresetForIssues(issueTypes: string[]): DebugLevelPreset {
  // Count how many times each preset is recommended
  const presetCounts = new Map<string, number>();
  
  for (const issueType of issueTypes) {
    const presets = ISSUE_TYPE_PRESETS[issueType.toLowerCase()] || ['ai_optimized'];
    for (const preset of presets) {
      presetCounts.set(preset, (presetCounts.get(preset) || 0) + 1);
    }
  }
  
  // Find the most recommended preset
  let bestPreset = 'ai_optimized';
  let maxCount = 0;
  
  for (const [preset, count] of presetCounts) {
    if (count > maxCount) {
      maxCount = count;
      bestPreset = preset;
    }
  }
  
  return PRESETS.get(bestPreset) || PRESET_AI_OPTIMIZED;
}

// ============================================================================
// Custom Debug Level Builder
// ============================================================================

/**
 * Creates a custom debug level by merging multiple presets
 */
export function mergePresets(presets: DebugLevelPreset[]): DebugLevel {
  const merged: Record<DebugLogCategory, DebugLogLevel> = {
    Apex_code: 'NONE',
    Apex_profiling: 'NONE',
    Callout: 'NONE',
    Database: 'NONE',
    System: 'NONE',
    Validation: 'NONE',
    Visualforce: 'NONE',
    Workflow: 'NONE',
    NBA: 'NONE',
    Wave: 'NONE',
  };

  // Take the maximum level for each category
  for (const preset of presets) {
    for (const category of ALL_CATEGORIES) {
      const currentLevel = merged[category];
      const presetLevel = preset.debugLevel.levels[category];
      
      if (LOG_LEVEL_ORDER.indexOf(presetLevel) > LOG_LEVEL_ORDER.indexOf(currentLevel)) {
        merged[category] = presetLevel;
      }
    }
  }

  return {
    developerName: 'SFDebug_Custom',
    masterLabel: 'SF Debug Analyzer - Custom',
    levels: merged,
  };
}

/**
 * Creates a debug level from individual category settings
 */
export function createDebugLevel(
  name: string,
  levels: Partial<Record<DebugLogCategory, DebugLogLevel>>
): DebugLevel {
  const defaults: Record<DebugLogCategory, DebugLogLevel> = {
    Apex_code: 'DEBUG',
    Apex_profiling: 'DEBUG',
    Callout: 'INFO',
    Database: 'DEBUG',
    System: 'DEBUG',
    Validation: 'INFO',
    Visualforce: 'INFO',
    Workflow: 'INFO',
    NBA: 'NONE',
    Wave: 'NONE',
  };

  return {
    developerName: `SFDebug_${name}`,
    masterLabel: `SF Debug Analyzer - ${name}`,
    levels: { ...defaults, ...levels },
  };
}

/**
 * Formats a debug level for display
 */
export function formatDebugLevel(debugLevel: DebugLevel): string {
  const lines = [
    `Debug Level: ${debugLevel.masterLabel}`,
    '',
    'Category Settings:',
  ];

  for (const category of ALL_CATEGORIES) {
    const level = debugLevel.levels[category];
    const levelStr = level.padEnd(7);
    lines.push(`  ${category.padEnd(20)} ${levelStr}`);
  }

  return lines.join('\n');
}

/**
 * Estimates log size for a debug level
 */
export function estimateLogSize(debugLevel: DebugLevel): 'small' | 'medium' | 'large' {
  let score = 0;

  for (const category of ALL_CATEGORIES) {
    const level = debugLevel.levels[category];
    const levelIndex = LOG_LEVEL_ORDER.indexOf(level);
    
    // Weight certain categories more heavily
    const weight = 
      category === 'Apex_code' ? 3 :
      category === 'Database' ? 2 :
      category === 'Apex_profiling' ? 2 : 1;
    
    score += levelIndex * weight;
  }

  // Normalize to 0-100 scale
  // Max possible: 7 * (3 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1) = 7 * 14 = 98
  const normalized = (score / 98) * 100;

  if (normalized < 30) return 'small';
  if (normalized < 60) return 'medium';
  return 'large';
}
