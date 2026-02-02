/**
 * @module types/capture
 * @description Types for Salesforce authentication and log capture
 * @status COMPLETE
 * @see src/types/STATE.md
 * @dependencies none
 * @lastModified 2026-01-31
 */

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Supported authentication methods
 */
export type AuthMethod = 
  | 'oauth_pkce'      // Browser-based OAuth 2.0 with PKCE
  | 'device_code'     // Device code flow for headless environments
  | 'sfdx'            // Import from SFDX CLI
  | 'manual_token'    // Manually provided access token
  | 'refresh_token';  // Refresh token flow

/**
 * Authentication state
 */
export type AuthState = 
  | 'disconnected'
  | 'authenticating'
  | 'connected'
  | 'refreshing'
  | 'expired'
  | 'error';

/**
 * Salesforce environment type
 */
export type OrgType = 
  | 'production'
  | 'sandbox'
  | 'scratch'
  | 'developer'
  | 'trial';

/**
 * OAuth 2.0 tokens from Salesforce
 */
export interface OAuthTokens {
  /** Access token for API calls */
  accessToken: string;
  /** Refresh token for getting new access tokens */
  refreshToken?: string;
  /** Instance URL (e.g., https://na123.salesforce.com) */
  instanceUrl: string;
  /** Token type (usually 'Bearer') */
  tokenType: string;
  /** Scopes granted */
  scope?: string;
  /** Access token expiration timestamp (Unix ms) */
  expiresAt?: number;
  /** ID token for OpenID Connect */
  idToken?: string;
}

/**
 * Salesforce connection details
 */
export interface SalesforceConnection {
  /** Unique connection identifier */
  id: string;
  /** Display name for this connection */
  alias: string;
  /** Organization ID (15 or 18 char) */
  orgId: string;
  /** Current user ID */
  userId: string;
  /** Username */
  username: string;
  /** Instance URL */
  instanceUrl: string;
  /** API version to use */
  apiVersion: string;
  /** Organization type */
  orgType: OrgType;
  /** How this connection was authenticated */
  authMethod: AuthMethod;
  /** Current authentication state */
  authState: AuthState;
  /** OAuth tokens */
  tokens: OAuthTokens;
  /** When connection was created */
  createdAt: Date;
  /** Last successful API call */
  lastUsedAt?: Date;
  /** Connection metadata */
  metadata?: OrgMetadata;
}

/**
 * Org metadata fetched after authentication
 */
export interface OrgMetadata {
  /** Organization name */
  orgName: string;
  /** Is this a sandbox */
  isSandbox: boolean;
  /** Org edition (Enterprise, Professional, etc.) */
  edition?: string;
  /** Namespace prefix if any */
  namespacePrefix?: string;
  /** Feature licenses available */
  features?: string[];
}

/**
 * OAuth PKCE flow configuration
 */
export interface PKCEConfig {
  /** OAuth client ID (Connected App Consumer Key) */
  clientId: string;
  /** OAuth redirect URI */
  redirectUri: string;
  /** Login URL (login.salesforce.com or test.salesforce.com) */
  loginUrl: string;
  /** Required OAuth scopes */
  scopes: string[];
  /** Generated code verifier (43-128 chars) */
  codeVerifier?: string;
  /** SHA256 hash of code verifier */
  codeChallenge?: string;
  /** Challenge method (always S256) */
  codeChallengeMethod: 'S256';
}

/**
 * Device code flow response
 */
export interface DeviceCodeResponse {
  /** Device code to poll with */
  deviceCode: string;
  /** Code for user to enter */
  userCode: string;
  /** URL where user enters code */
  verificationUri: string;
  /** Full URL with code pre-filled */
  verificationUriComplete?: string;
  /** Seconds until device_code expires */
  expiresIn: number;
  /** Polling interval in seconds */
  interval: number;
}

/**
 * Device code poll status
 */
export type DeviceCodePollStatus = 
  | 'pending'           // User hasn't authorized yet
  | 'slow_down'         // Polling too fast
  | 'authorization_pending'
  | 'access_denied'     // User denied
  | 'expired_token'     // Device code expired
  | 'success';

/**
 * SFDX auth info (from sfdx force:org:display)
 */
export interface SFDXAuthInfo {
  /** Org alias in SFDX */
  alias?: string;
  /** Username */
  username: string;
  /** Org ID */
  orgId: string;
  /** Access token */
  accessToken: string;
  /** Instance URL */
  instanceUrl: string;
  /** Is default dev hub */
  isDevHub?: boolean;
  /** Is default username */
  isDefaultUsername?: boolean;
  /** Connected status */
  connectedStatus?: string;
}

/**
 * Authentication failure record for tracking attempted auth methods
 * @see Architecture/AI_SALESFORCE_DEBUG_ARCHITECTURE_V2.md Section 4.4
 */
