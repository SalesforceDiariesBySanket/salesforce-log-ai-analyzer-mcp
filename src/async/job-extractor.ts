/**
 * @module async/job-extractor
 * @description Extract async job references from parsed debug log events
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/types/events.ts, src/types/async.ts
 * @lastModified 2026-01-31
 */

import type { EventNode, AsyncJobEvent, MethodEvent, DebugEvent } from '../types/events';
import type {
  AsyncJobRef,
  AsyncJobType,
  JobExtractionResult,
} from '../types/async';
import type { Confidence } from '../types/common';

// ============================================================================
// Constants
// ============================================================================

/**
 * Event types that indicate async job enqueuing
 */
const ASYNC_EVENT_TYPES = [
  'ASYNC_JOB_ENQUEUED',
  'FUTURE_CALL',
  'QUEUEABLE_JOB',
  'BATCH_APEX_START',
] as const;

/**
 * Patterns for detecting async operations in method calls
 */
const ASYNC_PATTERNS = {
  /** System.enqueueJob() calls */
  ENQUEUE_JOB: /System\.enqueueJob/i,
  /** Database.executeBatch() calls */
  EXECUTE_BATCH: /Database\.executeBatch/i,
  /** System.schedule() calls */
  SCHEDULE_JOB: /System\.schedule/i,
  /** @future method annotations in debug output */
  FUTURE_ANNOTATION: /@future/i,
  /** Queueable interface implementation */
  QUEUEABLE_INTERFACE: /Queueable/i,
  /** Batch interface implementation */
  BATCH_INTERFACE: /Database\.Batchable/i,
  /** Schedulable interface implementation */
  SCHEDULABLE_INTERFACE: /Schedulable/i,
};

/**
 * Debug statement patterns that may contain job IDs
 */
