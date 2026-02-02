/**
 * @module analyzer/categorizer
 * @description Categorizes and prioritizes detected issues for AI consumption
 * @status COMPLETE
 * @see src/analyzer/STATE.md
 * @dependencies src/types/issues.ts
 * @lastModified 2026-01-31
 */

import type {
  Issue,
  IssueCategory,
  IssueSeverity,
  IssueDetectionResult,
  IssueSummary,
} from '../types/issues';

// ============================================================================
// Issue Categorization
// ============================================================================

/**
 * Categorize and prioritize detected issues
 * 
 * This function:
 * 1. Groups issues by category and severity
 * 2. Calculates an overall health score
 * 3. Generates AI-friendly summary
 * 4. Prioritizes issues for presentation
 */
export function categorizeIssues(issues: Issue[]): IssueDetectionResult {
  // Group by category
  const byCategory = groupByCategory(issues);
  
  // Group by severity
  const bySeverity = groupBySeverity(issues);
  
  // Calculate health score
  const healthScore = calculateHealthScore(issues);
  
  // Generate summary
  const summary = generateSummary(issues, healthScore);
  
  // Sort issues by priority
  const sortedIssues = prioritizeIssues(issues);
  
  return {
    issues: sortedIssues,
    byCategory,
    bySeverity,
    summary,
  };
}

// ============================================================================
// Grouping Functions
// ============================================================================

/**
 * Group issues by category
 */
function groupByCategory(issues: Issue[]): Record<IssueCategory, Issue[]> {
  const result: Record<IssueCategory, Issue[]> = {
    PERFORMANCE: [],
    GOVERNOR_LIMITS: [],
    ERROR: [],
    ANTI_PATTERN: [],
    SECURITY: [],
    DATA_QUALITY: [],
    BEST_PRACTICE: [],
    MANAGED_PACKAGE: [],
  };
  
  for (const issue of issues) {
    result[issue.category].push(issue);
  }
  
  return result;
}

/**
 * Group issues by severity
 */
function groupBySeverity(issues: Issue[]): Record<IssueSeverity, Issue[]> {
  const result: Record<IssueSeverity, Issue[]> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
    INFO: [],
  };
  
  for (const issue of issues) {
    result[issue.severity].push(issue);
  }
  
  return result;
}

// ============================================================================
// Health Score Calculation
// ============================================================================

/**
 * Calculate overall health score (0-100)
 * 
 * Scoring logic:
 * - Start at 100
 * - Deduct points for each issue based on severity
 * - Weight critical issues heavily
 * - Floor at 0
 */
function calculateHealthScore(issues: Issue[]): number {
  if (issues.length === 0) return 100;
  
  let score = 100;
  
  // Severity-based deductions
  const deductions: Record<IssueSeverity, number> = {
    CRITICAL: 25,
    HIGH: 15,
    MEDIUM: 8,
    LOW: 3,
    INFO: 0,
  };
  
  for (const issue of issues) {
    // Base deduction
    let deduction = deductions[issue.severity];
    
    // Weight by confidence
    deduction *= issue.confidence.score;
    
    // Apply diminishing returns for multiple issues of same type
    const sameTypePrevious = issues.filter(
      i => i.type === issue.type && issues.indexOf(i) < issues.indexOf(issue)
    ).length;
    deduction *= Math.pow(0.7, sameTypePrevious);
    
    score -= deduction;
  }
  
  // Floor at 0, cap at 100
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ============================================================================
// Summary Generation
// ============================================================================

/**
 * Generate AI-friendly summary
 */
function generateSummary(issues: Issue[], healthScore: number): IssueSummary {
  // Count by severity
  const bySeverity: Record<IssueSeverity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  
  // Count by category
  const byCategory: Record<IssueCategory, number> = {
    PERFORMANCE: 0,
    GOVERNOR_LIMITS: 0,
    ERROR: 0,
    ANTI_PATTERN: 0,
    SECURITY: 0,
    DATA_QUALITY: 0,
    BEST_PRACTICE: 0,
    MANAGED_PACKAGE: 0,
  };
  
  for (const issue of issues) {
    bySeverity[issue.severity]++;
    byCategory[issue.category]++;
  }
  
  // Get top 3 issues
  const topIssues = prioritizeIssues(issues)
    .slice(0, 3)
    .map(issue => ({
      id: issue.id,
      type: issue.type,
      title: issue.title,
      severity: issue.severity,
    }));
  
  // Generate one-liner
  const oneLiner = generateOneLiner(issues, healthScore, bySeverity, byCategory);
  
  return {
    totalCount: issues.length,
    bySeverity,
    byCategory,
    topIssues,
    healthScore,
    oneLiner,
  };
}

/**
 * Generate a one-line summary for AI
 */
function generateOneLiner(
  issues: Issue[],
  healthScore: number,
  bySeverity: Record<IssueSeverity, number>,
  byCategory: Record<IssueCategory, number>
): string {
  if (issues.length === 0) {
    return 'No issues detected. Log appears healthy.';
  }
  
  const parts: string[] = [];
  
  // Health status
  if (healthScore >= 80) {
    parts.push('Mostly healthy');
  } else if (healthScore >= 60) {
    parts.push('Some concerns');
  } else if (healthScore >= 40) {
    parts.push('Significant issues');
  } else {
    parts.push('Critical problems');
  }
  
  // Issue counts
  const criticalHigh = bySeverity.CRITICAL + bySeverity.HIGH;
  if (criticalHigh > 0) {
    parts.push(`${criticalHigh} critical/high priority issue${criticalHigh > 1 ? 's' : ''}`);
  }
  
  // Top category
  const topCategory = Object.entries(byCategory)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    [0];
  
  if (topCategory) {
    parts.push(`primary: ${formatCategory(topCategory[0] as IssueCategory)}`);
  }
  
  return parts.join(' - ');
}

/**
 * Format category for display
 */
function formatCategory(category: IssueCategory): string {
  const names: Record<IssueCategory, string> = {
    PERFORMANCE: 'performance',
    GOVERNOR_LIMITS: 'governor limits',
    ERROR: 'errors',
    ANTI_PATTERN: 'anti-patterns',
    SECURITY: 'security',
    DATA_QUALITY: 'data quality',
    BEST_PRACTICE: 'best practices',
    MANAGED_PACKAGE: 'managed packages',
  };
  return names[category];
}

// ============================================================================
// Issue Prioritization
// ============================================================================

/**
 * Prioritize issues for presentation
 * 
 * Priority order:
 * 1. Severity (CRITICAL > HIGH > MEDIUM > LOW > INFO)
 * 2. Can modify (user code > managed package)
 * 3. Confidence score
 * 4. Impact (based on metrics)
 */
function prioritizeIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    // 1. Severity
    const severityOrder: Record<IssueSeverity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      INFO: 4,
    };
    
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    
    // 2. Can modify
    const aCanModify = a.attribution.canModify ? 0 : 1;
    const bCanModify = b.attribution.canModify ? 0 : 1;
    if (aCanModify !== bCanModify) return aCanModify - bCanModify;
    
    // 3. Confidence
    const confidenceDiff = b.confidence.score - a.confidence.score;
    if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
    
    // 4. Impact (use limit percentage or occurrences)
    const aImpact = a.aiContext?.metrics?.limitPercentage || a.aiContext?.metrics?.occurrences || 0;
    const bImpact = b.aiContext?.metrics?.limitPercentage || b.aiContext?.metrics?.occurrences || 0;
    return bImpact - aImpact;
  });
}

