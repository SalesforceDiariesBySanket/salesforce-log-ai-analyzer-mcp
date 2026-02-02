/**
 * @module async/confidence-scorer.test
 * @description Unit tests for correlation confidence scoring
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/async/confidence-scorer.ts
 * @lastModified 2026-02-01
 */

import { describe, it, expect } from 'vitest';
import {
  CorrelationScorer,
  ScoringResult,
  quickConfidenceCheck,
  getConfidenceDescription,
  sortByConfidence,
} from './confidence-scorer';
import type { AsyncJobRef, CorrelationResult, MatchDetail, CorrelationReason } from '../types/async';
import type { ApexLogRecord } from '../types/capture';

// ============================================================================
// Test Helpers
// ============================================================================

function createJobRef(
  jobType: 'QUEUEABLE' | 'BATCH' | 'FUTURE' | 'SCHEDULABLE',
  className: string,
  overrides: Partial<AsyncJobRef> = {}
): AsyncJobRef {
  return {
    id: 'job-1',
    jobType,
    className,
    enqueuedAt: Date.now() * 1000000, // Convert to nanoseconds
    parentEventId: 1,
    lineNumber: 10,
    ...overrides,
  };
}

function createLogRecord(
  operation: string,
  startTime: Date,
  overrides: Partial<ApexLogRecord> = {}
): ApexLogRecord {
  return {
    Id: '07L000000000001',
    LogUser: { Name: 'Test User' },
    Operation: operation,
    StartTime: startTime.toISOString(),
    Status: 'Success',
    LogLength: 1000,
    Request: 'API',
    ...overrides,
  } as ApexLogRecord;
}

