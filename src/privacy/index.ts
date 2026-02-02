/**
 * @module privacy/index
 * @description PII detection and redaction for safe AI consumption
 * @status COMPLETE
 * @see src/privacy/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

// ============================================================================
// Pattern Exports
// ============================================================================

export {
  // Types
  type SensitivityLevel,
  type PIICategory,
  type PIIPattern,
  // Built-in patterns
  EMAIL_PATTERN,
  PHONE_PATTERN,
  SSN_PATTERN,
  CREDIT_CARD_PATTERN,
  IP_ADDRESS_PATTERN,
  SALESFORCE_ID_PATTERN,
  SESSION_TOKEN_PATTERN,
  API_KEY_PATTERN,
  PASSWORD_PATTERN,
  // Collections
  ALL_PATTERNS,
  HIGH_SENSITIVITY_PATTERNS,
  PATTERNS_BY_CATEGORY,
  // Utilities
  getPatternsForSensitivity,
  createCustomPattern,
} from './patterns';

// ============================================================================
// Classifier Exports
// ============================================================================

export {
  // Types
  type ClassificationResult,
  type PIIMatch,
  type FieldClassification,
  // Functions
  classifyText,
  classifyField,
  classifyFieldName,
  likelyContainsPII,
  compareSensitivity,
  maxSensitivity,
} from './classifier';

// ============================================================================
// Redactor Exports
// ============================================================================

export {
  // Types
  type RedactionOptions,
  type RedactionResult,
  type RedactionInfo,
  // Functions
  redactText,
  redactObject,
  redactBatch,
  createRedactor,
} from './redactor';

// ============================================================================
// Config Exports
// ============================================================================

export {
  // Types
  type RedactionConfig,
  type RedactionPreset,
  // Defaults
  DEFAULT_CONFIG,
  // Presets
  STRICT_CONFIG,
  MODERATE_CONFIG,
  MINIMAL_CONFIG,
  OFF_CONFIG,
  PRESETS,
  // Functions
  getPreset,
  mergeConfig,
  configToOptions,
  createCustomConfig,
  validateConfig,
} from './config';

