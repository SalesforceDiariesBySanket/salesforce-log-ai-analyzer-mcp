# SF Debug Analyzer

> AI-First Salesforce Debug Log Analyzer - Local-first, AI-optimized debug log analysis for Salesforce via MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

## Overview

SF Debug Analyzer is a comprehensive tool for parsing and analyzing Salesforce debug logs with a focus on AI agent integration. It provides intelligent issue detection, async job correlation, and privacy-preserving analysis through the Model Context Protocol (MCP).

## Features

### 🔍 Intelligent Log Parsing
- **High-fidelity tokenizer** - Parses all Salesforce debug log event types with line-by-line accuracy
- **AST builder** - Creates hierarchical call trees with proper parent-child relationships
- **Truncation handling** - Detects and recovers from log truncation, providing impact analysis
- **Streaming support** - Memory-efficient parsing for large log files

### 🚨 Issue Detection
- **SOQL in Loops** - Detects queries inside iteration blocks with exact line locations
- **N+1 Query Patterns** - Identifies repeated queries suggesting missing bulkification
- **Governor Limit Analysis** - Tracks CPU time, heap, SOQL limits with threshold warnings
- **Non-Selective Queries** - Flags queries without proper indexing
- **Recursive Triggers** - Detects trigger re-entry patterns
- **CPU Hotspots** - Identifies methods consuming excessive CPU time
- **Exception Tracking** - Captures unhandled exceptions with full stack traces

### 🏢 Managed Package Support
- **Namespace Detection** - Identifies managed package namespaces in logs
- **Attribution Engine** - Attributes issues to specific packages or org code
- **Visibility Classification** - Determines what's visible vs. hidden in ISV logs
- **AI Guidance** - Provides actionable recommendations based on package ownership

### 🔗 Async Job Correlation
- **Job Extraction** - Identifies Queueable, Batch, Future, and Schedulable references
- **Cross-Log Tracking** - Correlates parent logs with async child executions
- **Confidence Scoring** - Rates correlation confidence based on timing and context
- **Unified View** - Presents async chains as cohesive execution flows

### 🔒 Privacy & Redaction
- **PII Detection** - Identifies emails, phone numbers, SSNs, credit cards
- **Credential Masking** - Redacts API keys, tokens, passwords
- **Custom Patterns** - Configure organization-specific sensitive data patterns
- **Audit Trail** - Tracks what was redacted without exposing original values

### 🧠 Memory System
- **Solution Storage** - Saves successful fixes for future reference
- **Episodic Memory** - Recalls past debugging sessions by context
- **Semantic Search** - Finds relevant past solutions using similarity matching
- **SQLite Persistence** - Local-first storage with no cloud dependency

### 🤖 MCP Server Integration
Built for AI assistants like GitHub Copilot, Claude, and others via the Model Context Protocol:

| Tool | Description |
|------|-------------|
| `sf_debug_setup` | Connect to Salesforce org via SFDX CLI |
| `sf_debug_list_logs` | List available debug logs |
| `sf_debug_get_log` | Fetch a specific debug log |
| `sf_debug_parse_content` | Parse raw log content directly |
| `sf_debug_parse_file` | Parse log from file path (recommended for >1MB logs) |
| `sf_debug_summary` | Get AI-optimized summary (<500 tokens) |
| `sf_debug_issues` | Detect issues with severity and fix suggestions |
| `sf_debug_query` | Query events with flexible filters |
| `sf_debug_problem_context` | Get AI-optimized context for specific issues |
| `sf_debug_async_jobs` | Extract async job references |
| `sf_debug_correlate` | Correlate parent log with async children |
| `sf_debug_store_solution` | Store working solutions for learning |
| `sf_debug_memory_stats` | Get memory system statistics |
| `sf_debug_end_session` | End session with outcome feedback |

### 📟 CLI Interface
```bash
# Analyze a debug log
sf-debug analyze /path/to/debug.log

# List issues with severity filtering
sf-debug issues /path/to/debug.log --min-severity HIGH

# Get a summary
sf-debug summary /path/to/debug.log

# Query specific events
sf-debug query /path/to/debug.log --type SOQL_EXECUTE_BEGIN
```

## Installation

```bash
npm install sf-debug-analyzer
```

## Quick Start

### As MCP Server (AI Assistants)

Add to your VS Code MCP settings (`%APPDATA%\Code\User\mcp.json` on Windows, `~/Library/Application Support/Code/User/mcp.json` on macOS):

```json
{
  "servers": {
    "sf-debug-analyzer": {
      "type": "stdio",
      "command": "npx",
      "args": ["sf-debug-mcp"]
    }
  }
}
```

For Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sf-debug": {
      "command": "npx",
      "args": ["sf-debug-mcp"]
    }
  }
}
```

### Programmatic Usage

```typescript
import { parseLog, detectIssues, getSummary } from 'sf-debug-analyzer';

// Parse a log file
const result = await parseLog(logContent);
console.log(`Parsed ${result.events.length} events`);

// Detect issues
const issues = detectIssues(result);
issues.forEach(issue => {
  console.log(`[${issue.severity}] ${issue.title}`);
});

// Get AI-optimized summary
const summary = getSummary(result);
console.log(summary.text);
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format
```

## Project Structure

```
src/
├── parser/       # Log tokenization and AST building
├── analyzer/     # Issue detection and categorization  
├── async/        # Async job correlation
├── capture/      # Salesforce authentication and log fetching
├── cli/          # Command-line interface
├── managed/      # Managed package attribution
├── mcp/          # MCP server for AI assistants
├── memory/       # Solution memory with SQLite persistence
├── output/       # Formatters and problem context
├── privacy/      # Data redaction
└── types/        # TypeScript type definitions
```

## Acknowledgments

This project draws inspiration from several excellent Salesforce debugging tools in the community:

- [Certinia/debug-log-analyzer](https://github.com/Certinia/debug-log-analyzer) - Flame chart visualization and namespace analysis
- [apex-log-parser](https://github.com/financialforcedev/apex-log-parser) - JSON output format patterns
- [Salesforce Apex Replay Debugger](https://developer.salesforce.com/tools/vscode/en/apex/replay-debugger) - Debug context concepts

## License

MIT License - see [LICENSE](LICENSE) file for details.
