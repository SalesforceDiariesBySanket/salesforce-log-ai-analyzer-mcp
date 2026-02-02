# Module: Memory

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-02-01 | Updated By: @copilot | SQLite Installed ✓

---

## Purpose

Persistent learning from debugging sessions - recall past solutions.

---

## Status: COMPLETE ✅

**Progress**: 9/9 tasks complete (includes MCP integration)
**Phase**: 13 - Memory Layer
**SQLite**: ✅ INSTALLED (better-sqlite3) - Persistent storage active

---

## Dependencies

### This Module Depends On
- `src/types/memory.ts` - Memory types
- `better-sqlite3` ^11.8.1 - ✅ INSTALLED (persistent storage)
- `@types/better-sqlite3` ^7.6.12 - Type definitions

### Modules That Depend On This
- `src/mcp/` - Memory tools ✅ INTEGRATED

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | ~250 | Module exports & MemoryManager orchestration |
| `factual.ts` | [x] | ~500 | Static Salesforce knowledge (governor limits, error patterns) |
| `semantic.ts` | [x] | ~400 | Pattern-based similarity matching |
| `episodic.ts` | [x] | ~450 | Session history & solution records |
| `short-term.ts` | [x] | ~350 | Current session context & cache |
| `sqlite-cache.ts` | [x] | ~300 | Encrypted SQLite persistence |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Key Interfaces

```typescript
// Factual Knowledge
interface FactualKnowledge {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  keywords: string[];
  relatedIssueCodes: string[];
}

// Semantic Signature for matching
interface SemanticSignature {
  issueType: string;
  errorSignature?: string;
  objects: string[];
  namespaces: string[];
  methodPatterns: string[];
  soqlPatterns: string[];
  limitPatterns: string[];
}

// Session Record
interface DebuggingEpisode {
  sessionId: string;
  startedAt: Date;
  endedAt?: Date;
  issuesSeen: string[];
  solutionsAttempted: string[];
  outcome: SessionOutcome;
}

// Solution Record
interface SolutionRecord {
  id: string;
  issueType: string;
  title: string;
  steps: string[];
  successCount: number;
  failureCount: number;
}
```

---

## Features

### Factual Knowledge Store
- Built-in Salesforce governor limits (10 limits with sync/async values)
- Common error patterns with regex matching (10+ patterns)
- Best practices knowledge base (12+ entries)
- Search by keywords or issue codes

### Semantic Index
- Jaccard similarity for set-based matching
- Weighted scoring across 7 components
- Persistent storage with in-memory indexes
- Success rate tracking for solutions

### Episodic Store
- Session tracking with outcomes
- Solution recording and success rates
- Configurable retention (default 90 days)
- Similar episode search

### Short-Term Cache
- Current session context management
- Analysis result caching with TTL
- AI conversation context tracking

### SQLite Persistence
- Optional AES-256-GCM encryption
- WAL mode for performance
- Graceful fallback to in-memory storage

---

## Usage Examples

```typescript
import { getMemoryManager } from './memory';

// Initialize
const memory = getMemoryManager();
await memory.initialize();

// Start session
const sessionId = await memory.startSession('orgId', 'userId');

// Recall relevant information
const response = await memory.recall({
  query: 'SOQL queries in loop',
  issueContext: { issueCode: 'SOQL_IN_LOOP', severity: 'HIGH' },
  includeFacts: true,
  includeSolutions: true,
  includeEpisodes: true,
  maxResults: 5,
});

// Store solution
await memory.store({
  sessionId,
  issue: { code: 'SOQL_IN_LOOP', severity: 'HIGH', description: '...' },
  solution: { title: 'Bulkify SOQL', steps: ['...'] },
});

// End session
await memory.endSession('RESOLVED', { helpful: true, rating: 5 });
```

---

## Completed 2026-02-01
- [x] Memory types defined
- [x] Factual knowledge store with governor limits & error patterns
- [x] Semantic index with weighted similarity matching
- [x] Episodic store with session & solution tracking
- [x] Short-term cache for current session
- [x] SQLite persistence with encryption
- [x] MemoryManager orchestration
- [x] **MCP Integration** - Memory now integrated into MCP server:
  - Session starts on first log parse (`ensureSession()`)
  - Memory recall on issue detection (provides suggestions)
  - 3 new MCP tools: `sf_debug_store_solution`, `sf_debug_end_session`, `sf_debug_memory_stats`

---

## MCP Integration

The memory layer is now fully integrated with the MCP server:

```typescript
// MCP Server automatically:
// 1. Starts session on first log parse
// 2. Recalls relevant knowledge when issues detected
// 3. Provides 3 new tools for memory management

// sf_debug_store_solution - Store working solutions
// sf_debug_end_session - End with outcome/feedback
// sf_debug_memory_stats - Get memory statistics
```

---

interface MemoryEntry {
  id: string;
  type: 'FACTUAL' | 'SEMANTIC' | 'EPISODIC';
  pattern: string;
  solution: string;
  confidence: number;
  usageCount: number;
}
```

---

## Testing

```bash
npm run test -- src/memory
```

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Define memory types | [x] | src/types/memory.ts |
| 2 | Factual knowledge store | [x] | src/memory/factual.ts |
| 3 | Semantic index | [x] | src/memory/semantic.ts |
| 4 | Episodic store | [x] | src/memory/episodic.ts |
| 5 | Short-term cache | [x] | src/memory/short-term.ts |
| 6 | SQLite persistence | [x] | src/memory/sqlite-cache.ts |
| 7 | MemoryManager | [x] | src/memory/index.ts |
| 8 | MCP integration | [x] | Memory in ServerState |
| 9 | MCP tools | [x] | store_solution, end_session, memory_stats |
