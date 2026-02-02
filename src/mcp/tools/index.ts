/**
 * @module mcp/tools
 * @description MCP tool types and utilities
 * @status COMPLETE
 * @see src/mcp/STATE.md
 * @dependencies MCP SDK
 * @lastModified 2026-02-01
 *
 * Note: Tool registrations are now handled directly in src/mcp/server.ts
 * using the McpServer.tool() API for cleaner type safety.
 */

/**
 * Tool categories for documentation
 */
export const TOOL_CATEGORIES = {
  DEBUG_SESSION: ['sf_debug_parse_content', 'sf_debug_parse_file'],
  SALESFORCE_INTEGRATION: ['sf_debug_setup', 'sf_debug_list_logs', 'sf_debug_get_log'],
  ANALYSIS: ['sf_debug_summary', 'sf_debug_issues', 'sf_debug_query', 'sf_debug_problem_context'],
  ASYNC_CORRELATION: ['sf_debug_async_jobs', 'sf_debug_correlate'],
  MEMORY: ['sf_debug_store_solution', 'sf_debug_end_session', 'sf_debug_memory_stats', 'sf_memory_recall'],
} as const;

/**
 * All available tool names
 */
export const ALL_TOOL_NAMES = [
  ...TOOL_CATEGORIES.DEBUG_SESSION,
  ...TOOL_CATEGORIES.SALESFORCE_INTEGRATION,
  ...TOOL_CATEGORIES.ANALYSIS,
  ...TOOL_CATEGORIES.ASYNC_CORRELATION,
  ...TOOL_CATEGORIES.MEMORY,
] as const;

export type ToolName = typeof ALL_TOOL_NAMES[number];

/**
 * Known Caveats & Limitations for AI Assistants
 * 
 * IMPORTANT: AI assistants should be aware of these when using MCP tools:
 * 
 * 1. LARGE LOG FILES (>1MB):
 *    - Use `sf_debug_parse_file` instead of `sf_debug_parse_content`
 *    - AI assistants cannot read 20MB+ files with 45k lines into memory
 *    - Pass the file path directly; the MCP server reads the file
 * 
 * 2. CONTENT SIZE LIMITS:
 *    - Maximum content size: 50MB (both tools)
 *    - Logs exceeding this must be split or truncated
 * 
 * 3. CACHE LIMITS:
 *    - Maximum 10 logs cached by default (configurable)
 *    - Oldest logs evicted when cache is full (LRU)
 *    - Use logId to reference cached logs in subsequent calls
 * 
 * 4. OUTPUT TRUNCATION:
 *    - sf_debug_issues: Default limit 20 issues (use `limit` param)
 *    - sf_debug_query: Default limit 50 events (use `limit` param)
 *    - Event messages truncated to 200 characters in query results
 * 
 * 5. MEMORY PERSISTENCE:
 *    - Solutions stored in SQLite (persists across sessions)
 *    - Session must be started (happens on first parse)
 *    - Call sf_debug_end_session to record outcomes
 */
export const CAVEATS = {
  MAX_CONTENT_SIZE_MB: 50,
  MAX_CACHED_LOGS: 10,
  DEFAULT_ISSUE_LIMIT: 20,
  DEFAULT_EVENT_LIMIT: 50,
  EVENT_MESSAGE_TRUNCATION: 200,
  RECOMMENDED_FILE_TOOL_THRESHOLD_MB: 1,
} as const;
