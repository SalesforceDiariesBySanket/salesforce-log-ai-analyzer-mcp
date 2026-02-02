/**
 * @module memory/factual
 * @description Static Salesforce debugging knowledge store
 * @status COMPLETE
 * @see src/memory/STATE.md
 * @dependencies src/types/memory.ts
 * @lastModified 2026-01-31
 */

import type {
  FactualKnowledge,
  GovernorLimitFact,
  ErrorPatternFact,
  KnowledgeCategory,
} from '../types/memory';

// ============================================================================
// Governor Limits Knowledge
// ============================================================================

/**
 * Salesforce Governor Limits (API v59.0)
 */
export const GOVERNOR_LIMITS: GovernorLimitFact[] = [
  {
    name: 'SOQL_QUERIES',
    syncLimit: 100,
    asyncLimit: 200,
    perNamespace: false,
    description: 'Total number of SOQL queries issued',
    avoidanceTips: [
      'Move SOQL queries outside of loops',
      'Use collections and maps to cache query results',
      'Use relationship queries to reduce query count',
      'Consider using Custom Metadata Types for frequently accessed configuration',
    ],
  },
  {
    name: 'SOQL_QUERY_ROWS',
    syncLimit: 50000,
    asyncLimit: 50000,
    perNamespace: false,
    description: 'Total number of records retrieved by SOQL queries',
    avoidanceTips: [
      'Use selective queries with indexed fields in WHERE clause',
      'Add LIMIT clause to queries',
      'Use pagination for large datasets',
      'Filter data in SOQL rather than in Apex',
    ],
  },
  {
    name: 'DML_STATEMENTS',
    syncLimit: 150,
    asyncLimit: 150,
    perNamespace: false,
    description: 'Total number of DML statements issued',
    avoidanceTips: [
      'Bulkify DML operations using collections',
      'Combine insert/update operations where possible',
      'Use Database.insert with partial success',
    ],
  },
  {
    name: 'DML_ROWS',
    syncLimit: 10000,
    asyncLimit: 10000,
    perNamespace: false,
    description: 'Total number of records processed by DML statements',
    avoidanceTips: [
      'Use batch Apex for large data volumes',
      'Implement chunking for mass operations',
      'Consider async processing for bulk updates',
    ],
  },
  {
    name: 'CPU_TIME',
    syncLimit: 10000,
    asyncLimit: 60000,
    perNamespace: false,
    description: 'Maximum CPU time on Salesforce servers (milliseconds)',
    avoidanceTips: [
      'Optimize loops and avoid nested iterations',
      'Use maps instead of nested loops for lookups',
      'Move complex logic to async processing',
      'Avoid string concatenation in loops, use List.join()',
    ],
  },
  {
    name: 'HEAP_SIZE',
    syncLimit: 6000000,
    asyncLimit: 12000000,
    perNamespace: false,
    description: 'Maximum heap size (bytes)',
    avoidanceTips: [
      'Process data in batches',
      'Avoid storing large strings or objects in memory',
      'Use transient keyword for variables not needed in view state',
      'Clear collections when no longer needed',
    ],
  },
  {
    name: 'CALLOUTS',
    syncLimit: 100,
    asyncLimit: 100,
    perNamespace: false,
    description: 'Total number of callouts (HTTP requests or Web services)',
    avoidanceTips: [
      'Batch callout requests where possible',
      'Use async methods for non-critical callouts',
      'Implement caching for frequently accessed external data',
    ],
  },
  {
    name: 'FUTURE_CALLS',
    syncLimit: 50,
    asyncLimit: 50,
    perNamespace: false,
    description: 'Total number of @future method invocations',
    avoidanceTips: [
      'Bulkify @future methods to process collections',
      'Consider Queueable Apex for chaining',
      'Use Platform Events for high volume async',
    ],
  },
  {
    name: 'QUEUEABLE_JOBS',
    syncLimit: 50,
    asyncLimit: 50,
    perNamespace: false,
    description: 'Maximum number of Queueable jobs added to queue',
    avoidanceTips: [
      'Chain queueable jobs instead of adding multiple',
      'Use batch Apex for large processing needs',
      'Implement job manager pattern for complex workflows',
    ],
  },
  {
    name: 'SOSL_QUERIES',
    syncLimit: 20,
    asyncLimit: 20,
    perNamespace: false,
    description: 'Total number of SOSL queries issued',
    avoidanceTips: [
      'Cache SOSL results when possible',
      'Use SOQL when exact field matches are needed',
      'Combine search terms in single SOSL query',
    ],
  },
];

