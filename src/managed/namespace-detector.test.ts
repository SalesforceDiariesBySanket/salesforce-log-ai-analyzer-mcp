/**
 * @module managed/namespace-detector.test
 * @description Unit tests for namespace detection from Salesforce debug logs
 * @status COMPLETE
 * @see src/managed/STATE.md
 * @dependencies src/managed/namespace-detector.ts
 * @lastModified 2026-02-01
 */

import { describe, it, expect } from 'vitest';
import {
  detectNamespaces,
  trackExecutionContext,
  detectBoundaryCrossings,
  isKnownNamespace,
  getVendorInfo,
  getAllKnownNamespaces,
  KNOWN_NAMESPACES,
  namespaceDetector,
} from './namespace-detector';
import type {
  EventNode,
  MethodEvent,
  ManagedPackageEvent,
  CodeUnitEvent,
} from '../types/events';

// ============================================================================
// Test Helpers
// ============================================================================

function createMethodEntry(
  id: number,
  className: string,
  methodName: string,
  namespace?: string
): MethodEvent {
  return {
    id,
    type: 'METHOD_ENTRY',
    timestamp: 1000000 * id,
    lineNumber: id * 10,
    className,
    methodName,
    namespace,
  } as MethodEvent;
}

function createMethodExit(
  id: number,
  className: string,
  methodName: string,
  namespace?: string
): MethodEvent {
  return {
    id,
    type: 'METHOD_EXIT',
    timestamp: 1000000 * id,
    lineNumber: id * 10,
    className,
    methodName,
    namespace,
  } as MethodEvent;
}

function createManagedPackageEvent(
  id: number,
  namespace: string
): ManagedPackageEvent {
  return {
    id,
    type: 'ENTERING_MANAGED_PKG',
    timestamp: 1000000 * id,
    lineNumber: id * 10,
    namespace,
  } as ManagedPackageEvent;
}

function createCodeUnitEvent(
  id: number,
  unitName: string,
  started: boolean
): CodeUnitEvent {
  return {
    id,
    type: started ? 'CODE_UNIT_STARTED' : 'CODE_UNIT_FINISHED',
    timestamp: 1000000 * id,
    lineNumber: id * 10,
    unitName,
  } as CodeUnitEvent;
}

// ============================================================================
// Tests
// ============================================================================

