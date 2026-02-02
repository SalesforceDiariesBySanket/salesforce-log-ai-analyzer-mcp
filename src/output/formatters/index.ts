/**
 * @module output/formatters
 * @description Exports for all JSON/JSONL formatters
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies ./types.ts, ./event-formatter.ts, ./issue-formatter.ts
 * @lastModified 2026-01-31
 */

// Types
export * from './types';

// Event formatting
export { formatEvent, formatEvents } from './event-formatter';

// Issue formatting
export { formatIssue, formatIssues } from './issue-formatter';

// Summary and AI context
export { buildOutputSummary, buildAIContext } from './summary-builder';

// JSONL streaming
export {
  generateJSONL,
  generateJSONLAsync,
  streamEventsJSONL,
  formatJSONL,
  parseJSONL,
  type JSONLRecordType,
  type JSONLRecord,
  type JSONLHeader,
  type JSONLFooter,
} from './jsonl-formatter';

// Redaction
export { redactSensitiveData, DEFAULT_REDACTION_PATTERNS } from './redaction';
