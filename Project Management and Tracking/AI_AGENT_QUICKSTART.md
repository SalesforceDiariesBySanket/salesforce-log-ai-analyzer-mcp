# AI_AGENT_QUICKSTART.md
> **TL;DR for AI Agents** - Everything you need to start working on this project in 30 seconds.

---

## 🚀 First Time Setup

```bash
# 1. Read project status (ALWAYS DO THIS FIRST)
cat PROJECT_STATE.md

# 2. Check current focus
grep "Active Phase" PROJECT_STATE.md
```

---

## 📍 Where Am I?

| Question | Answer File |
|----------|-------------|
| What's the project status? | `PROJECT_STATE.md` |
| What should I work on? | `IMPLEMENTATION_PLAN.md` |
| How should I write code? | `CONVENTIONS.md` |
| What's the full architecture? | `AI_SALESFORCE_DEBUG_ARCHITECTURE_V2.md` |
| What's a module's status? | `src/[module]/STATE.md` |

---

## 🎯 Find Next Task

```bash
# Find incomplete tasks in implementation plan
grep "\[ \]" IMPLEMENTATION_PLAN.md | head -10

# Find tasks in progress
grep "\[~\]" IMPLEMENTATION_PLAN.md
```

---

## 🔧 MCP Tools - Critical Knowledge

> **IMPORTANT**: When working with Salesforce debug logs via MCP tools

### Tool Selection for Log Parsing
```
Is the log file >1MB or >10k lines?
├── YES → Use sf_debug_parse_file (pass file path)
│         AI CANNOT read 20MB files with 45k lines!
└── NO  → Use sf_debug_parse_content (pass content string)
```

### Known Caveats
| Caveat | Impact | Solution |
|--------|--------|----------|
| Large logs (>1MB) | AI can't read into context | Use `sf_debug_parse_file` |
| Max content: 50MB | Rejects larger files | Split or truncate |
| Max cache: 10 logs | Oldest evicted (LRU) | Use logId to reference |
| Issues limit: 20 | May miss some issues | Pass `limit` param |
| Events limit: 50 | May miss some events | Pass `limit` param |
| Message truncation | 200 chars max | N/A (always truncated) |

### Recommended Workflow
1. **Parse log**: `sf_debug_parse_file` for large logs
2. **Get overview**: `sf_debug_summary`
3. **Find issues**: `sf_debug_issues`
4. **Drill down**: `sf_debug_query` with filters
5. **Store solution**: `sf_debug_store_solution` after fixing
6. **End session**: `sf_debug_end_session` with outcome

See `src/mcp/STATE.md` for full documentation.

---

## ✅ After Completing Work

1. **Update PROJECT_STATE.md**
   - Move task to "Recently Completed"
   - Update phase progress count

2. **Update module STATE.md**
   - Change file status from `[ ]` to `[x]`
   - Add to "Recent Changes"

3. **Add file header** to new files:
   ```typescript
   /**
    * @module [module]/[file]
    * @description [what it does]
    * @status COMPLETE
    * @see src/[module]/STATE.md
    * @lastModified YYYY-MM-DD
    */
   ```

4. **Run tests**
   ```bash
   npm test
   ```

---

## 📁 Key Folders

```
sf-debug-ai/
├── PROJECT_STATE.md      ← READ FIRST
├── IMPLEMENTATION_PLAN.md ← Detailed tasks
├── CONVENTIONS.md         ← Coding rules
├── src/
│   ├── types/            ← TypeScript interfaces (Phase 1)
│   ├── parser/           ← Log parsing (Phase 1-2)
│   ├── analyzer/         ← Issue detection (Phase 3-6)
│   ├── managed/          ← Vendor code handling (Phase 4)
│   ├── privacy/          ← PII redaction (Phase 7)
│   ├── output/           ← AI-optimized output (Phase 5)
│   ├── capture/          ← Salesforce auth/logs (Phase 9-10)
│   ├── async/            ← Async job correlation (Phase 11)
│   ├── mcp/              ← MCP server/tools (Phase 12)
│   ├── memory/           ← Learning/persistence (Phase 13)
│   ├── cli/              ← CLI commands (Phase 8)
│   └── anomaly/          ← ML patterns (Phase 14, deferred)
```

---

## 🔄 Handoff Protocol

When ending a session, leave a note:

```markdown
## Session Summary - [DATE]

### Completed
- [x] [What you finished]

### In Progress
- [~] [What's partially done and where you stopped]

### Next Steps
- [ ] [What the next AI should do]

### Blockers
- [!] [Any issues that need resolution]
```

Add this to the end of `PROJECT_STATE.md` under a "Session Log" section.

---

## ⚡ Quick Commands

| Task | Command |
|------|---------|
| Build project | `npm run build` |
| Run all tests | `npm test` |
| Run specific module tests | `npm run test:[module]` |
| Lint code | `npm run lint` |
| Format code | `npm run format` |

---

## 🚫 Don't Do These

- ❌ Don't skip reading `PROJECT_STATE.md`
- ❌ Don't create files without header comments
- ❌ Don't use `any` type
- ❌ Don't throw errors (use Result type)
- ❌ Don't forget to update STATE files after work
- ❌ Don't write files over 200 lines

---

## 🎨 Code Snippet Templates

### New TypeScript File
```typescript
/**
 * @module [module]/[filename]
 * @description [what this file does]
 * @status DRAFT
 * @see src/[module]/STATE.md
 * @lastModified YYYY-MM-DD
 */

import { [Types] } from '../types';

/**
 * [Description of function]
 * @param [param] - [description]
 * @returns [description]
 * @example
 * const result = myFunction(input);
 */
export function myFunction(param: ParamType): Result<ReturnType, ErrorType> {
  // Implementation
  return { success: true, data: result };
}
```

### New Test File
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './[filename]';

describe('[filename]', () => {
  describe('myFunction', () => {
    it('should [expected behavior]', () => {
      const result = myFunction(input);
      expect(result.success).toBe(true);
    });
  });
});
```

### Result Type Pattern
```typescript
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

---

## 📞 Architecture Quick Reference

### What This Tool Does
1. **Parses** Salesforce debug logs (10-20MB files)
2. **Detects** common issues (SOQL in loops, governor limits, etc.)
3. **Correlates** async job logs (Queueable, Batch, Future)
4. **Attributes** issues to your code vs vendor (managed packages)
5. **Outputs** AI-optimized JSON for coding assistants
6. **Exposes** MCP tools for AI to call

### Primary Consumer
**AI Assistants (Claude, GPT)** - NOT humans directly.

Output is structured JSON with confidence scores. The AI explains it to users.

---

*This quickstart is your map. PROJECT_STATE.md is your compass.*
