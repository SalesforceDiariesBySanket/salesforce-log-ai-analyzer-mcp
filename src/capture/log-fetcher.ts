/**
 * @module capture/log-fetcher
 * @description Fetches debug log content from Salesforce
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts
 * @lastModified 2026-01-31
 */

import type {
  SalesforceConnection,
  ApexLogRecord,
  FetchedLog,
  LogFetchResult,
  LogListFilter,
  QueryResult,
} from '../types/capture';

// ============================================================================
// Constants
// ============================================================================

/** Maximum log size to fetch (20 MB) */
const MAX_LOG_SIZE = 20 * 1024 * 1024;

/** Default number of logs to list */
const DEFAULT_LOG_LIMIT = 25;

// ============================================================================
// Log Listing
// ============================================================================

interface ApexLogQueryRecord {
  Id: string;
  StartTime: string;
  Request: string;
  Operation: string;
  Application: string;
  Status: string;
  LogLength: number;
  LogUser: {
    Id: string;
    Name: string;
    Username: string;
  };
  DurationMilliseconds: number;
  Location?: string;
}

/**
 * Builds a SOQL query for ApexLog
 */
function buildLogQuery(filter: LogListFilter): string {
  const fields = [
    'Id',
    'StartTime',
    'Request',
    'Operation',
    'Application',
    'Status',
    'LogLength',
    'LogUser.Id',
    'LogUser.Name',
    'LogUser.Username',
    'DurationMilliseconds',
    'Location',
  ];

  const conditions: string[] = [];

  if (filter.userId) {
    conditions.push(`LogUserId = '${filter.userId}'`);
  }

  if (filter.request) {
    conditions.push(`Request = '${filter.request}'`);
  }

  if (filter.operation) {
    conditions.push(`Operation LIKE '%${filter.operation}%'`);
  }

  if (filter.status) {
    conditions.push(`Status = '${filter.status}'`);
  }

  if (filter.startTimeAfter) {
    conditions.push(`StartTime > ${filter.startTimeAfter.toISOString()}`);
  }

  if (filter.startTimeBefore) {
    conditions.push(`StartTime < ${filter.startTimeBefore.toISOString()}`);
  }

  if (filter.minSize) {
    conditions.push(`LogLength >= ${filter.minSize}`);
  }

  if (filter.maxSize) {
    conditions.push(`LogLength <= ${filter.maxSize}`);
  }

  let query = `SELECT ${fields.join(', ')} FROM ApexLog`;

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  // Order by
  const orderBy = filter.orderBy || 'StartTime';
  const orderDir = filter.orderDirection || 'DESC';
  query += ` ORDER BY ${orderBy} ${orderDir}`;

  // Limit
  const limit = filter.limit || DEFAULT_LOG_LIMIT;
  query += ` LIMIT ${limit}`;

  return query;
}

/**
 * Lists debug logs from Salesforce
 */