export interface AuthFailure {
  /** The authentication method that was attempted */
  method: 'pkce' | 'device_code' | 'sfdx_import' | 'manual_token';
  /** Error message from the attempt */
  error: string;
  /** Suggestion for how to fix or work around this failure */
  suggestion: string;
  /** Timestamp of the failure */
  timestamp: number;
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  success: boolean;
  /** The method that was used (successful or final failed attempt) */
  method?: 'pkce' | 'device_code' | 'sfdx_import' | 'manual_token';
  /** Connection if successful */
  connection?: SalesforceConnection;
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: AuthErrorCode;
  /** Chain of failed auth attempts before success/final failure */
  failureChain?: AuthFailure[];
  /** Warnings about the auth method (e.g., "Device Code worked but may not work in prod org") */
  warnings?: string[];
}

/**
 * Authentication error codes
 */
export type AuthErrorCode = 
  | 'INVALID_GRANT'
  | 'INVALID_CLIENT'
  | 'UNAUTHORIZED_CLIENT'
  | 'ACCESS_DENIED'
  | 'EXPIRED_TOKEN'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PKCE_MISMATCH'
  | 'SFDX_NOT_FOUND'
  | 'NO_DEFAULT_ORG'
  | 'INVALID_TOKEN'
  // Token exchange errors
  | 'TOKEN_EXCHANGE_FAILED'
  | 'TOKEN_REFRESH_FAILED'
  | 'USER_IDENTITY_FAILED'
  | 'IDENTITY_FETCH_FAILED';

// ============================================================================
// Trace Flag & Debug Level Types
// ============================================================================

/**
 * Salesforce debug log level
 */
export type DebugLogLevel = 
  | 'NONE'
  | 'ERROR'
  | 'WARN'
  | 'INFO'
  | 'DEBUG'
  | 'FINE'
  | 'FINER'
  | 'FINEST';

/**
 * Debug log categories
 */
export type DebugLogCategory = 
  | 'Apex_code'
  | 'Apex_profiling'
  | 'Callout'
  | 'Database'
  | 'System'
  | 'Validation'
  | 'Visualforce'
  | 'Workflow'
  | 'NBA'
  | 'Wave';

/**
 * Debug level configuration
 */
export interface DebugLevel {
  /** Salesforce ID */
  id?: string;
  /** Developer name */
  developerName: string;
  /** Master label */
  masterLabel: string;
  /** Level for each category */
  levels: Record<DebugLogCategory, DebugLogLevel>;
}

/**
 * Debug level preset for specific analysis types
 */
export interface DebugLevelPreset {
  /** Preset name */
  name: string;
  /** What this preset is optimized for */
  description: string;
  /** Issue types this helps detect */
  optimizedFor: string[];
  /** The debug level configuration */
  debugLevel: Omit<DebugLevel, 'id'>;
  /** Expected log size (small/medium/large) */
  expectedLogSize: 'small' | 'medium' | 'large';
  /** Performance impact (low/medium/high) */
  performanceImpact: 'low' | 'medium' | 'high';
}

/**
 * Trace flag target types
 */
export type TraceFlagTargetType = 
  | 'USER'             // Specific user
  | 'APEX_CLASS'       // Apex class
  | 'APEX_TRIGGER'     // Apex trigger
  | 'PLATFORM_EVENTCHANNEL' // Platform event
  | 'TRACEFLAG';       // Meta trace flag

/**
 * Trace flag configuration
 */
export interface TraceFlag {
  /** Salesforce ID */
  id?: string;
  /** Target type */
  tracedEntityType: TraceFlagTargetType;
  /** ID of the traced entity (user, class, trigger) */
  tracedEntityId: string;
  /** Debug level ID */
  debugLevelId: string;
  /** Start time */
  startDate: Date;
  /** Expiration time */
  expirationDate: Date;
  /** Log type */
  logType: 'DEVELOPER_LOG' | 'USER_DEBUG';
}

/**
 * Trace flag creation request
 */
export interface CreateTraceFlagRequest {
  /** Target type */
  targetType: TraceFlagTargetType;
  /** Target ID (user ID, class ID, etc.) */
  targetId: string;
  /** Debug level preset name or custom debug level */
  debugLevel: string | DebugLevel;
  /** Duration in minutes (max 1440 = 24 hours) */
  durationMinutes: number;
}

/**
 * Trace flag creation result
 */
export interface TraceFlagResult {
  success: boolean;
  traceFlag?: TraceFlag;
  debugLevel?: DebugLevel;
  error?: string;
}

// ============================================================================
// Log Capture Types
// ============================================================================

/**
 * ApexLog object from Salesforce
 */
export interface ApexLogRecord {
  /** Salesforce ID */
  Id: string;
  /** When the log was created */
  StartTime: string;
  /** Request type */
  Request: string;
  /** Operation being logged */
  Operation: string;
  /** Application that generated the log */
  Application: string;
  /** Status (Success, Failure) */
  Status: string;
  /** Log length in bytes */
  LogLength: number;
  /** User who generated the log */
  LogUser: {
    Id: string;
    Name: string;
    Username: string;
  };
  /** Duration in milliseconds */
  DurationMilliseconds: number;
  /** Location */
  Location?: string;
}

