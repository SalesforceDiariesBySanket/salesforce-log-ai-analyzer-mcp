/**
 * @module privacy/redactor
 * @description Apply redaction to text and structured data
 * @status COMPLETE
 * @see src/privacy/STATE.md
 * @dependencies src/privacy/patterns.ts, src/privacy/classifier.ts
 * @lastModified 2026-01-31
 */

import type { PIIPattern, SensitivityLevel } from './patterns';
import { ALL_PATTERNS, getPatternsForSensitivity } from './patterns';
import { classifyText } from './classifier';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for redaction
 */
export interface RedactionOptions {
  /** Patterns to use (defaults to all) */
  patterns?: PIIPattern[];
  /** Minimum sensitivity level to redact */
  minSensitivity?: SensitivityLevel;
  /** Use placeholder tokens (e.g., [EMAIL]) or generic [REDACTED] */
  usePlaceholders?: boolean;
  /** Track redactions for auditing */
  trackRedactions?: boolean;
  /** Hash original values for debugging */
  hashOriginals?: boolean;
}

/**
 * Result of a redaction operation
 */
export interface RedactionResult {
  /** The redacted text */
  redacted: string;
  /** Original text (only if trackRedactions is true) */
  original?: string;
  /** List of redactions applied */
  redactions: RedactionInfo[];
  /** Number of redactions made */
  count: number;
  /** Whether any redactions were made */
  wasRedacted: boolean;
}

/**
 * Information about a single redaction
 */
export interface RedactionInfo {
  /** Type of PII redacted */
  type: string;
  /** Original value (may be hashed) */
  originalValue?: string;
  /** Placeholder used */
  placeholder: string;
  /** Position in original text */
  position: { start: number; end: number };
  /** Sensitivity level */
  sensitivity: SensitivityLevel;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<RedactionOptions> = {
  patterns: ALL_PATTERNS,
  minSensitivity: 'LOW',
  usePlaceholders: true,
  trackRedactions: false,
  hashOriginals: false,
};

// ============================================================================
// Redaction Implementation
// ============================================================================

/**
 * Simple hash function for debugging
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Create a placeholder token
 */
function createPlaceholder(pattern: PIIPattern, usePlaceholders: boolean, index: number): string {
  if (usePlaceholders) {
    return `[${pattern.placeholder}${index > 0 ? '_' + index : ''}]`;
  }
  return '[REDACTED]';
}

/**
 * Redact sensitive data from text
 * 
 * @param text - Text to redact
 * @param options - Redaction options
 * @returns Redaction result
 * 
 * @example
 * const result = redactText('Email: user@example.com');
 * console.log(result.redacted); // 'Email: [EMAIL]'
 */
export function redactText(
  text: string,
  options: RedactionOptions = {}
): RedactionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Get patterns based on minimum sensitivity
  const patterns = opts.minSensitivity
    ? getPatternsForSensitivity(opts.minSensitivity)
    : opts.patterns;

  // Classify text to find all matches
  const classification = classifyText(text, patterns);

  if (!classification.hasPII) {
    return {
      redacted: text,
      original: opts.trackRedactions ? text : undefined,
      redactions: [],
      count: 0,
      wasRedacted: false,
    };
  }

  // Track placeholder counts per pattern for unique numbering
  const placeholderCounts = new Map<string, number>();
  const redactions: RedactionInfo[] = [];

  // Sort matches by position in reverse order (replace from end to start)
  const sortedMatches = [...classification.matches].sort(
    (a, b) => b.startIndex - a.startIndex
  );

  let redacted = text;

  for (const match of sortedMatches) {
    // Get unique index for this placeholder type
    const count = placeholderCounts.get(match.pattern.id) ?? 0;
    placeholderCounts.set(match.pattern.id, count + 1);

    const placeholder = createPlaceholder(match.pattern, opts.usePlaceholders, count);

    // Record redaction info
    redactions.unshift({
      type: match.pattern.name,
      originalValue: opts.hashOriginals
        ? `hash:${simpleHash(match.match)}`
        : opts.trackRedactions
          ? match.match
          : undefined,
      placeholder,
      position: { start: match.startIndex, end: match.endIndex },
      sensitivity: match.sensitivity,
    });

    // Apply redaction
    redacted =
      redacted.substring(0, match.startIndex) +
      placeholder +
      redacted.substring(match.endIndex);
  }

  return {
    redacted,
    original: opts.trackRedactions ? text : undefined,
    redactions,
    count: redactions.length,
    wasRedacted: true,
  };
}

/**
 * Redact sensitive data from an object (deep)
 */
export function redactObject<T>(
  obj: T,
  options: RedactionOptions = {}
): { redacted: T; totalRedactions: number } {
  let totalRedactions = 0;

  function processValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const result = redactText(value, options);
      totalRedactions += result.count;
      return result.redacted;
    }

    if (Array.isArray(value)) {
      return value.map(processValue);
    }

    if (value && typeof value === 'object') {
      const processed: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        processed[key] = processValue(val);
      }
      return processed;
    }

    return value;
  }

  return {
    redacted: processValue(obj) as T,
    totalRedactions,
  };
}

/**
 * Redact multiple strings efficiently
 */
export function redactBatch(
  texts: string[],
  options: RedactionOptions = {}
): RedactionResult[] {
  return texts.map((text) => redactText(text, options));
}

/**
 * Create a reusable redactor function with preset options
 */
export function createRedactor(
  options: RedactionOptions = {}
): (text: string) => RedactionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return (text: string) => redactText(text, opts);
}