export async function listLogs(
  connection: SalesforceConnection,
  filter: LogListFilter = {}
): Promise<ApexLogRecord[]> {
  const query = buildLogQuery(filter);

  const response = await fetch(
    `${connection.instanceUrl}/services/data/${connection.apiVersion}/query?q=${encodeURIComponent(query)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `${connection.tokens.tokenType} ${connection.tokens.accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list logs: ${response.statusText}`);
  }

  const data = await response.json() as QueryResult<ApexLogQueryRecord>;

  return data.records.map(record => ({
    Id: record.Id,
    StartTime: record.StartTime,
    Request: record.Request,
    Operation: record.Operation,
    Application: record.Application,
    Status: record.Status,
    LogLength: record.LogLength,
    LogUser: record.LogUser,
    DurationMilliseconds: record.DurationMilliseconds,
    Location: record.Location,
  }));
}

/**
 * Lists recent logs for the current user
 */
export async function listRecentLogs(
  connection: SalesforceConnection,
  limit: number = 10
): Promise<ApexLogRecord[]> {
  return listLogs(connection, {
    userId: connection.userId,
    limit,
    orderBy: 'StartTime',
    orderDirection: 'DESC',
  });
}

/**
 * Gets a single log record by ID
 */
export async function getLogRecord(
  connection: SalesforceConnection,
  logId: string
): Promise<ApexLogRecord | null> {
  const query = `SELECT Id, StartTime, Request, Operation, Application, Status, LogLength, LogUser.Id, LogUser.Name, LogUser.Username, DurationMilliseconds, Location FROM ApexLog WHERE Id = '${logId}' LIMIT 1`;

  const response = await fetch(
    `${connection.instanceUrl}/services/data/${connection.apiVersion}/query?q=${encodeURIComponent(query)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `${connection.tokens.tokenType} ${connection.tokens.accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as QueryResult<ApexLogQueryRecord>;

  if (data.records.length === 0) {
    return null;
  }

  const record = data.records[0]!;
  return {
    Id: record.Id,
    StartTime: record.StartTime,
    Request: record.Request,
    Operation: record.Operation,
    Application: record.Application,
    Status: record.Status,
    LogLength: record.LogLength,
    LogUser: record.LogUser,
    DurationMilliseconds: record.DurationMilliseconds,
    Location: record.Location,
  };
}

// ============================================================================
// Log Content Fetching
// ============================================================================

/**
 * Fetches the raw content of a debug log
 */
export async function fetchLogContent(
  connection: SalesforceConnection,
  logId: string
): Promise<string> {
  // Use the sobjects endpoint to get the Body field
  const url = `${connection.instanceUrl}/services/data/${connection.apiVersion}/sobjects/ApexLog/${logId}/Body`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `${connection.tokens.tokenType} ${connection.tokens.accessToken}`,
      'Accept': 'text/plain',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch log content: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Fetches a log with metadata and content
 */
export async function fetchLog(
  connection: SalesforceConnection,
  logId: string
): Promise<LogFetchResult> {
  try {
    // Get log metadata first
    const record = await getLogRecord(connection, logId);
    
    if (!record) {
      return {
        success: false,
        error: `Log not found: ${logId}`,
      };
    }

    // Check size
    if (record.LogLength > MAX_LOG_SIZE) {
      return {
        success: false,
        error: `Log too large (${Math.round(record.LogLength / 1024 / 1024)}MB). Maximum supported size is ${MAX_LOG_SIZE / 1024 / 1024}MB.`,
      };
    }

    // Fetch content
    const content = await fetchLogContent(connection, logId);

    // Check if truncated (content smaller than reported size)
    const truncated = content.length < record.LogLength * 0.9; // Allow 10% variance

    const fetchedLog: FetchedLog = {
      record,
      content,
      fetchedAt: new Date(),
      truncated,
    };

    return {
      success: true,
      log: fetchedLog,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Fetches multiple logs
 */
export async function fetchLogs(
  connection: SalesforceConnection,
  logIds: string[]
): Promise<Map<string, LogFetchResult>> {
  const results = new Map<string, LogFetchResult>();

  // Fetch in parallel but with concurrency limit
  const concurrency = 5;
  
  for (let i = 0; i < logIds.length; i += concurrency) {
    const batch = logIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(id => fetchLog(connection, id))
    );

    for (let j = 0; j < batch.length; j++) {
      results.set(batch[j]!, batchResults[j]!);
    }
  }

  return results;
}

/**
 * Fetches the most recent log
 */
export async function fetchMostRecentLog(
  connection: SalesforceConnection,
  filter?: Partial<LogListFilter>
): Promise<LogFetchResult> {
  const logs = await listLogs(connection, {
    ...filter,
    userId: filter?.userId ?? connection.userId,
    limit: 1,
    orderBy: 'StartTime',
    orderDirection: 'DESC',
  });

  if (logs.length === 0) {
    return {
      success: false,
      error: 'No logs found',
    };
  }

  return fetchLog(connection, logs[0]!.Id);
}

// ============================================================================
// Log Deletion
// ============================================================================

/**
 * Deletes a debug log
 */
export async function deleteLog(
  connection: SalesforceConnection,
  logId: string
): Promise<boolean> {
  const url = `${connection.instanceUrl}/services/data/${connection.apiVersion}/sobjects/ApexLog/${logId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `${connection.tokens.tokenType} ${connection.tokens.accessToken}`,
    },
  });

  return response.ok;
}

/**
 * Deletes multiple logs
 */
export async function deleteLogs(
  connection: SalesforceConnection,
  logIds: string[]
): Promise<number> {
  let deleted = 0;

  // Delete in parallel with concurrency limit
  const concurrency = 10;
  
  for (let i = 0; i < logIds.length; i += concurrency) {
    const batch = logIds.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(id => deleteLog(connection, id))
    );

    deleted += results.filter(Boolean).length;
  }

  return deleted;
}

