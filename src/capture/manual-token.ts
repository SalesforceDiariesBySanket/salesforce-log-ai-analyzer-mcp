/**
 * @module capture/manual-token
 * @description Manual token authentication for Salesforce
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts
 * @lastModified 2026-01-31
 */

import type {
  OAuthTokens,
  AuthResult,
  SalesforceConnection,
} from '../types/capture';
import { fetchUserIdentity, fetchOrgMetadata } from './oauth-pkce';

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Validates that a string looks like a Salesforce access token
 */
export function isValidTokenFormat(token: string): boolean {
  // Salesforce access tokens are typically session IDs
  // They start with the org ID (15 chars) followed by ! and more characters
  // Example: 00D5g0000019xyZ!AQEAQDpZ...
  
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Minimum length check
  if (token.length < 50) {
    return false;
  }

  // Check for Session ID format (starts with 00D and contains !)
  const sessionIdPattern = /^00[A-Z][a-zA-Z0-9]{12,15}![a-zA-Z0-9._]+$/;
  if (sessionIdPattern.test(token)) {
    return true;
  }

  // Also accept JWT tokens (contain dots)
  if (token.includes('.') && token.split('.').length === 3) {
    return true;
  }

  // Accept any long alphanumeric token that could be a session ID
  const genericPattern = /^[a-zA-Z0-9._!]+$/;
  return genericPattern.test(token) && token.length >= 50;
}

/**
 * Validates instance URL format
 */
export function isValidInstanceUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    
    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Must be a Salesforce domain
    const hostname = parsed.hostname.toLowerCase();
    const validDomains = [
      '.salesforce.com',
      '.force.com',
      '.my.salesforce.com',
      '.lightning.force.com',
      '.salesforce-setup.com',
    ];

    return validDomains.some(domain => hostname.endsWith(domain));
  } catch {
    return false;
  }
}

/**
 * Normalizes an instance URL
 */
export function normalizeInstanceUrl(url: string): string {
  // Remove trailing slash
  let normalized = url.trim().replace(/\/+$/, '');
  
  // Ensure https://
  if (!normalized.startsWith('https://')) {
    if (normalized.startsWith('http://')) {
      normalized = normalized.replace('http://', 'https://');
    } else {
      normalized = `https://${normalized}`;
    }
  }

  return normalized;
}

// ============================================================================
// Manual Token Authentication
// ============================================================================

/**
 * Options for manual token authentication
 */
export interface ManualTokenOptions {
  /** Access token (session ID) */
  accessToken: string;
  /** Instance URL */
  instanceUrl: string;
  /** API version to use */
  apiVersion?: string;
  /** Skip token format validation */
  skipValidation?: boolean;
}

/**
 * Authenticates using a manually provided access token
 * 
 * This is useful for:
 * - Environments where OAuth flows are not possible
 * - Using tokens from browser developer tools
 * - Integration with other tools that provide tokens
 * - Quick testing without full OAuth setup
 * 
 * Note: Manual tokens typically cannot be refreshed and will expire.
 */
