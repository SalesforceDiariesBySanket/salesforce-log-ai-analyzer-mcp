# AI-First Salesforce Debug Log Analyzer

## Architecture Document v2.1

> **Goal**: Local-first, AI-optimized debug log analysis for Salesforce that produces structured, token-efficient outputs for AI coding assistants via MCP (Model Context Protocol).

> **v2.1 Changes**: Added Platform Limitations & Failure Modes, Confidence-Based Correlation, Privacy/Redaction Requirements, Log-Level-Aware Parsing, and Identity Clarification.

> **v2.0 Changes**: Added Async Job Correlation, Truncation Robustness, Managed Package Detection, and Headless Auth support based on edge case analysis.

---

## 0. Identity Clarification: What "AI-First" Means

> **Critical Distinction**: This tool is designed for **AI agents as primary consumers**, with developers as secondary users who interact via CLI for setup/verification.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSUMER HIERARCHY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRIMARY CONSUMER: AI CODING ASSISTANTS (Claude, GPT, etc.)     │
│  ─────────────────────────────────────────────────────────────  │
│  • Receives: JSON/JSONL structured data                          │
│  • Generates: Human-readable explanations + code fixes           │
│  • Purpose: Automated reasoning over parsed log data             │
│                                                                  │
│  SECONDARY CONSUMER: DEVELOPERS (via CLI)                        │
│  ─────────────────────────────────────────────────────────────  │
│  • Uses: CLI for debug session setup, log fetching               │
│  • Receives: AI-generated explanations (not raw tool output)    │
│  • Purpose: Trigger analysis, verify results, manual override    │
│                                                                  │
│  DESIGN IMPLICATION                                              │
│  ─────────────────                                               │
│  • DO NOT generate prose in tool outputs (AI will explain)       │
│  • DO emit structured data with confidence scores                │
│  • DO include "aiGuidance" fields for AI decision-making         │
│  • DO NOT duplicate work (no "plain English" + JSON)             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What We Generate vs What AI Generates

| Our Tool Outputs | AI Agent Generates |
|------------------|--------------------|
| `{ "error": "System.NullPointerException", "line": 45 }` | "There's a null pointer error at line 45. Here's a fix..." |
| `{ "confidence": 0.7, "attribution": "BOUNDARY" }` | "I'm fairly confident the issue is at the boundary..." |
| `{ "canFix": false, "reason": "managed_package" }` | "I can't fix this because it's inside a managed package." |
| `{ "recommendations": ["bulkify", "cache"] }` | "You should bulkify this query and consider caching." |

---

## 1. Problem Statement

| Challenge | Impact |
|-----------|--------|
| Salesforce debug logs are **massive** (10MB+, 100K+ lines) | AI assistants run out of context tokens |
| Important errors are **buried** in noise | Manual log reading is slow and error-prone |
| Current tools output **human-readable** formats | AI needs structured, queryable data |
| No **memory** of past debugging sessions | Same issues get re-debugged repeatedly |
| **Getting the right logs** from Salesforce is tedious | Trace flags expire, wrong user, missing events |
| **Installation complexity** blocks adoption | Developers need zero-friction setup |
| **Async jobs fail in separate logs** *(NEW)* | Parent log shows success, child log has the real error |
| **Logs truncate at 20MB** *(NEW)* | Critical stack traces at end are lost |
| **Managed packages are obfuscated** *(NEW)* | AI cannot analyze vendor code but tries anyway |

---

## 2. Design Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI-FIRST PRINCIPLES                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. STRUCTURED OUTPUT     → JSON/JSONL, not prose               │
│  2. TOKEN-EFFICIENT       → Summary first, details on demand    │
│  3. QUERYABLE             → Filter/search parsed data           │
│  4. LOCAL-FIRST           → No cloud dependency, fast           │
│  5. MEMORY-ENABLED        → Learn from past sessions            │
│  6. CATEGORICAL           → Group issues by type automatically  │
│  7. ZERO-CONFIG INSTALL   → npx/pip single command              │
│  8. SMART LOG CAPTURE     → Auto trace flags, right debug level │
│  9. CONFIDENCE-SCORED     → Probabilistic, not deterministic    │
│  10. ASYNC-AWARE          → Correlate parent/child job logs     │
│  11. TRUNCATION-SAFE      → JSONL streaming, graceful degrades  │
│  12. VENDOR-AWARE         → Flag managed package black boxes    │
│  13. PRIVACY-CONSCIOUS    → Auto-redact PII, opt-in persistence │
│  14. LEVEL-AWARE          → Adapt parsing to debug level        │
│  15. FAILURE-TRANSPARENT  → Explicit about what can't be known  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Principle 9: Confidence-Scored (CRITICAL)

> **Why**: Async correlation, attribution, and issue detection are inherently uncertain. Binary "found/not found" leads to AI hallucination. Probabilistic outputs let the AI communicate uncertainty to users.

```typescript
// BAD: Binary output
{ "childLog": "07L...xyz", "error": "NullPointer" }
// AI says: "The error is definitely in 07L...xyz"

// GOOD: Confidence-scored output  
{
  "correlationCandidates": [
    { "logId": "07L...xyz", "confidence": 0.85, "matchReasons": ["class_name", "time_window", "job_status"] },
    { "logId": "07L...abc", "confidence": 0.45, "matchReasons": ["class_name", "time_window"] }
  ],
  "bestMatch": "07L...xyz",
  "ambiguityWarning": "Multiple potential matches - confidence based on 3 signals"
}
// AI says: "I'm 85% confident the error is in 07L...xyz based on class name, timing, and job status"
```

---

## 3. Unique Features Consolidated from Open Source Tools

### Source Analysis

| Tool | Unique Feature | Incorporated | Value for AI |
|------|----------------|--------------|--------------|
| **Certinia/debug-log-analyzer** | Flame chart, Call tree, SOQL selectivity analysis, Governor limits by namespace | ✅ Core parser | Hierarchical context |
| **apex-log-parser (CLI)** | JSON output, `jq` piping, Tree renderer, Flat event array | ✅ AI output format | Direct AI consumption |
| **SFDC-Log** | Git-graph visualization, Trigger pattern detection | ✅ Pattern detection | Recursion detection |
| **Salesforce Log Subscriber** | Real-time streaming, Trace flag management | ✅ Debug session setup | Smart capture |
| **Apex Replay Debugger** | Step-through execution, Variable inspection | 🔄 Future: breakpoint context | Debug context |
| **python-apex-log-parser** | Subscriber/ISV log parsing, Query ownership hierarchy | ✅ Namespace attribution | ISV debugging |
| **felisbinofarms/salesforce-debug-log-analyzer** | OAuth PKCE flow, Trace flag management UI, Material Design WPF, N+1 detection, Plain English summaries | ✅ OAuth + Smart capture | Frictionless connection |
| **salesforce/logai** | ML anomaly detection (SVM, Isolation Forest, LSTM, LogBERT), Log clustering, Time-series analysis, Drain parser | ✅ Anomaly detection | Pattern learning |

### 3.1 New Features from felisbinofarms/salesforce-debug-log-analyzer

| Feature | Implementation | Value |
|---------|---------------|-------|
| **OAuth 2.0 with PKCE** | Public client flow (no secret needed), uses `PlatformCLI` client ID | Zero-config Salesforce auth |
| **Trace Flag Management** | Auto-create/manage trace flags via Tooling API | Always capture the right logs |
| **Debug Level Configuration** | Select FINEST/DETAILED/STANDARD levels per category | Reduce noise, capture what matters |
| **N+1 Query Detection** | Group identical queries, detect repetition patterns | Root cause identification |
| **Plain English Summaries** | Human-readable explanation alongside structured data | User understanding |
| **Local SQLite Cache** | Store parsed logs locally | Fast re-analysis |

### 3.2 New Features from salesforce/logai

| Feature | Implementation | Value | **Maturity** |
|---------|---------------|-------|-------------|
| **Drain Log Parser** | Template-based log parsing for structured extraction | Auto-pattern discovery | ✅ **v1 Ready** |
| **Isolation Forest** | Unsupervised anomaly detection | Detect unusual patterns | ⚠️ **v3+ (needs training data)** |
| **One-Class SVM** | Semantic anomaly detection on log vectors | Outlier identification | ⚠️ **v3+ (needs training data)** |
| **LSTM/CNN Detectors** | Deep learning for sequence anomalies | Complex pattern recognition | ❌ **v4+ (research phase)** |
| **LogBERT** | Transformer-based log understanding | Context-aware analysis | ❌ **v4+ (research phase)** |
| **Time-Series Analysis** | ETS/DBL for counter anomalies | Trend detection | ⚠️ **v2 (heuristics first)** |
| **Word2Vec/FastText** | Log vectorization for ML | Semantic similarity | ⚠️ **v3+ (optional)** |
| **OpenTelemetry Compatible** | Standard log data model | Interoperability | ✅ **v1 Ready** |

