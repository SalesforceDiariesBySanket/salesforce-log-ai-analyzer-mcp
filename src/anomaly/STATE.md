# Module: Anomaly Detection

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: @copilot

---

## Purpose

ML-based pattern detection. Start with heuristics, ML deferred to v3+.

---

## Status: NOT_STARTED

**Progress**: 0/3 tasks complete (ML deferred)

---

## Dependencies

### This Module Depends On
- `src/types/events.ts` - Event types
- `src/memory/` - Pattern storage

### Modules That Depend On This
- `src/analyzer/` - Enhanced detection

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | 10 | Module exports |
| `drain-parser.ts` | [ ] | - | Template-based parsing |
| `clustering.ts` | [ ] | - | Event clustering |
| `isolation-forest.ts` | [?] | - | DEFERRED v3+ |
| `one-class-svm.ts` | [?] | - | DEFERRED v3+ |
| `time-series.ts` | [?] | - | v2 heuristics only |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked | [?] Deferred

---

## Implementation Notes

### Why Defer ML?
From architecture doc:
> The AI agent consuming this tool's output is ALREADY an LLM doing pattern recognition. Adding another ML layer is:
> - Redundant for pattern detection
> - Opaque (what does "anomaly score 0.87" mean?)
> - Training-hungry (no labeled dataset)

### v1-v2 Approach
- Use Drain parser for template extraction
- Heuristic clustering
- Let the consuming LLM do pattern recognition

---

## Testing

```bash
npm run test -- src/anomaly
```

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Drain parser | [ ] | Templates |
| 2 | Pattern clustering | [ ] | Heuristics |
| 3 | Integration test | [ ] | |
