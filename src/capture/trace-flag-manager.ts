/**
 * @module capture/trace-flag-manager
 * @description Manages Salesforce trace flags via Tooling API
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts, src/types/common.ts
 * @lastModified 2026-02-01
 */

import type {
  SalesforceConnection,
  TraceFlag,
  DebugLevel,
  DebugLogLevel,
  TraceFlagTargetType,
  CreateTraceFlagRequest,
  TraceFlagResult,
  ToolingAPIResponse,
  QueryResult,
} from '../types/capture';
import { type Result, ok, err, type AppError } from '../types/common';
import { getPreset } from './debug-level-presets';

// ============================================================================
// Error Types
// ============================================================================

/** Tooling API error codes */
export type ToolingErrorCode =
  | 'QUERY_FAILED'
  | 'CREATE_FAILED'
  | 'UPDATE_FAILED'
  | 'DELETE_FAILED'
  | 'NOT_FOUND';

/** Tooling API operation error */
export interface ToolingError extends AppError {
  code: ToolingErrorCode;
}

// ============================================================================
// Tooling API Client
// ============================================================================

/** Internal Tooling API error response */
interface ToolingAPIError {
  message?: string;
  errorCode?: string;
  fields?: string[];
}

/**
 * Makes a Tooling API request
 */