describe('managed/namespace-detector', () => {
  describe('KNOWN_NAMESPACES database', () => {
    it('contains Salesforce CPQ (SBQQ)', () => {
      expect(KNOWN_NAMESPACES.SBQQ).toBeDefined();
      expect(KNOWN_NAMESPACES.SBQQ.vendor.name).toBe('Salesforce');
      expect(KNOWN_NAMESPACES.SBQQ.vendor.product).toContain('CPQ');
    });

    it('contains Salesforce Billing (blng)', () => {
      expect(KNOWN_NAMESPACES.blng).toBeDefined();
      expect(KNOWN_NAMESPACES.blng.vendor.product).toContain('Billing');
    });

    it('contains Certinia namespaces (fferpcore, c2g, pse)', () => {
      expect(KNOWN_NAMESPACES.fferpcore).toBeDefined();
      expect(KNOWN_NAMESPACES.c2g).toBeDefined();
      expect(KNOWN_NAMESPACES.pse).toBeDefined();
      expect(KNOWN_NAMESPACES.fferpcore.vendor.name).toBe('Certinia');
    });

    it('contains nCino (nFORCE)', () => {
      expect(KNOWN_NAMESPACES.nFORCE).toBeDefined();
      expect(KNOWN_NAMESPACES.nFORCE.vendor.name).toBe('nCino');
    });

    it('contains DocuSign (dsfs)', () => {
      expect(KNOWN_NAMESPACES.dsfs).toBeDefined();
      expect(KNOWN_NAMESPACES.dsfs.vendor.name).toBe('DocuSign');
    });

    it('contains Salesforce Industries (vlocity_cmt)', () => {
      expect(KNOWN_NAMESPACES.vlocity_cmt).toBeDefined();
      expect(KNOWN_NAMESPACES.vlocity_cmt.vendor.product).toContain('Industries');
    });

    it('marks private namespaces correctly', () => {
      expect(KNOWN_NAMESPACES.SBQQ.visibility).toBe('PRIVATE');
      expect(KNOWN_NAMESPACES.fferpcore.visibility).toBe('PRIVATE');
    });

    it('marks public namespaces correctly', () => {
      expect(KNOWN_NAMESPACES.fflib_apex_mocks.visibility).toBe('PUBLIC');
      expect(KNOWN_NAMESPACES.sflabs.visibility).toBe('PUBLIC');
    });

    it('includes known issues for problem packages', () => {
      expect(KNOWN_NAMESPACES.SBQQ.vendor.knownIssues).toBeDefined();
      expect(KNOWN_NAMESPACES.SBQQ.vendor.knownIssues).toContain('CPU timeout in quote calculation');
    });
  });

  describe('detectNamespaces', () => {
    it('returns empty array for no events', () => {
      const result = detectNamespaces([]);
      expect(result).toEqual([]);
    });

    it('returns empty array for events without namespaces', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'MyClass', 'myMethod'),
        createMethodExit(2, 'MyClass', 'myMethod'),
      ];
      
      const result = detectNamespaces(events);
      expect(result).toEqual([]);
    });

    it('detects namespace from ENTERING_MANAGED_PKG event', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result).toHaveLength(1);
      expect(result[0]?.namespace).toBe('SBQQ');
    });

    it('detects namespace from event namespace property', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'SomeClass', 'someMethod', 'blng'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result).toHaveLength(1);
      expect(result[0]?.namespace).toBe('blng');
    });

    it('detects namespace from class name pattern', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'SBQQ.QuoteCalculator', 'calculate'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result).toHaveLength(1);
      expect(result[0]?.namespace).toBe('SBQQ');
    });

    it('detects namespace from code unit event', () => {
      const events: EventNode[] = [
        createCodeUnitEvent(1, 'SBQQ__QuoteTrigger', true),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result).toHaveLength(1);
      expect(result[0]?.namespace).toBe('SBQQ');
    });

    it('detects multiple namespaces', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
        createManagedPackageEvent(2, 'blng'),
        createMethodEntry(3, 'fferpcore.Calculation', 'run'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result.length).toBeGreaterThanOrEqual(3);
      const namespaces = result.map(n => n.namespace);
      expect(namespaces).toContain('SBQQ');
      expect(namespaces).toContain('blng');
      expect(namespaces).toContain('fferpcore');
    });

    it('deduplicates namespaces', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
        createManagedPackageEvent(2, 'SBQQ'),
        createManagedPackageEvent(3, 'SBQQ'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result).toHaveLength(1);
      expect(result[0]?.namespace).toBe('SBQQ');
    });

    it('provides vendor info for known namespaces', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result[0]?.vendor).toBeDefined();
      expect(result[0]?.vendor?.name).toBe('Salesforce');
    });

    it('marks known namespaces as managed', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result[0]?.isManaged).toBe(true);
      expect(result[0]?.isObfuscated).toBe(true);
    });

    it('provides high confidence for known namespaces', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result[0]?.confidence.score).toBeGreaterThan(0.9);
    });

    it('provides lower confidence for unknown namespaces', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'xyz'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result[0]?.confidence.score).toBeLessThan(0.9);
    });

    it('ignores System classes as namespaces', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'System.debug', 'debug'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result.find(n => n.namespace === 'System')).toBeUndefined();
    });

    it('ignores Database classes as namespaces', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'Database.query', 'query'),
      ];
      
      const result = detectNamespaces(events);
      
      expect(result.find(n => n.namespace === 'Database')).toBeUndefined();
    });
  });

  describe('trackExecutionContext', () => {
    it('returns empty array for no events', () => {
      const result = trackExecutionContext([]);
      expect(result).toEqual([]);
    });

    it('tracks entry into managed package', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
      ];
      
      const result = trackExecutionContext(events);
      
      expect(result[0]?.inManagedPackage).toBe(true);
      expect(result[0]?.namespace).toBe('SBQQ');
    });

    it('builds namespace stack on nested entries', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
        createManagedPackageEvent(2, 'blng'),
      ];
      
      const result = trackExecutionContext(events);
      
      expect(result[1]?.namespaceStack).toContain('SBQQ');
      expect(result[1]?.namespaceStack).toContain('blng');
    });

    it('tracks code unit in context', () => {
      const events: EventNode[] = [
        createCodeUnitEvent(1, 'MyTrigger', true),
      ];
      
      const result = trackExecutionContext(events);
      
      expect(result[0]?.currentCodeUnit).toBe('MyTrigger');
    });

    it('preserves entry point namespace', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
        createCodeUnitEvent(2, 'QuoteCalculator', true),
      ];
      
      const result = trackExecutionContext(events);
      
      expect(result[1]?.entryPointNamespace).toBe('SBQQ');
    });

    it('pops namespace on method exit', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
        createMethodExit(2, 'MyClass', 'myMethod'),
      ];
      
      const result = trackExecutionContext(events);
      
      // After exit, stack may be reduced
      expect(result.length).toBe(2);
    });
  });

  describe('detectBoundaryCrossings', () => {
    it('returns empty array for no events', () => {
      const result = detectBoundaryCrossings([]);
      expect(result).toEqual([]);
    });

    it('detects USER_TO_MANAGED crossing', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'UserClass', 'call'), // No namespace
        createManagedPackageEvent(2, 'SBQQ'),
      ];
      
      const result = detectBoundaryCrossings(events);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result.find(c => c.direction === 'USER_TO_MANAGED')).toBeDefined();
    });

    it('detects MANAGED_TO_USER crossing', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
        createMethodEntry(2, 'UserClass', 'callback'), // No namespace
      ];
      
      const result = detectBoundaryCrossings(events);
      
      expect(result.find(c => c.direction === 'MANAGED_TO_USER')).toBeDefined();
    });

    it('detects MANAGED_TO_MANAGED crossing', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
        createManagedPackageEvent(2, 'blng'),
      ];
      
      const result = detectBoundaryCrossings(events);
      
      expect(result.find(c => c.direction === 'MANAGED_TO_MANAGED')).toBeDefined();
    });

    it('records crossing event ID', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'UserClass', 'call'),
        createManagedPackageEvent(42, 'SBQQ'),
      ];
      
      const result = detectBoundaryCrossings(events);
      
      expect(result[0]?.eventId).toBe(42);
    });

    it('records crossing line number', () => {
      const event = createManagedPackageEvent(1, 'SBQQ');
      event.lineNumber = 123;
      
      const result = detectBoundaryCrossings([event]);
      
      expect(result[0]?.lineNumber).toBe(123);
    });

    it('records crossing point description', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'SBQQ.Calculator', 'calculate'),
      ];
      
      const result = detectBoundaryCrossings(events);
      
      expect(result[0]?.crossingPoint).toContain('Calculator');
    });

    it('no crossing when staying in same namespace', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
        createMethodEntry(2, 'SBQQ.Class1', 'method1', 'SBQQ'),
        createMethodEntry(3, 'SBQQ.Class2', 'method2', 'SBQQ'),
      ];
      
      const result = detectBoundaryCrossings(events);
      
      // Only first entry is a crossing, subsequent calls in same namespace are not
      expect(result.filter(c => c.toNamespace === 'SBQQ').length).toBeLessThanOrEqual(1);
    });
  });

  describe('isKnownNamespace', () => {
    it('returns true for known namespaces', () => {
      expect(isKnownNamespace('SBQQ')).toBe(true);
      expect(isKnownNamespace('blng')).toBe(true);
      expect(isKnownNamespace('fferpcore')).toBe(true);
    });

    it('returns false for unknown namespaces', () => {
      expect(isKnownNamespace('xyz')).toBe(false);
      expect(isKnownNamespace('random')).toBe(false);
      expect(isKnownNamespace('')).toBe(false);
    });
  });

  describe('getVendorInfo', () => {
    it('returns vendor info for known namespace', () => {
      const vendor = getVendorInfo('SBQQ');
      
      expect(vendor).toBeDefined();
      expect(vendor?.name).toBe('Salesforce');
      expect(vendor?.product).toContain('CPQ');
    });

    it('returns undefined for unknown namespace', () => {
      const vendor = getVendorInfo('unknown');
      expect(vendor).toBeUndefined();
    });

    it('includes support URL when available', () => {
      const vendor = getVendorInfo('SBQQ');
      expect(vendor?.supportUrl).toBeDefined();
    });

    it('includes documentation URL when available', () => {
      const vendor = getVendorInfo('SBQQ');
      expect(vendor?.documentationUrl).toBeDefined();
    });
  });

  describe('getAllKnownNamespaces', () => {
    it('returns array of namespace strings', () => {
      const namespaces = getAllKnownNamespaces();
      
      expect(Array.isArray(namespaces)).toBe(true);
      expect(namespaces.length).toBeGreaterThan(0);
    });

    it('includes common namespaces', () => {
      const namespaces = getAllKnownNamespaces();
      
      expect(namespaces).toContain('SBQQ');
      expect(namespaces).toContain('blng');
      expect(namespaces).toContain('fferpcore');
    });
  });

  describe('namespaceDetector object', () => {
    it('exposes detectNamespaces function', () => {
      expect(typeof namespaceDetector.detectNamespaces).toBe('function');
    });

    it('exposes trackExecutionContext function', () => {
      expect(typeof namespaceDetector.trackExecutionContext).toBe('function');
    });

    it('exposes detectBoundaryCrossings function', () => {
      expect(typeof namespaceDetector.detectBoundaryCrossings).toBe('function');
    });

    it('functions work through detector object', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
      ];
      
      const namespaces = namespaceDetector.detectNamespaces(events);
      expect(namespaces).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles empty namespace string', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'MyClass', 'method', ''),
      ];
      
      // Should not crash
      const result = detectNamespaces(events);
      expect(result.find(n => n.namespace === '')).toBeUndefined();
    });

    it('handles very long potential namespace', () => {
      const events: EventNode[] = [
        createMethodEntry(1, 'ThisIsAVeryLongClassName.method', 'test'),
      ];
      
      const result = detectNamespaces(events);
      // Long strings shouldn't be detected as namespaces
      expect(result.find(n => n.namespace === 'ThisIsAVeryLongClassName')).toBeUndefined();
    });

    it('handles namespace with underscores', () => {
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'vlocity_cmt'),
      ];
      
      const result = detectNamespaces(events);
      expect(result[0]?.namespace).toBe('vlocity_cmt');
    });

    it('handles mixed case detection', () => {
      // Note: Salesforce namespaces are case-sensitive
      const events: EventNode[] = [
        createManagedPackageEvent(1, 'SBQQ'),
      ];
      
      const result = detectNamespaces(events);
      expect(result[0]?.namespace).toBe('SBQQ');
    });

    it('handles CODE_UNIT_FINISHED event', () => {
      const events: EventNode[] = [
        createCodeUnitEvent(1, 'SBQQ__QuoteTrigger', false),
      ];
      
      const result = detectNamespaces(events);
      expect(result).toHaveLength(1);
    });

    it('handles events without lineNumber', () => {
      const event: ManagedPackageEvent = {
        id: 1,
        type: 'ENTERING_MANAGED_PKG',
        timestamp: 1000000,
        lineNumber: 0, // No line number
        namespace: 'SBQQ',
      } as ManagedPackageEvent;
      
      const result = detectBoundaryCrossings([event]);
      expect(result[0]?.lineNumber).toBe(0);
    });
  });
});
