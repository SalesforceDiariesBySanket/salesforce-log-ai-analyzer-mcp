/**
 * @module managed/visibility-classifier
 * @description Classify namespace visibility and accessibility
 * @status COMPLETE
 * @see src/managed/STATE.md
 * @dependencies src/types/managed.ts, src/types/events.ts
 * @lastModified 2026-01-31
 */

import type { EventNode, MethodEvent, ExceptionEvent } from '../types/events';
import type {
  NamespaceInfo,
  NamespaceVisibility,
  NamespaceCategory,
} from '../types/managed';
import { confidence, type Confidence } from '../types/common';
import { KNOWN_NAMESPACES, isKnownNamespace } from './namespace-detector';

// ============================================================================
// Visibility Classification
// ============================================================================

/**
 * Visibility classification result
 */
export interface VisibilityClassification {
  /** Determined visibility */
  visibility: NamespaceVisibility;
  
  /** Category of the namespace */
  category: NamespaceCategory;
  
  /** Whether code is obfuscated */
  isObfuscated: boolean;
  
  /** Whether code can be modified */
  canModify: boolean;
  
  /** Whether code can be viewed */
  canView: boolean;
  
  /** Confidence in classification */
  confidence: Confidence;
  
  /** Evidence for classification */
  evidence: VisibilityEvidence[];
}

/**
 * Evidence for visibility classification
 */
export interface VisibilityEvidence {
  /** Type of evidence */
  type: VisibilityEvidenceType;
  
  /** Description */
  description: string;
  
  /** Weight in decision (0-1) */
  weight: number;
}

/**
 * Types of visibility evidence
 */
export type VisibilityEvidenceType =
  | 'KNOWN_NAMESPACE'        // In our known namespaces database
  | 'OBFUSCATED_METHODS'     // Method names are obfuscated
  | 'CLEAR_METHOD_NAMES'     // Method names are readable
  | 'STACK_TRACE_FORMAT'     // Stack trace indicates managed package
  | 'ERROR_MESSAGE'          // Error message format
  | 'NAMESPACE_LENGTH'       // Namespace length heuristic
  | 'APPEXCHANGE_PATTERN'    // Matches AppExchange patterns
  | 'USER_CODE_PATTERN';     // Matches user code patterns

// ============================================================================
// Obfuscation Detection
// ============================================================================

/**
 * Patterns that indicate obfuscated code
 */
const OBFUSCATION_PATTERNS = {
  // Single character or very short method names
  shortMethodName: /^[a-z]$/i,
  
  // Alphanumeric gibberish (like "a1b2c3")
  gibberishPattern: /^[a-z][0-9a-z]+$/i,
  
  // Sequential characters (like "aaa", "bbb")
  sequentialChars: /^(.)\1{2,}$/,
  
  // Package-generated names
  generatedName: /^__[a-z]+$/i,
  
  // Numbered methods (like "method_1", "method_2")
  numberedMethod: /^[a-z]+_\d+$/i,
};

/**
 * Patterns that indicate user-readable code
 */
const READABLE_PATTERNS = {
  // Camel case method names
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  
  // Action-based names (get, set, handle, process)
  actionBased: /^(get|set|handle|process|create|update|delete|validate|calculate)[A-Z]/,
  
  // Event handlers
  eventHandler: /^(on|handle|before|after)[A-Z]/,
  
  // Test methods
  testMethod: /^test[A-Z]/,
};

// ============================================================================
// Classifier Implementation
// ============================================================================

/**
 * Classify visibility of a namespace
 */
export function classifyVisibility(
  namespaceInfo: NamespaceInfo,
  events: EventNode[]
): VisibilityClassification {
  const evidence: VisibilityEvidence[] = [];
  const namespace = namespaceInfo.namespace;

  // Check if it's a known namespace
  if (isKnownNamespace(namespace)) {
    const known = KNOWN_NAMESPACES[namespace];
    if (known) {
      evidence.push({
        type: 'KNOWN_NAMESPACE',
        description: `${namespace} is a known ${known.vendor.product} namespace`,
        weight: 0.9,
      });
      
      return {
        visibility: known.visibility,
        category: known.category,
        isObfuscated: known.visibility === 'PRIVATE',
        canModify: false,
        canView: known.visibility === 'PUBLIC',
        confidence: confidence(0.95, [`Known namespace: ${known.vendor.product}`]),
        evidence,
      };
    }
  }

  // Analyze events from this namespace
  const namespaceEvents = events.filter(e => e.namespace === namespace);
  const methodEvents = namespaceEvents.filter(
    (e): e is MethodEvent => e.type === 'METHOD_ENTRY' || e.type === 'METHOD_EXIT'
  );

  // Check for obfuscation in method names
  const obfuscationCheck = analyzeMethodObfuscation(methodEvents);
  evidence.push(...obfuscationCheck.evidence);

  // Check exception stack traces
  const stackTraceEvidence = analyzeStackTraces(namespaceEvents);
  evidence.push(...stackTraceEvidence);

  // Apply namespace length heuristic
  const lengthEvidence = analyzeNamespaceLength(namespace);
  evidence.push(lengthEvidence);

  // Calculate final visibility
  const classification = calculateVisibility(evidence, namespace);

  return classification;
}

