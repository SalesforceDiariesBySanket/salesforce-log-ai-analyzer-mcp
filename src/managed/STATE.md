# Module: Managed Package Handling

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: @copilot

---

## Purpose

Detect managed package boundaries, attribute issues to vendor vs user code, and generate AI guidance for obfuscated code.

---

## Status: CODE COMPLETE

**Progress**: 5/5 tasks complete  
**⚠️ Warning**: Unit tests not yet written!

---

## Dependencies

### This Module Depends On
- `src/types/managed.ts` - Managed package types ✅
- `src/types/events.ts` - Event types ✅
- `src/parser/` - Parsed events ✅
- `src/analyzer/` - Detected issues ✅

### Modules That Depend On This
- `src/output/` - Include attribution in output
- `src/mcp/` - Expose via MCP

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | ~120 | Module exports + analyzeManagedPackages orchestrator |
| `namespace-detector.ts` | [x] | ~525 | Detect namespaces in log, track execution context |
| `visibility-classifier.ts` | [x] | ~520 | Classify PUBLIC/PRIVATE/UNKNOWN visibility |
| `attribution-engine.ts` | [x] | ~630 | Attribute issues to user/vendor code |
| `ai-guidance.ts` | [x] | ~560 | Generate guidance for obfuscated code |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Key Interfaces

```typescript
interface NamespaceInfo {
  namespace: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNKNOWN';
  category: NamespaceCategory;
  isManaged: boolean;
  isObfuscated: boolean;
  vendor?: VendorInfo;
  confidence: Confidence;
}

interface Attribution {
  source: 'USER_CODE' | 'MANAGED_PACKAGE' | 'BOUNDARY' | 'UNKNOWN';
  namespace?: string;
  confidence: Confidence;
  canModify: boolean;
  canView: boolean;
  aiGuidance: string;
  recommendations: string[];
  vendorContact?: VendorInfo;
}
```

---

## Key Features

1. **Namespace Detection**
   - Extracts namespaces from ENTERING_MANAGED_PKG events
   - Detects namespaces from class name prefixes
   - Tracks execution context through namespace stack

2. **Visibility Classification**
   - Classifies code as PUBLIC/PRIVATE/UNKNOWN
   - Detects obfuscation patterns in method names
   - Database of 10+ known managed packages

3. **Attribution Engine**
   - Attributes issues to USER_CODE, MANAGED_PACKAGE, or BOUNDARY
   - Generates evidence-based confidence scores
   - Provides actionable recommendations

4. **AI Guidance**
   - Generates guidance for working with obfuscated code
   - Provides vendor contact templates
   - Lists what AI can/cannot help with

---

## Testing

```bash
npm run build  # Type check passes ✅
npm run test:managed  # When tests are written
```

**⚠️ STATUS**: No test files exist yet! Tests need to be written.

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Namespace detector | [x] | KNOWN_NAMESPACES database, context tracking |
| 2 | Visibility classifier | [x] | Obfuscation detection, evidence-based |
| 3 | Attribution engine | [x] | Evidence collection, confidence scoring |
| 4 | AI guidance generator | [x] | Comprehensive guidance templates |
| 5 | Module orchestrator | [x] | analyzeManagedPackages entry point |
