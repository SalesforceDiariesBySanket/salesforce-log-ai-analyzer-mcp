/**
 * @module capture/connection-pool
 * @description Multi-org connection management with token refresh
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts
 * @lastModified 2026-01-31
 */

import type {
  SalesforceConnection,
  ConnectionPoolOptions,
  ConnectionPoolStatus,
  AuthResult,
} from '../types/capture';
import { refreshAccessToken, PRODUCTION_LOGIN_URL } from './oauth-pkce';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum connections */
const DEFAULT_MAX_CONNECTIONS = 10;

/** Default idle timeout (30 minutes) */
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Default refresh buffer (10 minutes before expiry) */
const DEFAULT_REFRESH_BUFFER_MINUTES = 10;

// ============================================================================
// Connection Pool
// ============================================================================

/**
 * Manages multiple Salesforce connections with automatic token refresh
 */
export class ConnectionPool {
  private connections: Map<string, SalesforceConnection> = new Map();
  private options: Required<ConnectionPoolOptions>;
  private defaultConnectionId: string | null = null;
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();
  private clientId: string;

  constructor(clientId: string, options: ConnectionPoolOptions = {}) {
    this.clientId = clientId;
    this.options = {
      maxConnections: options.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      autoRefresh: options.autoRefresh ?? true,
      refreshBufferMinutes: options.refreshBufferMinutes ?? DEFAULT_REFRESH_BUFFER_MINUTES,
    };
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Adds a connection to the pool
   */
  add(connection: SalesforceConnection): void {
    // Check if at capacity
    if (this.connections.size >= this.options.maxConnections) {
      // Remove the oldest idle connection
      this.removeOldestIdle();
    }

    this.connections.set(connection.id, connection);

    // Set as default if first connection
    if (!this.defaultConnectionId) {
      this.defaultConnectionId = connection.id;
    }

    // Schedule token refresh
    if (this.options.autoRefresh) {
      this.scheduleRefresh(connection);
    }

    // Start idle timer
    this.resetIdleTimer(connection.id);
  }

  /**
   * Gets a connection by ID
   */
  get(id: string): SalesforceConnection | undefined {
    const connection = this.connections.get(id);
    
    if (connection) {
      // Reset idle timer on access
      this.resetIdleTimer(id);
      connection.lastUsedAt = new Date();
    }

    return connection;
  }

  /**
   * Gets the default connection
   */
  getDefault(): SalesforceConnection | undefined {
    if (!this.defaultConnectionId) {
      return undefined;
    }
    return this.get(this.defaultConnectionId);
  }

  /**
   * Sets the default connection
   */
  setDefault(id: string): boolean {
    if (!this.connections.has(id)) {
      return false;
    }
    this.defaultConnectionId = id;
    return true;
  }

  /**
   * Gets a connection by org ID
   */
  getByOrgId(orgId: string): SalesforceConnection | undefined {
    for (const connection of this.connections.values()) {
      if (connection.orgId === orgId) {
        this.resetIdleTimer(connection.id);
        connection.lastUsedAt = new Date();
        return connection;
      }
    }
    return undefined;
  }

  /**
   * Gets a connection by username
   */
  getByUsername(username: string): SalesforceConnection | undefined {
    for (const connection of this.connections.values()) {
      if (connection.username === username) {
        this.resetIdleTimer(connection.id);
        connection.lastUsedAt = new Date();
        return connection;
      }
    }
    return undefined;
  }

  /**
   * Removes a connection from the pool
   */
  remove(id: string): boolean {
    const connection = this.connections.get(id);
    if (!connection) {
      return false;
    }

    // Clear timers
    this.clearTimers(id);

    // Remove from pool
    this.connections.delete(id);

    // Update default if needed
    if (this.defaultConnectionId === id) {
      this.defaultConnectionId = this.connections.keys().next().value || null;
    }

    return true;
  }

  /**
   * Lists all connections
   */
  list(): SalesforceConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Gets the number of connections
   */
  size(): number {
    return this.connections.size;
  }

  /**
   * Checks if a connection exists
   */
  has(id: string): boolean {
    return this.connections.has(id);
  }

  /**
   * Clears all connections
   */
  clear(): void {
    // Clear all timers
    for (const id of this.connections.keys()) {
      this.clearTimers(id);
    }

    this.connections.clear();
    this.defaultConnectionId = null;
  }

  // ============================================================================
  // Token Refresh
  // ============================================================================

  /**
   * Refreshes a connection's access token
   */
  async refresh(id: string): Promise<AuthResult> {
    const connection = this.connections.get(id);
    
    if (!connection) {
      return {
        success: false,
        error: 'Connection not found',
      };
    }

    // Only OAuth connections can be refreshed
    if (!connection.tokens.refreshToken) {
      return {
        success: false,
        error: 'No refresh token available',
        errorCode: 'INVALID_TOKEN',
      };
    }

    try {
      connection.authState = 'refreshing';

      const loginUrl = connection.orgType === 'sandbox' 
        ? 'https://test.salesforce.com'
        : PRODUCTION_LOGIN_URL;

      const newTokens = await refreshAccessToken(
        loginUrl,
        this.clientId,
        connection.tokens.refreshToken
      );

      // Update connection
      connection.tokens = {
        ...connection.tokens,
        ...newTokens,
      };
      connection.authState = 'connected';
      connection.lastUsedAt = new Date();

      // Reschedule refresh
      if (this.options.autoRefresh) {
        this.scheduleRefresh(connection);
      }

      return {
        success: true,
        connection,
      };
    } catch (error) {
      connection.authState = 'error';
      const message = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        error: message,
        errorCode: 'EXPIRED_TOKEN',
      };
    }
  }

