/**
 * @module types/memory
 * @description Type definitions for persistent memory layer
 * @status COMPLETE
 * @see src/memory/STATE.md
 * @lastModified 2026-01-31
 */

// ============================================================================
// Factual Knowledge Types
// ============================================================================

/**
 * Categories of Salesforce debugging knowledge
 */
export type KnowledgeCategory =
  | 'GOVERNOR_LIMITS'
  | 'SOQL_PATTERNS'
  | 'TRIGGER_PATTERNS'
  | 'BATCH_APEX'
  | 'ASYNC_APEX'
  | 'MANAGED_PACKAGES'
  | 'EXCEPTIONS'
  | 'PERFORMANCE'
  | 'SECURITY'
  | 'BEST_PRACTICES';

/**
 * A single piece of factual knowledge
 */
export interface FactualKnowledge {
  /** Unique identifier */
  id: string;

  /** Category of knowledge */
  category: KnowledgeCategory;

  /** Short title */
  title: string;

  /** Detailed content */
  content: string;

  /** Keywords for matching */
  keywords: string[];

  /** Related issue codes */
  relatedIssueCodes: string[];

  /** Salesforce API version this applies to (optional) */
  apiVersion?: string;

  /** Last verified date */
  verifiedAt: Date;

  /** Source of this knowledge */
  source: 'OFFICIAL_DOCS' | 'COMMUNITY' | 'LEARNED' | 'USER_PROVIDED';
}

/**
 * Governor limit fact
 */
export interface GovernorLimitFact {
  /** Limit name (e.g., 'SOQL_QUERIES') */
  name: string;

  /** Synchronous transaction limit */
  syncLimit: number;

  /** Asynchronous transaction limit */
  asyncLimit: number;

  /** Limit per namespace */
  perNamespace: boolean;

  /** Description of the limit */
  description: string;

  /** Tips for avoiding hitting this limit */
  avoidanceTips: string[];
}

/**
 * Error pattern fact
 */
export interface ErrorPatternFact {
  /** Error pattern name */
  name: string;

  /** Error message patterns (regex) */
  messagePatterns: string[];

  /** Root cause description */
  rootCause: string;

  /** Resolution steps */
  resolution: string[];

  /** Code examples (before/after) */
  codeExamples?: {
    before: string;
    after: string;
    language: string;
  }[];
}

// ============================================================================
// Semantic Index Types
// ============================================================================

/**
 * A semantic signature for pattern matching
 */
export interface SemanticSignature {
  /** Issue type pattern */
  issueType: string;

  /** Error message hash/signature */
  errorSignature?: string;

  /** Affected objects */
  objects: string[];

  /** Affected namespaces */
  namespaces: string[];

  /** Method call patterns */
  methodPatterns: string[];

  /** SOQL patterns */
  soqlPatterns: string[];

  /** Governor limit patterns */
  limitPatterns: string[];
}

/**
 * A stored semantic entry
 */
export interface SemanticEntry {
  /** Unique identifier */
  id: string;

  /** Semantic signature for matching */
  signature: SemanticSignature;

  /** Text embedding (optional, for ML-based matching) */
  embedding?: number[];

  /** Associated solution ID */
  solutionId: string;

  /** Match count (how often this pattern matched) */
  matchCount: number;

  /** Success rate of associated solutions */
  successRate: number;

  /** Created timestamp */
  createdAt: Date;

  /** Last matched timestamp */
  lastMatchedAt: Date;
}

/**
 * Semantic match result
 */
export interface SemanticMatch {
  /** Matched entry */
  entry: SemanticEntry;

  /** Match score (0-1) */
  score: number;

  /** Matching components */
  matchedComponents: {
    component: keyof SemanticSignature;
    score: number;
    details: string;
  }[];
}

// ============================================================================
// Episodic Memory Types
// ============================================================================

/**
 * Outcome of a debugging session
 */
export type SessionOutcome =
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'WORKAROUND_APPLIED'
  | 'ESCALATED'
  | 'ABANDONED'
  | 'UNKNOWN';

/**
 * A debugging episode (session)
 */
export interface DebuggingEpisode {
  /** Unique session identifier */
  sessionId: string;

