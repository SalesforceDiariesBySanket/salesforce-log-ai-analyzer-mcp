/**
 * @module parser/truncation/detection
 * @description Truncation detection logic for Salesforce debug logs
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/truncation.ts, src/types/events.ts
 * @lastModified 2026-02-01
 */

import type {
  EventNode,
  ExceptionEvent,
} from '../../types/events';
import type {
  TruncationDetection,
  TruncationIndicator,
  TruncationType,
  TruncationSeverity,
  LostInformationType,
} from '../../types/truncation';
import { confidence, type Confidence } from '../../types/common';
import {
  TRUNCATION_MARKERS,
  SIZE_THRESHOLDS,
  DETECTION_THRESHOLDS,
  CONFIDENCE_WEIGHTS,
} from './constants';

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect truncation in a debug log
 * 
 * @param content - Raw log content
 * @param events - Parsed events from the log
 * @returns Truncation detection result with indicators and recommendations
 */
export function detectTruncation(
  content: string,
  events: EventNode[]
): TruncationDetection {
  const indicators: TruncationIndicator[] = [];
  const contentSize = Buffer.byteLength(content, 'utf-8');

  // Check for explicit markers
  indicators.push(checkExplicitMarkers(content));

  // Check for size threshold
  indicators.push(checkSizeThreshold(contentSize));

  // Check for abrupt ending
  indicators.push(checkAbruptEnding(events));

  // Check for unclosed events
  indicators.push(checkUnclosedEvents(events));

  // Check for missing limit summary
  indicators.push(checkMissingLimits(events));

  // Check for mid-line cut
  indicators.push(checkMidLineCut(content));

  // Check for incomplete stack trace
  indicators.push(checkIncompleteStacktrace(content, events));

  // Calculate overall truncation assessment
  const foundIndicators = indicators.filter(i => i.found);
  const isTruncated = foundIndicators.length >= 1;

  // Determine truncation type
  const truncationType = determineTruncationType(indicators, contentSize);

  // Determine severity
  const severity = determineSeverity(indicators, contentSize, events);

  // Calculate confidence
  const detectionConfidence = calculateDetectionConfidence(indicators, foundIndicators);

  // Determine what information was likely lost
  const likelyLostInfo = determineLostInfo(indicators, events);

  // Generate AI recommendations
  const aiRecommendations = generateAIRecommendations(truncationType, severity, likelyLostInfo);

  return {
    isTruncated,
    truncationType,
    severity,
    confidence: detectionConfidence,
    indicators,
    likelyLostInfo,
    aiRecommendations,
  };
}

// ============================================================================
// Indicator Check Functions
// ============================================================================

/**
 * Check for explicit truncation markers in content
 */
export function checkExplicitMarkers(content: string): TruncationIndicator {
  for (const marker of TRUNCATION_MARKERS) {
    const index = content.indexOf(marker);
    if (index !== -1) {
      // Find line number
      const lineNumber = content.substring(0, index).split('\n').length;
      return {
        type: 'EXPLICIT_MARKER',
        found: true,
        lineNumber,
        details: `Found marker: "${marker}"`,
      };
    }
  }

  return {
    type: 'EXPLICIT_MARKER',
    found: false,
  };
}

/**
 * Check if log is near size threshold
 */
export function checkSizeThreshold(contentSize: number): TruncationIndicator {
  const isFound = contentSize >= SIZE_THRESHOLDS.WARNING_THRESHOLD;
  const percentOfMax = ((contentSize / SIZE_THRESHOLDS.SALESFORCE_MAX) * 100).toFixed(1);

  return {
    type: 'SIZE_THRESHOLD',
    found: isFound,
    details: isFound
      ? `Log is ${percentOfMax}% of 20MB limit (${(contentSize / 1024 / 1024).toFixed(2)}MB)`
      : undefined,
  };
}

/**
 * Check for abrupt ending (no proper close events)
 */
export function checkAbruptEnding(events: EventNode[]): TruncationIndicator {
  if (events.length === 0) {
    return { type: 'ABRUPT_ENDING', found: true, details: 'No events parsed' };
  }

  const hasProperEnding = events.some(
    e => e.type === 'EXECUTION_FINISHED' || e.type === 'CUMULATIVE_LIMIT_USAGE_END'
  );

  const lastEvent = events[events.length - 1];

  return {
    type: 'ABRUPT_ENDING',
    found: !hasProperEnding,
    lineNumber: lastEvent?.lineNumber,
    details: hasProperEnding
      ? undefined
      : `Last event: ${lastEvent?.type} at line ${lastEvent?.lineNumber}`,
  };
}

/**
 * Check for unclosed method/code unit events
 */
