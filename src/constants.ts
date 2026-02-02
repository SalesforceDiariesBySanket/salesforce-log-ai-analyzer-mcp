/**
 * @module constants
 * @description Central constants file for all threshold values and magic numbers
 * @status COMPLETE
 * @see Project Management and Tracking/CONVENTIONS.md
 * @dependencies none
 * @lastModified 2026-01-31
 */

// ============================================================================
// Governor Limit Thresholds (percentage-based)
// ============================================================================

/**
 * Threshold percentages for governor limit severity classification
 */
export const LIMIT_THRESHOLDS = {
  /** Limit exceeded (100% or more) */
  CRITICAL: 100,
  /** High usage - immediate attention needed */
  HIGH: 90,
  /** Medium usage - concerning */
  MEDIUM: 75,
  /** Warning level for some checks */
  WARNING: 70,
} as const;

// ============================================================================
// Memory/Cache Settings
// ============================================================================

/**
 * Default settings for memory and caching
 */
export const MEMORY_DEFAULTS = {
  /** Maximum entries in memory cache */
  MAX_CACHE_ENTRIES: 1000,
  /** Maximum retention period in days */
  MAX_RETENTION_DAYS: 90,
  /** Short-term memory window in minutes */
  SHORT_TERM_WINDOW_MINUTES: 30,
} as const;

// ============================================================================
// Async Job Settings
// ============================================================================

/**
 * Default settings for async job tracking
 */
export const ASYNC_DEFAULTS = {
  /** Maximum child jobs to track per parent */
  MAX_CHILDREN: 10,
  /** Default timeout for job tracking in seconds */
  DEFAULT_TIMEOUT_SECONDS: 300,
} as const;

// ============================================================================
// Token/Auth Settings
// ============================================================================

/**
 * OAuth token settings
 */
export const TOKEN_DEFAULTS = {
  /** Default token expiry in seconds (2 hours) */
  EXPIRY_SECONDS: 7200,
  /** Buffer before expiry to refresh (5 minutes) */
  REFRESH_BUFFER_SECONDS: 300,
  /** Maximum retry attempts for auth */
  MAX_RETRY_ATTEMPTS: 3,
} as const;

// ============================================================================
// Trace Flag Settings
// ============================================================================

/**
 * Trace flag duration limits
 */
export const TRACE_FLAG_LIMITS = {
  /** Maximum duration in minutes (24 hours) */
  MAX_DURATION_MINUTES: 1440,
  /** Default duration in minutes (30 minutes) */
  DEFAULT_DURATION_MINUTES: 30,
  /** Minimum duration in minutes */
  MIN_DURATION_MINUTES: 1,
} as const;

// ============================================================================
// Encryption Settings
// ============================================================================

/**
 * Encryption parameters
 */
export const ENCRYPTION_SETTINGS = {
  /** PBKDF2 iterations for key derivation */
  PBKDF2_ITERATIONS: 100000,
  /** Salt length in bytes */
  SALT_LENGTH_BYTES: 16,
  /** Key length in bytes (256-bit) */
  KEY_LENGTH_BYTES: 32,
  /** IV length for AES-GCM */
  IV_LENGTH_BYTES: 12,
  /** Auth tag length for AES-GCM */
  AUTH_TAG_LENGTH_BYTES: 16,
} as const;

// ============================================================================
// Display/Formatting
// ============================================================================

/**
 * Text display limits
 */
export const DISPLAY_LIMITS = {
  /** Maximum characters for truncated preview */
  PREVIEW_MAX_CHARS: 50,
  /** Maximum characters for code snippet */
  CODE_SNIPPET_MAX_CHARS: 200,
} as const;

// ============================================================================
// Severity Emoji Indicators
// ============================================================================

/**
 * Status indicator emojis for display
 */
export const STATUS_INDICATORS = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  WARNING: '🟡',
  OK: '🟢',
} as const;

// ============================================================================
// Parser/Log Size Limits
// ============================================================================

/**
 * Log parsing limits (externalized from hardcoded values)
 */
export const PARSER_LIMITS = {
  /** Maximum line length to process (ReDoS prevention) - 1MB */
  MAX_LINE_LENGTH: 1024 * 1024,
  /** Salesforce log truncation threshold (20MB) */
  SF_TRUNCATION_THRESHOLD: 20 * 1024 * 1024,
  /** Threshold percentage for truncation detection (95% of limit) */
  TRUNCATION_DETECTION_PERCENT: 0.95,
} as const;

/**
 * MCP Server limits
 */
export const MCP_LIMITS = {
  /** Maximum content size to accept (50MB) */
  MAX_CONTENT_SIZE: 50 * 1024 * 1024,
  /** Maximum logs to cache */
  DEFAULT_MAX_CACHED_LOGS: 10,
} as const;

// ============================================================================
// Async Correlation Settings
// ============================================================================

/**
 * Async job correlation time windows
 */
export const CORRELATION_SETTINGS = {
  /** Time buffer before earliest job (ms) */
  TIME_BUFFER_BEFORE_MS: 5000,
  /** Default max time window for correlation (ms) */
  DEFAULT_MAX_TIME_WINDOW_MS: 60000,
  /** Minimum confidence threshold for correlation */
  MIN_CONFIDENCE: 0.5,
  /** Maximum children to return per parent */
  MAX_CHILDREN: 10,
} as const;
