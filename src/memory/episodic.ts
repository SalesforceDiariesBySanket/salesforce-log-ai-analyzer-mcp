/**
 * @module memory/episodic
 * @description Session history storage with debugging outcomes
 * @status COMPLETE
 * @see src/memory/STATE.md
 * @dependencies src/types/memory.ts
 * @lastModified 2026-01-31
 */

import type {
  DebuggingEpisode,
  SolutionRecord,
  SessionOutcome,
  EpisodeSearchCriteria,
  StorageProvider,
} from '../types/memory';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique episode ID
 */
function generateEpisodeId(): string {
  return `ep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique solution ID
 */
function generateSolutionId(): string {
  return `sol-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hash a string for privacy (simple hash, not cryptographic)
 */
export function hashForPrivacy(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16).padStart(8, '0');
}

// ============================================================================
// Episodic Memory Store
// ============================================================================

/**
 * Episodic memory store for debugging sessions
 */
export class EpisodicStore {
  private episodes: Map<string, DebuggingEpisode>;
  private solutions: Map<string, SolutionRecord>;
  private storage: StorageProvider | null;
  private maxEpisodes: number;
  private retentionDays: number;

  // Indexes for fast lookup
  private outcomeIndex: Map<SessionOutcome, Set<string>>;
  private issueIndex: Map<string, Set<string>>;
  private solutionIssueIndex: Map<string, Set<string>>;

  constructor(
    storage: StorageProvider | null = null,
    options: { maxEpisodes?: number; retentionDays?: number } = {}
  ) {
    this.episodes = new Map();
    this.solutions = new Map();
    this.storage = storage;
    this.maxEpisodes = options.maxEpisodes ?? 1000;
    this.retentionDays = options.retentionDays ?? 90;

    this.outcomeIndex = new Map();
    this.issueIndex = new Map();
    this.solutionIssueIndex = new Map();
  }

  /**
   * Initialize from storage
   */
  async initialize(): Promise<void> {
    if (!this.storage) return;

    // Load episodes
    const episodeKeys = await this.storage.keys('episode:*');
    for (const key of episodeKeys) {
      const episode = await this.storage.get<DebuggingEpisode>(key);
      if (episode) {
        this.addEpisodeToMemory(episode);
      }
    }

    // Load solutions
    const solutionKeys = await this.storage.keys('solution:*');
    for (const key of solutionKeys) {
      const solution = await this.storage.get<SolutionRecord>(key);
      if (solution) {
        this.addSolutionToMemory(solution);
      }
    }

    // Clean up old episodes
    await this.cleanupOldEpisodes();
  }

  // ============================================================================
  // Episode Management
  // ============================================================================

  /**
   * Add episode to in-memory indexes
   */
  private addEpisodeToMemory(episode: DebuggingEpisode): void {
    this.episodes.set(episode.sessionId, episode);

    // Index by outcome
    const outcomeSet = this.outcomeIndex.get(episode.outcome) ?? new Set();
    outcomeSet.add(episode.sessionId);
    this.outcomeIndex.set(episode.outcome, outcomeSet);

    // Index by issues
    for (const issue of episode.issuesSeen) {
      const issueSet = this.issueIndex.get(issue) ?? new Set();
      issueSet.add(episode.sessionId);
      this.issueIndex.set(issue, issueSet);
    }
  }

  /**
   * Create a new debugging episode
   */
  async createEpisode(
    orgId: string,
    userId: string,
    options: { tags?: string[] } = {}
  ): Promise<DebuggingEpisode> {
    const episode: DebuggingEpisode = {
      sessionId: generateEpisodeId(),
      startedAt: new Date(),
      orgIdHash: hashForPrivacy(orgId),
      userIdHash: hashForPrivacy(userId),
      issuesSeen: [],
      solutionsAttempted: [],
      outcome: 'UNKNOWN',
      tags: options.tags ?? [],
    };

    this.addEpisodeToMemory(episode);

    if (this.storage) {
      await this.storage.set(`episode:${episode.sessionId}`, episode);
    }

    // Enforce max episodes
    await this.enforceMaxEpisodes();

    return episode;
  }

  /**
   * Get episode by ID
   */
  getEpisode(sessionId: string): DebuggingEpisode | undefined {
    return this.episodes.get(sessionId);
  }

  /**
   * Update episode with new issues
   */
  async addIssuesToEpisode(sessionId: string, issues: string[]): Promise<void> {
    const episode = this.episodes.get(sessionId);
    if (!episode) return;

    for (const issue of issues) {
      if (!episode.issuesSeen.includes(issue)) {
        episode.issuesSeen.push(issue);

        // Update index
        const issueSet = this.issueIndex.get(issue) ?? new Set();
        issueSet.add(sessionId);
        this.issueIndex.set(issue, issueSet);
      }
    }

    if (this.storage) {
      await this.storage.set(`episode:${sessionId}`, episode);
    }
  }

