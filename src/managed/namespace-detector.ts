/**
 * @module managed/namespace-detector
 * @description Detect and extract namespaces from Salesforce debug log events
 * @status COMPLETE
 * @see src/managed/STATE.md
 * @dependencies src/types/managed.ts, src/types/events.ts
 * @lastModified 2026-01-31
 */

import type {
  EventNode,
  MethodEvent,
  ManagedPackageEvent,
  CodeUnitEvent,
} from '../types/events';
import type {
  NamespaceInfo,
  NamespaceVisibility,
  NamespaceCategory,
  ExecutionContext,
  BoundaryCrossing,
  VendorInfo,
  NamespaceDetector,
} from '../types/managed';
import { confidence } from '../types/common';

// ============================================================================
// Known Namespace Database
// ============================================================================

/**
 * Database of known Salesforce managed package namespaces
 */
export const KNOWN_NAMESPACES: Record<string, {
  vendor: VendorInfo;
  category: NamespaceCategory;
  visibility: NamespaceVisibility;
}> = {
  // Salesforce CPQ (Steelbrick)
  SBQQ: {
    vendor: {
      name: 'Salesforce',
      product: 'Salesforce CPQ (Steelbrick)',
      supportUrl: 'https://help.salesforce.com/s/products/cpq',
      documentationUrl: 'https://developer.salesforce.com/docs/atlas.en-us.cpq_dev_api.meta/cpq_dev_api',
      knownIssues: ['CPU timeout in quote calculation', 'Memory issues with large quotes'],
    },
    category: 'SALESFORCE_INTERNAL',
    visibility: 'PRIVATE',
  },
  // Salesforce Billing
  blng: {
    vendor: {
      name: 'Salesforce',
      product: 'Salesforce Billing',
      supportUrl: 'https://help.salesforce.com/s/products/billing',
    },
    category: 'SALESFORCE_INTERNAL',
    visibility: 'PRIVATE',
  },
  // Certinia (FinancialForce)
  fferpcore: {
    vendor: {
      name: 'Certinia',
      product: 'FinancialForce Core',
      supportUrl: 'https://certinia.com/support',
      knownIssues: ['Complex journal processing can hit limits'],
    },
    category: 'ISV_PARTNER',
    visibility: 'PRIVATE',
  },
  c2g: {
    vendor: {
      name: 'Certinia',
      product: 'Financial Management',
      supportUrl: 'https://certinia.com/support',
    },
    category: 'ISV_PARTNER',
    visibility: 'PRIVATE',
  },
  pse: {
    vendor: {
      name: 'Certinia',
      product: 'Professional Services Automation',
      supportUrl: 'https://certinia.com/support',
    },
    category: 'ISV_PARTNER',
    visibility: 'PRIVATE',
  },
  // nCino
  nFORCE: {
    vendor: {
      name: 'nCino',
      product: 'nCino Banking OS',
      supportUrl: 'https://www.ncino.com/support',
    },
    category: 'ISV_PARTNER',
    visibility: 'PRIVATE',
  },
  // Conga
  APXT: {
    vendor: {
      name: 'Conga',
      product: 'Conga Composer',
      supportUrl: 'https://support.conga.com',
    },
    category: 'ISV_PARTNER',
    visibility: 'PRIVATE',
  },
  // DocuSign
  dsfs: {
    vendor: {
      name: 'DocuSign',
      product: 'DocuSign for Salesforce',
      supportUrl: 'https://support.docusign.com',
    },
    category: 'APPEXCHANGE',
    visibility: 'PRIVATE',
  },
  // Apex Mocks (testing framework)
  fflib_apex_mocks: {
    vendor: {
      name: 'Apex Mocks',
      product: 'Apex Mocks Testing Framework',
      documentationUrl: 'https://github.com/apex-enterprise-patterns/fflib-apex-mocks',
    },
    category: 'APPEXCHANGE',
    visibility: 'PUBLIC',
  },
  // Salesforce Labs
  sflabs: {
    vendor: {
      name: 'Salesforce Labs',
      product: 'Salesforce Labs Components',
      supportUrl: 'https://appexchange.salesforce.com/appxStore?type=Labs',
    },
    category: 'SALESFORCE_INTERNAL',
    visibility: 'PUBLIC',
  },
  // Vlocity/Salesforce Industries
  vlocity_cmt: {
    vendor: {
      name: 'Salesforce',
      product: 'Salesforce Industries (Vlocity)',
      supportUrl: 'https://help.salesforce.com/s/products/industries',
    },
    category: 'SALESFORCE_INTERNAL',
    visibility: 'PRIVATE',
  },
};

// ============================================================================
// Namespace Detector Implementation
// ============================================================================

/**
 * Main namespace detector
 */
export const namespaceDetector: NamespaceDetector = {
  detectNamespaces,
  trackExecutionContext,
  detectBoundaryCrossings,
};

/**
 * Detect all namespaces present in the log events
 */
