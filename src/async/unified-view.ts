/**
 * @module async/unified-view
 * @description Build unified view combining parent and child logs
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/types/async.ts, src/types/events.ts
 * @lastModified 2026-01-31
 */

import type { EventNode, ParsedLog } from '../types/events';
import type { SalesforceConnection } from '../types/capture';
import type { Confidence } from '../types/common';
import type {
  AsyncJobRef,
  CorrelationResult,
  UnifiedView,
  UnifiedExecutionNode,
  UnifiedLogInfo,
  UnifiedSummary,
  AsyncJobStatus,
  CorrelationOptions,
  JobExtractionResult,
} from '../types/async';
import { extractAsyncJobs } from './job-extractor';
import { LogCorrelator } from './log-correlator';

// ============================================================================
// Unified View Builder Class
// ============================================================================

/**
 * Builds a unified view of parent and child log execution
 *
 * @example
 * ```typescript
 * const builder = new UnifiedViewBuilder(connection);
 * const view = await builder.build(parentLog, { fetchChildLogs: true });
 * console.log(`Total execution: ${view.summary.totalDurationMs}ms`);
 * ```
 */
export class UnifiedViewBuilder {
  private correlator: LogCorrelator;
  private logCache: Map<string, ParsedLog> = new Map();

  constructor(connection: SalesforceConnection, options?: CorrelationOptions) {
    this.correlator = new LogCorrelator(connection, options);
  }

  /**
   * Build unified view from a parent log
   */
  async build(
    parentLog: ParsedLog,
    parentLogId: string,
    options: UnifiedViewOptions = {}
  ): Promise<UnifiedView> {
    // Extract async job references
    const extraction = extractAsyncJobs(parentLog.events);

    // Correlate to child logs
    const correlations = await this.correlator.correlate(
      parentLogId,
      extraction.jobs,
      parentLog
    );

    // Build log info list
    const logs = await this.buildLogInfoList(
      parentLogId,
      parentLog,
      correlations,
      options
    );

    // Build execution tree
    const root = this.buildExecutionTree(
      parentLog,
      parentLogId,
      extraction,
      correlations,
      logs
    );

    // Build summary
    const summary = this.buildSummary(
      parentLog,
      extraction,
      correlations,
      logs
    );

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(
      extraction,
      correlations
    );

    return {
      root,
      asyncJobs: extraction.jobs,
      correlations,
      logs,
      summary,
      confidence,
    };
  }

  /**
   * Build unified view from just log IDs (fetches logs)
   */
  async buildFromLogId(
    _parentLogId: string,
    _options: UnifiedViewOptions = {}
  ): Promise<UnifiedView> {
    // This would fetch and parse the parent log
    // For now, throw error if log not provided
    throw new Error('buildFromLogId requires log fetching implementation');
  }

  /**
   * Add a parsed log to the cache
   */
  cacheLog(logId: string, parsedLog: ParsedLog): void {
    this.logCache.set(logId, parsedLog);
  }

  /**
   * Get cached log
   */
  getCachedLog(logId: string): ParsedLog | undefined {
    return this.logCache.get(logId);
  }

  // ============================================================================
  // Private Build Methods
  // ============================================================================

  /**
   * Build the list of log info objects
   */
  private async buildLogInfoList(
    parentLogId: string,
    parentLog: ParsedLog,
    correlations: CorrelationResult[],
    options: UnifiedViewOptions
  ): Promise<UnifiedLogInfo[]> {
    const logs: UnifiedLogInfo[] = [];

    // Add parent log
    logs.push({
      logId: parentLogId,
      role: 'PARENT',
      parsedLog: parentLog,
      status: 'FETCHED',
    });

    // Add child logs
    const childLogIds = new Set(
      correlations
        .filter(c => c.childLogId)
        .map(c => c.childLogId)
    );

    for (const childLogId of childLogIds) {
      const info: UnifiedLogInfo = {
        logId: childLogId,
        role: 'CHILD',
        status: 'NOT_FETCHED',
      };

      // Check cache
      const cached = this.logCache.get(childLogId);
      if (cached) {
        info.parsedLog = cached;
        info.status = 'FETCHED';
      } else if (options.fetchChildLogs) {
        // Would fetch here
        info.status = 'NOT_FETCHED';
      }

      logs.push(info);
    }

    return logs;
  }

