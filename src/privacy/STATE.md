# Module: Privacy

> **AI Agents**: Read this before working on this module.
> Last Updated: 2026-01-31 | Updated By: @copilot (Phase 7 Complete)

---

## Purpose

Auto-redact PII (emails, phones, IDs) from logs for safe AI consumption.

---

## Status: ✅ COMPLETE

**Progress**: 4/4 tasks complete  
**⚠️ Warning**: Unit tests not yet written!

---

## Dependencies

### This Module Depends On
- `src/types/events.ts` - Event types

### Modules That Depend On This
- `src/output/` - Apply redaction before output
- `src/mcp/` - Redact MCP responses
- `src/cli/` - CLI redaction flag

---

## Files

| File | Status | Lines | Description |
|------|--------|-------|-------------|
| `index.ts` | [x] | ~80 | Module exports |
| `patterns.ts` | [x] | ~180 | PII detection patterns |
| `classifier.ts` | [x] | ~190 | Sensitivity classification |
| `redactor.ts` | [x] | ~200 | Apply redaction |
| `config.ts` | [x] | ~170 | User redaction preferences |

**Status Legend**: [ ] Not started | [~] In progress | [x] Complete | [!] Blocked

---

## Key Interfaces

```typescript
// Sensitivity levels
type SensitivityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

// PII Categories
type PIICategory = 'EMAIL' | 'PHONE' | 'SSN' | 'CREDIT_CARD' | 'IP_ADDRESS' | ...;

// Pattern definition
interface PIIPattern {
  id: string;
  name: string;
  category: PIICategory;
  sensitivity: SensitivityLevel;
  pattern: RegExp;
  placeholder: string;
}

// Redaction result
interface RedactionResult {
  redacted: string;
  redactions: RedactionInfo[];
  count: number;
  wasRedacted: boolean;
}

// Configuration
interface RedactionConfig {
  enabled: boolean;
  minSensitivity: SensitivityLevel;
  alwaysRedact: PIICategory[];
  neverRedact: PIICategory[];
  customPatterns: PIIPattern[];
  usePlaceholders: boolean;
}
```

---

## Key Features

1. **Pattern Library**
   - Email, phone, SSN, credit card detection
   - IP address, Salesforce ID patterns
   - Session tokens, API keys, passwords
   - Custom pattern support

2. **Sensitivity Classification**
   - 5 levels: CRITICAL, HIGH, MEDIUM, LOW, NONE
   - Field name inference (e.g., "password" → CRITICAL)
   - Value content analysis

3. **Smart Redactor**
   - Consistent placeholder tokens ([EMAIL], [PHONE], etc.)
   - Deep object redaction
   - Batch processing support
   - Optional original value hashing

4. **Configuration Presets**
   - STRICT: Redact all sensitive data
   - MODERATE: High-sensitivity only
   - MINIMAL: Credentials only
   - OFF: No redaction

---

## Usage Examples

```typescript
import {
  redactText,
  classifyText,
  getPreset,
  configToOptions,
} from './privacy';

// Simple redaction
const result = redactText('Email: user@example.com');
console.log(result.redacted); // 'Email: [EMAIL]'

// Classification
const classified = classifyText('SSN: 123-45-6789');
console.log(classified.highestSensitivity); // 'CRITICAL'

// Using presets
const config = getPreset('STRICT');
const options = configToOptions(config);
const strictResult = redactText(text, options);
```

---

## Testing

```bash
npm run test:privacy
```

---

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Define PII patterns | [x] | 9 built-in patterns |
| 2 | Implement classifier | [x] | Field + text classification |
| 3 | Implement redactor | [x] | Text + object redaction |
| 4 | Redaction config | [x] | Presets + custom config |