  /**
   * Record a solution attempt
   */
  async addSolutionAttempt(sessionId: string, solutionId: string): Promise<void> {
    const episode = this.episodes.get(sessionId);
    if (!episode) return;

    if (!episode.solutionsAttempted.includes(solutionId)) {
      episode.solutionsAttempted.push(solutionId);

      if (this.storage) {
        await this.storage.set(`episode:${sessionId}`, episode);
      }
    }
  }

  /**
   * Complete an episode with outcome
   */
  async completeEpisode(
    sessionId: string,
    outcome: SessionOutcome,
    feedback?: { helpful: boolean; rating?: number; comment?: string }
  ): Promise<void> {
    const episode = this.episodes.get(sessionId);
    if (!episode) return;

    // Update outcome index
    const oldOutcomeSet = this.outcomeIndex.get(episode.outcome);
    oldOutcomeSet?.delete(sessionId);

    episode.outcome = outcome;
    episode.endedAt = new Date();
    episode.feedback = feedback;

    const newOutcomeSet = this.outcomeIndex.get(outcome) ?? new Set();
    newOutcomeSet.add(sessionId);
    this.outcomeIndex.set(outcome, newOutcomeSet);

    if (this.storage) {
      await this.storage.set(`episode:${sessionId}`, episode);
    }

    // Update solution success rates based on outcome
    if (outcome === 'RESOLVED' || outcome === 'PARTIALLY_RESOLVED') {
      for (const solutionId of episode.solutionsAttempted) {
        await this.recordSolutionSuccess(solutionId, outcome === 'RESOLVED');
      }
    }
  }

  /**
   * Search episodes by criteria
   */
  searchEpisodes(criteria: EpisodeSearchCriteria): DebuggingEpisode[] {
    let candidateIds = new Set<string>();
    let first = true;

    // Filter by issue types
    if (criteria.issueTypes && criteria.issueTypes.length > 0) {
      const matchingIds = new Set<string>();
      for (const issue of criteria.issueTypes) {
        const issueSet = this.issueIndex.get(issue);
        if (issueSet) {
          for (const id of issueSet) {
            matchingIds.add(id);
          }
        }
      }
      if (first) {
        candidateIds = matchingIds;
        first = false;
      } else {
        candidateIds = new Set([...candidateIds].filter((id) => matchingIds.has(id)));
      }
    }

    // Filter by outcomes
    if (criteria.outcomes && criteria.outcomes.length > 0) {
      const matchingIds = new Set<string>();
      for (const outcome of criteria.outcomes) {
        const outcomeSet = this.outcomeIndex.get(outcome);
        if (outcomeSet) {
          for (const id of outcomeSet) {
            matchingIds.add(id);
          }
        }
      }
      if (first) {
        candidateIds = matchingIds;
        first = false;
      } else {
        candidateIds = new Set([...candidateIds].filter((id) => matchingIds.has(id)));
      }
    }

    // If no filters applied, use all episodes
    if (first) {
      candidateIds = new Set(this.episodes.keys());
    }

    // Get and filter episodes
    let results = Array.from(candidateIds)
      .map((id) => this.episodes.get(id)!)
      .filter(Boolean);

    // Filter by date range
    if (criteria.dateRange) {
      results = results.filter((ep) => {
        const start = criteria.dateRange!.start;
        const end = criteria.dateRange!.end;
        return ep.startedAt >= start && ep.startedAt <= end;
      });
    }

    // Filter by tags
    if (criteria.tags && criteria.tags.length > 0) {
      results = results.filter((ep) =>
        criteria.tags!.some((tag) => ep.tags.includes(tag))
      );
    }

    // Sort by start date descending (most recent first)
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Apply limit
    if (criteria.limit) {
      results = results.slice(0, criteria.limit);
    }

    return results;
  }

