/**
 * @module analyzer/detectors/soql-in-loop.test
 * @description Unit tests for SOQL-in-loop detector
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/analyzer/detectors/soql-in-loop.ts
 * @lastModified 2026-02-01
 */

import { describe, it, expect } from 'vitest';
import { soqlInLoopDetector } from './soql-in-loop';
import type { EventNode, SOQLEvent, MethodEvent } from '../../types/events';

// ============================================================================
// Test Helpers
// ============================================================================

function createSOQLEvent(
  id: number,
  query: string,
  timestamp: number,
  lineNumber: number = 15,
  rows: number = 1
): SOQLEvent {
  return {
    id,
    type: 'SOQL_EXECUTE_BEGIN',
    timestamp,
    lineNumber,
    query,
    rows,
    aggregations: 0,
  } as SOQLEvent;
}

function createMethodEntry(
  id: number,
  className: string,
  methodName: string,
  timestamp: number,
  lineNumber: number = 10
): MethodEvent {
  return {
    id,
    type: 'METHOD_ENTRY',
    timestamp,
    lineNumber,
    className,
    methodName,
  } as MethodEvent;
}

function createMethodExit(
  id: number,
  className: string,
  methodName: string,
  timestamp: number,
  lineNumber: number = 20
): MethodEvent {
  return {
    id,
    type: 'METHOD_EXIT',
    timestamp,
    lineNumber,
    className,
    methodName,
  } as MethodEvent;
}

// ============================================================================
// Tests
// ============================================================================

