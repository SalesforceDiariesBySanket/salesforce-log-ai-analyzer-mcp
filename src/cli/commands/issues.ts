/**
 * @module cli/commands/issues
 * @description Issues command - list detected issues in a log
 * @status COMPLETE
 * @see src/cli/STATE.md
 * @dependencies commander, src/parser, src/analyzer
 * @lastModified 2026-01-31
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseLog } from '../../parser';
import { analyzeLog } from '../../analyzer';
import type { Issue, IssueSeverity } from '../../types';
import { redactText, getPreset, configToOptions } from '../../privacy';

// ============================================================================
// Types
// ============================================================================

interface IssuesOptions {
  severity?: string;
  type?: string;
  limit?: string;
  format: 'json' | 'text';
  redact: boolean;
}

// ============================================================================
// Command Definition
// ============================================================================

export const issuesCommand = new Command('issues')
  .description('List detected issues in a debug log')
  .argument('<file>', 'Path to the debug log file')
  .option('-s, --severity <level>', 'Filter by severity (critical, high, medium, low)')
  .option('-t, --type <type>', 'Filter by issue type')
  .option('-l, --limit <n>', 'Limit number of results')
  .option('-f, --format <format>', 'Output format: json or text', 'text')
  .option('-r, --redact', 'Redact PII from output', false)
  .action(async (file: string, options: IssuesOptions) => {
    await runIssues(file, options);
  });

// ============================================================================
// Implementation
// ============================================================================

async function runIssues(file: string, options: IssuesOptions): Promise<void> {
  // Resolve file path
  const filePath = path.resolve(file);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Read file
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading file: ${(err as Error).message}`);
    process.exit(1);
  }

  // Parse log
  const parseResult = parseLog(content);
  if (!parseResult.success) {
    console.error(`Parse error: ${parseResult.error.message}`);
    process.exit(1);
  }

  // Run analysis
  const analysis = analyzeLog(parseResult.data);

  let issues = analysis.issues;

  // Apply filters
  if (options.severity) {
    const severityUpper = options.severity.toUpperCase() as IssueSeverity;
    issues = issues.filter((i) => i.severity === severityUpper);
  }

  if (options.type) {
    const typeLower = options.type.toLowerCase();
    issues = issues.filter((i) => i.type.toLowerCase().includes(typeLower));
  }

  // Apply limit
  const total = issues.length;
  if (options.limit) {
    issues = issues.slice(0, parseInt(options.limit, 10));
  }

  // Format output
  let output: string;
  if (options.format === 'json') {
    output = JSON.stringify({
      total,
      returned: issues.length,
      filters: {
        severity: options.severity,
        type: options.type,
      },
      issues: issues.map(simplifyIssue),
    }, null, 2);
  } else {
    output = formatTextIssues(issues, total);
  }

  // Apply redaction if requested
  if (options.redact) {
    const config = getPreset('MODERATE');
    const redactOptions = configToOptions(config);
    output = redactText(output, redactOptions).redacted;
  }

  console.log(output);
}

// ============================================================================
// Helpers
// ============================================================================

function simplifyIssue(issue: Issue): Record<string, unknown> {
  return {
    type: issue.type,
    severity: issue.severity,
    description: issue.description,
    lineNumbers: issue.lineNumbers,
    recommendations: issue.recommendations,
    confidence: issue.confidence,
  };
}

function formatTextIssues(issues: Issue[], total: number): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════════╗',
    '║                    Detected Issues                               ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    `Total Issues: ${total}`,
    '',
  ];

  if (issues.length === 0) {
    lines.push('✅ No issues detected! Your log looks healthy.');
    return lines.join('\n');
  }

  // Group by severity
  const critical = issues.filter((i) => i.severity === 'CRITICAL');
  const high = issues.filter((i) => i.severity === 'HIGH');
  const medium = issues.filter((i) => i.severity === 'MEDIUM');
  const low = issues.filter((i) => i.severity === 'LOW');

  if (critical.length > 0) {
    lines.push('🔴 CRITICAL Issues:');
    lines.push('─'.repeat(60));
    critical.forEach((issue, i) => formatIssueText(issue, i + 1, lines));
    lines.push('');
  }

  if (high.length > 0) {
    lines.push('🟠 HIGH Severity Issues:');
    lines.push('─'.repeat(60));
    high.forEach((issue, i) => formatIssueText(issue, i + 1, lines));
    lines.push('');
  }

  if (medium.length > 0) {
    lines.push('🟡 MEDIUM Severity Issues:');
    lines.push('─'.repeat(60));
    medium.forEach((issue, i) => formatIssueText(issue, i + 1, lines));
    lines.push('');
  }

  if (low.length > 0) {
    lines.push('🟢 LOW Severity Issues:');
    lines.push('─'.repeat(60));
    low.forEach((issue, i) => formatIssueText(issue, i + 1, lines));
    lines.push('');
  }

  return lines.join('\n');
}

function formatIssueText(issue: Issue, index: number, lines: string[]): void {
  lines.push(`  ${index}. ${issue.type}`);
  lines.push(`     ${issue.description}`);
  if (issue.lineNumbers.length > 0) {
    lines.push(`     📍 Lines: ${issue.lineNumbers.slice(0, 5).join(', ')}`);
  }
  if (issue.recommendations.length > 0) {
    lines.push(`     💡 Fix: ${issue.recommendations[0]}`);
  }
  lines.push('');
}
