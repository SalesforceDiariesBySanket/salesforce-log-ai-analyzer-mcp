# Module: Output

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: @copilot (Refactored for CONVENTIONS compliance)

---

## Purpose

Generate AI-optimized, token-efficient output formats (JSON, JSONL, summaries).

---

## Status: COMPLETE (REFACTORED)

**Progress**: 5/5 tasks complete  
**Refactoring**: json-formatter.ts split into formatters/ modules (was 734 lines, now <200)

---

## Dependencies

### This Module Depends On
- `src/types/events.ts` - Event types
- `src/types/issues.ts` - Issue types
- `src/parser/` - Parsed log data
- `src/analyzer/` - Analysis results

### Modules That Depend On This
- `src/mcp/` - Use formatters for MCP responses
- `src/cli/` - Use formatters for CLI output

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | ~130 | Module exports (updated) |
| `json-formatter.ts` | [x] | ~160 | ParsedLog → JSON (refactored) |
| `query-engine.ts` | [x] | ~600 | Filter/query events and issues |
| `confidence-emitter.ts` | [x] | ~500 | Add confidence scores |
| `problem-context.ts` | [x] | ~550 | Build <2000 token context |
| `../analyzer/summarizer.ts` | [x] | ~500 | Generate <500 token summaries |
| **formatters/** | [x] | NEW | Sub-module for formatting logic |
| `formatters/index.ts` | [x] | ~35 | Formatters exports |
| `formatters/types.ts` | [x] | ~190 | Output type definitions |
| `formatters/event-formatter.ts` | [x] | ~110 | Event → CompactEvent |
| `formatters/issue-formatter.ts` | [x] | ~80 | Issue → OutputIssue |
| `formatters/summary-builder.ts` | [x] | ~100 | Build summary + AI context |
| `formatters/jsonl-formatter.ts` | [x] | ~215 | JSONL streaming support (NEW) |
| `formatters/redaction.ts` | [x] | ~100 | PII/sensitive data redaction |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Refactoring Notes (2026-01-31)

### Why Refactored
The original `json-formatter.ts` was **734 lines**, violating the CONVENTIONS.md 200-line limit.

### New Structure
```
src/output/
├── index.ts           # Main exports
├── json-formatter.ts  # Simplified orchestrator (~160 lines)
└── formatters/        # Sub-module (NEW)
    ├── index.ts       # Formatters exports
    ├── types.ts       # Type definitions
    ├── event-formatter.ts
    ├── issue-formatter.ts
    ├── summary-builder.ts
    ├── jsonl-formatter.ts  # JSONL streaming (memory-efficient)
    └── redaction.ts        # PII redaction
```

### New Features Added
- **JSONL Streaming**: `generateJSONL()` generator for memory-efficient output
- **Async JSONL**: `generateJSONLAsync()` for very large logs
- **Event-only streaming**: `streamEventsJSONL()` for piping from parser
- **JSONL parsing**: `parseJSONL()` to read JSONL back

---

## Key Interfaces

```typescript
// JSON Formatting
interface JSONFormatOptions {
  includeEvents?: boolean;
  includeIssues?: boolean;
  includeMetadata?: boolean;
  maxEvents?: number;
  maxIssues?: number;
  indent?: number;
  redact?: boolean;
}

interface JSONOutput {
  version: string;
  generatedAt: string;
  metadata?: LogMetadata;
  stats?: ParseStats;
  summary: OutputSummary;
  events?: CompactEvent[];
  issues?: OutputIssue[];
  aiContext?: AIOutputContext;
}

// Query Engine
interface EventFilter {
  types?: EventType[];
  namespaces?: string[];
  lineRange?: { start: number; end: number };
  minDuration?: number;
  textSearch?: string;
}

interface IssueFilter {
  types?: IssueType[];
  categories?: IssueCategory[];
  minSeverity?: IssueSeverity;
  fixableOnly?: boolean;
  minConfidence?: number;
}

// Confidence
interface ConfidenceAssessment {
  overall: number;
  breakdown: ConfidenceBreakdown;
  summary: string;
  limitations: string[];
  level: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
}

// Problem Context
interface ProblemContext {
  id: string;
  header: ContextHeader;
  issue: IssueContext;
  events: EventContext;
  codeSnippet?: CodeSnippetContext;
  guidance: GuidanceContext;
  tokenCount: number;
}

// Summary (in analyzer/summarizer.ts)
interface LogSummary {
  health: number;
  status: string;
  metrics: SummaryMetrics;
  topIssues: CompactIssue[];
  limitWarnings: string[];
  recommendations: string[];
  tokenCount: number;
}
```

---

## Testing

```bash
npm run test:output
```

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | JSON formatter | [x] | JSON + JSONL streaming |
| 2 | Query engine | [x] | EventQueryEngine + IssueQueryEngine |
| 3 | Confidence emitter | [x] | Assessment + AI guidance |
| 4 | Problem context builder | [x] | <2000 tokens per issue |
| 5 | Summarizer | [x] | <500 tokens (in analyzer module) |

---

## Usage Examples

### Generate JSON Output

```typescript
import { formatJSON, formatJSONL } from './output';

// Full JSON output
const json = formatJSON(parsedLog, analysis, { indent: 2 });

// Streaming JSONL
const jsonl = formatJSONL(parsedLog, analysis);
```

### Query Events

```typescript
import { createEventQuery, createIssueQuery } from './output';

const eventQuery = createEventQuery(parsedLog);

// Get all SOQL events
const soqlEvents = eventQuery.getSOQLEvents();

// Get slow operations (>100ms)
const slowOps = eventQuery.getSlowOperations(100);

// Filter by namespace
const managedPkgEvents = eventQuery.query({ namespaces: ['SBQQ'] });

// Query issues
const issueQuery = createIssueQuery(analysis.issues);
const criticalIssues = issueQuery.getCritical();
const fixableIssues = issueQuery.getFixable();
```

### Build Problem Context

```typescript
import { buildProblemContext, buildTopIssueContexts } from './output';

// Single issue context
const context = buildProblemContext(issue, parsedLog, analysis);
console.log(`Context: ${context.tokenCount} tokens`);

// Top 3 issues
const contexts = buildTopIssueContexts(analysis, parsedLog, 3);
```

### Assess Confidence

```typescript
import { assessConfidence, enrichWithConfidence } from './output';

const confidence = assessConfidence(parsedLog, analysis);
console.log(`Confidence: ${confidence.level} (${confidence.overall})`);

// Enrich output with confidence
const enriched = enrichWithConfidence(myData, parsedLog, analysis);
```