> **⚠️ ML Reality Check**: The AI agent consuming this tool's output is ALREADY an LLM doing pattern recognition. Adding another ML layer (Isolation Forest, SVM, LSTM) is:
> - **Redundant** for pattern detection (LLM does this)
> - **Opaque** (what does "anomaly score 0.87" mean to an LLM?)
> - **Training-hungry** (where's the labeled Salesforce log anomaly dataset?)
>
> **Recommendation**: For v1-v2, use Drain parser for template extraction + heuristic clustering. Save deep ML for v4+ when you have production training data.

---

## 4. Smart Debug Log Capture

> **Critical Problem**: Developers often capture logs with wrong debug levels, miss the right user, or let trace flags expire mid-debugging.

### 4.1 Intelligent Trace Flag Management

```typescript
interface SmartCapture {
  // Auto-detect what debug levels are needed
  detectRequiredLevels(context: {
    suspectedIssue: 'SOQL_LIMIT' | 'CPU_TIMEOUT' | 'CALLOUT_FAILURE' | 'TRIGGER_RECURSION' | 'FLOW_ERROR';
  }): DebugLevelConfig;
  
  // Create trace flag with optimal settings
  setupTraceFlag(config: {
    targetType: 'USER' | 'CLASS' | 'TRIGGER';
    targetId: string;
    debugLevel: DebugLevelConfig;
    durationMinutes: number;  // Auto-extend if still debugging
  }): Promise<TraceFlagResult>;
  
  // Watch for new logs and auto-fetch
  watchForLogs(config: {
    autoFetch: boolean;
    parseOnFetch: boolean;
    notifyOnError: boolean;
    trackAsyncJobs: boolean;  // NEW: Follow async job logs
  }): LogWatcher;
}

interface DebugLevelConfig {
  Apex_Code: 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST';
  Apex_Profiling: 'NONE' | 'INFO' | 'FINE' | 'FINEST';
  Callout: 'NONE' | 'INFO' | 'FINE' | 'FINER' | 'FINEST';
  Database: 'NONE' | 'INFO' | 'FINE' | 'FINER' | 'FINEST';
  System: 'NONE' | 'INFO' | 'DEBUG' | 'FINE';
  Validation: 'NONE' | 'INFO';
  Visualforce: 'NONE' | 'INFO' | 'FINE' | 'FINER' | 'FINEST';
  Workflow: 'NONE' | 'INFO' | 'FINE' | 'FINER';
}
```

### 4.2 Debug Level Presets by Issue Type

```json
{
  "SOQL_LIMIT": {
    "Database": "FINEST",
    "Apex_Code": "FINE",
    "Apex_Profiling": "FINEST",
    "comment": "Capture all queries with timing and selectivity"
  },
  "CPU_TIMEOUT": {
    "Apex_Code": "FINE",
    "Apex_Profiling": "FINEST",
    "System": "DEBUG",
    "comment": "Capture method entry/exit for profiling"
  },
  "TRIGGER_RECURSION": {
    "Apex_Code": "FINEST",
    "Workflow": "FINER",
    "Database": "FINE",
    "comment": "Capture DML and workflow causing re-entry"
  },
  "CALLOUT_FAILURE": {
    "Callout": "FINEST",
    "Apex_Code": "FINE",
    "comment": "Capture full request/response"
  },
  "FLOW_ERROR": {
    "Workflow": "FINEST",
    "Validation": "INFO",
    "Apex_Code": "FINE",
    "comment": "Capture flow element execution"
  },
  "ASYNC_JOB": {
    "Apex_Code": "FINE",
    "Apex_Profiling": "FINE",
    "Database": "FINE",
    "System": "DEBUG",
    "comment": "NEW: Balanced capture for Batch/Queueable/Future"
  }
}
```

### 4.3 Authentication Strategies (NEW)

> **Problem**: PKCE OAuth requires a local callback server. This fails in remote environments (Codespaces, GitPod, SSH).

```typescript
interface AuthStrategy {
  // Primary: PKCE with local callback (works for most users)
  pkceAuth(config: {
    environment: 'production' | 'sandbox';
    callbackPort?: number;  // Default: 1717
  }): Promise<AuthResult>;
  
  // Fallback 1: Device Code Flow (for headless/remote environments)
  deviceCodeAuth(config: {
    environment: 'production' | 'sandbox';
  }): Promise<AuthResult>;
  // User visits URL, enters code, no local server needed
  
  // Fallback 2: Manual token paste (last resort)
  manualTokenAuth(config: {
    accessToken: string;
    instanceUrl: string;
    refreshToken?: string;
  }): Promise<AuthResult>;
  
  // Fallback 3: SFDX auth URL import
  sfdxAuthImport(config: {
    authUrl: string;  // From `sfdx force:org:display --verbose`
  }): Promise<AuthResult>;
}

// Auto-detect best auth method
async function autoAuth(environment: 'production' | 'sandbox'): Promise<AuthResult> {
  // 1. Check if running in interactive terminal with localhost access
  if (canOpenBrowser() && isLocalhostAccessible()) {
    return pkceAuth({ environment });
  }
  
  // 2. Check if SFDX is available and has cached auth
  const sfdxAuth = await checkSfdxAuth(environment);
  if (sfdxAuth) {
    return sfdxAuthImport({ authUrl: sfdxAuth });
  }
  
  // 3. Fall back to device code flow
  console.log('Remote environment detected. Using device code flow...');
  return deviceCodeAuth({ environment });
}
```

### 4.4 Authentication Failure Modes (CRITICAL)

> **⚠️ Device Code Flow is NOT universally available in Salesforce.** Unlike Azure AD, Salesforce OAuth support varies by org configuration.

| Auth Method | Works When | Fails When | Fallback |
|-------------|------------|------------|----------|
| **PKCE** | Local dev, localhost accessible | Remote (Codespaces, SSH), firewall | Device Code |
| **Device Code** | Org allows PlatformCLI app, no IP restrictions | Org disabled Device Code grant, strict IP ranges | SFDX Import |
| **SFDX Import** | User has SF CLI installed + cached auth | No SF CLI, auth expired | Manual Token |
| **Manual Token** | User can get token from Developer Console | User unfamiliar with process | ❌ Fail |

```typescript
interface AuthResult {
  success: boolean;
  method: 'pkce' | 'device_code' | 'sfdx_import' | 'manual_token';
  accessToken?: string;
  instanceUrl?: string;
  
  // NEW: Failure transparency
  failureChain?: AuthFailure[];  // What was tried before success/final failure
  warnings?: string[];           // "Device Code worked but may not work in prod org"
}

interface AuthFailure {
  method: string;
  error: string;
  suggestion: string;  // "Enable PlatformCLI connected app in Setup"
}
```

---

## 5. Async Job Correlation (NEW SECTION)

> **Critical Gap**: When a user triggers a button, the synchronous log may show `System.enqueueJob()` returning successfully. The *actual* failure happens 30 seconds later in a completely separate log file with a different Request ID.

### 5.1 The Async Blindspot Problem

> **⚠️ CRITICAL LIMITATION**: Trace flags do NOT automatically follow async execution contexts. A trace flag on User A will NOT capture logs for async jobs running as "Automated Process" or other system contexts.

```
┌─────────────────────────────────────────────────────────────────┐
│              TRACE FLAG COVERAGE MATRIX                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Scenario                  Trace On    Async Runs As   Captured? │
│  ────────────────────────  ──────────  ──────────────  ───────── │
│  User clicks button        User A      User A (Queue)  ✅ Maybe   │
│  User clicks button        User A      Automated Proc  ❌ NO      │
│  Scheduled job runs        User A      System context  ❌ NO      │
│  Platform Event fires      User A      Subscriber user ❌ NO      │
│  Batch job executes        User A      Batch user ctx  ⚠️ Partial │
│                                                                  │
│  SOLUTION: Set trace flags on BOTH:                              │
│    1. The human user triggering the action                       │
│    2. The "Automated Process" user (for async jobs)              │
│    3. Any integration users involved                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 The Async Gap Problem (Visualization)

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE ASYNC GAP PROBLEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User clicks "Process Records"                                   │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │  SYNC LOG       │  ← AI analyzes this                        │
│  │  (07L...abc)    │                                            │
│  │                 │                                            │
│  │  enqueueJob()   │  ← Returns Job ID: 7075g00000XYZ           │
│  │  SUCCESS ✓      │                                            │
│  └─────────────────┘                                            │
│           │                                                      │
│           │  30 seconds later...                                │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │  ASYNC LOG      │  ← AI NEVER SEES THIS                      │
│  │  (07L...xyz)    │                                            │
│  │                 │                                            │
│  │  FATAL_ERROR    │  ← The REAL problem is here!               │
│  │  NullPointer    │                                            │
│  └─────────────────┘                                            │
│                                                                  │
│  Without correlation: AI says "No issues found" 😱              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Async Job Tracker Architecture

```typescript
interface AsyncJobTracker {
  // Extract async job references from a parsed log
  extractAsyncJobs(log: ParsedLog): AsyncJobReference[];
  
  // Query Salesforce for child job status and logs
  correlateJobLogs(jobs: AsyncJobReference[], org: string): Promise<CorrelatedLogSet>;
  
  // Build unified view across parent + child logs
  buildCorrelatedSummary(logSet: CorrelatedLogSet): CorrelatedSummary;
}

interface AsyncJobReference {
  type: 'QUEUEABLE' | 'BATCH' | 'FUTURE' | 'SCHEDULABLE' | 'PLATFORM_EVENT';
  jobId: string | null;          // AsyncApexJob.Id (may not be in log)
  className: string;             // The Queueable/Batch class name
  methodName?: string;           // For @future methods
  parentLogId: string;           // Log where this was enqueued
  parentLogLine: number;         // Line number of enqueue call
  timestamp: number;             // When enqueued
  
  // Extracted from log patterns
  extractedFrom: 
    | 'SYSTEM_ENQUEUE_JOB'       // System.enqueueJob()
    | 'DATABASE_EXECUTE_BATCH'   // Database.executeBatch()
    | 'SYSTEM_SCHEDULE'          // System.schedule()
    | 'FUTURE_CALL'              // @future method invocation
    | 'EVENTBUS_PUBLISH';        // EventBus.publish()
}

interface CorrelatedLogSet {
  parentLog: ParsedLog;
  childLogs: ChildLogInfo[];
  correlation: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    pendingJobs: number;
    missingLogs: number;  // Jobs where log couldn't be found
  };
}

interface ChildLogInfo {
  jobReference: AsyncJobReference;
  jobStatus: 'Queued' | 'Preparing' | 'Processing' | 'Completed' | 'Failed' | 'Aborted';
  log: ParsedLog | null;         // null if log not yet available or expired
  error: string | null;          // From AsyncApexJob.ExtendedStatus
  logAvailability: 'FOUND' | 'PENDING' | 'EXPIRED' | 'NOT_CAPTURED';
  
  // NEW: Confidence-based correlation
  correlation: {
    confidence: number;           // 0.0 - 1.0
    matchReasons: MatchReason[];  // Why we think this is the right log
    alternativeCandidates: number; // How many other logs could match
    ambiguityWarning: string | null;
  };
}