const JOB_ID_PATTERNS = {
  /** Job ID in debug output */
  JOB_ID: /(?:jobId|job\s*id|AsyncApexJob\.Id)[:\s=]+['"]?([a-zA-Z0-9]{15,18})['"]?/i,
  /** Enqueue result */
  ENQUEUE_RESULT: /(?:enqueue|queued)[:\s]+([a-zA-Z0-9]{15,18})/i,
  /** Batch job ID */
  BATCH_ID: /(?:batchId|batch\s*id)[:\s=]+['"]?([a-zA-Z0-9]{15,18})['"]?/i,
};

// ============================================================================
// Job Extractor Class
// ============================================================================

/**
 * Extracts async job references from debug log events
 *
 * @example
 * ```typescript
 * const extractor = new JobExtractor();
 * const result = extractor.extract(parsedLog.events);
 * console.log(`Found ${result.jobs.length} async jobs`);
 * ```
 */
export class JobExtractor {
  private nextId: number = 0;

  /**
   * Extract all async job references from events
   */
  extract(events: EventNode[]): JobExtractionResult {
    const jobs: AsyncJobRef[] = [];
    const warnings: string[] = [];
    const byType: Record<AsyncJobType, AsyncJobRef[]> = {
      QUEUEABLE: [],
      BATCH: [],
      FUTURE: [],
      SCHEDULABLE: [],
    };

    let asyncBoundaryCount = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;
      
      const context = this.buildContext(events, i);

      // Check for direct async events
      if (this.isAsyncEvent(event)) {
        const jobRef = this.extractFromAsyncEvent(event as AsyncJobEvent, context);
        if (jobRef) {
          jobs.push(jobRef);
          byType[jobRef.jobType].push(jobRef);
          asyncBoundaryCount++;
        }
      }

      // Check for async patterns in method calls
      if (event.type === 'METHOD_ENTRY' || event.type === 'METHOD_EXIT') {
        const methodJobRef = this.extractFromMethodEvent(event as MethodEvent, context);
        if (methodJobRef) {
          // Avoid duplicates
          if (!this.isDuplicate(jobs, methodJobRef)) {
            jobs.push(methodJobRef);
            byType[methodJobRef.jobType].push(methodJobRef);
            asyncBoundaryCount++;
          }
        }
      }

      // Check debug statements for job IDs
      if (event.type === 'USER_DEBUG' || event.type === 'SYSTEM_DEBUG') {
        const debugJobRef = this.extractFromDebugEvent(event as DebugEvent, context, jobs);
        if (debugJobRef) {
          // Update existing job with ID if found
          const existing = this.findMatchingJob(jobs, debugJobRef);
          if (existing && debugJobRef.jobId) {
            existing.jobId = debugJobRef.jobId;
          }
        }
      }
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(jobs, events.length, warnings);

    return {
      jobs,
      byType,
      asyncBoundaryCount,
      confidence,
      warnings,
    };
  }

  /**
   * Extract async job refs from a single event (for streaming)
   */
  extractSingle(event: EventNode, context: ExtractionContext): AsyncJobRef | null {
    if (this.isAsyncEvent(event)) {
      return this.extractFromAsyncEvent(event as AsyncJobEvent, context);
    }

    if (event.type === 'METHOD_ENTRY' || event.type === 'METHOD_EXIT') {
      return this.extractFromMethodEvent(event as MethodEvent, context);
    }

    return null;
  }

  // ============================================================================
  // Private Extraction Methods
  // ============================================================================

  /**
   * Check if event is a direct async event type
   */
  private isAsyncEvent(event: EventNode): boolean {
    return (ASYNC_EVENT_TYPES as readonly string[]).includes(event.type);
  }

  /**
   * Extract job reference from async event
   */
  private extractFromAsyncEvent(
    event: AsyncJobEvent,
    context: ExtractionContext
  ): AsyncJobRef | null {
    const jobType = this.mapJobType(event.jobType);

    return {
      id: this.nextId++,
      jobType,
      className: event.className || 'Unknown',
      enqueuedAt: event.timestamp,
      lineNumber: event.lineNumber,
      parentEventId: event.id,
      jobId: event.jobId,
      namespace: event.namespace,
      stackDepth: context.stackDepth,
    };
  }

  /**
   * Extract job reference from method event (System.enqueueJob, etc.)
   */
  private extractFromMethodEvent(
    event: MethodEvent,
    context: ExtractionContext
  ): AsyncJobRef | null {
    const methodName = event.methodName || '';
    const className = event.className || '';

    // Check for System.enqueueJob
    if (ASYNC_PATTERNS.ENQUEUE_JOB.test(methodName)) {
      return {
        id: this.nextId++,
        jobType: 'QUEUEABLE',
        className: this.extractQueueableClassName(context),
        methodName: 'execute',
        enqueuedAt: event.timestamp,
        lineNumber: event.lineNumber,
        parentEventId: event.id,
        namespace: event.namespace,
        stackDepth: context.stackDepth,
      };
    }

    // Check for Database.executeBatch
    if (ASYNC_PATTERNS.EXECUTE_BATCH.test(methodName)) {
      return {
        id: this.nextId++,
        jobType: 'BATCH',
        className: this.extractBatchClassName(context),
        enqueuedAt: event.timestamp,
        lineNumber: event.lineNumber,
        parentEventId: event.id,
        namespace: event.namespace,
        stackDepth: context.stackDepth,
      };
    }

    // Check for System.schedule
    if (ASYNC_PATTERNS.SCHEDULE_JOB.test(methodName)) {
      return {
        id: this.nextId++,
        jobType: 'SCHEDULABLE',
        className: this.extractSchedulableClassName(context),
        enqueuedAt: event.timestamp,
        lineNumber: event.lineNumber,
        parentEventId: event.id,
        namespace: event.namespace,
        stackDepth: context.stackDepth,
      };
    }

    // Check for @future annotation in class name or method
    if (ASYNC_PATTERNS.FUTURE_ANNOTATION.test(methodName) ||
        this.isFutureMethod(className, methodName, context)) {
      return {
        id: this.nextId++,
        jobType: 'FUTURE',
        className: className,
        methodName: this.extractMethodNameOnly(methodName),
        enqueuedAt: event.timestamp,
        lineNumber: event.lineNumber,
        parentEventId: event.id,
        namespace: event.namespace,
        stackDepth: context.stackDepth,
      };
    }

    return null;
  }

  /**
   * Extract job ID from debug event
   */
  private extractFromDebugEvent(
    event: DebugEvent,
    context: ExtractionContext,
    existingJobs: AsyncJobRef[]
  ): AsyncJobRef | null {
    const message = event.message || '';

    // Try to find job ID in debug message
    for (const [, pattern] of Object.entries(JOB_ID_PATTERNS)) {
      const match = message.match(pattern);
      if (match && match[1]) {
        // Return a partial job ref with just the ID
        return {
          id: -1, // Marker for "update only"
          jobType: this.inferJobTypeFromContext(context, existingJobs),
          className: 'Unknown',
          enqueuedAt: event.timestamp,
          lineNumber: event.lineNumber,
          parentEventId: event.id,
          jobId: match[1],
          stackDepth: context.stackDepth,
        };
      }
    }

    return null;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Build extraction context from surrounding events
   */
  private buildContext(events: EventNode[], currentIndex: number): ExtractionContext {
    let stackDepth = 0;

    // Calculate stack depth by counting open code units
    for (let i = 0; i < currentIndex; i++) {
      const e = events[i];
      if (!e) continue;
      if (e.type === 'CODE_UNIT_STARTED' || e.type === 'METHOD_ENTRY') {
        stackDepth++;
      } else if (e.type === 'CODE_UNIT_FINISHED' || e.type === 'METHOD_EXIT') {
        stackDepth = Math.max(0, stackDepth - 1);
      }
    }

    // Get recent events for context
    const windowStart = Math.max(0, currentIndex - 10);
    const windowEnd = Math.min(events.length, currentIndex + 10);
    const recentEvents = events.slice(windowStart, windowEnd);

    return {
      currentIndex,
      stackDepth,
      recentEvents,
      previousEvent: currentIndex > 0 ? events[currentIndex - 1] : undefined,
      nextEvent: currentIndex < events.length - 1 ? events[currentIndex + 1] : undefined,
    };
  }

  /**
   * Map event job type to our AsyncJobType
   */
  private mapJobType(eventJobType: string | undefined): AsyncJobType {
    switch (eventJobType?.toLowerCase()) {
      case 'future':
        return 'FUTURE';
      case 'queueable':
        return 'QUEUEABLE';
      case 'batch':
        return 'BATCH';
      case 'scheduled':
        return 'SCHEDULABLE';
      default:
        return 'QUEUEABLE'; // Default for unknown
    }
  }

  /**
   * Extract Queueable class name from context
   */
  private extractQueueableClassName(context: ExtractionContext): string {
    // Look for class instantiation in recent events
    for (const event of context.recentEvents) {
      if (event.type === 'CONSTRUCTOR_ENTRY' || event.type === 'METHOD_ENTRY') {
        const methodEvent = event as MethodEvent;
        if (ASYNC_PATTERNS.QUEUEABLE_INTERFACE.test(methodEvent.className || '')) {
          return methodEvent.className || 'Unknown';
        }
      }
    }

    // Look in previous event
    if (context.previousEvent?.type === 'CONSTRUCTOR_ENTRY') {
      return (context.previousEvent as MethodEvent).className || 'Unknown';
    }

    return 'Unknown';
  }

  /**
   * Extract Batch class name from context
   */
  private extractBatchClassName(context: ExtractionContext): string {
    for (const event of context.recentEvents) {
      if (event.type === 'CONSTRUCTOR_ENTRY' || event.type === 'METHOD_ENTRY') {
        const methodEvent = event as MethodEvent;
        if (ASYNC_PATTERNS.BATCH_INTERFACE.test(methodEvent.className || '')) {
          return methodEvent.className || 'Unknown';
        }
      }
    }

    return 'Unknown';
  }

  /**
   * Extract Schedulable class name from context
   */
  private extractSchedulableClassName(context: ExtractionContext): string {
    for (const event of context.recentEvents) {
      if (event.type === 'CONSTRUCTOR_ENTRY' || event.type === 'METHOD_ENTRY') {
        const methodEvent = event as MethodEvent;
        if (ASYNC_PATTERNS.SCHEDULABLE_INTERFACE.test(methodEvent.className || '')) {
          return methodEvent.className || 'Unknown';
        }
      }
    }

    return 'Unknown';
  }

  /**
   * Check if a method is a @future method
   */
  private isFutureMethod(
    _className: string,
    methodName: string,
    _context: ExtractionContext
  ): boolean {
    // Check for common @future patterns
    const futurePatterns = [
      /static\s+void/i,
      /async/i,
      /@future/i,
    ];

    return futurePatterns.some(p => p.test(methodName));
  }

  /**
   * Extract just the method name from a full signature
   */
  private extractMethodNameOnly(fullSignature: string): string {
    // Handle "ClassName.methodName" format
    const parts = fullSignature.split('.');
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      return lastPart ? lastPart.replace(/\(.*\)/, '') : fullSignature;
    }
    return fullSignature.replace(/\(.*\)/, '');
  }

  /**
   * Infer job type from context when only job ID is found
   */
  private inferJobTypeFromContext(
    _context: ExtractionContext,
    existingJobs: AsyncJobRef[]
  ): AsyncJobType {
    // Check recent jobs
    if (existingJobs.length > 0) {
      const recent = existingJobs[existingJobs.length - 1];
      if (recent) {
        return recent.jobType;
      }
    }

    // Default to Queueable
    return 'QUEUEABLE';
  }

  /**
   * Check if a job reference is a duplicate
   */
  private isDuplicate(existing: AsyncJobRef[], newJob: AsyncJobRef): boolean {
    return existing.some(job =>
      job.className === newJob.className &&
      job.jobType === newJob.jobType &&
      Math.abs(job.enqueuedAt - newJob.enqueuedAt) < 1000000 // Within 1ms
    );
  }

  /**
   * Find a matching job for updating
   */
  private findMatchingJob(jobs: AsyncJobRef[], partial: AsyncJobRef): AsyncJobRef | undefined {
    // Find most recent job that could match
    return jobs
      .filter(j => j.jobType === partial.jobType || partial.jobType === 'QUEUEABLE')
      .filter(j => !j.jobId) // Only jobs without ID
      .pop();
  }

  /**
   * Calculate extraction confidence
   */
  private calculateConfidence(
    jobs: AsyncJobRef[],
    totalEvents: number,
    warnings: string[]
  ): Confidence {
    let score = 1.0;

    // Reduce confidence for unknown class names
    const unknownCount = jobs.filter(j => j.className === 'Unknown').length;
    if (unknownCount > 0) {
      score -= (unknownCount / Math.max(jobs.length, 1)) * 0.3;
      warnings.push(`${unknownCount} job(s) have unknown class names`);
    }

    // Reduce confidence for missing job IDs
    const missingIds = jobs.filter(j => !j.jobId).length;
    if (missingIds > 0 && jobs.length > 0) {
      score -= (missingIds / jobs.length) * 0.2;
    }

    // Low event count = less context = lower confidence
    if (totalEvents < 50) {
      score -= 0.1;
      warnings.push('Low event count may affect extraction accuracy');
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      reasons: [
        `Found ${jobs.length} async job references`,
        `${unknownCount} with unknown class names`,
        `${jobs.length - missingIds} with job IDs`,
      ],
    };
  }
}

// ============================================================================
// Extraction Context Type
// ============================================================================

/**
 * Context for extraction decisions
 */
export interface ExtractionContext {
  /** Current event index */
  currentIndex: number;

  /** Stack depth at current point */
  stackDepth: number;

  /** Surrounding events for context */
  recentEvents: EventNode[];

  /** Previous event */
  previousEvent?: EventNode;

  /** Next event */
  nextEvent?: EventNode;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Extract async job references from events
 * Convenience function wrapping JobExtractor
 */
export function extractAsyncJobs(events: EventNode[]): JobExtractionResult {
  const extractor = new JobExtractor();
  return extractor.extract(events);
}

/**
 * Check if events contain any async boundaries
 */
export function hasAsyncBoundaries(events: EventNode[]): boolean {
  return events.some(e =>
    (ASYNC_EVENT_TYPES as readonly string[]).includes(e.type) ||
    (e.type === 'METHOD_ENTRY' && (
      ASYNC_PATTERNS.ENQUEUE_JOB.test((e as MethodEvent).methodName || '') ||
      ASYNC_PATTERNS.EXECUTE_BATCH.test((e as MethodEvent).methodName || '') ||
      ASYNC_PATTERNS.SCHEDULE_JOB.test((e as MethodEvent).methodName || '')
    ))
  );
}

/**
 * Get a quick count of async jobs without full extraction
 */
export function countAsyncJobs(events: EventNode[]): number {
  let count = 0;

  for (const event of events) {
    if ((ASYNC_EVENT_TYPES as readonly string[]).includes(event.type)) {
      count++;
    } else if (event.type === 'METHOD_ENTRY') {
      const method = (event as MethodEvent).methodName || '';
      if (ASYNC_PATTERNS.ENQUEUE_JOB.test(method) ||
          ASYNC_PATTERNS.EXECUTE_BATCH.test(method) ||
          ASYNC_PATTERNS.SCHEDULE_JOB.test(method)) {
        count++;
      }
    }
  }

  return count;
}
