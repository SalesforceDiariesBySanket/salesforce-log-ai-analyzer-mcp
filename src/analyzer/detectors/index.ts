/**
 * @module analyzer/detectors
 * @description Issue detector exports - all detectors for Phase 3
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/issues.ts
 * @lastModified 2026-01-31
 */

// ============================================================================
// Detector Exports
// ============================================================================

export { soqlInLoopDetector } from './soql-in-loop';
export { nPlusOneDetector } from './n-plus-one';
export { recursiveTriggerDetector } from './recursive-trigger';
export { nonSelectiveDetector } from './non-selective';
export { cpuHotspotDetector } from './cpu-hotspot';
export { 
  governorLimitsDetector, 
  analyzeLimitSummary,
  type LimitSummary,
  type LimitUsageInfo,
} from './governor-limits';

// ============================================================================
// All Detectors Array
// ============================================================================

import { soqlInLoopDetector } from './soql-in-loop';
import { nPlusOneDetector } from './n-plus-one';
import { recursiveTriggerDetector } from './recursive-trigger';
import { nonSelectiveDetector } from './non-selective';
import { cpuHotspotDetector } from './cpu-hotspot';
import { governorLimitsDetector } from './governor-limits';

import type { IssueDetector } from '../../types/issues';

/**
 * All available detectors
 * Order matters - more critical detectors first
 */
export const allDetectors: IssueDetector[] = [
  governorLimitsDetector,   // Critical: Limit violations
  cpuHotspotDetector,       // Performance: CPU hotspots
  soqlInLoopDetector,       // Anti-pattern: SOQL in loop
  nPlusOneDetector,         // Anti-pattern: N+1 queries
  recursiveTriggerDetector, // Anti-pattern: Recursive triggers
  nonSelectiveDetector,     // Performance: Non-selective queries
];

/**
 * Get detector by name
 */
export function getDetector(name: string): IssueDetector | undefined {
  return allDetectors.find(d => d.name === name);
}

/**
 * Get detectors for specific issue types
 */
export function getDetectorsForIssueType(issueType: string): IssueDetector[] {
  return allDetectors.filter(d => d.detects.includes(issueType as never));
}
