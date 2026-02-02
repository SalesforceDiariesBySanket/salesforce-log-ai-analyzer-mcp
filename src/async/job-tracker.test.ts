/**
 * @module async/job-tracker.test
 * @description Unit tests for async job tracking
 * @status COMPLETE
 * @see src/async/STATE.md
 * @dependencies src/async/job-tracker.ts
 * @lastModified 2026-02-01
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  JobTracker,
  createJobTracker,
  isTerminalStatus,
} from './job-tracker';
import type { SalesforceConnection } from '../types/capture';
import type { AsyncJobRef } from '../types/async';

// Mock connection
const createMockConnection = (overrides?: Partial<SalesforceConnection>): SalesforceConnection => ({
  id: 'test-connection',
  alias: 'Test Org',
  orgId: '00D000000000000',
  userId: '005000000000000',
  username: 'test@example.com',
  instanceUrl: 'https://test.salesforce.com',
  apiVersion: 'v59.0',
  orgType: 'sandbox',
  authMethod: 'oauth_pkce',
  authState: 'connected',
  tokens: {
    accessToken: 'test-access-token',
    instanceUrl: 'https://test.salesforce.com',
    tokenType: 'Bearer',
  },
  createdAt: new Date(),
  ...overrides,
});

describe('job-tracker', () => {
  // ==========================================================================
  // JobTracker Class Tests
  // ==========================================================================

  describe('JobTracker', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    const originalFetch = global.fetch;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.resetAllMocks();
    });

    describe('trackJobs', () => {
      it('returns empty result for no jobs', async () => {
        const tracker = new JobTracker(createMockConnection());
        const result = await tracker.trackJobs([]);

        expect(result.success).toBe(true);
        expect(result.jobs).toEqual([]);
        expect(result.notFound).toEqual([]);
      });

      it('tracks jobs with known IDs', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            records: [
              {
                Id: '707000000000001',
                ApexClassId: '01p000000000001',
                ApexClass: { Name: 'TestQueueable' },
                JobType: 'Queueable',
                Status: 'Completed',
                CreatedDate: '2026-01-31T10:00:00Z',
              },
            ],
          }),
        });

        const tracker = new JobTracker(createMockConnection());
        const jobRefs: AsyncJobRef[] = [
          {
            jobType: 'QUEUEABLE',
            jobId: '707000000000001',
            className: 'TestQueueable',
            parentLogId: 'log-123',
            parentLogLine: 42,
            enqueuedAt: Date.now() * 1000000,
            extractedFrom: 'SYSTEM_ENQUEUE_JOB',
          },
        ];

        const result = await tracker.trackJobs(jobRefs);

        expect(result.success).toBe(true);
        expect(result.jobs.length).toBe(1);
        expect(result.jobs[0].ApexClassName).toBe('TestQueueable');
      });

      it('handles disconnected state', async () => {
        const disconnectedConnection = createMockConnection({
          authState: 'disconnected',
        });

        const tracker = new JobTracker(disconnectedConnection);
        const result = await tracker.trackJobs([
          {
            jobType: 'QUEUEABLE',
            jobId: '707000000000001',
            className: 'TestQueueable',
            parentLogId: 'log-123',
            parentLogLine: 42,
            enqueuedAt: Date.now() * 1000000,
            extractedFrom: 'SYSTEM_ENQUEUE_JOB',
          },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not connected');
      });
    });

    describe('trackJobById', () => {
      it('returns null for non-existent job', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ records: [] }),
        });

        const tracker = new JobTracker(createMockConnection());
        const result = await tracker.trackJobById('707000000000999');

        expect(result).toBeNull();
      });
    });

    describe('trackJobsByClassName', () => {
      it('escapes class name to prevent SOQL injection', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ records: [] }),
        });

        const tracker = new JobTracker(createMockConnection());
        // Attempt SOQL injection
        await tracker.trackJobsByClassName("Test' OR '1'='1");

        // Verify the query was escaped
        const fetchCall = mockFetch.mock.calls[0];
        const url = fetchCall[0] as string;
        const decodedUrl = decodeURIComponent(url);
        
        // Should contain escaped quotes
        expect(decodedUrl).toContain("Test\\' OR \\'1\\'=\\'1");
      });

      it('filters by job type', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ records: [] }),
        });

        const tracker = new JobTracker(createMockConnection());
        await tracker.trackJobsByClassName('MyBatch', { jobType: 'BatchApex' });

        const fetchCall = mockFetch.mock.calls[0];
        const url = fetchCall[0] as string;
        const decodedUrl = decodeURIComponent(url);

        expect(decodedUrl).toContain("JobType = 'BatchApex'");
      });
    });
  });

  // ==========================================================================
  // Utility Function Tests
  // ==========================================================================

  describe('createJobTracker', () => {
    it('creates a JobTracker instance', () => {
      const connection = createMockConnection();
      const tracker = createJobTracker(connection);

      expect(tracker).toBeInstanceOf(JobTracker);
    });
  });

  describe('isTerminalStatus', () => {
    it('returns true for terminal statuses', () => {
      expect(isTerminalStatus('COMPLETED')).toBe(true);
      expect(isTerminalStatus('FAILED')).toBe(true);
      expect(isTerminalStatus('ABORTED')).toBe(true);
    });

    it('returns false for non-terminal statuses', () => {
      expect(isTerminalStatus('QUEUED')).toBe(false);
      expect(isTerminalStatus('PREPARING')).toBe(false);
      expect(isTerminalStatus('PROCESSING')).toBe(false);
    });
  });

  // ==========================================================================
  // SOQL Injection Prevention Tests
  // ==========================================================================

  describe('SOQL Injection Prevention', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    const originalFetch = global.fetch;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ records: [] }),
      });
      global.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('escapes single quotes in class names', async () => {
      const tracker = new JobTracker(createMockConnection());
      await tracker.trackJobsByClassName("Test'Class");

      const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
      expect(url).toContain("Test\\'Class");
    });

    it('escapes backslashes in class names', async () => {
      const tracker = new JobTracker(createMockConnection());
      await tracker.trackJobsByClassName("Test\\Class");

      const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
      expect(url).toContain("Test\\\\Class");
    });

    it('escapes double quotes in class names', async () => {
      const tracker = new JobTracker(createMockConnection());
      await tracker.trackJobsByClassName('Test"Class');

      const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('Test\\"Class');
    });
  });
});
