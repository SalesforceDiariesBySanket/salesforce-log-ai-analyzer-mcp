/**
 * @module memory/semantic
 * @description Pattern-based similarity matching for past solutions
 * @status COMPLETE
 * @see src/memory/STATE.md
 * @dependencies src/types/memory.ts
 * @lastModified 2026-01-31
 */

import type {
  SemanticSignature,
  SemanticEntry,
  SemanticMatch,
  StorageProvider,
} from '../types/memory';

// ============================================================================
// Signature Utilities
// ============================================================================

/**
 * Normalize a string for comparison
 */
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 1;
  if (set1.size === 0 || set2.size === 0) return 0;

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Levenshtein distance between two strings
 * @internal Reserved for future ML-based similarity
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create distance matrix with proper typing
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      dp[i]![j] = 0;
    }
  }

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1, // deletion
        dp[i]![j - 1]! + 1, // insertion
        dp[i - 1]![j - 1]! + cost // substitution
      );
    }
  }

  return dp[m]![n]!;
}

/**
 * Extract keywords from text
 * @internal Reserved for future semantic search
 */
export function extractKeywords(text: string): Set<string> {
  const normalized = normalizeString(text);
  const words = normalized.split(/\W+/).filter((w) => w.length > 2);
  return new Set(words);
}

/**
 * Generate hash for error signature
 */
