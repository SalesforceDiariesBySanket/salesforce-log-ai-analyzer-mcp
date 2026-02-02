/**
 * @module privacy/config
 * @description Configurable redaction preferences and presets
 * @status COMPLETE
 * @see src/privacy/STATE.md
 * @dependencies src/privacy/patterns.ts
 * @lastModified 2026-01-31
 */

import type { PIIPattern, SensitivityLevel, PIICategory } from './patterns';
import {
  ALL_PATTERNS,
  createCustomPattern,
} from './patterns';
import type { RedactionOptions } from './redactor';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * User-configurable redaction settings
 */
export interface RedactionConfig {
  /** Whether redaction is enabled */
  enabled: boolean;
  /** Minimum sensitivity level to redact */
  minSensitivity: SensitivityLevel;
  /** Categories to always redact */
  alwaysRedact: PIICategory[];
  /** Categories to never redact */
  neverRedact: PIICategory[];
  /** Custom patterns to add */
  customPatterns: PIIPattern[];
  /** Use category-specific placeholders vs generic [REDACTED] */
  usePlaceholders: boolean;
  /** Track redactions for audit/debugging */
  trackRedactions: boolean;
  /** Hash original values instead of storing them */
  hashOriginals: boolean;
}

/**
 * Named preset configurations
 */
export type RedactionPreset = 'STRICT' | 'MODERATE' | 'MINIMAL' | 'OFF';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default redaction configuration
 */
export const DEFAULT_CONFIG: RedactionConfig = {
  enabled: true,
  minSensitivity: 'MEDIUM',
  alwaysRedact: ['PASSWORD', 'SSN', 'CREDIT_CARD', 'API_KEY', 'SESSION_TOKEN'],
  neverRedact: [],
  customPatterns: [],
  usePlaceholders: true,
  trackRedactions: false,
  hashOriginals: false,
};

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * STRICT preset: Redact everything potentially sensitive
 */
export const STRICT_CONFIG: RedactionConfig = {
  enabled: true,
  minSensitivity: 'LOW',
  alwaysRedact: [
    'PASSWORD', 'SSN', 'CREDIT_CARD', 'API_KEY', 'SESSION_TOKEN',
    'EMAIL', 'PHONE', 'IP_ADDRESS', 'SALESFORCE_ID', 'ADDRESS', 'NAME',
  ],
  neverRedact: [],
  customPatterns: [],
  usePlaceholders: true,
  trackRedactions: false,
  hashOriginals: false,
};

/**
 * MODERATE preset: Redact high-sensitivity data only
 */
export const MODERATE_CONFIG: RedactionConfig = {
  enabled: true,
  minSensitivity: 'HIGH',
  alwaysRedact: ['PASSWORD', 'SSN', 'CREDIT_CARD', 'API_KEY', 'SESSION_TOKEN'],
  neverRedact: ['SALESFORCE_ID'],
  customPatterns: [],
  usePlaceholders: true,
  trackRedactions: false,
  hashOriginals: false,
};

/**
 * MINIMAL preset: Only redact critical credentials
 */
export const MINIMAL_CONFIG: RedactionConfig = {
  enabled: true,
  minSensitivity: 'CRITICAL',
  alwaysRedact: ['PASSWORD', 'API_KEY', 'SESSION_TOKEN'],
  neverRedact: ['EMAIL', 'PHONE', 'IP_ADDRESS', 'SALESFORCE_ID'],
  customPatterns: [],
  usePlaceholders: true,
  trackRedactions: false,
  hashOriginals: false,
};

/**
 * OFF preset: No redaction
 */
export const OFF_CONFIG: RedactionConfig = {
  enabled: false,
  minSensitivity: 'NONE',
  alwaysRedact: [],
  neverRedact: [],
  customPatterns: [],
  usePlaceholders: true,
  trackRedactions: false,
  hashOriginals: false,
};

/**
 * Preset configurations map
 */
export const PRESETS: Record<RedactionPreset, RedactionConfig> = {
  STRICT: STRICT_CONFIG,
  MODERATE: MODERATE_CONFIG,
  MINIMAL: MINIMAL_CONFIG,
  OFF: OFF_CONFIG,
};

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Get configuration for a preset
 */
export function getPreset(preset: RedactionPreset): RedactionConfig {
  return { ...PRESETS[preset] };
}

/**
 * Merge user config with defaults
 */
export function mergeConfig(
  userConfig: Partial<RedactionConfig>,
  base: RedactionConfig = DEFAULT_CONFIG
): RedactionConfig {
  return {
    ...base,
    ...userConfig,
    alwaysRedact: userConfig.alwaysRedact ?? base.alwaysRedact,
    neverRedact: userConfig.neverRedact ?? base.neverRedact,
    customPatterns: [
      ...(base.customPatterns ?? []),
      ...(userConfig.customPatterns ?? []),
    ],
  };
}

/**
 * Convert RedactionConfig to RedactionOptions (for redactor)
 */
export function configToOptions(config: RedactionConfig): RedactionOptions {
  if (!config.enabled) {
    return { patterns: [] }; // Empty patterns = no redaction
  }

  // Filter patterns based on config
  let patterns = [...ALL_PATTERNS, ...config.customPatterns];

  // Apply category filters
  if (config.neverRedact.length > 0) {
    patterns = patterns.filter((p) => !config.neverRedact.includes(p.category));
  }

  return {
    patterns,
    minSensitivity: config.minSensitivity,
    usePlaceholders: config.usePlaceholders,
    trackRedactions: config.trackRedactions,
    hashOriginals: config.hashOriginals,
  };
}

/**
 * Create a custom configuration with additional patterns
 */
export function createCustomConfig(
  base: RedactionPreset | RedactionConfig,
  customPatterns: Array<{
    id: string;
    name: string;
    pattern: RegExp;
    sensitivity?: SensitivityLevel;
  }>
): RedactionConfig {
  const baseConfig = typeof base === 'string' ? getPreset(base) : base;

  return {
    ...baseConfig,
    customPatterns: [
      ...baseConfig.customPatterns,
      ...customPatterns.map((p) =>
        createCustomPattern(p.id, p.name, p.pattern, p.sensitivity)
      ),
    ],
  };
}

/**
 * Validate a configuration
 */
export function validateConfig(config: Partial<RedactionConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.minSensitivity !== undefined) {
    const validLevels: SensitivityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
    if (!validLevels.includes(config.minSensitivity)) {
      errors.push(`Invalid sensitivity level: ${config.minSensitivity}`);
    }
  }

  if (config.customPatterns) {
    for (const pattern of config.customPatterns) {
      if (!pattern.id || !pattern.pattern) {
        errors.push('Custom patterns must have id and pattern');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
