/**
 * @module async/log-correlator
 * @description Correlate parent logs with async child logs
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/types/async.ts, src/capture/log-fetcher.ts
 * @lastModified 2026-01-31
 */

import type { SalesforceConnection, ApexLogRecord } from '../types/capture';
import type { ParsedLog } from '../types/events';
import type {
  AsyncJobRef,
  AsyncApexJobRecord,
  CorrelationResult,
  CorrelationReason,
  MatchDetail,
  CorrelationOptions,
} from '../types/async';
import { DEFAULT_CORRELATION_OPTIONS } from '../types/async';
import { JobTracker } from './job-tracker';
import { CorrelationScorer } from './confidence-scorer';

// ============================================================================
// Log Correlator Class
// ============================================================================

/**
 * Correlates parent debug logs with their async child logs
 *
 * @example
 * ```typescript
 * const correlator = new LogCorrelator(connection);
 * const results = await correlator.correlate(parentLogId, asyncJobs);
 * for (const result of results) {
 *   console.log(`${result.jobRef.className} -> ${result.childLogId}`);
 * }
 * ```
 */
export class LogCorrelator {
  private connection: SalesforceConnection;
  private jobTracker: JobTracker;
  private scorer: CorrelationScorer;
  private options: Required<CorrelationOptions>;

  constructor(
    connection: SalesforceConnection,
    options: CorrelationOptions = {}
  ) {
    this.connection = connection;
    this.jobTracker = new JobTracker(connection);
    this.scorer = new CorrelationScorer();
    this.options = { ...DEFAULT_CORRELATION_OPTIONS, ...options };
  }

