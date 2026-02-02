# Module: MCP Server

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-02-01 | Updated By: @copilot | **RELEASE READY** ✓

---

## Purpose

Expose tools for AI assistants via MCP (Model Context Protocol).

---

## Status: ✅ RELEASE READY

**Progress**: 9/9 tools implemented (6 core + 3 memory)  
**SQLite**: ✅ INSTALLED - Memory persistence working  
**Tests**: ✅ All 15 MCP tests passing  
**Version**: 0.8.0

---

## ⚠️ CAVEATS & LIMITATIONS FOR AI ASSISTANTS

> **CRITICAL**: Read this section before using MCP tools!

### 1. Large Log Files (>1MB)
- **Problem**: AI assistants cannot read 20MB+ files with 45k lines into context
- **Solution**: Use `sf_debug_parse_file` instead of `sf_debug_parse_content`
- **How**: Pass the absolute file path; the MCP server reads the file directly

```
# DON'T: Try to read large file content, then pass to sf_debug_parse_content
# DO: Pass file path directly to sf_debug_parse_file
sf_debug_parse_file(filePath="/path/to/large-debug.log")
```

### 2. Content Size Limits
| Limit | Value | Tool |
|-------|-------|------|
| Max content size | 50MB | Both parse tools |
| Max cached logs | 10 | Server-wide (LRU eviction) |

### 3. Output Truncation
| Tool | Default Limit | Override |
|------|---------------|----------|
| `sf_debug_issues` | 20 issues | `limit` param |
| `sf_debug_query` | 50 events | `limit` param |
| Event messages | 200 chars | N/A (always truncated) |

### 4. Memory System
- Solutions persist across sessions (SQLite) ✅ **WORKING**
- Session auto-starts on first log parse
- Call `sf_debug_end_session` to record outcomes for learning
- **Storage**: ~36KB after initial tests, grows with stored solutions

---

## Dependencies

### This Module Depends On
- `@modelcontextprotocol/sdk` ^1.25.3 - MCP protocol
- `zod` ^3.25.76 - Schema validation
- `better-sqlite3` ^11.8.1 - ✅ Persistent storage (via memory layer)
- `src/parser/` - Parse logs
- `src/analyzer/` - Analyze logs
- `src/output/` - Format output
- `src/capture/` - Connect to Salesforce
- `src/async/` - Correlate async jobs
- `src/memory/` - Recall/store solutions ✅ SQLite active

### Modules That Depend On This
- None (AI-facing endpoint)

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | ~70 | MCP server entry with graceful shutdown |
| `server.ts` | [x] | ~865 | MCP protocol handler with memory integration |
| `tools/index.ts` | [x] | ~70 | Tool categories, exports, and caveats |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## MCP Tools (9 total)

### Debug Session Tools (2)
| Tool | Description | When to Use |
|------|-------------|-------------|
| `sf_debug_parse_content` | Parse raw log content directly | Small logs (<1MB) that AI can read |
| `sf_debug_parse_file` | Parse log from file path | **Large logs (>1MB) - PREFERRED** |

### Analysis Tools (3)
| Tool | Description |
|------|-------------|
| `sf_debug_summary` | Get AI-optimized summary (<500 tokens) |
| `sf_debug_issues` | Get detected issues with severity + memory suggestions |
| `sf_debug_query` | Query events with flexible filters |

### Async Correlation Tools (1)
| Tool | Description |
|------|-------------|
| `sf_debug_async_jobs` | Extract async job references |

### Memory Tools (3) ✓ INTEGRATED
| Tool | Description |
|------|-------------|
| `sf_debug_store_solution` | Store a working solution for future recall |
| `sf_debug_end_session` | End session with outcome and feedback |
| `sf_debug_memory_stats` | Get memory system statistics |

---

## Tool Selection Guide

```
Is the log file >1MB or >10k lines?
├── YES → Use sf_debug_parse_file (pass file path)
└── NO  → Use sf_debug_parse_content (pass content string)

After parsing:
├── Need quick overview? → sf_debug_summary
├── Looking for problems? → sf_debug_issues  
├── Need specific events? → sf_debug_query
└── Looking for async jobs? → sf_debug_async_jobs
```

---

## VS Code Copilot Configuration

Add to `%APPDATA%\Code\User\mcp.json`:

```json
{
  "servers": {
    "sf-debug-analyzer": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\path\\to\\LogAnalyzerCertinav2\\dist\\mcp\\index.js"]
    }
  }
}
```

---

## Usage

```bash
# Run MCP server directly
npx sf-debug-mcp

# Or via npm script
npm run mcp

# Configure in Claude Desktop
# Add to claude_desktop_config.json:
{
  "mcpServers": {
    "sf-debug": {
      "command": "npx",
      "args": ["sf-debug-mcp"]
    }
  }
}
```

---

## Testing

```bash
npm run test:mcp
# 15 tests: Server State (3), Parse (2), Analysis (2), Query (1), Async (1), Memory (5), Summary (1)
# All tests passing with SQLite persistence ✅
```

### Test Results (2026-02-01)
- ✅ Server State: initializes, caches logs with eviction, sets current log id
- ✅ Parse Content: parses valid debug log, caches parsed log
- ✅ Issues Analysis: detects SOQL in loop pattern, categorizes by severity
- ✅ Event Query: filters events by type
- ✅ Async Jobs: extracts async job references
- ✅ Memory Layer: MCP uses MemoryManager, session starts on parse, recall works, solutions stored, end-to-end works

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | MCP server setup | [x] | server.ts with protocol handler |
| 2 | sf_debug_parse_content | [x] | Direct content parsing + session start |
| 3 | sf_debug_parse_file | [x] | File-based parsing for large logs |
| 4 | sf_debug_summary | [x] | AI-optimized <500 tokens |
| 5 | sf_debug_issues | [x] | Issue detection + memory recall |
| 6 | sf_debug_query | [x] | Event filtering |
| 7 | sf_debug_async_jobs | [x] | Extract async refs |
| 8 | sf_debug_store_solution | [x] | Store working solutions |
| 9 | sf_debug_end_session | [x] | End with outcome/feedback |
| 10 | sf_debug_memory_stats | [x] | Memory statistics |

## Memory Integration Features
- Session starts automatically on first log parse
- Memory recall runs when issues are detected (provides suggestions)
- Solutions can be stored for future recall
- Sessions can be ended with outcomes for learning

---

## Changelog

| Date | Change | By |
|------|--------|-----|
| 2026-02-01 | All 9 MCP tools complete, SQLite persistence working, 15 tests passing | @copilot |
| 2026-01-31 | Initial MCP server with 6 core tools | @copilot |