  /** When the session started */
  startedAt: Date;

  /** When the session ended */
  endedAt?: Date;

  /** Org identifier (hashed) */
  orgIdHash: string;

  /** User identifier (hashed) */
  userIdHash: string;

  /** Issues encountered */
  issuesSeen: string[];

  /** Solutions attempted */
  solutionsAttempted: string[];

  /** Final outcome */
  outcome: SessionOutcome;

  /** User feedback (if provided) */
  feedback?: {
    helpful: boolean;
    rating?: number;
    comment?: string;
  };

  /** Tags for organization */
  tags: string[];
}

/**
 * A solution record
 */
export interface SolutionRecord {
  /** Unique identifier */
  id: string;

  /** Issue type this solves */
  issueType: string;

  /** Solution title */
  title: string;

  /** Detailed solution steps */
  steps: string[];

  /** Code changes (if any) */
  codeChanges?: {
    file: string;
    before: string;
    after: string;
  }[];

  /** Success count */
  successCount: number;

  /** Failure count */
  failureCount: number;

  /** Average resolution time (ms) */
  avgResolutionTime?: number;

  /** Created timestamp */
  createdAt: Date;

  /** Last used timestamp */
  lastUsedAt: Date;

  /** Source of this solution */
  source: 'AI_GENERATED' | 'USER_PROVIDED' | 'LEARNED';
}

/**
 * Episode search criteria
 */
export interface EpisodeSearchCriteria {
  /** Issue types to match */
  issueTypes?: string[];

  /** Outcome filter */
  outcomes?: SessionOutcome[];

  /** Date range */
  dateRange?: {
    start: Date;
    end: Date;
  };

  /** Tags to match */
  tags?: string[];

  /** Limit results */
  limit?: number;
}

// ============================================================================
// Short-term Cache Types
// ============================================================================

/**
 * Current session context
 */
export interface SessionContext {
  /** Session ID */
  sessionId: string;

  /** Current org connection info */
  orgInfo?: {
    orgIdHash: string;
    instanceUrl: string;
    apiVersion: string;
  };

  /** Currently loaded logs */
  loadedLogs: {
    logId: string;
    parsedAt: Date;
    issueCount: number;
    eventCount: number;
  }[];

  /** Current focus issue */
  focusIssue?: {
    issueCode: string;
    severity: string;
    context: string;
  };

  /** Recent queries */
  recentQueries: {
    query: string;
    timestamp: Date;
    resultCount: number;
  }[];

  /** AI conversation context */
  conversationContext: {
    recentTopics: string[];
    pendingQuestions: string[];
    suggestedNextSteps: string[];
  };

  /** Session start time */
  startedAt: Date;

  /** Last activity time */
  lastActivityAt: Date;
}

/**
 * Cached analysis result
 */
export interface CachedAnalysis {
  /** Log ID */
  logId: string;

  /** Cache key (based on log content hash) */
  cacheKey: string;

  /** Cached summary */
  summary?: string;

  /** Cached issues */
  issues?: unknown[];

  /** Cached events (partial) */
  eventSubset?: unknown[];

  /** Cache timestamp */
  cachedAt: Date;

  /** TTL (time to live) in ms */
  ttl: number;
}

// ============================================================================
// Persistence Types
// ============================================================================

/**
 * Storage provider interface
 */
export interface StorageProvider {
  /** Provider name */
  name: string;

  /** Initialize storage */
  initialize(): Promise<void>;

  /** Close storage */
  close(): Promise<void>;

  /** Get a value */
  get<T>(key: string): Promise<T | null>;

  /** Set a value */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /** Delete a value */
  delete(key: string): Promise<boolean>;

  /** Check if key exists */
  exists(key: string): Promise<boolean>;

  /** List keys matching pattern */
  keys(pattern: string): Promise<string[]>;

  /** Clear all data */
  clear(): Promise<void>;
}

/**
 * SQLite storage options
 */
export interface SQLiteStorageOptions {
  /** Database file path */
  dbPath: string;

  /** Enable encryption */
  encrypted: boolean;

  /** Encryption key (required if encrypted) */
  encryptionKey?: string;

