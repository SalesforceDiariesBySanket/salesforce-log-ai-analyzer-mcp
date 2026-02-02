/**
 * @module capture/log-watcher
 * @description Watches for new debug logs in Salesforce
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts
 * @lastModified 2026-01-31
 */

import { EventEmitter } from 'events';
import type {
  SalesforceConnection,
  ApexLogRecord,
  LogWatchEvent,
  LogWatcherOptions,
  LogWatcherState,
  FetchedLog,
} from '../types/capture';
import { listLogs, fetchLog } from './log-fetcher';

// ============================================================================
// Constants
// ============================================================================

/** Default polling interval (5 seconds) */
const DEFAULT_POLL_INTERVAL_MS = 5000;

/** Maximum auto-fetch size (5 MB) */
const DEFAULT_MAX_AUTO_FETCH_SIZE = 5 * 1024 * 1024;

/** Minimum polling interval (1 second) */
const MIN_POLL_INTERVAL_MS = 1000;

/** Maximum polling interval (60 seconds) */
const MAX_POLL_INTERVAL_MS = 60000;

// ============================================================================
// Log Watcher Events
// ============================================================================

export interface LogWatcherEvents {
  /** New log detected */
  'log': (log: ApexLogRecord) => void;
  /** Log content ready (if auto-fetch enabled) */
  'log:ready': (log: FetchedLog) => void;
  /** Watcher started */
  'start': () => void;
  /** Watcher stopped */
  'stop': () => void;
  /** Error occurred */
  'error': (error: Error) => void;
  /** State changed */
  'state': (state: LogWatcherState) => void;
  /** Generic watch event */
  'event': (event: LogWatchEvent) => void;
}

// ============================================================================
// Log Watcher Class
// ============================================================================

/**
 * Watches for new debug logs in a Salesforce org
 */
export class LogWatcher extends EventEmitter {
  private connection: SalesforceConnection;
  private options: Required<LogWatcherOptions>;
  private state: LogWatcherState = 'stopped';
  private pollTimer: NodeJS.Timeout | null = null;
  private lastLogTime: Date | null = null;
  private seenLogIds: Set<string> = new Set();
  private isPolling: boolean = false;

  constructor(connection: SalesforceConnection, options: LogWatcherOptions = {}) {
    super();
    this.connection = connection;
    this.options = {
      userId: options.userId || connection.userId,
      pollIntervalMs: Math.min(
        MAX_POLL_INTERVAL_MS,
        Math.max(MIN_POLL_INTERVAL_MS, options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS)
      ),
      autoFetch: options.autoFetch ?? false,
      maxAutoFetchSize: options.maxAutoFetchSize || DEFAULT_MAX_AUTO_FETCH_SIZE,
      filter: options.filter || {},
    };
  }

  /**
   * Gets the current watcher state
   */
  getState(): LogWatcherState {
    return this.state;
  }

  /**
   * Checks if the watcher is running
   */
  isWatching(): boolean {
    return this.state === 'watching';
  }

