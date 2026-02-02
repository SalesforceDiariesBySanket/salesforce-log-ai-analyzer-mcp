/**
 * @module output/formatters/issue-formatter
 * @description Format Issue to output representation
 * @status COMPLETE
 * @see src/output/STATE.md
 * @dependencies src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type { Issue, IssueCategory, IssueSeverity } from '../../types/issues';
import type { OutputIssue } from './types';

// ============================================================================
// Issue Formatting
// ============================================================================

/**
 * Format single issue for output
 * 
 * @param issue - The issue to format
 * @param includeConfidence - Whether to include confidence score
 * @returns Formatted output issue
 */
export function formatIssue(issue: Issue, includeConfidence: boolean): OutputIssue {
  const output: OutputIssue = {
    id: issue.id,
    type: issue.type,
    category: issue.category,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    events: issue.eventIds,
    lines: issue.lineNumbers,
    canFix: issue.attribution.canModify,
    recommendations: issue.recommendations,
  };

  if (includeConfidence) {
    output.confidence = issue.confidence.score;
  }

  if (issue.attribution.namespace) {
    output.namespace = issue.attribution.namespace;
  }

  return output;
}

/**
 * Format multiple issues with filtering
 * 
 * @param issues - Issues to format
 * @param options - Filter options
 * @returns Filtered and formatted issues
 */
export function formatIssues(
  issues: Issue[],
  options: {
    severities?: IssueSeverity[];
    categories?: IssueCategory[];
    maxIssues?: number;
    includeConfidence?: boolean;
  } = {}
): OutputIssue[] {
  let filtered = issues;

  // Apply severity filter
  if (options.severities && options.severities.length > 0) {
    filtered = filtered.filter(i => options.severities!.includes(i.severity));
  }

  // Apply category filter
  if (options.categories && options.categories.length > 0) {
    filtered = filtered.filter(i => options.categories!.includes(i.category));
  }

  // Apply limit
  if (options.maxIssues && options.maxIssues > 0) {
    filtered = filtered.slice(0, options.maxIssues);
  }

  return filtered.map(i => formatIssue(i, options.includeConfidence ?? true));
}