// ============================================================================
// Additional Categorization Utilities
// ============================================================================

/**
 * Filter issues by minimum severity
 */
export function filterBySeverity(issues: Issue[], minSeverity: IssueSeverity): Issue[] {
  const severityOrder: Record<IssueSeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
    INFO: 4,
  };
  
  const minOrder = severityOrder[minSeverity];
  return issues.filter(issue => severityOrder[issue.severity] <= minOrder);
}

/**
 * Filter to only fixable issues (user code)
 */
export function filterFixable(issues: Issue[]): Issue[] {
  return issues.filter(issue => issue.attribution.canModify);
}

/**
 * Get issues for a specific category
 */
export function getByCategory(issues: Issue[], category: IssueCategory): Issue[] {
  return issues.filter(issue => issue.category === category);
}

/**
 * Deduplicate issues by type, keeping the highest severity
 */
export function deduplicateByType(issues: Issue[]): Issue[] {
  const byType = new Map<string, Issue>();
  
  const severityRank: Record<IssueSeverity, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFO: 1,
  };
  
  for (const issue of issues) {
    const existing = byType.get(issue.type);
    if (!existing || severityRank[issue.severity] > severityRank[existing.severity]) {
      byType.set(issue.type, issue);
    }
  }
  
  return Array.from(byType.values());
}

/**
 * Create a compact summary for token-constrained contexts
 */
export function createCompactSummary(result: IssueDetectionResult): CompactSummary {
  const { summary } = result;
  
  return {
    health: summary.healthScore,
    total: summary.totalCount,
    critical: summary.bySeverity.CRITICAL,
    high: summary.bySeverity.HIGH,
    top: summary.topIssues.map(i => ({
      type: i.type,
      severity: i.severity ? i.severity[0] as string : 'U', // First letter only
    })),
    oneLiner: summary.oneLiner,
  };
}

export interface CompactSummary {
  health: number;
  total: number;
  critical: number;
  high: number;
  top: { type: string; severity: string }[];
  oneLiner: string;
}

/**
 * Generate AI guidance for all issues
 */
export function generateAIGuidance(result: IssueDetectionResult): string {
  const { summary, issues } = result;
  
  const lines: string[] = [];
  
  // Overall assessment
  lines.push(`## Analysis Summary`);
  lines.push(summary.oneLiner);
  lines.push(`Health Score: ${summary.healthScore}/100`);
  lines.push('');
  
  // Critical issues first
  if (summary.bySeverity.CRITICAL > 0) {
    lines.push(`### ⛔ Critical Issues (${summary.bySeverity.CRITICAL})`);
    for (const issue of issues.filter(i => i.severity === 'CRITICAL')) {
      lines.push(`- **${issue.title}**: ${issue.attribution.aiGuidance}`);
    }
    lines.push('');
  }
  
  // High priority
  if (summary.bySeverity.HIGH > 0) {
    lines.push(`### 🔴 High Priority (${summary.bySeverity.HIGH})`);
    for (const issue of issues.filter(i => i.severity === 'HIGH').slice(0, 5)) {
      lines.push(`- **${issue.title}**`);
    }
    lines.push('');
  }
  
  // Recommendations
  lines.push(`### Recommendations`);
  const allRecommendations = issues
    .filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH')
    .flatMap(i => i.recommendations)
    .slice(0, 5);
  
  for (const rec of [...new Set(allRecommendations)]) {
    lines.push(`- ${rec}`);
  }
  
  return lines.join('\n');
}

// Note: Default export removed per CONVENTIONS.md
// Use named import: import { categorizeIssues } from './categorizer'
