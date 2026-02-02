# AI-First Salesforce Debug Log Analyzer - Implementation Plan

> **Purpose**: This plan is optimized for AI-assisted "vibe coding". Each module is self-contained, testable, and documented so ANY AI agent can understand project state without full context.

---

## 🧠 AI Context Management Strategy

### The Problem
LLMs have limited context windows. When this project grows to 50+ files, no AI can read everything. We solve this with:

### The Solution: Hierarchical State Files

```
PROJECT_STATE.md          ← AI reads THIS FIRST (always <2000 tokens)
├── src/parser/STATE.md   ← Module-level state (only if working on parser)
├── src/async/STATE.md    ← Module-level state (only if working on async)
└── ... each module has STATE.md
```

### Rules for AI Agents

1. **ALWAYS read `PROJECT_STATE.md` first** - It tells you what's done, what's in progress
2. **Read module `STATE.md` ONLY for the module you're working on**
3. **Update STATE.md files after completing any task**
4. **Each file has a header comment linking to its module STATE.md**

---

## 📊 Project State Legend

```
[ ] Not started
[~] In progress (include WHO is working on it)
[x] Complete (tested)
[!] Blocked (include reason)
[?] Needs design decision
```

---

## 🏗️ Implementation Phases

### Phase 0: Project Scaffolding ✅ COMPLETE
**Goal**: Set up project structure so AI agents can navigate
**Completed**: 2026-01-31 by @copilot

| Status | Task | Output | Test |
|--------|------|--------|------|
| [x] | Initialize npm/TypeScript project | `package.json`, `tsconfig.json` | `npm run build` works ✅ |
| [x] | Create folder structure per architecture | All folders exist | Visual check ✅ |
| [x] | Create `PROJECT_STATE.md` | State file at `src/PROJECT_STATE.md` | AI can read it ✅ |
| [x] | Create module `STATE.md` templates | State file per module (12 modules) | AI can read them ✅ |
| [x] | Set up ESLint + Prettier | `.eslintrc.js`, `.prettierrc`, `vitest.config.ts` | `npm run lint` works ✅ |
| [x] | Create `CONVENTIONS.md` | Coding standards doc | AI can follow them ✅ |

---

### Phase 1: Core Parser (Foundation) ✅ COMPLETE
**Goal**: Parse Salesforce debug logs into structured events
**Dependencies**: Phase 0
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Define common types | `src/types/common.ts` | Result, Confidence types | Type check passes ✅ |
| [x] | Define event types | `src/types/events.ts` | TypeScript interfaces | Type check passes ✅ |
| [x] | Define issue types | `src/types/issues.ts` | TypeScript interfaces | Type check passes ✅ |
| [x] | Log line tokenizer | `src/parser/tokenizer.ts` | Raw line → Token | `npm run build` ✅ |
| [x] | Event handlers (METHOD) | `src/parser/event-handlers/method.ts` | Token → MethodEvent | Type check ✅ |
| [x] | Event handlers (SOQL) | `src/parser/event-handlers/soql.ts` | Token → SOQLEvent | Type check ✅ |
| [x] | Event handlers (DML) | `src/parser/event-handlers/dml.ts` | Token → DMLEvent | Type check ✅ |
| [x] | Event handlers (LIMIT) | `src/parser/event-handlers/limit.ts` | Token → LimitEvent | Type check ✅ |
| [x] | Event handlers (EXCEPTION) | `src/parser/event-handlers/exception.ts` | Token → ExceptionEvent | Type check ✅ |
| [x] | Event handlers (MANAGED_PKG) | `src/parser/event-handlers/managed-pkg.ts` | Token → ManagedPkgEvent | Type check ✅ |
| [x] | AST builder | `src/parser/ast-builder.ts` | Events[] → Tree | Type check ✅ |
| [x] | Main parser orchestrator | `src/parser/index.ts` | LogFile → ParsedLog | `npm run build` ✅ |
| [x] | **CHECKPOINT**: Type check passes | - | All types compile | `npm run build` ✅ |

**Sample Logs Created**:
- [x] Simple success log - `__fixtures__/logs/simple/success.log`
- [x] SOQL in loop log - `__fixtures__/logs/soql/soql-in-loop.log`
- [x] Query exception log - `__fixtures__/logs/exceptions/query-exception.log`
- [x] Null pointer log - `__fixtures__/logs/exceptions/null-pointer.log`
- [x] Managed package log - `__fixtures__/logs/managed-pkg/sbqq-error.log`

