#!/usr/bin/env node
/**
 * @module cli/index
 * @description CLI entry point for developer-facing commands
 * @status COMPLETE
 * @see src/cli/STATE.md
 * @dependencies commander, src/parser, src/analyzer
 * @lastModified 2026-01-31
 */

import { Command } from 'commander';
import { analyzeCommand, queryCommand, issuesCommand, summaryCommand } from './commands';

// ============================================================================
// Program Definition
// ============================================================================

const program = new Command();

program
  .name('sf-debug')
  .description('AI-First Salesforce Debug Log Analyzer - Parse, analyze, and query debug logs')
  .version('0.7.0');

// ============================================================================
// Register Commands
// ============================================================================

program.addCommand(analyzeCommand);
program.addCommand(queryCommand);
program.addCommand(issuesCommand);
program.addCommand(summaryCommand);

// ============================================================================
// Default Action (no command)
// ============================================================================

program.action(() => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║            sf-debug - Salesforce Debug Log Analyzer              ║
╚══════════════════════════════════════════════════════════════════╝

Usage: sf-debug <command> [options]

Commands:
  analyze <file>   Parse and analyze a debug log file
  query <file>     Query events in a debug log
  issues <file>    List detected issues
  summary <file>   Generate quick AI-optimized summary

Examples:
  sf-debug analyze debug.log --format json
  sf-debug query debug.log --type SOQL --limit 10
  sf-debug issues debug.log --severity high
  sf-debug summary debug.log

Options:
  -h, --help       Show help
  -V, --version    Show version

Run 'sf-debug <command> --help' for more information on a command.
`);
});

// ============================================================================
// Parse Arguments
// ============================================================================

program.parse(process.argv);