// NEW: Explicit match reasoning
interface MatchReason {
  signal: 'CLASS_NAME' | 'JOB_ID' | 'TIME_WINDOW' | 'USER_MATCH' | 'JOB_STATUS' | 'OPERATION_FIELD';
  weight: number;      // Contribution to confidence score
  value: string;       // The matched value
  matched: boolean;    // Did this signal match?
}

// Confidence calculation
function calculateCorrelationConfidence(reasons: MatchReason[]): number {
  const weights = {
    JOB_ID: 0.5,        // Strongest signal (if present)
    CLASS_NAME: 0.2,    // Good but not unique
    TIME_WINDOW: 0.1,   // Necessary but not sufficient
    USER_MATCH: 0.1,    // Helps disambiguate
    JOB_STATUS: 0.05,   // Weak signal
    OPERATION_FIELD: 0.05
  };
  
  let score = 0;
  for (const reason of reasons) {
    if (reason.matched) {
      score += weights[reason.signal] || 0;
    }
  }
  
  // Penalize if multiple candidates exist
  // (handled separately in correlation logic)
  
  return Math.min(score, 1.0);
}
```

### 5.4 Async Event Detection Patterns

> **⚠️ Edge Cases That Break Naïve Regex Extraction**:
> - Namespaced classes: `ns__MyQueueable` vs `MyQueueable`
> - Inner classes: `OuterClass.InnerQueueable`
> - Dynamic enqueue: `System.enqueueJob(queueableVariable)` (no `new ClassName()` to parse)
> - Generic patterns: `System.enqueueJob(factory.createJob())`
> - Whitespace/line wraps in log output

```typescript
const ASYNC_PATTERNS = {
  // Pattern: System.enqueueJob(new MyQueueable())
  QUEUEABLE: {
    logPattern: /SYSTEM_METHOD_ENTRY.*System\.enqueueJob/,
    // IMPROVED: Handle namespaces and inner classes
    extractClass: /enqueueJob\(new\s+([\w_]+(?:__[\w_]+)?(?:\.[\w_]+)?)\s*\(/,
    // NOTE: Job ID extraction requires SYSTEM debug level
    jobIdPattern: /SYSTEM_METHOD_EXIT.*enqueueJob.*returns\s+(\w{15,18})/,
    // FALLBACK: If no class extracted, mark as "UNKNOWN_QUEUEABLE"
    requiresSystemLevel: true
  },
  
  // Pattern: Database.executeBatch(new MyBatch(), 200)
  BATCH: {
    logPattern: /SYSTEM_METHOD_ENTRY.*Database\.executeBatch/,
    extractClass: /executeBatch\(new\s+(\w+)/,
    jobIdPattern: /SYSTEM_METHOD_EXIT.*executeBatch.*returns\s+(\w{15,18})/
  },
  
  // Pattern: System.schedule('JobName', cron, new MySchedulable())
  SCHEDULABLE: {
    logPattern: /SYSTEM_METHOD_ENTRY.*System\.schedule/,
    extractClass: /schedule\([^,]+,\s*[^,]+,\s*new\s+(\w+)/
  },
  
  // Pattern: @future method call
  FUTURE: {
    logPattern: /METHOD_ENTRY.*\|(\w+)\.(\w+)\|.*@future/,
    // Future methods don't return job IDs in logs
  },
  
  // Pattern: EventBus.publish(events)
  PLATFORM_EVENT: {
    logPattern: /SYSTEM_METHOD_ENTRY.*EventBus\.publish/,
    // Platform events trigger subscribers asynchronously
  }
};

function extractAsyncJobs(events: EventNode[]): AsyncJobReference[] {
  const jobs: AsyncJobReference[] = [];
  
  for (const event of events) {
    for (const [type, pattern] of Object.entries(ASYNC_PATTERNS)) {
      if (pattern.logPattern.test(event.name || '')) {
        const className = pattern.extractClass?.exec(event.name)?.[1];
        const jobId = pattern.jobIdPattern?.exec(event.name)?.[1];
        
        jobs.push({
          type: type as AsyncJobReference['type'],
          jobId: jobId || null,
          className: className || 'Unknown',
          parentLogId: event.source || '',
          parentLogLine: event.lineNumber || 0,
          timestamp: event.timeStartNs,
          extractedFrom: getExtractionSource(type)
        });
      }
    }
  }
  
  return jobs;
}
```

### 5.4 Async Job Log Retrieval

```typescript
async function correlateJobLogs(
  jobs: AsyncJobReference[], 
  org: string
): Promise<CorrelatedLogSet> {
  const conn = await getConnection(org);
  const childLogs: ChildLogInfo[] = [];
  
  for (const job of jobs) {
    // 1. Query AsyncApexJob for status
    const asyncJob = await conn.query<AsyncApexJob>(`
      SELECT Id, Status, ExtendedStatus, ApexClassId, ApexClass.Name,
             CreatedDate, CompletedDate, NumberOfErrors
      FROM AsyncApexJob
      WHERE ApexClass.Name = '${job.className}'
        AND CreatedDate >= ${toSoqlDateTime(job.timestamp - 60000)}
        AND CreatedDate <= ${toSoqlDateTime(job.timestamp + 300000)}
      ORDER BY CreatedDate DESC
      LIMIT 1
    `);
    
    if (!asyncJob.records.length) {
      childLogs.push({
        jobReference: job,
        jobStatus: 'Queued',
        log: null,
        error: null,
        logAvailability: 'PENDING'
      });
      continue;
    }
    
    const jobRecord = asyncJob.records[0];
    
    // 2. Find the debug log for this async job
    const logQuery = await conn.query<ApexLog>(`
      SELECT Id, LogLength, Operation, Request, Status
      FROM ApexLog
      WHERE Operation LIKE '%${job.className}%'
        AND StartTime >= ${toSoqlDateTime(jobRecord.CreatedDate)}
      ORDER BY StartTime ASC
      LIMIT 1
    `);
    
    let parsedLog: ParsedLog | null = null;
    let logAvailability: ChildLogInfo['logAvailability'] = 'NOT_CAPTURED';
    
    if (logQuery.records.length) {
      const logId = logQuery.records[0].Id;
      try {
        const logBody = await conn.request(`/sobjects/ApexLog/${logId}/Body`);
        parsedLog = parseLog(logBody);
        logAvailability = 'FOUND';
      } catch (e) {
        logAvailability = 'EXPIRED';  // Log body may have been deleted
      }
    }
    
    childLogs.push({
      jobReference: job,
      jobStatus: jobRecord.Status as ChildLogInfo['jobStatus'],
      log: parsedLog,
      error: jobRecord.ExtendedStatus || null,
      logAvailability
    });
  }
  
  return {
    parentLog: /* parent log */,
    childLogs,
    correlation: summarizeCorrelation(childLogs)
  };
}
```

### 5.5 MCP Tools for Async Correlation

```typescript
// Get async jobs from a log
interface GetAsyncJobs {
  tool: 'sf_debug_async_jobs';
  params: {
    logPath: string;
  };
  returns: {
    jobs: AsyncJobReference[];
    recommendation: string;  // "Found 3 async jobs. Use sf_debug_correlate to fetch child logs."
  };
}

// Correlate and fetch child job logs
interface CorrelateAsyncLogs {
  tool: 'sf_debug_correlate';
  params: {
    org: string;
    parentLogPath: string;
    waitForPending?: boolean;  // Wait up to 60s for pending jobs
    maxChildLogs?: number;     // Limit child logs to fetch (default: 5)
  };
  returns: {
    correlation: CorrelatedLogSet;
    summary: {
      parentStatus: 'SUCCESS' | 'FAILED';
      childrenStatus: 'ALL_SUCCESS' | 'SOME_FAILED' | 'ALL_FAILED' | 'PENDING';
      realError: string | null;  // Error from child if parent succeeded
      recommendation: string;
    };
  };
}
```

### 5.6 Async-Aware AI Summary

```json
{
  "file": "debug-2026-01-31.log",
  "status": "SUCCESS",
  "asyncCorrelation": {
    "hasAsyncJobs": true,
    "jobs": [
      {
        "type": "QUEUEABLE",
        "class": "ContactProcessorQueueable",
        "status": "FAILED",
        "childLogId": "07L...xyz",
        "error": "System.NullPointerException: Attempt to de-reference a null object"
      }
    ],
    "warning": "⚠️ Parent log shows SUCCESS but async child job FAILED",
    "realError": {
      "source": "CHILD_LOG",
      "type": "EXCEPTION",
      "error": "System.NullPointerException",
      "location": "ContactProcessorQueueable.cls:45"
    }
  },
  "recommendation": "The trigger completed but queued job failed. Fix null check at ContactProcessorQueueable.cls:45"
}
```

---

## 6. Truncation Handling (NEW SECTION)

> **Problem**: Salesforce hard-limits debug logs at 20MB. In high-volume scenarios with FINEST logging, logs truncate mid-execution. The most critical part (the final exception/stack trace) is often at the END and gets cut off.

### 6.1 Truncation Detection

```typescript
interface TruncationInfo {
  isTruncated: boolean;
  truncationType: 
    | 'NONE'           // Log is complete
    | 'SIZE_LIMIT'     // Hit 20MB limit
    | 'TIME_LIMIT'     // Hit 24-hour retention (partial fetch)
    | 'MID_EVENT';     // Truncated inside an event (worst case)
  
  lastCompleteEvent: number;      // ID of last fully parsed event
  estimatedMissingPercent: number; // Rough estimate of lost content
  lostEventTypes: EventType[];    // What event types were likely lost
  
  recovery: {
    canRecoverTree: boolean;      // Can we close open nodes?
    openNodes: number;            // How many nodes left open
    suggestedAction: string;      // What to do about it
  };
}

function detectTruncation(rawLog: string, events: EventNode[]): TruncationInfo {
  // Check for explicit truncation marker
  const hasMarker = rawLog.includes('*** Skipped') || 
                    rawLog.includes('Maximum debug log size reached');
  
  // Check for incomplete final line
  const lines = rawLog.split('\n');
  const lastLine = lines[lines.length - 1];
  const isLastLineComplete = lastLine.endsWith('|') || lastLine.trim() === '';
  
  // Check for unclosed event tree nodes
  const openNodes = countUnclosedNodes(events);
  
  // NEW: Best truncation signal - every successful execution ends with LIMIT_USAGE_FOR_NS
  const hasLimitUsageBlock = events.some(e => 
    e.type === 'LIMIT' && e.name?.includes('LIMIT_USAGE_FOR_NS')
  );
  
  // Check if we have a FATAL_ERROR (execution stopped intentionally)
  const hasFatalError = events.some(e => e.type === 'FATAL_ERROR');
  
  // Proper ending: either FATAL_ERROR or LIMIT_USAGE block
  const hasProperEnding = hasFatalError || hasLimitUsageBlock;
  
  // NEW: Warn if missing LIMIT_USAGE without FATAL_ERROR (strong truncation signal)
  const likelyTruncated = !hasProperEnding && !hasFatalError;
  
  if (!hasMarker && isLastLineComplete && openNodes === 0 && hasProperEnding) {
    return {
      isTruncated: false,
      truncationType: 'NONE',
      lastCompleteEvent: events[events.length - 1]?.id || 0,
      estimatedMissingPercent: 0,
      lostEventTypes: [],
      recovery: { canRecoverTree: true, openNodes: 0, suggestedAction: 'None needed' }
    };
  }
  
  return {
    isTruncated: true,
    truncationType: openNodes > 0 ? 'MID_EVENT' : 'SIZE_LIMIT',
    lastCompleteEvent: findLastCompleteEvent(events),
    estimatedMissingPercent: estimateMissing(rawLog),
    lostEventTypes: inferLostTypes(events),
    recovery: {
      canRecoverTree: openNodes < 10,
      openNodes,
      suggestedAction: openNodes > 0 
        ? 'Tree has unclosed nodes. Final exception may be missing.'
        : 'Log truncated but tree is valid. Reduce debug level to capture more.'
    }
  };
}
```

### 6.2 JSONL Streaming Output (Truncation-Safe)

> **Solution**: Instead of outputting a single JSON object (which becomes invalid if truncated), use JSONL (JSON Lines) where each line is a complete, independent JSON object.

```typescript
// BAD: Single JSON (breaks if truncated)
{
  "events": [
    { "id": 1, "type": "METHOD", "name": "doWork" },
    { "id": 2, "type": "SOQL", "query": "SELECT..." },
    // ... file truncates here - INVALID JSON! Parser crashes.
```

// GOOD: JSONL (each line is valid)
{"type":"META","filename":"debug.log","truncated":true}
{"type":"EVENT","id":1,"eventType":"METHOD","name":"doWork"}
{"type":"EVENT","id":2,"eventType":"SOQL","query":"SELECT..."}
{"type":"EVENT","id":3,"eventType":"METHOD_EXIT"}
// ... file truncates here - still valid! Parser processes what it has.
```

```typescript
interface JSONLOutput {
  // First line: metadata (MUST include schema version for forward compatibility)
  meta: {
    type: 'META';
    schemaVersion: '2.1';       // NEW: Required for tool compatibility
    filename: string;
    sizeBytes: number;
    truncated: boolean;
    truncationInfo?: TruncationInfo;
    parseStarted: string;  // ISO timestamp
    
    // NEW: Log level detection (affects what we can parse)
    detectedLogLevels: {
      Apex_Code: string;
      Database: string;
      System: string;
      // etc.
    };
  };
  
  // Subsequent lines: events (one per line)
  events: Array<{
    type: 'EVENT';
    id: number;
    parentId: number;
    eventType: EventType;
    // ... other EventNode fields
  }>;
  
  // Last line (if we get there): summary
  summary: {
    type: 'SUMMARY';
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'TRUNCATED';
    issueCount: number;
    // ... other summary fields
  };
}

// Streaming parser that handles partial files
function parseLogStreaming(
  logPath: string, 
  onEvent: (event: EventNode) => void,
  onComplete: (summary: ParsedLog) => void,
  onTruncation: (info: TruncationInfo) => void
): void {
  const stream = createReadStream(logPath, { encoding: 'utf8' });
  const parser = new StreamingLogParser();
  
  stream.on('data', (chunk) => {
    const events = parser.parseChunk(chunk);
    events.forEach(onEvent);
  });
  
  stream.on('end', () => {
    const truncationInfo = parser.checkTruncation();
    if (truncationInfo.isTruncated) {
      onTruncation(truncationInfo);
    }
    
    // Auto-close unclosed nodes
    parser.closeOpenNodes();
    
    onComplete(parser.getSummary());
  });
  
  stream.on('error', (err) => {
    // Even on error, emit what we have
    onTruncation({
      isTruncated: true,
      truncationType: 'MID_EVENT',
      // ...
    });
    onComplete(parser.getPartialSummary());
  });
}
```

### 6.3 Truncation-Aware AI Output

```json
{
  "file": "debug-2026-01-31.log",
  "size": "20.0 MB",
  "status": "TRUNCATED",
  
  "truncation": {
    "detected": true,
    "type": "SIZE_LIMIT",
    "lastCompleteEvent": "METHOD_EXIT at AccountTrigger.handleBeforeInsert",
    "missingEstimate": "~15% of execution",
    "warning": "⚠️ Log hit 20MB limit. Final exception/stack trace may be missing.",
    "lostEventTypes": ["EXCEPTION_THROWN", "FATAL_ERROR", "LIMIT_USAGE"],
    
    "recovery": {
      "treeValid": true,
      "unclosedMethods": 2,
      "action": "Reduce debug level (use FINE instead of FINEST) to capture full execution"
    }
  },
  
  "partialAnalysis": {
    "soqlQueries": {"found": 87, "possiblyMore": true},
    "cpuTime": {"measured": 8500, "note": "May be higher - log truncated before final measurement"},
    "issuesFound": [
      {"type": "SOQL_IN_LOOP", "location": "ContactService.cls:89", "confidence": "HIGH"}
    ],
    "issuesMayBeMissing": true
  },
  
  "recommendation": "Re-run with reduced debug levels: Database=FINE, Apex_Code=DEBUG"
}
```

---

## 7. Managed Package Detection (NEW SECTION)

> **Problem**: Debug logs for managed packages show `ENTERING_MANAGED_PACKAGE` and `EXITING_MANAGED_PACKAGE` but no internal details. The AI cannot fix vendor code but may hallucinate solutions.

### 7.1 Managed Package Visibility Rules

```
┌─────────────────────────────────────────────────────────────────┐
│              MANAGED PACKAGE LOG VISIBILITY                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  YOUR CODE (unmanaged)           VENDOR CODE (managed)          │
│  ─────────────────────           ─────────────────────          │
│                                                                  │
│  ✓ Full method names             ✗ Just "ENTERING_MANAGED_PKG"  │
│  ✓ Line numbers                  ✗ No line numbers              │
│  ✓ Variable values (FINEST)      ✗ No variable visibility       │
│  ✓ SOQL query text               ✗ "SELECT ... (managed)"       │
│  ✓ Exception stack traces        ⚠️ Partial (obfuscated lines)  │
│                                                                  │
│  AI CAN FIX                      AI CANNOT FIX                  │
│  ───────────                     ──────────────                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Managed Package Detection

```typescript
interface ManagedPackageInfo {
  namespace: string;
  packageName?: string;        // If we can infer from namespace
  visibility: 'FULL' | 'OBFUSCATED' | 'SUBSCRIBER';
  
  // What we can see
  observableMetrics: {
    totalTimeMs: number;       // Time spent in package
    soqlCount: number;         // Number of queries (not content)
    dmlCount: number;          // Number of DML ops
    cpuTimeMs: number;         // CPU attributed to package
  };
  
  // What we cannot see
  blindSpots: string[];        // ["Method names", "Query text", "Variable values"]
  
  // For AI
  aiGuidance: {
    canFix: boolean;
    reason: string;
    suggestedAction: string;
  };
}

function detectManagedPackages(events: EventNode[]): ManagedPackageInfo[] {
  const packages = new Map<string, ManagedPackageInfo>();
  
  for (const event of events) {
    if (event.type === 'MANAGED_PKG') {
      const namespace = extractNamespace(event.name);
      
      if (!packages.has(namespace)) {
        packages.set(namespace, {
          namespace,
          visibility: 'OBFUSCATED',
          observableMetrics: { totalTimeMs: 0, soqlCount: 0, dmlCount: 0, cpuTimeMs: 0 },
          blindSpots: ['Method internals', 'Query text', 'Variable values', 'Line numbers'],
          aiGuidance: {
            canFix: false,
            reason: `Code inside ${namespace} namespace is managed/obfuscated`,
            suggestedAction: 'Contact vendor or check for configuration options'
          }
        });
      }
      
      const pkg = packages.get(namespace)!;
      pkg.observableMetrics.totalTimeMs += event.durationMs || 0;
    }
  }
  
  return Array.from(packages.values());
}
```

### 7.3 Vendor vs Your Code Issue Attribution (Confidence-Based)

> **Improvement**: Attribution is NOT binary. Errors can propagate through boundaries in complex ways.

```typescript
interface IssueAttribution {
  issue: Issue;
  
  // PRIMARY: Where does the issue appear to originate?
  primary: 'YOUR_CODE' | 'VENDOR_CODE' | 'BOUNDARY' | 'UNKNOWN';
  
  // NEW: Confidence and reasoning
  confidence: number;  // 0.0 - 1.0
  reasons: string[];   // Why we attributed this way
  
  // NEW: Responsibility assignment (even if vendor code threw)
  yourResponsibility: string | null;  // "Check data passed to SBQQ API"
  vendorResponsibility: string | null; // "Bug in package - contact vendor"
  
  // Context for both sides
  yourCodeContext?: {
    file: string;
    line: number;
    callStack: string[];
  };
  
  vendorContext?: {
    namespace: string;
    entryPoint: string;        // Where your code called into vendor
    exitPoint: string;         // Where vendor returned/threw
  };
  
  // AI decision helper
  aiGuidance: {
    canAttemptFix: boolean;     // Even BOUNDARY issues may have user-side fixes
    fixConfidence: number;       // How confident are we the fix will work?
    suggestedActions: string[];
    escalationPath: string | null; // "Contact SBQQ support with error: ..."
  };
}

function attributeIssue(issue: Issue, events: EventNode[]): IssueAttribution {
  // Walk the call stack to find attribution
  const stack = buildCallStack(issue.eventId, events);
  
  // Find the boundary between managed and unmanaged
  const managedBoundary = stack.findIndex(e => e.type === 'MANAGED_PKG');
  
  if (managedBoundary === -1) {
    // Pure user code
    return {
      issue,
      attribution: 'YOUR_CODE',
      yourCodeContext: extractYourCodeContext(stack),
      aiRecommendation: 'This issue is in your code. Here is the fix...'
    };
  }
  
  if (managedBoundary === 0) {
    // Error originated inside managed package
    return {
      issue,
      attribution: 'VENDOR_CODE',
      vendorContext: extractVendorContext(stack),
      aiRecommendation: `⚠️ This error is inside the ${stack[0].namespace} package. ` +
        'I cannot see or modify vendor code. Options:\n' +
        '1. Check package configuration/settings\n' +
        '2. Contact vendor support with this error\n' +
        '3. Check your data for invalid values being passed to package'
    };
  }
  
  // Error at boundary - your code called vendor which failed
  return {
    issue,
    attribution: 'BOUNDARY',
    yourCodeContext: extractYourCodeContext(stack.slice(managedBoundary + 1)),
    vendorContext: extractVendorContext(stack.slice(0, managedBoundary + 1)),
    aiRecommendation: `Error occurred when your code (${stack[managedBoundary + 1].name}) ` +
      `called into ${stack[0].namespace} package. Check the data you're passing to the vendor method.`
  };
}
```

### 7.4 Managed Package-Aware AI Output

```json
{
  "file": "debug-2026-01-31.log",
  "status": "FAILED",
  
  "primaryIssue": {
    "type": "EXCEPTION",
    "error": "System.NullPointerException",
    "attribution": "VENDOR_CODE",
    "namespace": "SBQQ",
    
    "visibility": {
      "canSeeInternals": false,
      "reason": "SBQQ (Salesforce CPQ) is a managed package",
      "whatWeCanSee": ["Entry/exit timing", "Exception type", "Your code that called it"],
      "whatWeCannotSee": ["Line number inside package", "Variable values", "Method names"]
    },
    
    "aiAnalysis": {
      "canFix": false,
      "confidence": "LOW",
      "explanation": "The NullPointerException was thrown inside SBQQ package code. I cannot see what caused it.",
      
      "possibleCauses": [
        "Invalid data passed to SBQQ API",
        "Missing CPQ configuration",
        "Package bug (contact Salesforce)"
      ],
      
      "whatYouCanCheck": [
        "Verify Quote record has all required fields populated",
        "Check SBQQ__Quote__c.SBQQ__Account__c is not null",
        "Review SBQQ package settings in Setup"
      ],
      
      "yourCodeContext": {
        "file": "QuoteService.cls",
        "line": 45,
        "code": "SBQQ.QuoteAPI.calculateQuote(quoteId);",
        "suggestion": "Add null checks before calling SBQQ API"
      }
    }
  },
  
  "managedPackagesInvolved": [
    {
      "namespace": "SBQQ",
      "name": "Salesforce CPQ",
      "timeSpentMs": 2340,
      "soqlCount": 12,
      "verdict": "Cannot analyze - contact Salesforce CPQ support"
    }
  ]
}
```

---

## 8. Privacy & Redaction Requirements (NEW SECTION)

> **⚠️ CRITICAL**: Debug logs and episodic memory can contain sensitive data. GDPR/CCPA compliance requires automatic redaction.

### 8.1 What Gets Stored (Privacy Risk)

| Data Type | Where It Appears | Risk Level | Default Behavior |
|-----------|------------------|------------|------------------|
| **Email addresses** | SOQL WHERE clauses, error messages | HIGH | Auto-redact |
| **Phone numbers** | SOQL WHERE clauses, validation errors | HIGH | Auto-redact |
| **Record names** | Debug output, exception messages | MEDIUM | Opt-in to store |
| **Access tokens** | Callout logs, auth failures | CRITICAL | Always redact |
| **Session IDs** | System debug output | CRITICAL | Always redact |
| **Custom field values** | SOQL results, DML data | VARIABLE | User-configurable |

### 8.2 Redaction Rules

```typescript
interface RedactionConfig {
  // Always redacted (cannot disable)
  alwaysRedact: [
    'access_token',
    'refresh_token', 
    'session_id',
    'password',
    'secret',
    'api_key'
  ];
  
  // Redacted by default (can disable for debugging)
  defaultRedact: [
    'email',           // Regex: /\b[\w.-]+@[\w.-]+\.\w+\b/
    'phone',           // Regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/
    'ssn',             // Regex: /\b\d{3}-\d{2}-\d{4}\b/
    'credit_card'      // Regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/
  ];
  
  // User-configurable
  customPatterns: RegExp[];
  
  // Redaction strategy
  strategy: 'MASK' | 'HASH' | 'REMOVE';
  // MASK: "john@example.com" → "[EMAIL_REDACTED]"
  // HASH: "john@example.com" → "email_a1b2c3d4"
  // REMOVE: Field omitted entirely
}

function redactLog(log: ParsedLog, config: RedactionConfig): ParsedLog {
  // Deep clone and redact
  const redacted = JSON.parse(JSON.stringify(log));
  
  // Walk all string fields
  walkAndRedact(redacted, config);
  
  // Add redaction metadata
  redacted.meta.redaction = {
    applied: true,
    patternsMatched: countMatches(log, config),
    strategy: config.strategy
  };
  
  return redacted;
}
```

### 8.3 Memory Persistence Modes

```typescript
interface MemoryConfig {
  // Persistence mode
  mode: 'EPHEMERAL' | 'SESSION' | 'PERSISTENT';
  
  // EPHEMERAL: Nothing persisted, memory cleared after each analysis
  // SESSION: Stored in memory during session, cleared on exit
  // PERSISTENT: Stored to disk (SQLite), survives restarts
  
  // Encryption (required for PERSISTENT mode)
  encryption: {
    enabled: boolean;
    algorithm: 'AES-256-GCM';
    keySource: 'USER_PASSWORD' | 'SYSTEM_KEYCHAIN' | 'ENV_VAR';
  };
  
  // Data classification in output
  classification: {
    markSensitiveFields: boolean;  // Add "sensitive: true" to fields
    warnOnPiiInOutput: boolean;    // Emit warning if PII detected
  };
}
```

### 8.4 AI Consumer Guidance for Sensitive Data

```json
{
  "summary": {
    "status": "FAILED",
    "error": "Validation error on Contact"
  },
  "sensitiveDataWarning": {
    "detected": true,
    "fields": ["Contact.Email", "Contact.Phone"],
    "aiGuidance": "Do NOT echo the actual email/phone values back to the user. Refer to them as 'the email field' or 'the phone number'."
  },
  "redactedContent": {
    "originalQuery": "SELECT Id FROM Contact WHERE Email = '[EMAIL_REDACTED]'",
    "errorMessage": "Invalid email format for [EMAIL_REDACTED]"
  }
}
```

---

## 9. Log-Level-Aware Parsing (NEW SECTION)

> **Problem**: Parser behavior must adapt to the debug level used when capturing logs. A parser expecting FINEST patterns will produce false negatives on DEBUG-level logs.

### 9.1 What Each Level Provides

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DEBUG LEVEL → AVAILABLE DATA                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Level        Method      Variable   SOQL        CPU         Callout       │
│               Entry/Exit  Values     Explain     Profiling   Details       │
│  ─────────    ──────────  ─────────  ─────────   ──────────  ──────────    │
│  NONE         ✗           ✗          ✗           ✗           ✗             │
│  ERROR        ✗           ✗          ✗           ✗           ✗             │
│  WARN         ✗           ✗          ✗           ✗           ✗             │
│  INFO         ✗           ✗          ✗           ✗           ✓ Basic       │
│  DEBUG        ✗           ✗          ✗           ✗           ✓             │
│  FINE         ✓ Entry     ✗          ✓ Basic     ✓ Basic     ✓             │
│  FINER        ✓ Both      ✗          ✓           ✓           ✓ Full        │
│  FINEST       ✓ Both      ✓          ✓ Full      ✓ Full      ✓ Full        │
│                                                                              │
│  IMPLICATION: CPU hotspot analysis REQUIRES at least FINE level             │
│               Variable debugging REQUIRES FINEST level                       │
│               Basic issue detection works at DEBUG level                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Level Detection and Adaptive Parsing

```typescript
interface LogLevelDetection {
  // Detected from log header or inferred from content
  detected: {
    Apex_Code: LogLevel;
    Apex_Profiling: LogLevel;
    Database: LogLevel;
    System: LogLevel;
    Callout: LogLevel;
  };
  
  // What analysis is possible at these levels
  capabilities: {
    canDetectMethodEntryExit: boolean;
    canDetectVariableValues: boolean;
    canAnalyzeCpuHotspots: boolean;
    canAnalyzeSOQLSelectivity: boolean;
    canSeeCalloutPayloads: boolean;
  };
  
  // What analysis is NOT possible (explicit)
  limitations: {
    feature: string;
    requiredLevel: LogLevel;
    currentLevel: LogLevel;
    recommendation: string;
  }[];
}

function detectLogLevels(rawLog: string): LogLevelDetection {
  // Parse header line for explicit levels
  const headerMatch = rawLog.match(/\|DEBUG_LEVEL\|([^|]+)\|/);
  
  // Infer from content if header missing
  const hasMethodEntry = /METHOD_ENTRY/.test(rawLog);
  const hasMethodExit = /METHOD_EXIT/.test(rawLog);
  const hasVariableAssignment = /VARIABLE_ASSIGNMENT/.test(rawLog);
  const hasSOQLExplain = /SOQL_EXECUTE_EXPLAIN/.test(rawLog);
  
  // Build capabilities based on detection
  return {
    detected: inferLevels(headerMatch, rawLog),
    capabilities: {
      canDetectMethodEntryExit: hasMethodEntry,
      canDetectVariableValues: hasVariableAssignment,
      canAnalyzeCpuHotspots: hasMethodEntry && hasMethodExit,
      canAnalyzeSOQLSelectivity: hasSOQLExplain,
      canSeeCalloutPayloads: /CALLOUT_REQUEST/.test(rawLog)
    },
    limitations: buildLimitations(/* ... */)
  };
}
```

### 9.3 Level-Aware AI Output

```json
{
  "file": "debug-2026-01-31.log",
  "detectedLevels": {
    "Apex_Code": "DEBUG",
    "Database": "FINE",
    "System": "INFO"
  },
  
  "analysisLimitations": [
    {
      "analysis": "CPU Hotspot Detection",
      "status": "UNAVAILABLE",
      "reason": "Requires Apex_Code=FINE or higher for METHOD_ENTRY/EXIT events",
      "current": "Apex_Code=DEBUG",
      "recommendation": "Re-run with --level DETAILED to enable CPU profiling"
    },
    {
      "analysis": "Variable Value Inspection",
      "status": "UNAVAILABLE",
      "reason": "Requires Apex_Code=FINEST for VARIABLE_ASSIGNMENT events",
      "current": "Apex_Code=DEBUG",
      "recommendation": "Use Apex Replay Debugger for variable inspection"
    }
  ],
  
  "availableAnalysis": [
    "SOQL query detection and counting",
    "DML operation detection",
    "Exception detection",
    "Governor limit tracking",
    "Basic callout detection"
  ],
  
  "confidenceImpact": {
    "overallConfidence": 0.6,
    "reason": "Limited to basic analysis due to DEBUG log level"
  }
}
```

---

## 10. Core Architecture (Updated)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI DEBUG ASSISTANT v2.1                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   INPUT      │     │   PARSER     │     │   OUTPUT     │                │
│  │   LAYER      │     │   LAYER      │     │   LAYER      │                │
│  ├──────────────┤     ├──────────────┤     ├──────────────┤                │
│  │ • .log file  │────►│ • Tokenizer  │────►│ • AI Summary │                │
│  │ • stdin pipe │     │ • AST Builder│     │ • JSON/JSONL │                │
│  │ • SF API     │     │ • Categorizer│     │ • Query API  │                │
│  │ • Tail stream│     │ • Analyzer   │     │ • MCP Tools  │                │
│  │ • OAuth PKCE │     │ • Level-Aware│     │ • Streaming  │                │
│  │ • Device Code│     │ • Truncation │     │ • Redaction  │                │
│  └──────────────┘     │   Handler    │     └──────────────┘                │
│                       └──────────────┘                                      │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      SMART CAPTURE LAYER                              │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ • Auto Trace Flags    • Debug Level Presets    • Log Watching        │  │
│  │ • User Detection      • Org Connection Pool    • Event Streaming     │  │
│  │ • Auth Fallbacks (PKCE → Device Code → Manual → SFDX)               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   ASYNC JOB CORRELATION LAYER (NEW)                   │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ • Queueable Tracker   • Batch Job Tracker    • Future Method Tracker │  │
│  │ • Platform Event Sub  • Child Log Fetcher    • Unified Error View   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   MANAGED PACKAGE LAYER (NEW)                         │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ • Namespace Detection • Visibility Classifier • Attribution Engine   │  │
│  │ • Vendor Blackbox Flags • Boundary Analysis  • AI Guidance Generator │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      ANOMALY DETECTION LAYER                          │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ • Isolation Forest    • One-Class SVM    • Time-Series (ETS/DBL)    │  │
│  │ • Pattern Clustering  • Drain Parser     • Log Vectorization        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│                    ┌──────────────────┐                                     │
│                    │  MEMORY LAYER    │                                     │
│                    ├──────────────────┤                                     │
│                    │ • Factual KB     │                                     │
│                    │ • Semantic Index │                                     │
│                    │ • Episodic Store │                                     │
│                    │ • Session Cache  │                                     │
│                    └──────────────────┘                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Data Structures (Updated)

### 11.1 Parsed Log (AI-Optimized)

```typescript
interface ParsedLog {
  meta: {
    filename: string;
    sizeBytes: number;
    sizeMb: number;
    durationMs: number;
    parseTimeMs: number;
    apiVersion: string;
    
    // NEW: Truncation info
    truncation: TruncationInfo;
  };
  
  // Quick summary for AI (always include, <500 tokens)
  summary: {
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'TRUNCATED';
    primaryIssue: string | null;
    issueCount: number;
    topHotspot: string | null;
    limitsExceeded: string[];
    
    // NEW: Async awareness
    hasAsyncJobs: boolean;
    asyncJobsEnqueued: number;
    asyncWarning: string | null;  // "Check child logs for real error"
    
    // NEW: Managed package awareness  
    managedPackagesInvolved: string[];
    vendorCodeWarning: string | null;  // "Error may be in vendor code"
  };
  
  user: string;
  logLevels: LogLevel[];
  
  // Hierarchical tree (for detailed exploration)
  tree: TreeNode;
  
  // Flat events (for filtering/querying)
  events: EventNode[];
  
  // Pre-categorized issues (AI can request specific category)
  issues: CategorizedIssues;
  
  // Governor limits summary
  limits: GovernorLimits;
  
  // Performance hotspots
  hotspots: Hotspot[];
  
  // NEW: Async job references
  asyncJobs: AsyncJobReference[];
  
  // NEW: Managed package info
  managedPackages: ManagedPackageInfo[];
}
```

### 11.2 Event Node (Flat, Queryable)

```typescript
interface EventNode {
  id: number;
  parentId: number;
  type: EventType;
  name: string;
  
  // Timing
  timeStartNs: number;
  timeEndNs?: number;
  durationMs?: number;
  selfTimeMs?: number;
  percentOfTotal?: number;
  
  // Location
  lineNumber?: number;
  namespace?: string;
  className?: string;
  methodName?: string;
  
  // Type-specific data
  query?: string;           // SOQL
  object?: string;          // SOQL/DML
  operation?: string;       // DML
  rows?: number;            // SOQL/DML
  selectivity?: Selectivity; // SOQL
  request?: string;         // CALLOUT
  response?: string;        // CALLOUT
  exceptionType?: string;   // EXCEPTION
  limits?: LimitsObject;    // LIMIT
  
  // NEW: Visibility flag
  visibility: 'FULL' | 'MANAGED_OBFUSCATED' | 'TRUNCATED';
  
  // NEW: For async jobs
  asyncJobRef?: {
    type: AsyncJobReference['type'];
    jobId: string | null;
    className: string;
  };
  
  // For AI context
  source?: string;  // Log file name
}

type EventType = 
  | 'ROOT' | 'EXECUTION' | 'CODE_UNIT' | 'METHOD'
  | 'SOQL' | 'DML' | 'CALLOUT' | 'FLOW' | 'FLOW_ELEMENT'
  | 'EXCEPTION_THROWN' | 'FATAL_ERROR' | 'LIMIT'
  | 'MANAGED_PKG' | 'VALIDATION' | 'WORKFLOW' | 'TRIGGER'
  | 'ASYNC_ENQUEUE';  // NEW
```

### 11.3 Categorized Issues (Pre-Sorted for AI)

```typescript
interface CategorizedIssues {
  // Governor limit violations
  governorLimits: {
    soql: LimitIssue[];
    dml: LimitIssue[];
    cpu: LimitIssue[];
    heap: LimitIssue[];
    callouts: LimitIssue[];
    other: LimitIssue[];
  };
  
  // Exceptions and errors
  exceptions: {
    fatal: ExceptionIssue[];      // Unhandled, execution stopped
    thrown: ExceptionIssue[];     // Thrown but may be caught
    validation: ValidationIssue[];
  };
  
  // Performance issues
  performance: {
    soqlInLoop: SOQLInLoopIssue[];
    slowQueries: SlowQueryIssue[];
    nonSelectiveQueries: SelectivityIssue[];
    cpuHotspots: HotspotIssue[];
    dmlInLoop: DMLInLoopIssue[];
  };
  
  // Pattern-based issues
  patterns: {
    recursiveTrigger: RecursionIssue[];
    bulkificationNeeded: BulkIssue[];
    flowLoop: FlowLoopIssue[];
  };
  
  // Integration issues
  integration: {
    calloutFailures: CalloutIssue[];
    timeouts: TimeoutIssue[];
  };
  
  // NEW: Vendor/managed package issues (flagged as non-fixable)
  vendorIssues: {
    issues: VendorIssue[];
    warning: string;  // "These issues are in managed packages - cannot fix directly"
  };
  
  // NEW: Async job issues (may need child log)
  asyncIssues: {
    parentLogIssues: Issue[];       // Issues visible in parent log
    childLogRequired: boolean;      // True if error likely in async job
    pendingCorrelation: AsyncJobReference[];  // Jobs that need checking
  };
}
```

---

## 12. AI Output Formats (Updated)

### 12.1 Compact Summary (Default - <500 tokens)

```json
{
  "file": "debug-2026-01-31.log",
  "size": "12.3 MB",
  "duration": "4523 ms",
  "status": "FAILED",
  
  "dataQuality": {
    "truncated": false,
    "asyncJobsDetected": 2,
    "asyncWarning": "2 async jobs enqueued - check child logs if this log shows success but user reports failure",
    "managedPackages": ["SBQQ"],
    "vendorWarning": "1 issue may be inside SBQQ (Salesforce CPQ) - cannot analyze vendor internals"
  },
  
  "primaryIssue": {
    "type": "GOVERNOR_LIMIT",
    "error": "System.LimitException: Too many SOQL queries: 101",
    "location": "ContactService.cls:89",
    "pattern": "SOQL_IN_LOOP",
    "callCount": 47,
    "attribution": "YOUR_CODE",
    "canFix": true
  },
  
  "limits": {
    "soqlQueries": {"used": 101, "max": 100, "exceeded": true},
    "dmlStatements": {"used": 45, "max": 150, "exceeded": false},
    "cpuTime": {"used": 8500, "max": 10000, "exceeded": false}
  },
  
  "hotspots": [
    {"method": "ContactService.queryContacts", "calls": 47, "totalMs": 2100},
    {"method": "AccountTrigger.handleAfterUpdate", "calls": 1, "totalMs": 3800}
  ],
  
  "recommendations": [
    "Bulkify SOQL at ContactService.cls:89 - query is inside a loop",
    "Use Map<Id, List<Contact>> to cache query results"
  ],
  
  "nextSteps": [
    {"if": "User still reports error after fix", "then": "Run sf_debug_correlate to check async job logs"}
  ]
}
```

### 12.2 Problem Context (For AI Debugging)

```json
{
  "problem": {
    "type": "SOQL_IN_LOOP",
    "severity": "CRITICAL",
    "error": "System.LimitException: Too many SOQL queries: 101",
    "attribution": {
      "source": "YOUR_CODE",
      "canFix": true,
      "confidence": "HIGH"
    }
  },
  
  "evidence": {
    "queryExecutions": 47,
    "queryText": "SELECT Id, Name FROM Contact WHERE AccountId = :accId",
    "loopContext": "for (Account acc : Trigger.new)",
    "triggerSize": 47
  },
  
  "codeContext": {
    "file": "ContactService.cls",
    "lines": {
      "85": "    public void processAccounts(List<Account> accounts) {",
      "86": "        for (Account acc : accounts) {",
      "87": "            // Process each account",
      "88": "            List<Contact> contacts = [",
      "89": "                SELECT Id, Name FROM Contact WHERE AccountId = :acc.Id  // <-- PROBLEM",
      "90": "            ];",
      "91": "            processContacts(contacts);",
      "92": "        }",
      "93": "    }"
    }
  },
  
  "suggestedFix": {
    "pattern": "BULKIFY_WITH_MAP",
    "description": "Collect IDs, query once outside loop, use Map for lookup",
    "code": "Set<Id> accountIds = new Set<Id>();\nfor (Account acc : accounts) {\n    accountIds.add(acc.Id);\n}\nMap<Id, List<Contact>> contactsByAcct = new Map<Id, List<Contact>>();\nfor (Contact c : [SELECT Id, Name, AccountId FROM Contact WHERE AccountId IN :accountIds]) {\n    if (!contactsByAcct.containsKey(c.AccountId)) {\n        contactsByAcct.put(c.AccountId, new List<Contact>());\n    }\n    contactsByAcct.get(c.AccountId).add(c);\n}\nfor (Account acc : accounts) {\n    List<Contact> contacts = contactsByAcct.get(acc.Id);\n    processContacts(contacts);\n}"
  },
  
  "relatedMemory": {
    "similarIssues": 3,
    "lastOccurrence": "2026-01-15",
    "previousSolution": "Applied same bulkification pattern"
  }
}
```

---

## 13. MCP Tools Interface (Updated)

### 13.1 Debug Session Tools

```typescript
// Setup debug logging (with auth fallback)
interface SetupDebugSession {
  tool: 'sf_debug_setup';
  params: {
    org: string;
    level?: 'MINIMAL' | 'STANDARD' | 'DETAILED' | 'FINEST';
    duration?: number;  // minutes
    trackedEntity?: string;  // userId, classId, or triggerId
    authMethod?: 'auto' | 'pkce' | 'device_code' | 'sfdx';  // NEW
  };
  returns: {
    traceFlagId: string;
    expiresAt: string;
    debugLevelId: string;
    authMethod: string;  // Which auth method was used
  };
}

// List available logs
interface ListLogs {
  tool: 'sf_debug_list_logs';
  params: {
    org: string;
    count?: number;
    afterTimestamp?: string;
    userId?: string;
    includeAsyncJobs?: boolean;  // NEW: Also list async job logs
  };
  returns: {
    logs: LogMetadata[];
    asyncJobLogs?: LogMetadata[];  // NEW
  };
}

// Fetch and parse log
interface GetLog {
  tool: 'sf_debug_get_log';
  params: {
    org: string;
    logId: string;
    outputFormat?: 'summary' | 'full' | 'issues' | 'jsonl';  // NEW: jsonl option
  };
  returns: ParsedLog | LogSummary | CategorizedIssues | string;
}
```

### 13.2 Async Correlation Tools (NEW)

```typescript
// Get async jobs from a log
interface GetAsyncJobs {
  tool: 'sf_debug_async_jobs';
  params: {
    logPath: string;
  };
  returns: {
    jobs: AsyncJobReference[];
    recommendation: string;
  };
}

// Correlate and fetch child job logs
interface CorrelateAsyncLogs {
  tool: 'sf_debug_correlate';
  params: {
    org: string;
    parentLogPath: string;
    waitForPending?: boolean;
    maxChildLogs?: number;
  };
  returns: {
    correlation: CorrelatedLogSet;
    summary: {
      parentStatus: 'SUCCESS' | 'FAILED';
      childrenStatus: 'ALL_SUCCESS' | 'SOME_FAILED' | 'ALL_FAILED' | 'PENDING';
      realError: string | null;
      recommendation: string;
    };
  };
}
```

### 13.3 Analysis Tools

```typescript
// Get AI-optimized summary (truncation-aware)
interface GetSummary {
  tool: 'sf_debug_summary';
  params: {
    logPath: string;
    maxTokens?: number;
  };
  returns: LogSummary & {
    truncationWarning?: string;
    asyncWarning?: string;
    vendorWarning?: string;
  };
}

// Query parsed events
interface QueryEvents {
  tool: 'sf_debug_query';
  params: {
    logPath: string;
    filter: {
      type?: EventType[];
      minDuration?: number;
      hasException?: boolean;
      namespace?: string;
      pattern?: string;
      excludeManaged?: boolean;  // NEW: Skip managed package events
    };
    limit?: number;
  };
  returns: {
    events: EventNode[];
    count: number;
    truncatedResults?: boolean;  // NEW
  };
}

// Get categorized issues (with attribution)
interface GetIssues {
  tool: 'sf_debug_issues';
  params: {
    logPath: string;
    category?: IssueCategory;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    excludeVendor?: boolean;  // NEW: Only show fixable issues
  };
  returns: CategorizedIssues & {
    fixableCount: number;
    vendorCount: number;
    needsAsyncCheck: boolean;
  };
}

// Get problem context for AI debugging (with attribution)
interface GetProblemContext {
  tool: 'sf_debug_problem_context';
  params: {
    logPath: string;
    issueIndex?: number;
    includeCode?: boolean;
    includeSuggestedFix?: boolean;
  };
  returns: ProblemContext & {
    attribution: IssueAttribution;
  };
}
```

### 13.4 Memory Tools

```typescript
// Search past solutions
interface RecallSolution {
  tool: 'sf_memory_recall';
  params: {
    errorType: string;
    errorMessage?: string;
    affectedFiles?: string[];
  };
  returns: {
    matches: PastSolution[];
    confidence: number;
  };
}

// Store successful solution
interface StoreSolution {
  tool: 'sf_memory_store';
  params: {
    sessionId: string;
    problem: ProblemDescription;
    solution: SolutionDescription;
    outcome: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  };
  returns: { stored: boolean };
}
```

---

## 14. File Structure (Updated)

```
sf-debug-ai/
├── src/
│   ├── parser/
│   │   ├── tokenizer.ts          # Log line tokenization
│   │   ├── ast-builder.ts        # Build event tree
│   │   ├── event-handlers.ts     # Handle each event type
│   │   ├── drain-parser.ts       # Template-based parsing (from LogAI)
│   │   ├── streaming-parser.ts   # NEW: JSONL streaming output
│   │   ├── truncation-handler.ts # NEW: Handle truncated logs gracefully
│   │   └── index.ts
│   │
│   ├── analyzer/
│   │   ├── categorizer.ts        # Sort issues by category
│   │   ├── detectors/
│   │   │   ├── soql-in-loop.ts
│   │   │   ├── recursive-trigger.ts
│   │   │   ├── non-selective.ts
│   │   │   ├── cpu-hotspot.ts
│   │   │   ├── n-plus-one.ts
│   │   │   └── index.ts
│   │   ├── summarizer.ts         # Generate AI summaries
│   │   ├── attribution.ts        # NEW: Your code vs vendor code
│   │   ├── level-detector.ts     # v2.1: Detect and adapt to log levels
│   │   └── index.ts
│   │
│   ├── async/                     # NEW: Async job correlation
│   │   ├── job-extractor.ts      # Extract async refs from log
│   │   ├── job-tracker.ts        # Query AsyncApexJob
│   │   ├── log-correlator.ts     # Fetch and correlate child logs
│   │   ├── confidence-scorer.ts  # v2.1: Probabilistic correlation scoring
│   │   ├── unified-view.ts       # Build combined error view
│   │   └── index.ts
│   │
│   ├── managed/                   # NEW: Managed package handling
│   │   ├── namespace-detector.ts # Detect managed namespaces
│   │   ├── visibility-classifier.ts # What can/cannot we see
│   │   ├── attribution-engine.ts # Attribute issues to your/vendor code
│   │   ├── ai-guidance.ts        # Generate "cannot fix" explanations
│   │   └── index.ts
│   │
│   ├── privacy/                   # v2.1: Privacy and redaction
│   │   ├── redactor.ts           # PII detection and masking
│   │   ├── patterns.ts           # Redaction regex patterns
│   │   ├── config.ts             # User redaction preferences
│   │   ├── classifier.ts         # Data sensitivity classification
│   │   └── index.ts
│   │
│   ├── anomaly/
│   │   ├── drain-parser.ts       # v2.1: Template extraction (v1 ready)
│   │   ├── clustering.ts         # Log pattern clustering (v1 ready)
│   │   ├── vectorizer.ts         # Log vectorization (v3+ deferred)
│   │   ├── isolation-forest.ts   # Unsupervised detection (v3+ deferred)
│   │   ├── one-class-svm.ts      # Outlier detection (v3+ deferred)
│   │   ├── time-series.ts        # ETS/DBL for counters (v2 heuristics)
│   │   └── index.ts
│   │
│   ├── capture/
│   │   ├── oauth-pkce.ts         # PKCE auth (primary)
│   │   ├── device-code.ts        # NEW: Device code flow (fallback)
│   │   ├── sfdx-import.ts        # NEW: Import from SFDX
│   │   ├── auth-manager.ts       # v2.1: Auto-select with failure chain tracking
│   │   ├── trace-flag-manager.ts # Auto trace flag management
│   │   ├── debug-level-presets.ts# Issue-specific debug levels
│   │   ├── log-watcher.ts        # Watch for new logs
│   │   ├── connection-pool.ts    # Multi-org support
│   │   └── index.ts
│   │
│   ├── memory/
│   │   ├── factual.ts            # Static knowledge
│   │   ├── semantic.ts           # Pattern learning
│   │   ├── episodic.ts           # Session history
│   │   ├── short-term.ts         # Current session
│   │   ├── sqlite-cache.ts       # Local log cache (encrypted)
│   │   ├── encryption.ts         # v2.1: AES-256-GCM for persistent storage
│   │   └── index.ts
│   │
│   ├── output/
│   │   ├── ai-summary.ts         # Token-efficient output
│   │   ├── json-formatter.ts     # Full JSON output
│   │   ├── jsonl-formatter.ts    # NEW: Streaming JSONL output
│   │   ├── query-engine.ts       # Event filtering
│   │   ├── confidence-emitter.ts # v2.1: Add confidence to all outputs
│   │   └── index.ts
│   │
│   ├── mcp/
│   │   ├── server.ts             # MCP server entry
│   │   ├── tools/
│   │   │   ├── debug-session.ts
│   │   │   ├── analysis.ts
│   │   │   ├── memory.ts
│   │   │   ├── capture.ts
│   │   │   ├── anomaly.ts
│   │   │   ├── async-correlation.ts  # NEW
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── cli/
│   │   ├── commands.ts           # CLI commands
│   │   └── index.ts
│   │
│   └── types/
│       ├── events.ts
│       ├── issues.ts
│       ├── memory.ts
│       ├── capture.ts
│       ├── anomaly.ts
│       ├── async.ts              # NEW
│       ├── managed.ts            # NEW
│       ├── truncation.ts         # NEW
│       └── index.ts
│
├── memory/
│   ├── factual.json
│   ├── semantic.json
│   ├── cache.sqlite
│   └── episodic/
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 15. Usage Examples (Updated)

### CLI Usage

```bash
# Parse and get AI summary
sf-debug analyze mylog.log --format summary

# Parse with JSONL streaming output (truncation-safe)
sf-debug analyze mylog.log --format jsonl > parsed.jsonl

# Query specific events (excluding managed packages)
sf-debug query mylog.log --type SOQL --exclude-managed

# Get categorized issues (only fixable ones)
sf-debug issues mylog.log --exclude-vendor

# Check for async jobs in a log
sf-debug async-jobs mylog.log

# Correlate async job logs
sf-debug correlate mylog.log --org myorg --wait

# Start debug session (with auth fallback)
sf-debug session start --org myorg --level DETAILED --auth auto

# Fetch latest log and analyze
sf-debug session analyze --org myorg
```

### MCP Tool Usage (AI Assistant) - Updated Flow

```
User: "I'm getting an error when I click the Process button"

AI calls: sf_debug_setup({ org: "myorg", level: "DETAILED", authMethod: "auto" })
AI says: "Debug logging enabled. Click the button again."

User: "Done, but the button shows success and the error happens later"

AI calls: sf_debug_list_logs({ org: "myorg", count: 1, includeAsyncJobs: true })
AI calls: sf_debug_get_log({ logId: "07L...parent", outputFormat: "summary" })
AI notices: summary.hasAsyncJobs === true

AI calls: sf_debug_correlate({ org: "myorg", parentLogPath: "...", waitForPending: true })
AI discovers: Child Queueable job failed with NullPointerException

AI calls: sf_debug_problem_context({ logPath: "...child", includeCode: true })
AI checks: attribution.source === "YOUR_CODE" (not vendor)

AI says: "Found it! The button succeeded but the background job failed.
         NullPointerException at ContactProcessor.cls:45.
         Here's the fix: [provides null check code]"
```

### Handling Vendor Code Issues

```
User: "CPQ is throwing a null pointer error"

AI calls: sf_debug_get_log({ logId: "07L...", outputFormat: "issues" })
AI checks: issue.attribution === "VENDOR_CODE", issue.namespace === "SBQQ"

AI says: "The NullPointerException is happening INSIDE Salesforce CPQ (SBQQ package).
         I cannot see or fix vendor code. However:
         
         Your code calls CPQ at QuoteService.cls:45:
         ```
         SBQQ.QuoteAPI.calculateQuote(quoteId);
         ```
         
         Possible causes:
         1. Quote record missing required fields
         2. CPQ package configuration issue
         3. Bug in CPQ (contact Salesforce)
         
         What you can check:
         - Verify the quote has Account, Opportunity, and PriceBook populated
         - Check CPQ settings in Setup → Installed Packages → Configure"
```

---

## 16. Performance Targets

| Metric | Target |
|--------|--------|
| Parse 10MB log | < 3 seconds |
| Parse 20MB log (truncated) | < 5 seconds |
| Generate summary | < 100ms |
| Query events | < 50ms |
| Memory lookup | < 10ms |
| Summary token count | < 500 tokens |
| Full issue context | < 2000 tokens |
| Async job correlation | < 10 seconds |
| **NEW:** JSONL streaming start | < 100ms (first event) |
| **NEW:** Truncation detection | < 10ms |

---

## 17. Known Limitations & Failure Modes

> **Philosophy**: Explicit about what we CAN'T do. The AI consumer needs to know uncertainty to communicate it to users.

### 15.1 Hard Limitations (Cannot Be Solved)

| Limitation | Why It's Hard | What We Do Instead |
|------------|---------------|--------------------|
| **Managed package internals** | Salesforce enforces obfuscation | Boundary analysis + vendor guidance |
| **Variable values at FINE level** | Only available at FINEST | Detect level, warn about limitations |
| **Async logs not captured** | Trace flags don't follow context | Explicit "log may not exist" status |
| **Logic bugs without HEAP_DUMP** | No variable state to inspect | Future: Apex Replay Debugger integration |

### 15.2 Soft Limitations (Mitigatable)

| Limitation | Impact | Mitigation | Confidence When Mitigated |
|------------|--------|------------|---------------------------|
| **20MB log truncation** | May lose final exception | JSONL streaming, LIMIT_USAGE detection, debug level recommendations | 80% (if LIMIT_USAGE present) |
| **Async job log correlation** | Wrong log matched | Confidence scoring, multiple match signals, Job ID when available | 50-90% (depends on signals) |
| **Class name extraction** | Dynamic enqueue patterns fail | Mark as UNKNOWN_QUEUEABLE, use AsyncApexJob table lookup | 70% |
| **Platform Event correlation** | No direct log link | Timestamp + subscriber class heuristic | 40% (best-effort) |
| **Remote environment auth** | PKCE fails | Device Code → SFDX Import → Manual Token fallback chain | 95% (one usually works) |

### 15.3 Failure Transparency in Output

```json
{
  "status": "PARTIAL_ANALYSIS",
  "limitations": [
    {
      "type": "LOG_LEVEL_INSUFFICIENT",
      "detected": "Apex_Code=DEBUG",
      "required": "Apex_Code=FINE",
      "impact": "Cannot detect method entry/exit for CPU hotspot analysis",
      "recommendation": "Re-run with --level DETAILED for full analysis"
    },
    {
      "type": "ASYNC_LOG_NOT_FOUND",
      "jobClass": "ContactProcessorQueueable",
      "searchedLogs": 15,
      "possibleReasons": [
        "Trace flag not on Automated Process user",
        "Log expired (>24h)",
        "Job still pending execution"
      ],
      "fallback": "Using AsyncApexJob.ExtendedStatus for error info"
    }
  ],
  "analysisConfidence": 0.65,
  "confidenceFactors": [
    { "factor": "truncation", "impact": -0.15 },
    { "factor": "async_correlation_ambiguous", "impact": -0.10 },
    { "factor": "managed_package_boundary", "impact": -0.10 }
  ]
}
```

---

## 18. Future Enhancements

1. **VS Code Extension** - Integrate MCP tools into VS Code
2. **Pattern Learning** - ML-based pattern recognition from episodic memory
3. **Multi-Log Correlation** - Compare logs across sessions
4. **Flow-Specific Analysis** - Deep Flow debugging support
5. **LWC/Aura Analysis** - Frontend log correlation
6. **Automated Fix Generation** - AI-generated code patches
7. **LogBERT Integration** - Transformer-based deep log understanding
8. **Real-time Streaming** - WebSocket-based live log analysis
9. **HEAP_DUMP parsing** - Variable inspection for logic bugs (NEW)
10. **Apex Replay Debugger integration** - Step-through context (NEW)

---

## 19. Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-01-30 | Initial architecture |
| v2.0 | 2026-01-31 | Added: Async Job Correlation, Truncation Handling, Managed Package Detection, Auth Fallbacks |
| **v2.1** | **2026-01-31** | Added: Identity Clarification, Confidence-Based Correlation, Privacy/Redaction, Log-Level-Aware Parsing, Platform Limitations & Failure Modes, Auth Failure Decision Table |

---

*This architecture prioritizes AI consumption over human readability, ensuring that AI coding assistants can efficiently debug Salesforce issues without running out of context. v2.1 addresses critical design concerns: confidence-based correlation (not binary), explicit failure modes, privacy/redaction requirements, log-level-aware parsing, and clear identity as an AI-first tool where prose generation is the AI agent's responsibility—not ours.*