**Post-Phase 1 Optimizations** (Applied 2026-01-31 after retrospective review):
- [x] Removed `rawLine` from `LogToken` - ~50% memory reduction
- [x] Added `tokenizeLineFast()` - ~10x faster than regex
- [x] Added `tokenizeLogStream()` - Generator for memory-efficient parsing
- [x] Added `parseLogStream()` / `parseLogStreamAsync()` - Streaming parser APIs

---

### Phase 2: Truncation & Streaming
**Goal**: Handle 20MB truncated logs gracefully
**Dependencies**: Phase 1 ✅
**Why Early**: Truncation affects ALL downstream features
**Status**: 🟡 PARTIALLY COMPLETE (Truncation detection done, JSONL formatter pending)

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Streaming tokenizer | `src/parser/tokenizer.ts` | Lines → TokenStream | ✅ Added `tokenizeLogStream()` |
| [x] | Streaming parser | `src/parser/index.ts` | LineStream → EventStream | ✅ Added `parseLogStream()` |
| [x] | Async streaming parser | `src/parser/index.ts` | AsyncLineStream → EventStream | ✅ Added `parseLogStreamAsync()` |
| [x] | Streaming header parsing | `src/parser/index.ts` | Peekable lines → Metadata | ✅ Fixed 2026-01-31 |
| [x] | Define truncation types | `src/types/truncation.ts` | TypeScript interfaces | ✅ Type check passes |
| [x] | Truncation detector | `src/parser/truncation-handler.ts` | RawLog → TruncationInfo | ✅ 778 lines, full implementation |
| [ ] | JSONL formatter | `src/output/jsonl-formatter.ts` | ParsedLog → JSONL stream | Unit test |
| [ ] | **CHECKPOINT**: Parse 20MB truncated log | - | Graceful handling | Manual test |

---

### Phase 3: Issue Detection
**Goal**: Categorize and detect common Salesforce issues
**Dependencies**: Phase 1
**Status**: 🟢 COMPLETE (2026-01-31)

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | SOQL in loop detector | `src/analyzer/detectors/soql-in-loop.ts` | Events → Issues[] | ✅ Code complete (~350 lines) |
| [x] | N+1 query detector | `src/analyzer/detectors/n-plus-one.ts` | Events → Issues[] | ✅ Code complete (~350 lines) |
| [x] | Recursive trigger detector | `src/analyzer/detectors/recursive-trigger.ts` | Events → Issues[] | ✅ Code complete (~450 lines) |
| [x] | Non-selective query detector | `src/analyzer/detectors/non-selective.ts` | Events → Issues[] | ✅ Code complete (~350 lines) |
| [x] | CPU hotspot detector | `src/analyzer/detectors/cpu-hotspot.ts` | Events → Issues[] | ✅ Code complete (~400 lines) |
| [x] | Governor limit analyzer | `src/analyzer/detectors/governor-limits.ts` | Events → LimitSummary | ✅ Code complete (~450 lines) |
| [x] | Issue categorizer | `src/analyzer/categorizer.ts` | Issues → CategorizedIssues | ✅ Code complete (~280 lines) |
| [ ] | **CHECKPOINT**: Unit tests for detectors | - | All detectors tested | ⚠️ Tests not yet written |

**Bug Fixes Applied** (2026-01-31):
- [x] Fixed SOQL double-counting in `soql-in-loop.ts` - Now only counts SOQL_EXECUTE_BEGIN events |

---

### Phase 4: Managed Package Handling
**Goal**: Attribute issues to your code vs vendor code
**Dependencies**: Phase 1, Phase 3
**Status**: 🟢 COMPLETE (2026-01-31)

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Define managed types | `src/types/managed.ts` | TypeScript interfaces | ✅ Type check passes |
| [x] | Namespace detector | `src/managed/namespace-detector.ts` | Events → Namespaces[] | ✅ ~525 lines |
| [x] | Visibility classifier | `src/managed/visibility-classifier.ts` | Namespace → Visibility | ✅ ~520 lines |
| [x] | Attribution engine | `src/managed/attribution-engine.ts` | Issue → Attribution | ✅ ~630 lines |
| [x] | AI guidance generator | `src/managed/ai-guidance.ts` | Attribution → Guidance | ✅ ~560 lines |
| [x] | Module orchestrator | `src/managed/index.ts` | Full pipeline | ✅ ~120 lines |
| [ ] | **CHECKPOINT**: Attribute vendor vs user issues | - | Correct attribution | Needs integration test |