// ============================================================================
// Error Pattern Knowledge
// ============================================================================

/**
 * Common Salesforce error patterns and resolutions
 */
export const ERROR_PATTERNS: ErrorPatternFact[] = [
  {
    name: 'SOQL_IN_LOOP',
    messagePatterns: [
      'Too many SOQL queries: \\d+',
      'System\\.LimitException.*SOQL',
    ],
    rootCause: 'SOQL queries executed inside a loop, quickly exhausting the 100 query limit',
    resolution: [
      'Move the SOQL query outside the loop',
      'Collect all IDs first, then query once with IN clause',
      'Use a Map to cache query results',
    ],
    codeExamples: [
      {
        language: 'apex',
        before: `// BAD: Query in loop
for (Account acc : accounts) {
    List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
}`,
        after: `// GOOD: Single bulkified query
Set<Id> accountIds = new Set<Id>();
for (Account acc : accounts) {
    accountIds.add(acc.Id);
}
Map<Id, List<Contact>> contactsByAccount = new Map<Id, List<Contact>>();
for (Contact c : [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds]) {
    if (!contactsByAccount.containsKey(c.AccountId)) {
        contactsByAccount.put(c.AccountId, new List<Contact>());
    }
    contactsByAccount.get(c.AccountId).add(c);
}`,
      },
    ],
  },
  {
    name: 'N_PLUS_ONE',
    messagePatterns: [
      'Too many SOQL queries',
      'SOQL queries: (\\d{2,3})',
    ],
    rootCause: 'Querying for related records one at a time instead of using relationship queries',
    resolution: [
      'Use SOQL relationship queries (subqueries)',
      'Collect IDs and query in batch',
      'Use Parent-to-Child or Child-to-Parent relationship queries',
    ],
    codeExamples: [
      {
        language: 'apex',
        before: `// BAD: N+1 pattern
List<Account> accounts = [SELECT Id, Name FROM Account LIMIT 100];
for (Account acc : accounts) {
    List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
}`,
        after: `// GOOD: Single query with subquery
List<Account> accounts = [
    SELECT Id, Name, 
           (SELECT Id, Name FROM Contacts)
    FROM Account 
    LIMIT 100
];
for (Account acc : accounts) {
    List<Contact> contacts = acc.Contacts;
}`,
      },
    ],
  },
  {
    name: 'RECURSIVE_TRIGGER',
    messagePatterns: [
      'maximum trigger depth exceeded',
      'too many trigger invocations',
    ],
    rootCause: 'Trigger causes DML that fires the same trigger again, creating infinite loop',
    resolution: [
      'Implement static flag to prevent recursion',
      'Use trigger handler pattern with recursion control',
      'Review trigger logic to avoid self-referencing updates',
    ],
    codeExamples: [
      {
        language: 'apex',
        before: `// BAD: No recursion prevention
trigger AccountTrigger on Account (after update) {
    List<Account> toUpdate = new List<Account>();
    for (Account acc : Trigger.new) {
        acc.Description = 'Updated';
        toUpdate.add(acc);
    }
    update toUpdate; // Causes recursion!
}`,
        after: `// GOOD: With recursion prevention
public class TriggerHandler {
    private static Boolean isExecuting = false;
    
    public static Boolean shouldRun() {
        if (isExecuting) return false;
        isExecuting = true;
        return true;
    }
    
    public static void reset() {
        isExecuting = false;
    }
}

trigger AccountTrigger on Account (after update) {
    if (!TriggerHandler.shouldRun()) return;
    try {
        // Trigger logic here
    } finally {
        TriggerHandler.reset();
    }
}`,
      },
    ],
  },
  {
    name: 'NON_SELECTIVE_QUERY',
    messagePatterns: [
      'Non-selective query',
      'large data volume',
      'query more selective',
    ],
    rootCause: 'Query lacks proper filter criteria on indexed fields, causing full table scan',
    resolution: [
      'Add indexed fields to WHERE clause',
      'Use selective filter criteria (less than 30% of records)',
      'Create custom indexes for frequently queried fields',
      'Review query plan with Query Plan tool',
    ],
  },
  {
    name: 'MIXED_DML',
    messagePatterns: [
      'MIXED_DML_OPERATION',
      'DML operation on setup object',
    ],
    rootCause: 'Attempting to perform DML on both setup and non-setup objects in same transaction',
    resolution: [
      'Separate setup object DML into @future method',
      'Use System.runAs() to create separate context',
      'Reorder operations to avoid mixing',
    ],
  },
  {
    name: 'NULL_POINTER',
    messagePatterns: [
      'System\\.NullPointerException',
      'Attempt to de-reference a null object',
    ],
    rootCause: 'Accessing property or method on a null object reference',
    resolution: [
      'Add null checks before accessing object properties',
      'Initialize collections before use',
      'Verify query results are not empty before accessing',
      'Use safe navigation operator (?.) in Apex',
    ],
  },
  {
    name: 'LIST_INDEX_BOUNDS',
    messagePatterns: [
      'List index out of bounds',
      'Index \\d+ is out of bounds',
    ],
    rootCause: 'Attempting to access list element at invalid index',
    resolution: [
      'Check list size before accessing by index',
      'Use isEmpty() check before accessing first element',
      'Consider using for-each loop instead of index-based access',
    ],
  },
  {
    name: 'FIELD_INTEGRITY',
    messagePatterns: [
      'FIELD_INTEGRITY_EXCEPTION',
      'field integrity exception',
    ],
    rootCause: 'Required field missing or invalid field value during DML operation',
    resolution: [
      'Ensure all required fields are populated',
      'Check field-level security permissions',
      'Validate data before DML operations',
    ],
  },
  {
    name: 'UNABLE_TO_LOCK_ROW',
    messagePatterns: [
      'UNABLE_TO_LOCK_ROW',
      'unable to obtain exclusive access',
    ],
    rootCause: 'Record is locked by another transaction, concurrent access conflict',
    resolution: [
      'Implement retry logic with exponential backoff',
      'Use FOR UPDATE clause selectively',
      'Review process design to minimize lock contention',
      'Consider async processing for non-critical updates',
    ],
  },
  {
    name: 'STRING_TOO_LONG',
    messagePatterns: [
      'STRING_TOO_LONG',
      'data value too large',
    ],
    rootCause: 'Text value exceeds field length limit',
    resolution: [
      'Truncate string before assignment',
      'Use Long Text Area for large content',
      'Validate input length in UI or validation rule',
    ],
  },
];

