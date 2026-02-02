# Module: CLI

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: @copilot (Phase 8 Complete)

---

## Purpose

Developer-facing CLI for setup, manual analysis, and verification.

---

## Status: ✅ COMPLETE

**Progress**: 5/5 tasks complete  
**⚠️ Warning**: Integration tests not yet written!

---

## Dependencies

### This Module Depends On
- `commander` - CLI framework
- `src/parser/` - Parse logs
- `src/analyzer/` - Analyze logs
- `src/output/` - Format output
- `src/privacy/` - Redaction support

### Modules That Depend On This
- None (end-user facing)

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | ~70 | CLI entry point with Commander.js |
| `commands/index.ts` | [x] | ~15 | Command exports |
| `commands/analyze.ts` | [x] | ~180 | `sf-debug analyze <file>` |
| `commands/query.ts` | [x] | ~190 | `sf-debug query <file> <filter>` |
| `commands/issues.ts` | [x] | ~160 | `sf-debug issues <file>` |
| `commands/summary.ts` | [x] | ~120 | `sf-debug summary <file>` |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Key Interfaces

```typescript
// analyze command options
interface AnalyzeOptions {
  format: 'json' | 'text' | 'summary';
  output?: string;
  redact: boolean;
  verbose: boolean;
  maxEvents?: string;
  maxIssues?: string;
}

// query command options
interface QueryOptions {
  type?: string;
  severity?: string;
  namespace?: string;
  limit?: string;
  offset?: string;
  format: 'json' | 'text';
  redact: boolean;
}

// issues command options
interface IssuesOptions {
  severity?: string;
  type?: string;
  limit?: string;
  format: 'json' | 'text';
  redact: boolean;
}
```

---

## CLI Usage

```bash
# Show help
npx sf-debug --help

# Analyze a debug log
npx sf-debug analyze debug.log
npx sf-debug analyze debug.log --format json --redact
npx sf-debug analyze debug.log --verbose --output analysis.json

# Query events
npx sf-debug query debug.log --type SOQL --limit 10
npx sf-debug query debug.log --namespace MyPackage --format text

# List issues
npx sf-debug issues debug.log
npx sf-debug issues debug.log --severity high
npx sf-debug issues debug.log --type SOQL_IN_LOOP --format json

# Quick summary
npx sf-debug summary debug.log
npx sf-debug summary debug.log --format json
```

---

## Commands

### analyze
Parse and analyze a debug log file.

Options:
- `-f, --format <format>` - Output format: json, text, or summary (default: json)
- `-o, --output <file>` - Write output to file instead of stdout
- `-r, --redact` - Redact PII from output
- `-v, --verbose` - Include detailed event information
- `--max-events <n>` - Maximum events to include
- `--max-issues <n>` - Maximum issues to include

### query
Query events in a debug log with filters.

Options:
- `-t, --type <type>` - Filter by event type (SOQL, DML, METHOD, etc.)
- `-n, --namespace <ns>` - Filter by namespace
- `-l, --limit <n>` - Limit results (default: 20)
- `--offset <n>` - Skip first N results
- `-f, --format <format>` - Output format: json or text
- `-r, --redact` - Redact PII from output

### issues
List detected issues in a debug log.

Options:
- `-s, --severity <level>` - Filter by severity (critical, high, medium, low)
- `-t, --type <type>` - Filter by issue type
- `-l, --limit <n>` - Limit results
- `-f, --format <format>` - Output format: json or text
- `-r, --redact` - Redact PII from output

### summary
Generate a quick AI-optimized summary (<500 tokens).

Options:
- `-f, --format <format>` - Output format: json or text
- `-r, --redact` - Redact PII from output

---

## Testing

```bash
# Manual testing
npx sf-debug --help
npx sf-debug analyze __fixtures__/logs/simple/success.log
npx sf-debug issues __fixtures__/logs/soql/soql-in-loop.log
```

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Set up Commander.js | [x] | Main program structure |
| 2 | `analyze` command | [x] | JSON/text/summary output |
| 3 | `query` command | [x] | Filter + pagination |
| 4 | `issues` command | [x] | Grouped by severity |
| 5 | `summary` command | [x] | AI-optimized output |