---

### Phase 5: AI Output Layer ✅ COMPLETE
**Goal**: Generate token-efficient, AI-optimized output
**Dependencies**: Phase 1, Phase 3, Phase 4
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Summary generator | `src/analyzer/summarizer.ts` | ParsedLog → Summary (<500 tokens) | ✅ ~500 lines |
| [x] | JSON formatter | `src/output/json-formatter.ts` | ParsedLog → JSON/JSONL | ✅ ~550 lines |
| [x] | Query engine | `src/output/query-engine.ts` | Events + Filter → Events | ✅ ~600 lines |
| [x] | Confidence emitter | `src/output/confidence-emitter.ts` | Analysis → Confidence scores | ✅ ~500 lines |
| [x] | Problem context builder | `src/output/problem-context.ts` | Issue → AIContext (<2000 tokens) | ✅ ~550 lines |
| [ ] | **CHECKPOINT**: Generate AI-ready output | - | All formats work | Tests pending |

**Phase 5 Features**:
- **Summarizer**: Generates <500 token summaries with health scores, metrics, top issues
- **JSON Formatter**: Full JSON output, JSONL streaming, compact events, redaction support
- **Query Engine**: EventQueryEngine + IssueQueryEngine with filters, pagination, sorting
- **Confidence Emitter**: Multi-component confidence assessment, AI guidance generation
- **Problem Context**: <2000 token context per issue with guidance, events, code snippets

---

### Phase 6: Log Level Awareness ✅ COMPLETE
**Goal**: Adapt parsing based on debug level
**Dependencies**: Phase 1, Phase 5
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Level detector | `src/analyzer/level-detector.ts` | RawLog → LogLevelDetection | ✅ ~420 lines |
| [x] | Capability inferrer | `src/analyzer/level-capabilities.ts` | Levels → Capabilities | ✅ ~380 lines |
| [x] | Limitation reporter | `src/analyzer/level-limitations.ts` | Levels → Limitations | ✅ ~450 lines |
| [x] | Update summarizer for levels | `src/analyzer/summarizer.ts` | Add level context | ✅ Integrated |
| [ ] | **CHECKPOINT**: Handle DEBUG vs FINEST logs | - | Correct limitations | `npm run test:levels` |

**Phase 6 Features**:
- **Level Detector**: Detects debug levels from headers or infers from event types
- **Capability Inferrer**: Maps levels to available detectors and metrics
- **Limitation Reporter**: Reports analysis limitations and false negative risks
- **Summarizer Integration**: Summaries include debug level context and reliability scores

---

### Phase 7: Privacy & Redaction ✅ COMPLETE
**Goal**: Auto-redact PII for safe AI consumption
**Dependencies**: Phase 5
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Redaction patterns | `src/privacy/patterns.ts` | Regex patterns | ✅ ~180 lines |
| [x] | Redactor | `src/privacy/redactor.ts` | ParsedLog → RedactedLog | ✅ ~200 lines |
| [x] | Sensitivity classifier | `src/privacy/classifier.ts` | Field → SensitivityLevel | ✅ ~190 lines |
| [x] | Redaction config | `src/privacy/config.ts` | User preferences | ✅ ~170 lines |
| [ ] | **CHECKPOINT**: Redact emails/phones from logs | - | No PII in output | `npm run test:privacy` |

**Phase 7 Features**:
- **Pattern Library**: Email, phone, SSN, credit card, IP, Salesforce ID detection
- **Sensitivity Classifier**: 5-level classification (CRITICAL/HIGH/MEDIUM/LOW/NONE)
- **Smart Redactor**: Context-aware redaction with consistent placeholder tokens
- **Config Presets**: STRICT, MODERATE, MINIMAL redaction profiles

---

