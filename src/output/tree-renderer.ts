/**
 * @module output/tree-renderer
 * @description ASCII tree renderer for execution call tree visualization
 *              Includes git-graph style trigger flow visualization
 * @status COMPLETE
 * @dependencies src/types
 * @lastModified 2026-02-01
 */

import type { EventNode, ParsedLog } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface TreeRenderOptions {
  /** Maximum depth to render (0 = unlimited) */
  maxDepth?: number;
  /** Show duration in milliseconds */
  showDuration?: boolean;
  /** Show percentage of total time */
  showPercentage?: boolean;
  /** Show progress bar */
  showProgressBar?: boolean;
  /** Maximum width for progress bar */
  progressBarWidth?: number;
  /** Event types to include (empty = all) */
  includeTypes?: string[];
  /** Event types to exclude */
  excludeTypes?: string[];
  /** Minimum duration (ms) to include */
  minDurationMs?: number;
  /** Maximum lines to output */
  maxLines?: number;
}

/**
 * Git-graph style visualization options
 */
export interface GitGraphOptions {
  /** Show commit messages with timing */
  showTiming?: boolean;
  /** Show row counts for SOQL/DML */
  showRowCounts?: boolean;
  /** Maximum lines to output */
  maxLines?: number;
  /** Colorize output (for terminals that support it) */
  colorize?: boolean;
}

interface TreeNode {
  id: number;
  type: string;
  name: string;
  durationMs: number;
  lineNumber?: number;
  children: TreeNode[];
  /** Row count for SOQL/DML events */
  rowCount?: number;
  /** Whether this is a trigger event */
  isTrigger?: boolean;
  /** Trigger name if applicable */
  triggerName?: string;
  /** Object type for triggers */
  triggerObject?: string;
}

// ============================================================================
// Git-Graph Symbols
// ============================================================================

const GIT_SYMBOLS = {
  // Branch visualization
  COMMIT: '●',           // Regular commit
  BRANCH_START: '◉',     // Trigger/branch start (green)
  BRANCH_END: '◈',       // Trigger/branch end (red)
  MERGE: '◆',            // Merge point
  
  // Operation types
  DML: '■',              // DML operation (black square)
  SOQL_RESULTS: '○',     // SOQL with results (hollow circle)
  SOQL_EMPTY: '◌',       // SOQL without results (dotted circle)
  EXCEPTION: '✖',        // Exception/error
  DEBUG: '◇',            // Debug statement
  CALLOUT: '⬡',          // External callout
  FLOW: '▷',             // Flow execution
  
  // Lines
  VERTICAL: '│',
  HORIZONTAL: '─',
  BRANCH: '╱',
  MERGE_LINE: '╲',
  FORK: '├',
  JOIN: '┤',
  CORNER_DOWN: '╰',
  CORNER_UP: '╭',
  CROSS: '┼',
};

// ASCII fallback symbols for terminals that don't support unicode
const ASCII_SYMBOLS: typeof GIT_SYMBOLS = {
  COMMIT: '*',
  BRANCH_START: 'o',
  BRANCH_END: 'x',
  MERGE: '+',
  DML: '#',
  SOQL_RESULTS: 'O',
  SOQL_EMPTY: '.',
  EXCEPTION: 'X',
  DEBUG: '-',
  CALLOUT: '>',
  FLOW: '>',
  VERTICAL: '|',
  HORIZONTAL: '-',
  BRANCH: '/',
  MERGE_LINE: '\\',
  FORK: '|',
  JOIN: '|',
  CORNER_DOWN: '\\',
  CORNER_UP: '/',
  CROSS: '+',
};

// ============================================================================
// Tree Builder
// ============================================================================

/**
 * Build a hierarchical tree from flat events
 * 
 * Note: Events have parentId set during parsing. parentId=0 refers to the
 * synthetic root created by ast-builder, which is NOT in the events array.
 * We handle this by creating a virtual root for orphaned events.
 */
