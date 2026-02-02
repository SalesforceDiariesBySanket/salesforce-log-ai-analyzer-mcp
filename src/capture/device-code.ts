/**
 * @module capture/device-code
 * @description OAuth 2.0 Device Code flow for headless/remote Salesforce authentication
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts, src/capture/environment.ts
 * @lastModified 2026-02-01
 */

import type {
  DeviceCodeResponse,
  DeviceCodePollStatus,
  OAuthTokens,
  AuthResult,
  SalesforceConnection,
} from '../types/capture';
import { fetchUserIdentity, fetchOrgMetadata, PRODUCTION_LOGIN_URL, DEFAULT_SCOPES } from './oauth-pkce';
import { requiresDeviceCodeFlow as requiresDeviceCodeFlowCheck } from './environment';

// ============================================================================
// Constants
// ============================================================================

/** Default polling interval in seconds */
const DEFAULT_POLL_INTERVAL = 5;

/** Maximum polling time in milliseconds (5 minutes) */
const MAX_POLL_TIME_MS = 5 * 60 * 1000;

// ============================================================================
// Device Code Flow
// ============================================================================

/**
 * Initiates the device code flow
 * Returns the device code and user code for display
 */
export async function initiateDeviceCodeFlow(options: {
  clientId: string;
  loginUrl?: string;
  scopes?: string[];
}): Promise<DeviceCodeResponse> {
  const {
    clientId,
    loginUrl = PRODUCTION_LOGIN_URL,
    scopes = DEFAULT_SCOPES,
  } = options;

  const deviceAuthUrl = `${loginUrl}/services/oauth2/token`;

  const body = new URLSearchParams({
    response_type: 'device_code',
    client_id: clientId,
    scope: scopes.join(' '),
  });

  const response = await fetch(deviceAuthUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(
      `Device code request failed: ${error.error_description || error.error || response.statusText}`
    );
  }

  const data = await response.json() as Record<string, unknown>;

  return {
    deviceCode: data.device_code as string,
    userCode: data.user_code as string,
    verificationUri: data.verification_uri as string,
    verificationUriComplete: data.verification_uri_complete as string | undefined,
    expiresIn: (data.expires_in as number) || 600, // Default 10 minutes
    interval: (data.interval as number) || DEFAULT_POLL_INTERVAL,
  };
}

/**
 * Polls for the device code authorization result
 */
