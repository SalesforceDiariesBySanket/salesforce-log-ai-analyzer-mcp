/**
 * @module capture/oauth-pkce
 * @description OAuth 2.0 PKCE flow for browser-based Salesforce authentication
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts, src/capture/environment.ts
 * @lastModified 2026-02-01
 */

import * as crypto from 'crypto';
import * as http from 'http';
import * as url from 'url';
import type {
  PKCEConfig,
  OAuthTokens,
  AuthResult,
  SalesforceConnection,
  OrgMetadata,
} from '../types/capture';
import { type Result, ok, err, type AppError } from '../types/common';
import { canUsePKCEFlowCheck } from './environment';

// ============================================================================
// Error Types
// ============================================================================

/** Token exchange error codes */
export type TokenErrorCode = 
  | 'TOKEN_EXCHANGE_FAILED'
  | 'TOKEN_REFRESH_FAILED'
  | 'IDENTITY_FETCH_FAILED'
  | 'NETWORK_ERROR';

/** Token operation error */
export interface TokenError extends AppError {
  code: TokenErrorCode;
  statusCode?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default Salesforce OAuth scopes */
export const DEFAULT_SCOPES = [
  'api',
  'refresh_token',
  'openid',
  'profile',
];

/** Production login URL */
export const PRODUCTION_LOGIN_URL = 'https://login.salesforce.com';

/** Sandbox login URL */
export const SANDBOX_LOGIN_URL = 'https://test.salesforce.com';

/** Default redirect URI for local callback server */
export const DEFAULT_REDIRECT_URI = 'http://localhost:8888/oauth/callback';

/** Default client ID - users should provide their own Connected App */
export const DEFAULT_CLIENT_ID = 'SFDebugAnalyzer';

// ============================================================================
// PKCE Utilities
// ============================================================================

/**
 * Generates a cryptographically random code verifier
 * Must be 43-128 characters using [A-Z], [a-z], [0-9], "-", ".", "_", "~"
 */
export function generateCodeVerifier(): string {
  // Generate 32 random bytes = 43 characters when base64url encoded
  const buffer = crypto.randomBytes(32);
  return base64URLEncode(buffer);
}

/**
 * Generates the code challenge from the code verifier
 * SHA256 hash of the verifier, base64url encoded
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64URLEncode(hash);
}

/**
 * Base64 URL encoding (no padding, URL-safe characters)
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

// ============================================================================
// PKCE Configuration
// ============================================================================

/**
 * Creates a PKCE configuration with generated code verifier/challenge
 */
export function createPKCEConfig(options: {
  clientId?: string;
  redirectUri?: string;
  loginUrl?: string;
  scopes?: string[];
}): PKCEConfig {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return {
    clientId: options.clientId || DEFAULT_CLIENT_ID,
    redirectUri: options.redirectUri || DEFAULT_REDIRECT_URI,
    loginUrl: options.loginUrl || PRODUCTION_LOGIN_URL,
    scopes: options.scopes || DEFAULT_SCOPES,
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

// ============================================================================
// Authorization URL
// ============================================================================

/**
 * Builds the authorization URL for the OAuth flow
 */
export function buildAuthorizationUrl(
  config: PKCEConfig,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    state,
    code_challenge: config.codeChallenge!,
    code_challenge_method: config.codeChallengeMethod,
    prompt: 'login consent', // Always prompt for login
  });

  return `${config.loginUrl}/services/oauth2/authorize?${params.toString()}`;
}

// ============================================================================
// Token Exchange
// ============================================================================

/** Default token expiry in seconds */
const DEFAULT_TOKEN_EXPIRY_SECONDS = 7200;

/**
 * Exchanges the authorization code for tokens
 * 
 * @param config - PKCE configuration
 * @param authorizationCode - Authorization code from OAuth callback
 * @returns Result with tokens on success, TokenError on failure
 */
export async function exchangeCodeForTokens(
  config: PKCEConfig,
  authorizationCode: string
): Promise<Result<OAuthTokens, TokenError>> {
  const tokenUrl = `${config.loginUrl}/services/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code: authorizationCode,
    code_verifier: config.codeVerifier!,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      return err({
        code: 'TOKEN_EXCHANGE_FAILED',
        message: `Token exchange failed: ${errorData.error_description || errorData.error || response.statusText}`,
        statusCode: response.status,
        context: { error: errorData.error, errorDescription: errorData.error_description },
      });
    }

    const data = await response.json() as Record<string, unknown>;

    return ok({
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      instanceUrl: data.instance_url as string,
      tokenType: (data.token_type as string) || 'Bearer',
      scope: data.scope as string | undefined,
      idToken: data.id_token as string | undefined,
      expiresAt: data.issued_at 
        ? parseInt(data.issued_at as string, 10) + ((data.expires_in as number) || DEFAULT_TOKEN_EXPIRY_SECONDS) * 1000
        : Date.now() + DEFAULT_TOKEN_EXPIRY_SECONDS * 1000,
    });
  } catch (error) {
    return err({
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network request failed',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Refreshes an access token using a refresh token
 * 
 * @param loginUrl - Salesforce login URL
 * @param clientId - OAuth client ID
 * @param refreshToken - Refresh token to use
 * @returns Result with new tokens on success, TokenError on failure
 */
export async function refreshAccessToken(
  loginUrl: string,
  clientId: string,
  refreshToken: string
): Promise<Result<OAuthTokens, TokenError>> {
  const tokenUrl = `${loginUrl}/services/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
      return err({
        code: 'TOKEN_REFRESH_FAILED',
        message: `Token refresh failed: ${errorData.error_description || errorData.error || response.statusText}`,
        statusCode: response.status,
        context: { error: errorData.error, errorDescription: errorData.error_description },
      });
    }

