/**
 * @module privacy/classifier
 * @description Classify sensitivity of data fields and log content
 * @status COMPLETE
 * @see src/privacy/STATE.md
 * @dependencies src/privacy/patterns.ts
 * @lastModified 2026-01-31
 */

import {
  type SensitivityLevel,
  type PIICategory,
  type PIIPattern,
  ALL_PATTERNS,
} from './patterns';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of classifying a piece of text
 */
export interface ClassificationResult {
  /** Original text */
  text: string;
  /** Overall sensitivity level */
  sensitivity: SensitivityLevel;
  /** Detected PII matches */
  matches: PIIMatch[];
  /** Whether any PII was detected */
  hasPII: boolean;
  /** Highest sensitivity found */
  highestSensitivity: SensitivityLevel;
}

/**
 * A single PII match in text
 */
export interface PIIMatch {
  /** The pattern that matched */
  pattern: PIIPattern;
  /** Matched text */
  match: string;
  /** Start index in original text */
  startIndex: number;
  /** End index in original text */
  endIndex: number;
  /** Sensitivity level */
  sensitivity: SensitivityLevel;
  /** Category of PII */
  category: PIICategory;
}

/**
 * Field classification for structured data
 */
export interface FieldClassification {
  /** Field name */
  fieldName: string;
  /** Inferred sensitivity based on name */
  inferredSensitivity: SensitivityLevel;
  /** Actual sensitivity based on value */
  actualSensitivity: SensitivityLevel;
  /** Combined sensitivity (higher of inferred/actual) */
  combinedSensitivity: SensitivityLevel;
  /** Reason for classification */
  reason: string;
}

// ============================================================================
// Sensitivity Level Utilities
// ============================================================================

const SENSITIVITY_ORDER: SensitivityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

/**
 * Compare two sensitivity levels
 * @returns negative if a > b, positive if a < b, 0 if equal
 */
export function compareSensitivity(a: SensitivityLevel, b: SensitivityLevel): number {
  return SENSITIVITY_ORDER.indexOf(a) - SENSITIVITY_ORDER.indexOf(b);
}

/**
 * Get the higher of two sensitivity levels
 */
export function maxSensitivity(a: SensitivityLevel, b: SensitivityLevel): SensitivityLevel {
  return compareSensitivity(a, b) <= 0 ? a : b;
}

// ============================================================================
// Field Name Classification
// ============================================================================

/**
 * Patterns for inferring field sensitivity from name
 */
const FIELD_NAME_PATTERNS: Array<{ pattern: RegExp; sensitivity: SensitivityLevel; reason: string }> = [
  // CRITICAL fields
  { pattern: /password|passwd|pwd|secret/i, sensitivity: 'CRITICAL', reason: 'Password field' },
  { pattern: /ssn|social.?security/i, sensitivity: 'CRITICAL', reason: 'SSN field' },
  { pattern: /credit.?card|card.?number|ccn/i, sensitivity: 'CRITICAL', reason: 'Credit card field' },
  { pattern: /api.?key|access.?token|bearer/i, sensitivity: 'CRITICAL', reason: 'API key/token field' },
  { pattern: /session.?id|session.?token/i, sensitivity: 'CRITICAL', reason: 'Session field' },

  // HIGH fields
  { pattern: /email|e-mail/i, sensitivity: 'HIGH', reason: 'Email field' },
  { pattern: /phone|mobile|cell|fax/i, sensitivity: 'HIGH', reason: 'Phone field' },
  { pattern: /address|street|city|zip|postal/i, sensitivity: 'HIGH', reason: 'Address field' },
  { pattern: /birth.?date|dob|date.?of.?birth/i, sensitivity: 'HIGH', reason: 'Date of birth field' },

  // MEDIUM fields
  { pattern: /name|first.?name|last.?name|full.?name/i, sensitivity: 'MEDIUM', reason: 'Name field' },
  { pattern: /user.?name|username/i, sensitivity: 'MEDIUM', reason: 'Username field' },
  { pattern: /ip.?address|client.?ip/i, sensitivity: 'MEDIUM', reason: 'IP address field' },

  // LOW fields
  { pattern: /id$|_id$|Id$/i, sensitivity: 'LOW', reason: 'ID field' },
];

/**
 * Infer sensitivity from field name
 */
export function classifyFieldName(fieldName: string): { sensitivity: SensitivityLevel; reason: string } {
  for (const { pattern, sensitivity, reason } of FIELD_NAME_PATTERNS) {
    if (pattern.test(fieldName)) {
      return { sensitivity, reason };
    }
  }
  return { sensitivity: 'NONE', reason: 'No sensitive pattern detected in name' };
}

// ============================================================================
// Text Classification
// ============================================================================

/**
 * Classify a piece of text for PII
 * 
 * PERFORMANCE: Uses fastCheck functions to skip expensive regex when not needed.
 * For a 20MB log with 13 patterns, this can save significant CPU time.
 * 
 * @param text - Text to classify
 * @param patterns - Patterns to use (defaults to all)
 * @returns Classification result
 * 
 * @example
 * const result = classifyText('Contact: user@example.com, 555-123-4567');
 * console.log(result.hasPII); // true
 * console.log(result.matches.length); // 2
 */
export function classifyText(
  text: string,
  patterns: PIIPattern[] = ALL_PATTERNS
): ClassificationResult {
  const matches: PIIMatch[] = [];
  let highestSensitivity: SensitivityLevel = 'NONE';

  for (const pattern of patterns) {
    // PERFORMANCE: Skip expensive regex if fast-check fails
    // This avoids O(N×P) regex overhead when text clearly doesn't contain the PII type
    if (pattern.fastCheck && !pattern.fastCheck(text)) {
      continue;
    }

    // Clone regex to reset lastIndex
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        pattern,
        match: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        sensitivity: pattern.sensitivity,
        category: pattern.category,
      });

      highestSensitivity = maxSensitivity(highestSensitivity, pattern.sensitivity);
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.startIndex - b.startIndex);

  return {
    text,
    sensitivity: highestSensitivity,
    matches,
    hasPII: matches.length > 0,
    highestSensitivity,
  };
}

/**
 * Classify a field (name + value)
 */
export function classifyField(
  fieldName: string,
  fieldValue: string,
  patterns?: PIIPattern[]
): FieldClassification {
  const nameClassification = classifyFieldName(fieldName);
  const valueClassification = classifyText(fieldValue, patterns);

  return {
    fieldName,
    inferredSensitivity: nameClassification.sensitivity,
    actualSensitivity: valueClassification.highestSensitivity,
    combinedSensitivity: maxSensitivity(
      nameClassification.sensitivity,
      valueClassification.highestSensitivity
    ),
    reason: valueClassification.hasPII && valueClassification.matches[0]
      ? `Value contains ${valueClassification.matches[0].category}`
      : nameClassification.reason,
  };
}

/**
 * Quick check if text likely contains PII
 * More performant than full classification
 */
export function likelyContainsPII(text: string): boolean {
  // Quick heuristics before running all patterns
  if (text.includes('@') && /\.\w{2,}/.test(text)) return true; // Likely email
  if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)) return true; // Phone/SSN
  if (/\d{4}[-\s]?\d{4}/.test(text)) return true; // Card number
  if (/password|secret|token|api.?key/i.test(text)) return true; // Credentials

  return false;
}