async function toolingRequest<T>(
  connection: SalesforceConnection,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<ToolingAPIResponse<T>> {
  const baseUrl = `${connection.instanceUrl}/services/data/${connection.apiVersion}/tooling`;
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Authorization': `${connection.tokens.tokenType} ${connection.tokens.accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => null) as ToolingAPIError | ToolingAPIError[] | T | null;

  if (!response.ok) {
    const errorData = data as ToolingAPIError | ToolingAPIError[] | null;
    const firstError = Array.isArray(errorData) ? errorData[0] : errorData;
    const errorMessage = firstError?.message || firstError?.errorCode || response.statusText;

    return {
      success: false,
      error: {
        message: errorMessage,
        errorCode: firstError?.errorCode || 'UNKNOWN',
        fields: firstError?.fields,
      },
      statusCode: response.status,
    };
  }

  return {
    success: true,
    data: data as T,
    statusCode: response.status,
  };
}

/**
 * Executes a SOQL query via Tooling API
 */
async function toolingQuery<T>(
  connection: SalesforceConnection,
  query: string
): Promise<Result<QueryResult<T>, ToolingError>> {
  const response = await toolingRequest<QueryResult<T>>(
    connection,
    'GET',
    `/query?q=${encodeURIComponent(query)}`
  );

  if (!response.success || !response.data) {
    return err({
      code: 'QUERY_FAILED',
      message: response.error?.message || 'Query failed',
    });
  }

  return ok(response.data);
}

// ============================================================================
// Debug Level Management
// ============================================================================

interface DebugLevelRecord {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  ApexCode: DebugLogLevel;
  ApexProfiling: DebugLogLevel;
  Callout: DebugLogLevel;
  Database: DebugLogLevel;
  System: DebugLogLevel;
  Validation: DebugLogLevel;
  Visualforce: DebugLogLevel;
  Workflow: DebugLogLevel;
  NBA: DebugLogLevel;
  Wave: DebugLogLevel;
}

/**
 * Gets or creates a debug level
 */
async function getOrCreateDebugLevel(
  connection: SalesforceConnection,
  debugLevel: Omit<DebugLevel, 'id'>
): Promise<Result<string, ToolingError>> {
  // First, check if debug level already exists
  const query = `SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = '${debugLevel.developerName}' LIMIT 1`;
  
  const queryResult = await toolingQuery<DebugLevelRecord>(connection, query);
  
  if (queryResult.success && queryResult.data.records.length > 0 && queryResult.data.records[0]) {
    return ok(queryResult.data.records[0].Id);
  }

  // Create new debug level
  const createResponse = await toolingRequest<{ id: string }>(
    connection,
    'POST',
    '/sobjects/DebugLevel',
    {
      DeveloperName: debugLevel.developerName,
      MasterLabel: debugLevel.masterLabel,
      ApexCode: debugLevel.levels.Apex_code,
      ApexProfiling: debugLevel.levels.Apex_profiling,
      Callout: debugLevel.levels.Callout,
      Database: debugLevel.levels.Database,
      System: debugLevel.levels.System,
      Validation: debugLevel.levels.Validation,
      Visualforce: debugLevel.levels.Visualforce,
      Workflow: debugLevel.levels.Workflow,
      NBA: debugLevel.levels.NBA,
      Wave: debugLevel.levels.Wave,
    }
  );

  if (!createResponse.success || !createResponse.data) {
    return err({
      code: 'CREATE_FAILED',
      message: `Failed to create debug level: ${createResponse.error?.message}`,
    });
  }

  return ok(createResponse.data.id);
}

/**
 * Gets a debug level by ID
 */
export async function getDebugLevel(
  connection: SalesforceConnection,
  debugLevelId: string
): Promise<DebugLevel | null> {
  const query = `SELECT Id, DeveloperName, MasterLabel, ApexCode, ApexProfiling, Callout, Database, System, Validation, Visualforce, Workflow, NBA, Wave FROM DebugLevel WHERE Id = '${debugLevelId}' LIMIT 1`;
  
  const result = await toolingQuery<DebugLevelRecord>(connection, query);
  
  if (!result.success || result.data.records.length === 0 || !result.data.records[0]) {
    return null;
  }

  const record = result.data.records[0];
  return {
    id: record.Id,
    developerName: record.DeveloperName,
    masterLabel: record.MasterLabel,
    levels: {
      Apex_code: record.ApexCode,
      Apex_profiling: record.ApexProfiling,
      Callout: record.Callout,
      Database: record.Database,
      System: record.System,
      Validation: record.Validation,
      Visualforce: record.Visualforce,
      Workflow: record.Workflow,
      NBA: record.NBA,
      Wave: record.Wave,
    },
  };
}

/**
 * Lists all debug levels in the org
 */
export async function listDebugLevels(
  connection: SalesforceConnection
): Promise<Result<DebugLevel[], ToolingError>> {
  const query = `SELECT Id, DeveloperName, MasterLabel, ApexCode, ApexProfiling, Callout, Database, System, Validation, Visualforce, Workflow, NBA, Wave FROM DebugLevel ORDER BY MasterLabel`;
  
  const result = await toolingQuery<DebugLevelRecord>(connection, query);
  
  if (!result.success) {
    return err(result.error);
  }

  return ok(result.data.records.map(record => ({
    id: record.Id,
    developerName: record.DeveloperName,
    masterLabel: record.MasterLabel,
    levels: {
      Apex_code: record.ApexCode,
      Apex_profiling: record.ApexProfiling,
      Callout: record.Callout,
      Database: record.Database,
      System: record.System,
      Validation: record.Validation,
      Visualforce: record.Visualforce,
      Workflow: record.Workflow,
      NBA: record.NBA,
      Wave: record.Wave,
    },
  })));
}

// ============================================================================
// Trace Flag Management
// ============================================================================

interface TraceFlagRecord {
  Id: string;
  TracedEntityId: string;
  TracedEntityType: string;
  DebugLevelId: string;
  StartDate: string;
  ExpirationDate: string;
  LogType: string;
}

/**
 * Creates a trace flag
 */
export async function createTraceFlag(
  connection: SalesforceConnection,
  request: CreateTraceFlagRequest
): Promise<TraceFlagResult> {
  // Get or create the debug level
  let debugLevelId: string;
  let debugLevel: DebugLevel;

  if (typeof request.debugLevel === 'string') {
    // Use a preset
    const preset = getPreset(request.debugLevel);
    if (!preset) {
      return {
        success: false,
        error: `Unknown debug level preset: ${request.debugLevel}`,
      };
    }
    debugLevel = { ...preset.debugLevel };
    const debugLevelResult = await getOrCreateDebugLevel(connection, debugLevel);
    if (!debugLevelResult.success) {
      return {
        success: false,
        error: debugLevelResult.error.message,
      };
    }
    debugLevelId = debugLevelResult.data;
  } else {
    // Use custom debug level
    debugLevel = request.debugLevel;
    const debugLevelResult = await getOrCreateDebugLevel(connection, debugLevel);
    if (!debugLevelResult.success) {
      return {
        success: false,
        error: debugLevelResult.error.message,
      };
    }
    debugLevelId = debugLevelResult.data;
  }

  // Calculate expiration time
  const startDate = new Date();
  const expirationDate = new Date(startDate.getTime() + request.durationMinutes * 60 * 1000);

  // Create trace flag
  const createResponse = await toolingRequest<{ id: string }>(
    connection,
    'POST',
    '/sobjects/TraceFlag',
    {
      TracedEntityId: request.targetId,
      TracedEntityType: request.targetType,
      DebugLevelId: debugLevelId,
      StartDate: startDate.toISOString(),
      ExpirationDate: expirationDate.toISOString(),
      LogType: 'DEVELOPER_LOG',
    }
  );

  if (!createResponse.success || !createResponse.data) {
    return {
      success: false,
      error: createResponse.error?.message || 'Failed to create trace flag',
    };
  }

  const traceFlag: TraceFlag = {
    id: createResponse.data.id,
    tracedEntityId: request.targetId,
    tracedEntityType: request.targetType,
    debugLevelId,
    startDate,
    expirationDate,
    logType: 'DEVELOPER_LOG',
  };

  return {
    success: true,
    traceFlag,
    debugLevel: { ...debugLevel, id: debugLevelId },
  };
}

/**
 * Gets an existing trace flag by ID
 */
export async function getTraceFlag(
  connection: SalesforceConnection,
  traceFlagId: string
): Promise<TraceFlag | null> {
  const query = `SELECT Id, TracedEntityId, TracedEntityType, DebugLevelId, StartDate, ExpirationDate, LogType FROM TraceFlag WHERE Id = '${traceFlagId}' LIMIT 1`;
  
  const result = await toolingQuery<TraceFlagRecord>(connection, query);
  
  if (!result.success || result.data.records.length === 0 || !result.data.records[0]) {
    return null;
  }

  const record = result.data.records[0];
  return {
    id: record.Id,
    tracedEntityId: record.TracedEntityId,
    tracedEntityType: record.TracedEntityType as TraceFlagTargetType,
    debugLevelId: record.DebugLevelId,
    startDate: new Date(record.StartDate),
    expirationDate: new Date(record.ExpirationDate),
    logType: record.LogType as 'DEVELOPER_LOG' | 'USER_DEBUG',
  };
}

/**
 * Lists trace flags for a user
 */
export async function listTraceFlagsForUser(
  connection: SalesforceConnection,
  userId: string
): Promise<TraceFlag[]> {
  const query = `SELECT Id, TracedEntityId, TracedEntityType, DebugLevelId, StartDate, ExpirationDate, LogType FROM TraceFlag WHERE TracedEntityId = '${userId}' ORDER BY ExpirationDate DESC`;
  
  const result = await toolingQuery<TraceFlagRecord>(connection, query);
  
  if (!result.success) {
    return [];
  }

  return result.data.records.filter(r => r !== undefined).map(record => ({
    id: record.Id,
    tracedEntityId: record.TracedEntityId,
    tracedEntityType: record.TracedEntityType as TraceFlagTargetType,
    debugLevelId: record.DebugLevelId,
    startDate: new Date(record.StartDate),
    expirationDate: new Date(record.ExpirationDate),
    logType: record.LogType as 'DEVELOPER_LOG' | 'USER_DEBUG',
  }));
}

/**
 * Lists all active trace flags
 */
export async function listActiveTraceFlags(
  connection: SalesforceConnection
): Promise<TraceFlag[]> {
  const now = new Date().toISOString();
  const query = `SELECT Id, TracedEntityId, TracedEntityType, DebugLevelId, StartDate, ExpirationDate, LogType FROM TraceFlag WHERE ExpirationDate > ${now} ORDER BY ExpirationDate DESC`;
  
  const result = await toolingQuery<TraceFlagRecord>(connection, query);
  
  if (!result.success) {
    return [];
  }

  return result.data.records.map(record => ({
    id: record.Id,
    tracedEntityId: record.TracedEntityId,
    tracedEntityType: record.TracedEntityType as TraceFlagTargetType,
    debugLevelId: record.DebugLevelId,
    startDate: new Date(record.StartDate),
    expirationDate: new Date(record.ExpirationDate),
    logType: record.LogType as 'DEVELOPER_LOG' | 'USER_DEBUG',
  }));
}

/**
 * Extends a trace flag's expiration time
 */
export async function extendTraceFlag(
  connection: SalesforceConnection,
  traceFlagId: string,
  additionalMinutes: number
): Promise<TraceFlagResult> {
  // Get current trace flag
  const traceFlag = await getTraceFlag(connection, traceFlagId);
  if (!traceFlag) {
    return {
      success: false,
      error: 'Trace flag not found',
    };
  }

  // Calculate new expiration
  const newExpiration = new Date(
    Math.max(Date.now(), traceFlag.expirationDate.getTime()) + additionalMinutes * 60 * 1000
  );

  // Salesforce has a max trace flag duration of 24 hours
  const maxExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (newExpiration > maxExpiration) {
    return {
      success: false,
      error: 'Cannot extend trace flag beyond 24 hours from now',
    };
  }

  // Update trace flag
  const updateResponse = await toolingRequest(
    connection,
    'PATCH',
    `/sobjects/TraceFlag/${traceFlagId}`,
    {
      ExpirationDate: newExpiration.toISOString(),
    }
  );

  if (!updateResponse.success) {
    return {
      success: false,
      error: updateResponse.error?.message || 'Failed to extend trace flag',
    };
  }

  return {
    success: true,
    traceFlag: {
      ...traceFlag,
      expirationDate: newExpiration,
    },
  };
}

/**
 * Deletes a trace flag
 */
export async function deleteTraceFlag(
  connection: SalesforceConnection,
  traceFlagId: string
): Promise<boolean> {
  const response = await toolingRequest(
    connection,
    'DELETE',
    `/sobjects/TraceFlag/${traceFlagId}`
  );
  return response.success;
}

/**
 * Deletes all trace flags for a user
 */
export async function deleteUserTraceFlags(
  connection: SalesforceConnection,
  userId: string
): Promise<number> {
  const traceFlags = await listTraceFlagsForUser(connection, userId);
  let deleted = 0;

  for (const tf of traceFlags) {
    if (await deleteTraceFlag(connection, tf.id!)) {
      deleted++;
    }
  }

  return deleted;
}

// ============================================================================
// Trace Flag Manager Class
// ============================================================================

/**
 * Manages trace flags for a connection
 */
export class TraceFlagManager {
  private connection: SalesforceConnection;
  private activeTraceFlags: Map<string, TraceFlag> = new Map();

  constructor(connection: SalesforceConnection) {
    this.connection = connection;
  }

  /**
   * Sets up tracing for the current user
   */
  async setupUserTracing(options: {
    preset?: string;
    durationMinutes?: number;
  } = {}): Promise<TraceFlagResult> {
    const {
      preset = 'ai_optimized',
      durationMinutes = 60,
    } = options;

    return this.createTraceFlagFor({
      targetType: 'USER',
      targetId: this.connection.userId,
      debugLevel: preset,
      durationMinutes,
    });
  }

  /**
   * Creates a trace flag
   */
  async createTraceFlagFor(request: CreateTraceFlagRequest): Promise<TraceFlagResult> {
    const result = await createTraceFlag(this.connection, request);
    
    if (result.success && result.traceFlag) {
      this.activeTraceFlags.set(result.traceFlag.id!, result.traceFlag);
    }

    return result;
  }

  /**
   * Gets active trace flags for the current user
   */
  async getActiveTraceFlagsForCurrentUser(): Promise<TraceFlag[]> {
    const flags = await listTraceFlagsForUser(this.connection, this.connection.userId);
    
    // Filter to only active ones
    const now = Date.now();
    return flags.filter(f => f.expirationDate.getTime() > now);
  }

  /**
   * Ensures there's an active trace flag for the current user
   */
  async ensureActiveTraceFlag(options: {
    preset?: string;
    minRemainingMinutes?: number;
    extensionMinutes?: number;
  } = {}): Promise<TraceFlagResult> {
    const {
      preset = 'ai_optimized',
      minRemainingMinutes = 10,
      extensionMinutes = 60,
    } = options;

    const activeFlags = await this.getActiveTraceFlagsForCurrentUser();
    
    if (activeFlags.length === 0) {
      // No active trace flag, create one
      return this.setupUserTracing({ preset, durationMinutes: extensionMinutes });
    }

    // Check if any trace flag needs extending
    const now = Date.now();
    const minRemaining = minRemainingMinutes * 60 * 1000;

    for (const flag of activeFlags) {
      if (flag.expirationDate.getTime() - now < minRemaining) {
        // Extend this flag
        return extendTraceFlag(this.connection, flag.id!, extensionMinutes);
      }
    }

    // There's an active trace flag with enough time remaining
    return {
      success: true,
      traceFlag: activeFlags[0],
    };
  }

  /**
   * Cleans up all trace flags created by this manager
   */
  async cleanup(): Promise<void> {
    for (const [id] of this.activeTraceFlags) {
      await deleteTraceFlag(this.connection, id);
    }
    this.activeTraceFlags.clear();
  }

  /**
   * Gets the remaining time for the current trace flag
   */
  async getRemainingTime(): Promise<number | null> {
    const flags = await this.getActiveTraceFlagsForCurrentUser();
    
    if (flags.length === 0) {
      return null;
    }

    const now = Date.now();
    const maxExpiration = Math.max(...flags.map(f => f.expirationDate.getTime()));
    
    return Math.max(0, maxExpiration - now);
  }

  /**
   * Formats the remaining time for display
   */
  async getFormattedRemainingTime(): Promise<string> {
    const remaining = await this.getRemainingTime();
    
    if (remaining === null || remaining === 0) {
      return 'No active trace flag';
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${minutes % 60}m remaining`;
    }

    return `${minutes}m ${seconds}s remaining`;
  }
}

// ============================================================================
// Automated Process User Support (for async job tracing)
// @see Architecture/AI_SALESFORCE_DEBUG_ARCHITECTURE_V2.md Section 5.1
// ============================================================================

/**
 * Well-known Salesforce system user names for async execution contexts
 */
export const SYSTEM_USERS = {
  /** Automated Process user - runs Queueable, Future, Batch async jobs */
  AUTOMATED_PROCESS: 'Automated Process',
  /** Platform Integration user - for Platform Events */
  PLATFORM_INTEGRATION: 'Platform Integration',
} as const;

/**
 * Query result for system user lookup
 */
interface SystemUserRecord {
  Id: string;
  Name: string;
  IsActive: boolean;
}

/**
 * Finds the Automated Process user ID in the org
 * This user executes async jobs (Queueable, Future, Batch) when not running as a specific user
 * 
 * @param connection - Active Salesforce connection
 * @returns User ID if found, null if not found
 */
export async function findAutomatedProcessUser(
  connection: SalesforceConnection
): Promise<string | null> {
  return findSystemUser(connection, SYSTEM_USERS.AUTOMATED_PROCESS);
}

/**
 * Finds a system user by name
 * 
 * @param connection - Active Salesforce connection
 * @param userName - System user name to find
 * @returns User ID if found, null if not found
 */
export async function findSystemUser(
  connection: SalesforceConnection,
  userName: string
): Promise<string | null> {
  const escapedName = userName.replace(/'/g, "\\'");
  const query = `SELECT Id, Name, IsActive FROM User WHERE Name = '${escapedName}' AND IsActive = true LIMIT 1`;
  
  const result = await toolingQuery<SystemUserRecord>(connection, query);
  
  if (!result.success) {
    return null;
  }
  
  const firstRecord = result.data.records[0];
  return firstRecord ? firstRecord.Id : null;
}

/**
 * Result of creating trace flags for async capture
 */
export interface AsyncTraceFlagResult {
  /** User's trace flag result */
  userTraceFlag: TraceFlagResult;
  /** Automated Process trace flag result (if applicable) */
  automatedProcessTraceFlag?: TraceFlagResult;
  /** Warnings about trace flag coverage */
  warnings: string[];
}

/**
 * Creates trace flags for capturing async job logs
 * 
 * Sets trace flags on both the current user AND the Automated Process user
 * to capture logs from async jobs (Queueable, Future, Batch) that may execute
 * in a different user context.
 * 
 * @see Architecture/AI_SALESFORCE_DEBUG_ARCHITECTURE_V2.md Section 5.1
 * 
 * @param connection - Active Salesforce connection
 * @param request - Trace flag configuration
 * @param includeAutomatedProcess - Whether to also set trace flag on Automated Process user (default: true)
 * @returns Results for both trace flags with warnings
 */
export async function createAsyncTraceFlags(
  connection: SalesforceConnection,
  request: CreateTraceFlagRequest,
  includeAutomatedProcess = true
): Promise<AsyncTraceFlagResult> {
  const warnings: string[] = [];
  
  // Create trace flag for the requested user
  const userTraceFlag = await createTraceFlag(connection, request);
  
  if (!userTraceFlag.success) {
    return {
      userTraceFlag,
      warnings: ['Failed to create user trace flag'],
    };
  }
  
  // If not including Automated Process, return early with warning
  if (!includeAutomatedProcess) {
    warnings.push(
      'Trace flag only set for current user. Async jobs running as "Automated Process" will NOT be captured. ' +
      'Consider enabling Automated Process tracing for complete async coverage.'
    );
    return { userTraceFlag, warnings };
  }
  
  // Find Automated Process user
  const automatedProcessId = await findAutomatedProcessUser(connection);
  
  if (!automatedProcessId) {
    warnings.push(
      'Could not find "Automated Process" user. Async jobs may run in a different context and logs may not be captured. ' +
      'This is normal for some org configurations.'
    );
    return { userTraceFlag, warnings };
  }
  
  // Create trace flag for Automated Process
  const automatedProcessTraceFlag = await createTraceFlag(connection, {
    ...request,
    targetId: automatedProcessId,
    targetType: 'USER',
  });
  
  if (!automatedProcessTraceFlag.success) {
    warnings.push(
      `Failed to create trace flag for Automated Process user: ${automatedProcessTraceFlag.error}. ` +
      'Async job logs may not be captured.'
    );
  } else {
    // Success case - still add informational note
    warnings.push(
      'Trace flags set for both user and Automated Process. Async jobs running as "Automated Process" will now be captured.'
    );
  }
  
  return {
    userTraceFlag,
    automatedProcessTraceFlag,
    warnings,
  };
}

/**
 * Checks if trace flags are set for comprehensive async coverage
 * 
 * @param connection - Active Salesforce connection
 * @param userId - User ID to check
 * @returns Analysis of trace flag coverage with recommendations
 */
export async function analyzeAsyncTraceCoverage(
  connection: SalesforceConnection,
  userId: string
): Promise<{
  hasUserTraceFlag: boolean;
  hasAutomatedProcessTraceFlag: boolean;
  coverage: 'full' | 'partial' | 'none';
  recommendations: string[];
}> {
  const recommendations: string[] = [];
  
  // Check user's trace flag
  const userFlags = await getActiveTraceFlagsForUser(connection, userId);
  const hasUserTraceFlag = userFlags.length > 0;
  
  // Check Automated Process trace flag
  const automatedProcessId = await findAutomatedProcessUser(connection);
  let hasAutomatedProcessTraceFlag = false;
  
  if (automatedProcessId) {
    const automatedProcessFlags = await getActiveTraceFlagsForUser(connection, automatedProcessId);
    hasAutomatedProcessTraceFlag = automatedProcessFlags.length > 0;
  }
  
  // Determine coverage level
  let coverage: 'full' | 'partial' | 'none';
  if (hasUserTraceFlag && hasAutomatedProcessTraceFlag) {
    coverage = 'full';
  } else if (hasUserTraceFlag || hasAutomatedProcessTraceFlag) {
    coverage = 'partial';
  } else {
    coverage = 'none';
  }
  
  // Generate recommendations
  if (!hasUserTraceFlag) {
    recommendations.push('No trace flag on user - synchronous execution will not be logged.');
  }
  
  if (!hasAutomatedProcessTraceFlag) {
    recommendations.push(
      'No trace flag on "Automated Process" user - async jobs (Queueable, Future, Batch) may not be logged.'
    );
  }
  
  if (coverage === 'full') {
    recommendations.push('Full async coverage enabled. Both sync and async job logs will be captured.');
  }
  
  return {
    hasUserTraceFlag,
    hasAutomatedProcessTraceFlag,
    coverage,
    recommendations,
  };
}

/**
 * Gets active trace flags for a specific user
 */
export async function getActiveTraceFlagsForUser(
  connection: SalesforceConnection,
  userId: string
): Promise<TraceFlag[]> {
  const escapedId = userId.replace(/'/g, "\\'");
  const query = `
    SELECT Id, TracedEntityId, TracedEntityType, DebugLevelId, 
           StartDate, ExpirationDate, LogType
    FROM TraceFlag 
    WHERE TracedEntityId = '${escapedId}'
      AND ExpirationDate > ${new Date().toISOString()}
  `;
  
  const result = await toolingQuery<{
    Id: string;
    TracedEntityId: string;
    TracedEntityType: string;
    DebugLevelId: string;
    StartDate: string;
    ExpirationDate: string;
    LogType: string;
  }>(connection, query);
  
  if (!result.success) {
    return [];
  }

  return result.data.records.map(record => ({
    id: record.Id,
    tracedEntityId: record.TracedEntityId,
    tracedEntityType: record.TracedEntityType as TraceFlagTargetType,
    debugLevelId: record.DebugLevelId,
    startDate: new Date(record.StartDate),
    expirationDate: new Date(record.ExpirationDate),
    logType: record.LogType as 'DEVELOPER_LOG' | 'USER_DEBUG',
  }));
}