// ============================================================================
// Best Practices Knowledge
// ============================================================================

/**
 * Built-in factual knowledge base
 */
export const FACTUAL_KNOWLEDGE_BASE: FactualKnowledge[] = [
  // Trigger Best Practices
  {
    id: 'BP-TRIGGER-001',
    category: 'TRIGGER_PATTERNS',
    title: 'One Trigger Per Object',
    content: 'Implement one trigger per object with all logic delegated to a handler class. This ensures execution order control and maintainability.',
    keywords: ['trigger', 'handler', 'pattern', 'best practice'],
    relatedIssueCodes: ['RECURSIVE_TRIGGER'],
    verifiedAt: new Date('2026-01-01'),
    source: 'OFFICIAL_DOCS',
  },
  {
    id: 'BP-TRIGGER-002',
    category: 'TRIGGER_PATTERNS',
    title: 'Bulkify Trigger Code',
    content: 'Always design triggers to handle bulk operations (up to 200 records). Avoid SOQL/DML inside loops and use collections.',
    keywords: ['bulkify', 'trigger', 'bulk', 'collection'],
    relatedIssueCodes: ['SOQL_IN_LOOP', 'DML_IN_LOOP'],
    verifiedAt: new Date('2026-01-01'),
    source: 'OFFICIAL_DOCS',
  },
  // SOQL Best Practices
  {
    id: 'BP-SOQL-001',
    category: 'SOQL_PATTERNS',
    title: 'Use Selective Queries',
    content: 'Always include indexed fields in WHERE clause. Standard indexed fields include: Id, Name, OwnerId, CreatedDate, SystemModstamp, RecordType, and lookup/master-detail fields.',
    keywords: ['soql', 'selective', 'index', 'query', 'performance'],
    relatedIssueCodes: ['NON_SELECTIVE_QUERY'],
    verifiedAt: new Date('2026-01-01'),
    source: 'OFFICIAL_DOCS',
  },
  {
    id: 'BP-SOQL-002',
    category: 'SOQL_PATTERNS',
    title: 'Query Only Required Fields',
    content: 'Avoid SELECT * patterns. Query only the fields you need to minimize heap usage and improve query performance.',
    keywords: ['soql', 'fields', 'select', 'performance', 'heap'],
    relatedIssueCodes: ['HEAP_SIZE'],
    verifiedAt: new Date('2026-01-01'),
    source: 'OFFICIAL_DOCS',
  },
  // Async Apex Best Practices
  {
    id: 'BP-ASYNC-001',
    category: 'ASYNC_APEX',
    title: 'Choose Right Async Method',
    content: 'Use @future for simple async callouts. Use Queueable for chaining and state. Use Batch for processing large datasets. Use Scheduled for time-based execution.',
    keywords: ['future', 'queueable', 'batch', 'scheduled', 'async'],
    relatedIssueCodes: ['FUTURE_CALLS', 'QUEUEABLE_JOBS'],
    verifiedAt: new Date('2026-01-01'),
    source: 'OFFICIAL_DOCS',
  },
  {
    id: 'BP-ASYNC-002',
    category: 'ASYNC_APEX',
    title: 'Batch Size Optimization',
    content: 'Default batch size is 200. Reduce to 50-100 for complex processing or callouts. Increase up to 2000 for simple operations to reduce overhead.',
    keywords: ['batch', 'size', 'scope', 'performance'],
    relatedIssueCodes: [],
    verifiedAt: new Date('2026-01-01'),
    source: 'OFFICIAL_DOCS',
  },
  // Performance Best Practices
  {
    id: 'BP-PERF-001',
    category: 'PERFORMANCE',
    title: 'Use Maps for Lookups',
    content: 'Replace nested loops with Map lookups. Map lookup is O(1) vs O(n) for list iteration, dramatically improving CPU time.',
    keywords: ['map', 'performance', 'cpu', 'loop', 'lookup'],
    relatedIssueCodes: ['CPU_TIME'],
    verifiedAt: new Date('2026-01-01'),
    source: 'COMMUNITY',
  },
  {
    id: 'BP-PERF-002',
    category: 'PERFORMANCE',
    title: 'Avoid String Concatenation in Loops',
    content: 'Use List<String> with String.join() instead of concatenating strings in loops. Each concatenation creates a new string object.',
    keywords: ['string', 'concatenation', 'performance', 'heap'],
    relatedIssueCodes: ['CPU_TIME', 'HEAP_SIZE'],
    verifiedAt: new Date('2026-01-01'),
    source: 'COMMUNITY',
  },
  // Managed Package Knowledge
  {
    id: 'BP-PKG-001',
    category: 'MANAGED_PACKAGES',
    title: 'Namespace Limits Are Separate',
    content: 'Each managed package namespace has its own set of governor limits. Code from different namespaces does not share limits.',
    keywords: ['managed', 'package', 'namespace', 'limits', 'governor'],
    relatedIssueCodes: [],
    verifiedAt: new Date('2026-01-01'),
    source: 'OFFICIAL_DOCS',
  },
  {
    id: 'BP-PKG-002',
    category: 'MANAGED_PACKAGES',
    title: 'Global Methods Are Visible',
    content: 'Only global methods and classes are visible in debug logs from managed packages. Internal logic is obfuscated.',
    keywords: ['managed', 'package', 'global', 'debug', 'visibility'],
    relatedIssueCodes: [],
    verifiedAt: new Date('2026-01-01'),
    source: 'OFFICIAL_DOCS',
  },
];

