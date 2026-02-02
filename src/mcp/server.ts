/**
 * @module mcp/server
 * @description MCP (Model Context Protocol) server for AI assistants
 * @status COMPLETE
 * @see src/mcp/STATE.md
 * @dependencies @modelcontextprotocol/sdk, src/parser, src/analyzer
 * @lastModified 2026-01-31
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

import type { SalesforceConnection, ParsedLog } from '../types';
import type { AnalysisResult } from '../analyzer/index.js';
import type { RecallResponse, SessionOutcome } from '../types/memory';
import { MCP_LIMITS } from '../constants.js';
import { MemoryManager, createMemoryManager } from '../memory/index.js';
import { renderTree, renderGitGraph, renderEnhancedTree, generateTreeSummary, type TreeRenderOptions, type GitGraphOptions } from '../output/tree-renderer.js';

// ============================================================================
// Constants (using centralized config)
// ============================================================================

/**
 * Maximum content size to accept
 * Larger logs should be truncated client-side or use streaming
 */
const MAX_CONTENT_SIZE = MCP_LIMITS.MAX_CONTENT_SIZE;

// ============================================================================
// Glob Pattern Utilities
// ============================================================================

/**
 * Check if a path contains glob patterns
 */
function hasGlobPattern(filePath: string): boolean {
  return /[*?[\]{}]/.test(filePath);
}

/**
 * Convert glob pattern to RegExp
 */
function globToRegex(pattern: string): RegExp {
  // Escape special regex chars except glob chars
  let regexStr = pattern
    .replace(/[.+^${}()|\\]/g, '\\$&')  // Escape special regex chars
    .replace(/\*\*/g, '{{GLOBSTAR}}')    // Temp placeholder for **
    .replace(/\*/g, '[^/\\\\]*')         // * matches anything except path separators
    .replace(/\?/g, '[^/\\\\]')          // ? matches single char except path separators
    .replace(/{{GLOBSTAR}}/g, '.*');     // ** matches anything including path separators
  
  return new RegExp(`^${regexStr}$`, 'i'); // Case insensitive for Windows
}

/**
 * Expand glob pattern to list of files
 */
