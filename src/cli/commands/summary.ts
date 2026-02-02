/**
 * @module cli/commands/summary
 * @description Summary command - quick <500 token summary for AI consumption
 * @status COMPLETE
 * @see src/cli/STATE.md
 * @dependencies commander, src/parser, src/analyzer
 * @lastModified 2026-01-31
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseLog } from '../../parser';
import { analyzeLog, generateSummary, type LogSummary } from '../../analyzer';
import { redactText, getPreset, configToOptions } from '../../privacy';

// ============================================================================
// Types
// ============================================================================

interface SummaryOptions {
  format: 'json' | 'text';
  redact: boolean;
}

// ============================================================================
// Command Definition
// ============================================================================

export const summaryCommand = new Command('summary')
  .description('Generate a quick summary of a debug log (AI-optimized, <500 tokens)')
  .argument('<file>', 'Path to the debug log file')
  .option('-f, --format <format>', 'Output format: json or text', 'text')
  .option('-r, --redact', 'Redact PII from output', false)
  .action(async (file: string, options: SummaryOptions) => {
    await runSummary(file, options);
  });

// ============================================================================
// Implementation
// ============================================================================

async function runSummary(file: string, options: SummaryOptions): Promise<void> {
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

  // Generate summary
  const summary = generateSummary(parseResult.data, analysis);

  // Format output
  let output: string;
  if (options.format === 'json') {
    output = JSON.stringify(summary, null, 2);
  } else {
    output = formatTextSummary(summary);
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
// Formatter
// ============================================================================

function formatTextSummary(summary: LogSummary): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════',
    '               DEBUG LOG SUMMARY (<500 tokens)              ',
    '═══════════════════════════════════════════════════════════',
    '',
  ];

  // Health
  const riskLevel = summary.health >= 80 ? 'low' : summary.health >= 50 ? 'medium' : 'high';
  const riskIcon = riskLevel === 'high' ? '🔴' : 
                   riskLevel === 'medium' ? '🟡' : '🟢';
  lines.push(`Health Score: ${summary.health}/100 ${riskIcon}`);
  lines.push(`Status: ${summary.status}`);
  lines.push('');

  // Key Metrics
  lines.push('📊 Key Metrics:');
  lines.push(`   Events: ${summary.metrics.events}`);
  lines.push(`   Issues: ${summary.metrics.issues} (${summary.metrics.criticalHigh} critical/high)`);
  lines.push(`   SOQL Queries: ${summary.metrics.soqlCount}`);
  lines.push(`   DML Operations: ${summary.metrics.dmlCount}`);
  if (summary.metrics.cpuTimeMs !== undefined) {
    lines.push(`   CPU Time: ${summary.metrics.cpuTimeMs}ms`);
  }
  lines.push('');

  // Top Issues
  if (summary.topIssues.length > 0) {
    lines.push('🔍 Top Issues:');
    summary.topIssues.forEach((issue, i) => {
      const icon = issue.sev === 'C' || issue.sev === 'H' ? '🔴' : 
                   issue.sev === 'M' ? '🟡' : '🟢';
      lines.push(`   ${i + 1}. ${icon} ${issue.type}`);
      lines.push(`      ${issue.desc}`);
    });
    lines.push('');
  }

  // Limit Warnings
  if (summary.limitWarnings.length > 0) {
    lines.push('⚠️ Limit Warnings:');
    summary.limitWarnings.forEach((warning) => {
      lines.push(`   - ${warning}`);
    });
    lines.push('');
  }

  // Recommendations
  if (summary.recommendations.length > 0) {
    lines.push('💡 Recommendations:');
    summary.recommendations.slice(0, 3).forEach((rec, i) => {
      lines.push(`   ${i + 1}. ${rec}`);
    });
  }

  lines.push('');
  lines.push(`Token estimate: ~${summary.tokenCount}`);
  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}
