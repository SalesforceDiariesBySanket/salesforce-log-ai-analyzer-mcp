/**
 * @module cli/commands/query
 * @description Query command - filter and search events/issues in a log
 * @status COMPLETE
 * @see src/cli/STATE.md
 * @dependencies commander, src/parser, src/output/query-engine
 * @lastModified 2026-01-31
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseLog } from '../../parser';
import type { EventNode } from '../../types';
import { redactText, getPreset, configToOptions } from '../../privacy';

// ============================================================================
// Types
// ============================================================================

interface QueryOptions {
  type?: string;
  severity?: string;
  namespace?: string;
  limit?: string;
  offset?: string;
  format: 'json' | 'text';
  redact: boolean;
}

// ============================================================================
// Command Definition
// ============================================================================

export const queryCommand = new Command('query')
  .description('Query events or issues in a debug log')
  .argument('<file>', 'Path to the debug log file')
  .option('-t, --type <type>', 'Filter by event type (e.g., SOQL, DML, METHOD)')
  .option('-s, --severity <level>', 'Filter issues by severity (high, medium, low)')
  .option('-n, --namespace <ns>', 'Filter by namespace')
  .option('-l, --limit <n>', 'Limit number of results', '20')
  .option('--offset <n>', 'Skip first N results', '0')
  .option('-f, --format <format>', 'Output format: json or text', 'json')
  .option('-r, --redact', 'Redact PII from output', false)
  .action(async (file: string, options: QueryOptions) => {
    await runQuery(file, options);
  });

// ============================================================================
// Implementation
// ============================================================================

async function runQuery(file: string, options: QueryOptions): Promise<void> {
  // Resolve file path
  const filePath = path.resolve(file);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Read file
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading file: ${(err as Error).message}`);
    process.exit(1);
  }

  // Parse log
  const parseResult = parseLog(content);
  if (!parseResult.success) {
    console.error(`Parse error: ${parseResult.error.message}`);
    process.exit(1);
  }

  const parsedLog = parseResult.data;
  const events = parsedLog.events;

  // Apply filters
  let filtered = filterEvents(events, options);

  // Apply pagination
  const limit = parseInt(options.limit ?? '20', 10);
  const offset = parseInt(options.offset ?? '0', 10);
  const total = filtered.length;
  filtered = filtered.slice(offset, offset + limit);

  // Format output
  let output: string;
  if (options.format === 'text') {
    output = formatTextResults(filtered, total, offset, limit, options);
  } else {
    output = JSON.stringify({
      query: {
        type: options.type,
        severity: options.severity,
        namespace: options.namespace,
        limit,
        offset,
      },
      pagination: {
        total,
        returned: filtered.length,
        offset,
        hasMore: offset + filtered.length < total,
      },
      results: filtered.map(simplifyEvent),
    }, null, 2);
  }

  // Apply redaction if requested
  if (options.redact) {
    const config = getPreset('MODERATE');
    const redactOptions = configToOptions(config);
    output = redactText(output, redactOptions).redacted;
  }

  console.log(output);
}

// ============================================================================
// Filtering
// ============================================================================

function filterEvents(events: EventNode[], options: QueryOptions): EventNode[] {
  let filtered = [...events];

  // Filter by type
  if (options.type) {
    const typeUpper = options.type.toUpperCase();
    filtered = filtered.filter((e) => 
      e.type.toUpperCase().includes(typeUpper)
    );
  }

  // Filter by namespace
  if (options.namespace) {
    const nsLower = options.namespace.toLowerCase();
    filtered = filtered.filter((e) => {
      const eventNs = (e as unknown as { namespace?: string }).namespace;
      return eventNs?.toLowerCase().includes(nsLower);
    });
  }

  return filtered;
}

function simplifyEvent(event: EventNode): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
  };

  // Add type-specific fields
  if (event.type.includes('SOQL')) {
    base.query = (event as unknown as { query?: string }).query;
  }
  
  if (event.type.includes('METHOD') || event.type.includes('CONSTRUCTOR')) {
    base.method = (event as unknown as { methodName?: string }).methodName;
    base.class = (event as unknown as { className?: string }).className;
  }
  
  if (event.type.includes('DML')) {
    base.operation = (event as unknown as { operation?: string }).operation;
    base.object = (event as unknown as { sobjectType?: string }).sobjectType;
  }

  // Logic debugging events
  if (event.type === 'USER_DEBUG' || event.type === 'SYSTEM_DEBUG') {
    const debugEvent = event as unknown as { message: string; level?: string; sourceLine?: number };
    base.message = debugEvent.message;
    base.level = debugEvent.level;
    base.sourceLine = debugEvent.sourceLine;
  }

  if (event.type === 'VARIABLE_ASSIGNMENT') {
    const varEvent = event as unknown as { 
      variableName: string; 
      value: unknown; 
      valueType: string;
      sourceLine?: number;
      isExternal: boolean;
    };
    base.variable = varEvent.variableName;
    base.value = varEvent.value;
    base.valueType = varEvent.valueType;
    base.sourceLine = varEvent.sourceLine;
    base.isExternal = varEvent.isExternal;
  }

  if (event.type === 'STATEMENT_EXECUTE') {
    const stmtEvent = event as unknown as { sourceLine?: number };
    base.sourceLine = stmtEvent.sourceLine;
  }

  if (event.type === 'EXCEPTION_THROWN' || event.type === 'FATAL_ERROR') {
    const excEvent = event as unknown as { exceptionType: string; message: string };
    base.exceptionType = excEvent.exceptionType;
    base.message = excEvent.message;
  }

  base.children = event.children?.length ?? 0;
  
  return base;
}

// ============================================================================
// Formatters
// ============================================================================

function formatTextResults(
  events: EventNode[],
  total: number,
  offset: number,
  _limit: number,
  options: QueryOptions
): string {
  const lines: string[] = [
    '=== Query Results ===',
    '',
    `Filters: ${formatFilters(options)}`,
    `Showing ${offset + 1}-${offset + events.length} of ${total} events`,
    '',
    '─'.repeat(60),
  ];

  if (events.length === 0) {
    lines.push('No events match the query.');
  } else {
    events.forEach((event, i) => {
      lines.push(`${offset + i + 1}. [${event.type}] @ ${event.timestamp}ns`);
      
      // Add type-specific info
      if (event.type.includes('SOQL')) {
        const query = (event as unknown as { query?: string }).query;
        if (query) {
          lines.push(`   Query: ${truncate(query, 60)}`);
        }
      } else if (event.type.includes('METHOD')) {
        const method = (event as unknown as { methodName?: string }).methodName;
        const cls = (event as unknown as { className?: string }).className;
        if (method) {
          lines.push(`   Method: ${cls ? cls + '.' : ''}${method}`);
        }
      } else if (event.type === 'USER_DEBUG' || event.type === 'SYSTEM_DEBUG') {
        const msg = (event as unknown as { message?: string }).message;
        const level = (event as unknown as { level?: string }).level;
        const line = (event as unknown as { sourceLine?: number }).sourceLine;
        if (msg) {
          lines.push(`   [${level || 'DEBUG'}] Line ${line || '?'}: ${truncate(msg, 50)}`);
        }
      } else if (event.type === 'VARIABLE_ASSIGNMENT') {
        const varName = (event as unknown as { variableName?: string }).variableName;
        const value = (event as unknown as { value?: unknown }).value;
        const line = (event as unknown as { sourceLine?: number }).sourceLine;
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        lines.push(`   Line ${line || '?'}: ${varName} = ${truncate(valueStr, 40)}`);
      } else if (event.type === 'STATEMENT_EXECUTE') {
        const line = (event as unknown as { sourceLine?: number }).sourceLine;
        lines.push(`   Executed line: ${line || '?'}`);
      }
      
      if (event.children && event.children.length > 0) {
        lines.push(`   Children: ${event.children.length}`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

function formatFilters(options: QueryOptions): string {
  const filters: string[] = [];
  if (options.type) filters.push(`type=${options.type}`);
  if (options.severity) filters.push(`severity=${options.severity}`);
  if (options.namespace) filters.push(`namespace=${options.namespace}`);
  return filters.length > 0 ? filters.join(', ') : 'none';
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}
