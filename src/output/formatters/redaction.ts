/**
 * @module output/formatters/redaction
 * @description Redact sensitive data from output (PII, credentials)
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies none
 * @lastModified 2026-01-31
 */

import type { JSONOutput, CompactEvent, OutputIssue } from './types';

// ============================================================================
// Redaction Patterns
// ============================================================================

/**
 * Default sensitive patterns to redact
 */
export const DEFAULT_REDACTION_PATTERNS: RegExp[] = [
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Phone numbers (various formats)
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  // Salesforce IDs (15 or 18 char)
  /\b[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?\b/g,
  // Credit card patterns
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  // SSN patterns
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  // IP addresses
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  // Session IDs (common patterns)
  /\bsessionId[=:]\s*['"]?[\w-]+['"]?/gi,
  // Access tokens
  /\b(access_?token|bearer|api_?key)[=:]\s*['"]?[\w-]+['"]?/gi,
];

// ============================================================================
// Redaction Implementation
// ============================================================================

/**
 * Redact sensitive data from output
 * 
 * @param output - The JSON output to redact
 * @param customPatterns - Additional custom patterns
 */
export function redactSensitiveData(
  output: JSONOutput,
  customPatterns: RegExp[] = []
): void {
  const patterns = [...DEFAULT_REDACTION_PATTERNS, ...customPatterns];

  // Redact events
  if (output.events) {
    output.events = output.events.map(e => redactValue(e, patterns) as CompactEvent);
  }

  // Redact issues
  if (output.issues) {
    output.issues = output.issues.map(i => redactValue(i, patterns) as OutputIssue);
  }

  // Redact AI context
  if (output.aiContext) {
    output.aiContext.confidenceReasons = output.aiContext.confidenceReasons.map(
      r => redactString(r, patterns)
    );
    output.aiContext.limitations = output.aiContext.limitations.map(
      l => redactString(l, patterns)
    );
    output.aiContext.nextSteps = output.aiContext.nextSteps.map(
      s => redactString(s, patterns)
    );
  }
}

/**
 * Redact a single string value
 */
function redactString(value: string, patterns: RegExp[]): string {
  let redacted = value;
  for (const pattern of patterns) {
    // Clone regex to reset lastIndex for global patterns
    const clonedPattern = new RegExp(pattern.source, pattern.flags);
    redacted = redacted.replace(clonedPattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * Recursively redact values in an object
 */
function redactValue(value: unknown, patterns: RegExp[]): unknown {
  if (typeof value === 'string') {
    return redactString(value, patterns);
  }

  if (Array.isArray(value)) {
    return value.map(v => redactValue(v, patterns));
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const redactedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      redactedObj[key] = redactValue(val, patterns);
    }
    return redactedObj;
  }

  return value;
}