export function detectNamespaces(events: EventNode[]): NamespaceInfo[] {
  const namespaceMap = new Map<string, NamespaceInfo>();

  for (const event of events) {
    // Check for explicit namespace markers
    if (event.type === 'ENTERING_MANAGED_PKG') {
      const nsEvent = event as ManagedPackageEvent;
      if (!namespaceMap.has(nsEvent.namespace)) {
        namespaceMap.set(nsEvent.namespace, createNamespaceInfo(nsEvent.namespace));
      }
    }

    // Check for namespace in event properties
    if (event.namespace && !namespaceMap.has(event.namespace)) {
      namespaceMap.set(event.namespace, createNamespaceInfo(event.namespace));
    }

    // Extract namespace from class names
    const classNamespace = extractNamespaceFromClassName(event);
    if (classNamespace && !namespaceMap.has(classNamespace)) {
      namespaceMap.set(classNamespace, createNamespaceInfo(classNamespace));
    }

    // Extract from code unit events
    if (event.type === 'CODE_UNIT_STARTED' || event.type === 'CODE_UNIT_FINISHED') {
      const codeUnit = event as CodeUnitEvent;
      const codeUnitNs = extractNamespaceFromCodeUnit(codeUnit.unitName);
      if (codeUnitNs && !namespaceMap.has(codeUnitNs)) {
        namespaceMap.set(codeUnitNs, createNamespaceInfo(codeUnitNs));
      }
    }
  }

  return Array.from(namespaceMap.values());
}

/**
 * Track execution context through events
 */
export function trackExecutionContext(events: EventNode[]): ExecutionContext[] {
  const contexts: ExecutionContext[] = [];
  let currentContext: ExecutionContext = {
    namespaceStack: [],
    inManagedPackage: false,
  };

  for (const event of events) {
    // Handle managed package entry
    if (event.type === 'ENTERING_MANAGED_PKG') {
      const nsEvent = event as ManagedPackageEvent;
      currentContext = {
        ...currentContext,
        namespace: nsEvent.namespace,
        namespaceStack: [...currentContext.namespaceStack, nsEvent.namespace],
        inManagedPackage: true,
      };
    }

    // Handle code unit start
    if (event.type === 'CODE_UNIT_STARTED') {
      const codeUnit = event as CodeUnitEvent;
      currentContext = {
        ...currentContext,
        currentCodeUnit: codeUnit.unitName,
        entryPointNamespace: currentContext.entryPointNamespace || currentContext.namespace,
      };
    }

    // Handle returning from managed package (simple heuristic)
    if (event.type === 'METHOD_EXIT' || event.type === 'CODE_UNIT_FINISHED') {
      if (currentContext.namespaceStack.length > 0) {
        // Check if we're exiting a namespace boundary
        const methodEvent = event as MethodEvent;
        const methodNs = extractNamespaceFromClassName(methodEvent);
        
        if (!methodNs && currentContext.namespaceStack.length > 0) {
          const newStack = [...currentContext.namespaceStack];
          newStack.pop();
          currentContext = {
            ...currentContext,
            namespace: newStack[newStack.length - 1],
            namespaceStack: newStack,
            inManagedPackage: newStack.length > 0,
          };
        }
      }
    }

    contexts.push({ ...currentContext });
  }

  return contexts;
}

/**
 * Detect boundary crossings between namespaces
 */
export function detectBoundaryCrossings(events: EventNode[]): BoundaryCrossing[] {
  const crossings: BoundaryCrossing[] = [];
  let currentNamespace: string | undefined;

  for (const event of events) {
    let newNamespace: string | undefined;

    // Check for explicit namespace marker
    if (event.type === 'ENTERING_MANAGED_PKG') {
      const nsEvent = event as ManagedPackageEvent;
      newNamespace = nsEvent.namespace;
    } else if (event.namespace) {
      newNamespace = event.namespace;
    } else {
      // Check class name
      newNamespace = extractNamespaceFromClassName(event);
    }

    // Detect crossing
    if (newNamespace !== currentNamespace) {
      const direction = determineCrossingDirection(currentNamespace, newNamespace);
      
      if (direction) {
        crossings.push({
          fromNamespace: currentNamespace,
          toNamespace: newNamespace,
          direction,
          eventId: event.id,
          lineNumber: event.lineNumber,
          crossingPoint: getCrossingPoint(event),
        });
      }
      
      currentNamespace = newNamespace;
    }
  }

  return crossings;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create NamespaceInfo for a namespace
 */
function createNamespaceInfo(namespace: string): NamespaceInfo {
  const known = KNOWN_NAMESPACES[namespace];

  if (known) {
    return {
      namespace,
      visibility: known.visibility,
      category: known.category,
      isManaged: known.visibility === 'PRIVATE',
      isObfuscated: known.visibility === 'PRIVATE',
      vendor: known.vendor,
      confidence: confidence(0.95, [`Known namespace: ${namespace}`]),
    };
  }

  // Infer properties for unknown namespace
  const inferredCategory = inferNamespaceCategory(namespace);
  const isLikelyManaged = isLikelyManagedPackage(namespace);

  return {
    namespace,
    visibility: isLikelyManaged ? 'PRIVATE' : 'UNKNOWN',
    category: inferredCategory,
    isManaged: isLikelyManaged,
    isObfuscated: isLikelyManaged,
    confidence: confidence(
      0.6,
      ['Unknown namespace - properties inferred'],
      ['Cannot verify package status without AppExchange lookup']
    ),
  };
}

/**
 * Extract namespace from class name
 */
function extractNamespaceFromClassName(event: EventNode): string | undefined {
  if (event.type === 'METHOD_ENTRY' || event.type === 'METHOD_EXIT') {
    const methodEvent = event as MethodEvent;
    const className = methodEvent.className;

    // Check for namespace.ClassName pattern
    const match = className?.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\./);
    if (match && match[1] && isLikelyNamespace(match[1])) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Extract namespace from code unit name
 */
function extractNamespaceFromCodeUnit(unitName: string | undefined): string | undefined {
  if (!unitName) return undefined;
  // Pattern: namespace__TriggerName or namespace.ClassName
  const match = unitName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:__|\.)/);
  if (match && match[1] && isLikelyNamespace(match[1])) {
    return match[1];
  }
  return undefined;
}

