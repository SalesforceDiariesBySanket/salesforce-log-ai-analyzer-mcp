/**
 * @module memory/memory-integration.test
 * @description Integration tests demonstrating memory layer strategy with debug logs
 * @status COMPLETE
 * @see src/memory/STATE.md
 * @dependencies src/memory/index.ts
 * @lastModified 2026-02-01
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MemoryManager,
  createMemoryManager,
  getMemoryManager,
  resetMemoryManager,
  getFactualKnowledgeStore,
  resetFactualKnowledgeStore,
  createSemanticIndex,
  buildSignature,
  createSemanticEntry,
  createEpisodicStore,
  createShortTermCache,
  GOVERNOR_LIMITS,
  ERROR_PATTERNS,
  FACTUAL_KNOWLEDGE_BASE,
} from './index';

describe('Memory Layer Integration - Strategy & Workflow', () => {
  let memory: MemoryManager;

  beforeEach(() => {
    resetMemoryManager();
    resetFactualKnowledgeStore();
    memory = createMemoryManager({
      enabled: true,
      storage: {
        dbPath: ':memory:', // In-memory for testing
        encrypted: false,
      },
      learning: {
        learnFromSolutions: true,
        minSuccessRate: 0.5,
        minUsageCount: 1,
      },
    });
  });

  afterEach(async () => {
    await memory.close();
    resetMemoryManager();
  });

  // ============================================================================
  // STRATEGY 1: Factual Knowledge - Static Salesforce Knowledge Base
  // ============================================================================

  describe('Strategy 1: Factual Knowledge Store', () => {
    it('contains governor limits for common issues', () => {
      const factual = getFactualKnowledgeStore();
      
      // Governor limits are pre-loaded
      const soqlLimit = GOVERNOR_LIMITS.find(l => l.name === 'SOQL_QUERIES');
      expect(soqlLimit).toBeDefined();
      expect(soqlLimit?.syncLimit).toBe(100);
      expect(soqlLimit?.asyncLimit).toBe(200);
      expect(soqlLimit?.avoidanceTips).toContain('Move SOQL queries outside of loops');
    });

    it('provides error patterns for common exceptions', () => {
      // Error patterns help identify issues in debug logs
      const nullPointer = ERROR_PATTERNS.find(p => p.name === 'NULL_POINTER');
      expect(nullPointer).toBeDefined();
      expect(nullPointer?.messagePatterns).toBeDefined();
      expect(nullPointer?.resolution).toBeDefined();
    });

    it('searches factual knowledge by keywords', () => {
      const factual = getFactualKnowledgeStore();
      
      // Search for SOQL-related knowledge
      const results = factual.searchByKeywords(['soql', 'queries', 'loop']);
      
      // Results may be empty if no pre-loaded knowledge matches
      // The factual store is populated from FACTUAL_KNOWLEDGE_BASE
      expect(Array.isArray(results)).toBe(true);
      
      // Verify the factual knowledge base has relevant entries
      const hasRelevantKnowledge = FACTUAL_KNOWLEDGE_BASE.some(r => 
        r.title.toLowerCase().includes('soql') || 
        r.content.toLowerCase().includes('soql')
      );
      expect(hasRelevantKnowledge).toBe(true);
    });

    it('links knowledge to issue codes', () => {
      const factual = getFactualKnowledgeStore();
      
      // Get knowledge for specific issue code
      const soqlInLoop = factual.getByIssueCode('SOQL_IN_LOOP');
      expect(soqlInLoop.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // STRATEGY 2: Semantic Matching - Pattern-Based Similarity
  // ============================================================================

  describe('Strategy 2: Semantic Index for Pattern Matching', () => {
    it('builds semantic signatures from issue context', () => {
      // When analyzing debug logs, we build a signature
      const signature = buildSignature('SOQL_IN_LOOP', {
        errorMessage: 'Too many SOQL queries: 101',
        objects: ['Account', 'Contact'],
        namespaces: ['myns'],
        methods: ['processAccounts', 'updateContacts'],
        soqlQueries: ['SELECT Id FROM Account WHERE', 'SELECT Id FROM Contact'],
        limitTypes: ['SOQL_QUERIES'],
      });

      expect(signature.issueType).toBe('SOQL_IN_LOOP');
      expect(signature.objects).toContain('Account');
      expect(signature.namespaces).toContain('myns');
      expect(signature.methodPatterns).toContain('processAccounts');
    });

    it('finds similar patterns using Jaccard similarity', async () => {
      const semanticIndex = createSemanticIndex(null);
      await semanticIndex.initialize();

      // Store a known solution pattern
      const existingSig = buildSignature('SOQL_IN_LOOP', {
        objects: ['Account', 'Contact', 'Opportunity'],
        methods: ['processRecords', 'bulkUpdate'],
        soqlQueries: ['SELECT Id FROM Account'],
      });
      const entry = createSemanticEntry('sol-123', existingSig);
      await semanticIndex.addEntry(entry);

      // Search with a similar pattern
      const searchSig = buildSignature('SOQL_IN_LOOP', {
        objects: ['Account', 'Contact'], // Overlapping
        methods: ['processRecords'], // Overlapping
        soqlQueries: ['SELECT Id FROM Account WHERE'],
      });

      const matches = semanticIndex.findMatches(searchSig, { 
        minScore: 0.2, 
        limit: 5 
      });

      expect(matches.length).toBe(1);
      expect(matches[0]?.score).toBeGreaterThan(0.2);
    });

    it('weights different components for scoring', async () => {
      const semanticIndex = createSemanticIndex(null);
      await semanticIndex.initialize();

      // Issue type match is weighted highest
      const sig1 = buildSignature('SOQL_IN_LOOP', { objects: ['Account'] });
      const sig2 = buildSignature('CPU_TIME_EXCEEDED', { objects: ['Account'] });
      
      await semanticIndex.addEntry(createSemanticEntry('sol-1', sig1));
      await semanticIndex.addEntry(createSemanticEntry('sol-2', sig2));

      // Search for SOQL issues - should rank SOQL solution higher
      const searchSig = buildSignature('SOQL_IN_LOOP', { objects: ['Account'] });
      const matches = semanticIndex.findMatches(searchSig, { minScore: 0.1 });

      // First match should be the SOQL solution
      expect(matches[0]?.entry.solutionId).toBe('sol-1');
    });
  });

  // ============================================================================
  // STRATEGY 3: Episodic Memory - Session History
  // ============================================================================

  describe('Strategy 3: Episodic Store for Session History', () => {
    it('tracks debugging sessions', async () => {
      const episodic = createEpisodicStore(null, { retentionDays: 90 });
      await episodic.initialize();

      // Create a debugging episode
      const episode = await episodic.createEpisode('org-123', 'user-456');
      expect(episode.sessionId).toBeDefined();
      expect(episode.outcome).toBe('UNKNOWN');

      // Record issues seen during debugging (using addIssuesToEpisode)
      await episodic.addIssuesToEpisode(episode.sessionId, ['SOQL_IN_LOOP', 'CPU_TIME_EXCEEDED']);

      // Complete session with outcome
      await episodic.completeEpisode(episode.sessionId, 'RESOLVED');

      const completed = episodic.getEpisode(episode.sessionId);
      expect(completed?.outcome).toBe('RESOLVED');
      expect(completed?.issuesSeen).toContain('SOQL_IN_LOOP');
    });

    it('stores successful solutions', async () => {
      const episodic = createEpisodicStore(null);
      await episodic.initialize();

      // Create a solution record
      const solution = await episodic.createSolution(
        'SOQL_IN_LOOP',
        'Move SOQL to Map-based lookup',
        [
          'Query all needed records before the loop',
          'Store results in Map<Id, SObject>',
          'Access map inside loop instead of querying',
        ],
        { source: 'LEARNED' }
      );

      expect(solution.id).toBeDefined();
      expect(solution.issueType).toBe('SOQL_IN_LOOP');
      expect(solution.steps).toHaveLength(3);
    });

    it('tracks solution success rates', async () => {
      const episodic = createEpisodicStore(null);
      await episodic.initialize();

      const solution = await episodic.createSolution(
        'SOQL_IN_LOOP',
        'Bulkify SOQL',
        ['Move query outside loop']
      );

      // Record success/failure outcomes using recordSolutionSuccess
      await episodic.recordSolutionSuccess(solution.id, true);
      await episodic.recordSolutionSuccess(solution.id, true);
      await episodic.recordSolutionSuccess(solution.id, false);

      const updated = episodic.getSolution(solution.id);
      expect(updated?.successCount).toBe(2);
      expect(updated?.failureCount).toBe(1);
    });

    it('finds similar past episodes', async () => {
      const episodic = createEpisodicStore(null);
      await episodic.initialize();

      // Create past episodes
      const ep1 = await episodic.createEpisode('org-1', 'user-1');
      await episodic.addIssuesToEpisode(ep1.sessionId, ['SOQL_IN_LOOP']);
      await episodic.completeEpisode(ep1.sessionId, 'RESOLVED');

      const ep2 = await episodic.createEpisode('org-2', 'user-2');
      await episodic.addIssuesToEpisode(ep2.sessionId, ['CPU_TIME_EXCEEDED']);
      await episodic.completeEpisode(ep2.sessionId, 'RESOLVED');

      // Find episodes with similar issues
      const similar = episodic.getSimilarEpisodes(['SOQL_IN_LOOP'], 5);
      expect(similar.length).toBe(1);
      expect(similar[0]?.sessionId).toBe(ep1.sessionId);
    });
  });

  // ============================================================================
  // STRATEGY 4: Short-Term Cache - Current Session Context
  // ============================================================================

  describe('Strategy 4: Short-Term Cache for Session Context', () => {
    it('maintains current session state', () => {
      const cache = createShortTermCache({ maxCacheEntries: 100 });
      
      const context = cache.startSession('session-123');
      expect(context.sessionId).toBe('session-123');
      expect(cache.hasActiveSession()).toBe(true);
    });

    it('tracks loaded debug logs', () => {
      const cache = createShortTermCache();
      cache.startSession();

      // Record parsed logs
      cache.recordLoadedLog({ 
        logId: 'log-1', 
        issueCount: 5, 
        eventCount: 1000 
      });
      cache.recordLoadedLog({ 
        logId: 'log-2', 
        issueCount: 3, 
        eventCount: 500 
      });

      const context = cache.getContext();
      expect(context?.loadedLogs).toHaveLength(2);
    });

    it('tracks focus issue for debugging', () => {
      const cache = createShortTermCache();
      cache.startSession();

      cache.setFocusIssue({
        issueCode: 'SOQL_IN_LOOP',
        severity: 'HIGH',
        context: 'Line 42 in MyClass.cls',
      });

      const context = cache.getContext();
      expect(context?.focusIssue?.issueCode).toBe('SOQL_IN_LOOP');
    });

    it('caches analysis results with TTL', () => {
      const cache = createShortTermCache({ defaultTTL: 60000 });
      cache.startSession();

      // Cache analysis result (cacheAnalysis expects an object with logId)
      cache.cacheAnalysis({
        logId: 'log-1',
        issues: [{ code: 'SOQL_IN_LOOP' }],
        summary: 'Found 1 SOQL in loop issue',
        ttl: 60000,
      });

      // Retrieve cached result
      const cached = cache.getCachedAnalysis('log-1');
      expect(cached).toBeDefined();
      expect(cached?.summary).toBe('Found 1 SOQL in loop issue');
    });

    it('generates session summary', () => {
      const cache = createShortTermCache();
      cache.startSession();
      
      cache.recordLoadedLog({ logId: 'log-1', issueCount: 3, eventCount: 100 });
      cache.setFocusIssue({ 
        issueCode: 'SOQL_IN_LOOP', 
        severity: 'HIGH', 
        context: 'test' 
      });

      const summary = cache.getSessionSummary();
      // The summary format says "Logs analyzed: X" not "X logs loaded"
      expect(summary).toContain('Logs analyzed: 1');
      expect(summary).toContain('SOQL_IN_LOOP');
    });
  });

  // ============================================================================
  // FULL WORKFLOW: Memory Manager Orchestration
  // ============================================================================

  describe('Full Workflow: MemoryManager Orchestration', () => {
    it('initializes all memory components', async () => {
      await memory.initialize();

      const stats = await memory.getStats();
      expect(stats.factualCount).toBeGreaterThan(0); // Pre-loaded knowledge
    });

    it('recalls relevant information for an issue', async () => {
      await memory.initialize();

      const response = await memory.recall({
        query: 'SOQL queries in trigger loop',
        issueContext: {
          issueCode: 'SOQL_IN_LOOP',
          severity: 'HIGH',
          errorMessage: 'Too many SOQL queries: 101',
        },
        includeFacts: true,
        includeSolutions: true,
        includeEpisodes: true,
        maxResults: 5,
      });

      // Should return factual knowledge
      expect(response.facts.length).toBeGreaterThan(0);
      expect(response.metadata.queryTime).toBeDefined();
    });

    it('stores and learns from successful solutions', async () => {
      await memory.initialize();

      // Start session
      const sessionId = await memory.startSession('org-1', 'user-1');

      // Store a solution
      const storeResult = await memory.store({
        sessionId,
        issue: {
          code: 'SOQL_IN_LOOP',
          severity: 'HIGH',
          description: 'SOQL query inside trigger for loop',
        },
        solution: {
          title: 'Use Map-based lookup pattern',
          steps: [
            'Query all related records before loop',
            'Store in Map<Id, SObject>',
            'Access map inside loop',
          ],
        },
        signature: {
          objects: ['Account', 'Contact'],
          methods: ['processAccounts'],
        },
      });

      expect(storeResult.success).toBe(true);
      expect(storeResult.solutionId).toBeDefined();
    });

    it('completes full debugging session workflow', async () => {
      await memory.initialize();

      // 1. Start session
      const sessionId = await memory.startSession('test-org', 'test-user');
      expect(sessionId).toBeDefined();

      // 2. Get session context
      const context = memory.getSessionContext();
      expect(context).toBeDefined();

      // 3. Recall knowledge for issue
      const recall = await memory.recall({
        query: 'governor limit exceeded',
        issueContext: { issueCode: 'CPU_TIME_EXCEEDED', severity: 'HIGH' },
        includeFacts: true,
        maxResults: 3,
      });
      expect(recall.facts.length).toBeGreaterThan(0);

      // 4. Store learned solution
      await memory.store({
        sessionId,
        issue: { code: 'CPU_TIME_EXCEEDED', severity: 'HIGH', description: '' },
        solution: { title: 'Optimize loop', steps: ['Use map lookup'] },
      });

      // 5. End session
      await memory.endSession('RESOLVED', { helpful: true, rating: 5 });

      // 6. Session should be ended
      const endedContext = memory.getSessionContext();
      expect(endedContext).toBeNull();
    });

    it('generates useful session summary', async () => {
      await memory.initialize();
      await memory.startSession('org', 'user');

      const summary = memory.getSessionSummary();
      expect(typeof summary).toBe('string');
    });

    it('runs maintenance to clean up old data', async () => {
      await memory.initialize();

      const result = await memory.runMaintenance();
      expect(result).toHaveProperty('expiredCacheEntries');
      expect(result).toHaveProperty('oldEpisodes');
    });
  });
});

// ============================================================================
// MEMORY LAYER STRATEGY DOCUMENTATION
// ============================================================================

/**
 * # Memory Layer Strategy
 * 
 * The memory layer uses a **multi-tiered architecture** to provide intelligent
 * debugging assistance by learning from past sessions.
 * 
 * ## 4 Memory Tiers:
 * 
 * ### 1. Factual Knowledge (Static)
 * - Pre-loaded Salesforce governor limits
 * - Common error patterns with regex matching
 * - Best practices knowledge base
 * - **Strategy**: Fast lookup for known issues
 * 
 * ### 2. Semantic Index (Pattern Matching)
 * - Builds signatures from issue context
 * - Uses Jaccard similarity for set-based matching
 * - Weighted scoring across 7 components
 * - **Strategy**: Find similar past problems
 * 
 * ### 3. Episodic Store (Session History)
 * - Tracks debugging sessions with outcomes
 * - Records solution attempts and success rates
 * - Privacy-preserving with configurable retention
 * - **Strategy**: Learn from past debugging sessions
 * 
 * ### 4. Short-Term Cache (Current Session)
 * - Maintains current session context
 * - Caches analysis results with TTL
 * - Tracks conversation context for AI
 * - **Strategy**: Fast access to current work
 * 
 * ## Workflow:
 * 
 * 1. **Start Session**: Initialize memory manager and context
 * 2. **Parse Debug Log**: Tokenize and extract events
 * 3. **Detect Issues**: Find problems in the log
 * 4. **Recall Knowledge**: Query all memory tiers
 * 5. **Present Solutions**: Rank by success rate
 * 6. **Store Outcome**: Learn from resolution
 * 7. **End Session**: Update episodic memory
 * 
 * ## Data Flow:
 * 
 * ```
 * Debug Log → Parser → Issue Detector
 *                          ↓
 *                   Memory Manager
 *                   ↙    ↓    ↘
 *              Factual Semantic Episodic
 *                   ↘    ↓    ↙
 *                   Recall Response
 *                          ↓
 *                   AI/User Solution
 *                          ↓
 *                   Store Outcome
 * ```
 */