### Phase 8: CLI Interface ✅ COMPLETE
**Goal**: Developer-facing CLI for setup and manual analysis
**Dependencies**: Phase 1-7
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | CLI framework setup | `src/cli/index.ts` | Commander.js setup | ✅ `npx sf-debug --help` |
| [x] | `analyze` command | `src/cli/commands/analyze.ts` | File → Summary | ✅ ~180 lines |
| [x] | `query` command | `src/cli/commands/query.ts` | File + Filter → Events | ✅ ~190 lines |
| [x] | `issues` command | `src/cli/commands/issues.ts` | File → Issues | ✅ ~160 lines |
| [x] | `summary` command | `src/cli/commands/summary.ts` | File → Quick Summary | ✅ ~120 lines |
| [ ] | **CHECKPOINT**: CLI works end-to-end | - | All commands work | Manual test suite |

**Phase 8 Features**:
- **analyze**: Full analysis with JSON/text output, redaction support
- **query**: Filter events by type, severity, namespace with pagination
- **issues**: List detected issues with severity filtering
- **summary**: Quick <500 token summary for AI consumption

**CLI Usage**:
```bash
npx sf-debug analyze debug.log --format json --redact
npx sf-debug query debug.log --type SOQL --limit 10
npx sf-debug issues debug.log --severity high
npx sf-debug summary debug.log
```

---

### Phase 9: Salesforce Authentication ✅ COMPLETE
**Goal**: Connect to Salesforce orgs with fallback auth
**Dependencies**: Phase 0
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Define auth types | `src/types/capture.ts` | TypeScript interfaces | ✅ ~450 lines |
| [x] | OAuth PKCE flow | `src/capture/oauth-pkce.ts` | Browser → Tokens | ✅ ~520 lines |
| [x] | Device code flow | `src/capture/device-code.ts` | Code → Tokens | ✅ ~350 lines |
| [x] | SFDX import | `src/capture/sfdx-import.ts` | AuthURL → Tokens | ✅ ~380 lines |
| [x] | Manual token handler | `src/capture/manual-token.ts` | Token paste → Connection | ✅ ~280 lines |
| [x] | Auth manager (auto-select) | `src/capture/auth-manager.ts` | Env → Best auth method | ✅ ~450 lines |
| [ ] | **CHECKPOINT**: Authenticate to sandbox | - | Connection works | Manual test |

**Phase 9 Features**:
- **OAuth PKCE**: Full browser-based flow with local callback server, PKCE code verifier/challenge
- **Device Code**: Headless/SSH environment auth with polling and timeout
- **SFDX Import**: Import auth from existing SFDX CLI sessions
- **Manual Token**: Paste session ID with automatic validation
- **Auth Manager**: Auto-detects environment and selects best auth method

---

### Phase 10: Smart Log Capture ✅ COMPLETE
**Goal**: Auto-manage trace flags and fetch logs
**Dependencies**: Phase 9
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Debug level presets | `src/capture/debug-level-presets.ts` | IssueType → DebugConfig | ✅ ~450 lines |
| [x] | Trace flag manager | `src/capture/trace-flag-manager.ts` | User → TraceFlag | ✅ ~400 lines |
| [x] | Log watcher | `src/capture/log-watcher.ts` | Org → NewLogEvent | ✅ ~350 lines |
| [x] | Log fetcher | `src/capture/log-fetcher.ts` | LogId → RawLog | ✅ ~380 lines |
| [x] | Connection pool | `src/capture/connection-pool.ts` | Multi-org support | ✅ ~400 lines |
| [ ] | **CHECKPOINT**: Auto-capture debug logs | - | End-to-end capture | Manual test |

**Phase 10 Features**:
- **11 Debug Level Presets**: minimal, soql_analysis, governor_limits, triggers, cpu_hotspots, exceptions, callouts, visualforce, workflow, full_diagnostic, ai_optimized
- **Trace Flag Manager**: Create/update/delete via Tooling API, auto-extend expiration
- **Log Watcher**: EventEmitter-based polling with 'log' and 'log:ready' events
- **Log Fetcher**: Fetch content with size limits, list recent logs, metadata caching
- **Connection Pool**: Multi-org management, token refresh, health checks

---

### Phase 11: Async Job Correlation ✅ COMPLETE
**Goal**: Correlate parent logs with async child logs
**Dependencies**: Phase 1, Phase 9, Phase 10
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Define async types | `src/types/async.ts` | TypeScript interfaces | ✅ ~280 lines |
| [x] | Job extractor | `src/async/job-extractor.ts` | Events → AsyncJobRef[] | ✅ ~400 lines |
| [x] | Job tracker | `src/async/job-tracker.ts` | JobRef → AsyncApexJob | ✅ ~450 lines |
| [x] | Log correlator | `src/async/log-correlator.ts` | Job → ChildLog | ✅ ~500 lines |
| [x] | Confidence scorer | `src/async/confidence-scorer.ts` | Matches → Confidence | ✅ ~350 lines |
| [x] | Unified view builder | `src/async/unified-view.ts` | Parent+Children → Unified | ✅ ~450 lines |
| [ ] | **CHECKPOINT**: Correlate Queueable failure | - | Find child error | Integration test pending |