/**
 * Check if a string is likely a namespace
 */
function isLikelyNamespace(str: string): boolean {
  if (!str || str.length < 2 || str.length > 15) {
    return false;
  }

  // Known namespaces
  if (str in KNOWN_NAMESPACES) {
    return true;
  }

  // Common Salesforce class prefixes (not namespaces)
  const notNamespaces = [
    'System', 'Schema', 'Database', 'ApexPages', 'Test', 'Auth',
    'Cache', 'Canvas', 'ConnectApi', 'Dom', 'Flow', 'Http',
    'Messaging', 'Reports', 'Site', 'UserInfo', 'Limits', 'Math',
    'JSON', 'String', 'List', 'Map', 'Set', 'Trigger', 'Batch',
  ];

  if (notNamespaces.includes(str)) {
    return false;
  }

  // Likely namespace if short and alphanumeric
  return /^[a-zA-Z][a-zA-Z0-9_]{1,14}$/.test(str);
}

/**
 * Check if namespace is likely managed package
 */
function isLikelyManagedPackage(namespace: string): boolean {
  // Known managed packages
  const known = KNOWN_NAMESPACES[namespace];
  if (known) {
    return known.visibility === 'PRIVATE';
  }

  // Heuristics for managed packages:
  // - Short namespaces (2-6 chars) are often managed
  // - Namespaces with double underscore in related classes
  // - Common patterns
  if (namespace.length >= 2 && namespace.length <= 6) {
    return true;
  }

  return false;
}

/**
 * Infer namespace category
 */
function inferNamespaceCategory(namespace: string): NamespaceCategory {
  // Check known namespaces
  const known = KNOWN_NAMESPACES[namespace];
  if (known) {
    return known.category;
  }

  // Salesforce-like patterns
  if (namespace.toLowerCase().startsWith('sf') || namespace.toLowerCase().startsWith('salesforce')) {
    return 'SALESFORCE_INTERNAL';
  }

  // Short namespaces are often ISV partners
  if (namespace.length <= 6) {
    return 'ISV_PARTNER';
  }

  return 'UNKNOWN';
}

/**
 * Determine crossing direction
 */
function determineCrossingDirection(
  from: string | undefined,
  to: string | undefined
): BoundaryCrossing['direction'] | undefined {
  if (from === to) {
    return undefined;
  }

  if (!from && to) {
    return 'USER_TO_MANAGED';
  }

  if (from && !to) {
    return 'MANAGED_TO_USER';
  }

  if (from && to) {
    return 'MANAGED_TO_MANAGED';
  }

  return undefined;
}

/**
 * Get crossing point description
 */
function getCrossingPoint(event: EventNode): string | undefined {
  if (event.type === 'METHOD_ENTRY' || event.type === 'METHOD_EXIT') {
    const methodEvent = event as MethodEvent;
    return `${methodEvent.className}.${methodEvent.methodName}`;
  }

  if (event.type === 'CODE_UNIT_STARTED') {
    const codeUnit = event as CodeUnitEvent;
    return codeUnit.unitName;
  }

  if (event.type === 'ENTERING_MANAGED_PKG') {
    const nsEvent = event as ManagedPackageEvent;
    return `Entering ${nsEvent.namespace}`;
  }

  return undefined;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if namespace is known
 */
export function isKnownNamespace(namespace: string): boolean {
  return namespace in KNOWN_NAMESPACES;
}

/**
 * Get vendor info for namespace
 */
export function getVendorInfo(namespace: string): VendorInfo | undefined {
  return KNOWN_NAMESPACES[namespace]?.vendor;
}

/**
 * Get all known namespaces
 */
export function getAllKnownNamespaces(): string[] {
  return Object.keys(KNOWN_NAMESPACES);
}

// ============================================================================
// Exports
// ============================================================================