  /** Enable WAL mode */
  walMode: boolean;

  /** Max database size (bytes) */
  maxSize?: number;

  /** Auto-vacuum setting */
  autoVacuum: 'NONE' | 'FULL' | 'INCREMENTAL';
}

/**
 * Memory store statistics
 */
export interface MemoryStats {
  /** Factual knowledge count */
  factualCount: number;

  /** Semantic entries count */
  semanticCount: number;

  /** Episode count */
  episodeCount: number;

  /** Solution count */
  solutionCount: number;

  /** Cache hit rate */
  cacheHitRate: number;

  /** Total storage size (bytes) */
  storageSizeBytes: number;

  /** Last cleanup timestamp */
  lastCleanupAt: Date;
}

// ============================================================================
// Memory Manager Types
// ============================================================================

/**
 * Recall request
 */
export interface RecallRequest {
  /** Query text */
  query: string;

  /** Issue context */
  issueContext?: {
    issueCode: string;
    severity: string;
    errorMessage?: string;
  };

  /** Include factual knowledge */
  includeFacts: boolean;

  /** Include past solutions */
  includeSolutions: boolean;

  /** Include similar episodes */
  includeEpisodes: boolean;

  /** Maximum results per category */
  maxResults: number;
}

/**
 * Recall response
 */
export interface RecallResponse {
  /** Relevant factual knowledge */
  facts: FactualKnowledge[];

  /** Similar past episodes */
  similarEpisodes: {
    episode: DebuggingEpisode;
    similarity: number;
  }[];

  /** Relevant solutions */
  solutions: {
    solution: SolutionRecord;
    relevance: number;
  }[];

  /** Semantic matches */
  semanticMatches: SemanticMatch[];

  /** Overall confidence */
  confidence: number;

  /** Recall metadata */
  metadata: {
    queryTime: number;
    totalResults: number;
    fromCache: boolean;
  };
}

/**
 * Store request
 */
export interface StoreRequest {
  /** Session ID */
  sessionId: string;

  /** Issue that was resolved */
  issue: {
    code: string;
    severity: string;
    description: string;
  };

  /** Solution that worked */
  solution: {
    title: string;
    steps: string[];
    codeChanges?: {
      file: string;
      before: string;
      after: string;
    }[];
  };

  /** User feedback */
  feedback?: {
    helpful: boolean;
    rating?: number;
    comment?: string;
  };

  /** Semantic signature for future matching */
  signature?: Partial<SemanticSignature>;
}

/**
 * Store response
 */
export interface StoreResponse {
  /** Success flag */
  success: boolean;

  /** Created solution ID */
  solutionId?: string;

  /** Created semantic entry ID */
  semanticEntryId?: string;

  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Memory layer configuration
 */
export interface MemoryConfig {
  /** Enable memory layer */
  enabled: boolean;

  /** Storage provider options */
  storage: SQLiteStorageOptions;

  /** Cache settings */
  cache: {
    /** Enable caching */
    enabled: boolean;
    /** Default TTL (ms) */
    defaultTTL: number;
    /** Max cache entries */
    maxEntries: number;
  };

  /** Privacy settings */
  privacy: {
    /** Hash sensitive identifiers */
    hashIdentifiers: boolean;
    /** Redact PII from stored data */
    redactPII: boolean;
    /** Max episode retention days */
    maxRetentionDays: number;
  };

  /** Learning settings */
  learning: {
    /** Enable solution learning */
    learnFromSolutions: boolean;
    /** Minimum success rate to recommend */
    minSuccessRate: number;
    /** Minimum usage count to recommend */
    minUsageCount: number;
  };
}

/**
 * Default memory configuration
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  storage: {
    dbPath: '.sf-debug-memory.db',
    encrypted: true,
    walMode: true,
    autoVacuum: 'INCREMENTAL',
  },
  cache: {
    enabled: true,
    defaultTTL: 3600000, // 1 hour
    maxEntries: 1000,
  },
  privacy: {
    hashIdentifiers: true,
    redactPII: true,
    maxRetentionDays: 90,
  },
  learning: {
    learnFromSolutions: true,
    minSuccessRate: 0.7,
    minUsageCount: 3,
  },
};
