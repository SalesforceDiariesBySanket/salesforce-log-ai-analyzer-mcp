/**
 * @module types/index
 * @description Central export for all type definitions
 * @status COMPLETE
 * @see src/types/STATE.md
 * @dependencies none
 * @lastModified 2026-01-31
 */

// Common types
export type {
  Result,
  AppError,
  ParseError,
  ParseErrorCode,
  Confidence,
  Nanoseconds,
  Milliseconds,
  Duration,
  PartialBy,
  RequiredBy,
  ResultData,
  ResultError,
} from './common';

export { ok, err, confidence } from './common';

// Event types
export type {
  EventType,
  LogToken,
  BaseEvent,
  MethodEvent,
  SOQLEvent,
  QueryPlan,
  DMLEvent,
  LimitEvent,
  LimitUsage,
  ExceptionEvent,
  ManagedPackageEvent,
  DebugEvent,
  VariableAssignmentEvent,
  StatementExecuteEvent,
  HeapAllocateEvent,
  SystemMethodEvent,
  SystemModeEvent,
  ValidationRuleEvent,
  ValidationFormulaEvent,
  FlowValueAssignmentEvent,
  FlowDetailEvent,
  WorkflowEvent,
  CodeUnitEvent,
  AsyncJobEvent,
  EventNode,
  LogMetadata,
  ParsedLog,
  TruncationInfo,
  ParseStats,
  EventHandler,
  ParseContext,
} from './events';

// Issue types
export type {
  IssueCategory,
  IssueType,
  IssueSeverity,
  IssueAttribution,
  AttributionInfo,
  Issue,
  AIIssueContext,
  EventSummary,
  IssueMetrics,
  FixPattern,
  IssueDetectionResult,
  IssueSummary,
  IssueDetector,
} from './issues';

// Truncation types (Phase 2)
export type {
  TruncationType,
  TruncationSeverity,
  TruncationDetection,
  TruncationIndicator,
  TruncationIndicatorType,
  LostInformationType,
  TruncationRecoveryStrategy,
  TruncationRecoveryPlan,
  DebugLevelRecommendation,
  TruncationAnalysis,
  TruncationAnalysisImpact,
  TruncationAnalysisMetadata,
  TruncationHandler,
} from './truncation';

// Managed package types (Phase 4)
export type {
  NamespaceVisibility,
  NamespaceCategory,
  NamespaceInfo,
  VendorInfo,
  ExecutionContext,
  BoundaryCrossing,
  Attribution,
  AttributionEvidence,
  AttributionEvidenceType,
  NamespaceStats,
  NamespaceSummary,
  ManagedPackageGuidance,
  ResourceLink,
  NamespaceDetector,
  AttributionEngine,
  AIGuidanceGenerator,
} from './managed';

// Capture types (Phase 9-10)
export type {
  AuthMethod,
  AuthState,
  OrgType,
  OAuthTokens,
  SalesforceConnection,
  OrgMetadata,
  PKCEConfig,
  DeviceCodeResponse,
  DeviceCodePollStatus,
  SFDXAuthInfo,
  AuthResult,
  AuthErrorCode,
  DebugLogLevel,
  DebugLogCategory,
  DebugLevel,
  DebugLevelPreset,
  TraceFlagTargetType,
  TraceFlag,
  CreateTraceFlagRequest,
  TraceFlagResult,
  ApexLogRecord,
  LogListFilter,
  FetchedLog,
  LogFetchResult,
  LogWatchEvent,
  LogWatcherOptions,
  LogWatcherState,
  ConnectionPoolOptions,
  ConnectionPoolStatus,
  ToolingAPIRequest,
  ToolingAPIResponse,
  QueryResult,
  CaptureSession,
  AuthManagerConfig,
  EnvironmentInfo,
} from './capture';

// Async types (Phase 11)
export type {
  AsyncJobType,
  AsyncJobStatus,
  AsyncJobRef,
  AsyncApexJobRecord,
  CorrelationResult,
  CorrelationReason,
  MatchDetail,
  UnifiedView,
  UnifiedExecutionNode,
  UnifiedLogInfo,
  UnifiedSummary,
  CorrelationOptions,
  JobExtractionResult,
  JobTrackingResult,
} from './async';

export { DEFAULT_CORRELATION_OPTIONS } from './async';

// Memory types (Phase 13)
export type {
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
} from './memory';

export { DEFAULT_MEMORY_CONFIG } from './memory';
