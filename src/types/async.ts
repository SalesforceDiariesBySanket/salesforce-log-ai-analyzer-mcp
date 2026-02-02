/**
 * @module types/async
 * @description Type definitions for async job correlation
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/types/events.ts, src/types/capture.ts
 * @lastModified 2026-01-31
 */

import type { EventNode, ParsedLog } from './events';
import type { ApexLogRecord } from './capture';
import type { Confidence } from './common';
import { CORRELATION_SETTINGS } from '../constants';

// ============================================================================
// Async Job Types
// ============================================================================

/**
 * Types of async jobs in Salesforce
 */
export type AsyncJobType = 
  | 'QUEUEABLE'
  | 'BATCH'
  | 'FUTURE'
  | 'SCHEDULABLE';

/**
 * Status of an async job
 */
export type AsyncJobStatus =
  | 'QUEUED'
  | 'PREPARING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED'
  | 'HOLDING';

// ============================================================================
// Job Reference (Extracted from Parent Log)
// ============================================================================

/**
 * Reference to an async job extracted from a debug log
 * Used to correlate parent logs with their async children
 */
export interface AsyncJobRef {
  /** Unique ID within the parent log */
  id: number;

  /** Type of async job */
  jobType: AsyncJobType;

  /** Apex class implementing the async interface */
  className: string;

  /** Method name if applicable (for @future methods) */
  methodName?: string;

  /** Timestamp when job was enqueued (nanoseconds from log) */
  enqueuedAt: number;

  /** Line number in parent log where job was enqueued */
  lineNumber: number;

  /** Event ID in parent log that enqueued this job */
  parentEventId: number;

  /** Job ID if available (from System.enqueueJob return) */
  jobId?: string;

  /** Parameters passed to the job (if detectable) */
  parameters?: Record<string, unknown>;

  /** Namespace of the enqueuing code */
  namespace?: string;

  /** Stack depth when job was enqueued */
  stackDepth: number;
}

// ============================================================================
// AsyncApexJob Record (from Salesforce)
// ============================================================================

/**
 * AsyncApexJob record from Salesforce
 * Queried via Tooling API or SOQL
 */
export interface AsyncApexJobRecord {
  /** Salesforce ID */
  Id: string;

  /** Apex class ID */
  ApexClassId: string;

  /** Apex class name */
  ApexClassName: string;

  /** Job type */
  JobType: 'Future' | 'Queueable' | 'BatchApex' | 'ScheduledApex' | 'BatchApexWorker';

  /** Job status */
  Status: AsyncJobStatus;

  /** Number of batches processed (for batch jobs) */
  JobItemsProcessed?: number;

  /** Total batches (for batch jobs) */
  TotalJobItems?: number;

  /** Number of failures */
  NumberOfErrors?: number;

  /** Created date */
  CreatedDate: string;

  /** Completed date */
  CompletedDate?: string;

  /** Extended status message */
  ExtendedStatus?: string;

  /** Parent job ID (for batch workers) */
  ParentJobId?: string;

  /** Method name (for @future) */
  MethodName?: string;

  /** Last processed offset */
  LastProcessedOffset?: number;
}

// ============================================================================
// Correlation Types
// ============================================================================

/**
 * Reason why a correlation was made
 */
export type CorrelationReason =
  | 'JOB_ID_MATCH'           // Exact job ID match
  | 'CLASS_NAME_MATCH'       // Same class name
  | 'TIMING_MATCH'           // Timing correlation
  | 'USER_MATCH'             // Same user
  | 'METHOD_SIGNATURE_MATCH' // Same method signature (@future)
  | 'SEQUENCE_MATCH'         // Sequential execution pattern
  | 'BATCH_PATTERN';         // Batch execution pattern

/**
 * Result of correlating a parent log to child logs
 */
export interface CorrelationResult {
  /** Parent log ID */
  parentLogId: string;

  /** Child log ID */
  childLogId: string;

  /** Async job reference from parent */
  jobRef: AsyncJobRef;

  /** AsyncApexJob record if found */
  asyncJob?: AsyncApexJobRecord;

  /** Overall correlation confidence (0-1) */
  confidence: number;

  /** Reasons for this correlation */
  matchReasons: CorrelationReason[];

  /** Match details for each reason */
  matchDetails: MatchDetail[];

  /** Final job status */
  jobStatus: AsyncJobStatus;

  /** Time between enqueue and start (ms) */
  queueDelayMs?: number;

  /** Child job execution duration (ms) */
  executionDurationMs?: number;
}

/**
 * Detail about a single match reason
 */
export interface MatchDetail {
  /** Match reason type */
  reason: CorrelationReason;

