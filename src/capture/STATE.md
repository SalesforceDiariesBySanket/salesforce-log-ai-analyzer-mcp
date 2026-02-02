# Module: Capture

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-02-01 | Updated By: @copilot

---

## Purpose

Salesforce authentication (OAuth, SFDX, manual token) and log capture (trace flags, log watching).

---

## Status: COMPLETE

**Progress**: 12/12 tasks complete

---

## Dependencies

### This Module Depends On
- `src/types/capture.ts` - Auth/capture types ✅
- `src/types/common.ts` - Result type, AppError ✅

### Modules That Depend On This
- `src/async/` - Fetch child logs
- `src/cli/` - Setup command
- `src/mcp/` - Debug session tools

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | ~145 | Module exports |
| `environment.ts` | [x] | ~140 | Shared environment detection |
| `oauth-pkce.ts` | [x] | ~520 | OAuth 2.0 PKCE flow |
| `device-code.ts` | [x] | ~350 | Device code flow (headless) |
| `sfdx-import.ts` | [x] | ~380 | Import SFDX auth |
| `manual-token.ts` | [x] | ~280 | Manual token paste |
| `auth-manager.ts` | [x] | ~450 | Auto-select best auth |
| `debug-level-presets.ts` | [x] | ~450 | Issue → Debug config |
| `trace-flag-manager.ts` | [x] | ~400 | Create/manage trace flags |
| `log-watcher.ts` | [x] | ~350 | Watch for new logs |
| `log-fetcher.ts` | [x] | ~380 | Fetch log content |
| `connection-pool.ts` | [x] | ~400 | Multi-org support |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Key Interfaces

```typescript
interface SalesforceConnection {
  id: string;
  alias: string;
  orgId: string;
  userId: string;
  username: string;
  instanceUrl: string;
  apiVersion: string;
  orgType: OrgType;
  authMethod: AuthMethod;
  authState: AuthState;
  tokens: OAuthTokens;
  createdAt: Date;
  lastUsedAt?: Date;
  metadata?: OrgMetadata;
}

interface TraceFlag {
  id?: string;
  tracedEntityType: TraceFlagTargetType;
  tracedEntityId: string;
  debugLevelId: string;
  startDate: Date;
  expirationDate: Date;
  logType: 'DEVELOPER_LOG' | 'USER_DEBUG';
}

interface FetchedLog {
  record: ApexLogRecord;
  content: string;
  fetchedAt: Date;
  truncated: boolean;
}
```

---

## Authentication Methods

1. **OAuth PKCE** - Browser-based flow for desktop environments
2. **Device Code** - Headless flow for SSH/CI environments
3. **SFDX Import** - Use existing SFDX CLI authentication
4. **Manual Token** - Paste session ID directly

## Debug Level Presets

- `minimal` - Low overhead for production
- `soql_analysis` - SOQL/query optimization
- `governor_limits` - Limit consumption tracking
- `triggers` - Trigger recursion detection
- `cpu_hotspots` - Performance analysis
- `exceptions` - Full stack traces
- `callouts` - HTTP debugging
- `ai_optimized` - Balanced for AI analysis

---

## Testing

```bash
# Manual testing required (needs Salesforce org)
```

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Define auth types | [x] | src/types/capture.ts |
| 2 | OAuth PKCE flow | [x] | oauth-pkce.ts |
| 3 | Device code flow | [x] | device-code.ts |
| 4 | SFDX import | [x] | sfdx-import.ts |
| 5 | Manual token handler | [x] | manual-token.ts |
| 6 | Auth manager | [x] | auth-manager.ts |
| 7 | Debug level presets | [x] | debug-level-presets.ts |
| 8 | Trace flag manager | [x] | trace-flag-manager.ts |
| 9 | Log watcher | [x] | log-watcher.ts |
| 10 | Log fetcher | [x] | log-fetcher.ts |
| 11 | Connection pool | [x] | connection-pool.ts |
