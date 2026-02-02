# SF Debug Analyzer

> AI-First Salesforce Debug Log Analyzer - Local-first, AI-optimized debug log analysis for Salesforce via MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

## Features

- **🔍 Intelligent Log Parsing** - Parse Salesforce debug logs with high accuracy
- **🚨 Issue Detection** - Automatically detect SOQL in loops, governor limit violations, exceptions, and more
- **🧠 Memory System** - Learn from past solutions and suggest fixes
- **🔗 Async Correlation** - Track Queueable, Batch, Future, and Schedulable jobs across logs
- **🔒 Privacy-First** - Redact sensitive data (PII, credentials, custom patterns)
- **🤖 AI-Optimized** - MCP (Model Context Protocol) server for AI assistants

## Installation

```bash
npm install sf-debug-analyzer
```

## Quick Start

### CLI Usage

```bash
# Parse a debug log
sf-debug parse /path/to/debug.log

# Analyze issues
sf-debug analyze /path/to/debug.log

# Connect to Salesforce org
sf-debug connect --alias myorg
```

### MCP Server (AI Assistants)

Add to your VS Code MCP settings (`%APPDATA%\Code\User\mcp.json`):

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

Or for Claude Desktop (`claude_desktop_config.json`):

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

## MCP Tools Available

| Tool | Description |
|------|-------------|
| `sf_debug_parse_content` | Parse raw log content |
| `sf_debug_parse_file` | Parse log from file path (recommended for large logs) |
| `sf_debug_summary` | Get AI-optimized summary (<500 tokens) |
| `sf_debug_issues` | Detect issues with severity and fix suggestions |
| `sf_debug_query` | Query events with flexible filters |
| `sf_debug_async_jobs` | Extract async job references |
| `sf_debug_store_solution` | Store working solutions for future recall |
| `sf_debug_end_session` | End session with outcome feedback |
| `sf_debug_memory_stats` | Get memory system statistics |

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

## Architecture

See [Architecture Documentation](Architecture/AI_SALESFORCE_DEBUG_ARCHITECTURE_V2.md) for detailed design.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions welcome! Please read the [conventions](Project%20Management%20and%20Tracking/CONVENTIONS.md) before submitting PRs.