/**
 * Analyze method names for obfuscation
 */
function analyzeMethodObfuscation(methodEvents: MethodEvent[]): {
  isObfuscated: boolean;
  evidence: VisibilityEvidence[];
} {
  const evidence: VisibilityEvidence[] = [];
  
  if (methodEvents.length === 0) {
    return { isObfuscated: false, evidence };
  }

  // Get unique method names
  const methodNames = new Set<string>();
  for (const event of methodEvents) {
    if (event.methodName) {
      methodNames.add(event.methodName);
    }
  }

  let obfuscatedCount = 0;
  let readableCount = 0;

  for (const methodName of methodNames) {
    // Check obfuscation patterns
    if (isObfuscatedMethodName(methodName)) {
      obfuscatedCount++;
    } else if (isReadableMethodName(methodName)) {
      readableCount++;
    }
  }

  const total = methodNames.size;
  const obfuscatedRatio = total > 0 ? obfuscatedCount / total : 0;
  const readableRatio = total > 0 ? readableCount / total : 0;

  if (obfuscatedRatio > 0.5) {
    evidence.push({
      type: 'OBFUSCATED_METHODS',
      description: `${Math.round(obfuscatedRatio * 100)}% of methods appear obfuscated`,
      weight: 0.8,
    });
    return { isObfuscated: true, evidence };
  }

  if (readableRatio > 0.5) {
    evidence.push({
      type: 'CLEAR_METHOD_NAMES',
      description: `${Math.round(readableRatio * 100)}% of methods have clear names`,
      weight: 0.7,
    });
    return { isObfuscated: false, evidence };
  }

  return { isObfuscated: false, evidence };
}

/**
 * Check if method name appears obfuscated
 */
function isObfuscatedMethodName(name: string): boolean {
  // Skip common framework methods
  const frameworkMethods = ['execute', 'run', 'invoke', 'handle', 'process'];
  if (frameworkMethods.includes(name.toLowerCase())) {
    return false;
  }

  // Check obfuscation patterns
  for (const pattern of Object.values(OBFUSCATION_PATTERNS)) {
    if (pattern.test(name)) {
      return true;
    }
  }

  // Very short non-standard names
  if (name.length <= 2 && !/^(do|go|is|on)$/i.test(name)) {
    return true;
  }

  return false;
}

/**
 * Check if method name appears readable
 */
function isReadableMethodName(name: string): boolean {
  for (const pattern of Object.values(READABLE_PATTERNS)) {
    if (pattern.test(name)) {
      return true;
    }
  }

  // Reasonable length with underscores (Apex style)
  if (name.length >= 5 && name.length <= 50 && /^[a-z][a-zA-Z0-9_]*$/.test(name)) {
    return true;
  }

  return false;
}

/**
 * Analyze stack traces for visibility clues
 */
function analyzeStackTraces(events: EventNode[]): VisibilityEvidence[] {
  const evidence: VisibilityEvidence[] = [];
  
  const exceptionEvents = events.filter(
    (e): e is ExceptionEvent => e.type === 'EXCEPTION_THROWN' || e.type === 'FATAL_ERROR'
  );

  for (const exception of exceptionEvents) {
    if (exception.stackTrace) {
      // Check for managed package indicators in stack trace
      const hasObfuscatedFrames = exception.stackTrace.some(frame => 
        /\(\d+\)$/.test(frame) || // Line numbers only, no method names
        /Class\.[A-Z]+\.\d+/.test(frame) // Obfuscated class references
      );

      if (hasObfuscatedFrames) {
        evidence.push({
          type: 'STACK_TRACE_FORMAT',
          description: 'Stack trace shows obfuscated frame references',
          weight: 0.6,
        });
        break;
      }

      // Check for clear stack traces
      const hasClearFrames = exception.stackTrace.some(frame =>
        /\w+\.\w+\.(\w{5,})/.test(frame) // Clear method names
      );

      if (hasClearFrames && !hasObfuscatedFrames) {
        evidence.push({
          type: 'STACK_TRACE_FORMAT',
          description: 'Stack trace shows clear method references',
          weight: 0.5,
        });
        break;
      }
    }
  }

  return evidence;
}

/**
 * Analyze namespace length for heuristics
 */