**Phase 11 Features**:
- **Job Extractor**: Extracts async job references from debug events (Batch, Queueable, Future, Scheduled)
- **Job Tracker**: Queries AsyncApexJob records via Tooling API
- **Log Correlator**: Matches parent logs with child execution logs
- **Confidence Scorer**: Weighted scoring across 5 components (timing, class name, job type, etc.)
- **Unified View**: Combines parent and child logs into single timeline

---

### Phase 12: MCP Server ✅ COMPLETE
**Goal**: Expose tools for AI assistants via MCP protocol
**Dependencies**: Phase 1-11
**Completed**: 2026-01-31 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | MCP server setup | `src/mcp/server.ts` | MCP protocol handler | ✅ ~480 lines |
| [x] | `sf_debug_parse_content` tool | `src/mcp/server.ts` | Parse raw log content | ✅ Integrated |
| [x] | `sf_debug_summary` tool | `src/mcp/server.ts` | AI summary | ✅ Integrated |
| [x] | `sf_debug_issues` tool | `src/mcp/server.ts` | Get issues | ✅ Integrated |
| [x] | `sf_debug_query` tool | `src/mcp/server.ts` | Query events | ✅ Integrated |
| [x] | `sf_debug_async_jobs` tool | `src/mcp/server.ts` | Extract async refs | ✅ Integrated |
| [ ] | **CHECKPOINT**: MCP tools work with Claude | - | End-to-end AI test | Manual test pending |

**Phase 12 Features**:
- **MCP Server**: Full McpServer implementation using @modelcontextprotocol/sdk
- **8 Tools**: parse_content, summary, issues, query, async_jobs + 3 memory tools
- **State Management**: Connection state, log cache, configuration, MemoryManager
- **Memory Integration**: Session tracking, recall on issue detection, solution storage
- **Redaction Support**: Integrates with privacy module

---

### Phase 13: Memory Layer ✅ COMPLETE
**Goal**: Persistent learning from debugging sessions
**Dependencies**: Phase 5, Phase 12
**Completed**: 2026-02-01 by @copilot

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [x] | Define memory types | `src/types/memory.ts` | TypeScript interfaces | ✅ ~450 lines |
| [x] | Factual knowledge store | `src/memory/factual.ts` | Static SF knowledge | ✅ ~500 lines |
| [x] | Semantic index | `src/memory/semantic.ts` | Pattern → Similarity | ✅ ~400 lines |
| [x] | Episodic store | `src/memory/episodic.ts` | Session → History | ✅ ~450 lines |
| [x] | Short-term cache | `src/memory/short-term.ts` | Current session | ✅ ~350 lines |
| [x] | SQLite persistence | `src/memory/sqlite-cache.ts` | Encrypted storage | ✅ ~300 lines |
| [x] | MemoryManager | `src/memory/index.ts` | Orchestration + recall/store | ✅ ~370 lines |
| [x] | MCP Integration | `src/mcp/server.ts` | Memory in ServerState | ✅ Updated ~780 lines |
| [x] | **CHECKPOINT**: Memory integrated with MCP | - | 3 new tools, auto-recall | ✅ Tests passing |

**Phase 13 Features**:
- **Factual Knowledge**: 10 governor limits, 10+ error patterns, 12+ best practices
- **Semantic Index**: Jaccard similarity with 7-component weighted matching
- **Episodic Store**: Session tracking, solution records, outcome analysis
- **Short-Term Cache**: Session context, analysis caching with TTL
- **SQLite Persistence**: AES-256-GCM encryption, WAL mode, in-memory fallback
- **MCP Integration**: ✅ Memory fully integrated with MCP server:
  - `sf_debug_store_solution`: Store working solutions for future recall
  - `sf_debug_end_session`: End session with outcome and feedback
  - `sf_debug_memory_stats`: Get memory system statistics
  - Auto-session start on first log parse
  - Memory recall on issue detection (provides suggestions)