  /**
   * Starts watching for new logs
   */
  async start(): Promise<void> {
    if (this.state === 'watching') {
      return; // Already watching
    }

    this.setState('starting');

    try {
      // Get the initial set of logs to establish baseline
      const initialLogs = await this.fetchLogs();
      
      // Mark all existing logs as seen
      for (const log of initialLogs) {
        this.seenLogIds.add(log.Id);
      }

      // Set last log time to now
      this.lastLogTime = new Date();

      // Start polling
      this.setState('watching');
      this.emit('start');
      this.schedulePoll();
    } catch (error) {
      this.setState('error');
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Stops watching for logs
   */
  stop(): void {
    if (this.state === 'stopped') {
      return;
    }

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this.setState('stopped');
    this.emit('stop');
  }

  /**
   * Restarts the watcher
   */
  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  /**
   * Updates watcher options
   */
  setOptions(options: Partial<LogWatcherOptions>): void {
    if (options.pollIntervalMs !== undefined) {
      this.options.pollIntervalMs = Math.min(
        MAX_POLL_INTERVAL_MS,
        Math.max(MIN_POLL_INTERVAL_MS, options.pollIntervalMs)
      );
    }
    if (options.autoFetch !== undefined) {
      this.options.autoFetch = options.autoFetch;
    }
    if (options.maxAutoFetchSize !== undefined) {
      this.options.maxAutoFetchSize = options.maxAutoFetchSize;
    }
    if (options.filter !== undefined) {
      this.options.filter = options.filter;
    }
  }

  /**
   * Clears the seen log cache
   */
  clearSeenLogs(): void {
    this.seenLogIds.clear();
  }

  /**
   * Gets the number of logs seen since start
   */
  getSeenLogCount(): number {
    return this.seenLogIds.size;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setState(state: LogWatcherState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('state', state);
    }
  }

  private schedulePoll(): void {
    if (this.state !== 'watching') {
      return;
    }

    this.pollTimer = setTimeout(() => {
      this.poll();
    }, this.options.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (this.state !== 'watching' || this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const logs = await this.fetchLogs();
      const newLogs: ApexLogRecord[] = [];

      for (const log of logs) {
        if (!this.seenLogIds.has(log.Id)) {
          this.seenLogIds.add(log.Id);
          newLogs.push(log);
        }
      }

      // Process new logs
      for (const log of newLogs.reverse()) { // Process in chronological order
        this.emit('log', log);
        this.emitWatchEvent('new_log', log);

        // Auto-fetch if enabled and size is within limit
        if (this.options.autoFetch && log.LogLength <= this.options.maxAutoFetchSize) {
          try {
            const result = await fetchLog(this.connection, log.Id);
            if (result.success && result.log) {
              this.emit('log:ready', result.log);
              this.emitWatchEvent('log_ready', log);
            }
          } catch (fetchError) {
            // Log fetch failed, emit error but continue watching
            this.emit('error', fetchError instanceof Error ? fetchError : new Error(String(fetchError)));
          }
        }
      }

      // Update last log time
      if (logs.length > 0) {
        this.lastLogTime = new Date(logs[0]!.StartTime);
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.emitWatchEvent('error', undefined, error instanceof Error ? error.message : String(error));
    } finally {
      this.isPolling = false;
      this.schedulePoll();
    }
  }

  private async fetchLogs(): Promise<ApexLogRecord[]> {
    return listLogs(this.connection, {
      ...this.options.filter,
      userId: this.options.userId,
      limit: 50,
      orderBy: 'StartTime',
      orderDirection: 'DESC',
      startTimeAfter: this.lastLogTime || undefined,
    });
  }

  private emitWatchEvent(
    type: LogWatchEvent['type'],
    log?: ApexLogRecord,
    error?: string
  ): void {
    // This is for any listeners expecting the LogWatchEvent format
    const event: LogWatchEvent = {
      type,
      log,
      error,
      timestamp: new Date(),
    };

    this.emit('event', event);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a log watcher for the current user
 */
export function createLogWatcher(
  connection: SalesforceConnection,
  options?: LogWatcherOptions
): LogWatcher {
  return new LogWatcher(connection, options);
}

/**
 * Watches for a single new log and resolves when found
 */
export async function waitForNextLog(
  connection: SalesforceConnection,
  options?: Omit<LogWatcherOptions, 'autoFetch'> & { 
    autoFetch?: boolean;
    timeoutMs?: number;
  }
): Promise<ApexLogRecord | FetchedLog> {
  const {
    timeoutMs = 120000, // 2 minute default timeout
    autoFetch = false,
    ...watcherOptions
  } = options || {};

  return new Promise((resolve, reject) => {
    const watcher = new LogWatcher(connection, {
      ...watcherOptions,
      autoFetch,
    });

    const timeout = setTimeout(() => {
      watcher.stop();
      reject(new Error('Timeout waiting for new log'));
    }, timeoutMs);

    if (autoFetch) {
      watcher.once('log:ready', (log: FetchedLog) => {
        clearTimeout(timeout);
        watcher.stop();
        resolve(log);
      });
    } else {
      watcher.once('log', (log: ApexLogRecord) => {
        clearTimeout(timeout);
        watcher.stop();
        resolve(log);
      });
    }

    watcher.once('error', (error: Error) => {
      clearTimeout(timeout);
      watcher.stop();
      reject(error);
    });

    watcher.start().catch(err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Collects logs for a duration
 */
export async function collectLogs(
  connection: SalesforceConnection,
  durationMs: number,
  options?: LogWatcherOptions
): Promise<ApexLogRecord[]> {
  const logs: ApexLogRecord[] = [];

  return new Promise((resolve, reject) => {
    const watcher = new LogWatcher(connection, options);

    const timeout = setTimeout(() => {
      watcher.stop();
      resolve(logs);
    }, durationMs);

    watcher.on('log', (log: ApexLogRecord) => {
      logs.push(log);
    });

    watcher.once('error', (error: Error) => {
      clearTimeout(timeout);
      watcher.stop();
      reject(error);
    });

    watcher.start().catch(err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ============================================================================
// Type Definitions for Event Emitter
// ============================================================================

// Augment EventEmitter with type safety
declare module 'events' {
  interface EventEmitter {
    on<K extends keyof LogWatcherEvents>(event: K, listener: LogWatcherEvents[K]): this;
    once<K extends keyof LogWatcherEvents>(event: K, listener: LogWatcherEvents[K]): this;
    emit<K extends keyof LogWatcherEvents>(event: K, ...args: Parameters<LogWatcherEvents[K]>): boolean;
    off<K extends keyof LogWatcherEvents>(event: K, listener: LogWatcherEvents[K]): this;
  }
}
