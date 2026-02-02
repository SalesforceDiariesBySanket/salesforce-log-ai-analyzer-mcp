/**
 * @module capture/auth-manager
 * @description Unified authentication manager with auto-selection of best auth method
 * @status COMPLETE
 * @see src/capture/STATE.md, Architecture/AI_SALESFORCE_DEBUG_ARCHITECTURE_V2.md Section 4.4
 * @dependencies src/types/capture.ts, src/capture/environment.ts
 * @lastModified 2026-02-01
 */

import type {
  AuthMethod,
  AuthResult,
  AuthFailure,
  SalesforceConnection,
  AuthManagerConfig,
  EnvironmentInfo,
} from '../types/capture';
import { performPKCEFlow, canUsePKCEFlow, refreshAccessToken, PRODUCTION_LOGIN_URL, DEFAULT_SCOPES } from './oauth-pkce';
import { performDeviceCodeFlow, DeviceCodeFlowOptions } from './device-code';
import { importSfdxAuth, isSfdxInstalled } from './sfdx-import';
import { authenticateWithManualToken } from './manual-token';
import { detectEnvironmentSync } from './environment';

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Detects the current environment capabilities
 * Uses shared environment detection utilities
 */
export async function detectEnvironment(): Promise<EnvironmentInfo> {
  // Check for SFDX asynchronously
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  const hasSfdx = isNode ? await isSfdxInstalled() : false;

  // Use the shared sync detection with the async SFDX result
  return detectEnvironmentSync(hasSfdx);
}

// ============================================================================
// Token Storage
// ============================================================================

/**
 * In-memory token storage (for current session)
 * For persistent storage, use the connection pool
 */
const connectionCache = new Map<string, SalesforceConnection>();

/**
 * Stores a connection in the cache
 */
export function cacheConnection(connection: SalesforceConnection): void {
  connectionCache.set(connection.id, connection);
}

/**
 * Retrieves a cached connection
 */
export function getCachedConnection(id: string): SalesforceConnection | undefined {
  return connectionCache.get(id);
}

/**
 * Lists all cached connections
 */
export function listCachedConnections(): SalesforceConnection[] {
  return Array.from(connectionCache.values());
}

/**
 * Removes a connection from cache
 */
export function removeCachedConnection(id: string): boolean {
  return connectionCache.delete(id);
}

/**
 * Clears all cached connections
 */
export function clearConnectionCache(): void {
  connectionCache.clear();
}

// ============================================================================
// Auth Manager
// ============================================================================

/**
 * Main authentication manager class
 */
export class AuthManager {
  private config: AuthManagerConfig;
  private currentConnection: SalesforceConnection | null = null;

  constructor(config: AuthManagerConfig = {}) {
    this.config = {
      preferredMethods: ['oauth_pkce', 'sfdx', 'device_code', 'manual_token'],
      enableSfdxFallback: true,
      enableManualToken: true,
      ...config,
    };
  }

  /**
   * Gets the current active connection
   */
  getCurrentConnection(): SalesforceConnection | null {
    return this.currentConnection;
  }

  /**
   * Sets the current active connection
   */
  setCurrentConnection(connection: SalesforceConnection | null): void {
    this.currentConnection = connection;
    if (connection) {
      cacheConnection(connection);
    }
  }

  /**
   * Checks if there's an active, valid connection
   */
  isConnected(): boolean {
    if (!this.currentConnection) {
      return false;
    }

    // Check if token is expired
    const tokens = this.currentConnection.tokens;
    if (tokens.expiresAt && tokens.expiresAt < Date.now()) {
      this.currentConnection.authState = 'expired';
      return false;
    }

    return this.currentConnection.authState === 'connected';
  }

