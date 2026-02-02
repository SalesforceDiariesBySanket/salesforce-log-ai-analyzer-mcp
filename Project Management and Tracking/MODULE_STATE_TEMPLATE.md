# Module STATE.md Template

> **Copy this template** when creating a new module's STATE.md file.
> Replace all `[placeholders]` with actual values.

---

```markdown
# Module: [Module Name]

> **AI Agents**: Read this before working on this module.
> Last Updated: YYYY-MM-DD | Updated By: [agent-name]

---

## Purpose

[One sentence describing what this module does]

---

## Status: [NOT_STARTED | IN_PROGRESS | COMPLETE | BLOCKED]

**Progress**: [X/Y tasks complete]

---

## Dependencies

### This Module Depends On
- `src/types/[file].ts` - [why needed]
- `src/[module]/` - [why needed]

### Modules That Depend On This
- `src/[module]/` - [how they use this]

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [ ] | - | Module exports |
| `[file1].ts` | [ ] | - | [description] |
| `[file2].ts` | [ ] | - | [description] |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Key Interfaces

```typescript
// Paste the main interfaces this module exports
// AI agents can reference these without reading full files

interface [MainInterface] {
  // ...
}
```

---

## Testing

```bash
# Run module tests
npm run test:[module-name]

# Run specific test file
npx vitest src/[module]/[file].test.ts
```

### Test Fixtures Needed
- [ ] `__fixtures__/[fixture1].log` - [description]
- [ ] `__fixtures__/[fixture2].log` - [description]

---

## Implementation Notes

### Key Decisions
- [Decision 1]: [Why this approach was chosen]
- [Decision 2]: [Why this approach was chosen]

### Known Limitations
- [Limitation 1]: [Why it exists, potential future fix]

### Edge Cases
- [Edge case 1]: [How it's handled]

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | [Task description] | [ ] | |
| 2 | [Task description] | [ ] | |
| 3 | [Task description] | [ ] | |

---

## Recent Changes

| Date | Change | By |
|------|--------|-----|
| YYYY-MM-DD | [What changed] | [agent] |

---

## Open Questions

- [ ] [Question that needs resolution]
- [ ] [Question that needs resolution]

---

*AI agents: Update this file after completing any work in this module.*
```

---

## How to Use This Template

1. **Create module folder**: `mkdir -p src/[module]`
2. **Copy template**: Create `src/[module]/STATE.md`
3. **Fill in placeholders**: Replace all `[...]` with actual values
4. **Update PROJECT_STATE.md**: Add module to the Module Status table
5. **Start coding**: Reference this STATE.md as you work

---

## Example: Parser Module STATE.md

```markdown
# Module: Parser

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: claude-agent

---

## Purpose

Parses raw Salesforce debug logs into structured event trees and flat event arrays.

---

## Status: IN_PROGRESS

**Progress**: 3/12 tasks complete

---

## Dependencies

### This Module Depends On
- `src/types/events.ts` - Event type definitions
- `src/types/issues.ts` - Issue type definitions

### Modules That Depend On This
- `src/analyzer/` - Uses parsed events for issue detection
- `src/output/` - Uses ParsedLog for formatting
- `src/async/` - Uses events to extract async job references

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | 25 | Module exports |
| `tokenizer.ts` | [x] | 85 | Line tokenization |
| `ast-builder.ts` | [~] | 120 | Build event tree |
| `event-handlers/method.ts` | [x] | 45 | METHOD event handler |
| `event-handlers/soql.ts` | [ ] | - | SOQL event handler |
| `event-handlers/dml.ts` | [ ] | - | DML event handler |
| `streaming-parser.ts` | [ ] | - | JSONL streaming |
| `truncation-handler.ts` | [ ] | - | Truncation detection |

---

## Key Interfaces

```typescript
interface ParsedLog {
  meta: LogMetadata;
  summary: LogSummary;
  tree: TreeNode;
  events: EventNode[];
  issues: CategorizedIssues;
}

interface EventNode {
  id: number;
  parentId: number;
  type: EventType;
  name: string;
  timeStartNs: number;
  // ... see src/types/events.ts for full definition
}
```

---

## Testing

```bash
npm run test:parser
npx vitest src/parser/
```

### Test Fixtures
- [x] `__fixtures__/simple-success.log` - Basic happy path
- [ ] `__fixtures__/soql-limit.log` - SOQL limit exceeded
- [ ] `__fixtures__/truncated.log` - 20MB truncated log

---

## Implementation Notes

### Key Decisions
- **Streaming-first**: Parse line-by-line for memory efficiency
- **Dual output**: Both tree (hierarchical) and flat array (queryable)

### Known Limitations
- Cannot parse binary/encrypted logs
- HEAP_DUMP parsing not yet supported

---

*AI agents: Update this file after completing any work in this module.*
```
