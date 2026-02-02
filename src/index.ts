/**
 * @module index
 * @description Main package entry point
 * @status DRAFT
 * @see PROJECT_STATE.md
 * @dependencies all modules
 * @lastModified 2026-02-01
 */

// Type exports
export * from './types/index.js';

// Parser exports
export { parseLog, parseLogStream, parseLogStreamAsync } from './parser/index.js';
export type { ParseOptions, StreamEvent } from './parser/index.js';

// Analyzer exports
export { analyzeLog, analyzeEvents, quickAnalyze, getCriticalIssues, getFixableIssues } from './analyzer/index.js';
export type { AnalysisOptions, AnalysisResult } from './analyzer/index.js';

// Summarizer exports
export { generateSummary, generateMinimalSummary, generateMarkdownSummary } from './analyzer/summarizer.js';
export type { LogSummary, SummaryMetrics } from './analyzer/summarizer.js';