export function buildTreeFromEvents(events: EventNode[]): TreeNode | null {
  if (events.length === 0) return null;

  // Create a synthetic root node (id=0) to match what ast-builder creates
  const syntheticRoot: TreeNode = {
    id: 0,
    type: 'EXECUTION_STARTED',
    name: 'Root',
    durationMs: 0,
    lineNumber: 0,
    children: [],
  };

  // Create a map for quick lookups, including the synthetic root
  const nodeMap = new Map<number, TreeNode>();
  nodeMap.set(0, syntheticRoot);
  
  // Create tree nodes for all events with enhanced metadata
  for (const event of events) {
    const e = event as unknown as Record<string, unknown>;
    
    // Get event name first (needed for trigger detection)
    const eventName = getEventName(event);
    
    // Check if the event was parsed with trigger info
    const parsedTrigger = e.unitType === 'Trigger';
    const parsedTriggerName = typeof e.unitName === 'string' ? e.unitName : undefined;
    const parsedTriggerObject = typeof e.triggerObject === 'string' ? e.triggerObject : undefined;
    
    // Also check for trigger patterns in the name (fallback for older parsed logs)
    const triggerPattern = /^trigger\s+(\w+)\s+on\s+(\w+)/i;
    const triggerMatch = eventName.match(triggerPattern);
    const onTriggerPattern = /(\w+Trigger)\s+on\s+(\w+)/i;
    const onTriggerMatch = eventName.match(onTriggerPattern);
    
    const isTrigger = parsedTrigger || !!triggerMatch || !!onTriggerMatch;
    
    // Extract trigger info - prefer parsed values
    let triggerName: string | undefined = parsedTriggerName;
    let triggerObject: string | undefined = parsedTriggerObject;
    
    if (!triggerName) {
      if (triggerMatch) {
        triggerName = triggerMatch[1];
        triggerObject = triggerMatch[2];
      } else if (onTriggerMatch) {
        triggerName = onTriggerMatch[1];
        triggerObject = onTriggerMatch[2];
      }
    }
    
    // Extract row count for SOQL/DML
    const rowCount = typeof e.rowCount === 'number' ? e.rowCount : undefined;

    const node: TreeNode = {
      id: event.id,
      type: event.type,
      name: eventName,
      durationMs: typeof event.duration === 'number' ? event.duration / 1_000_000 : 0, // Convert ns to ms
      lineNumber: event.lineNumber,
      children: [],
      rowCount,
      isTrigger,
      triggerName,
      triggerObject,
    };
    nodeMap.set(event.id, node);
  }

  // Build parent-child relationships
  for (const event of events) {
    const node = nodeMap.get(event.id);
    if (!node) continue;

    // Determine the parent - default to synthetic root (id=0) if no valid parent
    const parentId = (event.parentId !== undefined && event.parentId !== -1) 
      ? event.parentId 
      : 0;
    
    const parent = nodeMap.get(parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      // Orphan event - attach to root
      syntheticRoot.children.push(node);
    }
  }

  // Calculate root duration from children
  syntheticRoot.durationMs = syntheticRoot.children.reduce(
    (sum, child) => sum + (child.durationMs || 0), 
    0
  );

  // If the synthetic root only has one child, return that child as the root
  // to avoid unnecessary nesting. But if it has multiple top-level children,
  // return the synthetic root to preserve the full structure.
  if (syntheticRoot.children.length === 1) {
    return syntheticRoot.children[0] ?? null;
  }

  return syntheticRoot;
}

/**
 * Get display name for an event
 */
function getEventName(event: EventNode): string {
  // Check for specific event properties
  const e = event as unknown as Record<string, unknown>;
  
  if (e.methodName) return String(e.methodName);
  if (e.className && e.methodName) return `${e.className}.${e.methodName}`;
  if (e.name) return String(e.name);
  if (e.query) {
    const query = String(e.query);
    return query.length > 60 ? query.substring(0, 60) + '...' : query;
  }
  if (e.operation && e.objectType) return `${e.operation} on ${e.objectType}`;
  if (e.message) return String(e.message).substring(0, 60);
  if (e.text) return String(e.text).substring(0, 60);
  
  return event.type;
}

// ============================================================================
// ASCII Tree Renderer
// ============================================================================

/**
 * Render a parsed log as an ASCII tree
 */
