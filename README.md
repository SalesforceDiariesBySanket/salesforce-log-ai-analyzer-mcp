# Salesforce Log AI Analyzer - MCP

> AI-First Salesforce Debug Log Analyzer - Local-first, AI-optimized debug log analysis for Salesforce via MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![GitHub Stars](https://img.shields.io/github/stars/SalesforceDiariesBySanket/salesforce-log-ai-analyzer-mcp)](https://github.com/SalesforceDiariesBySanket/salesforce-log-ai-analyzer-mcp/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/SalesforceDiariesBySanket/salesforce-log-ai-analyzer-mcp)](https://github.com/SalesforceDiariesBySanket/salesforce-log-ai-analyzer-mcp/issues)

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
# Analyze a debug log with full output
sf-debug analyze /path/to/debug.log

# Output as JSON
sf-debug analyze /path/to/debug.log --format json

# Analyze with PII redaction
sf-debug analyze /path/to/debug.log --redact

# List issues with severity filtering
sf-debug issues /path/to/debug.log --min-severity HIGH

# Get a token-efficient summary (<500 tokens)
sf-debug summary /path/to/debug.log

# Query specific events with filtering
sf-debug query /path/to/debug.log --type SOQL_EXECUTE_BEGIN

# Query with pagination
sf-debug query /path/to/debug.log --type SOQL --limit 10
```

## Prerequisites

Before installing, ensure you have:

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- **Git** (for cloning the repository)
- **Salesforce CLI (SFDX)** - Optional, but recommended for authentication
  ```bash
  npm install -g @salesforce/cli
  ```

## Installation

### Clone from GitHub

```bash
# Clone the repository
git clone https://github.com/SalesforceDiariesBySanket/salesforce-log-ai-analyzer-mcp.git
cd salesforce-log-ai-analyzer-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Link for Local Development

To use the CLI commands globally during development:

```bash
# Link the package globally
npm link

# Now you can use the CLI anywhere
sf-debug --help
sf-debug-mcp --help
```

## Quick Start

### As MCP Server (AI Assistants)

Add to your VS Code MCP settings:
- **Windows**: `%APPDATA%\Code\User\mcp.json`
- **macOS**: `~/Library/Application Support/Code/User/mcp.json`
- **Linux**: `~/.config/Code/User/mcp.json`

**Windows Example:**
```json
{
  "servers": {
    "sf-debug-analyzer": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\Users\\YourUsername\\path\\to\\salesforce-log-ai-analyzer-mcp\\dist\\mcp\\index.js"]
    }
  }
}
```

**macOS/Linux Example:**
```json
{
  "servers": {
    "sf-debug-analyzer": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/salesforce-log-ai-analyzer-mcp/dist/mcp/index.js"]
    }
  }
}
```

**Important Notes:**
- Use **absolute paths** (not relative paths like `./dist/mcp/index.js`)
- On Windows, use double backslashes (`\\`) or forward slashes (`/`)
- Run `npm run build` first to create the `dist` folder
- Restart VS Code or reload the MCP connection after changes

For Claude Desktop (`claude_desktop_config.json`):

**Windows:**
```json
{
  "mcpServers": {
    "sf-debug": {
      "command": "node",
      "args": ["C:\\Users\\YourUsername\\path\\to\\salesforce-log-ai-analyzer-mcp\\dist\\mcp\\index.js"]
    }
  }
}
```

**macOS/Linux:**
```json
{
  "mcpServers": {
    "sf-debug": {
      "command": "node",
      "args": ["/absolute/path/to/salesforce-log-ai-analyzer-mcp/dist/mcp/index.js"]
    }
  }
}
```

### Programmatic Usage

```typescript
import { parseLog, analyzeLog, generateSummary } from './dist/index.js';

// Parse a log file
const result = parseLog(logContent);
if (result.success) {
  console.log(`Parsed ${result.data.events.length} events`);

  // Analyze for issues
  const analysis = analyzeLog(result.data);
  analysis.issues.forEach(issue => {
    console.log(`[${issue.severity}] ${issue.title}`);
  });

  // Get AI-optimized summary (<500 tokens)
  const summary = generateSummary(result.data, analysis);
  console.log(`Health: ${summary.health}/100`);
}
```

## Salesforce Authentication

The tool supports multiple authentication methods for connecting to Salesforce orgs:

| Method | Best For | Requirements |
|--------|----------|--------------|
| **SFDX Import** | Most users | Salesforce CLI installed with cached auth |
| **OAuth PKCE** | Local development | Browser access, localhost available |
| **Device Code** | Remote/headless (SSH, Codespaces) | Org allows device code flow |
| **Manual Token** | Fallback | Session ID from Developer Console |

### Recommended: Use SFDX CLI

```bash
# Authenticate to your org using Salesforce CLI first
sf org login web --alias myorg

# The analyzer will automatically detect and use this auth
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Build in watch mode (for development)
npm run build:watch

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific module tests
npm run test:parser
npm run test:analyzer
npm run test:mcp

# Lint
npm run lint

# Lint and fix
npm run lint:fix

# Format
npm run format
```

## Post-Installation Verification

After installation, verify everything works:

```bash
# 1. Check the build completed successfully
npm run build

# 2. Verify CLI is working
node dist/cli/index.js --help

# 3. Run tests
npm test

# 4. Test with a sample log (if available)
node dist/cli/index.js analyze __fixtures__/logs/simple/success.log
```

## Architecture

This tool is designed **AI-First** - meaning AI agents (Claude, GitHub Copilot, etc.) are the primary consumers, with developers as secondary users via CLI.

### Design Principles

- **Structured Output** → JSON/JSONL, not prose (AI generates explanations)
- **Token-Efficient** → Summary first, details on demand
- **Confidence-Scored** → Probabilistic, not deterministic (enables AI to communicate uncertainty)
- **Local-First** → No cloud dependency, SQLite persistence
- **Memory-Enabled** → Learns from past debugging sessions
- **Privacy-Conscious** → Auto-redact PII, opt-in persistence

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Streaming Parser** | Memory-efficient parsing for 20MB+ logs |
| **Truncation Handling** | Graceful degradation when logs are cut off |
| **Debug Level Awareness** | Adapts analysis based on log verbosity |
| **Multi-Auth Support** | PKCE, Device Code, SFDX import, Manual token |
| **Trace Flag Management** | Auto-create with optimal debug levels |

## Project Structure

```
src/
├── parser/       # Log tokenization and AST building
├── analyzer/     # Issue detection and categorization  
├── async/        # Async job correlation (Batch, Queueable, Future)
├── capture/      # Salesforce authentication and log fetching
├── cli/          # Command-line interface
├── managed/      # Managed package attribution
├── mcp/          # MCP server for AI assistants
├── memory/       # Solution memory with SQLite persistence
├── output/       # Formatters and problem context
├── privacy/      # Data redaction (PII, credentials)
└── types/        # TypeScript type definitions
```

## Debug Level Presets

The tool includes 11 optimized debug level presets for different debugging scenarios:

| Preset | Use Case |
|--------|----------|
| `minimal` | Low overhead, production monitoring |
| `soql_analysis` | SOQL limit issues, query optimization |
| `governor_limits` | Track all governor limit consumption |
| `triggers` | Trigger recursion, DML issues |
| `cpu_hotspots` | CPU timeout, method profiling |
| `exceptions` | Exception tracking with stack traces |
| `callouts` | External HTTP callout debugging |
| `visualforce` | VF page performance |
| `workflow` | Process Builder, Flow debugging |
| `full_diagnostic` | Maximum detail (high overhead) |
| `ai_optimized` | Balanced for AI analysis |

## Acknowledgments

This project draws inspiration from several excellent Salesforce debugging tools and libraries in the community:

### Log Analysis & Parsing
- [Certinia/debug-log-analyzer](https://github.com/Certinia/debug-log-analyzer) - Flame chart visualization, call tree rendering, SOQL selectivity analysis, governor limits by namespace
- [financialforcedev/apex-log-parser](https://github.com/financialforcedev/apex-log-parser) - JSON output format patterns, `jq` piping support, tree renderer, flat event array design
- [python-apex-log-parser](https://github.com/amansaroj/python-apex-log-parser) - Subscriber/ISV log parsing, query ownership hierarchy for namespace attribution

### Authentication & Log Capture
- [felisbinofarms/salesforce-debug-log-analyzer](https://github.com/felisbinofarms/salesforce-debug-log-analyzer) - OAuth PKCE flow implementation, trace flag management, N+1 query detection, Material Design patterns

### Visualization & Patterns
- [SFDC-Log](https://github.com/apalaniuk/SFDC-Log) - Git-graph style visualization concepts, trigger pattern detection methodologies

### ML & Anomaly Detection (Future Roadmap)
- [salesforce/logai](https://github.com/salesforce/logai) - ML anomaly detection concepts (Isolation Forest, LSTM), Drain log parser, OpenTelemetry compatibility patterns

### Official Salesforce Tools
- [Salesforce Apex Replay Debugger](https://developer.salesforce.com/tools/vscode/en/apex/replay-debugger) - Debug context concepts, step-through execution patterns

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `better-sqlite3` build fails | Ensure you have build tools installed: `npm install -g windows-build-tools` (Windows) or `xcode-select --install` (macOS) |
| Auth fails in remote environment | Use Device Code flow or SFDX import instead of PKCE |
| Logs not captured | Verify trace flags are set on correct user (including "Automated Process" for async jobs) |
| MCP server not connecting | 1. Verify `dist` folder exists (run `npm run build`)<br>2. Use absolute paths in mcp.json, not relative paths<br>3. On Windows, use double backslashes: `C:\\Users\\...\\dist\\mcp\\index.js`<br>4. Restart VS Code after config changes |
| Module not found error | Check that the path in mcp.json matches your actual project location and includes `\\dist\\mcp\\index.js` at the end |

### Async Job Logging Note

When debugging async jobs (Batch, Queueable, Future), ensure trace flags are set on **both**:
1. The user triggering the action
2. The "Automated Process" user (for system-context async execution)

## License

MIT License - see [LICENSE](LICENSE) file for details.
