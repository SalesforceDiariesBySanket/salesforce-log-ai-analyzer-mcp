/**
 * @module parser/event-handlers/managed-pkg
 * @description Handler for ENTERING_MANAGED_PKG and related managed package events
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

import type {
  LogToken,
  ManagedPackageEvent,
  EventHandler,
  ParseContext,
  EventType,
} from '../../types';

// ============================================================================
// Managed Package Event Handler
// ============================================================================

/**
 * Parses managed package boundary events
 *
 * Log formats:
 * - ENTERING_MANAGED_PKG|namespace
 * - PUSH_TRACE_FLAGS|...
 * - POP_TRACE_FLAGS|...
 */
export const managedPackageEventHandler: EventHandler<ManagedPackageEvent> = {
  eventTypes: ['ENTERING_MANAGED_PKG', 'PUSH_TRACE_FLAGS', 'POP_TRACE_FLAGS'],

  canHandle(token: LogToken): boolean {
    return this.eventTypes.includes(token.eventType as EventType);
  },

  handle(token: LogToken, context: ParseContext): ManagedPackageEvent {
    const { segments } = token;

    // Extract namespace from first segment
    const namespace = segments[0]?.trim() || 'unknown';

    // Update context with current namespace
    if (token.eventType === 'ENTERING_MANAGED_PKG') {
      context.currentNamespace = namespace;
    }

    const event: ManagedPackageEvent = {
      id: context.nextId(),
      parentId: context.currentParentId,
      type: token.eventType as 'ENTERING_MANAGED_PKG',
      timestamp: token.timestamp,
      lineNumber: token.lineNumber,
      namespace,
    };

    return event;
  },
};

// ============================================================================
// Namespace Utilities
// ============================================================================

/**
 * Well-known Salesforce managed package namespaces
 */
export const KNOWN_NAMESPACES: Record<string, {
  vendor: string;
  product: string;
  supportUrl?: string;
}> = {
  // Salesforce Products
  SBQQ: { vendor: 'Salesforce', product: 'CPQ (Steelbrick)', supportUrl: 'https://help.salesforce.com/cpq' },
  fflib_apex_mocks: { vendor: 'Apex Mocks', product: 'Testing Framework' },
  fferpcore: { vendor: 'Certinia', product: 'Financial Force Core' },
  c2g: { vendor: 'Certinia', product: 'Financial Management' },
  pse: { vendor: 'Certinia', product: 'Professional Services Automation' },
  // Add more as encountered
};

/**
 * Check if a namespace is a known managed package
 */
export function isKnownManagedPackage(namespace: string): boolean {
  return namespace in KNOWN_NAMESPACES;
}

/**
 * Get vendor info for a namespace
 */
export function getVendorInfo(namespace: string): {
  vendor: string;
  product: string;
  supportUrl?: string;
} | null {
  return KNOWN_NAMESPACES[namespace] || null;
}

/**
 * Extract namespace from a fully qualified class name
 *
 * @example
 * extractNamespace("SBQQ__Quote__c") // "SBQQ"
 * extractNamespace("Account") // null
 * extractNamespace("MyClass") // null
 */
export function extractNamespace(identifier: string): string | null {
  // Namespace format: namespace__objectOrClass
  const match = /^([a-zA-Z0-9]+)__/.exec(identifier);
  return match && match[1] ? match[1] : null;
}

/**
 * Check if a class/object name has a namespace
 */
export function hasNamespace(identifier: string): boolean {
  return /^[a-zA-Z0-9]+__/.test(identifier);
}

/**
 * Remove namespace prefix from identifier
 */
export function stripNamespace(identifier: string): string {
  return identifier.replace(/^[a-zA-Z0-9]+__/, '');
}

// ============================================================================
// Attribution Helpers
// ============================================================================

/**
 * Determine if code is user-modifiable or vendor-managed
 */
export interface CodeAttribution {
  /** Is the code in a managed package */
  isManaged: boolean;
  /** Can the user modify this code */
  canModify: boolean;
  /** The namespace if managed */
  namespace?: string;
  /** The vendor if known */
  vendor?: string;
  /** Guidance for AI */
  aiGuidance: string;
}

/**
 * Determine attribution for a piece of code
 */
export function getCodeAttribution(namespace: string | undefined): CodeAttribution {
  if (!namespace) {
    return {
      isManaged: false,
      canModify: true,
      aiGuidance: 'This is user code and can be modified directly.',
    };
  }

  const vendorInfo = getVendorInfo(namespace);

  return {
    isManaged: true,
    canModify: false,
    namespace,
    vendor: vendorInfo?.vendor,
    aiGuidance: vendorInfo
      ? `This code is part of ${vendorInfo.product} by ${vendorInfo.vendor}. You cannot modify it directly. ` +
        (vendorInfo.supportUrl
          ? `For issues, contact support: ${vendorInfo.supportUrl}`
          : 'Contact the vendor for support.')
      : `This code is in the "${namespace}" managed package. You cannot modify it directly. Contact the package vendor for support.`,
  };
}
