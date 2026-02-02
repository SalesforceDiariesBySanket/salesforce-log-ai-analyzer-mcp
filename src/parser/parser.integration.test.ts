/**
 * @module parser/parser.integration.test
 * @description Integration tests for the parser module using fixture files
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/parser/index.ts, __fixtures__/logs
 * @lastModified 2026-02-01
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseLog } from './index';

// Fixture paths
const FIXTURES_DIR = path.join(__dirname, '../../__fixtures__/logs');

describe('Parser Integration Tests', () => {
  describe('parseLog with simple/success.log', () => {
    const logPath = path.join(FIXTURES_DIR, 'simple/success.log');
    
    // Skip if fixture doesn't exist
    const fixtureExists = fs.existsSync(logPath);
    
    it.skipIf(!fixtureExists)('parses the fixture file successfully', () => {
      const content = fs.readFileSync(logPath, 'utf-8');
      const result = parseLog(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.events.length).toBeGreaterThan(0);
        expect(result.data.stats.eventCount).toBeGreaterThan(0);
      }
    });

    it.skipIf(!fixtureExists)('extracts correct metadata', () => {
      const content = fs.readFileSync(logPath, 'utf-8');
      const result = parseLog(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.apiVersion).toBe('48.0');
        expect(result.data.metadata.debugLevels).toBeDefined();
        expect(result.data.metadata.debugLevels?.APEX_CODE).toBe('FINEST');
      }
    });

    it.skipIf(!fixtureExists)('identifies SOQL and DML events', () => {
      const content = fs.readFileSync(logPath, 'utf-8');
      const result = parseLog(content);

      expect(result.success).toBe(true);
      if (result.success) {
        const { eventsByType } = result.data.stats;
        
        // The fixture should have SOQL and DML events
        expect(eventsByType['SOQL_EXECUTE_BEGIN']).toBeGreaterThanOrEqual(1);
        expect(eventsByType['DML_BEGIN']).toBeGreaterThanOrEqual(1);
      }
    });

    it.skipIf(!fixtureExists)('marks non-truncated logs correctly', () => {
      const content = fs.readFileSync(logPath, 'utf-8');
      const result = parseLog(content);

      expect(result.success).toBe(true);
      if (result.success) {
        // Simple success log should NOT be truncated
        expect(result.data.truncation).toBeUndefined();
      }
    });

    it.skipIf(!fixtureExists)('has reasonable parse confidence', () => {
      const content = fs.readFileSync(logPath, 'utf-8');
      const result = parseLog(content);

      expect(result.success).toBe(true);
      if (result.success) {
        // Fixture log has many non-event lines (limit stats), so confidence is lower
        // Just ensure it's above a minimum threshold (not 0)
        expect(result.data.confidence.score).toBeGreaterThan(0.3);
      }
    });
  });

  describe('parseLog error handling', () => {
    it('returns error for empty content', () => {
      const result = parseLog('');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMPTY_LOG');
      }
    });

    it('returns error for whitespace-only content', () => {
      const result = parseLog('   \n\n  \t  ');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMPTY_LOG');
      }
    });

    it('returns error for garbage content', () => {
      const result = parseLog('This is not a Salesforce debug log at all.');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FORMAT');
      }
    });
  });

  describe('parseLog with inline content', () => {
    it('parses minimal valid log', () => {
      const minimalLog = `48.0 APEX_CODE,DEBUG
12:00:00.000 (1000)|EXECUTION_STARTED
12:00:00.001 (2000)|EXECUTION_FINISHED`;

      const result = parseLog(minimalLog);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.events.length).toBe(2);
        expect(result.data.events[0]?.type).toBe('EXECUTION_STARTED');
        expect(result.data.events[1]?.type).toBe('EXECUTION_FINISHED');
      }
    });

    it('handles logs with exceptions', () => {
      const exceptionLog = `48.0 APEX_CODE,FINEST
12:00:00.000 (1000)|EXECUTION_STARTED
12:00:00.001 (2000)|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex
12:00:00.002 (3000)|EXCEPTION_THROWN|[5]|System.NullPointerException: Attempt to de-reference a null object
12:00:00.003 (4000)|FATAL_ERROR|System.NullPointerException: Attempt to de-reference a null object
12:00:00.004 (5000)|CODE_UNIT_FINISHED|execute_anonymous_apex
12:00:00.005 (6000)|EXECUTION_FINISHED`;

      const result = parseLog(exceptionLog);

      expect(result.success).toBe(true);
      if (result.success) {
        const exceptionEvents = result.data.events.filter(
          e => e.type === 'EXCEPTION_THROWN' || e.type === 'FATAL_ERROR'
        );
        expect(exceptionEvents.length).toBe(2);
      }
    });

    it('handles logs with SOQL in loops (SOQL_101 pattern)', () => {
      // Generate a log with SOQL in a loop pattern
      const lines = [
        '48.0 APEX_CODE,FINEST',
        '12:00:00.000 (1000)|EXECUTION_STARTED',
        '12:00:00.001 (2000)|CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex',
      ];

      // Add 10 SOQL queries in a "loop"
      for (let i = 0; i < 10; i++) {
        const ts = 3000 + i * 100;
        lines.push(`12:00:00.${String(i + 2).padStart(3, '0')} (${ts})|SOQL_EXECUTE_BEGIN|[${i + 5}]|Aggregations:0|SELECT Id FROM Account WHERE Id = '001...'`);
        lines.push(`12:00:00.${String(i + 2).padStart(3, '0')} (${ts + 50})|SOQL_EXECUTE_END|[${i + 5}]|Rows:1`);
      }

      lines.push('12:00:00.999 (99000)|CODE_UNIT_FINISHED|execute_anonymous_apex');
      lines.push('12:00:01.000 (100000)|EXECUTION_FINISHED');

      const loopLog = lines.join('\n');
      const result = parseLog(loopLog);

      expect(result.success).toBe(true);
      if (result.success) {
        const soqlEvents = result.data.events.filter(e => e.type === 'SOQL_EXECUTE_BEGIN');
        expect(soqlEvents.length).toBe(10);
      }
    });
  });
});
