# Module: Analyzer

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: @copilot (Phase 6 Log Level Awareness complete)

---

## Purpose

Detect issues, analyze patterns, and categorize problems in parsed Salesforce debug logs.

---

## Status: ✅ CODE COMPLETE (Phase 3 + Phase 6 Log Level Awareness)

**Progress**: 12/12 core tasks complete  
**⚠️ Warning**: Unit tests not yet written!

---

## Dependencies

### This Module Depends On
- `src/types/events.ts` - Event type definitions ✅
- `src/types/issues.ts` - Issue type definitions ✅
- `src/parser/` - Parsed log input ✅

### Modules That Depend On This
- `src/output/` - Formats analysis results
- `src/mcp/` - Exposes analysis via MCP
- `src/managed/` - Enriches with attribution

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | ~330 | Main analyzer orchestrator |
| `categorizer.ts` | [x] | ~280 | Categorize issues, health score, AI guidance |
| `debug-level-validator.ts` | [x] | ~406 | Validate debug levels for detectors |
| `level-detector.ts` | [x] | ~420 | **Phase 6**: Detect/infer debug levels from logs |
| `level-capabilities.ts` | [x] | ~380 | **Phase 6**: Map levels to detector capabilities |
| `level-limitations.ts` | [x] | ~450 | **Phase 6**: Report analysis limitations |
| `summarizer.ts` | [x] | ~750 | Generate <500 token summaries (with level context) |
| `detectors/index.ts` | [x] | ~60 | All detector exports |
| `detectors/soql-in-loop.ts` | [x] | ~350 | SOQL in loop detection |
| `detectors/n-plus-one.ts` | [x] | ~350 | N+1 query detection |
| `detectors/recursive-trigger.ts` | [x] | ~450 | Recursive trigger detection |
| `detectors/non-selective.ts` | [x] | ~350 | Non-selective query detection |
| `detectors/cpu-hotspot.ts` | [x] | ~400 | CPU time hotspot detection |
| `detectors/governor-limits.ts` | [x] | ~450 | Governor limit analysis |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Phase 6: Log Level Awareness (2026-01-31) ✅ COMPLETE

### Purpose
Different Salesforce debug levels capture different events. This affects what analysis is possible and reliable.

### New Components

#### 1. Level Detector (`level-detector.ts`)
Detects debug levels from logs via:
- Explicit header parsing
- Event type inference (fallback)

```typescript
import { detectLogLevels, summarizeDetection } from './analyzer';

const detection = detectLogLevels(parsedLog.events, parsedLog.metadata);
console.log(summarizeDetection(detection));
// "Debug levels (inferred from events): Apex_code: FINE, Database: INFO"
```

#### 2. Capability Inferrer (`level-capabilities.ts`)
Maps debug levels to available analysis capabilities:

```typescript
import { assessCapabilities, getRecommendedLevels } from './analyzer';

const caps = assessCapabilities(detection);
console.log('Available detectors:', caps.availableDetectors);
console.log('Unavailable:', caps.unavailableDetectors);
```

#### 3. Limitation Reporter (`level-limitations.ts`)
Reports what analysis is affected by debug level limitations:

```typescript
import { generateLimitationReport, getQuickReliabilityCheck } from './analyzer';

const report = generateLimitationReport(detection);
if (report.hasSignificantLimitations) {
  console.warn(report.summary);
  console.log('AI Guidance:', report.aiGuidance);
}
```

#### 4. Updated Summarizer
Summaries now include `debugLevels` context:

```typescript
const summary = generateSummary(parsedLog, analysis);
console.log(summary.aiContext.debugLevels);
// {
//   detectionMethod: 'INFERRED',
//   reliabilityScore: 75,
//   unavailableDetectors: ['Non-Selective Query Detector'],
//   warnings: ['Database level: INFO (need FINE)']
// }
```

### Key Types
```typescript
interface LogLevelDetection {
  detectionMethod: 'HEADER' | 'INFERRED' | 'UNKNOWN';
  detectedLevels: Partial<Record<DebugCategory, DebugLevel>>;
  confidence: number;
  evidence: LevelEvidence[];
}

interface CapabilityAssessment {
  overallScore: number;
  availableDetectors: string[];
  unavailableDetectors: string[];
  availableMetrics: string[];
  summary: string;
}

interface LimitationReport {
  hasSignificantLimitations: boolean;
  reliabilityScore: number;
  limitations: AnalysisLimitation[];
  aiGuidance: string[];
  trustworthyResults: string[];
  cautiousResults: string[];
}
```