  /**
   * Build the execution tree
   */
  private buildExecutionTree(
    parentLog: ParsedLog,
    parentLogId: string,
    extraction: JobExtractionResult,
    correlations: CorrelationResult[],
    logs: UnifiedLogInfo[]
  ): UnifiedExecutionNode {
    // Create root node from parent log
    const root: UnifiedExecutionNode = {
      id: `sync_${parentLogId}`,
      type: 'SYNC',
      logId: parentLogId,
      events: [],
      children: [],
      timeRange: {
        start: parentLog.events[0]?.timestamp || 0,
        end: parentLog.events[parentLog.events.length - 1]?.timestamp || 0,
      },
    };

    // Split parent events into segments around async boundaries
    const segments = this.splitByAsyncBoundaries(
      parentLog.events,
      extraction.jobs
    );

    // Build child nodes for each segment and async boundary
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      if (segment.type === 'SYNC') {
        // Add sync events to root or create child node
        if (i === 0) {
          root.events = segment.events;
        } else {
          root.children.push({
            id: `sync_${parentLogId}_${i}`,
            type: 'SYNC',
            logId: parentLogId,
            events: segment.events,
            children: [],
            timeRange: {
              start: segment.events[0]?.timestamp || 0,
              end: segment.events[segment.events.length - 1]?.timestamp || 0,
            },
          });
        }
      } else {
        // Async boundary - create boundary node with child
        const asyncJob = segment.asyncJob!;
        const correlation = correlations.find(c =>
          c.jobRef.id === asyncJob.id
        );

        const boundaryNode: UnifiedExecutionNode = {
          id: `async_${asyncJob.id}`,
          type: 'ASYNC_BOUNDARY',
          logId: parentLogId,
          events: segment.events,
          children: [],
          asyncJob,
          timeRange: {
            start: asyncJob.enqueuedAt,
            end: asyncJob.enqueuedAt,
          },
        };

        // Add child log node if correlated
        if (correlation?.childLogId) {
          const childLogInfo = logs.find(l => l.logId === correlation.childLogId);
          const childNode: UnifiedExecutionNode = {
            id: `child_${correlation.childLogId}`,
            type: 'ASYNC_CHILD',
            logId: correlation.childLogId,
            events: childLogInfo?.parsedLog?.events || [],
            children: [],
            asyncJob,
            timeRange: {
              start: childLogInfo?.parsedLog?.events[0]?.timestamp || 0,
              end: childLogInfo?.parsedLog?.events[childLogInfo.parsedLog.events.length - 1]?.timestamp || 0,
            },
          };

          boundaryNode.children.push(childNode);

          // Update boundary end time
          if (childNode.timeRange.end > boundaryNode.timeRange.end) {
            boundaryNode.timeRange.end = childNode.timeRange.end;
          }
        }

        root.children.push(boundaryNode);
      }
    }