export async function authenticateWithManualToken(
  options: ManualTokenOptions
): Promise<AuthResult> {
  const {
    accessToken,
    instanceUrl: rawInstanceUrl,
    apiVersion = 'v59.0',
    skipValidation = false,
  } = options;

  try {
    // Step 1: Normalize instance URL
    const instanceUrl = normalizeInstanceUrl(rawInstanceUrl);

    // Step 2: Validate inputs
    if (!skipValidation) {
      if (!isValidTokenFormat(accessToken)) {
        return {
          success: false,
          error: 'Invalid access token format. Token should be a Salesforce session ID or JWT.',
          errorCode: 'INVALID_TOKEN',
        };
      }

      if (!isValidInstanceUrl(instanceUrl)) {
        return {
          success: false,
          error: 'Invalid instance URL. Must be a Salesforce domain (e.g., https://na123.salesforce.com)',
          errorCode: 'INVALID_TOKEN',
        };
      }
    }

    // Step 3: Build tokens object
    const tokens: OAuthTokens = {
      accessToken,
      instanceUrl,
      tokenType: 'Bearer',
      // Manual tokens don't have refresh capability
    };

    // Step 4: Verify token by fetching identity
    const identityResult = await fetchUserIdentity(tokens);
    if (!identityResult.success) {
      return {
        success: false,
        error: `Token validation failed: ${identityResult.error.message}. The token may be invalid or expired.`,
        errorCode: 'INVALID_TOKEN',
      };
    }
    const identity = identityResult.data;

    // Step 5: Fetch org metadata
    const metadata = await fetchOrgMetadata(tokens, apiVersion).catch(() => ({
      orgName: 'Unknown',
      isSandbox: instanceUrl.includes('sandbox') || 
                 instanceUrl.includes('test.salesforce.com') ||
                 instanceUrl.includes('cs'),
    }));

    // Step 6: Build connection object
    const connection: SalesforceConnection = {
      id: `${identity.orgId}_${identity.userId}`,
      alias: metadata.orgName || identity.username,
      orgId: identity.orgId,
      userId: identity.userId,
      username: identity.username,
      instanceUrl,
      apiVersion,
      orgType: metadata.isSandbox ? 'sandbox' : 'production',
      authMethod: 'manual_token',
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
    return {
      success: false,
      error: message,
      errorCode: 'INVALID_TOKEN',
    };
  }
}

/**
 * Instructions for obtaining a manual token
 */
export const MANUAL_TOKEN_INSTRUCTIONS = `
HOW TO OBTAIN A SALESFORCE ACCESS TOKEN

Method 1: From Browser Developer Tools
--------------------------------------
1. Log into Salesforce in your browser
2. Open Developer Tools (F12 or Cmd+Opt+I)
3. Go to Console tab
4. Run: $Api.Session_Id
5. Copy the returned session ID

Method 2: From Setup
--------------------
1. Go to Setup > Session Management
2. Your current session ID is displayed

Method 3: From Workbench
------------------------
1. Go to https://workbench.developerforce.com
2. Log in to your org
3. Go to Info > Session Information
4. Copy the Session Id

IMPORTANT NOTES
---------------
- Session tokens expire (usually 2 hours for standard sessions)
- Tokens cannot be refreshed without re-authentication
- Never share or store tokens in plain text
- For production use, prefer OAuth authentication
`;

/**
 * Parses token input that may include the instance URL
 * Supports formats like "sessionId@instanceUrl" or JSON
 */
export function parseTokenInput(input: string): { accessToken?: string; instanceUrl?: string } {
  const trimmed = input.trim();

  // Try JSON format: {"accessToken": "...", "instanceUrl": "..."}
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      return {
        accessToken: data.accessToken || data.access_token || data.sessionId,
        instanceUrl: data.instanceUrl || data.instance_url || data.serverUrl,
      };
    } catch {
      // Not valid JSON, continue
    }
  }

  // Try "token@url" format
  if (trimmed.includes('@https://')) {
    const atIndex = trimmed.lastIndexOf('@https://');
    return {
      accessToken: trimmed.substring(0, atIndex),
      instanceUrl: trimmed.substring(atIndex + 1),
    };
  }

  // Assume it's just the token
  return { accessToken: trimmed };
}

/**
 * Interactive prompt helper for manual token entry
 */
export interface TokenPromptResult {
  accessToken: string;
  instanceUrl: string;
}

/**
 * Validates token prompt input and returns parsed values
 */
export function validateTokenPromptInput(
  tokenInput: string,
  urlInput?: string
): { valid: boolean; result?: TokenPromptResult; error?: string } {
  // Parse the token input (may contain URL)
  const parsed = parseTokenInput(tokenInput);

  const accessToken = parsed.accessToken;
  const instanceUrl = parsed.instanceUrl || urlInput;

  if (!accessToken) {
    return { valid: false, error: 'Access token is required' };
  }

  if (!instanceUrl) {
    return { valid: false, error: 'Instance URL is required' };
  }

  if (!isValidTokenFormat(accessToken)) {
    return { valid: false, error: 'Invalid access token format' };
  }

  const normalizedUrl = normalizeInstanceUrl(instanceUrl);
  if (!isValidInstanceUrl(normalizedUrl)) {
    return { valid: false, error: 'Invalid Salesforce instance URL' };
  }

  return {
    valid: true,
    result: {
      accessToken,
      instanceUrl: normalizedUrl,
    },
  };
}