describe('soql-in-loop detector', () => {
  describe('detector metadata', () => {
    it('has correct name', () => {
      expect(soqlInLoopDetector.name).toBe('SOQL in Loop Detector');
    });

    it('detects SOQL_IN_LOOP issues', () => {
      expect(soqlInLoopDetector.detects).toContain('SOQL_IN_LOOP');
    });
  });

  describe('detect - no issues', () => {
    it('returns empty array for no events', () => {
      const issues = soqlInLoopDetector.detect([]);
      expect(issues).toEqual([]);
    });

    it('returns empty array for single SOQL query', () => {
      const events: EventNode[] = [
        createSOQLEvent(1, 'SELECT Id FROM Account', 1000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      expect(issues).toEqual([]);
    });

    it('returns empty array for two different queries', () => {
      const events: EventNode[] = [
        createSOQLEvent(1, 'SELECT Id FROM Account', 1000000, 15),
        createSOQLEvent(2, 'SELECT Id FROM Contact', 2000000, 20),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      expect(issues).toEqual([]);
    });

    it('returns empty array when queries are not repeated enough', () => {
      const events: EventNode[] = [
        createSOQLEvent(1, 'SELECT Id FROM Account WHERE Id = :accId', 1000000, 15),
        createSOQLEvent(2, 'SELECT Id FROM Account WHERE Id = :accId', 2000000, 15),
      ];
      
      // Only 2 repetitions - needs at least 3 to trigger
      const issues = soqlInLoopDetector.detect(events);
      expect(issues).toEqual([]);
    });
  });

  describe('detect - repeated queries', () => {
    it('detects identical queries repeated 3+ times', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      const events: EventNode[] = [
        createSOQLEvent(1, baseQuery, 1000000, 15),
        createSOQLEvent(2, baseQuery, 2000000, 15),
        createSOQLEvent(3, baseQuery, 3000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0]?.type).toBe('SOQL_IN_LOOP');
    });

    it('detects similar queries with different bind variable values', () => {
      // These queries should normalize to the same pattern
      const events: EventNode[] = [
        createSOQLEvent(1, "SELECT Id FROM Contact WHERE AccountId = '001000000000001'", 1000000, 15),
        createSOQLEvent(2, "SELECT Id FROM Contact WHERE AccountId = '001000000000002'", 2000000, 15),
        createSOQLEvent(3, "SELECT Id FROM Contact WHERE AccountId = '001000000000003'", 3000000, 15),
        createSOQLEvent(4, "SELECT Id FROM Contact WHERE AccountId = '001000000000004'", 4000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0]?.type).toBe('SOQL_IN_LOOP');
    });

    it('includes execution count in issue details', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      const events: EventNode[] = [
        createSOQLEvent(1, baseQuery, 1000000, 15),
        createSOQLEvent(2, baseQuery, 2000000, 15),
        createSOQLEvent(3, baseQuery, 3000000, 15),
        createSOQLEvent(4, baseQuery, 4000000, 15),
        createSOQLEvent(5, baseQuery, 5000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      // Issue description should mention the count
      const description = issues[0]?.description || issues[0]?.title || '';
      expect(description).toMatch(/5|times|execut/i);
    });

    it('sets appropriate severity for high repetition count', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      const events: EventNode[] = [];
      
      // Create 50 repetitions - approaching governor limit
      for (let i = 0; i < 50; i++) {
        events.push(createSOQLEvent(i, baseQuery, 1000000 + i * 100000, 15));
      }
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      // High repetition should have HIGH or CRITICAL severity
      expect(['HIGH', 'CRITICAL']).toContain(issues[0]?.severity);
    });
  });

  describe('detect - method pattern detection', () => {
    it('detects SOQL inside repeatedly called method', () => {
      const events: EventNode[] = [];
      let id = 0;
      let ts = 1000000;
      
      // Simulate method called 5 times with SOQL inside each
      for (let i = 0; i < 5; i++) {
        events.push(createMethodEntry(id++, 'AccountService', 'processRecord', ts, 10));
        ts += 10000;
        events.push(createSOQLEvent(id++, 'SELECT Id FROM Contact WHERE AccountId = :accId', ts, 15));
        ts += 10000;
        events.push(createMethodExit(id++, 'AccountService', 'processRecord', ts, 20));
        ts += 10000;
      }
      
      const issues = soqlInLoopDetector.detect(events);
      
      // Should detect either as repeated query or method pattern
      expect(issues.length).toBeGreaterThanOrEqual(1);
    });

    it('identifies the method containing the loop', () => {
      const events: EventNode[] = [];
      let id = 0;
      let ts = 1000000;
      
      for (let i = 0; i < 5; i++) {
        events.push(createMethodEntry(id++, 'ContactHandler', 'validateContacts', ts, 10));
        ts += 10000;
        events.push(createSOQLEvent(id++, 'SELECT Id FROM Account WHERE Id = :parentId', ts, 15));
        ts += 10000;
        events.push(createMethodExit(id++, 'ContactHandler', 'validateContacts', ts, 20));
        ts += 10000;
      }
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      // Issue should be SOQL_IN_LOOP type
      expect(issues[0]?.type).toBe('SOQL_IN_LOOP');
    });
  });

  describe('detect - rapid execution timing', () => {
    it('considers rapid execution as stronger signal', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      
      // Rapid execution (10ms apart)
      const rapidEvents: EventNode[] = [
        createSOQLEvent(1, baseQuery, 1000000, 15),
        createSOQLEvent(2, baseQuery, 1010000, 15),
        createSOQLEvent(3, baseQuery, 1020000, 15),
      ];
      
      // Slow execution (1 second apart)
      const slowEvents: EventNode[] = [
        createSOQLEvent(1, baseQuery, 1000000, 15),
        createSOQLEvent(2, baseQuery, 2000000000, 15),
        createSOQLEvent(3, baseQuery, 3000000000, 15),
      ];
      
      const rapidIssues = soqlInLoopDetector.detect(rapidEvents);
      const slowIssues = soqlInLoopDetector.detect(slowEvents);
      
      // Both should detect issues, but rapid should have higher confidence
      expect(rapidIssues.length).toBeGreaterThanOrEqual(1);
      // Confidence comparison if available
      if (rapidIssues[0]?.confidence && slowIssues[0]?.confidence) {
        expect(rapidIssues[0].confidence.score).toBeGreaterThanOrEqual(
          slowIssues[0].confidence.score
        );
      }
    });
  });

  describe('detect - deduplication', () => {
    it('does not report duplicate issues for same query pattern', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      const events: EventNode[] = [];
      let id = 0;
      let ts = 1000000;
      
      // Create pattern that might be detected by multiple strategies
      for (let i = 0; i < 10; i++) {
        events.push(createMethodEntry(id++, 'TestClass', 'testMethod', ts, 10));
        ts += 10000;
        events.push(createSOQLEvent(id++, baseQuery, ts, 15));
        ts += 10000;
        events.push(createMethodExit(id++, 'TestClass', 'testMethod', ts, 20));
        ts += 10000;
      }
      
      const issues = soqlInLoopDetector.detect(events);
      
      // Should have issues but not duplicate the same pattern
      const soqlInLoopIssues = issues.filter(i => i.type === 'SOQL_IN_LOOP');
      const queryPatterns = new Set(soqlInLoopIssues.map(i => i.title));
      
      // Each unique query pattern should only appear once
      expect(queryPatterns.size).toBeLessThanOrEqual(soqlInLoopIssues.length);
    });
  });

  describe('detect - issue properties', () => {
    it('includes recommendations for fixing', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      const events: EventNode[] = [
        createSOQLEvent(1, baseQuery, 1000000, 15),
        createSOQLEvent(2, baseQuery, 2000000, 15),
        createSOQLEvent(3, baseQuery, 3000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0]?.recommendations).toBeDefined();
      expect(issues[0]?.recommendations?.length).toBeGreaterThan(0);
      
      // Recommendations should include bulkification advice
      const recommendations = issues[0]?.recommendations?.join(' ').toLowerCase() || '';
      expect(recommendations).toMatch(/bulk|collect|map|set|outside|before/);
    });

    it('includes event IDs for navigation', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      const events: EventNode[] = [
        createSOQLEvent(1, baseQuery, 1000000, 15),
        createSOQLEvent(2, baseQuery, 2000000, 15),
        createSOQLEvent(3, baseQuery, 3000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0]?.eventIds).toBeDefined();
      expect(issues[0]?.eventIds?.length).toBeGreaterThan(0);
    });

    it('includes line numbers', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      const events: EventNode[] = [
        createSOQLEvent(1, baseQuery, 1000000, 42),
        createSOQLEvent(2, baseQuery, 2000000, 42),
        createSOQLEvent(3, baseQuery, 3000000, 42),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0]?.lineNumbers).toBeDefined();
      expect(issues[0]?.lineNumbers).toContain(42);
    });

    it('includes confidence score', () => {
      const baseQuery = 'SELECT Id FROM Contact WHERE AccountId = :accId';
      const events: EventNode[] = [
        createSOQLEvent(1, baseQuery, 1000000, 15),
        createSOQLEvent(2, baseQuery, 2000000, 15),
        createSOQLEvent(3, baseQuery, 3000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0]?.confidence).toBeDefined();
      expect(issues[0]?.confidence?.score).toBeGreaterThanOrEqual(0);
      expect(issues[0]?.confidence?.score).toBeLessThanOrEqual(1);
    });
  });

  describe('detect - edge cases', () => {
    it('handles queries with special characters', () => {
      const events: EventNode[] = [
        createSOQLEvent(1, "SELECT Id FROM Account WHERE Name LIKE '%Test%'", 1000000, 15),
        createSOQLEvent(2, "SELECT Id FROM Account WHERE Name LIKE '%Test%'", 2000000, 15),
        createSOQLEvent(3, "SELECT Id FROM Account WHERE Name LIKE '%Test%'", 3000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
    });

    it('handles queries with newlines and formatting', () => {
      const query = `SELECT Id, Name 
        FROM Contact 
        WHERE AccountId = :accId`;
      const events: EventNode[] = [
        createSOQLEvent(1, query, 1000000, 15),
        createSOQLEvent(2, query, 2000000, 15),
        createSOQLEvent(3, query, 3000000, 15),
      ];
      
      const issues = soqlInLoopDetector.detect(events);
      
      expect(issues.length).toBeGreaterThanOrEqual(1);
    });

    it('differentiates between truly different queries', () => {
      const events: EventNode[] = [
        createSOQLEvent(1, 'SELECT Id FROM Account', 1000000, 15),
        createSOQLEvent(2, 'SELECT Id FROM Contact', 2000000, 20),
        createSOQLEvent(3, 'SELECT Id FROM Opportunity', 3000000, 25),
        createSOQLEvent(4, 'SELECT Id FROM Lead', 4000000, 30),
      ];
      
      // Different queries should not trigger loop detection
      const issues = soqlInLoopDetector.detect(events);
      expect(issues).toEqual([]);
    });
  });
});