  /**
   * Authenticates using the best available method
   */
  async authenticate(options: {
    /** Force a specific auth method */
    method?: AuthMethod;
    /** Target org type (production or sandbox) */
    isSandbox?: boolean;
    /** SFDX username/alias if using sfdx method */
    sfdxUsername?: string;
    /** Manual token if using manual_token method */
    manualToken?: string;
    /** Instance URL for manual token */
    instanceUrl?: string;
    /** Callbacks for device code flow */
    onDeviceCode?: DeviceCodeFlowOptions['onUserCode'];
    onDevicePollStatus?: DeviceCodeFlowOptions['onPollStatus'];
  } = {}): Promise<AuthResult> {
    const {
      method,
      isSandbox = false,
      sfdxUsername,
      manualToken,
      instanceUrl,
      onDeviceCode,
      onDevicePollStatus,
    } = options;

    const loginUrl = isSandbox ? 'https://test.salesforce.com' : PRODUCTION_LOGIN_URL;

    // If specific method requested, use it
    if (method) {
      return this.authenticateWithMethod(method, {
        loginUrl,
        sfdxUsername,
        manualToken,
        instanceUrl,
        onDeviceCode,
        onDevicePollStatus,
      });
    }

    // Auto-select best method
    const env = await detectEnvironment();
    
    // Track failure chain for transparency
    const failureChain: AuthFailure[] = [];
    
    // Try each recommended method in order
    for (const authMethod of this.config.preferredMethods || env.recommendedMethods) {
      // Skip methods that aren't enabled
      if (authMethod === 'sfdx' && !this.config.enableSfdxFallback) {
        continue;
      }
      if (authMethod === 'manual_token' && !this.config.enableManualToken) {
        continue;
      }

      // Skip PKCE if not supported
      if (authMethod === 'oauth_pkce' && !canUsePKCEFlow()) {
        failureChain.push({
          method: 'pkce',
          error: 'PKCE flow not supported in this environment',
          suggestion: 'Use device code flow for headless environments or SSH connections',
          timestamp: Date.now(),
        });
        continue;
      }

      // Skip device code if we can use PKCE
      if (authMethod === 'device_code' && canUsePKCEFlow()) {
        continue;
      }

      // Skip SFDX if not installed
      if (authMethod === 'sfdx' && !env.hasSfdx) {
        failureChain.push({
          method: 'sfdx_import',
          error: 'Salesforce CLI not found',
          suggestion: 'Install Salesforce CLI: npm install -g @salesforce/cli',
          timestamp: Date.now(),
        });
        continue;
      }

      // Skip manual token if not provided
      if (authMethod === 'manual_token' && !manualToken) {
        continue;
      }

      const result = await this.authenticateWithMethod(authMethod, {
        loginUrl,
        sfdxUsername,
        manualToken,
        instanceUrl,
        onDeviceCode,
        onDevicePollStatus,
      });

      if (result.success) {
        this.setCurrentConnection(result.connection!);
        // Include failure chain for transparency even on success
        const warnings = this.getWarningsForMethod(authMethod, env);
        return {
          ...result,
          method: this.mapAuthMethodToResultMethod(authMethod),
          failureChain: failureChain.length > 0 ? failureChain : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }

      // Record failure and try next method
      failureChain.push({
        method: this.mapAuthMethodToResultMethod(authMethod),
        error: result.error || 'Unknown error',
        suggestion: this.getSuggestionForError(authMethod, result.errorCode),
        timestamp: Date.now(),
      });
      console.warn(`Auth method ${authMethod} failed: ${result.error}`);
    }

    return {
      success: false,
      error: 'All authentication methods failed',
      failureChain,
    };
  }

  /**
   * Map internal auth method to AuthResult method type
   */
  private mapAuthMethodToResultMethod(method: AuthMethod): 'pkce' | 'device_code' | 'sfdx_import' | 'manual_token' {
    switch (method) {
      case 'oauth_pkce': return 'pkce';
      case 'device_code': return 'device_code';
      case 'sfdx': return 'sfdx_import';
      case 'manual_token': return 'manual_token';
      case 'refresh_token': return 'pkce'; // refresh_token is used with PKCE flow
      default: return 'manual_token'; // fallback
    }
  }

  /**
   * Get suggestions for specific error codes
   */
  private getSuggestionForError(method: AuthMethod, errorCode?: string): string {
    switch (errorCode) {
      case 'INVALID_GRANT':
        return 'The authorization grant is invalid or expired. Try re-authenticating.';
      case 'INVALID_CLIENT':
        return 'Check that the Connected App Client ID is correct and active.';
      case 'UNAUTHORIZED_CLIENT':
        return method === 'device_code' 
          ? 'Enable the PlatformCLI Connected App in Setup > Connected Apps.'
          : 'The Connected App is not authorized for this OAuth grant type.';
      case 'ACCESS_DENIED':
        return 'The user denied access or lacks permissions. Check profile/permission set.';
      case 'NETWORK_ERROR':
        return 'Network connection failed. Check your internet and Salesforce availability.';
      case 'SFDX_NOT_FOUND':
        return 'Install Salesforce CLI: npm install -g @salesforce/cli';
      case 'NO_DEFAULT_ORG':
        return 'No default org set. Run: sf config set target-org=<alias>';
      default:
        return 'Try a different authentication method or check org configuration.';
    }
  }

  /**
   * Get warnings for successful auth methods
   */
  private getWarningsForMethod(method: AuthMethod, env: EnvironmentInfo): string[] {
    const warnings: string[] = [];
    
    if (method === 'device_code') {
      warnings.push('Device Code flow worked but may not work in all Salesforce orgs. Some orgs disable the PlatformCLI app.');
    }
    
    if (method === 'sfdx' && env.isHeadless) {
      warnings.push('SFDX auth may expire. Consider setting up a refresh token for long-running processes.');
    }
    
    if (method === 'manual_token') {
      warnings.push('Manual tokens expire and must be refreshed manually. Consider using PKCE or Device Code for production.');
    }
    
    return warnings;
  }

  /**
   * Authenticates using a specific method
   */
  private async authenticateWithMethod(
    method: AuthMethod,
    options: {
      loginUrl: string;
      sfdxUsername?: string;
      manualToken?: string;
      instanceUrl?: string;
      onDeviceCode?: DeviceCodeFlowOptions['onUserCode'];
      onDevicePollStatus?: DeviceCodeFlowOptions['onPollStatus'];
    }
  ): Promise<AuthResult> {
    switch (method) {
      case 'oauth_pkce':
        return performPKCEFlow({
          clientId: this.config.clientId,
          loginUrl: options.loginUrl,
          callbackPort: 8888,
          scopes: DEFAULT_SCOPES,
        });

      case 'device_code':
        if (!this.config.clientId) {
          return {
            success: false,
            error: 'Client ID is required for device code flow',
            errorCode: 'INVALID_CLIENT',
          };
        }
        return performDeviceCodeFlow({
          clientId: this.config.clientId,
          loginUrl: options.loginUrl,
          scopes: DEFAULT_SCOPES,
          onUserCode: options.onDeviceCode,
          onPollStatus: options.onDevicePollStatus,
        });

      case 'sfdx':
        return importSfdxAuth({
          usernameOrAlias: options.sfdxUsername,
          useDefault: !options.sfdxUsername,
        });

      case 'manual_token':
        if (!options.manualToken || !options.instanceUrl) {
          return {
            success: false,
            error: 'Access token and instance URL are required',
            errorCode: 'INVALID_TOKEN',
          };
        }
        return authenticateWithManualToken({
          accessToken: options.manualToken,
          instanceUrl: options.instanceUrl,
        });

      case 'refresh_token':
        return this.refreshCurrentToken();

      default:
        return {
          success: false,
          error: `Unknown auth method: ${method}`,
        };
    }
  }

  /**
   * Refreshes the current connection's access token
   */
  async refreshCurrentToken(): Promise<AuthResult> {
    if (!this.currentConnection) {
      return {
        success: false,
        error: 'No current connection to refresh',
      };
    }

    const { tokens, authMethod } = this.currentConnection;

    // Only OAuth connections can be refreshed
    if (authMethod !== 'oauth_pkce' && authMethod !== 'device_code') {
      return {
        success: false,
        error: `Cannot refresh tokens for auth method: ${authMethod}`,
      };
    }

    if (!tokens.refreshToken) {
      return {
        success: false,
        error: 'No refresh token available',
        errorCode: 'INVALID_TOKEN',
      };
    }

    try {
      this.currentConnection.authState = 'refreshing';

      // Determine login URL from instance URL
      const isSandbox = this.currentConnection.instanceUrl.includes('sandbox') ||
                        this.currentConnection.instanceUrl.includes('test.salesforce.com') ||
                        this.currentConnection.orgType === 'sandbox';
      const loginUrl = isSandbox ? 'https://test.salesforce.com' : PRODUCTION_LOGIN_URL;

      const newTokens = await refreshAccessToken(
        loginUrl,
        this.config.clientId || 'SFDebugAnalyzer',
        tokens.refreshToken
      );

      // Update connection with new tokens
      this.currentConnection.tokens = {
        ...this.currentConnection.tokens,
        ...newTokens,
      };
      this.currentConnection.authState = 'connected';
      this.currentConnection.lastUsedAt = new Date();

      cacheConnection(this.currentConnection);

      return {
        success: true,
        connection: this.currentConnection,
      };
    } catch (error) {
      this.currentConnection.authState = 'error';
      const message = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        error: message,
        errorCode: 'EXPIRED_TOKEN',
      };
    }
  }