function createMatchDetail(
  reason: CorrelationReason,
  confidence: number,
  description: string = 'Test detail'
): MatchDetail {
  return {
    reason,
    confidence,
    description,
    evidence: 'test evidence',
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('async/confidence-scorer', () => {
  describe('CorrelationScorer class', () => {
    describe('calculateConfidence', () => {
      it('returns 0 for empty match details', () => {
        const scorer = new CorrelationScorer();
        expect(scorer.calculateConfidence([])).toBe(0);
      });

      it('calculates confidence for single JOB_ID_MATCH', () => {
        const scorer = new CorrelationScorer();
        const details: MatchDetail[] = [
          createMatchDetail('JOB_ID_MATCH', 0.95),
        ];
        
        const confidence = scorer.calculateConfidence(details);
        expect(confidence).toBeGreaterThan(0.9);
      });

      it('applies timing-only penalty', () => {
        const scorer = new CorrelationScorer();
        
        // Timing-only should have penalty
        const timingOnly = scorer.calculateConfidence([
          createMatchDetail('TIMING_MATCH', 0.7),
        ]);
        
        // Compare with class name only (no penalty)
        const classOnly = scorer.calculateConfidence([
          createMatchDetail('CLASS_NAME_MATCH', 0.7),
        ]);
        
        expect(timingOnly).toBeLessThan(classOnly);
      });

      it('applies multi-match boost', () => {
        const scorer = new CorrelationScorer();
        
        // Single match
        const singleMatch = scorer.calculateConfidence([
          createMatchDetail('CLASS_NAME_MATCH', 0.7),
        ]);
        
        // Multiple matches
        const multiMatch = scorer.calculateConfidence([
          createMatchDetail('CLASS_NAME_MATCH', 0.7),
          createMatchDetail('TIMING_MATCH', 0.7),
        ]);
        
        expect(multiMatch).toBeGreaterThan(singleMatch);
      });

      it('caps confidence at 1.0', () => {
        const scorer = new CorrelationScorer();
        const details: MatchDetail[] = [
          createMatchDetail('JOB_ID_MATCH', 1.0),
          createMatchDetail('CLASS_NAME_MATCH', 1.0),
          createMatchDetail('TIMING_MATCH', 1.0),
          createMatchDetail('METHOD_SIGNATURE_MATCH', 1.0),
        ];
        
        const confidence = scorer.calculateConfidence(details);
        expect(confidence).toBeLessThanOrEqual(1.0);
      });

      it('floors confidence at 0.0', () => {
        const scorer = new CorrelationScorer();
        const details: MatchDetail[] = [
          createMatchDetail('TIMING_MATCH', 0.0), // Will get penalty
        ];
        
        const confidence = scorer.calculateConfidence(details);
        expect(confidence).toBeGreaterThanOrEqual(0);
      });

      it('weights JOB_ID_MATCH highest', () => {
        const scorer = new CorrelationScorer();
        
        const jobIdConfidence = scorer.calculateConfidence([
          createMatchDetail('JOB_ID_MATCH', 0.8),
        ]);
        
        const timingConfidence = scorer.calculateConfidence([
          createMatchDetail('TIMING_MATCH', 0.8),
        ]);
        
        expect(jobIdConfidence).toBeGreaterThan(timingConfidence);
      });

      it('handles METHOD_SIGNATURE_MATCH weight', () => {
        const scorer = new CorrelationScorer();
        const details: MatchDetail[] = [
          createMatchDetail('METHOD_SIGNATURE_MATCH', 0.9),
        ];
        
        const confidence = scorer.calculateConfidence(details);
        expect(confidence).toBeGreaterThan(0.7); // Should be weighted highly
      });

      it('handles BATCH_PATTERN weight', () => {
        const scorer = new CorrelationScorer();
        const details: MatchDetail[] = [
          createMatchDetail('BATCH_PATTERN', 0.75),
        ];
        
        const confidence = scorer.calculateConfidence(details);
        expect(confidence).toBeGreaterThan(0.5);
      });
    });

    describe('getConfidenceLevel', () => {
      it('returns HIGH for score >= 0.85', () => {
        const scorer = new CorrelationScorer();
        expect(scorer.getConfidenceLevel(0.85)).toBe('HIGH');
        expect(scorer.getConfidenceLevel(0.95)).toBe('HIGH');
        expect(scorer.getConfidenceLevel(1.0)).toBe('HIGH');
      });

      it('returns MEDIUM for score >= 0.60 and < 0.85', () => {
        const scorer = new CorrelationScorer();
        expect(scorer.getConfidenceLevel(0.60)).toBe('MEDIUM');
        expect(scorer.getConfidenceLevel(0.70)).toBe('MEDIUM');
        expect(scorer.getConfidenceLevel(0.84)).toBe('MEDIUM');
      });

      it('returns LOW for score < 0.60', () => {
        const scorer = new CorrelationScorer();
        expect(scorer.getConfidenceLevel(0.0)).toBe('LOW');
        expect(scorer.getConfidenceLevel(0.30)).toBe('LOW');
        expect(scorer.getConfidenceLevel(0.59)).toBe('LOW');
      });
    });

    describe('scoreCorrelation', () => {
      it('returns low score when no matches found', () => {
        const scorer = new CorrelationScorer();
        const jobRef = createJobRef('QUEUEABLE', 'MyQueueable');
        const log = createLogRecord('UnrelatedOperation', new Date());
        
        const result = scorer.scoreCorrelation(jobRef, log);
        
        // May include timing match if log is within window
        expect(result.confidence).toBeLessThan(0.9);
        expect(result.matchDetails.length).toBeLessThanOrEqual(2);
      });

      it('scores JOB_ID_MATCH when async job matches', () => {
        const scorer = new CorrelationScorer();
        const jobRef = createJobRef('QUEUEABLE', 'MyQueueable', {
          jobId: '707000000000001',
        });
        const log = createLogRecord('MyQueueable.execute', new Date());
        const asyncJob = {
          Id: '707000000000001',
          ApexClassName: 'MyQueueable',
          JobType: 'Queueable',
          CreatedDate: new Date().toISOString(),
        } as any;
        
        const result = scorer.scoreCorrelation(jobRef, log, asyncJob);
        
        expect(result.reasons).toContain('JOB_ID_MATCH');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('scores CLASS_NAME_MATCH when class found in operation', () => {
        const scorer = new CorrelationScorer();
        const jobRef = createJobRef('QUEUEABLE', 'MyQueueable');
        const log = createLogRecord('MyQueueable.execute', new Date());
        
        const result = scorer.scoreCorrelation(jobRef, log);
        
        expect(result.reasons).toContain('CLASS_NAME_MATCH');
      });

      it('scores TIMING_MATCH when log starts after enqueue', () => {
        const scorer = new CorrelationScorer();
        const now = Date.now();
        const jobRef = createJobRef('QUEUEABLE', 'SomeClass', {
          enqueuedAt: now * 1000000,
        });
        // Log starts 5 seconds after enqueue
        const log = createLogRecord('SomeClass.execute', new Date(now + 5000));
        
        const result = scorer.scoreCorrelation(jobRef, log);
        
        expect(result.reasons).toContain('TIMING_MATCH');
      });

      it('does not score TIMING_MATCH if log before enqueue', () => {
        const scorer = new CorrelationScorer();
        const now = Date.now();
        const jobRef = createJobRef('QUEUEABLE', 'SomeClass', {
          enqueuedAt: now * 1000000,
        });
        // Log starts 10 seconds BEFORE enqueue
        const log = createLogRecord('SomeClass.execute', new Date(now - 10000));
        
        const result = scorer.scoreCorrelation(jobRef, log);
        
        expect(result.reasons).not.toContain('TIMING_MATCH');
      });

      it('scores METHOD_SIGNATURE_MATCH for @future methods', () => {
        const scorer = new CorrelationScorer();
        const jobRef = createJobRef('FUTURE', 'FutureHandler', {
          methodName: 'processRecord',
        });
        const log = createLogRecord('FutureHandler.processRecord', new Date());
        
        const result = scorer.scoreCorrelation(jobRef, log);
        
        expect(result.reasons).toContain('METHOD_SIGNATURE_MATCH');
      });

      it('does not score METHOD_SIGNATURE_MATCH for non-FUTURE jobs', () => {
        const scorer = new CorrelationScorer();
        const jobRef = createJobRef('QUEUEABLE', 'MyQueueable', {
          methodName: 'execute',
        });
        const log = createLogRecord('MyQueueable.execute', new Date());
        
        const result = scorer.scoreCorrelation(jobRef, log);
        
        expect(result.reasons).not.toContain('METHOD_SIGNATURE_MATCH');
      });

      it('scores BATCH_PATTERN for batch jobs', () => {
        const scorer = new CorrelationScorer();
        const jobRef = createJobRef('BATCH', 'MyBatch');
        const log = createLogRecord('MyBatch.execute()', new Date());
        const asyncJob = {
          Id: '707000000000001',
          ApexClassName: 'MyBatch',
          JobType: 'BatchApex',
          CreatedDate: new Date().toISOString(),
          JobItemsProcessed: 50,
          TotalJobItems: 100,
        } as any;
        
        const result = scorer.scoreCorrelation(jobRef, log, asyncJob);
        
        expect(result.reasons).toContain('BATCH_PATTERN');
      });

      it('returns isMatch true when above threshold', () => {
        const scorer = new CorrelationScorer();
        const jobRef = createJobRef('QUEUEABLE', 'MyQueueable', {
          jobId: '707000000000001',
        });
        const log = createLogRecord('MyQueueable.execute', new Date());
        const asyncJob = {
          Id: '707000000000001',
          ApexClassName: 'MyQueueable',
          JobType: 'Queueable',
        } as any;
        
        const result = scorer.scoreCorrelation(jobRef, log, asyncJob);
        
        expect(result.isMatch).toBe(true);
        expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      });

      it('returns level based on confidence', () => {
        const scorer = new CorrelationScorer();
        const jobRef = createJobRef('QUEUEABLE', 'MyQueueable', {
          jobId: '707000000000001',
        });
        const log = createLogRecord('MyQueueable', new Date());
        const asyncJob = {
          Id: '707000000000001',
          ApexClassName: 'MyQueueable',
        } as any;
        
        const result = scorer.scoreCorrelation(jobRef, log, asyncJob);
        
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(result.level);
      });
    });

    describe('compareCorrelations', () => {
      it('prefers higher confidence', () => {
        const scorer = new CorrelationScorer();
        
        const lowConf: CorrelationResult = {
          confidence: 0.5,
          matchReasons: ['TIMING_MATCH'],
          matchDetails: [],
          childLogId: 'log1',
        };
        
        const highConf: CorrelationResult = {
          confidence: 0.9,
          matchReasons: ['JOB_ID_MATCH'],
          matchDetails: [],
          childLogId: 'log2',
        };
        
        expect(scorer.compareCorrelations(lowConf, highConf)).toBeGreaterThan(0);
        expect(scorer.compareCorrelations(highConf, lowConf)).toBeLessThan(0);
      });

      it('prefers more match reasons when confidence equal', () => {
        const scorer = new CorrelationScorer();
        
        const oneReason: CorrelationResult = {
          confidence: 0.7,
          matchReasons: ['TIMING_MATCH'],
          matchDetails: [],
          childLogId: 'log1',
        };
        
        const twoReasons: CorrelationResult = {
          confidence: 0.7,
          matchReasons: ['TIMING_MATCH', 'CLASS_NAME_MATCH'],
          matchDetails: [],
          childLogId: 'log2',
        };
        
        expect(scorer.compareCorrelations(oneReason, twoReasons)).toBeGreaterThan(0);
      });

      it('prefers JOB_ID_MATCH when reasons count equal', () => {
        const scorer = new CorrelationScorer();
        
        const withJobId: CorrelationResult = {
          confidence: 0.7,
          matchReasons: ['JOB_ID_MATCH'],
          matchDetails: [],
          childLogId: 'log1',
        };
        
        const withoutJobId: CorrelationResult = {
          confidence: 0.7,
          matchReasons: ['CLASS_NAME_MATCH'],
          matchDetails: [],
          childLogId: 'log2',
        };
        
        expect(scorer.compareCorrelations(withJobId, withoutJobId)).toBeLessThan(0);
      });

      it('returns 0 for equal correlations', () => {
        const scorer = new CorrelationScorer();
        
        const a: CorrelationResult = {
          confidence: 0.7,
          matchReasons: ['TIMING_MATCH'],
          matchDetails: [],
          childLogId: 'log1',
        };
        
        const b: CorrelationResult = {
          confidence: 0.7,
          matchReasons: ['TIMING_MATCH'],
          matchDetails: [],
          childLogId: 'log2',
        };
        
        expect(scorer.compareCorrelations(a, b)).toBe(0);
      });
    });

    describe('buildConfidence', () => {
      it('builds confidence object from score and details', () => {
        const scorer = new CorrelationScorer();
        const details: MatchDetail[] = [
          createMatchDetail('JOB_ID_MATCH', 0.95, 'Exact job ID match'),
          createMatchDetail('CLASS_NAME_MATCH', 0.7, 'Class name in operation'),
        ];
        
        const confidence = scorer.buildConfidence(0.9, details);
        
        expect(confidence.score).toBe(0.9);
        expect(confidence.reasons).toContain('Exact job ID match');
        expect(confidence.reasons).toContain('Class name in operation');
      });
    });
  });

  describe('quickConfidenceCheck function', () => {
    it('returns confidence score directly', () => {
      const jobRef = createJobRef('QUEUEABLE', 'MyQueueable');
      const log = createLogRecord('MyQueueable.execute', new Date());
      
      const confidence = quickConfidenceCheck(jobRef, log);
      
      expect(typeof confidence).toBe('number');
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('getConfidenceDescription function', () => {
    it('returns "High confidence" for score >= 0.85', () => {
      const desc = getConfidenceDescription(0.9);
      expect(desc).toContain('High confidence');
    });

    it('returns "Medium confidence" for score >= 0.6', () => {
      const desc = getConfidenceDescription(0.7);
      expect(desc).toContain('Medium confidence');
    });

    it('returns "Low confidence" for score >= 0.4', () => {
      const desc = getConfidenceDescription(0.5);
      expect(desc).toContain('Low confidence');
    });

    it('returns "Very low confidence" for score < 0.4', () => {
      const desc = getConfidenceDescription(0.2);
      expect(desc).toContain('Very low confidence');
    });
  });

  describe('sortByConfidence function', () => {
    it('sorts correlations by confidence descending', () => {
      const correlations: CorrelationResult[] = [
        { confidence: 0.5, matchReasons: [], matchDetails: [], childLogId: 'log1' },
        { confidence: 0.9, matchReasons: [], matchDetails: [], childLogId: 'log2' },
        { confidence: 0.7, matchReasons: [], matchDetails: [], childLogId: 'log3' },
      ];
      
      const sorted = sortByConfidence(correlations);
      
      expect(sorted[0]?.confidence).toBe(0.9);
      expect(sorted[1]?.confidence).toBe(0.7);
      expect(sorted[2]?.confidence).toBe(0.5);
    });

    it('does not mutate original array', () => {
      const correlations: CorrelationResult[] = [
        { confidence: 0.5, matchReasons: [], matchDetails: [], childLogId: 'log1' },
        { confidence: 0.9, matchReasons: [], matchDetails: [], childLogId: 'log2' },
      ];
      
      const sorted = sortByConfidence(correlations);
      
      expect(correlations[0]?.confidence).toBe(0.5);
      expect(sorted[0]?.confidence).toBe(0.9);
    });

    it('handles empty array', () => {
      const sorted = sortByConfidence([]);
      expect(sorted).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles Unknown class name', () => {
      const scorer = new CorrelationScorer();
      const jobRef = createJobRef('QUEUEABLE', 'Unknown');
      const log = createLogRecord('Unknown', new Date());
      
      const result = scorer.scoreCorrelation(jobRef, log);
      
      // Should not give CLASS_NAME_MATCH for Unknown
      expect(result.reasons).not.toContain('CLASS_NAME_MATCH');
    });

    it('handles namespaced class names', () => {
      const scorer = new CorrelationScorer();
      const jobRef = createJobRef('QUEUEABLE', 'SBQQ.MyQueueable');
      const log = createLogRecord('myqueueable.execute', new Date());
      
      const result = scorer.scoreCorrelation(jobRef, log);
      
      // Should match without namespace prefix
      expect(result.reasons).toContain('CLASS_NAME_MATCH');
    });

    it('handles case-insensitive class matching', () => {
      const scorer = new CorrelationScorer();
      const jobRef = createJobRef('QUEUEABLE', 'MyQueueable');
      const log = createLogRecord('MYQUEUEABLE', new Date());
      
      const result = scorer.scoreCorrelation(jobRef, log);
      
      expect(result.reasons).toContain('CLASS_NAME_MATCH');
    });

    it('handles batch worker job type', () => {
      const scorer = new CorrelationScorer();
      const jobRef = createJobRef('BATCH', 'MyBatch');
      const log = createLogRecord('MyBatch.execute()', new Date());
      const asyncJob = {
        Id: '707000000000001',
        ApexClassName: 'MyBatch',
        JobType: 'BatchApexWorker', // Worker type
        CreatedDate: new Date().toISOString(),
        JobItemsProcessed: 0,
        TotalJobItems: 100,
      } as any;
      
      const result = scorer.scoreCorrelation(jobRef, log, asyncJob);
      
      expect(result.reasons).toContain('BATCH_PATTERN');
    });
  });
});