function expandGlob(pattern: string): string[] {
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const lastSepIndex = Math.max(normalizedPattern.lastIndexOf('/'), normalizedPattern.lastIndexOf('\\'));
  
  let directory: string;
  let filePattern: string;
  
  if (lastSepIndex === -1) {
    // Pattern is just a filename/glob, use current directory
    directory = process.cwd();
    filePattern = normalizedPattern;
  } else {
    directory = pattern.substring(0, lastSepIndex);
    filePattern = normalizedPattern.substring(lastSepIndex + 1);
  }

  // If directory doesn't exist, return empty
  if (!fs.existsSync(directory)) {
    return [];
  }

  // Read directory and filter by pattern
  const regex = globToRegex(filePattern);
  const files: string[] = [];
  
  try {
    const entries = fs.readdirSync(directory);
    for (const entry of entries) {
      if (regex.test(entry)) {
        const fullPath = path.join(directory, entry);
        // Only include files, not directories
        if (fs.statSync(fullPath).isFile()) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Directory read failed, return empty
    return [];
  }

  // Sort for consistent ordering
  return files.sort();
}

// NOTE: MAX_CACHE_SIZE_BYTES removed - using count-based eviction for simplicity.
// For true size-based LRU, would need to estimate ParsedLog sizes which adds overhead.

// ============================================================================
// Server State
// ============================================================================

/**
 * Server state shared across tools
 */
export interface ServerState {
  /** Current Salesforce connection */
  connection: SalesforceConnection | null;

  /** Cached parsed logs */
  logCache: Map<string, ParsedLog>;

  /** Maps logId to file path (for auto-reload from disk) */
  filePathCache: Map<string, string>;

  /** Cached analysis results (keyed by logId) */
  analysisCache: Map<string, AnalysisResult>;

  /** Current working log ID */
  currentLogId: string | null;

  /** Server configuration */
  config: ServerConfig;

  /** Memory manager for persistent learning */
  memory: MemoryManager;

  /** Current session ID for memory tracking */
  sessionId: string | null;

  /** Last recall response for current issues */
  lastRecall: RecallResponse | null;
}

/**
 * Server configuration options
 */
export interface ServerConfig {
  /** Maximum logs to cache */
  maxCachedLogs: number;

  /** Enable verbose logging */
  verbose: boolean;

  /** Default redaction level */
  redactionLevel: 'none' | 'minimal' | 'moderate' | 'strict';
}

/**
 * Default server configuration
 */
const DEFAULT_CONFIG: ServerConfig = {
  maxCachedLogs: 10,
  verbose: false,
  redactionLevel: 'moderate',
};

// ============================================================================
// MCP Server Class
// ============================================================================

/**
 * Salesforce Debug Log MCP Server
 *
 * Exposes tools for AI assistants to:
 * - Set up debug logging
 * - List and fetch logs
 * - Analyze logs for issues
 * - Query events
 * - Correlate async jobs
 */
export class SFDebugMCPServer {
  private mcpServer: McpServer;
  private state: ServerState;

  constructor(config: Partial<ServerConfig> = {}) {
    this.state = {
      connection: null,
      logCache: new Map(),
      filePathCache: new Map(),
      analysisCache: new Map(),
      currentLogId: null,
      config: { ...DEFAULT_CONFIG, ...config },
      memory: createMemoryManager(),
      sessionId: null,
      lastRecall: null,
    };

    this.mcpServer = new McpServer(
      {
        name: 'sf-debug-analyzer',
        version: '0.8.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerTools();
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Initialize memory system
    await this.state.memory.initialize();
    
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    if (this.state.config.verbose) {
      console.error('SF Debug MCP Server started with memory system');
    }
  }

  /**
   * Stop the MCP server and end session
   */
  async stop(outcome: SessionOutcome = 'UNKNOWN'): Promise<void> {
    if (this.state.sessionId) {
      await this.state.memory.endSession(outcome);
      this.state.sessionId = null;
    }
    await this.state.memory.close();
    if (this.state.config.verbose) {
      console.error('SF Debug MCP Server stopped');
    }
  }

  /**
   * Start a memory session (called on first log parse)
   */
  private async ensureSession(): Promise<string> {
    if (!this.state.sessionId) {
      // Use generic IDs - actual org/user would come from connection
      const orgId = this.state.connection?.instanceUrl || 'local-session';
      const userId = 'mcp-user';
      this.state.sessionId = await this.state.memory.startSession(orgId, userId);
    }
    return this.state.sessionId;
  }

  /**
   * Get server state (for tool handlers)
   */
  getState(): ServerState {
    return this.state;
  }

  /**
   * Set the Salesforce connection
   */
  setConnection(connection: SalesforceConnection): void {
    this.state.connection = connection;
  }

  /**
   * Cache a parsed log with proper eviction
   */
  cacheLog(logId: string, parsedLog: ParsedLog): void {
    // Evict oldest if at capacity
    if (this.state.logCache.size >= this.state.config.maxCachedLogs) {
      const oldest = this.state.logCache.keys().next().value;
      if (oldest) {
        this.state.logCache.delete(oldest);
        // Also evict corresponding analysis cache
        this.state.analysisCache.delete(oldest);
      }
    }

    this.state.logCache.set(logId, parsedLog);
    // Invalidate analysis cache for this log (may have changed)
    this.state.analysisCache.delete(logId);
    this.state.currentLogId = logId;
  }

  /**
   * Get cached log
   */
  getCachedLog(logId: string): ParsedLog | undefined {
    return this.state.logCache.get(logId);
  }

  /**
   * Get log from cache or auto-reload from disk if evicted
   * Returns [parsedLog, wasReloaded] or [undefined, false] if not found
   */
  async getLogOrReload(logId: string): Promise<[ParsedLog | undefined, boolean]> {
    // First check cache
    const cached = this.state.logCache.get(logId);
    if (cached) {
      return [cached, false];
    }

    // Check if we have a file path for this log to reload
    const filePath = this.state.filePathCache.get(logId);
    if (!filePath) {
      return [undefined, false];
    }

    // Verify file still exists
    if (!fs.existsSync(filePath)) {
      // File no longer exists, clean up mapping
      this.state.filePathCache.delete(logId);
      return [undefined, false];
    }

    // Reload from disk
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { parseLog } = await import('../parser/index.js');
      const result = parseLog(content);

      if (!result.success) {
        return [undefined, false];
      }

      // Re-cache the log
      this.cacheLog(logId, result.data);
      return [result.data, true];
    } catch {
      return [undefined, false];
    }
  }

  /**
   * Get or compute cached analysis result
   */
  private async getOrComputeAnalysis(logId: string, parsedLog: ParsedLog): Promise<AnalysisResult> {
    const cached = this.state.analysisCache.get(logId);
    if (cached) {
      return cached;
    }

    const { analyzeLog } = await import('../analyzer/index.js');
    const startTime = Date.now();
    const analysis = analyzeLog(parsedLog);
    // Fix: Set the actual analysis time
    analysis.metadata.analysisTimeMs = Date.now() - startTime;

    this.state.analysisCache.set(logId, analysis);
    return analysis;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Register all tools with the MCP server
   */
  private registerTools(): void {
    const state = this.state;
    const server = this; // Reference to use cacheLog method

    // sf_debug_parse_content - Parse raw log content
    this.mcpServer.tool(
      'sf_debug_parse_content',
      'Parse raw debug log content directly. Returns parsed events and summary.',
      {
        content: z.string().describe('Raw debug log content'),
        logId: z.string().optional().describe('Optional ID for caching'),
      },
      async ({ content, logId }) => {
        // Start memory session on first log parse
        await server.ensureSession();
        
        // Input size validation to prevent DoS
        if (content.length > MAX_CONTENT_SIZE) {
          return { 
            content: [{ 
              type: 'text' as const, 
              text: `Error: Content size (${(content.length / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed (${MAX_CONTENT_SIZE / 1024 / 1024}MB). Please truncate the log or use streaming.` 
            }], 
            isError: true 
          };
        }

        const { parseLog } = await import('../parser/index.js');
        const result = parseLog(content);

        if (!result.success) {
          return { content: [{ type: 'text' as const, text: `Parse error: ${result.error.message}` }], isError: true };
        }

        const parsedLog = result.data;
        const cacheId = logId || `inline-${Date.now()}`;
        // Use cacheLog() to enforce cache limits (fixes cache bypass issue)
        server.cacheLog(cacheId, parsedLog);

        const eventTypeCounts: Record<string, number> = {};
        for (const event of parsedLog.events) {
          eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              logId: cacheId,
              stats: {
                totalLines: parsedLog.stats.totalLines,
                totalEvents: parsedLog.events.length,
                parsedLines: parsedLog.stats.parsedLines,
                failedLines: parsedLog.stats.failedLines,
                parseDurationMs: parsedLog.stats.parseDurationMs,
              },
              eventTypes: eventTypeCounts,
              truncation: parsedLog.truncation,
              confidence: parsedLog.confidence,
            }, null, 2)
          }]
        };
      }
    );

    // sf_debug_parse_file - Parse log from file path (for large logs)
    this.mcpServer.tool(
      'sf_debug_parse_file',
      'Parse a debug log file directly from the filesystem. Supports wildcards like *.log to parse multiple files at once. Use this for large logs (>1MB) that cannot be passed as content strings. This is the preferred method for AI assistants working with production-sized logs.',
      {
        filePath: z.string().describe('Absolute path to the debug log file. Supports wildcards: *.log, test_*.log, etc.'),
        logId: z.string().optional().describe('Optional ID for caching (defaults to filename). For wildcards, each file gets its own ID.'),
      },
      async ({ filePath: inputPath, logId }) => {
        // Start memory session on first log parse
        await server.ensureSession();

        // Check for glob patterns
        if (hasGlobPattern(inputPath)) {
          // Expand glob and parse multiple files
          const files = expandGlob(inputPath);
          
          if (files.length === 0) {
            return {
              content: [{ type: 'text' as const, text: `No files matched pattern: ${inputPath}` }],
              isError: true
            };
          }

          const { parseLog } = await import('../parser/index.js');
          const results: Array<{
            filePath: string;
            logId: string;
            success: boolean;
            error?: string;
            eventCount?: number;
            fileSize?: string;
          }> = [];

          let totalEvents = 0;
          let successCount = 0;

          for (const file of files) {
            const fileId = path.basename(file, path.extname(file));
            
            try {
              const stats = fs.statSync(file);
              if (stats.size > MAX_CONTENT_SIZE) {
                results.push({
                  filePath: file,
                  logId: fileId,
                  success: false,
                  error: `File size (${(stats.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum`,
                });
                continue;
              }

              const content = fs.readFileSync(file, 'utf-8');
              const result = parseLog(content);

              if (!result.success) {
                results.push({
                  filePath: file,
                  logId: fileId,
                  success: false,
                  error: result.error.message,
                });
                continue;
              }

              const parsedLog = result.data;
              server.cacheLog(fileId, parsedLog);
              state.filePathCache.set(fileId, file);
              
              totalEvents += parsedLog.events.length;
              successCount++;

              results.push({
                filePath: file,
                logId: fileId,
                success: true,
                eventCount: parsedLog.events.length,
                fileSize: `${(stats.size / 1024).toFixed(1)}KB`,
              });
            } catch (error) {
              results.push({
                filePath: file,
                logId: fileId,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: successCount > 0,
                pattern: inputPath,
                filesMatched: files.length,
                filesSuccessful: successCount,
                filesFailed: files.length - successCount,
                totalEvents,
                results,
                tip: successCount > 0 
                  ? `Use sf_debug_summary or sf_debug_issues with logId to analyze specific logs: ${results.filter(r => r.success).map(r => r.logId).slice(0, 3).join(', ')}...`
                  : undefined,
              }, null, 2)
            }]
          };
        }

        // Single file path (existing logic)
        // Validate file exists
        if (!fs.existsSync(inputPath)) {
          return {
            content: [{ type: 'text' as const, text: `Error: File not found: ${inputPath}` }],
            isError: true
          };
        }

        // Get file stats for size validation
        const stats = fs.statSync(inputPath);
        if (stats.size > MAX_CONTENT_SIZE) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: File size (${(stats.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed (${MAX_CONTENT_SIZE / 1024 / 1024}MB). Consider splitting the log or using the truncation handler.`
            }],
            isError: true
          };
        }

        // Read file content
        let content: string;
        try {
          content = fs.readFileSync(inputPath, 'utf-8');
        } catch (readError) {
          return {
            content: [{ type: 'text' as const, text: `Error reading file: ${readError instanceof Error ? readError.message : 'Unknown error'}` }],
            isError: true
          };
        }

        const { parseLog } = await import('../parser/index.js');
        const result = parseLog(content);

        if (!result.success) {
          return { content: [{ type: 'text' as const, text: `Parse error: ${result.error.message}` }], isError: true };
        }

        const parsedLog = result.data;
        // Use provided logId or derive from filename
        const cacheId = logId || path.basename(inputPath, path.extname(inputPath));
        server.cacheLog(cacheId, parsedLog);
        // Store file path for auto-reload when log evicted from cache
        state.filePathCache.set(cacheId, inputPath);

        const eventTypeCounts: Record<string, number> = {};
        for (const event of parsedLog.events) {
          eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              logId: cacheId,
              filePath: inputPath,
              fileSize: `${(stats.size / 1024).toFixed(1)}KB`,
              stats: {
                totalLines: parsedLog.stats.totalLines,
                totalEvents: parsedLog.events.length,
                parsedLines: parsedLog.stats.parsedLines,
                failedLines: parsedLog.stats.failedLines,
                parseDurationMs: parsedLog.stats.parseDurationMs,
              },
              eventTypes: eventTypeCounts,
              truncation: parsedLog.truncation,
              confidence: parsedLog.confidence,
            }, null, 2)
          }]
        };
      }
    );

    // sf_debug_summary - Get AI-optimized summary
    this.mcpServer.tool(
      'sf_debug_summary',
      'Get an AI-optimized summary of a parsed debug log. Returns a compact summary under 500 tokens.',
      {
        logId: z.string().optional().describe('Log ID (uses current if not provided)'),
      },
      async ({ logId }) => {
        const targetId = logId || state.currentLogId;
        if (!targetId) {
          return { content: [{ type: 'text' as const, text: 'No log loaded. Use sf_debug_get_log or sf_debug_parse_content first.' }], isError: true };
        }

        const [parsedLog, wasReloaded] = await server.getLogOrReload(targetId);
        if (!parsedLog) {
          return { content: [{ type: 'text' as const, text: `Log ${targetId} not found in cache and no file path stored for auto-reload.` }], isError: true };
        }

        const { generateMinimalSummary } = await import('../analyzer/summarizer.js');
        
        // Use cached analysis to avoid re-computation
        const analysis = await server.getOrComputeAnalysis(targetId, parsedLog);
        // generateMinimalSummary returns a string summary optimized for AI
        const textSummary = generateMinimalSummary(analysis);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              logId: targetId,
              reloadedFromDisk: wasReloaded,
              summary: textSummary,
              issueCount: analysis.issues.length,
              bySeverity: analysis.bySeverity,
              byCategory: analysis.byCategory,
            }, null, 2)
          }]
        };
      }
    );

    // sf_debug_tree - Render ASCII execution tree
    this.mcpServer.tool(
      'sf_debug_tree',
      'Render an ASCII tree view of the execution call hierarchy. Shows parent-child relationships with duration and percentage bars. Supports multiple formats including git-graph style visualization for trigger flows.',
      {
        logId: z.string().optional().describe('Log ID (uses current if not provided)'),
        format: z.enum(['tree', 'gitgraph', 'enhanced', 'compact']).optional().describe('Output format: tree (default ASCII), gitgraph (branch visualization), enhanced (visual symbols), compact (summary)'),
        maxDepth: z.number().optional().describe('Maximum tree depth to render (0 = unlimited, default: 0)'),
        showDuration: z.boolean().optional().describe('Show duration in milliseconds (default: true)'),
        showPercentage: z.boolean().optional().describe('Show percentage of total time (default: true)'),
        showProgressBar: z.boolean().optional().describe('Show visual progress bar (default: true)'),
        showRowCounts: z.boolean().optional().describe('Show row counts for SOQL/DML operations (default: true)'),
        includeTypes: z.array(z.string()).optional().describe('Only include these event types (empty = all)'),
        excludeTypes: z.array(z.string()).optional().describe('Exclude these event types'),
        minDurationMs: z.number().optional().describe('Only show events with duration >= this (ms)'),
        maxLines: z.number().optional().describe('Maximum lines to output (default: 500)'),
        compact: z.boolean().optional().describe('DEPRECATED: Use format="compact" instead'),
      },
      async ({ logId, format, maxDepth, showDuration, showPercentage, showProgressBar, showRowCounts, includeTypes, excludeTypes, minDurationMs, maxLines, compact }) => {
        const targetId = logId || state.currentLogId;
        if (!targetId) {
          return { content: [{ type: 'text' as const, text: 'No log loaded. Use sf_debug_get_log or sf_debug_parse_file first.' }], isError: true };
        }

        const [parsedLog, wasReloaded] = await server.getLogOrReload(targetId);
        if (!parsedLog) {
          return { content: [{ type: 'text' as const, text: `Log ${targetId} not found in cache and no file path stored for auto-reload.` }], isError: true };
        }

        // Determine format (support legacy 'compact' boolean)
        const outputFormat = format || (compact ? 'compact' : 'tree');

        // Build tree options
        const treeOptions: TreeRenderOptions = {
          maxDepth: maxDepth ?? 0,
          showDuration: showDuration ?? true,
          showPercentage: showPercentage ?? true,
          showProgressBar: showProgressBar ?? true,
          includeTypes: includeTypes ?? [],
          excludeTypes: excludeTypes ?? [],
          minDurationMs: minDurationMs ?? 0,
          maxLines: maxLines ?? 500,
        };

        // Git-graph options
        const gitGraphOptions: GitGraphOptions = {
          showTiming: showDuration ?? true,
          showRowCounts: showRowCounts ?? true,
          maxLines: maxLines ?? 500,
        };

        let treeOutput: string;
        let formatLabel: string;

        switch (outputFormat) {
          case 'gitgraph':
            // Git-graph style with trigger branches
            treeOutput = renderGitGraph(parsedLog, gitGraphOptions);
            formatLabel = 'gitgraph';
            break;
          case 'enhanced':
            // Enhanced tree with visual symbols for SOQL/DML/triggers
            treeOutput = renderEnhancedTree(parsedLog, treeOptions);
            formatLabel = 'enhanced';
            break;
          case 'compact':
            // Compact summary showing top time consumers
            treeOutput = generateTreeSummary(parsedLog, maxLines ?? 20);
            formatLabel = 'compact';
            break;
          case 'tree':
          default:
            // Standard ASCII tree
            treeOutput = renderTree(parsedLog, treeOptions);
            formatLabel = 'tree';
            break;
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              logId: targetId,
              reloadedFromDisk: wasReloaded,
              eventCount: parsedLog.events.length,
              format: formatLabel,
              tree: treeOutput,
            }, null, 2)
          }]
        };
      }
    );

    // sf_debug_issues - Get detected issues
    this.mcpServer.tool(
      'sf_debug_issues',
      'Get detected issues from a parsed debug log with severity and fix suggestions.',
      {
        logId: z.string().optional().describe('Log ID (uses current if not provided)'),
        minSeverity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional().describe('Minimum severity to include'),
        category: z.string().optional().describe('Filter by issue category'),
        limit: z.number().optional().describe('Maximum issues to return'),
      },
      async ({ logId, minSeverity, category, limit }) => {
        const targetId = logId || state.currentLogId;
        if (!targetId) {
          return { content: [{ type: 'text' as const, text: 'No log loaded.' }], isError: true };
        }

        const [parsedLog] = await server.getLogOrReload(targetId);
        if (!parsedLog) {
          return { content: [{ type: 'text' as const, text: `Log ${targetId} not found and no file path stored for auto-reload.` }], isError: true };
        }

        // Use cached analysis to avoid re-computation
        const analysis = await server.getOrComputeAnalysis(targetId, parsedLog);

        type Issue = typeof analysis.issues[number];
        const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
        let issues: Issue[] = analysis.issues;

        if (minSeverity) {
          const minIndex = severityOrder.indexOf(minSeverity);
          issues = issues.filter((i: Issue) => severityOrder.indexOf(i.severity) <= minIndex);
        }

        if (category) {
          issues = issues.filter((i: Issue) => i.category === category);
        }

        const limitedIssues = issues.slice(0, limit || 20);
        
        // Recall from memory for the first/most critical issue to provide suggestions
        let memoryInsights = null;
        if (limitedIssues.length > 0) {
          const topIssue = limitedIssues[0];
          if (topIssue) {
            try {
              const recallResponse = await state.memory.recall({
                query: topIssue.title,
                issueContext: {
                  issueCode: topIssue.type,
                  severity: topIssue.severity,
                  errorMessage: topIssue.description,
                },
                includeFacts: true,
                includeEpisodes: true,
                includeSolutions: true,
                maxResults: 3,
              });
              state.lastRecall = recallResponse;
              
              if (recallResponse.solutions.length > 0 || recallResponse.facts.length > 0) {
                memoryInsights = {
                  relatedFacts: recallResponse.facts.map(f => ({
                    title: f.title,
                    content: f.content,
                  })),
                  suggestedSolutions: recallResponse.solutions.map(s => ({
                    title: s.solution.title,
                    steps: s.solution.steps,
                    relevance: s.relevance,
                  })),
                  similarEpisodes: recallResponse.similarEpisodes.length,
                  confidence: recallResponse.confidence,
                };
              }
              } catch {
              // Memory recall is optional, don't fail the request
            }
          }
        }
        
        const formattedIssues = limitedIssues.map((issue: Issue, index: number) => ({
          index,
          type: issue.type,
          severity: issue.severity,
          category: issue.category,
          title: issue.title,
          description: issue.description,
          lineNumbers: issue.lineNumbers,
          recommendations: issue.recommendations,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              logId: targetId,
              total: analysis.issues.length,
              returned: formattedIssues.length,
              bySeverity: analysis.bySeverity,
              issues: formattedIssues,
              memoryInsights,
            }, null, 2)
          }]
        };
      }
    );

    // sf_debug_query - Query events
    this.mcpServer.tool(
      'sf_debug_query',
      'Query events from a parsed debug log with flexible filters.',
      {
        logId: z.string().optional().describe('Log ID'),
        eventTypes: z.array(z.string()).optional().describe('Filter by event types'),
        className: z.string().optional().describe('Filter by class name'),
        methodName: z.string().optional().describe('Filter by method name'),
        minDuration: z.number().optional().describe('Minimum duration in ms'),
        limit: z.number().optional().describe('Maximum events'),
      },
      async ({ logId, eventTypes, className, methodName, minDuration, limit }) => {
        const targetId = logId || state.currentLogId;
        if (!targetId) {
          return { content: [{ type: 'text' as const, text: 'No log loaded.' }], isError: true };
        }

        const [parsedLog] = await server.getLogOrReload(targetId);
        if (!parsedLog) {
          return { content: [{ type: 'text' as const, text: `Log ${targetId} not found and no file path stored for auto-reload.` }], isError: true };
        }

        // OPTIMIZATION: Convert eventTypes to Set for O(1) lookups instead of O(n) includes()
        const eventTypeSet = eventTypes && eventTypes.length > 0 ? new Set(eventTypes) : null;
        let events = parsedLog.events;

        if (eventTypeSet) {
          events = events.filter(e => eventTypeSet.has(e.type));
        }

        if (className) {
          events = events.filter(e => ('className' in e && typeof e.className === 'string') ? e.className.includes(className) : false);
        }

        if (methodName) {
          events = events.filter(e => ('methodName' in e && typeof e.methodName === 'string') ? e.methodName.includes(methodName) : false);
        }

        if (minDuration !== undefined) {
          events = events.filter(e => ('duration' in e ? (e.duration as number) : 0) >= minDuration * 1000000);
        }

        const limitedEvents = events.slice(0, limit || 50);
        const formattedEvents = limitedEvents.map(e => ({
          id: e.id,
          type: e.type,
          timestamp: e.timestamp,
          className: 'className' in e ? e.className : undefined,
          methodName: 'methodName' in e ? e.methodName : undefined,
          duration: 'duration' in e && e.duration ? (e.duration as number) / 1000000 : undefined,
          message: 'message' in e && typeof e.message === 'string' ? e.message.substring(0, 200) : undefined,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              logId: targetId,
              totalMatched: events.length,
              returned: formattedEvents.length,
              events: formattedEvents,
            }, null, 2)
          }]
        };
      }
    );

    // sf_debug_async_jobs - Extract async job references
    this.mcpServer.tool(
      'sf_debug_async_jobs',
      'Extract async job references (Queueable, Batch, Future, Schedulable) from a parsed log.',
      {
        logId: z.string().optional().describe('Log ID'),
      },
      async ({ logId }) => {
        const targetId = logId || state.currentLogId;
        if (!targetId) {
          return { content: [{ type: 'text' as const, text: 'No log loaded.' }], isError: true };
        }

        const [parsedLog] = await server.getLogOrReload(targetId);
        if (!parsedLog) {
          return { content: [{ type: 'text' as const, text: `Log ${targetId} not found and no file path stored for auto-reload.` }], isError: true };
        }

        const { extractAsyncJobs } = await import('../async/index.js');
        const result = extractAsyncJobs(parsedLog.events);

        // OPTIMIZATION: Single-pass counting instead of 4 separate filter() calls
        const byType = { QUEUEABLE: 0, BATCH: 0, FUTURE: 0, SCHEDULABLE: 0 };
        type AsyncJob = typeof result.jobs[number];
        for (const job of result.jobs) {
          if (job.jobType in byType) {
            byType[job.jobType as keyof typeof byType]++;
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              logId: targetId,
              jobCount: result.jobs.length,
              jobs: result.jobs.map((job: AsyncJob) => ({
                jobType: job.jobType,
                className: job.className,
                methodName: job.methodName,
                enqueuedAt: job.enqueuedAt,
                jobId: job.jobId,
                lineNumber: job.lineNumber,
              })),
              byType,
              confidence: result.confidence,
            }, null, 2)
          }]
        };
      }
    );

    // sf_debug_store_solution - Store a working solution for an issue
    this.mcpServer.tool(
      'sf_debug_store_solution',
      'Store a working solution for an issue to learn from. Call this after successfully fixing an issue.',
      {
        issueCode: z.string().describe('The issue code/type that was fixed (e.g., SOQL_101, GOVERNOR_LIMIT)'),
        severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).describe('Severity of the issue'),
        title: z.string().describe('Short title for the solution'),
        steps: z.array(z.string()).describe('Steps taken to fix the issue'),
        codeChanges: z.array(z.object({
          file: z.string(),
          before: z.string(),
          after: z.string(),
        })).optional().describe('Code changes made (file, before, after)'),
        errorMessage: z.string().optional().describe('Original error message'),
      },
      async ({ issueCode, severity, title, steps, codeChanges, errorMessage }) => {
        await server.ensureSession();
        
        try {
          const result = await state.memory.store({
            sessionId: state.sessionId || 'unknown',
            issue: {
              code: issueCode,
              severity,
              description: errorMessage || '',
            },
            solution: {
              title,
              steps,
              codeChanges,
            },
          });

          if (result.success) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: 'Solution stored successfully! It will be suggested for similar issues in future sessions.',
                  solutionId: result.solutionId,
                  semanticEntryId: result.semanticEntryId,
                }, null, 2)
              }]
            };
          } else {
            return {
              content: [{ type: 'text' as const, text: `Failed to store solution: ${result.error}` }],
              isError: true
            };
          }
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Error storing solution: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );

    // sf_debug_end_session - End the debugging session with outcome
    this.mcpServer.tool(
      'sf_debug_end_session',
      'End the current debugging session and record the outcome.',
      {
        outcome: z.enum(['RESOLVED', 'PARTIALLY_RESOLVED', 'WORKAROUND_APPLIED', 'ESCALATED', 'ABANDONED', 'UNKNOWN']).describe('How the debugging session ended'),
        helpful: z.boolean().optional().describe('Was the session helpful?'),
        rating: z.number().optional().describe('Rating from 1-5'),
        comment: z.string().optional().describe('Additional feedback'),
      },
      async ({ outcome, helpful, rating, comment }) => {
        if (!state.sessionId) {
          return {
            content: [{ type: 'text' as const, text: 'No active session to end.' }],
            isError: true
          };
        }

        try {
          const feedback = helpful !== undefined || rating !== undefined || comment
            ? { helpful: helpful ?? false, rating, comment }
            : undefined;
          
          await state.memory.endSession(outcome, feedback);
          const sessionId = state.sessionId;
          state.sessionId = null;
          state.lastRecall = null;

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Session ${sessionId} ended with outcome: ${outcome}`,
                outcome,
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Error ending session: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );

    // sf_debug_memory_stats - Get memory system statistics
    this.mcpServer.tool(
      'sf_debug_memory_stats',
      'Get statistics about the memory system (solutions stored, episodes, etc.)',
      {},
      async () => {
        try {
          const stats = await state.memory.getStats();
          const sessionContext = state.memory.getSessionContext();

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                stats: {
                  factualKnowledge: stats.factualCount,
                  semanticEntries: stats.semanticCount,
                  episodes: stats.episodeCount,
                  solutions: stats.solutionCount,
                  cacheHitRate: `${(stats.cacheHitRate * 100).toFixed(1)}%`,
                  storageSizeKB: Math.round(stats.storageSizeBytes / 1024),
                },
                currentSession: sessionContext ? {
                  sessionId: sessionContext.sessionId,
                  startedAt: sessionContext.startedAt,
                  loadedLogs: sessionContext.loadedLogs.length,
                  recentQueries: sessionContext.recentQueries.length,
                } : null,
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Error getting stats: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );

    // ========================================================================
    // Salesforce Integration Tools (using SFDX)
    // ========================================================================

    // sf_debug_setup - Set up debug session using SFDX
    this.mcpServer.tool(
      'sf_debug_setup',
      'Set up a debug session by connecting to a Salesforce org via SFDX CLI. Optionally creates trace flags for the current user.',
      {
        usernameOrAlias: z.string().optional().describe('SFDX username or alias. Uses default org if not provided.'),
        preset: z.enum(['minimal', 'soql_analysis', 'governor_limits', 'triggers', 'cpu_hotspots', 'exceptions', 'callouts', 'visualforce', 'workflow', 'full_diagnostic', 'ai_optimized']).optional().describe('Debug level preset for trace flag'),
        durationMinutes: z.number().optional().describe('Trace flag duration in minutes (default: 30)'),
        skipTraceFlag: z.boolean().optional().describe('Skip creating trace flag, just connect'),
      },
      async ({ usernameOrAlias, preset, durationMinutes, skipTraceFlag }) => {
        try {
          const { importSfdxAuth, isSfdxInstalled, getDefaultSfdxOrg } = await import('../capture/sfdx-import.js');

          // Check SFDX is available
          const isInstalled = await isSfdxInstalled();
          if (!isInstalled) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'SFDX CLI not installed. Install Salesforce CLI: https://developer.salesforce.com/tools/salesforcecli',
                  suggestion: 'Run: npm install -g @salesforce/cli',
                }, null, 2)
              }],
              isError: true
            };
          }

          // Import auth from SFDX
          const authResult = await importSfdxAuth({
            usernameOrAlias,
            useDefault: true,
            apiVersion: 'v59.0',
          });

          if (!authResult.success || !authResult.connection) {
            // Provide helpful error message
            const defaultOrg = await getDefaultSfdxOrg();
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: authResult.error || 'Failed to connect',
                  defaultOrg,
                  suggestion: defaultOrg 
                    ? `Try: sf org display --target-org ${defaultOrg}` 
                    : 'Run: sf org login web --set-default',
                }, null, 2)
              }],
              isError: true
            };
          }

          // Store connection in state
          state.connection = authResult.connection;
          await server.ensureSession();

          let traceFlagInfo = null;

          // Create trace flag if not skipped
          if (!skipTraceFlag && preset) {
            try {
              const { createTraceFlag } = await import('../capture/trace-flag-manager.js');
              const traceFlagResult = await createTraceFlag(authResult.connection, {
                targetId: authResult.connection.userId,
                targetType: 'USER',
                debugLevel: preset,
                durationMinutes: durationMinutes || 30,
              });

              if (traceFlagResult.success && traceFlagResult.traceFlag) {
                traceFlagInfo = {
                  id: traceFlagResult.traceFlag.id,
                  expiresAt: traceFlagResult.traceFlag.expirationDate.toISOString(),
                  preset,
                };
              }
            } catch {
              // Non-fatal - just log that trace flag creation failed
              traceFlagInfo = { error: 'Trace flag creation failed (non-fatal)' };
            }
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                connection: {
                  orgId: authResult.connection.orgId,
                  username: authResult.connection.username,
                  alias: authResult.connection.alias,
                  instanceUrl: authResult.connection.instanceUrl,
                  orgType: authResult.connection.orgType,
                },
                traceFlag: traceFlagInfo,
                nextSteps: [
                  'Use sf_debug_list_logs to see available logs',
                  'Use sf_debug_get_log to fetch and parse a specific log',
                  'Generate some activity in Salesforce to create new logs',
                ],
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Setup error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );

    // sf_debug_list_logs - List logs from the connected org
    this.mcpServer.tool(
      'sf_debug_list_logs',
      'List debug logs from the connected Salesforce org. Requires sf_debug_setup first.',
      {
        limit: z.number().optional().describe('Maximum number of logs to return (default: 10)'),
        userId: z.string().optional().describe('Filter by user ID (defaults to current user)'),
        operation: z.string().optional().describe('Filter by operation name'),
        status: z.enum(['Success', 'Failure']).optional().describe('Filter by status'),
      },
      async ({ limit, userId, operation, status }) => {
        if (!state.connection) {
          return {
            content: [{ type: 'text' as const, text: 'Not connected. Use sf_debug_setup first.' }],
            isError: true
          };
        }

        try {
          const { listLogs } = await import('../capture/log-fetcher.js');
          
          const logs = await listLogs(state.connection, {
            limit: limit || 10,
            userId: userId || state.connection.userId,
            operation,
            status,
            orderBy: 'StartTime',
            orderDirection: 'DESC',
          });

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                count: logs.length,
                logs: logs.map(log => ({
                  id: log.Id,
                  startTime: log.StartTime,
                  operation: log.Operation,
                  request: log.Request,
                  status: log.Status,
                  sizeKB: Math.round(log.LogLength / 1024),
                  durationMs: log.DurationMilliseconds,
                  user: log.LogUser?.Username,
                })),
                hint: 'Use sf_debug_get_log with a log ID to fetch and parse the log content',
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Failed to list logs: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );

    // sf_debug_get_log - Fetch and parse a log from the org
    this.mcpServer.tool(
      'sf_debug_get_log',
      'Fetch a debug log from Salesforce and parse it. Requires sf_debug_setup first.',
      {
        logId: z.string().describe('The Salesforce log ID (starts with 07L)'),
        parseOnly: z.boolean().optional().describe('Only parse, do not analyze (faster for large logs)'),
      },
      async ({ logId, parseOnly }) => {
        if (!state.connection) {
          return {
            content: [{ type: 'text' as const, text: 'Not connected. Use sf_debug_setup first.' }],
            isError: true
          };
        }

        try {
          const { fetchLogContent, getLogRecord } = await import('../capture/log-fetcher.js');
          const { parseLog } = await import('../parser/index.js');
          
          // First get log metadata
          const logRecord = await getLogRecord(state.connection, logId);
          if (!logRecord) {
            return {
              content: [{ type: 'text' as const, text: `Log ${logId} not found in org.` }],
              isError: true
            };
          }

          // Check size
          if (logRecord.LogLength > MAX_CONTENT_SIZE) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: `Log too large: ${(logRecord.LogLength / 1024 / 1024).toFixed(1)}MB. Maximum: ${MAX_CONTENT_SIZE / 1024 / 1024}MB`,
                  logInfo: {
                    id: logRecord.Id,
                    operation: logRecord.Operation,
                    sizeKB: Math.round(logRecord.LogLength / 1024),
                  },
                }, null, 2)
              }],
              isError: true
            };
          }

          // Fetch log content
          const content = await fetchLogContent(state.connection, logId);

          // Parse the log
          const result = parseLog(content);
          if (!result.success) {
            return {
              content: [{ type: 'text' as const, text: `Parse error: ${result.error.message}` }],
              isError: true
            };
          }

          const parsedLog = result.data;
          server.cacheLog(logId, parsedLog);

          // Optionally analyze
          let analysis = null;
          if (!parseOnly) {
            const { analyzeLog } = await import('../analyzer/index.js');
            analysis = analyzeLog(parsedLog);
            state.analysisCache.set(logId, analysis);
          }

          // Event type counts
          const eventTypeCounts: Record<string, number> = {};
          for (const event of parsedLog.events) {
            eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                logId,
                metadata: {
                  operation: logRecord.Operation,
                  startTime: logRecord.StartTime,
                  status: logRecord.Status,
                  durationMs: logRecord.DurationMilliseconds,
                  sizeKB: Math.round(logRecord.LogLength / 1024),
                },
                parseStats: {
                  totalEvents: parsedLog.events.length,
                  parsedLines: parsedLog.stats.parsedLines,
                  failedLines: parsedLog.stats.failedLines,
                },
                eventTypes: eventTypeCounts,
                analysis: analysis ? {
                  issueCount: analysis.issues.length,
                  bySeverity: analysis.bySeverity,
                  byCategory: analysis.byCategory,
                } : 'Use sf_debug_issues to analyze',
                truncation: parsedLog.truncation,
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Failed to fetch log: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );

    // sf_debug_correlate - Correlate parent log with async child logs
    this.mcpServer.tool(
      'sf_debug_correlate',
      'Correlate a parent debug log with its async child logs (Queueable, Batch, Future). Requires connection.',
      {
        logId: z.string().optional().describe('Parent log ID to correlate (uses current if not provided)'),
        fetchChildren: z.boolean().optional().describe('Also fetch and parse child logs'),
      },
      async ({ logId, fetchChildren }) => {
        const targetId = logId || state.currentLogId;
        if (!targetId) {
          return {
            content: [{ type: 'text' as const, text: 'No log loaded. Use sf_debug_get_log or sf_debug_parse_content first.' }],
            isError: true
          };
        }

        const [parsedLog] = await server.getLogOrReload(targetId);
        if (!parsedLog) {
          return {
            content: [{ type: 'text' as const, text: `Log ${targetId} not found and no file path stored for auto-reload.` }],
            isError: true
          };
        }

        try {
          // Extract async jobs from the parent log
          const { extractAsyncJobs } = await import('../async/index.js');
          const jobsResult = extractAsyncJobs(parsedLog.events);

          if (jobsResult.jobs.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: 'No async jobs found in log',
                  jobCount: 0,
                  correlations: [],
                }, null, 2)
              }]
            };
          }

          // If we have a connection and want to correlate, use the correlator
          let correlations: Array<{
            jobType: string;
            className: string;
            childLogId?: string;
            confidence?: number;
            status: string;
          }> = [];

          if (state.connection) {
            try {
              const { LogCorrelator } = await import('../async/log-correlator.js');
              const correlator = new LogCorrelator(state.connection);
              const correlationResults = await correlator.correlate(targetId, jobsResult.jobs, parsedLog);

              correlations = correlationResults.map(r => ({
                jobType: r.jobRef.jobType,
                className: r.jobRef.className,
                childLogId: r.childLogId,
                confidence: r.confidence,
                status: 'correlated',
              }));

              // Optionally fetch and parse child logs
              if (fetchChildren && correlationResults.length > 0) {
                const { fetchLogContent } = await import('../capture/log-fetcher.js');
                const { parseLog } = await import('../parser/index.js');
                
                for (const result of correlationResults) {
                  if (result.childLogId) {
                    try {
                      const childContent = await fetchLogContent(state.connection, result.childLogId);
                      const childParsed = parseLog(childContent);
                      if (childParsed.success) {
                        server.cacheLog(result.childLogId, childParsed.data);
                      }
                    } catch {
                      // Non-fatal - child fetch failed
                    }
                  }
                }
              }
            } catch {
              // Correlation failed, just return jobs
              correlations = jobsResult.jobs.map(job => ({
                jobType: job.jobType,
                className: job.className,
                status: 'not_correlated_no_connection',
              }));
            }
          } else {
            // No connection - just list jobs
            correlations = jobsResult.jobs.map(job => ({
              jobType: job.jobType,
              className: job.className,
              status: 'not_correlated_no_connection',
            }));
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                parentLogId: targetId,
                jobCount: jobsResult.jobs.length,
                jobs: jobsResult.jobs.map(job => ({
                  jobType: job.jobType,
                  className: job.className,
                  methodName: job.methodName,
                  enqueuedAt: job.enqueuedAt,
                  lineNumber: job.lineNumber,
                })),
                correlations,
                confidence: jobsResult.confidence,
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Correlation error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );

    // sf_debug_problem_context - Get AI-optimized problem context
    this.mcpServer.tool(
      'sf_debug_problem_context',
      'Get AI-optimized problem context for a specific issue. Designed for AI consumption with relevant events, guidance, and fix suggestions.',
      {
        logId: z.string().optional().describe('Log ID (uses current if not provided)'),
        issueIndex: z.number().optional().describe('Index of the issue (default: 0 for top issue)'),
        issueType: z.string().optional().describe('Filter to specific issue type'),
        maxTokens: z.number().optional().describe('Maximum tokens for context (default: 2000)'),
      },
      async ({ logId, issueIndex, issueType, maxTokens }) => {
        const targetId = logId || state.currentLogId;
        if (!targetId) {
          return {
            content: [{ type: 'text' as const, text: 'No log loaded.' }],
            isError: true
          };
        }

        const [parsedLog] = await server.getLogOrReload(targetId);
        if (!parsedLog) {
          return {
            content: [{ type: 'text' as const, text: `Log ${targetId} not found and no file path stored for auto-reload.` }],
            isError: true
          };
        }

        try {
          const analysis = await server.getOrComputeAnalysis(targetId, parsedLog);
          
          if (analysis.issues.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: 'No issues detected in log',
                  logId: targetId,
                }, null, 2)
              }]
            };
          }

          // Find the target issue
          let targetIssue = analysis.issues[issueIndex || 0];
          if (issueType) {
            targetIssue = analysis.issues.find(i => i.type === issueType) || targetIssue;
          }

          if (!targetIssue) {
            return {
              content: [{ type: 'text' as const, text: `Issue not found. Available: ${analysis.issues.map(i => i.type).join(', ')}` }],
              isError: true
            };
          }

          // Build problem context
          const { buildProblemContext } = await import('../output/problem-context.js');
          const context = buildProblemContext(targetIssue, parsedLog, analysis, {
            maxTokens: maxTokens || 2000,
            includeCodeSnippets: true,
            verboseGuidance: true,
          });

          // Check memory for similar past solutions
          let memoryContext = null;
          try {
            const recallResponse = await state.memory.recall({
              query: targetIssue.title,
              issueContext: {
                issueCode: targetIssue.type,
                severity: targetIssue.severity,
                errorMessage: targetIssue.description,
              },
              includeFacts: true,
              includeEpisodes: true,
              includeSolutions: true,
              maxResults: 3,
            });

            if (recallResponse.solutions.length > 0 || recallResponse.facts.length > 0) {
              memoryContext = {
                relatedFacts: recallResponse.facts.slice(0, 2).map(f => f.title),
                pastSolutions: recallResponse.solutions.map(s => ({
                  title: s.solution.title,
                  steps: s.solution.steps.slice(0, 3),
                  successRate: `${Math.round(s.relevance * 100)}%`,
                })),
              };
            }
          } catch {
            // Memory recall is optional
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                logId: targetId,
                issueIndex: analysis.issues.indexOf(targetIssue),
                totalIssues: analysis.issues.length,
                context: {
                  header: context.header,
                  issue: context.issue,
                  events: context.events,
                  guidance: context.guidance,
                  codeSnippet: context.codeSnippet,
                },
                memoryContext,
                tokenCount: context.tokenCount,
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Context error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );

    // sf_memory_recall - Recall past solutions and knowledge
    this.mcpServer.tool(
      'sf_memory_recall',
      'Recall past solutions, factual knowledge, and similar debugging episodes from memory.',
      {
        query: z.string().describe('Search query for memory recall'),
        issueCode: z.string().optional().describe('Specific issue code (e.g., SOQL_101, GOVERNOR_LIMIT)'),
        severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional().describe('Filter by severity'),
        includeFacts: z.boolean().optional().describe('Include factual knowledge (default: true)'),
        includeSolutions: z.boolean().optional().describe('Include past solutions (default: true)'),
        includeEpisodes: z.boolean().optional().describe('Include similar episodes (default: true)'),
        maxResults: z.number().optional().describe('Maximum results per category (default: 5)'),
      },
      async ({ query, issueCode, severity, includeFacts, includeSolutions, includeEpisodes, maxResults }) => {
        try {
          await server.ensureSession();

          const recallRequest = {
            query,
            issueContext: issueCode ? {
              issueCode,
              severity: severity || 'MEDIUM',
              errorMessage: query,
            } : undefined,
            includeFacts: includeFacts !== false,
            includeSolutions: includeSolutions !== false,
            includeEpisodes: includeEpisodes !== false,
            maxResults: maxResults || 5,
          };

          const response = await state.memory.recall(recallRequest);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                query,
                confidence: response.confidence,
                facts: response.facts.map(f => ({
                  title: f.title,
                  category: f.category,
                  content: f.content.substring(0, 200) + (f.content.length > 200 ? '...' : ''),
                  keywords: f.keywords,
                })),
                solutions: response.solutions.map(s => ({
                  title: s.solution.title,
                  steps: s.solution.steps,
                  relevance: `${Math.round(s.relevance * 100)}%`,
                  codeChanges: s.solution.codeChanges?.length || 0,
                })),
                similarEpisodes: response.similarEpisodes.length,
                semanticMatches: response.semanticMatches.length,
                metadata: {
                  queryTimeMs: response.metadata.queryTime,
                  totalResults: response.metadata.totalResults,
                },
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Memory recall error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
          };
        }
      }
    );
  }
}

// ============================================================================
// Tool Result Helpers (for external tool files)
// ============================================================================

/**
 * Create a successful text result
 */
export function toolSuccess(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Create a JSON result
 */
export function toolJSON(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an error result
 */
export function toolError(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

// ============================================================================
// Validation Schemas (shared)
// ============================================================================

export const LogIdSchema = z.object({
  logId: z.string().describe('Debug log ID'),
});

export const ConnectionRequiredSchema = z.object({}).describe('Requires active Salesforce connection');

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Create and start the MCP server
 */
export async function startMCPServer(config?: Partial<ServerConfig>): Promise<SFDebugMCPServer> {
  const server = new SFDebugMCPServer(config);
  await server.start();
  return server;
}
