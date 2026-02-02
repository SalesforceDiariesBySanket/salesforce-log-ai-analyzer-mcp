#!/usr/bin/env node
/**
 * @module mcp/index
 * @description MCP (Model Context Protocol) server for AI assistants
 * @status COMPLETE
 * @see src/mcp/STATE.md
 * @dependencies src/parser, src/analyzer, src/output
 * @lastModified 2026-01-31
 */

// ============================================================================
// Server Exports
// ============================================================================

export {
  SFDebugMCPServer,
  startMCPServer,
  toolSuccess,
  toolJSON,
  toolError,
  type ServerState,
  type ServerConfig,
} from './server.js';

// ============================================================================
// Tool Exports
// ============================================================================

export {
  TOOL_CATEGORIES,
  ALL_TOOL_NAMES,
  type ToolName,
} from './tools/index.js';

// ============================================================================
// Main Entry Point
// ============================================================================

import { startMCPServer } from './server.js';

/**
 * Start the MCP server when run directly
 */
async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  
  try {
    const server = await startMCPServer({ verbose });
    
    // Keep process running and handle graceful shutdown
    process.on('SIGINT', async () => {
      console.error('MCP Server shutting down...');
      await server.stop('ABANDONED');
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.error('MCP Server shutting down...');
      await server.stop('ABANDONED');
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
