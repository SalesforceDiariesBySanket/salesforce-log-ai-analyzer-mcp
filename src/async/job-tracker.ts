/**
 * @module async/job-tracker
 * @description Query AsyncApexJob table to track async job status
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/types/async.ts, src/types/capture.ts
 * @lastModified 2026-01-31
 */

import type { SalesforceConnection } from '../types/capture';
import type {
  AsyncJobRef,
  AsyncApexJobRecord,
  AsyncJobStatus,
  JobTrackingResult,
} from '../types/async';

// ============================================================================
// Constants
// ============================================================================

/**
 * Fields to query from AsyncApexJob
 */
const ASYNC_JOB_FIELDS = [
  'Id',
  'ApexClassId',
  'ApexClass.Name',
  'JobType',
  'Status',
  'JobItemsProcessed',
  'TotalJobItems',
  'NumberOfErrors',
  'CreatedDate',
  'CompletedDate',
  'ExtendedStatus',
  'ParentJobId',
  'MethodName',
  'LastProcessedOffset',
].join(', ');

/**
 * Default query timeout (ms)
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum jobs to query at once
 */
const MAX_BATCH_SIZE = 50;

// ============================================================================
// Job Tracker Class
// ============================================================================

/**
 * Tracks async job status by querying Salesforce
 *
 * @example
 * ```typescript
 * const tracker = new JobTracker(connection);
 * const result = await tracker.trackJobs(jobRefs);
 * for (const job of result.jobs) {
 *   console.log(`${job.ApexClassName}: ${job.Status}`);
 * }
 * ```
 */
export class JobTracker {
  private connection: SalesforceConnection;
  private timeout: number;

  constructor(connection: SalesforceConnection, timeout: number = DEFAULT_TIMEOUT_MS) {
    this.connection = connection;
    this.timeout = timeout;
  }

