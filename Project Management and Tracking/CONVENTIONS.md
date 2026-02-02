# CONVENTIONS.md
> **For AI Agents**: Follow these conventions when writing code for this project.

---

## 📁 File Structure Rules

### Maximum File Size
- **200 lines max** per file
- If larger, split into multiple files
- Exception: Type definition files can be up to 300 lines

### File Header (REQUIRED)
Every `.ts` file must start with:

```typescript
/**
 * @module [module-name]/[file-name]
 * @description One sentence describing what this file does
 * @status DRAFT | COMPLETE | NEEDS_REVIEW
 * @see src/[module]/STATE.md
 * @dependencies List key imports
 * @lastModified YYYY-MM-DD
 */
```

### Example

```typescript
/**
 * @module parser/tokenizer
 * @description Tokenizes raw Salesforce debug log lines into structured tokens
 * @status COMPLETE
 * @see src/parser/STATE.md
 * @dependencies src/types/events.ts
 * @lastModified 2026-01-31
 */

import { LogToken, EventType } from '../types/events';
// ... rest of code
```

---

## 🏗️ Code Patterns

### Result Type (No Throwing)

**DON'T** throw errors:
```typescript
// ❌ BAD
function parse(log: string): ParsedLog {
  if (!log) throw new Error('Empty log');
  // ...
}
```

**DO** return Result type:
```typescript
// ✅ GOOD
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

function parse(log: string): Result<ParsedLog, ParseError> {
  if (!log) {
    return { 
      success: false, 
      error: { code: 'EMPTY_LOG', message: 'Log content is empty' } 
    };
  }
  // ...
  return { success: true, data: parsedLog };
}
```

### Interface Documentation

Every interface needs:
```typescript
/**
 * Represents a parsed Salesforce debug log event
 * @example
 * const event: EventNode = {
 *   id: 1,
 *   type: 'METHOD_ENTRY',
 *   name: 'MyClass.doWork',
 *   // ...
 * };
 */
interface EventNode {
  /** Unique identifier within the log */
  id: number;
  
  /** Parent event ID (-1 for root) */
  parentId: number;
  
  /** The type of log event */
  type: EventType;
  
  // ... more fields with JSDoc
}
```

### Function Documentation

Every exported function needs:
```typescript
/**
 * Tokenizes a single line from a Salesforce debug log
 * 
 * @param line - Raw line from debug log (e.g., "12:34:56.789 (123)|METHOD_ENTRY|...")
 * @param lineNumber - 1-based line number in the original file
 * @returns Parsed token or null if line is not parseable
 * 
 * @example
 * const token = tokenizeLine("12:34:56.789 (123)|METHOD_ENTRY|MyClass", 42);
 * // Returns: { type: 'METHOD_ENTRY', timestamp: 123, ... }
 */
export function tokenizeLine(line: string, lineNumber: number): LogToken | null {
  // ...
}
```

---

## 📝 Naming Conventions

### Files
| Type | Convention | Example |
|------|------------|---------|
| Type definitions | `[domain].ts` | `events.ts`, `issues.ts` |
| Event handlers | `[event-type].ts` | `method.ts`, `soql.ts` |
| Utilities | `[function-name].ts` | `tokenizer.ts` |
| Tests | `[file].test.ts` | `tokenizer.test.ts` |
| Constants | `[domain].constants.ts` | `patterns.constants.ts` |

### Variables & Functions
| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase | `parseLogLine()` |
| Constants | SCREAMING_SNAKE | `MAX_LOG_SIZE` |
| Interfaces | PascalCase | `ParsedLog` |
| Type aliases | PascalCase | `EventType` |
| Enums | PascalCase + members | `LogLevel.FINEST` |

### Boolean Variables
Prefix with `is`, `has`, `can`, `should`:
```typescript
// ✅ GOOD
const isTruncated = true;
const hasAsyncJobs = false;
const canFix = true;

// ❌ BAD
const truncated = true;
const asyncJobs = false;
```

---

## 🧪 Testing Conventions

### Test File Location
Co-locate tests with source files:
```
src/parser/
├── tokenizer.ts
├── tokenizer.test.ts    ← Test file next to source
├── ast-builder.ts
└── ast-builder.test.ts
```

### Test Fixtures
Put in `__fixtures__` folder:
```
src/parser/
├── __fixtures__/
│   ├── simple-success.log
│   ├── soql-limit-exceeded.log
│   └── truncated-log.log
├── tokenizer.ts
└── tokenizer.test.ts
```

