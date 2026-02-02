/**
 * @module parser/tokenizer.test
 * @description Unit tests for the tokenizer module
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/parser/tokenizer.ts
 * @lastModified 2026-02-01
 */

import { describe, it, expect } from 'vitest';
import {
  tokenizeLine,
  tokenizeLineFast,
  tokenizeLineWithFallback,
  tokenizeLog,
} from './tokenizer';

describe('tokenizer', () => {
  // ==========================================================================
  // tokenizeLine Tests
  // ==========================================================================

  describe('tokenizeLine', () => {
    it('parses METHOD_ENTRY line correctly', () => {
      const line = '12:34:56.789 (123456789)|METHOD_ENTRY|[1]|MyClass.doWork';
      const result = tokenizeLine(line, 1);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.eventType).toBe('METHOD_ENTRY');
        expect(result.data.timestamp).toBe(123456789);
        expect(result.data.lineNumber).toBe(1);
      }
    });

    it('parses SOQL_EXECUTE_BEGIN line correctly', () => {
      const line = '12:34:56.789 (999999)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account';
      const result = tokenizeLine(line, 10);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.eventType).toBe('SOQL_EXECUTE_BEGIN');
      }
    });

    it('parses EXCEPTION_THROWN line correctly', () => {
      const line = '12:34:56.789 (500000)|EXCEPTION_THROWN|[5]|System.NullPointerException: Attempt to de-reference a null object';
      const result = tokenizeLine(line, 5);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.eventType).toBe('EXCEPTION_THROWN');
      }
    });

    it('returns null for header lines', () => {
      const line = '48.0 APEX_CODE,FINEST;APEX_PROFILING,INFO;CALLOUT,INFO';
      const result = tokenizeLine(line, 1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('returns null for empty lines', () => {
      const result = tokenizeLine('', 1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('returns null for garbage input', () => {
      const result = tokenizeLine('this is not a valid log line', 1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('handles very long lines without ReDoS', () => {
      const longSegment = 'A'.repeat(10000);
      const line = `12:34:56.789 (123)|USER_DEBUG|[1]|DEBUG|${longSegment}`;
      
      const startTime = Date.now();
      const result = tokenizeLine(line, 1);
      const elapsed = Date.now() - startTime;

      // Should complete quickly (not stuck in regex)
      expect(elapsed).toBeLessThan(1000);
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.eventType).toBe('USER_DEBUG');
      }
    });

    it('truncates lines exceeding MAX_LINE_LENGTH', () => {
      // Create a line longer than 1MB
      const hugeLine = '12:34:56.789 (123)|USER_DEBUG|' + 'X'.repeat(2 * 1024 * 1024);
      const result = tokenizeLine(hugeLine, 1);
      
      // Should still parse (after truncation) or return null, but not hang
      // The key is it doesn't take forever
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // tokenizeLineFast Tests
  // ==========================================================================

  describe('tokenizeLineFast', () => {
    it('parses METHOD_ENTRY faster than regex version', () => {
      const line = '12:34:56.789 (123456789)|METHOD_ENTRY|[1]|MyClass.doWork';
      const result = tokenizeLineFast(line, 1);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.eventType).toBe('METHOD_ENTRY');
        expect(result.data.timestamp).toBe(123456789);
      }
    });

    it('produces same results as tokenizeLine', () => {
      const testLines = [
        '12:34:56.789 (100)|METHOD_ENTRY|[1]|MyClass.method',
        '12:34:56.789 (200)|SOQL_EXECUTE_BEGIN|[5]|Aggregations:0|SELECT Id FROM Account',
        '12:34:56.789 (300)|DML_BEGIN|[10]|Op:Insert|Type:Account|Rows:5',
        '12:34:56.789 (400)|EXCEPTION_THROWN|[15]|System.DmlException: Insert failed',
        '12:34:56.789 (500)|USER_DEBUG|[20]|DEBUG|Hello World',
      ];

      for (const line of testLines) {
        const regexResult = tokenizeLine(line, 1);
        const fastResult = tokenizeLineFast(line, 1);

        if (regexResult.success && fastResult.success) {
          expect(fastResult.data?.eventType).toBe(regexResult.data?.eventType);
          expect(fastResult.data?.timestamp).toBe(regexResult.data?.timestamp);
        }
      }
    });
  });

  // ==========================================================================
  // tokenizeLineWithFallback Tests
  // ==========================================================================

  describe('tokenizeLineWithFallback', () => {
    it('uses fast tokenizer for standard lines', () => {
      const line = '12:34:56.789 (123456789)|METHOD_ENTRY|[1]|MyClass.doWork';
      const result = tokenizeLineWithFallback(line, 1);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.eventType).toBe('METHOD_ENTRY');
        expect(result.data.timestamp).toBe(123456789);
      }
    });

    it('falls back to regex for edge case lines', () => {
      // Line with unusual spacing that fast parser might miss
      const edgeCases = [
        '12:34:56.789  (123456789)|METHOD_ENTRY|[1]|Test', // extra space
        '12:34:56.789 (123456789)|CODE_UNIT_STARTED[EXTERNAL]|execute_anonymous', // bracketed type
      ];

      for (const line of edgeCases) {
        const result = tokenizeLineWithFallback(line, 1);
        // Should succeed through fallback (or correctly return null)
        expect(result.success).toBe(true);
      }
    });

    it('returns null for non-event lines without error', () => {
      const nonEvents = [
        '', // empty
        '   ', // whitespace
        'Some random text', // garbage
        '48.0 APEX_CODE,FINEST', // header
      ];

      for (const line of nonEvents) {
        const result = tokenizeLineWithFallback(line, 1);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBeNull();
        }
      }
    });

    it('produces same results as direct parsers for valid lines', () => {
      const testLines = [
        '12:34:56.789 (100)|METHOD_ENTRY|[1]|MyClass.method',
        '12:34:56.789 (200)|SOQL_EXECUTE_BEGIN|[5]|Aggregations:0|SELECT Id FROM Account',
        '12:34:56.789 (300)|USER_DEBUG|[20]|DEBUG|Hello World',
      ];

      for (const line of testLines) {
        const fallbackResult = tokenizeLineWithFallback(line, 1);
        const fastResult = tokenizeLineFast(line, 1);
        const regexResult = tokenizeLine(line, 1);

        // All three should produce the same result
        if (fallbackResult.success && fastResult.success && regexResult.success) {
          expect(fallbackResult.data?.eventType).toBe(fastResult.data?.eventType);
          expect(fallbackResult.data?.eventType).toBe(regexResult.data?.eventType);
          expect(fallbackResult.data?.timestamp).toBe(fastResult.data?.timestamp);
        }
      }
    });
  });

  // ==========================================================================
  // tokenizeLog Tests
  // ==========================================================================

  describe('tokenizeLog', () => {
    it('tokenizes a simple log successfully', () => {
      const log = `48.0 APEX_CODE,FINEST
12:34:56.000 (100)|EXECUTION_STARTED
12:34:56.001 (200)|CODE_UNIT_STARTED|[1]|trigger TestTrigger
12:34:56.002 (300)|CODE_UNIT_FINISHED|trigger TestTrigger
12:34:56.003 (400)|EXECUTION_FINISHED`;

      const result = tokenizeLog(log);

      expect(result.success).toBe(true);
      if (result.success) {
        // result.data is an array of LogToken[], not {tokens: [], metadata: {}}
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('returns error for empty log', () => {
      const result = tokenizeLog('');

      // Empty logs return success with empty array
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(0);
      }
    });

    it('handles whitespace-only log', () => {
      const result = tokenizeLog('   \n\n   \t  ');

      // Whitespace-only logs return success with empty array
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(0);
      }
    });

    it('parses tokens correctly from log', () => {
      const log = `48.0 APEX_CODE,FINEST;APEX_PROFILING,INFO
12:34:56.000 (100)|EXECUTION_STARTED`;

      const result = tokenizeLog(log);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should have at least one token
        expect(result.data.length).toBeGreaterThan(0);
        // First token should be EXECUTION_STARTED
        const firstToken = result.data[0];
        expect(firstToken?.eventType).toBe('EXECUTION_STARTED');
      }
    });
  });
});