---

## Debug Level Validation (Pre-Phase 6)

### Purpose
Different detectors require different Salesforce debug levels. For example:
- CPU hotspot detection requires `Apex Code: FINE` for METHOD_ENTRY/EXIT events
- Non-selective query detection requires `Database: FINE` for query plan data

### Usage
```typescript
import { validateDebugLevels, generateDebugLevelGuidance } from './analyzer';

const validation = validateDebugLevels(parsedLog.metadata, parsedLog.events);
if (!validation.isSufficient) {
  console.warn('Analysis may be incomplete:', validation.warnings);
  console.log('Affected detectors:', validation.affectedDetectors);
}
```

### Key Types
```typescript
interface DebugLevelValidation {
  isSufficient: boolean;
  confidenceAdjustment: number;
  warnings: DebugLevelWarning[];
  affectedDetectors: string[];
  recommendations: string[];
}
```

---

## Key Interfaces

```typescript
// Main analyzer function
function analyzeLog(parsedLog: ParsedLog, options?: AnalysisOptions): AnalysisResult;

// Quick analysis
function quickAnalyze(events: EventNode[]): CompactSummary;

// Get critical issues only
function getCriticalIssues(events: EventNode[]): Issue[];

// Get fixable issues (user code only)
function getFixableIssues(events: EventNode[]): Issue[];

// All detectors implement IssueDetector interface
interface IssueDetector {
  name: string;
  detects: IssueType[];
  detect(events: EventNode[]): Issue[];
}
```

---

## Detectors Implemented

| Detector | Issues Detected | Confidence-Based | Min Debug Level |
|----------|-----------------|------------------|-----------------|
| `soqlInLoopDetector` | SOQL_IN_LOOP | ✅ Yes | Database: INFO |
| `nPlusOneDetector` | N_PLUS_ONE | ✅ Yes | Database: INFO |
| `recursiveTriggerDetector` | RECURSIVE_TRIGGER | ✅ Yes | Apex Code: DEBUG |
| `nonSelectiveDetector` | NON_SELECTIVE_QUERY, SLOW_QUERY | ✅ Yes | Database: FINE |
| `cpuHotspotDetector` | CPU_HOTSPOT, CPU_TIMEOUT | ✅ Yes | Apex Code: FINE |
| `governorLimitsDetector` | All limit issues | ✅ Yes | System: INFO |

---

## Bug Fixes Applied

| Date | Bug | Fix |
|------|-----|-----|
| 2026-01-31 | SOQL double-counting in loop detector | `extractSOQLEvents()` now filters only `SOQL_EXECUTE_BEGIN` events to avoid counting both BEGIN and END |

---

## Testing

```bash
# Run analyzer tests (when written)
npm run test:analyzer

# Run detector tests (when written)
npm run test:detectors

# Run level tests (when written)
npm run test:levels
```

**⚠️ STATUS**: No test files exist yet! Tests need to be written.

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | SOQL in loop detector | [x] | Detects repeated queries and method patterns |
| 2 | N+1 query detector | [x] | Parent-child correlation with confidence |
| 3 | Recursive trigger detector | [x] | Direct and indirect recursion |
| 4 | Non-selective query detector | [x] | Query plan analysis + heuristics |
| 5 | CPU hotspot detector | [x] | Exclusive time calculation |
| 6 | Governor limit analyzer | [x] | Per-limit and namespace tracking |
| 7 | Issue categorizer | [x] | Health score, AI guidance |
| 8 | Main orchestrator | [x] | analyzeLog, quickAnalyze functions |
| 9 | Level detector | [x] | **Phase 6**: Detect/infer debug levels |
| 10 | Capability inferrer | [x] | **Phase 6**: Map levels to capabilities |
| 11 | Limitation reporter | [x] | **Phase 6**: Report analysis limitations |
| 12 | Update summarizer for levels | [x] | **Phase 6**: Add level context to summaries |

---

## Architecture Alignment ✅

- **Confidence-scored outputs** - All detectors return confidence scores
- **AI-first design** - Issues include aiContext and aiGuidance
- **Attribution tracking** - USER_CODE vs MANAGED_PACKAGE
- **Fix patterns** - Before/after code examples
- **Recommendations** - Actionable suggestions per issue
- **Debug level awareness** - Analysis adapts to available data (Phase 6)

---

## Last Updated
2026-01-31 by @copilot (Phase 6 Log Level Awareness complete)