/**
 * Deletes all logs for the current user
 */
export async function deleteAllUserLogs(
  connection: SalesforceConnection
): Promise<number> {
  const logs = await listLogs(connection, {
    userId: connection.userId,
    limit: 200, // Maximum
  });

  if (logs.length === 0) {
    return 0;
  }

  return deleteLogs(connection, logs.map(l => l.Id));
}

// ============================================================================
// Log Fetcher Class
// ============================================================================

/**
 * Log fetcher with caching and convenience methods
 */
export class LogFetcher {
  private connection: SalesforceConnection;
  private cache: Map<string, FetchedLog> = new Map();
  private maxCacheSize: number;

  constructor(connection: SalesforceConnection, options: { maxCacheSize?: number } = {}) {
    this.connection = connection;
    this.maxCacheSize = options.maxCacheSize || 10;
  }

  /**
   * Lists recent logs
   */
  async listRecent(limit: number = 10): Promise<ApexLogRecord[]> {
    return listRecentLogs(this.connection, limit);
  }

  /**
   * Lists logs with filter
   */
  async list(filter: LogListFilter = {}): Promise<ApexLogRecord[]> {
    return listLogs(this.connection, filter);
  }

  /**
   * Fetches a log (uses cache if available)
   */
  async fetch(logId: string, skipCache: boolean = false): Promise<LogFetchResult> {
    // Check cache
    if (!skipCache && this.cache.has(logId)) {
      return {
        success: true,
        log: this.cache.get(logId)!,
      };
    }

    const result = await fetchLog(this.connection, logId);

    // Cache successful fetches
    if (result.success && result.log) {
      this.addToCache(logId, result.log);
    }

    return result;
  }

  /**
   * Fetches the most recent log
   */
  async fetchMostRecent(): Promise<LogFetchResult> {
    const result = await fetchMostRecentLog(this.connection);
    
    if (result.success && result.log) {
      this.addToCache(result.log.record.Id, result.log);
    }

    return result;
  }

  /**
   * Fetches multiple logs
   */
  async fetchMultiple(logIds: string[]): Promise<Map<string, LogFetchResult>> {
    const results = new Map<string, LogFetchResult>();
    const toFetch: string[] = [];

    // Check cache first
    for (const id of logIds) {
      if (this.cache.has(id)) {
        results.set(id, { success: true, log: this.cache.get(id)! });
      } else {
        toFetch.push(id);
      }
    }

    // Fetch uncached logs
    if (toFetch.length > 0) {
      const fetchResults = await fetchLogs(this.connection, toFetch);
      
      for (const [id, result] of fetchResults) {
        results.set(id, result);
        if (result.success && result.log) {
          this.addToCache(id, result.log);
        }
      }
    }

    return results;
  }

  /**
   * Deletes a log
   */
  async delete(logId: string): Promise<boolean> {
    const success = await deleteLog(this.connection, logId);
    if (success) {
      this.cache.delete(logId);
    }
    return success;
  }

  /**
   * Clears all logs for the current user
   */
  async clearAll(): Promise<number> {
    const count = await deleteAllUserLogs(this.connection);
    this.cache.clear();
    return count;
  }

  /**
   * Gets a cached log
   */
  getCached(logId: string): FetchedLog | undefined {
    return this.cache.get(logId);
  }

  /**
   * Clears the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Adds a log to the cache, evicting old entries if needed
   */
  private addToCache(logId: string, log: FetchedLog): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(logId, log);
  }
}
