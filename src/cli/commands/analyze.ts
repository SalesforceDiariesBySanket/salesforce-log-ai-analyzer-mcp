/**
 * @module cli/commands/analyze
 * @description Analyze command - parse and analyze a debug log file
 * @status COMPLETE
 * @see src/cli/STATE.md
 * @dependencies commander, src/parser, src/analyzer, src/output
 * @lastModified 2026-01-31
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseLog } from '../../parser';
import { analyzeLog, type AnalysisResult } from '../../analyzer';
import { redactText, getPreset, configToOptions } from '../../privacy';

// ============================================================================
// Types
// ============================================================================

interface AnalyzeOptions {
  format: 'json' | 'text' | 'summary';
  output?: string;
  redact: boolean;
  verbose: boolean;
  maxEvents?: string;
  maxIssues?: string;
}

// ============================================================================
// Command Definition
// ============================================================================

export const analyzeCommand = new Command('analyze')
  .description('Parse and analyze a Salesforce debug log file')
  .argument('<file>', 'Path to the debug log file')
  .option('-f, --format <format>', 'Output format: json, text, or summary', 'json')
  .option('-o, --output <file>', 'Write output to file instead of stdout')
  .option('-r, --redact', 'Redact PII from output', false)
  .option('-v, --verbose', 'Include detailed event information', false)
  .option('--max-events <n>', 'Maximum events to include in output')
  .option('--max-issues <n>', 'Maximum issues to include in output')
  .action(async (file: string, options: AnalyzeOptions) => {
    await runAnalyze(file, options);
  });

// ============================================================================
// Implementation
// ============================================================================

async function runAnalyze(file: string, options: AnalyzeOptions): Promise<void> {
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

  const parsedLog = parseResult.data;

  // Run analysis
  const analysis = analyzeLog(parsedLog);

  // Format output
  const formatOptions = {
    maxEvents: options.maxEvents ? parseInt(options.maxEvents, 10) : undefined,
    maxIssues: options.maxIssues ? parseInt(options.maxIssues, 10) : 100,
    indent: options.format === 'json' ? 2 : 0,
  };

  let output: string;

  if (options.format === 'summary') {
    // Text summary format
    output = formatSummary(analysis);
  } else if (options.format === 'text') {
    // Human-readable text format
    output = formatTextOutput(analysis, options.verbose);
  } else {
    // JSON format
    output = JSON.stringify({
      metadata: parsedLog.metadata,
      summary: analysis.summary,
      issues: analysis.issues.slice(0, formatOptions.maxIssues),
      limitSummary: analysis.limitSummary,
      aiGuidance: analysis.aiGuidance,
    }, null, formatOptions.indent);
  }

  // Apply redaction if requested
  if (options.redact && options.format !== 'json') {
    const config = getPreset('MODERATE');
    const redactOptions = configToOptions(config);
    output = redactText(output, redactOptions).redacted;
  }

  // Write output
  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, output, 'utf-8');
    console.log(`Output written to: ${outputPath}`);
  } else {
    console.log(output);
  }
}

// ============================================================================
// Formatters
// ============================================================================

function formatSummary(analysis: AnalysisResult): string {
  const lines: string[] = [
    '=== Debug Log Analysis Summary ===',
    '',
    `Health Score: ${analysis.summary.healthScore}/100`,
    `Total Issues: ${analysis.issues.length}`,
    '',
  ];

  if (analysis.issues.length > 0) {
    lines.push('Top Issues:');
    analysis.issues.slice(0, 5).forEach((issue, i) => {
      lines.push(`  ${i + 1}. [${issue.severity}] ${issue.type}: ${issue.description}`);
    });
  }

  return lines.join('\n');
}

function formatTextOutput(
  analysis: AnalysisResult,
  verbose: boolean
): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════════╗',
    '║           Salesforce Debug Log Analysis Report                   ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    `📊 Health Score: ${analysis.summary.healthScore}/100`,
    '',
  ];

  // Issues section
  if (analysis.issues.length > 0) {
    lines.push('🔍 Issues Detected:');
    lines.push('─'.repeat(60));
    
    analysis.issues.forEach((issue, i) => {
      const icon = issue.severity === 'CRITICAL' || issue.severity === 'HIGH' ? '🔴' : 
                   issue.severity === 'MEDIUM' ? '🟡' : '🟢';
      lines.push(`${icon} ${i + 1}. ${issue.type}`);
      lines.push(`   Severity: ${issue.severity}`);
      lines.push(`   ${issue.description}`);
      if (verbose && issue.lineNumbers.length > 0) {
        lines.push(`   Lines: ${issue.lineNumbers.slice(0, 5).join(', ')}`);
      }
      lines.push('');
    });
  } else {
    lines.push('✅ No issues detected!');
  }

  // Limit Summary section
  if (verbose && analysis.limitSummary) {
    lines.push('');
    lines.push('📈 Governor Limits:');
    lines.push('─'.repeat(60));
    const soql = analysis.limitSummary.limitUsage['Queries'] ?? analysis.limitSummary.limitUsage['SOQL'];
    const dml = analysis.limitSummary.limitUsage['DmlStatements'] ?? analysis.limitSummary.limitUsage['DML'];
    if (soql) {
      lines.push(`   SOQL Queries: ${soql.used}/${soql.max} (${soql.percentUsed.toFixed(1)}%)`);
    }
    if (dml) {
      lines.push(`   DML Operations: ${dml.used}/${dml.max} (${dml.percentUsed.toFixed(1)}%)`);
    }
    lines.push(`   Overall Status: ${analysis.limitSummary.overallHealth}`);
  }

  return lines.join('\n');
}