### Test Structure
```typescript
import { describe, it, expect } from 'vitest';
import { tokenizeLine } from './tokenizer';

describe('tokenizer', () => {
  describe('tokenizeLine', () => {
    it('parses METHOD_ENTRY line correctly', () => {
      const line = '12:34:56.789 (123)|METHOD_ENTRY|[1]|MyClass.doWork';
      const result = tokenizeLine(line, 1);
      
      expect(result).not.toBeNull();
      expect(result?.type).toBe('METHOD_ENTRY');
    });

    it('returns null for unparseable lines', () => {
      const result = tokenizeLine('garbage', 1);
      expect(result).toBeNull();
    });
  });
});
```

---

## 🔢 Magic Numbers

**DON'T** use magic numbers:
```typescript
// ❌ BAD
if (log.length > 20971520) { ... }
```

**DO** use named constants:
```typescript
// ✅ GOOD
const MAX_LOG_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

if (log.length > MAX_LOG_SIZE_BYTES) { ... }
```

---

## 📤 Export Rules

### Default Exports: NO
```typescript
// ❌ BAD - harder to search, inconsistent imports
export default function parse() { ... }

// ✅ GOOD - explicit, searchable
export function parse() { ... }
```

### Barrel Exports
Each module should have an `index.ts`:
```typescript
// src/parser/index.ts
export { tokenizeLine } from './tokenizer';
export { buildAST } from './ast-builder';
export type { LogToken, EventNode } from './types';
```

---

## 🎯 AI-Specific Output Conventions

### Confidence Scores
Always include confidence for uncertain analysis:
```typescript
interface AnalysisResult {
  finding: string;
  
  /** Confidence level: 0.0 (guess) to 1.0 (certain) */
  confidence: number;
  
  /** Why this confidence level? */
  confidenceReasons: string[];
}
```

### AI Guidance Fields
Include hints for AI consumers:
```typescript
interface Issue {
  type: string;
  message: string;
  
  /** Guidance for AI on how to handle this issue */
  aiGuidance: {
    /** Can the AI generate a fix? */
    canFix: boolean;
    
    /** If canFix is false, why? */
    cannotFixReason?: string;
    
    /** Suggested actions for AI to take */
    suggestedActions: string[];
    
    /** What to tell the user */
    userMessage: string;
  };
}
```

---

## 🚫 Anti-Patterns to Avoid

### 1. Nested Callbacks
```typescript
// ❌ BAD
fetchLog(id, (log) => {
  parseLog(log, (parsed) => {
    analyzeLog(parsed, (result) => {
      // callback hell
    });
  });
});

// ✅ GOOD
const log = await fetchLog(id);
const parsed = await parseLog(log);
const result = await analyzeLog(parsed);
```

### 2. Mutating Parameters
```typescript
// ❌ BAD
function addIssue(issues: Issue[], issue: Issue) {
  issues.push(issue); // mutates input
}

// ✅ GOOD
function addIssue(issues: Issue[], issue: Issue): Issue[] {
  return [...issues, issue]; // returns new array
}
```

### 3. Any Type
```typescript
// ❌ BAD
function parse(data: any): any { ... }

// ✅ GOOD
function parse(data: RawLogData): Result<ParsedLog, ParseError> { ... }
```

### 4. Overly Long Functions
```typescript
// ❌ BAD - 100+ line function

// ✅ GOOD - break into smaller functions
function parseLog(raw: string): ParsedLog {
  const tokens = tokenize(raw);
  const events = buildEvents(tokens);
  const tree = buildTree(events);
  return summarize(tree);
}
```

---

## 📋 Checklist Before Committing

AI agents should verify:

- [ ] File has header comment with @module, @status, @see
- [ ] All exports have JSDoc with @example
- [ ] No `any` types
- [ ] No throwing errors (use Result type)
- [ ] No magic numbers
- [ ] File under 200 lines
- [ ] Tests written for new functions
- [ ] MODULE STATE.md updated
- [ ] PROJECT_STATE.md updated

---

## 🔄 Git Commit Messages

Use conventional commits:
```
feat(parser): add SOQL event handler
fix(async): correct job ID extraction regex
docs(readme): add installation instructions
test(parser): add truncation test cases
refactor(output): split formatter into modules
chore(deps): update typescript to 5.3
```

Format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `style`

---

*AI agents: Following these conventions ensures consistency across the codebase and makes it easier for other AI agents to understand and work with the code.*