  /** Confidence contribution (0-1) */
  confidence: number;

  /** Description of the match */
  description: string;

  /** Evidence supporting the match */
  evidence?: string;
}

// ============================================================================
// Unified View Types
// ============================================================================

/**
 * A node in the unified execution tree
 */
export interface UnifiedExecutionNode {
  /** Node ID */
  id: string;

  /** Node type */
  type: 'SYNC' | 'ASYNC_BOUNDARY' | 'ASYNC_CHILD';

  /** Log ID this node came from */
  logId: string;

  /** Events in this execution segment */
  events: EventNode[];

  /** Child execution nodes */
  children: UnifiedExecutionNode[];

  /** Async job info if this is an async boundary */
  asyncJob?: AsyncJobRef;

  /** Time range (nanoseconds) */
  timeRange: {
    start: number;
    end: number;
  };

  /** Namespace of this execution segment */
  namespace?: string;
}

/**
 * Unified view combining parent and child logs
 */
export interface UnifiedView {
  /** Root node (parent execution) */
  root: UnifiedExecutionNode;

  /** All async job references found */
  asyncJobs: AsyncJobRef[];

  /** All correlations made */
  correlations: CorrelationResult[];

  /** Logs included in this view */
  logs: UnifiedLogInfo[];

  /** Summary of the unified execution */
  summary: UnifiedSummary;

  /** Overall confidence in the unified view */
  confidence: Confidence;
}

/**
 * Info about a log included in unified view
 */
export interface UnifiedLogInfo {
  /** Log ID */
  logId: string;

  /** Log record metadata */
  record?: ApexLogRecord;

  /** Role in the execution chain */
  role: 'PARENT' | 'CHILD' | 'GRANDCHILD';

  /** Parsed log (if fetched) */
  parsedLog?: ParsedLog;

  /** Fetch status */
  status: 'FETCHED' | 'NOT_FETCHED' | 'FETCH_FAILED' | 'NOT_FOUND';
}

/**
 * Summary of unified execution
 */
export interface UnifiedSummary {
  /** Total execution time including async (ms) */
  totalDurationMs: number;

  /** Number of logs in the chain */
  logCount: number;

  /** Number of async boundaries crossed */
  asyncBoundaries: number;

  /** Success/failure status */
  overallStatus: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILURE' | 'UNKNOWN';

  /** Jobs by status */
  jobsByStatus: Record<AsyncJobStatus, number>;

  /** Total errors across all jobs */
  totalErrors: number;

  /** Execution flow description */
  flowDescription: string;
}

// ============================================================================
// Correlation Options
// ============================================================================

/**
 * Options for job correlation
 */
export interface CorrelationOptions {
  /** Maximum time window for correlation (ms) */
  maxTimeWindowMs?: number;

  /** Minimum confidence threshold */
  minConfidence?: number;

  /** Whether to fetch child logs */
  fetchChildLogs?: boolean;

  /** Maximum number of child logs to correlate */
  maxChildren?: number;

  /** Include grandchildren (children of children) */
  includeGrandchildren?: boolean;

  /** Query AsyncApexJob table */
  queryAsyncJobs?: boolean;
}

/**
 * Default correlation options (using centralized constants)
 */
export const DEFAULT_CORRELATION_OPTIONS: Required<CorrelationOptions> = {
  maxTimeWindowMs: CORRELATION_SETTINGS.DEFAULT_MAX_TIME_WINDOW_MS,
  minConfidence: CORRELATION_SETTINGS.MIN_CONFIDENCE,
  fetchChildLogs: true,
  maxChildren: CORRELATION_SETTINGS.MAX_CHILDREN,
  includeGrandchildren: false,
  queryAsyncJobs: true,
};

// ============================================================================
// Job Extraction Types
// ============================================================================

/**
 * Result of extracting async jobs from a log
 */
export interface JobExtractionResult {
  /** Extracted job references */
  jobs: AsyncJobRef[];

  /** Jobs by type */
  byType: Record<AsyncJobType, AsyncJobRef[]>;

  /** Total async boundaries detected */
  asyncBoundaryCount: number;

  /** Extraction confidence */
  confidence: Confidence;

  /** Warnings during extraction */
  warnings: string[];
}

// ============================================================================
// Tracking Types
// ============================================================================

/**
 * Result of querying AsyncApexJob
 */
export interface JobTrackingResult {
  /** Whether the query succeeded */
  success: boolean;

  /** Found job records */
  jobs: AsyncApexJobRecord[];

  /** Jobs that couldn't be found */
  notFound: string[];

  /** Error if query failed */
  error?: string;
}
