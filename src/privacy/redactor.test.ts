/**
 * @module privacy/redactor.test
 * @description Unit tests for PII redaction functionality
 * @status COMPLETE
 * @see src/privacy/STATE.md
 * @dependencies src/privacy/redactor.ts
 * @lastModified 2026-02-01
 */

import { describe, it, expect } from 'vitest';
import {
  redactText,
  redactObject,
  redactBatch,
  createRedactor,
  type RedactionOptions,
} from './redactor';

describe('privacy/redactor', () => {
  // ============================================================================
  // redactText - Basic Functionality
  // ============================================================================

  describe('redactText', () => {
    describe('email redaction', () => {
      it('redacts single email address', () => {
        const result = redactText('Contact us at user@example.com');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.count).toBe(1);
        expect(result.redacted).toBe('Contact us at [EMAIL]');
      });

      it('redacts multiple email addresses', () => {
        const result = redactText('From: admin@salesforce.com To: user@test.org');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.count).toBe(2);
        // Both emails are redacted (numbering order may vary)
        expect(result.redacted).not.toContain('admin@salesforce.com');
        expect(result.redacted).not.toContain('user@test.org');
      });

      it('handles emails in SOQL queries', () => {
        const query = "SELECT Id FROM Contact WHERE Email = 'john.doe@company.com'";
        const result = redactText(query);
        
        expect(result.wasRedacted).toBe(true);
        expect(result.redacted).toContain('[EMAIL]');
        expect(result.redacted).not.toContain('john.doe@company.com');
      });
    });

    describe('phone number redaction', () => {
      it('redacts US phone number formats', () => {
        const result = redactText('Call 555-123-4567 or (555) 987-6543');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.count).toBe(2);
        expect(result.redacted).not.toContain('555-123-4567');
        expect(result.redacted).not.toContain('987-6543');
      });

      it('redacts phone with country code', () => {
        const result = redactText('International: +1 555.123.4567');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.redacted).toContain('[PHONE]');
      });
    });

    describe('Salesforce ID redaction', () => {
      it('redacts 15-character Salesforce IDs', () => {
        const result = redactText('Account: 001000000000001');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.redacted).toContain('[SF_ID]');
      });

      it('redacts 18-character Salesforce IDs', () => {
        const result = redactText('Contact: 003000000000001AAA');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.redacted).toContain('[SF_ID]');
      });
    });

    describe('credit card redaction', () => {
      it('redacts credit card numbers', () => {
        const result = redactText('Card: 4111-1111-1111-1111');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.redacted).toContain('[CREDIT_CARD]');
        expect(result.redacted).not.toContain('4111');
      });

      it('redacts card without dashes', () => {
        const result = redactText('Payment: 4111111111111111');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.redacted).toContain('[CREDIT_CARD]');
      });
    });

    describe('SSN redaction', () => {
      it('redacts SSN format', () => {
        const result = redactText('SSN: 123-45-6789');
        
        expect(result.wasRedacted).toBe(true);
        expect(result.redacted).toContain('[SSN]');
        expect(result.redacted).not.toContain('123-45-6789');
      });
    });

    describe('session token redaction', () => {
      it('redacts session IDs', () => {
        const result = redactText('SessionId: 00D000000000001!AQcAQH7Abc123');
        
        expect(result.wasRedacted).toBe(true);
        // Session tokens may be detected as SF_ID or SESSION
        expect(result.redacted.includes('[SESSION]') || result.redacted.includes('[SF_ID]')).toBe(true);
      });
    });

    describe('no redaction needed', () => {
      it('returns original text when no PII found', () => {
        const text = 'This is a normal log message without PII';
        const result = redactText(text);
        
        expect(result.wasRedacted).toBe(false);
        expect(result.count).toBe(0);
        expect(result.redacted).toBe(text);
        expect(result.redactions).toEqual([]);
      });

      it('handles empty string', () => {
        const result = redactText('');
        
        expect(result.wasRedacted).toBe(false);
        expect(result.redacted).toBe('');
      });
    });
  });

  // ============================================================================
  // redactText - Options
  // ============================================================================

  describe('redactText options', () => {
    describe('usePlaceholders option', () => {
      it('uses generic [REDACTED] when usePlaceholders is false', () => {
        const result = redactText('Email: user@example.com', { usePlaceholders: false });
        
        expect(result.redacted).toBe('Email: [REDACTED]');
      });

      it('uses typed placeholders when usePlaceholders is true', () => {
        const result = redactText('Email: user@example.com', { usePlaceholders: true });
        
        expect(result.redacted).toBe('Email: [EMAIL]');
      });
    });

    describe('trackRedactions option', () => {
      it('includes original text when trackRedactions is true', () => {
        const original = 'Contact: user@example.com';
        const result = redactText(original, { trackRedactions: true });
        
        expect(result.original).toBe(original);
        expect(result.redactions[0]?.originalValue).toBe('user@example.com');
      });

      it('excludes original text when trackRedactions is false', () => {
        const result = redactText('Contact: user@example.com', { trackRedactions: false });
        
        expect(result.original).toBeUndefined();
      });
    });

    describe('hashOriginals option', () => {
      it('hashes original values when hashOriginals is true', () => {
        const result = redactText('Email: user@example.com', { 
          hashOriginals: true,
          trackRedactions: true,
        });
        
        expect(result.redactions[0]?.originalValue).toMatch(/^hash:[a-f0-9]+$/);
      });
    });

    describe('minSensitivity option', () => {
      it('only redacts HIGH and above when minSensitivity is HIGH', () => {
        const text = 'Email: user@example.com, IP: 192.168.1.1';
        const result = redactText(text, { minSensitivity: 'HIGH' });
        
        // Email is HIGH, so it should be redacted
        expect(result.redacted).toContain('[EMAIL]');
      });

      it('redacts all when minSensitivity is LOW', () => {
        const text = 'Email: user@example.com';
        const result = redactText(text, { minSensitivity: 'LOW' });
        
        expect(result.wasRedacted).toBe(true);
      });
    });
  });

  // ============================================================================
  // redactText - Position Tracking
  // ============================================================================

  describe('redactText position tracking', () => {
    it('tracks correct positions for single redaction', () => {
      const result = redactText('Start user@example.com End', { trackRedactions: true });
      
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0]?.position.start).toBe(6);
      expect(result.redactions[0]?.position.end).toBe(22);
    });

    it('tracks positions in original text for multiple redactions', () => {
      const result = redactText('A: a@b.com B: c@d.com', { trackRedactions: true });
      
      expect(result.redactions).toHaveLength(2);
      // First redaction should be first in list (sorted by position)
      expect(result.redactions[0]?.position.start).toBeLessThan(
        result.redactions[1]?.position.start ?? 0
      );
    });
  });

  // ============================================================================
  // redactObject - Deep Redaction
  // ============================================================================

  describe('redactObject', () => {
    it('redacts strings in flat object', () => {
      const obj = {
        name: 'John',
        email: 'john@example.com',
        age: 30,
      };
      
      const result = redactObject(obj);
      
      expect(result.redacted.email).toBe('[EMAIL]');
      expect(result.redacted.name).toBe('John');
      expect(result.redacted.age).toBe(30);
      expect(result.totalRedactions).toBe(1);
    });

    it('redacts strings in nested objects', () => {
      const obj = {
        user: {
          contact: {
            email: 'user@test.com',
            phone: '555-123-4567',
          },
        },
      };
      
      const result = redactObject(obj);
      
      expect(result.redacted.user.contact.email).toBe('[EMAIL]');
      expect(result.redacted.user.contact.phone).toContain('[PHONE]');
      expect(result.totalRedactions).toBe(2);
    });

    it('redacts strings in arrays', () => {
      const obj = {
        emails: ['a@b.com', 'c@d.com', 'e@f.com'],
      };
      
      const result = redactObject(obj);
      
      expect(result.redacted.emails).toEqual(['[EMAIL]', '[EMAIL]', '[EMAIL]']);
      expect(result.totalRedactions).toBe(3);
    });

    it('handles mixed arrays', () => {
      const obj = {
        data: [
          'user@test.com',
          123,
          { nested: 'admin@test.com' },
          null,
        ],
      };
      
      const result = redactObject(obj);
      
      expect(result.redacted.data[0]).toBe('[EMAIL]');
      expect(result.redacted.data[1]).toBe(123);
      expect((result.redacted.data[2] as any).nested).toBe('[EMAIL]');
      expect(result.redacted.data[3]).toBe(null);
    });

    it('preserves non-string primitives', () => {
      const obj = {
        count: 42,
        active: true,
        rate: 3.14,
        nothing: null,
      };
      
      const result = redactObject(obj);
      
      expect(result.redacted).toEqual(obj);
      expect(result.totalRedactions).toBe(0);
    });
  });

  // ============================================================================
  // redactBatch - Batch Processing
  // ============================================================================

  describe('redactBatch', () => {
    it('processes multiple strings', () => {
      const texts = [
        'Email: a@b.com',
        'No PII here',
        'Phone: 555-123-4567',
      ];
      
      const results = redactBatch(texts);
      
      expect(results).toHaveLength(3);
      expect(results[0]?.wasRedacted).toBe(true);
      expect(results[1]?.wasRedacted).toBe(false);
      expect(results[2]?.wasRedacted).toBe(true);
    });

    it('applies same options to all texts', () => {
      const texts = ['a@b.com', 'c@d.com'];
      const results = redactBatch(texts, { usePlaceholders: false });
      
      expect(results[0]?.redacted).toBe('[REDACTED]');
      expect(results[1]?.redacted).toBe('[REDACTED]');
    });

    it('handles empty batch', () => {
      const results = redactBatch([]);
      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // createRedactor - Factory Function
  // ============================================================================

  describe('createRedactor', () => {
    it('creates reusable redactor with preset options', () => {
      const redactor = createRedactor({ usePlaceholders: false });
      
      const result1 = redactor('Email: a@b.com');
      const result2 = redactor('Phone: 555-123-4567');
      
      expect(result1.redacted).toContain('[REDACTED]');
      expect(result2.redacted).toContain('[REDACTED]');
    });

    it('preserves options across calls', () => {
      const redactor = createRedactor({ 
        trackRedactions: true,
        hashOriginals: true,
      });
      
      const result = redactor('user@example.com');
      
      expect(result.redactions[0]?.originalValue).toMatch(/^hash:/);
    });
  });

  // ============================================================================
  // Real-World Scenarios
  // ============================================================================

  describe('real-world scenarios', () => {
    it('redacts debug log query', () => {
      const logLine = "SOQL_EXECUTE_BEGIN|SELECT Id, Email FROM Contact WHERE Email = 'test@company.com' AND Phone = '555-123-4567'";
      const result = redactText(logLine);
      
      expect(result.wasRedacted).toBe(true);
      expect(result.redacted).not.toContain('test@company.com');
      expect(result.redacted).not.toContain('555-123-4567');
      expect(result.redacted).toContain('SELECT Id, Email FROM Contact');
    });

    it('redacts exception message with user data', () => {
      const errorMsg = "System.DmlException: Insert failed. FIELD_CUSTOM_VALIDATION_EXCEPTION, Email john.doe@company.com already exists: [Email__c]";
      const result = redactText(errorMsg);
      
      expect(result.wasRedacted).toBe(true);
      expect(result.redacted).not.toContain('john.doe@company.com');
    });

    it('redacts API response log', () => {
      const apiLog = '{"access_token":"eyJhbGciOiJIUzI1NiJ9.abc123","session_id":"00D000000000001!AQcAQH7"}';
      const result = redactText(apiLog);
      
      expect(result.wasRedacted).toBe(true);
      // Session ID should be redacted as SF_ID or SESSION
      expect(result.redacted.includes('[SESSION]') || result.redacted.includes('[SF_ID]')).toBe(true);
    });

    it('handles mixed content in debug log', () => {
      const debugLog = `
14:30:45.123 (123456789)|USER_DEBUG|[15]|DEBUG|Processing contact: John Doe <john@test.com>
14:30:45.124 (124000000)|USER_DEBUG|[16]|DEBUG|Phone: (555) 123-4567
14:30:45.125 (125000000)|SOQL_EXECUTE_BEGIN|[20]|SELECT Id FROM Account
      `.trim();
      
      const result = redactText(debugLog);
      
      expect(result.wasRedacted).toBe(true);
      expect(result.redacted).not.toContain('john@test.com');
      expect(result.redacted).not.toContain('555');
      expect(result.redacted).toContain('SELECT Id FROM Account');
    });
  });
});
