/**
 * @module privacy/patterns
 * @description PII detection patterns for various sensitive data types
 * @status COMPLETE
 * @see src/privacy/STATE.md
 * @dependencies none
 * @lastModified 2026-01-31
 */

// ============================================================================
// Pattern Types
// ============================================================================

/**
 * Sensitivity levels for detected data
 */
export type SensitivityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/**
 * Categories of sensitive data
 */
export type PIICategory =
  | 'EMAIL'
  | 'PHONE'
  | 'SSN'
  | 'CREDIT_CARD'
  | 'IP_ADDRESS'
  | 'SALESFORCE_ID'
  | 'SESSION_TOKEN'
  | 'API_KEY'
  | 'PASSWORD'
  | 'ADDRESS'
  | 'NAME'
  | 'DATE_OF_BIRTH'
  | 'CUSTOM';

/**
 * A pattern definition with metadata
 */
export interface PIIPattern {
  /** Unique identifier for the pattern */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category of PII */
  category: PIICategory;
  /** Sensitivity level */
  sensitivity: SensitivityLevel;
  /** Regex pattern (global flag will be added) */
  pattern: RegExp;
  /** Description of what this pattern matches */
  description: string;
  /** Example matches */
  examples: string[];
  /** Replacement placeholder (without brackets) */
  placeholder: string;
  /** 
   * Fast check function - returns false if text definitely doesn't contain this PII type.
   * Used to skip expensive regex execution when not needed.
   * If undefined, regex is always run.
   */
  fastCheck?: (text: string) => boolean;
}

// ============================================================================
// Built-in Patterns
// ============================================================================

/**
 * Email address pattern
 */
export const EMAIL_PATTERN: PIIPattern = {
  id: 'email',
  name: 'Email Address',
  category: 'EMAIL',
  sensitivity: 'HIGH',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
  description: 'Matches email addresses',
  examples: ['user@example.com', 'admin@salesforce.com'],
  placeholder: 'EMAIL',
  fastCheck: (text) => text.includes('@'),
};

/**
 * US Phone number patterns
 */