function hashErrorMessage(message: string): string {
  // Extract key parts, ignoring specific IDs and numbers
  const normalized = message
    .replace(/[0-9a-f]{15,18}/gi, 'ID') // Salesforce IDs
    .replace(/\d+/g, 'N') // Numbers
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  // Simple hash
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

// ============================================================================
// Semantic Signature Builder
// ============================================================================

/**
 * Options for building semantic signatures
 */
export interface SignatureOptions {
  /** Include error message hash */
  includeErrorHash: boolean;
  /** Max objects to include */
  maxObjects: number;
  /** Max method patterns to include */
  maxMethodPatterns: number;
  /** Max SOQL patterns to include */
  maxSoqlPatterns: number;
}

const DEFAULT_SIGNATURE_OPTIONS: SignatureOptions = {
  includeErrorHash: true,
  maxObjects: 10,
  maxMethodPatterns: 20,
  maxSoqlPatterns: 10,
};

/**
 * Build a semantic signature from issue data
 */
export function buildSignature(
  issueType: string,
  data: {
    errorMessage?: string;
    objects?: string[];
    namespaces?: string[];
    methods?: string[];
    soqlQueries?: string[];
    limitTypes?: string[];
  },
  options: Partial<SignatureOptions> = {}
): SemanticSignature {
  const opts = { ...DEFAULT_SIGNATURE_OPTIONS, ...options };

  // Extract method patterns (class.method format)
  const methodPatterns = (data.methods ?? [])
    .slice(0, opts.maxMethodPatterns)
    .map((m) => {
      // Normalize to class.method
      const parts = m.split('.');
      if (parts.length >= 2) {
        return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      }
      return m;
    });

  // Extract SOQL patterns (simplified query structure)
  const soqlPatterns = (data.soqlQueries ?? [])
    .slice(0, opts.maxSoqlPatterns)
    .map((q) => {
      // Extract FROM clause object
      const fromMatch = q.match(/FROM\s+(\w+)/i);
      const obj = fromMatch ? fromMatch[1] : 'Unknown';
      // Check for common patterns
      const hasWhere = /WHERE/i.test(q);
      const hasLimit = /LIMIT/i.test(q);
      const hasSubquery = /\(SELECT/i.test(q);
      return `${obj}:${hasWhere ? 'W' : ''}${hasLimit ? 'L' : ''}${hasSubquery ? 'S' : ''}`;
    });

  return {
    issueType,
    errorSignature: opts.includeErrorHash && data.errorMessage
      ? hashErrorMessage(data.errorMessage)
      : undefined,
    objects: (data.objects ?? []).slice(0, opts.maxObjects),
    namespaces: data.namespaces ?? [],
    methodPatterns,
    soqlPatterns,
    limitPatterns: data.limitTypes ?? [],
  };
}

// ============================================================================
// Semantic Index
// ============================================================================

/**
 * Weights for different signature components
 */
export interface MatchWeights {
  issueType: number;
  errorSignature: number;
  objects: number;
  namespaces: number;
  methodPatterns: number;
  soqlPatterns: number;
  limitPatterns: number;
}

const DEFAULT_WEIGHTS: MatchWeights = {
  issueType: 0.25,
  errorSignature: 0.15,
  objects: 0.15,
  namespaces: 0.1,
  methodPatterns: 0.15,
  soqlPatterns: 0.1,
  limitPatterns: 0.1,
};

/**
 * Semantic index for pattern matching
 */
export class SemanticIndex {
  private entries: Map<string, SemanticEntry>;
  private issueTypeIndex: Map<string, Set<string>>;
  private objectIndex: Map<string, Set<string>>;
  private namespaceIndex: Map<string, Set<string>>;
  private storage: StorageProvider | null;
  private weights: MatchWeights;

  constructor(
    storage: StorageProvider | null = null,
    weights: Partial<MatchWeights> = {}
  ) {
    this.entries = new Map();
    this.issueTypeIndex = new Map();
    this.objectIndex = new Map();
    this.namespaceIndex = new Map();
    this.storage = storage;
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Initialize the index (load from storage)
   */
  async initialize(): Promise<void> {
    if (!this.storage) return;

    const keys = await this.storage.keys('semantic:entry:*');
    for (const key of keys) {
      const entry = await this.storage.get<SemanticEntry>(key);
      if (entry) {
        this.addToMemory(entry);
      }
    }
  }

  /**
   * Add entry to in-memory indexes
   */
  private addToMemory(entry: SemanticEntry): void {
    this.entries.set(entry.id, entry);

    // Index by issue type
    const issueSet = this.issueTypeIndex.get(entry.signature.issueType) ?? new Set();
    issueSet.add(entry.id);
    this.issueTypeIndex.set(entry.signature.issueType, issueSet);

    // Index by objects
    for (const obj of entry.signature.objects) {
      const objSet = this.objectIndex.get(obj.toLowerCase()) ?? new Set();
      objSet.add(entry.id);
      this.objectIndex.set(obj.toLowerCase(), objSet);
    }

    // Index by namespaces
    for (const ns of entry.signature.namespaces) {
      const nsSet = this.namespaceIndex.get(ns.toLowerCase()) ?? new Set();
      nsSet.add(entry.id);
      this.namespaceIndex.set(ns.toLowerCase(), nsSet);
    }
  }

  /**
   * Add a new semantic entry
   */
  async addEntry(entry: SemanticEntry): Promise<void> {
    this.addToMemory(entry);

    if (this.storage) {
      await this.storage.set(`semantic:entry:${entry.id}`, entry);
    }
  }

  /**
   * Remove an entry
   */
  async removeEntry(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;

    this.entries.delete(id);

    // Remove from indexes
    const issueSet = this.issueTypeIndex.get(entry.signature.issueType);
    issueSet?.delete(id);

    for (const obj of entry.signature.objects) {
      const objSet = this.objectIndex.get(obj.toLowerCase());
      objSet?.delete(id);
    }

    for (const ns of entry.signature.namespaces) {
      const nsSet = this.namespaceIndex.get(ns.toLowerCase());
      nsSet?.delete(id);
    }

    if (this.storage) {
      await this.storage.delete(`semantic:entry:${id}`);
    }

    return true;
  }

  /**
   * Find matches for a signature
   */
  findMatches(
    query: SemanticSignature,
    options: { minScore?: number; limit?: number } = {}
  ): SemanticMatch[] {
    const { minScore = 0.3, limit = 10 } = options;

    // Get candidate entries (filtered by issue type and objects)
    const candidates = this.getCandidates(query);

    // Score each candidate
    const matches: SemanticMatch[] = [];

    for (const entryId of candidates) {
      const entry = this.entries.get(entryId);
      if (!entry) continue;

      const matchResult = this.calculateMatch(query, entry.signature);

      if (matchResult.score >= minScore) {
        matches.push({
          entry,
          score: matchResult.score,
          matchedComponents: matchResult.components,
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return matches.slice(0, limit);
  }

  /**
   * Get candidate entries for matching
   */
  private getCandidates(query: SemanticSignature): Set<string> {
    const candidates = new Set<string>();

    // All entries with matching issue type
    const issueMatches = this.issueTypeIndex.get(query.issueType);
    if (issueMatches) {
      for (const id of issueMatches) {
        candidates.add(id);
      }
    }

    // All entries with matching objects
    for (const obj of query.objects) {
      const objMatches = this.objectIndex.get(obj.toLowerCase());
      if (objMatches) {
        for (const id of objMatches) {
          candidates.add(id);
        }
      }
    }

    // If no candidates from indexes, consider all entries
    if (candidates.size === 0) {
      for (const id of this.entries.keys()) {
        candidates.add(id);
      }
    }

    return candidates;
  }

  /**
   * Calculate match score between two signatures
   */
  private calculateMatch(
    query: SemanticSignature,
    target: SemanticSignature
  ): {
    score: number;
    components: { component: keyof SemanticSignature; score: number; details: string }[];
  } {
    const components: { component: keyof SemanticSignature; score: number; details: string }[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    // Issue type (exact match)
    const issueScore = query.issueType === target.issueType ? 1 : 0;
    components.push({ component: 'issueType', score: issueScore, details: target.issueType });
    totalScore += issueScore * this.weights.issueType;
    totalWeight += this.weights.issueType;

    // Error signature
    if (query.errorSignature && target.errorSignature) {
      const errorScore = query.errorSignature === target.errorSignature ? 1 : 0;
      components.push({
        component: 'errorSignature',
        score: errorScore,
        details: errorScore === 1 ? 'Exact match' : 'No match',
      });
      totalScore += errorScore * this.weights.errorSignature;
      totalWeight += this.weights.errorSignature;
    }

    // Objects (Jaccard similarity)
    const queryObjects = new Set(query.objects.map((o) => o.toLowerCase()));
    const targetObjects = new Set(target.objects.map((o) => o.toLowerCase()));
    const objectScore = jaccardSimilarity(queryObjects, targetObjects);
    components.push({
      component: 'objects',
      score: objectScore,
      details: `${queryObjects.size} vs ${targetObjects.size} objects`,
    });
    totalScore += objectScore * this.weights.objects;
    totalWeight += this.weights.objects;

    // Namespaces (Jaccard similarity)
    const queryNs = new Set(query.namespaces.map((n) => n.toLowerCase()));
    const targetNs = new Set(target.namespaces.map((n) => n.toLowerCase()));
    const nsScore = jaccardSimilarity(queryNs, targetNs);
    components.push({
      component: 'namespaces',
      score: nsScore,
      details: `${queryNs.size} vs ${targetNs.size} namespaces`,
    });
    totalScore += nsScore * this.weights.namespaces;
    totalWeight += this.weights.namespaces;

    // Method patterns (Jaccard similarity)
    const queryMethods = new Set(query.methodPatterns.map((m) => m.toLowerCase()));
    const targetMethods = new Set(target.methodPatterns.map((m) => m.toLowerCase()));
    const methodScore = jaccardSimilarity(queryMethods, targetMethods);
    components.push({
      component: 'methodPatterns',
      score: methodScore,
      details: `${queryMethods.size} vs ${targetMethods.size} methods`,
    });
    totalScore += methodScore * this.weights.methodPatterns;
    totalWeight += this.weights.methodPatterns;

    // SOQL patterns (Jaccard similarity)
    const querySoql = new Set(query.soqlPatterns.map((s) => s.toLowerCase()));
    const targetSoql = new Set(target.soqlPatterns.map((s) => s.toLowerCase()));
    const soqlScore = jaccardSimilarity(querySoql, targetSoql);
    components.push({
      component: 'soqlPatterns',
      score: soqlScore,
      details: `${querySoql.size} vs ${targetSoql.size} patterns`,
    });
    totalScore += soqlScore * this.weights.soqlPatterns;
    totalWeight += this.weights.soqlPatterns;

    // Limit patterns (Jaccard similarity)
    const queryLimits = new Set(query.limitPatterns.map((l) => l.toLowerCase()));
    const targetLimits = new Set(target.limitPatterns.map((l) => l.toLowerCase()));
    const limitScore = jaccardSimilarity(queryLimits, targetLimits);
    components.push({
      component: 'limitPatterns',
      score: limitScore,
      details: `${queryLimits.size} vs ${targetLimits.size} limits`,
    });
    totalScore += limitScore * this.weights.limitPatterns;
    totalWeight += this.weights.limitPatterns;

    return {
      score: totalWeight > 0 ? totalScore / totalWeight : 0,
      components,
    };
  }

  /**
   * Update match count for an entry
   */
  async recordMatch(entryId: string): Promise<void> {
    const entry = this.entries.get(entryId);
    if (!entry) return;

    entry.matchCount++;
    entry.lastMatchedAt = new Date();

    if (this.storage) {
      await this.storage.set(`semantic:entry:${entryId}`, entry);
    }
  }

  /**
   * Update success rate for an entry
   */
  async recordOutcome(entryId: string, success: boolean): Promise<void> {
    const entry = this.entries.get(entryId);
    if (!entry) return;

    // Update success rate with exponential moving average
    const alpha = 0.3; // Weight for new observation
    entry.successRate = entry.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;

    if (this.storage) {
      await this.storage.set(`semantic:entry:${entryId}`, entry);
    }
  }

  /**
   * Get entry by ID
   */
  getEntry(id: string): SemanticEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all entries
   */
  getAllEntries(): SemanticEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get statistics
   */
  getStats(): { totalEntries: number; issueTypes: number; avgSuccessRate: number } {
    const entries = Array.from(this.entries.values());
    const avgSuccessRate =
      entries.length > 0
        ? entries.reduce((sum, e) => sum + e.successRate, 0) / entries.length
        : 0;

    return {
      totalEntries: this.entries.size,
      issueTypes: this.issueTypeIndex.size,
      avgSuccessRate,
    };
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.entries.clear();
    this.issueTypeIndex.clear();
    this.objectIndex.clear();
    this.namespaceIndex.clear();

    if (this.storage) {
      const keys = await this.storage.keys('semantic:entry:*');
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
 * Create a new semantic entry
 */
export function createSemanticEntry(
  solutionId: string,
  signature: SemanticSignature,
  options: { embedding?: number[] } = {}
): SemanticEntry {
  return {
    id: `sem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    signature,
    embedding: options.embedding,
    solutionId,
    matchCount: 0,
    successRate: 0.5, // Start with neutral success rate
    createdAt: new Date(),
    lastMatchedAt: new Date(),
  };
}

/**
 * Create a semantic index instance
 */
export function createSemanticIndex(
  storage?: StorageProvider,
  weights?: Partial<MatchWeights>
): SemanticIndex {
  return new SemanticIndex(storage ?? null, weights);
}
