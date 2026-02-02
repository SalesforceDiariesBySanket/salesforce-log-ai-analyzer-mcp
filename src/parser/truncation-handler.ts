/**
 * @module parser/truncation-handler
 * @description Re-exports from the truncation module (for backwards compatibility)
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/parser/truncation/
 * @lastModified 2026-02-01
 * 
 * NOTE: This file is kept for backwards compatibility.
 * New code should import directly from './truncation' or './truncation/index'
 */

// Re-export everything from the new modular structure
export {
  // Handler
  truncationHandler,
  
  // Main functions
  analyzeTruncation,
  detectTruncation,
  createRecoveryPlan,
  analyzeImpact,
  
  // Detection helpers
  checkExplicitMarkers,
  checkSizeThreshold,
  checkAbruptEnding,
  checkUnclosedEvents,
  checkMissingLimits,
  checkMidLineCut,
  checkIncompleteStacktrace,
  
  // Recovery helpers
  getOptimizedDebugLevels,
  
  // Constants
  TRUNCATION_MARKERS,
  SIZE_THRESHOLDS,
  DETECTION_THRESHOLDS,
  CONFIDENCE_WEIGHTS,
} from './truncation';