export async function pollForDeviceToken(options: {
  clientId: string;
  deviceCode: string;
  loginUrl?: string;
  interval?: number;
}): Promise<{ status: DeviceCodePollStatus; tokens?: OAuthTokens }> {
  const {
    clientId,
    deviceCode,
    loginUrl = PRODUCTION_LOGIN_URL,
    interval = DEFAULT_POLL_INTERVAL,
  } = options;

  // Wait for the specified interval before polling
  await sleep(interval * 1000);

  const tokenUrl = `${loginUrl}/services/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: 'device',
    client_id: clientId,
    code: deviceCode,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  const data = await response.json() as Record<string, unknown>;

  // Check for pending/error states
  if (!response.ok) {
    const errorCode = (data.error as string)?.toLowerCase();

    switch (errorCode) {
      case 'authorization_pending':
        return { status: 'authorization_pending' };
      case 'slow_down':
        return { status: 'slow_down' };
      case 'access_denied':
        return { status: 'access_denied' };
      case 'expired_token':
        return { status: 'expired_token' };
      default:
        throw new Error(
          `Device token poll failed: ${data.error_description || data.error || response.statusText}`
        );
    }
  }

  // Success - we got tokens
  const tokens: OAuthTokens = {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    instanceUrl: data.instance_url as string,
    tokenType: (data.token_type as string) || 'Bearer',
    scope: data.scope as string | undefined,
    idToken: data.id_token as string | undefined,
    expiresAt: Date.now() + ((data.expires_in as number) || 7200) * 1000,
  };

  return { status: 'success', tokens };
}

/**
 * Helper function for async sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Device Code Flow Orchestration
// ============================================================================

/**
 * Options for the device code OAuth flow
 */
export interface DeviceCodeFlowOptions {
  /** OAuth client ID (Connected App Consumer Key) */
  clientId: string;
  /** Login URL (production or sandbox) */
  loginUrl?: string;
  /** OAuth scopes */
  scopes?: string[];
  /** API version to use */
  apiVersion?: string;
  /** Callback for displaying the user code */
  onUserCode?: (response: DeviceCodeResponse) => void;
  /** Callback for poll status updates */
  onPollStatus?: (status: DeviceCodePollStatus, attempt: number) => void;
  /** Maximum time to wait for authorization (ms) */
  maxWaitMs?: number;
}

/**
 * Performs the full OAuth Device Code authentication flow
 * 
 * This flow is designed for headless environments (SSH, CI, containers)
 * where a browser cannot be opened locally.
 * 
 * Flow:
 * 1. Request device code from Salesforce
 * 2. Display user code and verification URL to user
 * 3. User opens URL on any device and enters the code
 * 4. Poll Salesforce for authorization result
 * 5. Exchange device code for tokens
 * 6. Fetch user identity
 * 7. Return SalesforceConnection
 */
export async function performDeviceCodeFlow(
  options: DeviceCodeFlowOptions
): Promise<AuthResult> {
  const {
    clientId,
    loginUrl = PRODUCTION_LOGIN_URL,
    scopes = DEFAULT_SCOPES,
    apiVersion = 'v59.0',
    onUserCode,
    onPollStatus,
    maxWaitMs = MAX_POLL_TIME_MS,
  } = options;

  try {
    // Step 1: Initiate device code flow
    const deviceResponse = await initiateDeviceCodeFlow({
      clientId,
      loginUrl,
      scopes,
    });

    // Step 2: Notify caller of user code (for display)
    if (onUserCode) {
      onUserCode(deviceResponse);
    } else {
      // Default: log to console
      console.log('\n========================================');
      console.log('SALESFORCE DEVICE AUTHENTICATION');
      console.log('========================================');
      console.log(`\nGo to: ${deviceResponse.verificationUri}`);
      console.log(`Enter code: ${deviceResponse.userCode}`);
      if (deviceResponse.verificationUriComplete) {
        console.log(`\nOr open this URL directly:`);
        console.log(deviceResponse.verificationUriComplete);
      }
      console.log(`\nCode expires in ${Math.floor(deviceResponse.expiresIn / 60)} minutes`);
      console.log('Waiting for authorization...\n');
    }

    // Step 3: Poll for authorization
    const startTime = Date.now();
    let pollInterval = deviceResponse.interval;
    let attempt = 0;
    let tokens: OAuthTokens | undefined;

    while (Date.now() - startTime < maxWaitMs) {
      attempt++;

      const result = await pollForDeviceToken({
        clientId,
        deviceCode: deviceResponse.deviceCode,
        loginUrl,
        interval: pollInterval,
      });

      if (onPollStatus) {
        onPollStatus(result.status, attempt);
      }

      switch (result.status) {
        case 'success':
          tokens = result.tokens;
          break;

        case 'authorization_pending':
          // Continue polling
          continue;

        case 'slow_down':
          // Increase polling interval
          pollInterval = Math.min(pollInterval + 5, 30);
          continue;

        case 'access_denied':
          return {
            success: false,
            error: 'User denied authorization',
            errorCode: 'ACCESS_DENIED',
          };

        case 'expired_token':
          return {
            success: false,
            error: 'Device code expired - please try again',
            errorCode: 'EXPIRED_TOKEN',
          };
      }

      // If we got tokens, break out of loop
      if (tokens) break;
    }

    // Check if we timed out
    if (!tokens) {
      return {
        success: false,
        error: 'Device code flow timed out waiting for authorization',
        errorCode: 'TIMEOUT',
      };
    }

    // Step 4: Fetch user identity
    const identityResult = await fetchUserIdentity(tokens);
    if (!identityResult.success) {
      return {
        success: false,
        error: identityResult.error.message,
        errorCode: identityResult.error.code,
      };
    }
    const identity = identityResult.data;

    // Step 5: Fetch org metadata
    const metadata = await fetchOrgMetadata(tokens, apiVersion).catch(() => ({
      orgName: 'Unknown',
      isSandbox: loginUrl.includes('test.salesforce.com'),
    }));

    // Step 6: Build connection object
    const connection: SalesforceConnection = {
      id: `${identity.orgId}_${identity.userId}`,
      alias: metadata.orgName || identity.username,
      orgId: identity.orgId,
      userId: identity.userId,
      username: identity.username,
      instanceUrl: tokens.instanceUrl,
      apiVersion,
      orgType: metadata.isSandbox ? 'sandbox' : 'production',
      authMethod: 'device_code',
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
      errorCode: 'NETWORK_ERROR',
    };
  }
}

/**
 * Creates a formatted display message for the device code
 */
export function formatDeviceCodeMessage(response: DeviceCodeResponse): string {
  const lines = [
    '',
    '╔════════════════════════════════════════════════════════════╗',
    '║           SALESFORCE DEVICE AUTHENTICATION                 ║',
    '╠════════════════════════════════════════════════════════════╣',
    '║                                                            ║',
    `║  1. Open: ${response.verificationUri.padEnd(46)}║`,
    '║                                                            ║',
    `║  2. Enter code: ${response.userCode.padEnd(40)}║`,
    '║                                                            ║',
    `║  Code expires in ${Math.floor(response.expiresIn / 60)} minutes`.padEnd(61) + '║',
    '║                                                            ║',
    '╚════════════════════════════════════════════════════════════╝',
    '',
  ];

  if (response.verificationUriComplete) {
    lines.splice(9, 0,
      '║  Or visit this URL directly:                               ║',
      `║  ${response.verificationUriComplete.substring(0, 58).padEnd(58)}║`,
      '║                                                            ║'
    );
  }

  return lines.join('\n');
}

/**
 * Checks if the environment requires device code flow
 * Uses shared environment detection utilities
 */
export function requiresDeviceCodeFlow(): boolean {
  return requiresDeviceCodeFlowCheck();
}