  /**
   * Refreshes all connections that need it
   */
  async refreshAll(): Promise<Map<string, AuthResult>> {
    const results = new Map<string, AuthResult>();
    const now = Date.now();
    const bufferMs = this.options.refreshBufferMinutes * 60 * 1000;

    for (const connection of this.connections.values()) {
      const tokens = connection.tokens;
      
      // Check if refresh is needed
      if (tokens.refreshToken && tokens.expiresAt && tokens.expiresAt < now + bufferMs) {
        const result = await this.refresh(connection.id);
        results.set(connection.id, result);
      }
    }

    return results;
  }

  /**
   * Ensures a connection is valid, refreshing if needed
   */
  async ensureValid(id: string): Promise<AuthResult> {
    const connection = this.connections.get(id);
    
    if (!connection) {
      return {
        success: false,
        error: 'Connection not found',
      };
    }

    // Check if token is expired or about to expire
    const tokens = connection.tokens;
    const bufferMs = this.options.refreshBufferMinutes * 60 * 1000;
    
    if (tokens.expiresAt && tokens.expiresAt < Date.now() + bufferMs) {
      if (tokens.refreshToken) {
        return this.refresh(id);
      } else {
        return {
          success: false,
          error: 'Token expired and no refresh token available',
          errorCode: 'EXPIRED_TOKEN',
        };
      }
    }

    return {
      success: true,
      connection,
    };
  }

  // ============================================================================
  // Status & Monitoring
  // ============================================================================

  /**
   * Gets the pool status
   */
  getStatus(): ConnectionPoolStatus {
    const now = Date.now();
    let active = 0;
    let idle = 0;
    let expired = 0;

    for (const connection of this.connections.values()) {
      const tokens = connection.tokens;
      
      // Check if expired
      if (tokens.expiresAt && tokens.expiresAt < now) {
        expired++;
        continue;
      }

      // Check if recently used (within 5 minutes)
      if (connection.lastUsedAt && 
          now - connection.lastUsedAt.getTime() < 5 * 60 * 1000) {
        active++;
      } else {
        idle++;
      }
    }

    return {
      totalConnections: this.connections.size,
      activeConnections: active,
      idleConnections: idle,
      expiredConnections: expired,
    };
  }