  /**
   * Correlate async job references to their child logs
   */
  async correlate(
    parentLogId: string,
    asyncJobs: AsyncJobRef[],
    parentLog?: ParsedLog
  ): Promise<CorrelationResult[]> {
    const results: CorrelationResult[] = [];

    if (asyncJobs.length === 0) {
      return results;
    }

    // Get async job records from Salesforce
    let jobRecords: Map<string, AsyncApexJobRecord> = new Map();
    if (this.options.queryAsyncJobs) {
      const trackingResult = await this.jobTracker.trackJobs(asyncJobs);
      for (const job of trackingResult.jobs) {
        jobRecords.set(job.Id, job);
        // Also index by class name for fuzzy matching
        jobRecords.set(job.ApexClassName.toLowerCase(), job);
      }
    }

    // Get candidate child logs
    const candidateLogs = await this.getCandidateLogs(asyncJobs, parentLog);

    // Match each async job to potential child logs
    for (const jobRef of asyncJobs) {
      const asyncJob = this.findAsyncJobRecord(jobRef, jobRecords);
      const matchingLogs = this.findMatchingLogs(jobRef, asyncJob, candidateLogs);

      for (const childLog of matchingLogs) {
        const correlation = this.buildCorrelation(
          parentLogId,
          childLog,
          jobRef,
          asyncJob
        );

        if (correlation.confidence >= this.options.minConfidence) {
          results.push(correlation);
        }
      }

      // If no logs found but we have job record, create partial correlation
      if (matchingLogs.length === 0 && asyncJob) {
        results.push({
          parentLogId,
          childLogId: '', // No log found
          jobRef,
          asyncJob,
          confidence: 0.3, // Low confidence without log
          matchReasons: ['CLASS_NAME_MATCH'],
          matchDetails: [{
            reason: 'CLASS_NAME_MATCH',
            confidence: 0.3,
            description: `Job ${asyncJob.Id} found but no debug log available`,
            evidence: `Status: ${asyncJob.Status}`,
          }],
          jobStatus: asyncJob.Status,
        });
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    // Limit results
    return results.slice(0, this.options.maxChildren);
  }

  /**
   * Correlate a single job to its child log
   */
  async correlateSingle(
    parentLogId: string,
    jobRef: AsyncJobRef
  ): Promise<CorrelationResult | null> {
    const results = await this.correlate(parentLogId, [jobRef]);
    return results[0] || null;
  }

  /**
   * Find child logs for a batch job (multiple workers)
   */
  async correlateBatchJob(
    parentLogId: string,
    batchJobRef: AsyncJobRef
  ): Promise<CorrelationResult[]> {
    if (batchJobRef.jobType !== 'BATCH') {
      return this.correlate(parentLogId, [batchJobRef]);
    }

    const results: CorrelationResult[] = [];

    // Get the main batch job record
    const trackingResult = await this.jobTracker.trackJobs([batchJobRef]);
    const mainJob = trackingResult.jobs[0];

    if (!mainJob) {
      return results;
    }

    // Query for batch worker jobs
    const workerJobs = await this.jobTracker.trackJobsByClassName(
      batchJobRef.className,
      {
        jobType: 'BatchApex',
        createdAfter: new Date(batchJobRef.enqueuedAt / 1000000 - 5000),
      }
    );

    // Get logs for main job and workers
    const allJobs = [mainJob, ...workerJobs];
    const candidateLogs = await this.getCandidateLogsForJobs(allJobs);

    for (const job of allJobs) {
      const matchingLogs = candidateLogs.filter(log =>
        this.matchesJobTiming(log, job) ||
        this.matchesJobClassName(log, job.ApexClassName)
      );

      for (const log of matchingLogs) {
        results.push({
          parentLogId,
          childLogId: log.Id,
          jobRef: batchJobRef,
          asyncJob: job,
          confidence: 0.8,
          matchReasons: ['CLASS_NAME_MATCH', 'BATCH_PATTERN'],
          matchDetails: [
            {
              reason: 'BATCH_PATTERN',
              confidence: 0.8,
              description: `Batch job ${job.Id} with ${job.JobItemsProcessed}/${job.TotalJobItems} items`,
            },
          ],
          jobStatus: job.Status,
          executionDurationMs: job.CompletedDate
            ? new Date(job.CompletedDate).getTime() - new Date(job.CreatedDate).getTime()
            : undefined,
        });
      }
    }

    return results;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Get candidate debug logs that could be child logs
   */
  private async getCandidateLogs(
    asyncJobs: AsyncJobRef[],
    _parentLog?: ParsedLog
  ): Promise<ApexLogRecord[]> {
    // Calculate time window
    const earliestEnqueue = Math.min(...asyncJobs.map(j => j.enqueuedAt));
    const latestEnqueue = Math.max(...asyncJobs.map(j => j.enqueuedAt));

    // Convert nanoseconds to Date
    const startTime = new Date(earliestEnqueue / 1000000 - 5000); // 5s before
    const endTime = new Date(latestEnqueue / 1000000 + this.options.maxTimeWindowMs);

    // Query logs in time window
    return this.queryDebugLogs({
      startTimeAfter: startTime,
      startTimeBefore: endTime,
      limit: 50,
    });
  }

  /**
   * Get candidate logs for specific job records
   */
  private async getCandidateLogsForJobs(
    jobs: AsyncApexJobRecord[]
  ): Promise<ApexLogRecord[]> {
    if (jobs.length === 0) {
      return [];
    }

    const earliest = new Date(Math.min(...jobs.map(j => new Date(j.CreatedDate).getTime())));
    const latest = new Date(Math.max(...jobs.map(j => {
      const completed = j.CompletedDate ? new Date(j.CompletedDate).getTime() : Date.now();
      return completed;
    })));

    return this.queryDebugLogs({
      startTimeAfter: new Date(earliest.getTime() - 5000),
      startTimeBefore: new Date(latest.getTime() + 60000),
      limit: 100,
    });
  }

  /**
   * Query debug logs from Salesforce
   */
  private async queryDebugLogs(filter: {
    startTimeAfter?: Date;
    startTimeBefore?: Date;
    userId?: string;
    limit?: number;
  }): Promise<ApexLogRecord[]> {
    const conditions: string[] = [];

    if (filter.startTimeAfter) {
      conditions.push(`StartTime > ${filter.startTimeAfter.toISOString()}`);
    }
    if (filter.startTimeBefore) {
      conditions.push(`StartTime < ${filter.startTimeBefore.toISOString()}`);
    }
    if (filter.userId) {
      conditions.push(`LogUserId = '${filter.userId}'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit || 25;

    const query = `
      SELECT Id, StartTime, Request, Operation, Application, Status,
             LogLength, LogUser.Id, LogUser.Name, LogUser.Username,
             DurationMilliseconds, Location
      FROM ApexLog
      ${whereClause}
      ORDER BY StartTime ASC
      LIMIT ${limit}
    `;

    const url = `${this.connection.instanceUrl}/services/data/v${this.connection.apiVersion}/query?q=${encodeURIComponent(query.trim())}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.connection.tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as { records: ApexLogRecord[] };
      return data.records || [];
    } catch {
      return [];
    }
  }

  /**
   * Find the AsyncApexJob record for a job reference
   */
  private findAsyncJobRecord(
    jobRef: AsyncJobRef,
    jobRecords: Map<string, AsyncApexJobRecord>
  ): AsyncApexJobRecord | undefined {
    // Try exact ID match first
    if (jobRef.jobId) {
      const byId = jobRecords.get(jobRef.jobId);
      if (byId) return byId;
    }

    // Try class name match
    return jobRecords.get(jobRef.className.toLowerCase());
  }

  /**
   * Find logs that match a job reference
   */
  private findMatchingLogs(
    jobRef: AsyncJobRef,
    asyncJob: AsyncApexJobRecord | undefined,
    candidateLogs: ApexLogRecord[]
  ): ApexLogRecord[] {
    return candidateLogs.filter(log => {
      // Check timing match
      const logTime = new Date(log.StartTime).getTime();
      const enqueuedTime = jobRef.enqueuedAt / 1000000;

      // Log should start after job was enqueued
      if (logTime < enqueuedTime - 5000) {
        return false;
      }

      // Log should start within time window
      if (logTime > enqueuedTime + this.options.maxTimeWindowMs) {
        return false;
      }

      // Check operation contains class name
      if (this.matchesJobClassName(log, jobRef.className)) {
        return true;
      }

      // Check async job timing
      if (asyncJob && this.matchesJobTiming(log, asyncJob)) {
        return true;
      }

      return false;
    });
  }

  /**
   * Check if log operation matches class name
   */
  private matchesJobClassName(log: ApexLogRecord, className: string): boolean {
    if (className === 'Unknown') return false;

    const operation = (log.Operation || '').toLowerCase();
    const classNameLower = className.toLowerCase();

    return operation.includes(classNameLower) ||
           operation.includes(classNameLower.replace(/\./g, '/'));
  }

  /**
   * Check if log timing matches async job
   */
  private matchesJobTiming(log: ApexLogRecord, job: AsyncApexJobRecord): boolean {
    const logTime = new Date(log.StartTime).getTime();
    const jobCreated = new Date(job.CreatedDate).getTime();
    const jobCompleted = job.CompletedDate
      ? new Date(job.CompletedDate).getTime()
      : jobCreated + 3600000; // 1 hour default

    // Log should be between job created and completed (with buffer)
    return logTime >= jobCreated - 5000 && logTime <= jobCompleted + 5000;
  }

  /**
   * Build a correlation result
   */
  private buildCorrelation(
    parentLogId: string,
    childLog: ApexLogRecord,
    jobRef: AsyncJobRef,
    asyncJob?: AsyncApexJobRecord
  ): CorrelationResult {
    const matchDetails: MatchDetail[] = [];
    const matchReasons: CorrelationReason[] = [];

    // Class name match
    if (this.matchesJobClassName(childLog, jobRef.className)) {
      matchReasons.push('CLASS_NAME_MATCH');
      matchDetails.push({
        reason: 'CLASS_NAME_MATCH',
        confidence: 0.7,
        description: `Log operation contains ${jobRef.className}`,
        evidence: childLog.Operation,
      });
    }

    // Timing match
    const logTime = new Date(childLog.StartTime).getTime();
    const enqueuedTime = jobRef.enqueuedAt / 1000000;
    const timeDiff = logTime - enqueuedTime;

    if (timeDiff >= -5000 && timeDiff <= 60000) {
      matchReasons.push('TIMING_MATCH');
      matchDetails.push({
        reason: 'TIMING_MATCH',
        confidence: Math.max(0.3, 1 - (Math.abs(timeDiff) / 60000)),
        description: `Log started ${Math.round(timeDiff / 1000)}s after job enqueued`,
        evidence: `Enqueued: ${new Date(enqueuedTime).toISOString()}, Started: ${childLog.StartTime}`,
      });
    }

    // Job ID match
    if (asyncJob && jobRef.jobId === asyncJob.Id) {
      matchReasons.push('JOB_ID_MATCH');
      matchDetails.push({
        reason: 'JOB_ID_MATCH',
        confidence: 0.95,
        description: `Exact job ID match: ${asyncJob.Id}`,
      });
    }

    // Calculate overall confidence
    const confidence = this.scorer.calculateConfidence(matchDetails);

    // Calculate queue delay
    const queueDelayMs = asyncJob
      ? logTime - new Date(asyncJob.CreatedDate).getTime()
      : timeDiff;

    return {
      parentLogId,
      childLogId: childLog.Id,
      jobRef,
      asyncJob,
      confidence,
      matchReasons,
      matchDetails,
      jobStatus: asyncJob?.Status || 'COMPLETED',
      queueDelayMs: queueDelayMs > 0 ? queueDelayMs : undefined,
      executionDurationMs: childLog.DurationMilliseconds,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a log correlator for a connection
 */
export function createLogCorrelator(
  connection: SalesforceConnection,
  options?: CorrelationOptions
): LogCorrelator {
  return new LogCorrelator(connection, options);
}

/**
 * Quick correlation check without full analysis
 */
export function isLikelyChildLog(
  parentEnqueueTime: number,
  childLogTime: Date,
  className: string,
  logOperation: string
): boolean {
  const timeDiff = childLogTime.getTime() - parentEnqueueTime / 1000000;

  // Must be after enqueue
  if (timeDiff < -5000) return false;

  // Must be within reasonable window
  if (timeDiff > 3600000) return false;

  // Check class name in operation
  if (className !== 'Unknown') {
    const opLower = logOperation.toLowerCase();
    const classLower = className.toLowerCase();
    if (opLower.includes(classLower)) return true;
  }

  // Only timing - lower confidence
  return timeDiff >= 0 && timeDiff < 60000;
}