  /**
   * Get episodes with similar issues
   */
  getSimilarEpisodes(issues: string[], limit: number = 5): DebuggingEpisode[] {
    // Find episodes with overlapping issues
    const episodeScores = new Map<string, number>();

    for (const issue of issues) {
      const issueSet = this.issueIndex.get(issue);
      if (issueSet) {
        for (const id of issueSet) {
          episodeScores.set(id, (episodeScores.get(id) ?? 0) + 1);
        }
      }
    }

    // Sort by score
    const sortedIds = Array.from(episodeScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    return sortedIds.map((id) => this.episodes.get(id)!).filter(Boolean);
  }

  // ============================================================================
  // Solution Management
  // ============================================================================

  /**
   * Add solution to in-memory indexes
   */
  private addSolutionToMemory(solution: SolutionRecord): void {
    this.solutions.set(solution.id, solution);

    // Index by issue type
    const issueSet = this.solutionIssueIndex.get(solution.issueType) ?? new Set();
    issueSet.add(solution.id);
    this.solutionIssueIndex.set(solution.issueType, issueSet);
  }

  /**
   * Create a new solution record
   */
  async createSolution(
    issueType: string,
    title: string,
    steps: string[],
    options: {
      codeChanges?: { file: string; before: string; after: string }[];
      source?: 'AI_GENERATED' | 'USER_PROVIDED' | 'LEARNED';
    } = {}
  ): Promise<SolutionRecord> {
    const solution: SolutionRecord = {
      id: generateSolutionId(),
      issueType,
      title,
      steps,
      codeChanges: options.codeChanges,
      successCount: 0,
      failureCount: 0,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      source: options.source ?? 'LEARNED',
    };

    this.addSolutionToMemory(solution);

    if (this.storage) {
      await this.storage.set(`solution:${solution.id}`, solution);
    }

    return solution;
  }

  /**
   * Get solution by ID
   */
  getSolution(id: string): SolutionRecord | undefined {
    return this.solutions.get(id);
  }

  /**
   * Get solutions for an issue type
   */
  getSolutionsForIssue(issueType: string): SolutionRecord[] {
    const ids = this.solutionIssueIndex.get(issueType);
    if (!ids) return [];

    return Array.from(ids)
      .map((id) => this.solutions.get(id)!)
      .filter(Boolean)
      .sort((a, b) => {
        // Sort by success rate
        const rateA = a.successCount / Math.max(a.successCount + a.failureCount, 1);
        const rateB = b.successCount / Math.max(b.successCount + b.failureCount, 1);
        return rateB - rateA;
      });
  }

  /**
   * Record solution success/failure
   */
  async recordSolutionSuccess(solutionId: string, success: boolean): Promise<void> {
    const solution = this.solutions.get(solutionId);
    if (!solution) return;

    if (success) {
      solution.successCount++;
    } else {
      solution.failureCount++;
    }
    solution.lastUsedAt = new Date();

    if (this.storage) {
      await this.storage.set(`solution:${solutionId}`, solution);
    }
  }

  /**
   * Get top solutions by success rate
   */
  getTopSolutions(
    options: { minUsage?: number; limit?: number } = {}
  ): SolutionRecord[] {
    const { minUsage = 3, limit = 10 } = options;

    return Array.from(this.solutions.values())
      .filter((s) => s.successCount + s.failureCount >= minUsage)
      .map((s) => ({
        solution: s,
        successRate: s.successCount / (s.successCount + s.failureCount),
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit)
      .map((item) => item.solution);
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  /**
   * Cleanup old episodes
   */
  async cleanupOldEpisodes(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);

    let removed = 0;

    for (const [id, episode] of this.episodes) {
      if (episode.startedAt < cutoff) {
        await this.removeEpisode(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Remove a single episode
   */
  private async removeEpisode(sessionId: string): Promise<void> {
    const episode = this.episodes.get(sessionId);
    if (!episode) return;

    // Remove from indexes
    const outcomeSet = this.outcomeIndex.get(episode.outcome);
    outcomeSet?.delete(sessionId);

    for (const issue of episode.issuesSeen) {
      const issueSet = this.issueIndex.get(issue);
      issueSet?.delete(sessionId);
    }

    this.episodes.delete(sessionId);

    if (this.storage) {
      await this.storage.delete(`episode:${sessionId}`);
    }
  }

  /**
   * Enforce maximum episodes limit
   */
  private async enforceMaxEpisodes(): Promise<void> {
    if (this.episodes.size <= this.maxEpisodes) return;

    // Get oldest episodes
    const sorted = Array.from(this.episodes.values()).sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
    );

    const toRemove = sorted.slice(0, this.episodes.size - this.maxEpisodes);

    for (const episode of toRemove) {
      await this.removeEpisode(episode.sessionId);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    episodeCount: number;
    solutionCount: number;
    outcomeDistribution: Record<SessionOutcome, number>;
    averageEpisodeDuration: number;
  } {
    const outcomeDistribution: Record<SessionOutcome, number> = {
      RESOLVED: 0,
      PARTIALLY_RESOLVED: 0,
      WORKAROUND_APPLIED: 0,
      ESCALATED: 0,
      ABANDONED: 0,
      UNKNOWN: 0,
    };

    let totalDuration = 0;
    let completedCount = 0;

    for (const episode of this.episodes.values()) {
      outcomeDistribution[episode.outcome]++;

      if (episode.endedAt) {
        totalDuration += episode.endedAt.getTime() - episode.startedAt.getTime();
        completedCount++;
      }
    }

    return {
      episodeCount: this.episodes.size,
      solutionCount: this.solutions.size,
      outcomeDistribution,
      averageEpisodeDuration:
        completedCount > 0 ? totalDuration / completedCount : 0,
    };
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    this.episodes.clear();
    this.solutions.clear();
    this.outcomeIndex.clear();
    this.issueIndex.clear();
    this.solutionIssueIndex.clear();

    if (this.storage) {
      const keys = [
        ...(await this.storage.keys('episode:*')),
        ...(await this.storage.keys('solution:*')),
      ];
      for (const key of keys) {
        await this.storage.delete(key);
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an episodic store instance
 */
export function createEpisodicStore(
  storage?: StorageProvider,
  options?: { maxEpisodes?: number; retentionDays?: number }
): EpisodicStore {
  return new EpisodicStore(storage ?? null, options);
}