  /**
   * Gets connection info for display
   */
  getConnectionInfo(): Array<{
    id: string;
    alias: string;
    username: string;
    orgId: string;
    orgType: string;
    state: string;
    isDefault: boolean;
    expiresIn: string | null;
    lastUsed: string | null;
  }> {
    const now = Date.now();
    const info = [];

    for (const connection of this.connections.values()) {
      const expiresAt = connection.tokens.expiresAt;
      let expiresIn: string | null = null;
      
      if (expiresAt) {
        const remaining = expiresAt - now;
        if (remaining < 0) {
          expiresIn = 'expired';
        } else if (remaining < 60000) {
          expiresIn = `${Math.floor(remaining / 1000)}s`;
        } else if (remaining < 3600000) {
          expiresIn = `${Math.floor(remaining / 60000)}m`;
        } else {
          expiresIn = `${Math.floor(remaining / 3600000)}h`;
        }
      }

      let lastUsed: string | null = null;
      if (connection.lastUsedAt) {
        const ago = now - connection.lastUsedAt.getTime();
        if (ago < 60000) {
          lastUsed = 'just now';
        } else if (ago < 3600000) {
          lastUsed = `${Math.floor(ago / 60000)}m ago`;
        } else {
          lastUsed = `${Math.floor(ago / 3600000)}h ago`;
        }
      }

      info.push({
        id: connection.id,
        alias: connection.alias,
        username: connection.username,
        orgId: connection.orgId,
        orgType: connection.orgType,
        state: connection.authState,
        isDefault: connection.id === this.defaultConnectionId,
        expiresIn,
        lastUsed,
      });
    }

    return info;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private scheduleRefresh(connection: SalesforceConnection): void {
    // Clear existing timer
    const existingTimer = this.refreshTimers.get(connection.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate when to refresh
    const tokens = connection.tokens;
    if (!tokens.refreshToken || !tokens.expiresAt) {
      return; // Can't refresh
    }

    const bufferMs = this.options.refreshBufferMinutes * 60 * 1000;
    const refreshAt = tokens.expiresAt - bufferMs;
    const delay = Math.max(0, refreshAt - Date.now());

    const timer = setTimeout(async () => {
      await this.refresh(connection.id);
    }, delay);

    this.refreshTimers.set(connection.id, timer);
  }

  private resetIdleTimer(id: string): void {
    // Clear existing timer
    const existingTimer = this.idleTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new idle timer
    const timer = setTimeout(() => {
      // Mark as idle (could remove or just mark)
      const connection = this.connections.get(id);
      if (connection) {
        // For now, just log that it's idle
        // In a more advanced implementation, we might disconnect idle connections
      }
    }, this.options.idleTimeoutMs);

    this.idleTimers.set(id, timer);
  }

  private clearTimers(id: string): void {
    const refreshTimer = this.refreshTimers.get(id);
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      this.refreshTimers.delete(id);
    }

    const idleTimer = this.idleTimers.get(id);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(id);
    }
  }

  private removeOldestIdle(): void {
    let oldestConnection: SalesforceConnection | null = null;
    let oldestTime = Infinity;

    for (const connection of this.connections.values()) {
      // Skip the default connection
      if (connection.id === this.defaultConnectionId) {
        continue;
      }

      const lastUsed = connection.lastUsedAt?.getTime() || 0;
      if (lastUsed < oldestTime) {
        oldestTime = lastUsed;
        oldestConnection = connection;
      }
    }

    if (oldestConnection) {
      this.remove(oldestConnection.id);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultPool: ConnectionPool | null = null;

/**
 * Gets or creates the default connection pool
 */
export function getConnectionPool(
  clientId?: string,
  options?: ConnectionPoolOptions
): ConnectionPool {
  if (!defaultPool && !clientId) {
    throw new Error('Client ID required to create connection pool');
  }

  if (!defaultPool) {
    defaultPool = new ConnectionPool(clientId!, options);
  }

  return defaultPool;
}

/**
 * Resets the default connection pool
 */
export function resetConnectionPool(): void {
  if (defaultPool) {
    defaultPool.clear();
    defaultPool = null;
  }
}