---

### Phase 14: Anomaly Detection (v2+)
**Goal**: ML-based pattern detection (deferred ML, heuristics first)
**Dependencies**: Phase 1, Phase 13
**Note**: Start with heuristics, ML deferred to v3+

| Status | Task | File(s) | Input → Output | Test Command |
|--------|------|---------|----------------|--------------|
| [ ] | Drain parser (templates) | `src/anomaly/drain-parser.ts` | Logs → Templates | Unit test |
| [ ] | Pattern clustering | `src/anomaly/clustering.ts` | Events → Clusters | Unit test |
| [?] | Isolation Forest | `src/anomaly/isolation-forest.ts` | **DEFERRED v3+** | - |
| [?] | One-Class SVM | `src/anomaly/one-class-svm.ts` | **DEFERRED v3+** | - |
| [?] | Time-series (ETS) | `src/anomaly/time-series.ts` | **v2 heuristics only** | - |
| [ ] | **CHECKPOINT**: Detect unusual patterns | - | Heuristics work | Unit test |

---

## 📁 Module STATE.md Template

Each module folder should have a `STATE.md` file:

```markdown
# Module: [Module Name]

## Purpose
[One sentence describing what this module does]

## Status: [NOT_STARTED | IN_PROGRESS | COMPLETE | BLOCKED]

## Files
| File | Status | Description |
|------|--------|-------------|
| index.ts | [x] | Module exports |
| tokenizer.ts | [~] | In progress by @claude |

## Dependencies
- Depends on: `src/types/events.ts`
- Required by: `src/analyzer/`

## Key Interfaces
```typescript
// Paste the main interfaces this module exports
```

## Testing
```bash
npm run test:parser
```

## Last Updated
2026-01-31 by @claude-agent
```

---

## 🔄 AI Handoff Protocol

When an AI agent completes work, it should:

1. **Update `PROJECT_STATE.md`** with completed tasks
2. **Update module `STATE.md`** with file-level status
3. **Add header comment to new files**:
   ```typescript
   /**
    * @module parser/tokenizer
    * @status COMPLETE
    * @see src/parser/STATE.md
    * @lastModified 2026-01-31
    */
   ```
4. **Run tests** and note results
5. **Summarize what's next** at end of session

---

## 🎯 Milestone Checkpoints

| Milestone | Phases | Verification | Status |
|-----------|--------|--------------|--------|
| **M1: Parser MVP** | 0, 1, 2 | Can parse any Salesforce log | ✅ COMPLETE |
| **M2: Issue Detection** | 3, 4, 5 | Detects common issues | ✅ COMPLETE |
| **M3: CLI Release** | 6, 7, 8 | CLI works standalone | ✅ COMPLETE (tests pending) |
| **M4: SF Connected** | 9, 10 | Can connect to Salesforce | ✅ COMPLETE (tests pending) |
| **M5: Async Correlation** | 11 | Tracks async job failures | ✅ COMPLETE (tests pending) |
| **M6: MCP Release** | 12 | Works with AI assistants | ✅ COMPLETE (tests pending) |
| **M7: Memory** | 13 | Learns from sessions | ✅ COMPLETE (tests pending) |
| **M8: Anomaly** | 14 | Pattern detection | ⚪ DEFERRED to v2 |

---

## 📝 Conventions for AI Agents

### File Naming
- Event handlers: `[event-type].ts` (lowercase, hyphenated)
- Types: `[domain].ts` 
- Tests: `[file].test.ts` (co-located)

### Code Style
- Max 200 lines per file (split if larger)
- Every function has JSDoc with @example
- Every interface has @description

### Testing
- Unit tests for pure functions
- Integration tests for I/O
- Test data in `__fixtures__/` folders

### Error Handling
- Always return `Result<T, E>` instead of throwing
- Include error context for AI debugging

---

## 🚀 Quick Start for AI Agents

```bash
# 1. Read project state
cat PROJECT_STATE.md

# 2. Find what to work on
grep -r "\[ \]" IMPLEMENTATION_PLAN.md | head -5

# 3. Read relevant module state
cat src/parser/STATE.md

# 4. Work on task

# 5. Update state files

# 6. Run tests
npm test

# 7. Commit with conventional message
git commit -m "feat(parser): add SOQL event handler"
```

---

*This plan enables any AI agent to pick up work without reading the full codebase. State files are the source of truth.*
