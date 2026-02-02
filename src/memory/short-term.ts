/**
 * @module memory/short-term
 * @description Current session context management
 * @status COMPLETE
 * @see src/memory/STATE.md
 * @dependencies src/types/memory.ts
 * @lastModified 2026-01-31
 */

import type {
  SessionContext,
  CachedAnalysis,
} from '../types/memory';

// ============================================================================
// Session Context Manager
// ============================================================================

/**
 * Short-term context manager for current debugging session
 */
export class ShortTermCache {
  private context: SessionContext | null;
  private analysisCache: Map<string, CachedAnalysis>;
  private maxCacheEntries: number;
  private defaultTTL: number;

  constructor(options: { maxCacheEntries?: number; defaultTTL?: number } = {}) {
    this.context = null;
    this.analysisCache = new Map();
    this.maxCacheEntries = options.maxCacheEntries ?? 100;
    this.defaultTTL = options.defaultTTL ?? 3600000; // 1 hour
  }

  // ============================================================================
  // Session Context
  // ============================================================================

  /**
   * Start a new session
   */
  startSession(sessionId?: string): SessionContext {
    this.context = {
      sessionId: sessionId ?? `session-${Date.now()}`,
      loadedLogs: [],
      recentQueries: [],
      conversationContext: {
        recentTopics: [],
        pendingQuestions: [],
        suggestedNextSteps: [],
      },
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    return this.context;
  }

  /**
   * Get current session context
   */
  getContext(): SessionContext | null {
    return this.context;
  }

  /**
   * Check if session is active
   */
  hasActiveSession(): boolean {
    return this.context !== null;
  }

  /**
   * Update last activity time
   */
  touch(): void {
    if (this.context) {
      this.context.lastActivityAt = new Date();
    }
  }

  /**
   * Set org info
   */
  setOrgInfo(info: {
    orgIdHash: string;
    instanceUrl: string;
    apiVersion: string;
  }): void {
    if (this.context) {
      this.context.orgInfo = info;
      this.touch();
    }
  }

  /**
   * Record loaded log
   */
  recordLoadedLog(log: {
    logId: string;
    issueCount: number;
    eventCount: number;
  }): void {
    if (!this.context) return;

    // Remove if already exists (update)
    this.context.loadedLogs = this.context.loadedLogs.filter(
      (l) => l.logId !== log.logId
    );

    this.context.loadedLogs.push({
      ...log,
      parsedAt: new Date(),
    });

    // Keep only recent logs
    if (this.context.loadedLogs.length > 10) {
      this.context.loadedLogs = this.context.loadedLogs.slice(-10);
    }

    this.touch();
  }

  /**
   * Set focus issue
   */
  setFocusIssue(issue: {
    issueCode: string;
    severity: string;
    context: string;
  }): void {
    if (this.context) {
      this.context.focusIssue = issue;
      this.touch();
    }
  }

  /**
   * Clear focus issue
   */
  clearFocusIssue(): void {
    if (this.context) {
      this.context.focusIssue = undefined;
      this.touch();
    }
  }

  /**
   * Record a query
   */
  recordQuery(query: string, resultCount: number): void {
    if (!this.context) return;

    this.context.recentQueries.push({
      query,
      timestamp: new Date(),
      resultCount,
    });

    // Keep only recent queries
    if (this.context.recentQueries.length > 20) {
      this.context.recentQueries = this.context.recentQueries.slice(-20);
    }

    this.touch();
  }

  /**
   * Add topic to conversation context
   */
  addTopic(topic: string): void {
    if (!this.context) return;

    const topics = this.context.conversationContext.recentTopics;
    if (!topics.includes(topic)) {
      topics.push(topic);
      // Keep only recent topics
      if (topics.length > 10) {
        topics.shift();
      }
    }

    this.touch();
  }

  /**
   * Add pending question
   */
  addPendingQuestion(question: string): void {
    if (!this.context) return;

    const questions = this.context.conversationContext.pendingQuestions;
    if (!questions.includes(question)) {
      questions.push(question);
    }

    this.touch();
  }

  /**
   * Remove pending question
   */
  removePendingQuestion(question: string): void {
    if (!this.context) return;

    this.context.conversationContext.pendingQuestions =
      this.context.conversationContext.pendingQuestions.filter(
        (q) => q !== question
      );

    this.touch();
  }

  /**
   * Set suggested next steps
   */
  setSuggestedNextSteps(steps: string[]): void {
    if (this.context) {
      this.context.conversationContext.suggestedNextSteps = steps;
      this.touch();
    }
  }

  /**
   * Get session summary for AI context
   */
  getSessionSummary(): string {
    if (!this.context) return 'No active session';

    const parts: string[] = [];

    parts.push(`Session: ${this.context.sessionId}`);
    parts.push(`Duration: ${this.getSessionDuration()}`);

    if (this.context.orgInfo) {
      parts.push(`Org: ${this.context.orgInfo.instanceUrl}`);
    }

    if (this.context.loadedLogs.length > 0) {
      parts.push(`Logs analyzed: ${this.context.loadedLogs.length}`);
      const totalIssues = this.context.loadedLogs.reduce(
        (sum, l) => sum + l.issueCount,
        0
      );
      parts.push(`Total issues found: ${totalIssues}`);
    }

    if (this.context.focusIssue) {
      parts.push(`Current focus: ${this.context.focusIssue.issueCode}`);
    }

    if (this.context.conversationContext.recentTopics.length > 0) {
      parts.push(
        `Topics discussed: ${this.context.conversationContext.recentTopics.join(', ')}`
      );
    }

    return parts.join('\n');
  }

  /**
   * Get session duration in human-readable format
   */
  getSessionDuration(): string {
    if (!this.context) return 'N/A';

    const ms = Date.now() - this.context.startedAt.getTime();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * End current session
   */
  endSession(): SessionContext | null {
    const session = this.context;
    this.context = null;
    return session;
  }

  // ============================================================================
  // Analysis Cache
  // ============================================================================

  /**
   * Get cached analysis
   */
  getCachedAnalysis(logId: string): CachedAnalysis | null {
    const cached = this.analysisCache.get(logId);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.cachedAt.getTime() > cached.ttl) {
      this.analysisCache.delete(logId);
      return null;
    }

    return cached;
  }

  /**
   * Cache analysis result
   */
  cacheAnalysis(analysis: Omit<CachedAnalysis, 'cachedAt'>): void {
    const entry: CachedAnalysis = {
      ...analysis,
      cachedAt: new Date(),
      ttl: analysis.ttl ?? this.defaultTTL,
    };

    this.analysisCache.set(analysis.logId, entry);

    // Enforce max entries
    this.enforceMaxCacheEntries();
  }

  /**
   * Invalidate cached analysis
   */
  invalidateCache(logId: string): boolean {
    return this.analysisCache.delete(logId);
  }

  /**
   * Invalidate all cached analyses
   */
  invalidateAllCache(): void {
    this.analysisCache.clear();
  }

  /**
   * Enforce maximum cache entries
   */
  private enforceMaxCacheEntries(): void {
    if (this.analysisCache.size <= this.maxCacheEntries) return;

    // Remove oldest entries
    const entries = Array.from(this.analysisCache.entries()).sort(
      (a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime()
    );

    const toRemove = entries.slice(0, this.analysisCache.size - this.maxCacheEntries);
    for (const [key] of toRemove) {
      this.analysisCache.delete(key);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    entries: number;
    hitRate: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    const entries = Array.from(this.analysisCache.values());

    if (entries.length === 0) {
      return {
        entries: 0,
        hitRate: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }

    const sorted = entries.sort(
      (a, b) => a.cachedAt.getTime() - b.cachedAt.getTime()
    );

    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];

    return {
      entries: entries.length,
      hitRate: 0, // Would need tracking to compute
      oldestEntry: oldest?.cachedAt ?? new Date(),
      newestEntry: newest?.cachedAt ?? new Date(),
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clear all short-term data
   */
  clear(): void {
    this.context = null;
    this.analysisCache.clear();
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, cached] of this.analysisCache) {
      if (now - cached.cachedAt.getTime() > cached.ttl) {
        this.analysisCache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a short-term cache instance
 */
export function createShortTermCache(options?: {
  maxCacheEntries?: number;
  defaultTTL?: number;
}): ShortTermCache {
  return new ShortTermCache(options);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance: ShortTermCache | null = null;

/**
 * Get the short-term cache singleton
 */
export function getShortTermCache(): ShortTermCache {
  if (!_instance) {
    _instance = new ShortTermCache();
  }
  return _instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetShortTermCache(): void {
  _instance = null;
}