  /**
   * Track jobs by their extracted references
   */
  async trackJobs(jobRefs: AsyncJobRef[]): Promise<JobTrackingResult> {
    if (jobRefs.length === 0) {
      return {
        success: true,
        jobs: [],
        notFound: [],
      };
    }

    try {
      // Separate jobs with IDs from those needing lookup
      const withIds = jobRefs.filter(j => j.jobId);
      const withoutIds = jobRefs.filter(j => !j.jobId);

      const results: AsyncApexJobRecord[] = [];
      const notFound: string[] = [];

      // Query jobs with known IDs
      if (withIds.length > 0) {
        const idResult = await this.queryByIds(withIds.map(j => j.jobId!));
        results.push(...idResult.found);
        notFound.push(...idResult.notFound);
      }

      // Try to find jobs without IDs by class name and timing
      if (withoutIds.length > 0) {
        const inferredResult = await this.queryByInference(withoutIds);
        results.push(...inferredResult);
      }

      return {
        success: true,
        jobs: results,
        notFound,
      };
    } catch (error) {
      return {
        success: false,
        jobs: [],
        notFound: jobRefs.map(j => j.jobId || j.className),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Query a single job by ID
   */
  async trackJobById(jobId: string): Promise<AsyncApexJobRecord | null> {
    const result = await this.queryByIds([jobId]);
    return result.found[0] || null;
  }

  /**
   * Query jobs by class name
   */
  async trackJobsByClassName(
    className: string,
    options: ClassNameQueryOptions = {}
  ): Promise<AsyncApexJobRecord[]> {
    const conditions: string[] = [`ApexClass.Name = '${this.escapeSOQL(className)}'`];

    if (options.jobType) {
      // Validate against allowed job types to prevent injection
      const allowedJobTypes = ['Future', 'Queueable', 'BatchApex', 'ScheduledApex'];
      if (allowedJobTypes.includes(options.jobType)) {
        conditions.push(`JobType = '${options.jobType}'`);
      }
    }

    if (options.status) {
      // Escape status to prevent injection
      conditions.push(`Status = '${this.escapeSOQL(options.status)}'`);
    }

    if (options.createdAfter) {
      conditions.push(`CreatedDate > ${options.createdAfter.toISOString()}`);
    }

    if (options.createdBefore) {
      conditions.push(`CreatedDate < ${options.createdBefore.toISOString()}`);
    }

    const limit = Math.min(Math.max(1, options.limit || 10), 200); // Bound limit
    const query = `
      SELECT ${ASYNC_JOB_FIELDS}
      FROM AsyncApexJob
      WHERE ${conditions.join(' AND ')}
      ORDER BY CreatedDate DESC
      LIMIT ${limit}
    `;

    const result = await this.executeQuery<AsyncApexJobQueryRecord>(query);
    return result.records.map(this.mapQueryRecord);
  }

  /**
   * Get recent async jobs for the current user
   */
  async getRecentJobs(options: RecentJobsOptions = {}): Promise<AsyncApexJobRecord[]> {
    const conditions: string[] = [];

    if (options.userId) {
      // Validate Salesforce ID format (15 or 18 alphanumeric chars starting with 005)
      if (/^005[a-zA-Z0-9]{12,15}$/.test(options.userId)) {
        conditions.push(`CreatedById = '${options.userId}'`);
      }
    }

    if (options.jobTypes && options.jobTypes.length > 0) {
      // Validate and escape job types
      const allowedJobTypes = ['Future', 'Queueable', 'BatchApex', 'ScheduledApex', 'SharingRecalculation'];
      const validTypes = options.jobTypes.filter(t => allowedJobTypes.includes(t));
      if (validTypes.length > 0) {
        const types = validTypes.map(t => `'${t}'`).join(', ');
        conditions.push(`JobType IN (${types})`);
      }
    }

    if (options.statuses && options.statuses.length > 0) {
      // Escape each status value
      const statuses = options.statuses.map(s => `'${this.escapeSOQL(s)}'`).join(', ');
      conditions.push(`Status IN (${statuses})`);
    }

    if (options.since) {
      conditions.push(`CreatedDate > ${options.since.toISOString()}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(1, options.limit || 25), 200); // Bound limit

    const query = `
      SELECT ${ASYNC_JOB_FIELDS}
      FROM AsyncApexJob
      ${whereClause}
      ORDER BY CreatedDate DESC
      LIMIT ${limit}
    `;

    const result = await this.executeQuery<AsyncApexJobQueryRecord>(query);
    return result.records.map(this.mapQueryRecord);
  }

  /**
   * Wait for a job to complete (polling)
   */
  async waitForCompletion(
    jobId: string,
    options: WaitOptions = {}
  ): Promise<AsyncApexJobRecord | null> {
    const maxWait = options.maxWaitMs || 60000;
    const pollInterval = options.pollIntervalMs || 2000;
    const terminalStatuses: AsyncJobStatus[] = ['COMPLETED', 'FAILED', 'ABORTED'];

    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const job = await this.trackJobById(jobId);

      if (!job) {
        return null;
      }

      if (terminalStatuses.includes(job.Status)) {
        return job;
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Return last known state after timeout
    return this.trackJobById(jobId);
  }

  // ============================================================================
  // Private Query Methods
  // ============================================================================

  /**
   * Query jobs by their IDs
   */
  private async queryByIds(ids: string[]): Promise<{ found: AsyncApexJobRecord[]; notFound: string[] }> {
    const found: AsyncApexJobRecord[] = [];
    const notFound: string[] = [];

    // Process in batches
    for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
      const batch = ids.slice(i, i + MAX_BATCH_SIZE);
      const idList = batch.map(id => `'${id}'`).join(', ');

      const query = `
        SELECT ${ASYNC_JOB_FIELDS}
        FROM AsyncApexJob
        WHERE Id IN (${idList})
      `;

      const result = await this.executeQuery<AsyncApexJobQueryRecord>(query);
      const foundIds = new Set(result.records.map(r => r.Id));

      for (const record of result.records) {
        found.push(this.mapQueryRecord(record));
      }

      for (const id of batch) {
        if (!foundIds.has(id)) {
          notFound.push(id);
        }
      }
    }

    return { found, notFound };
  }

  /**
   * Query jobs by inference (class name, timing, type)
   */
  private async queryByInference(jobRefs: AsyncJobRef[]): Promise<AsyncApexJobRecord[]> {
    const results: AsyncApexJobRecord[] = [];
    const seenIds = new Set<string>();

    for (const ref of jobRefs) {
      if (ref.className === 'Unknown') {
        continue;
      }

      // Calculate time window (enqueuedAt is in nanoseconds)
      const enqueuedTime = new Date(ref.enqueuedAt / 1000000);
      const windowStart = new Date(enqueuedTime.getTime() - 5000); // 5 seconds before
      const windowEnd = new Date(enqueuedTime.getTime() + 60000); // 60 seconds after

      const jobType = this.mapToSalesforceJobType(ref.jobType);

      const query = `
        SELECT ${ASYNC_JOB_FIELDS}
        FROM AsyncApexJob
        WHERE ApexClass.Name = '${this.escapeSOQL(ref.className)}'
          AND JobType = '${jobType}'
          AND CreatedDate >= ${windowStart.toISOString()}
          AND CreatedDate <= ${windowEnd.toISOString()}
        ORDER BY CreatedDate ASC
        LIMIT 5
      `;

      try {
        const result = await this.executeQuery<AsyncApexJobQueryRecord>(query);

        for (const record of result.records) {
          if (!seenIds.has(record.Id)) {
            seenIds.add(record.Id);
            results.push(this.mapQueryRecord(record));
          }
        }
      } catch {
        // Continue with other refs on query failure
      }
    }

    return results;
  }

  /**
   * Execute a SOQL query against the connection
   */
  private async executeQuery<T>(query: string): Promise<{ records: T[] }> {
    // This would use the actual Salesforce API
    // For now, we define the interface and throw if not connected
    if (!this.connection || this.connection.authState !== 'connected') {
      throw new Error('Not connected to Salesforce');
    }

    const url = `${this.connection.instanceUrl}/services/data/v${this.connection.apiVersion}/query?q=${encodeURIComponent(query.trim())}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.connection.tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Query failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { records: T[] };
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Map query record to our type
   */
  private mapQueryRecord(record: AsyncApexJobQueryRecord): AsyncApexJobRecord {
    return {
      Id: record.Id,
      ApexClassId: record.ApexClassId,
      ApexClassName: record.ApexClass?.Name || 'Unknown',
      JobType: record.JobType as AsyncApexJobRecord['JobType'],
      Status: record.Status as AsyncJobStatus,
      JobItemsProcessed: record.JobItemsProcessed,
      TotalJobItems: record.TotalJobItems,
      NumberOfErrors: record.NumberOfErrors,
      CreatedDate: record.CreatedDate,
      CompletedDate: record.CompletedDate,
      ExtendedStatus: record.ExtendedStatus,
      ParentJobId: record.ParentJobId,
      MethodName: record.MethodName,
      LastProcessedOffset: record.LastProcessedOffset,
    };
  }

  /**
   * Map our job type to Salesforce job type
   */
  private mapToSalesforceJobType(jobType: AsyncJobRef['jobType']): string {
    switch (jobType) {
      case 'FUTURE':
        return 'Future';
      case 'QUEUEABLE':
        return 'Queueable';
      case 'BATCH':
        return 'BatchApex';
      case 'SCHEDULABLE':
        return 'ScheduledApex';
      default:
        return 'Queueable';
    }
  }

  /**
   * Escape SOQL special characters
   */
  private escapeSOQL(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');
  }
}

// ============================================================================
// Query Options Types
// ============================================================================

/**
 * Options for querying by class name
 */
export interface ClassNameQueryOptions {
  /** Filter by job type */
  jobType?: 'Future' | 'Queueable' | 'BatchApex' | 'ScheduledApex';
  /** Filter by status */
  status?: AsyncJobStatus;
  /** Filter jobs created after this time */
  createdAfter?: Date;
  /** Filter jobs created before this time */
  createdBefore?: Date;
  /** Maximum results */
  limit?: number;
}

/**
 * Options for getting recent jobs
 */
export interface RecentJobsOptions {
  /** Filter by user ID */
  userId?: string;
  /** Filter by job types */
  jobTypes?: string[];
  /** Filter by statuses */
  statuses?: AsyncJobStatus[];
  /** Filter jobs created since this time */
  since?: Date;
  /** Maximum results */
  limit?: number;
}

/**
 * Options for waiting for job completion
 */
export interface WaitOptions {
  /** Maximum time to wait (ms) */
  maxWaitMs?: number;
  /** Polling interval (ms) */
  pollIntervalMs?: number;
}

/**
 * Raw query record from Salesforce
 */
interface AsyncApexJobQueryRecord {
  Id: string;
  ApexClassId: string;
  ApexClass?: { Name: string };
  JobType: string;
  Status: string;
  JobItemsProcessed?: number;
  TotalJobItems?: number;
  NumberOfErrors?: number;
  CreatedDate: string;
  CompletedDate?: string;
  ExtendedStatus?: string;
  ParentJobId?: string;
  MethodName?: string;
  LastProcessedOffset?: number;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a job tracker for a connection
 */
export function createJobTracker(connection: SalesforceConnection): JobTracker {
  return new JobTracker(connection);
}

/**
 * Check if a job status is terminal (won't change)
 */
export function isTerminalStatus(status: AsyncJobStatus): boolean {
  return ['COMPLETED', 'FAILED', 'ABORTED'].includes(status);
}

/**
 * Check if a job status indicates failure
 */
export function isFailedStatus(status: AsyncJobStatus): boolean {
  return ['FAILED', 'ABORTED'].includes(status);
}