/**
 * Log list filter options
 */
export interface LogListFilter {
  /** Filter by user ID */
  userId?: string;
  /** Filter by request type */
  request?: string;
  /** Filter by operation */
  operation?: string;
  /** Filter by status */
  status?: 'Success' | 'Failure';
  /** Filter logs after this time */
  startTimeAfter?: Date;
  /** Filter logs before this time */
  startTimeBefore?: Date;
  /** Minimum log size in bytes */
  minSize?: number;
  /** Maximum log size in bytes */
  maxSize?: number;
  /** Maximum number of logs to return */
  limit?: number;
  /** Order by field */
  orderBy?: 'StartTime' | 'LogLength' | 'DurationMilliseconds';
  /** Sort direction */
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Fetched debug log with content
 */
export interface FetchedLog {
  /** Log metadata */
  record: ApexLogRecord;
  /** Raw log content */
  content: string;
  /** When the content was fetched */
  fetchedAt: Date;
  /** Whether log was truncated during fetch */
  truncated: boolean;
}

/**
 * Log fetch result
 */
export interface LogFetchResult {
  success: boolean;
  log?: FetchedLog;
  error?: string;
}

/**
 * Log watch event
 */
export interface LogWatchEvent {
  /** Event type */
  type: 'new_log' | 'log_ready' | 'error' | 'stopped';
  /** Log record if applicable */
  log?: ApexLogRecord;
  /** Error message if applicable */
  error?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Log watcher options
 */
export interface LogWatcherOptions {
  /** User ID to watch (defaults to authenticated user) */
  userId?: string;
  /** Polling interval in milliseconds */
  pollIntervalMs?: number;
  /** Auto-fetch log content when detected */
  autoFetch?: boolean;
  /** Maximum log size to auto-fetch (in bytes) */
  maxAutoFetchSize?: number;
  /** Filter criteria for logs */
  filter?: Partial<LogListFilter>;
}

/**
 * Log watcher state
 */
export type LogWatcherState = 
  | 'stopped'
  | 'starting'
  | 'watching'
  | 'error';

// ============================================================================
// Connection Pool Types
// ============================================================================

/**
 * Connection pool options
 */
export interface ConnectionPoolOptions {
  /** Maximum number of connections to keep */
  maxConnections?: number;
  /** Connection idle timeout in milliseconds */
  idleTimeoutMs?: number;
  /** Auto-refresh tokens before expiry */
  autoRefresh?: boolean;
  /** Minutes before expiry to trigger refresh */
  refreshBufferMinutes?: number;
}

/**
 * Connection pool status
 */
export interface ConnectionPoolStatus {
  /** Total connections in pool */
  totalConnections: number;
  /** Active (recently used) connections */
  activeConnections: number;
  /** Idle connections */
  idleConnections: number;
  /** Connections with expired tokens */
  expiredConnections: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Tooling API request options
 */
export interface ToolingAPIRequest {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Endpoint path (relative to /services/data/vXX.0/tooling/) */
  path: string;
  /** Request body */
  body?: unknown;
  /** Query parameters */
  params?: Record<string, string | number | boolean>;
}

/**
 * Tooling API response
 */
export interface ToolingAPIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    errorCode: string;
    fields?: string[];
  };
  statusCode: number;
}

/**
 * SOQL query result
 */
export interface QueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

// ============================================================================
// Composite Types
// ============================================================================

/**
 * Full capture session state
 */
export interface CaptureSession {
  /** Connection being used */
  connection: SalesforceConnection;
  /** Active trace flags */
  traceFlags: TraceFlag[];
  /** Current watcher state */
  watcherState: LogWatcherState;
  /** Captured logs */
  capturedLogs: FetchedLog[];
  /** Session start time */
  startedAt: Date;
  /** Last activity time */
  lastActivityAt: Date;
}

/**
 * Auth manager configuration
 */
export interface AuthManagerConfig {
  /** Preferred auth methods in order */
  preferredMethods?: AuthMethod[];
  /** OAuth client ID for PKCE/device flow */
  clientId?: string;
  /** OAuth redirect URI */
  redirectUri?: string;
  /** Login URL override */
  loginUrl?: string;
  /** Enable SFDX fallback */
  enableSfdxFallback?: boolean;
  /** Enable manual token fallback */
  enableManualToken?: boolean;
  /** Token storage path */
  tokenStoragePath?: string;
  /** Encrypt stored tokens */
  encryptTokens?: boolean;
}

/**
 * Environment detection result
 */
export interface EnvironmentInfo {
  /** Is browser environment */
  isBrowser: boolean;
  /** Is Node.js environment */
  isNode: boolean;
  /** Is headless (no UI) */
  isHeadless: boolean;
  /** Is SSH session */
  isSSH: boolean;
  /** Has SFDX CLI */
  hasSfdx: boolean;
  /** Has local browser for OAuth */
  hasLocalBrowser: boolean;
  /** Recommended auth methods */
  recommendedMethods: AuthMethod[];
}
