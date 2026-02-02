# Module: Types

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: @copilot (Phase 1 Complete + Memory Optimization)

---

## Purpose

Central type definitions for all Salesforce debug log events, issues, and data structures.

---

## Status: COMPLETE ✅ (REFACTORED)

**Progress**: 3/3 tasks complete + Memory optimization

---

## ⚠️ BREAKING CHANGE: LogToken.rawLine REMOVED

As of 2026-01-31, `rawLine` was **removed** from `LogToken` interface to reduce memory footprint:
- Before: 20MB log → ~80-120MB memory (4-6x bloat from storing rawLine)
- After: 20MB log → ~40-60MB memory (only essential data)

If you need the raw line content:
1. Only for errors: `ParseError.rawLine` is still populated on parse failures
2. For debugging: Reconstruct from `segments.join('|')`

---

## Dependencies

### This Module Depends On
- None (base types)

### Modules That Depend On This
- `src/parser/` - Uses event types for parsing ✅
- `src/analyzer/` - Uses issue types for detection
- `src/output/` - Uses types for formatting
- `src/managed/` - Uses namespace types
- `src/async/` - Uses async job types
- `src/capture/` - Uses capture types
- `src/memory/` - Uses memory types

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | 65 | Module exports |
| `common.ts` | [x] | 125 | Result type, Confidence, utility types |
| `events.ts` | [x] | 430 | Event type definitions (LogToken **without rawLine**) |
| `issues.ts` | [x] | 260 | Issue type definitions (SOQL_IN_LOOP, N+1, etc.) |
| `truncation.ts` | [x] | 130 | Truncation detection types (Phase 2) |
| `managed.ts` | [x] | 185 | Managed package types (Phase 4) |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Key Interfaces

```typescript
// Result type for error handling (no throwing)
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Confidence scoring for AI outputs
interface Confidence {
  score: number;        // 0.0 to 1.0
  reasons: string[];
  limitations?: string[];
}

// LogToken (NOTE: rawLine REMOVED for memory efficiency!)
interface LogToken {
  lineNumber: number;
  timestamp: Nanoseconds;
  eventType: EventType;
  segments: string[];  // rawLine is GONE
}

// Base event type
interface BaseEvent {
  id: number;
  parentId: number;
  type: EventType;
  timestamp: Nanoseconds;
  lineNumber: number;
  duration?: Duration;
  children?: EventNode[];
  namespace?: string;
}

// Parsed log structure
interface ParsedLog {
  events: EventNode[];
  root: BaseEvent;
  metadata: LogMetadata;
  truncation?: TruncationInfo;
  confidence: Confidence;
  stats: ParseStats;
}
```

---

## Testing

```bash
# Type check only (no runtime tests)
npm run build
```

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Define common Result type | [x] | In common.ts |
| 2 | Define event types | [x] | In events.ts |
| 3 | Define issue types | [x] | In issues.ts |
| 4 | Define truncation types | [x] | In truncation.ts (Phase 2) |
| 5 | Define managed pkg types | [x] | In managed.ts (Phase 4) |
| 6 | Export all types from index | [x] | All exports updated |