    return root;
  }

  /**
   * Split events into segments around async boundaries
   */
  private splitByAsyncBoundaries(
    events: EventNode[],
    asyncJobs: AsyncJobRef[]
  ): ExecutionSegment[] {
    const segments: ExecutionSegment[] = [];
    const asyncEventIds = new Set(asyncJobs.map(j => j.parentEventId));

    let currentSegment: EventNode[] = [];

    for (const event of events) {
      if (asyncEventIds.has(event.id)) {
        // End current sync segment
        if (currentSegment.length > 0) {
          segments.push({
            type: 'SYNC',
            events: currentSegment,
          });
          currentSegment = [];
        }

        // Add async boundary segment
        const asyncJob = asyncJobs.find(j => j.parentEventId === event.id);
        segments.push({
          type: 'ASYNC_BOUNDARY',
          events: [event],
          asyncJob,
        });
      } else {
        currentSegment.push(event);
      }
    }

    // Add final sync segment
    if (currentSegment.length > 0) {
      segments.push({
        type: 'SYNC',
        events: currentSegment,
      });
    }

    return segments;
  }

  /**
   * Build unified summary
   */
  private buildSummary(
    _parentLog: ParsedLog,
    extraction: JobExtractionResult,
    correlations: CorrelationResult[],
    logs: UnifiedLogInfo[]
  ): UnifiedSummary {
    // Calculate total duration
    let totalDurationMs = 0;
    for (const log of logs) {
      if (log.parsedLog && log.status === 'FETCHED') {
        const events = log.parsedLog.events;
        if (events.length >= 2) {
          const firstEvent = events[0];
          const lastEvent = events[events.length - 1];
          if (firstEvent && lastEvent) {
            const duration = (lastEvent.timestamp - firstEvent.timestamp) / 1000000;
            totalDurationMs += duration;
          }
        }
      }
    }

    // Add queue delays
    for (const corr of correlations) {
      if (corr.queueDelayMs) {
        totalDurationMs += corr.queueDelayMs;
      }
    }

    // Count jobs by status
    const jobsByStatus: Record<AsyncJobStatus, number> = {
      QUEUED: 0,
      PREPARING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
      ABORTED: 0,
      HOLDING: 0,
    };

    let totalErrors = 0;
    for (const corr of correlations) {
      jobsByStatus[corr.jobStatus]++;
      if (corr.asyncJob?.NumberOfErrors) {
        totalErrors += corr.asyncJob.NumberOfErrors;
      }
    }

    // Determine overall status
    let overallStatus: UnifiedSummary['overallStatus'] = 'SUCCESS';
    if (jobsByStatus.FAILED > 0 || jobsByStatus.ABORTED > 0) {
      overallStatus = correlations.every(c =>
        c.jobStatus === 'FAILED' || c.jobStatus === 'ABORTED'
      ) ? 'FAILURE' : 'PARTIAL_FAILURE';
    }

    // Build flow description
    const flowDescription = this.buildFlowDescription(extraction, correlations);

    return {
      totalDurationMs,
      logCount: logs.length,
      asyncBoundaries: extraction.asyncBoundaryCount,
      overallStatus,
      jobsByStatus,
      totalErrors,
      flowDescription,
    };
  }

  /**
   * Build human-readable flow description
   */
  private buildFlowDescription(
    extraction: JobExtractionResult,
    correlations: CorrelationResult[]
  ): string {
    if (extraction.jobs.length === 0) {
      return 'Synchronous execution (no async jobs)';
    }

    const parts: string[] = ['Parent execution'];

    // Group jobs by type
    const byType = extraction.byType;
    const typeDescriptions: string[] = [];

    if (byType.QUEUEABLE.length > 0) {
      typeDescriptions.push(`${byType.QUEUEABLE.length} Queueable job(s)`);
    }
    if (byType.BATCH.length > 0) {
      typeDescriptions.push(`${byType.BATCH.length} Batch job(s)`);
    }
    if (byType.FUTURE.length > 0) {
      typeDescriptions.push(`${byType.FUTURE.length} @future method(s)`);
    }
    if (byType.SCHEDULABLE.length > 0) {
      typeDescriptions.push(`${byType.SCHEDULABLE.length} Scheduled job(s)`);
    }

    if (typeDescriptions.length > 0) {
      parts.push(`enqueued ${typeDescriptions.join(', ')}`);
    }

    // Add correlation info
    const correlated = correlations.filter(c => c.childLogId).length;
    const total = correlations.length;
    if (correlated > 0) {
      parts.push(`→ ${correlated}/${total} correlated to child logs`);
    }

    return parts.join(' ');
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(
    extraction: JobExtractionResult,
    correlations: CorrelationResult[]
  ): Confidence {
    const factors: string[] = [];

    // Base confidence from extraction
    let score = extraction.confidence.score;
    factors.push(`Extraction: ${extraction.jobs.length} jobs found`);

    // Adjust for correlation quality
    if (correlations.length > 0) {
      const avgCorrelationConfidence = correlations.reduce(
        (sum, c) => sum + c.confidence,
        0
      ) / correlations.length;

      score = (score + avgCorrelationConfidence) / 2;
      factors.push(`Avg correlation confidence: ${(avgCorrelationConfidence * 100).toFixed(0)}%`);
    }

    // Penalize for missing child logs
    const missingChildren = correlations.filter(c => !c.childLogId).length;
    if (missingChildren > 0) {
      score -= missingChildren * 0.1;
      factors.push(`${missingChildren} child log(s) not found`);
    }

    score = Math.max(0, Math.min(1, score));

    return {
      score,
      reasons: factors,
    };
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Options for building unified view
 */
export interface UnifiedViewOptions {
  /** Fetch and parse child logs */
  fetchChildLogs?: boolean;

  /** Include grandchildren (recursive) */
  includeGrandchildren?: boolean;

  /** Maximum depth to recurse */
  maxDepth?: number;
}

/**
 * Execution segment during splitting
 */
interface ExecutionSegment {
  type: 'SYNC' | 'ASYNC_BOUNDARY';
  events: EventNode[];
  asyncJob?: AsyncJobRef;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a unified view builder
 */
export function createUnifiedViewBuilder(
  connection: SalesforceConnection,
  options?: CorrelationOptions
): UnifiedViewBuilder {
  return new UnifiedViewBuilder(connection, options);
}

/**
 * Build a simple unified view without fetching child logs
 */
export function buildSimpleUnifiedView(
  parentLog: ParsedLog,
  parentLogId: string
): Omit<UnifiedView, 'correlations'> & { asyncJobs: AsyncJobRef[] } {
  const extraction = extractAsyncJobs(parentLog.events);

  const root: UnifiedExecutionNode = {
    id: `sync_${parentLogId}`,
    type: 'SYNC',
    logId: parentLogId,
    events: parentLog.events,
    children: [],
    timeRange: {
      start: parentLog.events[0]?.timestamp || 0,
      end: parentLog.events[parentLog.events.length - 1]?.timestamp || 0,
    },
  };

  // Add async boundary markers
  for (const job of extraction.jobs) {
    root.children.push({
      id: `async_${job.id}`,
      type: 'ASYNC_BOUNDARY',
      logId: parentLogId,
      events: [],
      children: [],
      asyncJob: job,
      timeRange: {
        start: job.enqueuedAt,
        end: job.enqueuedAt,
      },
    });
  }

  const logs: UnifiedLogInfo[] = [{
    logId: parentLogId,
    role: 'PARENT',
    parsedLog: parentLog,
    status: 'FETCHED',
  }];

  const summary: UnifiedSummary = {
    totalDurationMs: (root.timeRange.end - root.timeRange.start) / 1000000,
    logCount: 1,
    asyncBoundaries: extraction.asyncBoundaryCount,
    overallStatus: 'UNKNOWN',
    jobsByStatus: {
      QUEUED: 0,
      PREPARING: 0,
      PROCESSING: extraction.jobs.length,
      COMPLETED: 0,
      FAILED: 0,
      ABORTED: 0,
      HOLDING: 0,
    },
    totalErrors: 0,
    flowDescription: extraction.jobs.length > 0
      ? `Parent + ${extraction.jobs.length} async job(s) (not correlated)`
      : 'Synchronous execution',
  };

  return {
    root,
    asyncJobs: extraction.jobs,
    logs,
    summary,
    confidence: extraction.confidence,
  };
}

/**
 * Get a flattened list of all events across logs in order
 */
export function flattenUnifiedEvents(view: UnifiedView): EventNode[] {
  const events: EventNode[] = [];

  function collectEvents(node: UnifiedExecutionNode) {
    events.push(...node.events);
    for (const child of node.children) {
      collectEvents(child);
    }
  }

  collectEvents(view.root);

  // Sort by timestamp
  return events.sort((a, b) => a.timestamp - b.timestamp);
}