export function checkUnclosedEvents(events: EventNode[]): TruncationIndicator {
  const entryStack: { type: string; id: number; lineNumber: number }[] = [];

  for (const event of events) {
    if (event.type === 'METHOD_ENTRY' || event.type === 'CODE_UNIT_STARTED') {
      entryStack.push({ type: event.type, id: event.id, lineNumber: event.lineNumber });
    } else if (event.type === 'METHOD_EXIT' || event.type === 'CODE_UNIT_FINISHED') {
      entryStack.pop();
    }
  }

  const unclosedCount = entryStack.length;
  const isFound = unclosedCount > DETECTION_THRESHOLDS.UNCLOSED_EVENTS_SUSPICIOUS;

  return {
    type: 'UNCLOSED_EVENTS',
    found: isFound,
    details: isFound
      ? `${unclosedCount} unclosed method/code unit entries`
      : undefined,
  };
}

/**
 * Check for missing cumulative limit summary
 */
export function checkMissingLimits(events: EventNode[]): TruncationIndicator {
  const hasCumulativeEnd = events.some(e => e.type === 'CUMULATIVE_LIMIT_USAGE_END');
  const hasExecutionStarted = events.some(e => e.type === 'EXECUTION_STARTED');
  const hasExecutionFinished = events.some(e => e.type === 'EXECUTION_FINISHED');

  const isFound = hasExecutionStarted && !hasExecutionFinished && !hasCumulativeEnd;

  return {
    type: 'MISSING_LIMITS',
    found: isFound,
    details: isFound
      ? 'Execution started but no cumulative limit summary found'
      : undefined,
  };
}

/**
 * Check for lines cut in the middle
 */
export function checkMidLineCut(content: string): TruncationIndicator {
  const lines = content.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';

  // Check if last line looks incomplete
  const suspiciousPatterns = [
    /\|[^|]+$/, // Ends with pipe but no more delimiters
    /\[[^\]]*$/, // Unclosed bracket
    /SELECT.*FROM(?!\s+\w)/i, // Incomplete SOQL
    /[a-zA-Z]$/, // Ends with letter (likely mid-word)
  ];

  const isFound = lastLine.length > 0 && suspiciousPatterns.some(pattern => pattern.test(lastLine));

  return {
    type: 'MID_LINE_CUT',
    found: isFound,
    lineNumber: lines.length,
    details: isFound
      ? `Last line appears truncated: "${lastLine.substring(0, 50)}..."`
      : undefined,
  };
}

/**
 * Check for incomplete stack traces
 */