export function renderTree(parsedLog: ParsedLog, options: TreeRenderOptions = {}): string {
  const {
    maxDepth = 0,
    showDuration = true,
    showPercentage = true,
    showProgressBar = true,
    progressBarWidth = 20,
    includeTypes = [],
    excludeTypes = [],
    minDurationMs = 0,
    maxLines = 500,
  } = options;

  // Build tree from events
  const root = buildTreeFromEvents(parsedLog.events);
  if (!root) {
    return 'No events to display';
  }

  // Calculate total duration for percentages
  const totalDuration = calculateTotalDuration(root);

  // Render lines
  const lines: string[] = [];
  renderNode(root, '', true, 0);

  function renderNode(node: TreeNode, prefix: string, isLast: boolean, depth: number): void {
    if (maxLines > 0 && lines.length >= maxLines) {
      if (lines.length === maxLines) {
        lines.push(`... (truncated at ${maxLines} lines)`);
      }
      return;
    }

    // Check depth limit
    if (maxDepth > 0 && depth > maxDepth) return;

    // Check type filters
    if (includeTypes.length > 0 && !includeTypes.includes(node.type)) return;
    if (excludeTypes.includes(node.type)) return;

    // Check minimum duration
    if (minDurationMs > 0 && node.durationMs < minDurationMs) return;

    // Build the line
    const connector = depth === 0 ? '' : (isLast ? '└── ' : '├── ');
    
    // Format node info
    let nodeInfo = formatNodeType(node.type);
    if (node.name !== node.type) {
      nodeInfo += ` ${node.name}`;
    }

    // Add duration info
    let durationInfo = '';
    if (showDuration && node.durationMs > 0) {
      const percentage = totalDuration > 0 ? (node.durationMs / totalDuration * 100) : 0;
      durationInfo = ` [${formatDuration(node.durationMs)}`;
      if (showPercentage) {
        durationInfo += `|${percentage.toFixed(0)}%`;
      }
      durationInfo += ']';
      
      if (showProgressBar) {
        durationInfo += ' ' + renderProgressBar(percentage, progressBarWidth);
      }
    }

    lines.push(prefix + connector + nodeInfo + durationInfo);

    // Render children
    const childPrefix = depth === 0 ? '' : prefix + (isLast ? '    ' : '│   ');
    const visibleChildren = node.children.filter(child => {
      if (includeTypes.length > 0 && !includeTypes.includes(child.type)) return false;
      if (excludeTypes.includes(child.type)) return false;
      if (minDurationMs > 0 && child.durationMs < minDurationMs) return false;
      return true;
    });

    for (let i = 0; i < visibleChildren.length; i++) {
      const child = visibleChildren[i];
      if (child) {
        renderNode(child, childPrefix, i === visibleChildren.length - 1, depth + 1);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format node type for display
 */
function formatNodeType(type: string): string {
  // Shorten common types
  const typeMap: Record<string, string> = {
    'EXECUTION_STARTED': 'EXEC',
    'EXECUTION_FINISHED': 'EXEC_END',
    'CODE_UNIT_STARTED': 'CODE_UNIT',
    'CODE_UNIT_FINISHED': 'CODE_UNIT_END',
    'METHOD_ENTRY': 'METHOD',
    'METHOD_EXIT': 'METHOD_END',
    'SOQL_EXECUTE_BEGIN': 'SOQL',
    'SOQL_EXECUTE_END': 'SOQL_END',
    'DML_BEGIN': 'DML',
    'DML_END': 'DML_END',
    'FLOW_START_INTERVIEW_BEGIN': 'FLOW',
    'FLOW_ELEMENT_BEGIN': 'FLOW_ELEM',
    'EXCEPTION_THROWN': 'EXCEPTION',
    'FATAL_ERROR': 'FATAL',
    'ENTERING_MANAGED_PKG': 'MANAGED_PKG',
    'CALLOUT_REQUEST': 'CALLOUT',
    'USER_DEBUG': 'DEBUG',
  };
  
  return typeMap[type] || type;
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}µs`;
  } else if (ms < 1000) {
    return `${ms.toFixed(1)}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

/**
 * Render a progress bar
 */
function renderProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(empty, 0));
}

/**
 * Calculate total duration of a tree
 */
function calculateTotalDuration(node: TreeNode): number {
  // Use the root node's duration if available
  if (node.durationMs > 0) {
    return node.durationMs;
  }
  
  // Otherwise sum children
  let total = 0;
  for (const child of node.children) {
    total += child.durationMs > 0 ? child.durationMs : calculateTotalDuration(child);
  }
  return total;
}

/**
 * Generate a compact tree summary (for AI consumption)
 */
export function generateTreeSummary(parsedLog: ParsedLog, maxNodes: number = 20): string {
  const root = buildTreeFromEvents(parsedLog.events);
  if (!root) return 'No execution tree available';

  const totalDuration = calculateTotalDuration(root);
  const lines: string[] = [];
  
  lines.push(`Execution Tree Summary (${parsedLog.events.length} events, ${formatDuration(totalDuration)} total)`);
  lines.push('─'.repeat(60));

  // Find top time consumers
  const allNodes: { node: TreeNode; depth: number }[] = [];
  collectNodes(root, 0, allNodes);
  
  // Sort by duration descending
  allNodes.sort((a, b) => b.node.durationMs - a.node.durationMs);
  
  // Show top N
  const topNodes = allNodes.slice(0, maxNodes);
  for (const { node, depth } of topNodes) {
    const percentage = totalDuration > 0 ? (node.durationMs / totalDuration * 100) : 0;
    const indent = '  '.repeat(Math.min(depth, 5));
    lines.push(`${indent}${formatNodeType(node.type)} ${node.name.substring(0, 40)} [${formatDuration(node.durationMs)}|${percentage.toFixed(0)}%]`);
  }

  return lines.join('\n');
}

function collectNodes(node: TreeNode, depth: number, result: { node: TreeNode; depth: number }[]): void {
  result.push({ node, depth });
  for (const child of node.children) {
    collectNodes(child, depth + 1, result);
  }
}

// ============================================================================
// Git-Graph Style Renderer
// ============================================================================

/**
 * Branch tracking for git-graph visualization
 */
interface BranchState {
  /** Branch name (trigger name or 'main') */
  name: string;
  /** Column index for this branch */
  column: number;
  /** Whether branch is active */
  active: boolean;
  /** Start event id */
  startEventId?: number;
}

/**
 * Git-graph commit representation
 */
interface GitCommit {
  /** Node being represented */
  node: TreeNode;
  /** Branch this commit is on */
  branch: string;
  /** Column position */
  column: number;
  /** Symbol to display */
  symbol: string;
  /** Message to display */
  message: string;
  /** Is this a branch start? */
  isBranchStart: boolean;
  /** Is this a branch end/merge? */
  isBranchEnd: boolean;
  /** Active branches at this point */
  activeBranches: string[];
}

/**
 * Render a parsed log as a git-graph style visualization
 * Shows trigger execution as branches that fork and merge
 */
export function renderGitGraph(parsedLog: ParsedLog, options: GitGraphOptions = {}): string {
  const {
    showTiming = true,
    showRowCounts = true,
    maxLines = 500,
    colorize = false,
  } = options;

  const root = buildTreeFromEvents(parsedLog.events);
  if (!root) {
    return 'No events to display';
  }

  // Use ASCII symbols for basic terminals, unicode for modern ones
  const symbols = colorize ? GIT_SYMBOLS : ASCII_SYMBOLS;
  const lines: string[] = [];
  
  // Track branches (triggers create new branches)
  const branches: Map<string, BranchState> = new Map();
  branches.set('main', { name: 'main', column: 0, active: true });
  
  // Collect commits in execution order
  const commits: GitCommit[] = [];
  let maxColumn = 0;
  
  // Process tree into git-graph commits
  processNodeForGitGraph(root, 'main', commits, branches);
  
  // Calculate max column for rendering
  for (const commit of commits) {
    if (commit.column > maxColumn) {
      maxColumn = commit.column;
    }
  }

  // Render header
  const totalDuration = calculateTotalDuration(root);
  lines.push(`╭${'─'.repeat(maxColumn * 3 + 50)}╮`);
  lines.push(`│ Git-Graph Execution Flow (${parsedLog.events.length} events, ${formatDuration(totalDuration)} total)`.padEnd(maxColumn * 3 + 51) + '│');
  lines.push(`├${'─'.repeat(maxColumn * 3 + 50)}┤`);
  
  // Legend
  lines.push(`│ ${symbols.BRANCH_START} Trigger Start  ${symbols.BRANCH_END} Trigger End  ${symbols.DML} DML  ${symbols.SOQL_RESULTS} SOQL(rows)  ${symbols.SOQL_EMPTY} SOQL(empty)  ${symbols.EXCEPTION} Error`.padEnd(maxColumn * 3 + 51) + '│');
  lines.push(`╰${'─'.repeat(maxColumn * 3 + 50)}╯`);
  lines.push('');

  // Render each commit
  let lineCount = lines.length;
  for (const commit of commits) {
    if (maxLines > 0 && lineCount >= maxLines) {
      lines.push(`... (truncated at ${maxLines} lines)`);
      break;
    }

    const line = renderGitGraphLine(commit, maxColumn, symbols, showTiming, showRowCounts);
    lines.push(line);
    lineCount++;
  }

  return lines.join('\n');
}

/**
 * Process a tree node into git-graph commits
 */
function processNodeForGitGraph(
  node: TreeNode,
  currentBranch: string,
  commits: GitCommit[],
  branches: Map<string, BranchState>,
  depth: number = 0
): void {
  // Skip END events for cleaner output
  if (node.type.includes('_END') || node.type.includes('_EXIT') || node.type.includes('_FINISHED')) {
    // But track branch merges for triggers
    if (node.isTrigger && node.type === 'CODE_UNIT_FINISHED') {
      const triggerBranch = branches.get(node.triggerName || '');
      if (triggerBranch) {
        commits.push({
          node,
          branch: currentBranch,
          column: triggerBranch.column,
          symbol: GIT_SYMBOLS.BRANCH_END,
          message: `← Merge ${node.triggerName}`,
          isBranchStart: false,
          isBranchEnd: true,
          activeBranches: getActiveBranchNames(branches),
        });
        triggerBranch.active = false;
      }
    }
    return;
  }

  // Determine symbol and message
  const { symbol, message } = getSymbolAndMessage(node);
  
  // Check if this creates a new branch (trigger start)
  let commitBranch = currentBranch;
  let column = branches.get(currentBranch)?.column ?? 0;
  let isBranchStart = false;
  let isBranchEnd = false;

  if (node.isTrigger && node.type === 'CODE_UNIT_STARTED') {
    // Create new branch for trigger
    const triggerName = node.triggerName || `trigger_${node.id}`;
    if (!branches.has(triggerName)) {
      const newColumn = branches.size;
      branches.set(triggerName, {
        name: triggerName,
        column: newColumn,
        active: true,
        startEventId: node.id,
      });
    }
    const branch = branches.get(triggerName);
    if (branch) {
      branch.active = true;
      commitBranch = triggerName;
      column = branch.column;
    }
    isBranchStart = true;
  }

  // Add commit
  commits.push({
    node,
    branch: commitBranch,
    column,
    symbol,
    message,
    isBranchStart,
    isBranchEnd,
    activeBranches: getActiveBranchNames(branches),
  });

  // Process children
  const childBranch = node.isTrigger && node.type === 'CODE_UNIT_STARTED' 
    ? (node.triggerName || currentBranch) 
    : currentBranch;
    
  for (const child of node.children) {
    processNodeForGitGraph(child, childBranch, commits, branches, depth + 1);
  }
}

/**
 * Get symbol and message for a node
 */
function getSymbolAndMessage(node: TreeNode): { symbol: string; message: string } {
  const s = GIT_SYMBOLS;
  
  switch (node.type) {
    case 'CODE_UNIT_STARTED':
      if (node.isTrigger) {
        return { symbol: s.BRANCH_START, message: `→ ${node.triggerName || node.name}` };
      }
      return { symbol: s.COMMIT, message: node.name };
      
    case 'DML_BEGIN':
      return { symbol: s.DML, message: `DML: ${node.name}` };
      
    case 'SOQL_EXECUTE_BEGIN':
      const soqlSymbol = (node.rowCount !== undefined && node.rowCount > 0) 
        ? s.SOQL_RESULTS 
        : s.SOQL_EMPTY;
      const rowInfo = node.rowCount !== undefined ? ` [${node.rowCount} rows]` : '';
      return { symbol: soqlSymbol, message: `SOQL: ${node.name.substring(0, 50)}${rowInfo}` };
      
    case 'EXCEPTION_THROWN':
    case 'FATAL_ERROR':
      return { symbol: s.EXCEPTION, message: `ERROR: ${node.name}` };
      
    case 'USER_DEBUG':
      return { symbol: s.DEBUG, message: `DEBUG: ${node.name.substring(0, 50)}` };
      
    case 'CALLOUT_REQUEST':
      return { symbol: s.CALLOUT, message: `CALLOUT: ${node.name}` };
      
    case 'FLOW_START_INTERVIEW_BEGIN':
    case 'FLOW_ELEMENT_BEGIN':
      return { symbol: s.FLOW, message: `FLOW: ${node.name}` };
      
    case 'METHOD_ENTRY':
      return { symbol: s.COMMIT, message: node.name };
      
    default:
      return { symbol: s.COMMIT, message: node.name };
  }
}

/**
 * Get active branch names
 */
function getActiveBranchNames(branches: Map<string, BranchState>): string[] {
  return Array.from(branches.entries())
    .filter(([_, b]) => b.active)
    .map(([name, _]) => name);
}

/**
 * Render a single git-graph line
 */
function renderGitGraphLine(
  commit: GitCommit,
  maxColumn: number,
  symbols: typeof GIT_SYMBOLS,
  showTiming: boolean,
  showRowCounts: boolean
): string {
  const parts: string[] = [];
  
  // Render branch lines up to this commit's column
  for (let col = 0; col <= maxColumn; col++) {
    if (col === commit.column) {
      // This is our commit
      parts.push(commit.symbol);
    } else if (commit.activeBranches.length > col) {
      // Active branch at this column
      if (commit.isBranchStart && col < commit.column) {
        // Show branch line connecting to new branch
        if (col === commit.column - 1) {
          parts.push(symbols.BRANCH);
        } else {
          parts.push(symbols.VERTICAL);
        }
      } else if (commit.isBranchEnd && col < commit.column) {
        // Show merge line
        if (col === commit.column - 1) {
          parts.push(symbols.MERGE_LINE);
        } else {
          parts.push(symbols.VERTICAL);
        }
      } else {
        parts.push(symbols.VERTICAL);
      }
    } else {
      parts.push(' ');
    }
    parts.push(' ');
  }

  // Add commit message
  let message = commit.message;
  
  // Add timing if requested
  if (showTiming && commit.node.durationMs > 0) {
    message += ` (${formatDuration(commit.node.durationMs)})`;
  }
  
  // Add row count for SOQL/DML if requested and not already in message
  if (showRowCounts && commit.node.rowCount !== undefined && !message.includes('rows')) {
    message += ` [${commit.node.rowCount} rows]`;
  }

  parts.push(symbols.HORIZONTAL);
  parts.push(symbols.HORIZONTAL);
  parts.push(' ');
  parts.push(message);

  return parts.join('');
}

// ============================================================================
// Enhanced Tree with Visual Differentiation
// ============================================================================

/**
 * Render tree with visual differentiation for SOQL (results/empty) and DML
 */
export function renderEnhancedTree(parsedLog: ParsedLog, options: TreeRenderOptions = {}): string {
  const {
    maxDepth = 0,
    showDuration = true,
    showPercentage = true,
    showProgressBar = true,
    progressBarWidth = 20,
    includeTypes = [],
    excludeTypes = [],
    minDurationMs = 0,
    maxLines = 500,
  } = options;

  const root = buildTreeFromEvents(parsedLog.events);
  if (!root) {
    return 'No events to display';
  }

  const totalDuration = calculateTotalDuration(root);
  const lines: string[] = [];

  renderEnhancedNode(root, '', true, 0);

  function renderEnhancedNode(node: TreeNode, prefix: string, isLast: boolean, depth: number): void {
    if (maxLines > 0 && lines.length >= maxLines) {
      if (lines.length === maxLines) {
        lines.push(`... (truncated at ${maxLines} lines)`);
      }
      return;
    }

    if (maxDepth > 0 && depth > maxDepth) return;
    if (includeTypes.length > 0 && !includeTypes.includes(node.type)) return;
    if (excludeTypes.includes(node.type)) return;
    if (minDurationMs > 0 && node.durationMs < minDurationMs) return;

    const connector = depth === 0 ? '' : (isLast ? '└── ' : '├── ');
    
    // Get enhanced node display with visual indicators
    const nodeDisplay = getEnhancedNodeDisplay(node);
    
    // Add duration info
    let durationInfo = '';
    if (showDuration && node.durationMs > 0) {
      const percentage = totalDuration > 0 ? (node.durationMs / totalDuration * 100) : 0;
      durationInfo = ` [${formatDuration(node.durationMs)}`;
      if (showPercentage) {
        durationInfo += `|${percentage.toFixed(0)}%`;
      }
      durationInfo += ']';
      
      if (showProgressBar) {
        durationInfo += ' ' + renderProgressBar(percentage, progressBarWidth);
      }
    }

    lines.push(prefix + connector + nodeDisplay + durationInfo);

    // Render children
    const childPrefix = depth === 0 ? '' : prefix + (isLast ? '    ' : '│   ');
    const visibleChildren = node.children.filter(child => {
      if (includeTypes.length > 0 && !includeTypes.includes(child.type)) return false;
      if (excludeTypes.includes(child.type)) return false;
      if (minDurationMs > 0 && child.durationMs < minDurationMs) return false;
      return true;
    });

    for (let i = 0; i < visibleChildren.length; i++) {
      const child = visibleChildren[i];
      if (child) {
        renderEnhancedNode(child, childPrefix, i === visibleChildren.length - 1, depth + 1);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Get enhanced display for a node with visual indicators
 */
function getEnhancedNodeDisplay(node: TreeNode): string {
  const s = GIT_SYMBOLS;
  
  switch (node.type) {
    case 'CODE_UNIT_STARTED':
      if (node.isTrigger) {
        return `${s.BRANCH_START} TRIGGER_START ${node.triggerName || node.name}`;
      }
      return `${s.COMMIT} CODE_UNIT ${node.name}`;
      
    case 'CODE_UNIT_FINISHED':
      if (node.isTrigger) {
        return `${s.BRANCH_END} TRIGGER_END ${node.triggerName || node.name}`;
      }
      return `${s.MERGE} CODE_UNIT_END`;
      
    case 'DML_BEGIN':
      const dmlRowInfo = node.rowCount !== undefined ? ` [${node.rowCount} rows]` : '';
      return `${s.DML} DML ${node.name}${dmlRowInfo}`;
      
    case 'DML_END':
      return `${s.DML} DML_END`;
      
    case 'SOQL_EXECUTE_BEGIN':
      const hasResults = node.rowCount !== undefined && node.rowCount > 0;
      const soqlSymbol = hasResults ? s.SOQL_RESULTS : s.SOQL_EMPTY;
      const rowLabel = node.rowCount !== undefined 
        ? (hasResults ? ` [${node.rowCount} rows]` : ' [0 rows]')
        : '';
      return `${soqlSymbol} SOQL${rowLabel} ${node.name}`;
      
    case 'SOQL_EXECUTE_END':
      return `${s.SOQL_RESULTS} SOQL_END`;
      
    case 'EXCEPTION_THROWN':
    case 'FATAL_ERROR':
      return `${s.EXCEPTION} ${node.type} ${node.name}`;
      
    case 'USER_DEBUG':
      return `${s.DEBUG} DEBUG ${node.name}`;
      
    case 'CALLOUT_REQUEST':
    case 'CALLOUT_RESPONSE':
      return `${s.CALLOUT} ${formatNodeType(node.type)} ${node.name}`;
      
    case 'FLOW_START_INTERVIEW_BEGIN':
    case 'FLOW_ELEMENT_BEGIN':
      return `${s.FLOW} ${formatNodeType(node.type)} ${node.name}`;
      
    case 'METHOD_ENTRY':
      return `${s.COMMIT} METHOD ${node.name}`;
      
    case 'METHOD_EXIT':
      return `${s.COMMIT} METHOD_END ${node.name}`;
      
    default:
      return `${s.COMMIT} ${formatNodeType(node.type)} ${node.name !== node.type ? node.name : ''}`;
  }
}
