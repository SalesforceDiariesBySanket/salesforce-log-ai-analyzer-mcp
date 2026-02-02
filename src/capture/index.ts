/**
 * @module capture/index
 * @description Salesforce authentication and log capture
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts
 * @lastModified 2026-02-01
 */

// ============================================================================
// Environment Detection
// ============================================================================

export {
  isSSHSession,
  isDockerContainer,
  isCIEnvironment,
  isHeadlessEnvironment,
  hasDisplayServer,
  canOpenBrowser,
  requiresDeviceCodeFlow as requiresDeviceCodeFlowCheck,
  canUsePKCEFlowCheck,
  detectEnvironmentSync,
} from './environment';

// ============================================================================
// Authentication
// ============================================================================

// OAuth PKCE Flow
export {
  performPKCEFlow,
  canUsePKCEFlow,
  createPKCEConfig,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserIdentity,
  fetchOrgMetadata,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  startCallbackServer,
  PRODUCTION_LOGIN_URL,
  SANDBOX_LOGIN_URL,
  DEFAULT_REDIRECT_URI,
  DEFAULT_SCOPES,
  type PKCEFlowOptions,
} from './oauth-pkce';

// Device Code Flow
export {
  performDeviceCodeFlow,
  requiresDeviceCodeFlow,
  initiateDeviceCodeFlow,
  pollForDeviceToken,
  formatDeviceCodeMessage,
  type DeviceCodeFlowOptions,
} from './device-code';

// SFDX Import
export {
  importSfdxAuth,
  isSfdxInstalled,
  getSfdxCommand,
  listSfdxOrgs,
  getSfdxOrgInfo,
  getDefaultSfdxOrg,
  listSfdxOrgsForSelection,
  formatSfdxOrgList,
  readSfdxAuthFromDisk,
  listStoredSfdxOrgs,
  type SfdxImportOptions,
  type SfdxOrgListItem,
} from './sfdx-import';

// Manual Token
export {
  authenticateWithManualToken,
  isValidTokenFormat,
  isValidInstanceUrl,
  normalizeInstanceUrl,
  parseTokenInput,
  validateTokenPromptInput,
  MANUAL_TOKEN_INSTRUCTIONS,
  type ManualTokenOptions,
  type TokenPromptResult,
} from './manual-token';

// Auth Manager
export {
  AuthManager,
  getAuthManager,
  authenticate,
  isConnected,
  getCurrentConnection,
  disconnect,
  detectEnvironment,
  cacheConnection,
  getCachedConnection,
  listCachedConnections,
  removeCachedConnection,
  clearConnectionCache,
} from './auth-manager';

// ============================================================================
// Debug Level & Trace Flags
// ============================================================================

// Debug Level Presets
export {
  getPreset,
  listPresets,
  listPresetNames,
  getPresetsForIssueType,
  getBestPresetForIssues,
  mergePresets,
  createDebugLevel,
  formatDebugLevel,
  estimateLogSize,
  ALL_CATEGORIES,
  LOG_LEVEL_ORDER,
  PRESET_MINIMAL,
  PRESET_SOQL_ANALYSIS,
  PRESET_GOVERNOR_LIMITS,
  PRESET_TRIGGERS,
  PRESET_CPU_HOTSPOTS,
  PRESET_EXCEPTIONS,
  PRESET_CALLOUTS,
  PRESET_VISUALFORCE,
  PRESET_WORKFLOW,
  PRESET_FULL_DIAGNOSTIC,
  PRESET_AI_OPTIMIZED,
  PRESETS,
} from './debug-level-presets';

// Trace Flag Manager
export {
  TraceFlagManager,
  createTraceFlag,
  getTraceFlag,
  getDebugLevel,
  listDebugLevels,
  listTraceFlagsForUser,
  listActiveTraceFlags,
  extendTraceFlag,
  deleteTraceFlag,
  deleteUserTraceFlags,
  // Automated Process user support for async tracing
  SYSTEM_USERS,
  findAutomatedProcessUser,
  findSystemUser,
  createAsyncTraceFlags,
  analyzeAsyncTraceCoverage,
  getActiveTraceFlagsForUser,
  type AsyncTraceFlagResult,
} from './trace-flag-manager';

// ============================================================================
// Log Capture
// ============================================================================

// Log Fetcher
export {
  LogFetcher,
  listLogs,
  listRecentLogs,
  getLogRecord,
  fetchLog,
  fetchLogContent,
  fetchLogs,
  fetchMostRecentLog,
  deleteLog,
  deleteLogs,
  deleteAllUserLogs,
} from './log-fetcher';

// Log Watcher
export {
  LogWatcher,
  createLogWatcher,
  waitForNextLog,
  collectLogs,
  type LogWatcherEvents,
} from './log-watcher';

// Connection Pool
export {
  ConnectionPool,
  getConnectionPool,
  resetConnectionPool,
} from './connection-pool';