// ============================================================================
// Knowledge Store Class
// ============================================================================

/**
 * Factual knowledge store for Salesforce debugging
 */
export class FactualKnowledgeStore {
  private knowledge: Map<string, FactualKnowledge>;
  private governorLimits: Map<string, GovernorLimitFact>;
  private errorPatterns: Map<string, ErrorPatternFact>;
  private categoryIndex: Map<KnowledgeCategory, string[]>;
  private keywordIndex: Map<string, string[]>;

  constructor() {
    this.knowledge = new Map();
    this.governorLimits = new Map();
    this.errorPatterns = new Map();
    this.categoryIndex = new Map();
    this.keywordIndex = new Map();

    this.initialize();
  }

  /**
   * Initialize with built-in knowledge
   */
  private initialize(): void {
    // Load factual knowledge
    for (const fact of FACTUAL_KNOWLEDGE_BASE) {
      this.addKnowledge(fact);
    }

    // Load governor limits
    for (const limit of GOVERNOR_LIMITS) {
      this.governorLimits.set(limit.name, limit);
    }

    // Load error patterns
    for (const pattern of ERROR_PATTERNS) {
      this.errorPatterns.set(pattern.name, pattern);
    }
  }

  /**
   * Add knowledge to the store
   */
  addKnowledge(knowledge: FactualKnowledge): void {
    this.knowledge.set(knowledge.id, knowledge);

    // Index by category
    const categoryList = this.categoryIndex.get(knowledge.category) ?? [];
    categoryList.push(knowledge.id);
    this.categoryIndex.set(knowledge.category, categoryList);

    // Index by keywords
    for (const keyword of knowledge.keywords) {
      const keywordLower = keyword.toLowerCase();
      const keywordList = this.keywordIndex.get(keywordLower) ?? [];
      keywordList.push(knowledge.id);
      this.keywordIndex.set(keywordLower, keywordList);
    }
  }