    const data = await response.json() as Record<string, unknown>;

    return ok({
      accessToken: data.access_token as string,
      refreshToken: refreshToken, // Salesforce doesn't always return a new refresh token
      instanceUrl: data.instance_url as string,
      tokenType: (data.token_type as string) || 'Bearer',
      scope: data.scope as string | undefined,
      idToken: data.id_token as string | undefined,
      expiresAt: Date.now() + ((data.expires_in as number) || DEFAULT_TOKEN_EXPIRY_SECONDS) * 1000,
    });
  } catch (error) {
    return err({
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network request failed',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================================================
// User Identity
// ============================================================================

/** User identity information */
export interface UserIdentity {
  userId: string;
  username: string;
  orgId: string;
}

/**
 * Fetches user identity information from Salesforce
 * 
 * @param tokens - OAuth tokens with valid access token
 * @returns Result with user identity on success, TokenError on failure
 */
export async function fetchUserIdentity(
  tokens: OAuthTokens
): Promise<Result<UserIdentity, TokenError>> {
  const idUrl = `${tokens.instanceUrl}/services/oauth2/userinfo`;

  try {
    const response = await fetch(idUrl, {
      method: 'GET',
      headers: {
        'Authorization': `${tokens.tokenType} ${tokens.accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return err({
        code: 'IDENTITY_FETCH_FAILED',
        message: `Failed to fetch user identity: ${response.statusText}`,
        statusCode: response.status,
      });
    }

    const data = await response.json() as Record<string, unknown>;

    return ok({
      userId: data.user_id as string,
      username: (data.preferred_username || data.email) as string,
      orgId: data.organization_id as string,
    });
  } catch (error) {
    return err({
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network request failed',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Fetches organization metadata
 */
export async function fetchOrgMetadata(
  tokens: OAuthTokens,
  apiVersion: string = 'v59.0'
): Promise<OrgMetadata> {
  const queryUrl = `${tokens.instanceUrl}/services/data/${apiVersion}/query`;
  const query = `SELECT Id, Name, IsSandbox, NamespacePrefix, OrganizationType FROM Organization LIMIT 1`;

  const response = await fetch(`${queryUrl}?q=${encodeURIComponent(query)}`, {
    method: 'GET',
    headers: {
      'Authorization': `${tokens.tokenType} ${tokens.accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    // Non-critical - return defaults
    return {
      orgName: 'Unknown',
      isSandbox: false,
    };
  }

  const data = await response.json() as { records?: Array<Record<string, unknown>> };
  const org = data.records?.[0];

  if (!org) {
    return { orgName: 'Unknown', isSandbox: false };
  }

  return {
    orgName: org.Name as string,
    isSandbox: org.IsSandbox === true,
    edition: org.OrganizationType as string | undefined,
    namespacePrefix: (org.NamespacePrefix as string) || undefined,
  };
}

// ============================================================================
// Local Callback Server
// ============================================================================

/**
 * Starts a local HTTP server to receive the OAuth callback
 * Returns the authorization code when received
 */
export function startCallbackServer(
  port: number,
  expectedState: string,
  timeoutMs: number = 120000
): Promise<string> {
  return new Promise((resolve, reject) => {
    let server: http.Server;

    const timeout = setTimeout(() => {
      server?.close();
      reject(new Error('OAuth callback timeout - user did not complete authorization'));
    }, timeoutMs);

    server = http.createServer((req, res) => {
      const reqUrl = url.parse(req.url || '', true);

      // Handle callback path
      if (reqUrl.pathname === '/oauth/callback') {
        const { code, state, error, error_description } = reqUrl.query;

        // Check for errors
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(createErrorHtml(error as string, error_description as string));
          clearTimeout(timeout);
          server.close();
          reject(new Error(`OAuth error: ${error_description || error}`));
          return;
        }

        // Validate state (CSRF protection)
        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(createErrorHtml('Invalid state', 'The state parameter does not match. This could be a CSRF attack.'));
          clearTimeout(timeout);
          server.close();
          reject(new Error('OAuth state mismatch - possible CSRF attack'));
          return;
        }

        // Success
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(createSuccessHtml());
          clearTimeout(timeout);
          server.close();
          resolve(code as string);
          return;
        }

        // No code received
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(createErrorHtml('No code received', 'The authorization code was not provided.'));
        clearTimeout(timeout);
        server.close();
        reject(new Error('No authorization code received'));
        return;
      }

      // 404 for other paths
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Callback server error: ${err.message}`));
    });

    server.listen(port, '127.0.0.1', () => {
      // Server is ready
    });
  });
}

/**
 * Creates success HTML for the callback page
 */
function createSuccessHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Salesforce Authentication Successful</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
           display: flex; justify-content: center; align-items: center; height: 100vh; 
           margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .container { background: white; padding: 40px 60px; border-radius: 16px; 
                 box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; }
    .checkmark { width: 80px; height: 80px; background: #22c55e; border-radius: 50%; 
                 display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .checkmark svg { width: 40px; height: 40px; fill: white; }
    h1 { color: #1f2937; margin: 0 0 10px; font-size: 24px; }
    p { color: #6b7280; margin: 0; font-size: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
    </div>
    <h1>Authentication Successful!</h1>
    <p>You can close this window and return to the application.</p>
  </div>
</body>
</html>`;
}

/**
 * Creates error HTML for the callback page
 */
function createErrorHtml(error: string, description?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Salesforce Authentication Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
           display: flex; justify-content: center; align-items: center; height: 100vh; 
           margin: 0; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
    .container { background: white; padding: 40px 60px; border-radius: 16px; 
                 box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; max-width: 400px; }
    .error-icon { width: 80px; height: 80px; background: #ef4444; border-radius: 50%; 
                  display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .error-icon svg { width: 40px; height: 40px; fill: white; }
    h1 { color: #1f2937; margin: 0 0 10px; font-size: 24px; }
    p { color: #6b7280; margin: 0; font-size: 16px; }
    .error-detail { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; 
                    padding: 12px; margin-top: 20px; text-align: left; }
    .error-detail strong { color: #991b1b; }
    .error-detail span { color: #dc2626; font-size: 14px; display: block; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
    </div>
    <h1>Authentication Failed</h1>
    <p>Unable to complete Salesforce authentication.</p>
    <div class="error-detail">
      <strong>Error:</strong> <span>${error}</span>
      ${description ? `<strong>Details:</strong> <span>${description}</span>` : ''}
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// OAuth PKCE Flow Orchestration
// ============================================================================

/**
 * Options for the PKCE OAuth flow
 */
export interface PKCEFlowOptions {
  /** OAuth client ID (Connected App Consumer Key) */
  clientId?: string;
  /** Local callback port */
  callbackPort?: number;
  /** Login URL (production or sandbox) */
  loginUrl?: string;
  /** OAuth scopes */
  scopes?: string[];
  /** Callback timeout in milliseconds */
  timeoutMs?: number;
  /** API version to use */
  apiVersion?: string;
  /** Function to open URL in browser */
  openBrowser?: (url: string) => Promise<void>;
}

/**
 * Default browser opener using child_process
 */
async function defaultOpenBrowser(url: string): Promise<void> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin':
      command = `open "${url}"`;
      break;
    case 'win32':
      command = `start "" "${url}"`;
      break;
    default:
      // Linux and others
      command = `xdg-open "${url}"`;
  }

  await execAsync(command);
}

/**
 * Performs the full OAuth PKCE authentication flow
 * 1. Generates PKCE code verifier/challenge
 * 2. Opens browser to authorization URL
 * 3. Starts local callback server
 * 4. Exchanges code for tokens
 * 5. Fetches user identity
 * 6. Returns SalesforceConnection
 */
export async function performPKCEFlow(
  options: PKCEFlowOptions = {}
): Promise<AuthResult> {
  const {
    clientId,
    callbackPort = 8888,
    loginUrl = PRODUCTION_LOGIN_URL,
    scopes = DEFAULT_SCOPES,
    timeoutMs = 120000,
    apiVersion = 'v59.0',
    openBrowser = defaultOpenBrowser,
  } = options;

  try {
    // Step 1: Create PKCE config
    const config = createPKCEConfig({
      clientId,
      redirectUri: `http://localhost:${callbackPort}/oauth/callback`,
      loginUrl,
      scopes,
    });

    // Step 2: Generate state for CSRF protection
    const state = generateState();

    // Step 3: Build authorization URL
    const authUrl = buildAuthorizationUrl(config, state);

    // Step 4: Start callback server (before opening browser)
    const codePromise = startCallbackServer(callbackPort, state, timeoutMs);

    // Step 5: Open browser
    await openBrowser(authUrl);

    // Step 6: Wait for authorization code
    const authorizationCode = await codePromise;

    // Step 7: Exchange code for tokens
    const tokensResult = await exchangeCodeForTokens(config, authorizationCode);
    if (!tokensResult.success) {
      return {
        success: false,
        error: tokensResult.error.message,
        errorCode: tokensResult.error.code,
      };
    }
    const tokens = tokensResult.data;

    // Step 8: Fetch user identity
    const identityResult = await fetchUserIdentity(tokens);
    if (!identityResult.success) {
      return {
        success: false,
        error: identityResult.error.message,
        errorCode: identityResult.error.code,
      };
    }
    const identity = identityResult.data;

    // Step 9: Fetch org metadata (non-blocking failure)
    const metadata = await fetchOrgMetadata(tokens, apiVersion).catch(() => ({
      orgName: 'Unknown',
      isSandbox: loginUrl.includes('test.salesforce.com'),
    }));

    // Step 10: Build connection object
    const connection: SalesforceConnection = {
      id: `${identity.orgId}_${identity.userId}`,
      alias: metadata.orgName || identity.username,
      orgId: identity.orgId,
      userId: identity.userId,
      username: identity.username,
      instanceUrl: tokens.instanceUrl,
      apiVersion,
      orgType: metadata.isSandbox ? 'sandbox' : 'production',
      authMethod: 'oauth_pkce',
      authState: 'connected',
      tokens,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      metadata,
    };

    return {
      success: true,
      connection,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Map error to error code
    let errorCode: AuthResult['errorCode'];
    if (message.includes('timeout')) {
      errorCode = 'TIMEOUT';
    } else if (message.includes('access_denied') || message.includes('ACCESS_DENIED')) {
      errorCode = 'ACCESS_DENIED';
    } else if (message.includes('invalid_grant') || message.includes('INVALID_GRANT')) {
      errorCode = 'INVALID_GRANT';
    } else if (message.includes('invalid_client') || message.includes('INVALID_CLIENT')) {
      errorCode = 'INVALID_CLIENT';
    } else if (message.includes('CSRF') || message.includes('state')) {
      errorCode = 'PKCE_MISMATCH';
    } else if (message.includes('network') || message.includes('ECONNREFUSED')) {
      errorCode = 'NETWORK_ERROR';
    }

    return {
      success: false,
      error: message,
      errorCode,
    };
  }
}

/**
 * Checks if the environment supports browser-based OAuth
 * Uses shared environment detection utilities
 */
export function canUsePKCEFlow(): boolean {
  return canUsePKCEFlowCheck();
}
