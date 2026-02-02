/**
 * @module memory/index
 * @description Persistent learning from debugging sessions
 * @status COMPLETE
 * @see src/memory/STATE.md
 * @dependencies src/types/memory.ts
 * @lastModified 2026-01-31
 */

import type {
  MemoryConfig,
  RecallRequest,
  RecallResponse,
  StoreRequest,
  StoreResponse,
  MemoryStats,
  SessionOutcome,
} from '../types/memory';

// ============================================================================
// Re-export Types
// ============================================================================

export type {
  // Memory types
  KnowledgeCategory,
  FactualKnowledge,
  GovernorLimitFact,
  ErrorPatternFact,
  SemanticSignature,
  SemanticEntry,
  SemanticMatch,
  DebuggingEpisode,
  SolutionRecord,
  SessionOutcome,
  EpisodeSearchCriteria,
  SessionContext,
  CachedAnalysis,
  StorageProvider,
  SQLiteStorageOptions,
  MemoryStats,
  RecallRequest,
  RecallResponse,
  StoreRequest,
  StoreResponse,
  MemoryConfig,
} from '../types/memory';

export { DEFAULT_MEMORY_CONFIG } from '../types/memory';

// ============================================================================
// Factual Knowledge Exports
// ============================================================================

export {
  // Data
  GOVERNOR_LIMITS,
  ERROR_PATTERNS,
  FACTUAL_KNOWLEDGE_BASE,
  // Class
  FactualKnowledgeStore,
  // Functions
  getFactualKnowledgeStore,
  resetFactualKnowledgeStore,
} from './factual';

// ============================================================================
// Semantic Index Exports
// ============================================================================

export {
  // Types
  type SignatureOptions,
  type MatchWeights,
  // Class
  SemanticIndex,
  // Functions
  buildSignature,
  createSemanticEntry,
  createSemanticIndex,
} from './semantic';

// ============================================================================
// Episodic Store Exports
// ============================================================================

export {
  // Class
  EpisodicStore,
  // Functions
  createEpisodicStore,
  hashForPrivacy,
} from './episodic';

// ============================================================================
// Short-Term Cache Exports
// ============================================================================

export {
  // Class
  ShortTermCache,
  // Functions
  createShortTermCache,
  getShortTermCache,
  resetShortTermCache,
} from './short-term';

// ============================================================================
// Storage Exports
// ============================================================================

export {
  // Class
  SQLiteStorage,
  // Functions
  createSQLiteStorage,
  createEncryptedStorage,
} from './sqlite-cache';

// ============================================================================
// Memory Manager
// ============================================================================

import { FactualKnowledgeStore, getFactualKnowledgeStore } from './factual';
import { SemanticIndex, createSemanticIndex, buildSignature, createSemanticEntry } from './semantic';
import { EpisodicStore, createEpisodicStore, hashForPrivacy } from './episodic';
import { ShortTermCache, createShortTermCache } from './short-term';
import { SQLiteStorage, createSQLiteStorage } from './sqlite-cache';

/**
 * Memory manager that orchestrates all memory components
 */