  /**
   * Get knowledge by ID
   */
  getKnowledge(id: string): FactualKnowledge | undefined {
    return this.knowledge.get(id);
  }

  /**
   * Get all knowledge in a category
   */
  getByCategory(category: KnowledgeCategory): FactualKnowledge[] {
    const ids = this.categoryIndex.get(category) ?? [];
    return ids.map((id) => this.knowledge.get(id)!).filter(Boolean);
  }

  /**
   * Search knowledge by keywords
   */
  searchByKeywords(keywords: string[]): FactualKnowledge[] {
    const matchingIds = new Set<string>();
    const scores = new Map<string, number>();

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      const ids = this.keywordIndex.get(keywordLower) ?? [];
      for (const id of ids) {
        matchingIds.add(id);
        scores.set(id, (scores.get(id) ?? 0) + 1);
      }
    }

    // Sort by score (number of matching keywords)
    const sortedIds = Array.from(matchingIds).sort(
      (a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0)
    );

    return sortedIds.map((id) => this.knowledge.get(id)!).filter(Boolean);
  }

  /**
   * Find knowledge related to an issue code
   */
  getByIssueCode(issueCode: string): FactualKnowledge[] {
    const results: FactualKnowledge[] = [];
    for (const knowledge of this.knowledge.values()) {
      if (knowledge.relatedIssueCodes.includes(issueCode)) {
        results.push(knowledge);
      }
    }
    return results;
  }

  /**
   * Get governor limit information
   */
  getGovernorLimit(name: string): GovernorLimitFact | undefined {
    return this.governorLimits.get(name);
  }

  /**
   * Get all governor limits
   */
  getAllGovernorLimits(): GovernorLimitFact[] {
    return Array.from(this.governorLimits.values());
  }

  /**
   * Get error pattern information
   */
  getErrorPattern(name: string): ErrorPatternFact | undefined {
    return this.errorPatterns.get(name);
  }

  /**
   * Find error pattern by message
   */
  findErrorPatternByMessage(message: string): ErrorPatternFact | undefined {
    for (const pattern of this.errorPatterns.values()) {
      for (const regexStr of pattern.messagePatterns) {
        const regex = new RegExp(regexStr, 'i');
        if (regex.test(message)) {
          return pattern;
        }
      }
    }
    return undefined;
  }

  /**
   * Get all error patterns
   */
  getAllErrorPatterns(): ErrorPatternFact[] {
    return Array.from(this.errorPatterns.values());
  }

  /**
   * Get statistics
   */
  getStats(): { knowledge: number; limits: number; patterns: number } {
    return {
      knowledge: this.knowledge.size,
      limits: this.governorLimits.size,
      patterns: this.errorPatterns.size,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance: FactualKnowledgeStore | null = null;

/**
 * Get the factual knowledge store singleton
 */
export function getFactualKnowledgeStore(): FactualKnowledgeStore {
  if (!_instance) {
    _instance = new FactualKnowledgeStore();
  }
  return _instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetFactualKnowledgeStore(): void {
  _instance = null;
}
