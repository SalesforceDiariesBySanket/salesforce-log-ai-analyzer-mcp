# Module: Async Job Correlation

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: @copilot | Phase 11 Complete

---

## Purpose

Correlate parent debug logs with async child job logs (Queueable, Batch, Future, Schedulable).

---

## Status: COMPLETE ✓

**Progress**: 6/6 tasks complete

---

## Dependencies

### This Module Depends On
- `src/types/async.ts` - Async job types (AsyncJobRef, CorrelationResult, UnifiedView)
- `src/types/events.ts` - Event types
- `src/parser/` - Parsed events
- `src/capture/` - Fetch child logs from Salesforce

### Modules That Depend On This
- `src/mcp/` - Expose correlation via MCP tools
- `src/output/` - Unified view output

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | 70 | Module exports - all components |
| `job-extractor.ts` | [x] | 420 | Extract async job refs from events |
| `job-tracker.ts` | [x] | 340 | Query AsyncApexJob table |
| `log-correlator.ts` | [x] | 380 | Match job to child log |
| `confidence-scorer.ts` | [x] | 340 | Score correlation confidence |
| `unified-view.ts` | [x] | 420 | Build unified parent+child view |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Key Interfaces

```typescript
// Defined in src/types/async.ts

type AsyncJobType = 'QUEUEABLE' | 'BATCH' | 'FUTURE' | 'SCHEDULABLE';

interface AsyncJobRef {
  jobType: AsyncJobType;
  className: string;
  methodName?: string;
  enqueuedAt: number;
  parentEventId: number;
  jobId?: string;
  estimatedExecTime?: number;
  batchSize?: number;
  scopeSize?: number;
  metadata: Record<string, unknown>;
}

interface CorrelationResult {
  parentLogId: string;
  childLogId: string;
  confidence: number;
  reasons: CorrelationReason[];
  matchDetails: MatchDetail[];
  jobRef: AsyncJobRef;
  childLogSummary?: { events: number; issues: number; duration: number };
}

interface UnifiedView {
  parentLogId: string;
  parentSummary: UnifiedSummary;
  children: UnifiedExecutionNode[];
  totalDuration: number;
  aggregateIssues: ParsedIssue[];
  correlationQuality: 'high' | 'medium' | 'low';
}
```

---

## Exported Components

- **JobExtractor** - Extract async job refs from events
- **JobTracker** - Query AsyncApexJob table via Salesforce API
- **LogCorrelator** - Correlate parent logs with async child logs
- **CorrelationScorer** - Calculate confidence scores
- **UnifiedViewBuilder** - Build unified parent+child view

Helper functions: `extractAsyncJobs()`, `createJobTracker()`, `correlateAsyncJobs()`, `createCorrelationScorer()`, `createUnifiedViewBuilder()`, `buildSimpleUnifiedView()`

---

## Testing

```bash
npm run test:async
# Or individual file
npm run test -- src/async/job-extractor.test.ts
```

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Define async types | [x] | src/types/async.ts |
| 2 | Job extractor | [x] | Detects all async patterns |
| 3 | Job tracker | [x] | Salesforce API integration |
| 4 | Log correlator | [x] | Multi-strategy matching |
| 5 | Confidence scorer | [x] | Weighted scoring |
| 6 | Unified view builder | [x] | Aggregates parent+children |