export function checkIncompleteStacktrace(_content: string, events: EventNode[]): TruncationIndicator {
  const exceptionEvents = events.filter(
    (e): e is ExceptionEvent => e.type === 'EXCEPTION_THROWN' || e.type === 'FATAL_ERROR'
  );

  const lastException = exceptionEvents[exceptionEvents.length - 1];

  if (lastException) {
    const lastEventLine = events[events.length - 1]?.lineNumber ?? 0;
    const isNearEnd = lastException.lineNumber > lastEventLine - DETECTION_THRESHOLDS.NEAR_END_LINE_COUNT;
    const hasIncompleteStack = !lastException.stackTrace || 
      lastException.stackTrace.length < DETECTION_THRESHOLDS.MIN_STACK_TRACE_LENGTH;

    if (isNearEnd && hasIncompleteStack) {
      return {
        type: 'INCOMPLETE_STACKTRACE',
        found: true,
        lineNumber: lastException.lineNumber,
        details: 'Exception near end of log with incomplete or missing stack trace',
      };
    }
  }

  return {
    type: 'INCOMPLETE_STACKTRACE',
    found: false,
  };
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Determine truncation type from indicators
 */
function determineTruncationType(
  indicators: TruncationIndicator[],
  contentSize: number
): TruncationType {
  const explicitMarker = indicators.find(i => i.type === 'EXPLICIT_MARKER' && i.found);
  const sizeThreshold = indicators.find(i => i.type === 'SIZE_THRESHOLD' && i.found);

  if (explicitMarker) {
    if (explicitMarker.details?.includes('Skipped')) {
      return 'LINE_LIMIT';
    }
    return 'SIZE_LIMIT';
  }

  if (contentSize >= SIZE_THRESHOLDS.LIKELY_TRUNCATED) {
    return 'SIZE_LIMIT';
  }

  if (sizeThreshold) {
    return 'SIZE_LIMIT';
  }

  return 'UNKNOWN';
}

/**
 * Determine severity of truncation
 */
function determineSeverity(
  indicators: TruncationIndicator[],
  contentSize: number,
  _events: EventNode[]
): TruncationSeverity {
  const foundIndicators = indicators.filter(i => i.found);

  if (foundIndicators.length === 0) {
    return 'NONE';
  }

  // Check for critical indicators
  const hasIncompleteStack = indicators.some(i => i.type === 'INCOMPLETE_STACKTRACE' && i.found);
  const hasMidLineCut = indicators.some(i => i.type === 'MID_LINE_CUT' && i.found);

  if (hasIncompleteStack || hasMidLineCut) {
    return 'CRITICAL';
  }

  // Size-based severity
  const sizePercent = contentSize / SIZE_THRESHOLDS.SALESFORCE_MAX;
  if (sizePercent >= 0.99) {
    return 'SEVERE';
  }
  if (sizePercent >= 0.95) {
    return 'MODERATE';
  }

  // Event-based severity
  const unclosedIndicator = indicators.find(i => i.type === 'UNCLOSED_EVENTS' && i.found);
  if (unclosedIndicator && foundIndicators.length >= 3) {
    return 'SEVERE';
  }

  if (foundIndicators.length >= 2) {
    return 'MODERATE';
  }

  return 'MINOR';
}

/**
 * Calculate confidence in truncation detection
 */
function calculateDetectionConfidence(
  _allIndicators: TruncationIndicator[],
  foundIndicators: TruncationIndicator[]
): Confidence {
  const reasons: string[] = [];
  const limitations: string[] = [];

  if (foundIndicators.length === 0) {
    return confidence(CONFIDENCE_WEIGHTS.NO_INDICATORS, ['No truncation indicators found'], undefined);
  }

  // Add reasons for each found indicator
  for (const indicator of foundIndicators) {
    reasons.push(`${indicator.type.replace(/_/g, ' ').toLowerCase()} detected`);
  }

  // Calculate score based on indicator strength
  let score: number;

  const hasExplicitMarker = foundIndicators.some(i => i.type === 'EXPLICIT_MARKER');
  const hasSizeThreshold = foundIndicators.some(i => i.type === 'SIZE_THRESHOLD');

  if (hasExplicitMarker) {
    score = CONFIDENCE_WEIGHTS.EXPLICIT_MARKER;
  } else if (hasSizeThreshold && foundIndicators.length >= 2) {
    score = CONFIDENCE_WEIGHTS.SIZE_WITH_MULTIPLE;
  } else if (foundIndicators.length >= 3) {
    score = CONFIDENCE_WEIGHTS.THREE_INDICATORS;
  } else if (foundIndicators.length === 2) {
    score = CONFIDENCE_WEIGHTS.TWO_INDICATORS;
  } else {
    score = CONFIDENCE_WEIGHTS.SINGLE_INDICATOR;
    limitations.push('Only one indicator found - may be false positive');
  }

  return confidence(score, reasons, limitations.length > 0 ? limitations : undefined);
}

/**
 * Determine what information was likely lost
 */
function determineLostInfo(
  indicators: TruncationIndicator[],
  _events: EventNode[]
): LostInformationType[] {
  const lostInfo: LostInformationType[] = [];
  const foundIndicators = indicators.filter(i => i.found);

  if (foundIndicators.length === 0) {
    return lostInfo;
  }

  if (indicators.some(i => i.type === 'INCOMPLETE_STACKTRACE' && i.found)) {
    lostInfo.push('EXCEPTION_DETAILS');
  }

  if (indicators.some(i => i.type === 'MISSING_LIMITS' && i.found)) {
    lostInfo.push('FINAL_LIMITS');
  }

  if (indicators.some(i => i.type === 'ABRUPT_ENDING' && i.found)) {
    lostInfo.push('EXECUTION_END');
    lostInfo.push('PERFORMANCE_DATA');
  }

  if (indicators.some(i => i.type === 'UNCLOSED_EVENTS' && i.found)) {
    lostInfo.push('NESTED_EVENTS');
  }

  // General losses for any truncation
  if (foundIndicators.length >= 2) {
    if (!lostInfo.includes('DEBUG_OUTPUT')) {
      lostInfo.push('DEBUG_OUTPUT');
    }
    if (!lostInfo.includes('ASYNC_CORRELATIONS')) {
      lostInfo.push('ASYNC_CORRELATIONS');
    }
  }

  return lostInfo;
}

/**
 * Generate AI-focused recommendations
 */
function generateAIRecommendations(
  truncationType: TruncationType,
  severity: TruncationSeverity,
  lostInfo: LostInformationType[]
): string[] {
  const recommendations: string[] = [];

  if (severity === 'NONE') {
    return ['Log appears complete - proceed with full analysis'];
  }

  recommendations.push(
    `Log is ${truncationType.replace(/_/g, ' ').toLowerCase()} truncated (${severity.toLowerCase()} severity)`
  );

  if (lostInfo.includes('EXCEPTION_DETAILS')) {
    recommendations.push(
      'Exception stack trace may be incomplete - consider re-running with FINEST debug level for Apex'
    );
  }

  if (lostInfo.includes('FINAL_LIMITS')) {
    recommendations.push(
      'Final governor limit summary is missing - use in-log LIMIT_USAGE events for estimates'
    );
  }

  if (lostInfo.includes('EXECUTION_END')) {
    recommendations.push(
      'Cannot determine how execution ended - check for errors or timeouts in Apex Jobs'
    );
  }

  if (lostInfo.includes('NESTED_EVENTS')) {
    recommendations.push(
      'Some nested call information may be incomplete - focus on top-level issues first'
    );
  }

  if (truncationType === 'SIZE_LIMIT') {
    recommendations.push(
      'To reduce log size: Lower debug levels for categories not needed (e.g., Validation, Workflow)'
    );
  }

  if (severity === 'CRITICAL' || severity === 'SEVERE') {
    recommendations.push(
      'Consider splitting the operation into smaller transactions or using targeted debug logs'
    );
  }

  return recommendations;
}