  /**
   * Ensures the current connection is valid, refreshing if needed
   */
  async ensureValidConnection(): Promise<AuthResult> {
    if (!this.currentConnection) {
      return {
        success: false,
        error: 'No connection established',
      };
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const tokens = this.currentConnection.tokens;
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    
    if (tokens.expiresAt && tokens.expiresAt < Date.now() + bufferMs) {
      // Try to refresh
      const refreshResult = await this.refreshCurrentToken();
      if (refreshResult.success) {
        return refreshResult;
      }

      // Refresh failed, need to re-authenticate
      return {
        success: false,
        error: 'Token expired and refresh failed. Please re-authenticate.',
        errorCode: 'EXPIRED_TOKEN',
      };
    }

    return {
      success: true,
      connection: this.currentConnection,
    };
  }

  /**
   * Disconnects the current connection
   */
  disconnect(): void {
    if (this.currentConnection) {
      this.currentConnection.authState = 'disconnected';
      removeCachedConnection(this.currentConnection.id);
      this.currentConnection = null;
    }
  }

  /**
   * Gets the access token for API calls, refreshing if needed
   */
  async getAccessToken(): Promise<string | null> {
    const result = await this.ensureValidConnection();
    if (!result.success || !result.connection) {
      return null;
    }
    return result.connection.tokens.accessToken;
  }

  /**
   * Gets the instance URL
   */
  getInstanceUrl(): string | null {
    return this.currentConnection?.instanceUrl || null;
  }

  /**
   * Gets the API version
   */
  getApiVersion(): string {
    return this.currentConnection?.apiVersion || 'v59.0';
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultAuthManager: AuthManager | null = null;

/**
 * Gets the default auth manager instance
 */
export function getAuthManager(config?: AuthManagerConfig): AuthManager {
  if (!defaultAuthManager || config) {
    defaultAuthManager = new AuthManager(config);
  }
  return defaultAuthManager;
}

/**
 * Convenience function to authenticate with auto-detection
 */
export async function authenticate(options?: Parameters<AuthManager['authenticate']>[0]): Promise<AuthResult> {
  const manager = getAuthManager();
  return manager.authenticate(options);
}

/**
 * Convenience function to check if connected
 */
export function isConnected(): boolean {
  return defaultAuthManager?.isConnected() ?? false;
}

/**
 * Convenience function to get current connection
 */
export function getCurrentConnection(): SalesforceConnection | null {
  return defaultAuthManager?.getCurrentConnection() ?? null;
}

/**
 * Convenience function to disconnect
 */
export function disconnect(): void {
  defaultAuthManager?.disconnect();
}
