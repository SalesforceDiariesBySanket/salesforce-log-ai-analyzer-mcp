/**
 * @module analyzer/level-detector
 * @description Detect and infer debug levels from raw Salesforce debug logs
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 * 
 * PURPOSE:
 * Salesforce debug logs may or may not include debug level headers.
 * This module detects:
 * 1. Explicit debug level headers (if present)
 * 2. Implicit debug levels (inferred from event types present)
 * 3. Missing debug level information
 * 
 * This information helps the AI understand what analysis is possible
 * and what limitations exist.
 */

import type { EventNode, LogMetadata } from '../types/events';
import type { DebugLevel, DebugCategory } from './debug-level-validator';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of log level detection
 */
export interface LogLevelDetection {
  /** How debug levels were determined */
  detectionMethod: 'HEADER' | 'INFERRED' | 'UNKNOWN';

  /** Detected debug levels by category */
  detectedLevels: Partial<Record<DebugCategory, DebugLevel>>;

  /** Confidence in the detection (0-1) */
  confidence: number;

  /** Evidence used for inference */
  evidence: LevelEvidence[];

  /** Whether the log appears to be a standard debug log */
  isStandardLog: boolean;

  /** Original header string if present */
  headerString?: string;
}

/**
 * Evidence for level inference
 */
export interface LevelEvidence {
  /** The event type observed */
  eventType: string;

  /** Category this event belongs to */
  category: DebugCategory;

  /** Minimum level required to see this event */
  impliesMinLevel: DebugLevel;

  /** Number of occurrences */
  count: number;
}

/**
 * Event type to debug level mapping
 * Used to infer debug levels from observed events
 */
interface EventLevelMapping {
  eventType: string;
  category: DebugCategory;
  minLevel: DebugLevel;
}

// ============================================================================
// Event → Debug Level Mappings
// ============================================================================

/**
 * Map of event types to the minimum debug level required to capture them
 * Based on Salesforce Debug Log Event Reference
 */