export class MemoryManager {
  private config: MemoryConfig;
  private storage: SQLiteStorage | null = null;
  private factual: FactualKnowledgeStore;
  private semantic: SemanticIndex;
  private episodic: EpisodicStore;
  private shortTerm: ShortTermCache;
  private initialized = false;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      storage: {
        dbPath: config.storage?.dbPath ?? '.sf-debug-memory.db',
        encrypted: config.storage?.encrypted ?? true,
        encryptionKey: config.storage?.encryptionKey,
        walMode: config.storage?.walMode ?? true,
        autoVacuum: config.storage?.autoVacuum ?? 'INCREMENTAL',
      },
      cache: {
        enabled: config.cache?.enabled ?? true,
        defaultTTL: config.cache?.defaultTTL ?? 3600000,
        maxEntries: config.cache?.maxEntries ?? 1000,
      },
      privacy: {
        hashIdentifiers: config.privacy?.hashIdentifiers ?? true,
        redactPII: config.privacy?.redactPII ?? true,
        maxRetentionDays: config.privacy?.maxRetentionDays ?? 90,
      },
      learning: {
        learnFromSolutions: config.learning?.learnFromSolutions ?? true,
        minSuccessRate: config.learning?.minSuccessRate ?? 0.7,
        minUsageCount: config.learning?.minUsageCount ?? 3,
      },
    };

    this.factual = getFactualKnowledgeStore();
    this.semantic = createSemanticIndex(undefined);
    this.episodic = createEpisodicStore(undefined, {
      retentionDays: this.config.privacy.maxRetentionDays,
    });
    this.shortTerm = createShortTermCache({
      maxCacheEntries: this.config.cache.maxEntries,
      defaultTTL: this.config.cache.defaultTTL,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.config.enabled) return;

    this.storage = createSQLiteStorage(this.config.storage);
    await this.storage.initialize();

    this.semantic = createSemanticIndex(this.storage);
    await this.semantic.initialize();

    this.episodic = createEpisodicStore(this.storage, {
      retentionDays: this.config.privacy.maxRetentionDays,
    });
    await this.episodic.initialize();

    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.storage) {
      await this.storage.close();
    }
    this.initialized = false;
  }

  async recall(request: RecallRequest): Promise<RecallResponse> {
    const startTime = Date.now();
    const response: RecallResponse = {
      facts: [],
      similarEpisodes: [],
      solutions: [],
      semanticMatches: [],
      confidence: 0,
      metadata: { queryTime: 0, totalResults: 0, fromCache: false },
    };

    if (request.includeFacts) {
      const keywords = request.query.split(/\s+/).filter((w) => w.length > 2);
      response.facts = this.factual.searchByKeywords(keywords).slice(0, request.maxResults);
      if (request.issueContext?.issueCode) {
        const issueRelated = this.factual.getByIssueCode(request.issueContext.issueCode);
        for (const fact of issueRelated) {
          if (!response.facts.find((f) => f.id === fact.id)) {
            response.facts.push(fact);
          }
        }
      }
    }

    if (request.issueContext) {
      const signature = buildSignature(request.issueContext.issueCode, {
        errorMessage: request.issueContext.errorMessage,
      });
      response.semanticMatches = this.semantic.findMatches(signature, {
        minScore: 0.3,
        limit: request.maxResults,
      });
    }

    if (request.includeEpisodes && request.issueContext) {
      response.similarEpisodes = this.episodic
        .getSimilarEpisodes([request.issueContext.issueCode], request.maxResults)
        .map((ep) => ({ episode: ep, similarity: 0.8 }));
    }

    if (request.includeSolutions && request.issueContext) {
      const solutions = this.episodic.getSolutionsForIssue(request.issueContext.issueCode);
      response.solutions = solutions
        .filter((s) => {
          const usage = s.successCount + s.failureCount;
          if (usage < this.config.learning.minUsageCount) return false;
          return s.successCount / usage >= this.config.learning.minSuccessRate;
        })
        .slice(0, request.maxResults)
        .map((s) => ({ solution: s, relevance: s.successCount / (s.successCount + s.failureCount) }));
    }

    const totalResults = response.facts.length + response.similarEpisodes.length +
      response.solutions.length + response.semanticMatches.length;
    response.confidence = Math.min(1, totalResults / 10);
    response.metadata = { queryTime: Date.now() - startTime, totalResults, fromCache: false };

    return response;
  }

  async store(request: StoreRequest): Promise<StoreResponse> {
    if (!this.config.learning.learnFromSolutions) {
      return { success: false, error: 'Learning disabled' };
    }

    try {
      const solution = await this.episodic.createSolution(
        request.issue.code,
        request.solution.title,
        request.solution.steps,
        { codeChanges: request.solution.codeChanges, source: 'LEARNED' }
      );

      const signature = buildSignature(request.issue.code, request.signature ?? {});
      const semanticEntry = createSemanticEntry(solution.id, signature);
      await this.semantic.addEntry(semanticEntry);

      const episode = this.episodic.getEpisode(request.sessionId);
      if (episode) {
        await this.episodic.addSolutionAttempt(request.sessionId, solution.id);
      }

      return { success: true, solutionId: solution.id, semanticEntryId: semanticEntry.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async startSession(orgId: string, userId: string): Promise<string> {
    this.shortTerm.startSession();
    const orgHash = this.config.privacy.hashIdentifiers ? hashForPrivacy(orgId) : orgId;
    const userHash = this.config.privacy.hashIdentifiers ? hashForPrivacy(userId) : userId;
    const episode = await this.episodic.createEpisode(orgHash, userHash);
    this.shortTerm.setOrgInfo({ orgIdHash: orgHash, instanceUrl: 'unknown', apiVersion: 'unknown' });
    return episode.sessionId;
  }

  async endSession(outcome: SessionOutcome, feedback?: { helpful: boolean; rating?: number; comment?: string }): Promise<void> {
    const context = this.shortTerm.getContext();
    if (!context) return;
    await this.episodic.completeEpisode(context.sessionId, outcome, feedback);
    this.shortTerm.endSession();
  }

  getSessionContext(): ReturnType<ShortTermCache['getContext']> {
    return this.shortTerm.getContext();
  }

  getSessionSummary(): string {
    return this.shortTerm.getSessionSummary();
  }

  getFactualStore(): FactualKnowledgeStore { return this.factual; }
  getSemanticIndex(): SemanticIndex { return this.semantic; }
  getEpisodicStore(): EpisodicStore { return this.episodic; }
  getShortTermCache(): ShortTermCache { return this.shortTerm; }

  async getStats(): Promise<MemoryStats> {
    const factualStats = this.factual.getStats();
    const semanticStats = this.semantic.getStats();
    const episodicStats = this.episodic.getStats();
    const cacheStats = this.shortTerm.getCacheStats();
    let storageSizeBytes = 0;
    if (this.storage) {
      const storageStats = await this.storage.getStats();
      storageSizeBytes = storageStats.dbSizeBytes;
    }
    return {
      factualCount: factualStats.knowledge + factualStats.limits + factualStats.patterns,
      semanticCount: semanticStats.totalEntries,
      episodeCount: episodicStats.episodeCount,
      solutionCount: episodicStats.solutionCount,
      cacheHitRate: cacheStats.hitRate,
      storageSizeBytes,
      lastCleanupAt: new Date(),
    };
  }

  async runMaintenance(): Promise<{ expiredCacheEntries: number; oldEpisodes: number; expiredStorageKeys: number }> {
    const expiredCacheEntries = this.shortTerm.cleanupExpired();
    const oldEpisodes = await this.episodic.cleanupOldEpisodes();
    const expiredStorageKeys = this.storage ? await this.storage.cleanup() : 0;
    return { expiredCacheEntries, oldEpisodes, expiredStorageKeys };
  }
}

export function createMemoryManager(config?: Partial<MemoryConfig>): MemoryManager {
  return new MemoryManager(config);
}

let _instance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!_instance) {
    _instance = new MemoryManager();
  }
  return _instance;
}

export function resetMemoryManager(): void {
  if (_instance) {
    _instance.close();
  }
  _instance = null;
}