function analyzeNamespaceLength(namespace: string): VisibilityEvidence {
  // Short namespaces (2-4 chars) are typically managed ISV packages
  if (namespace.length >= 2 && namespace.length <= 4) {
    return {
      type: 'NAMESPACE_LENGTH',
      description: `Short namespace (${namespace.length} chars) typical of managed packages`,
      weight: 0.4,
    };
  }

  // Medium length (5-8 chars) could be either
  if (namespace.length >= 5 && namespace.length <= 8) {
    return {
      type: 'NAMESPACE_LENGTH',
      description: `Medium namespace length - could be managed or unlocked`,
      weight: 0.2,
    };
  }

  // Longer namespaces are often unlocked or user packages
  return {
    type: 'NAMESPACE_LENGTH',
    description: `Longer namespace (${namespace.length} chars) may be unlocked package`,
    weight: 0.3,
  };
}

/**
 * Calculate final visibility from evidence
 */
function calculateVisibility(
  evidence: VisibilityEvidence[],
  namespace: string
): VisibilityClassification {
  let privateScore = 0;
  let publicScore = 0;
  let unknownScore = 0.5; // Base unknown score

  for (const e of evidence) {
    switch (e.type) {
      case 'KNOWN_NAMESPACE':
      case 'OBFUSCATED_METHODS':
      case 'STACK_TRACE_FORMAT':
        if (e.description.includes('obfuscated')) {
          privateScore += e.weight;
        } else {
          publicScore += e.weight;
        }
        break;
      case 'CLEAR_METHOD_NAMES':
        publicScore += e.weight;
        break;
      case 'NAMESPACE_LENGTH':
        if (namespace.length <= 4) {
          privateScore += e.weight;
        } else {
          publicScore += e.weight * 0.5;
        }
        break;
      default:
        unknownScore += e.weight * 0.3;
    }
  }

  // Determine visibility
  let visibility: NamespaceVisibility;
  let isObfuscated: boolean;
  let confidenceScore: number;
  const reasons: string[] = [];

  if (privateScore > publicScore && privateScore > unknownScore) {
    visibility = 'PRIVATE';
    isObfuscated = true;
    confidenceScore = Math.min(0.9, 0.5 + privateScore);
    reasons.push('Evidence suggests managed package with private code');
  } else if (publicScore > privateScore && publicScore > unknownScore) {
    visibility = 'PUBLIC';
    isObfuscated = false;
    confidenceScore = Math.min(0.9, 0.5 + publicScore);
    reasons.push('Evidence suggests code is visible/public');
  } else {
    visibility = 'UNKNOWN';
    isObfuscated = false;
    confidenceScore = 0.5;
    reasons.push('Insufficient evidence to determine visibility');
  }

  // Determine category based on visibility
  let category: NamespaceCategory;
  if (visibility === 'PRIVATE') {
    category = namespace.length <= 4 ? 'ISV_PARTNER' : 'UNLOCKED';
  } else if (visibility === 'PUBLIC') {
    category = 'APPEXCHANGE';
  } else {
    category = 'UNKNOWN';
  }

  return {
    visibility,
    category,
    isObfuscated,
    canModify: visibility === 'PUBLIC' || visibility === 'UNKNOWN',
    canView: visibility !== 'PRIVATE',
    confidence: confidence(confidenceScore, reasons),
    evidence,
  };
}

// ============================================================================
// Bulk Classification
// ============================================================================

/**
 * Classify visibility for multiple namespaces
 */
export function classifyNamespaces(
  namespaces: NamespaceInfo[],
  events: EventNode[]
): Map<string, VisibilityClassification> {
  const results = new Map<string, VisibilityClassification>();

  for (const ns of namespaces) {
    results.set(ns.namespace, classifyVisibility(ns, events));
  }

  return results;
}

/**
 * Check if a namespace has obfuscated code
 */
export function isObfuscated(namespace: string, events: EventNode[]): boolean {
  const classification = classifyVisibility(
    {
      namespace,
      visibility: 'UNKNOWN',
      category: 'UNKNOWN',
      isManaged: false,
      isObfuscated: false,
      confidence: confidence(0.5, []),
    },
    events
  );

  return classification.isObfuscated;
}

/**
 * Get code accessibility for a namespace
 */
export function getCodeAccessibility(
  namespace: string,
  events: EventNode[]
): { canView: boolean; canModify: boolean; reason: string } {
  const classification = classifyVisibility(
    {
      namespace,
      visibility: 'UNKNOWN',
      category: 'UNKNOWN',
      isManaged: false,
      isObfuscated: false,
      confidence: confidence(0.5, []),
    },
    events
  );

  let reason: string;
  if (classification.visibility === 'PRIVATE') {
    reason = 'Code is in a managed package and cannot be viewed or modified';
  } else if (classification.visibility === 'PUBLIC') {
    reason = 'Code is in a public package or unlocked package';
  } else {
    reason = 'Cannot determine code accessibility';
  }

  return {
    canView: classification.canView,
    canModify: classification.canModify,
    reason,
  };
}

// ============================================================================
// Exports
// ============================================================================