export const PHONE_PATTERN: PIIPattern = {
  id: 'phone',
  name: 'Phone Number',
  category: 'PHONE',
  sensitivity: 'HIGH',
  pattern: /\b(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  description: 'Matches US phone numbers in various formats',
  examples: ['555-123-4567', '(555) 123-4567', '+1 555.123.4567'],
  placeholder: 'PHONE',
  // Phone numbers need at least 7 digits
  fastCheck: (text) => /\d{3}/.test(text),
};

/**
 * Social Security Number pattern
 * 
 * NOTE: Strengthened to require explicit delimiters (hyphens or spaces)
 * to avoid false positives on timestamps, error codes, and record counts.
 * Pattern requires: XXX-XX-XXXX or XXX XX XXXX format.
 */
export const SSN_PATTERN: PIIPattern = {
  id: 'ssn',
  name: 'Social Security Number',
  category: 'SSN',
  sensitivity: 'CRITICAL',
  // Requires explicit delimiters to avoid matching timestamps like "123456789" or error codes
  pattern: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
  description: 'Matches US Social Security Numbers with explicit delimiters',
  examples: ['123-45-6789', '123 45 6789'],
  placeholder: 'SSN',
  // SSN requires digits with hyphen or space delimiter
  fastCheck: (text) => /\d[-\s]\d/.test(text),
};

/**
 * Credit Card Number pattern
 */
export const CREDIT_CARD_PATTERN: PIIPattern = {
  id: 'credit_card',
  name: 'Credit Card Number',
  category: 'CREDIT_CARD',
  sensitivity: 'CRITICAL',
  pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  description: 'Matches credit card numbers (16 digits)',
  examples: ['4111-1111-1111-1111', '5500 0000 0000 0004'],
  placeholder: 'CREDIT_CARD',
  // Credit cards need at least 12 consecutive-ish digits
  fastCheck: (text) => /\d{4}/.test(text),
};

/**
 * IP Address pattern (IPv4)
 */
export const IP_ADDRESS_PATTERN: PIIPattern = {
  id: 'ip_address',
  name: 'IP Address',
  category: 'IP_ADDRESS',
  sensitivity: 'MEDIUM',
  pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  description: 'Matches IPv4 addresses',
  examples: ['192.168.1.1', '10.0.0.255'],
  placeholder: 'IP',
  // IP addresses need digit.digit pattern
  fastCheck: (text) => /\d\.\d/.test(text),
};

/**
 * Salesforce ID pattern (15 or 18 character)
 */
export const SALESFORCE_ID_PATTERN: PIIPattern = {
  id: 'salesforce_id',
  name: 'Salesforce ID',
  category: 'SALESFORCE_ID',
  sensitivity: 'LOW',
  pattern: /\b[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?\b/g,
  description: 'Matches Salesforce record IDs (15 or 18 char)',
  examples: ['001000000000001', '001000000000001AAA'],
  placeholder: 'SF_ID',
};

/**
 * Session ID / Token pattern
 */
export const SESSION_TOKEN_PATTERN: PIIPattern = {
  id: 'session_token',
  name: 'Session Token',
  category: 'SESSION_TOKEN',
  sensitivity: 'CRITICAL',
  pattern: /\b(?:session[_-]?id|sid|token)[=:]\s*['"]?[\w-]{20,}['"]?/gi,
  description: 'Matches session IDs and tokens',
  examples: ['sessionId=abc123def456...', 'token: xyz789...'],
  placeholder: 'SESSION',
  // Session tokens need session/sid/token keywords
  fastCheck: (text) => {
    const lower = text.toLowerCase();
    return lower.includes('session') || lower.includes('sid') || lower.includes('token');
  },
};

/**
 * API Key pattern
 */
export const API_KEY_PATTERN: PIIPattern = {
  id: 'api_key',
  name: 'API Key',
  category: 'API_KEY',
  sensitivity: 'CRITICAL',
  pattern: /\b(?:api[_-]?key|apikey|access[_-]?token|bearer)[=:\s]+['"]?[\w-]{20,}['"]?/gi,
  description: 'Matches API keys and access tokens',
  examples: ['api_key=sk-abc123...', 'Bearer eyJhbGc...'],
  placeholder: 'API_KEY',
  // API keys need api/key/bearer/access keywords
  fastCheck: (text) => {
    const lower = text.toLowerCase();
    return lower.includes('api') || lower.includes('key') || lower.includes('bearer') || lower.includes('access');
  },
};

/**
 * Password pattern (in logs/configs)
 */
export const PASSWORD_PATTERN: PIIPattern = {
  id: 'password',
  name: 'Password',
  category: 'PASSWORD',
  sensitivity: 'CRITICAL',
  pattern: /\b(?:password|passwd|pwd|secret)[=:\s]+['"]?[^\s'"]{4,}['"]?/gi,
  description: 'Matches password fields in logs/configs',
  examples: ['password=secret123', 'pwd: "myPassword"'],
  placeholder: 'PASSWORD',
  // Password fields need password/passwd/pwd/secret keywords
  fastCheck: (text) => {
    const lower = text.toLowerCase();
    return lower.includes('password') || lower.includes('passwd') || lower.includes('pwd') || lower.includes('secret');
  },
};

// ============================================================================
// Pattern Collections
// ============================================================================

/**
 * All built-in PII patterns
 */
export const ALL_PATTERNS: PIIPattern[] = [
  EMAIL_PATTERN,
  PHONE_PATTERN,
  SSN_PATTERN,
  CREDIT_CARD_PATTERN,
  IP_ADDRESS_PATTERN,
  SALESFORCE_ID_PATTERN,
  SESSION_TOKEN_PATTERN,
  API_KEY_PATTERN,
  PASSWORD_PATTERN,
];

/**
 * High-sensitivity patterns only (CRITICAL + HIGH)
 */
export const HIGH_SENSITIVITY_PATTERNS: PIIPattern[] = ALL_PATTERNS.filter(
  (p) => p.sensitivity === 'CRITICAL' || p.sensitivity === 'HIGH'
);

/**
 * Patterns by category
 */
export const PATTERNS_BY_CATEGORY: Map<PIICategory, PIIPattern[]> = new Map(
  Array.from(new Set(ALL_PATTERNS.map((p) => p.category))).map((cat) => [
    cat,
    ALL_PATTERNS.filter((p) => p.category === cat),
  ])
);

/**
 * Get patterns for specific sensitivity levels
 */
export function getPatternsForSensitivity(
  minSensitivity: SensitivityLevel
): PIIPattern[] {
  const levels: SensitivityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
  const minIndex = levels.indexOf(minSensitivity);
  return ALL_PATTERNS.filter((p) => levels.indexOf(p.sensitivity) <= minIndex);
}

/**
 * Create a custom pattern
 */
export function createCustomPattern(
  id: string,
  name: string,
  pattern: RegExp,
  sensitivity: SensitivityLevel = 'MEDIUM',
  placeholder?: string
): PIIPattern {
  return {
    id,
    name,
    category: 'CUSTOM',
    sensitivity,
    pattern: new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'),
    description: `Custom pattern: ${name}`,
    examples: [],
    placeholder: placeholder ?? id.toUpperCase(),
  };
}