const EVENT_LEVEL_MAPPINGS: EventLevelMapping[] = [
  // Apex Code Category
  { eventType: 'EXECUTION_STARTED', category: 'Apex_code', minLevel: 'ERROR' },
  { eventType: 'EXECUTION_FINISHED', category: 'Apex_code', minLevel: 'ERROR' },
  { eventType: 'CODE_UNIT_STARTED', category: 'Apex_code', minLevel: 'DEBUG' },
  { eventType: 'CODE_UNIT_FINISHED', category: 'Apex_code', minLevel: 'DEBUG' },
  { eventType: 'METHOD_ENTRY', category: 'Apex_code', minLevel: 'FINE' },
  { eventType: 'METHOD_EXIT', category: 'Apex_code', minLevel: 'FINE' },
  { eventType: 'CONSTRUCTOR_ENTRY', category: 'Apex_code', minLevel: 'FINE' },
  { eventType: 'CONSTRUCTOR_EXIT', category: 'Apex_code', minLevel: 'FINE' },
  { eventType: 'VARIABLE_SCOPE_BEGIN', category: 'Apex_code', minLevel: 'FINER' },
  { eventType: 'VARIABLE_SCOPE_END', category: 'Apex_code', minLevel: 'FINER' },
  { eventType: 'VARIABLE_ASSIGNMENT', category: 'Apex_code', minLevel: 'FINEST' },
  { eventType: 'STATEMENT_EXECUTE', category: 'Apex_code', minLevel: 'FINEST' },
  { eventType: 'USER_DEBUG', category: 'Apex_code', minLevel: 'DEBUG' },

  // Database Category
  { eventType: 'SOQL_EXECUTE_BEGIN', category: 'Database', minLevel: 'INFO' },
  { eventType: 'SOQL_EXECUTE_END', category: 'Database', minLevel: 'INFO' },
  { eventType: 'SOQL_EXECUTE_EXPLAIN', category: 'Database', minLevel: 'FINE' },
  { eventType: 'DML_BEGIN', category: 'Database', minLevel: 'INFO' },
  { eventType: 'DML_END', category: 'Database', minLevel: 'INFO' },

  // System Category
  { eventType: 'LIMIT_USAGE', category: 'System', minLevel: 'INFO' },
  { eventType: 'LIMIT_USAGE_FOR_NS', category: 'System', minLevel: 'INFO' },
  { eventType: 'CUMULATIVE_LIMIT_USAGE', category: 'System', minLevel: 'INFO' },
  { eventType: 'CUMULATIVE_LIMIT_USAGE_END', category: 'System', minLevel: 'INFO' },
  { eventType: 'HEAP_ALLOCATE', category: 'System', minLevel: 'FINER' },
  { eventType: 'HEAP_DEALLOCATE', category: 'System', minLevel: 'FINER' },

  // Apex Profiling Category
  { eventType: 'ENTERING_MANAGED_PKG', category: 'Apex_profiling', minLevel: 'INFO' },
  { eventType: 'PUSH_TRACE_FLAGS', category: 'Apex_profiling', minLevel: 'INFO' },
  { eventType: 'POP_TRACE_FLAGS', category: 'Apex_profiling', minLevel: 'INFO' },

  // Workflow Category
  { eventType: 'FLOW_START_INTERVIEW_BEGIN', category: 'Workflow', minLevel: 'INFO' },
  { eventType: 'FLOW_START_INTERVIEW_END', category: 'Workflow', minLevel: 'INFO' },
  { eventType: 'FLOW_ELEMENT_BEGIN', category: 'Workflow', minLevel: 'FINE' },
  { eventType: 'FLOW_ELEMENT_END', category: 'Workflow', minLevel: 'FINE' },

  // Callout Category
  { eventType: 'CALLOUT_REQUEST', category: 'Callout', minLevel: 'INFO' },
  { eventType: 'CALLOUT_RESPONSE', category: 'Callout', minLevel: 'INFO' },

  // Exception/Error Category (usually always logged)
  { eventType: 'EXCEPTION_THROWN', category: 'Apex_code', minLevel: 'ERROR' },
  { eventType: 'FATAL_ERROR', category: 'Apex_code', minLevel: 'ERROR' },

  // Async Events
  { eventType: 'ASYNC_JOB_ENQUEUED', category: 'Apex_code', minLevel: 'DEBUG' },
  { eventType: 'FUTURE_CALL', category: 'Apex_code', minLevel: 'DEBUG' },
  { eventType: 'QUEUEABLE_JOB', category: 'Apex_code', minLevel: 'DEBUG' },
  { eventType: 'BATCH_APEX_START', category: 'Apex_code', minLevel: 'DEBUG' },
  { eventType: 'BATCH_APEX_END', category: 'Apex_code', minLevel: 'DEBUG' },
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
// Main Detection Function
// ============================================================================

/**
 * Detect debug levels from a parsed log
 * 
 * This function attempts to determine the debug levels used to capture the log
 * through multiple methods:
 * 1. Parsing explicit header information
 * 2. Inferring from the types of events present
 * 
 * @param events - Parsed event nodes
 * @param metadata - Log metadata (may contain header info)
 * @param rawHeader - Raw header lines if available
 * @returns Detection result with levels and confidence
 * 
 * @example
 * const detection = detectLogLevels(parsedLog.events, parsedLog.metadata);
 * if (detection.detectionMethod === 'INFERRED') {
 *   console.log('Debug levels inferred from events:', detection.detectedLevels);
 * }
 */
export function detectLogLevels(
  events: EventNode[],
  metadata?: LogMetadata,
  rawHeader?: string[]
): LogLevelDetection {
  // First try to detect from explicit header
  const headerDetection = detectFromHeader(metadata, rawHeader);
  
  if (headerDetection.detectionMethod === 'HEADER') {
    return headerDetection;
  }

  // Fall back to inference from events
  return inferFromEvents(events);
}

/**
 * Detect debug levels from log header
 */
function detectFromHeader(
  metadata?: LogMetadata,
  rawHeader?: string[]
): LogLevelDetection {
  const detectedLevels: Partial<Record<DebugCategory, DebugLevel>> = {};
  let headerString: string | undefined;

  // Check metadata for debug levels
  if (metadata?.debugLevels) {
    for (const [category, level] of Object.entries(metadata.debugLevels)) {
      const normalizedCategory = normalizeCategory(category);
      const normalizedLevel = normalizeLevel(level);
      
      if (normalizedCategory && normalizedLevel) {
        detectedLevels[normalizedCategory] = normalizedLevel;
      }
    }
    
    headerString = formatDebugLevels(detectedLevels);
  }

  // Check raw header for debug level lines
  if (rawHeader && rawHeader.length > 0) {
    for (const line of rawHeader) {
      const parsed = parseDebugLevelLine(line);
      if (parsed) {
        detectedLevels[parsed.category] = parsed.level;
        headerString = headerString || line;
      }
    }
  }

  // Return results
  if (Object.keys(detectedLevels).length > 0) {
    return {
      detectionMethod: 'HEADER',
      detectedLevels,
      confidence: 1.0,
      evidence: [],
      isStandardLog: true,
      headerString,
    };
  }

  // No header information found
  return {
    detectionMethod: 'UNKNOWN',
    detectedLevels: {},
    confidence: 0,
    evidence: [],
    isStandardLog: false,
  };
}

/**
 * Infer debug levels from observed events
 */
function inferFromEvents(events: EventNode[]): LogLevelDetection {
  // Count event types
  const eventCounts = new Map<string, number>();
  countEvents(events, eventCounts);

  // Build evidence from event types
  const evidence: LevelEvidence[] = [];
  const inferredLevels: Partial<Record<DebugCategory, DebugLevel>> = {};

  for (const mapping of EVENT_LEVEL_MAPPINGS) {
    const count = eventCounts.get(mapping.eventType) || 0;
    
    if (count > 0) {
      // Add evidence
      evidence.push({
        eventType: mapping.eventType,
        category: mapping.category,
        impliesMinLevel: mapping.minLevel,
        count,
      });

      // Update inferred level (take highest seen)
      const currentLevel = inferredLevels[mapping.category];
      if (
        !currentLevel ||
        DEBUG_LEVEL_ORDER[mapping.minLevel] > DEBUG_LEVEL_ORDER[currentLevel]
      ) {
        inferredLevels[mapping.category] = mapping.minLevel;
      }
    }
  }

  // Calculate confidence based on evidence quality
  const confidence = calculateInferenceConfidence(evidence, events.length);

  // Determine if this is a standard log
  const isStandardLog = events.length > 0 && evidence.length > 0;

  return {
    detectionMethod: evidence.length > 0 ? 'INFERRED' : 'UNKNOWN',
    detectedLevels: inferredLevels,
    confidence,
    evidence,
    isStandardLog,
  };
}

/**
 * Recursively count events by type
 */
function countEvents(events: EventNode[], counts: Map<string, number>): void {
  for (const event of events) {
    const current = counts.get(event.type) || 0;
    counts.set(event.type, current + 1);

    if (event.children) {
      countEvents(event.children, counts);
    }
  }
}

/**
 * Calculate confidence in inferred debug levels
 */
function calculateInferenceConfidence(
  evidence: LevelEvidence[],
  totalEvents: number
): number {
  if (evidence.length === 0 || totalEvents === 0) {
    return 0;
  }

  // More evidence = higher confidence
  const evidenceScore = Math.min(evidence.length / 10, 0.5);

  // More categories covered = higher confidence
  const categories = new Set(evidence.map(e => e.category));
  const categoryScore = Math.min(categories.size / 6, 0.3);

  // More events = higher confidence
  const eventScore = Math.min(totalEvents / 1000, 0.2);

  return Math.min(evidenceScore + categoryScore + eventScore, 1.0);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize category name
 */
function normalizeCategory(category: string): DebugCategory | null {
  const normalized = category
    .toLowerCase()
    .replace(/[\s-]/g, '_')
    .replace(/apex\s*code/i, 'Apex_code')
    .replace(/apex\s*profiling/i, 'Apex_profiling');

  const categoryMap: Record<string, DebugCategory> = {
    'apex_code': 'Apex_code',
    'apexcode': 'Apex_code',
    'apex_profiling': 'Apex_profiling',
    'apexprofiling': 'Apex_profiling',
    'callout': 'Callout',
    'database': 'Database',
    'db': 'Database',
    'system': 'System',
    'validation': 'Validation',
    'visualforce': 'Visualforce',
    'vf': 'Visualforce',
    'workflow': 'Workflow',
    'nba': 'NBA',
    'wave': 'Wave',
  };

  return categoryMap[normalized.toLowerCase()] || null;
}

/**
 * Normalize debug level
 */
function normalizeLevel(level: string): DebugLevel | null {
  const normalized = level.toUpperCase();
  
  if (DEBUG_LEVEL_ORDER[normalized as DebugLevel] !== undefined) {
    return normalized as DebugLevel;
  }

  return null;
}

/**
 * Parse a debug level line from log header
 * Example: "Apex Code:DEBUG"
 */
function parseDebugLevelLine(
  line: string
): { category: DebugCategory; level: DebugLevel } | null {
  // Pattern: "Category:LEVEL" or "Category: LEVEL"
  const match = line.match(/^([A-Za-z_\s]+):\s*([A-Z]+)\s*$/i);
  
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const category = normalizeCategory(match[1].trim());
  const level = normalizeLevel(match[2].trim());

  if (category && level) {
    return { category, level };
  }

  return null;
}

/**
 * Format debug levels as a string
 */
function formatDebugLevels(
  levels: Partial<Record<DebugCategory, DebugLevel>>
): string {
  return Object.entries(levels)
    .map(([cat, level]) => `${cat}:${level}`)
    .join(', ');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all categories that have any level set
 */
export function getDetectedCategories(
  detection: LogLevelDetection
): DebugCategory[] {
  return Object.keys(detection.detectedLevels) as DebugCategory[];
}

/**
 * Check if a specific level is available
 */
export function hasMinimumLevel(
  detection: LogLevelDetection,
  category: DebugCategory,
  requiredLevel: DebugLevel
): boolean {
  const currentLevel = detection.detectedLevels[category];
  
  if (!currentLevel) {
    return false;
  }

  return DEBUG_LEVEL_ORDER[currentLevel] >= DEBUG_LEVEL_ORDER[requiredLevel];
}

/**
 * Generate a summary of detected levels
 */
export function summarizeDetection(detection: LogLevelDetection): string {
  if (detection.detectionMethod === 'UNKNOWN') {
    return 'Debug levels could not be determined';
  }

  const method = detection.detectionMethod === 'HEADER' 
    ? 'from log header' 
    : 'inferred from events';

  const levels = Object.entries(detection.detectedLevels)
    .map(([cat, level]) => `${cat}: ${level}`)
    .join(', ');

  return `Debug levels (${method}): ${levels || 'None detected'}`;
}

/**
 * Get events that imply a higher debug level than detected
 */
export function getMissingHigherLevelEvents(
  detection: LogLevelDetection
): string[] {
  const missing: string[] = [];

  for (const mapping of EVENT_LEVEL_MAPPINGS) {
    const currentLevel = detection.detectedLevels[mapping.category];
    
    // If we have the category but not the required level
    if (currentLevel) {
      if (DEBUG_LEVEL_ORDER[currentLevel] < DEBUG_LEVEL_ORDER[mapping.minLevel]) {
        // This event would not be captured
        if (DEBUG_LEVEL_ORDER[mapping.minLevel] <= DEBUG_LEVEL_ORDER['FINE']) {
          // Only report commonly useful events
          missing.push(mapping.eventType);
        }
      }
    }
  }

  return [...new Set(missing)];
}
