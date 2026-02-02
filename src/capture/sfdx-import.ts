/**
 * @module capture/sfdx-import
 * @description Import Salesforce authentication from SFDX CLI
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts, src/types/common.ts
 * @lastModified 2026-02-01
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  SFDXAuthInfo,
  AuthResult,
  SalesforceConnection,
  OAuthTokens,
} from '../types/capture';
import { type Result, ok, err, type AppError } from '../types/common';
import { fetchUserIdentity, fetchOrgMetadata } from './oauth-pkce';

const execAsync = promisify(exec);

// ============================================================================
// Error Types
// ============================================================================

/** SFDX-specific error codes */
export type SFDXErrorCode =
  | 'SFDX_NOT_INSTALLED'
  | 'SFDX_COMMAND_FAILED'
  | 'SFDX_PARSE_ERROR'
  | 'SFDX_ORG_NOT_FOUND';

/** SFDX operation error */
export interface SFDXError extends AppError {
  code: SFDXErrorCode;
}

// ============================================================================
// SFDX CLI Detection
// ============================================================================

/**
 * Checks if SFDX CLI is installed and available
 */
export async function isSfdxInstalled(): Promise<boolean> {
  try {
    // Try both 'sfdx' and 'sf' commands
    await execAsync('sfdx --version', { timeout: 5000 });
    return true;
  } catch {
    try {
      await execAsync('sf --version', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Gets the SFDX CLI command to use ('sfdx' or 'sf')
 */
export async function getSfdxCommand(): Promise<'sfdx' | 'sf' | null> {
  try {
    await execAsync('sf --version', { timeout: 5000 });
    return 'sf';
  } catch {
    try {
      await execAsync('sfdx --version', { timeout: 5000 });
      return 'sfdx';
    } catch {
      return null;
    }
  }
}

// ============================================================================
// SFDX Auth File Reading
// ============================================================================

/**
 * Gets the SFDX auth directory path
 */
function getSfdxAuthDir(): string {
  // SFDX stores auth in ~/.sfdx
  // SF stores auth in ~/.sf
  const homeDir = os.homedir();
  
  // Check for SF directory first (newer)
  const sfDir = path.join(homeDir, '.sf');
  if (fs.existsSync(sfDir)) {
    return sfDir;
  }
  
  // Fall back to SFDX directory
  return path.join(homeDir, '.sfdx');
}

/**
 * Reads stored SFDX auth info from disk
 * This is faster than running CLI commands
 */
export async function readSfdxAuthFromDisk(username: string): Promise<SFDXAuthInfo | null> {
  const authDir = getSfdxAuthDir();
  const authFile = path.join(authDir, `${username}.json`);
  
  try {
    const content = await fs.promises.readFile(authFile, 'utf-8');
    const data = JSON.parse(content);
    
    return {
      username: data.username,
      orgId: data.orgId,
      accessToken: data.accessToken,
      instanceUrl: data.instanceUrl,
      alias: data.alias,
      isDevHub: data.isDevHub,
    };
  } catch {
    return null;
  }
}

/**
 * Lists all orgs with auth stored locally
 */
export async function listStoredSfdxOrgs(): Promise<string[]> {
  const authDir = getSfdxAuthDir();
  
  try {
    const files = await fs.promises.readdir(authDir);
    return files
      .filter(f => f.endsWith('.json') && !f.startsWith('alias'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

// ============================================================================
// SFDX CLI Commands
// ============================================================================

/**
 * Lists all authenticated orgs using SFDX CLI
 */
export async function listSfdxOrgs(): Promise<Result<SFDXAuthInfo[], SFDXError>> {
  const command = await getSfdxCommand();
  if (!command) {
    return err({
      code: 'SFDX_NOT_INSTALLED',
      message: 'SFDX CLI is not installed',
    });
  }

  try {
    let result: string;
    
    if (command === 'sf') {
      const { stdout } = await execAsync('sf org list --json', { timeout: 30000 });
      result = stdout;
    } else {
      const { stdout } = await execAsync('sfdx force:org:list --json', { timeout: 30000 });
      result = stdout;
    }

    const data = JSON.parse(result);
    
    if (data.status !== 0) {
      return err({
        code: 'SFDX_COMMAND_FAILED',
        message: data.message || 'Failed to list orgs',
      });
    }

    const orgs: SFDXAuthInfo[] = [];

    // Handle different response formats between sf and sfdx
    const nonScratchOrgs = data.result?.nonScratchOrgs || data.result?.other || [];
    const scratchOrgs = data.result?.scratchOrgs || [];

    for (const org of [...nonScratchOrgs, ...scratchOrgs]) {
      orgs.push({
        alias: org.alias,
        username: org.username,
        orgId: org.orgId,
        accessToken: '', // Not included in list, need to fetch
        instanceUrl: org.instanceUrl,
        isDevHub: org.isDevHub,
        isDefaultUsername: org.isDefaultUsername,
        connectedStatus: org.connectedStatus,
      });
    }

    return ok(orgs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err({
      code: 'SFDX_COMMAND_FAILED',
      message: `Failed to list SFDX orgs: ${message}`,
    });
  }
}

/**
 * Gets detailed auth info for a specific org
 */
export async function getSfdxOrgInfo(usernameOrAlias: string): Promise<Result<SFDXAuthInfo, SFDXError>> {
  const command = await getSfdxCommand();
  if (!command) {
    return err({
      code: 'SFDX_NOT_INSTALLED',
      message: 'SFDX CLI is not installed',
    });
  }

  try {
    let result: string;
    
    if (command === 'sf') {
      const { stdout } = await execAsync(
        `sf org display --target-org "${usernameOrAlias}" --json`,
        { timeout: 30000 }
      );
      result = stdout;
    } else {
      const { stdout } = await execAsync(
        `sfdx force:org:display --targetusername "${usernameOrAlias}" --json`,
        { timeout: 30000 }
      );
      result = stdout;
    }

    const data = JSON.parse(result);
    
    if (data.status !== 0) {
      return err({
        code: 'SFDX_COMMAND_FAILED',
        message: data.message || 'Failed to get org info',
      });
    }

    const org = data.result;

    return ok({
      alias: org.alias,
      username: org.username,
      orgId: org.id || org.orgId,
      accessToken: org.accessToken,
      instanceUrl: org.instanceUrl,
      isDevHub: org.isDevHub,
      connectedStatus: org.connectedStatus || 'Connected',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err({
      code: 'SFDX_COMMAND_FAILED',
      message: `Failed to get SFDX org info: ${message}`,
    });
  }
}

/**
 * Gets the default org (username or dev hub)
 */
export async function getDefaultSfdxOrg(type: 'username' | 'devhub' = 'username'): Promise<string | null> {
  const command = await getSfdxCommand();
  if (!command) {
    return null;
  }

  try {
    let result: string;
    
    if (command === 'sf') {
      const configName = type === 'devhub' ? 'target-dev-hub' : 'target-org';
      const { stdout } = await execAsync(`sf config get ${configName} --json`, { timeout: 10000 });
      result = stdout;
    } else {
      const configName = type === 'devhub' ? 'defaultdevhubusername' : 'defaultusername';
      const { stdout } = await execAsync(`sfdx force:config:get ${configName} --json`, { timeout: 10000 });
      result = stdout;
    }

    const data = JSON.parse(result);
    
    if (data.status !== 0 || !data.result?.length) {
      return null;
    }

    return data.result[0]?.value || null;
  } catch {
    return null;
  }
}

// ============================================================================
// SFDX Import Flow
// ============================================================================

/**
 * Options for importing SFDX auth
 */
export interface SfdxImportOptions {
  /** Username or alias of the org to import */
  usernameOrAlias?: string;
  /** Use default org if no username specified */
  useDefault?: boolean;
  /** API version to use */
  apiVersion?: string;
}

/**
 * Imports authentication from SFDX CLI
 * 
 * This allows users who have already authenticated via SFDX
 * to use those credentials without re-authenticating.
 */
export async function importSfdxAuth(
  options: SfdxImportOptions = {}
): Promise<AuthResult> {
  const {
    usernameOrAlias,
    useDefault = true,
    apiVersion = 'v59.0',
  } = options;

  try {
    // Step 1: Check if SFDX is installed
    const isInstalled = await isSfdxInstalled();
    if (!isInstalled) {
      return {
        success: false,
        error: 'SFDX CLI is not installed. Please install Salesforce CLI first.',
        errorCode: 'SFDX_NOT_FOUND',
      };
    }

    // Step 2: Determine which org to use
    let targetOrg: string | undefined = usernameOrAlias;
    
    if (!targetOrg && useDefault) {
      targetOrg = await getDefaultSfdxOrg() ?? undefined;
    }

    if (!targetOrg) {
      return {
        success: false,
        error: 'No org specified and no default org set. Use --target-org or set a default.',
        errorCode: 'NO_DEFAULT_ORG',
      };
    }

    // Step 3: Get org info with access token
    const orgInfoResult = await getSfdxOrgInfo(targetOrg);

    if (!orgInfoResult.success) {
      return {
        success: false,
        error: orgInfoResult.error.message,
        errorCode: 'SFDX_NOT_FOUND',
      };
    }

    const orgInfo = orgInfoResult.data;

    if (!orgInfo.accessToken) {
      return {
        success: false,
        error: `Unable to get access token for org ${targetOrg}. Token may have expired.`,
        errorCode: 'INVALID_TOKEN',
      };
    }

    // Step 4: Build OAuth tokens
    const tokens: OAuthTokens = {
      accessToken: orgInfo.accessToken,
      instanceUrl: orgInfo.instanceUrl,
      tokenType: 'Bearer',
      // No refresh token available from SFDX import
    };

    // Step 5: Verify connection and get identity
    const identityResult = await fetchUserIdentity(tokens);
    if (!identityResult.success) {
      return {
        success: false,
        error: `Unable to connect to org. Access token may be expired. Try: sfdx force:org:open -u ${targetOrg}`,
        errorCode: 'EXPIRED_TOKEN',
      };
    }
    const identity = identityResult.data;

    // Step 6: Fetch org metadata
    const metadata = await fetchOrgMetadata(tokens, apiVersion).catch(() => ({
      orgName: orgInfo.alias || 'Unknown',
      isSandbox: orgInfo.instanceUrl.includes('sandbox') || orgInfo.instanceUrl.includes('test.salesforce.com'),
    }));

    // Step 7: Build connection object
    const connection: SalesforceConnection = {
      id: `${identity.orgId}_${identity.userId}`,
      alias: orgInfo.alias || metadata.orgName || identity.username,
      orgId: identity.orgId,
      userId: identity.userId,
      username: identity.username,
      instanceUrl: tokens.instanceUrl,
      apiVersion,
      orgType: metadata.isSandbox ? 'sandbox' : 'production',
      authMethod: 'sfdx',
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
      errorCode: 'SFDX_NOT_FOUND',
    };
  }
}

/**
 * Lists all available SFDX orgs for selection
 */
export interface SfdxOrgListItem {
  /** Display name (alias or username) */
  displayName: string;
  /** Username */
  username: string;
  /** Alias if set */
  alias?: string;
  /** Organization ID */
  orgId: string;
  /** Instance URL */
  instanceUrl: string;
  /** Is this the default org */
  isDefault: boolean;
  /** Connection status */
  status: 'Connected' | 'Disconnected' | 'Unknown';
}

/**
 * Lists SFDX orgs in a user-friendly format
 */
export async function listSfdxOrgsForSelection(): Promise<SfdxOrgListItem[]> {
  const orgsResult = await listSfdxOrgs();
  
  if (!orgsResult.success) {
    return [];
  }
  
  const orgs = orgsResult.data;
  const defaultOrg = await getDefaultSfdxOrg();

  return orgs.map((org: SFDXAuthInfo) => ({
    displayName: org.alias || org.username,
    username: org.username,
    alias: org.alias,
    orgId: org.orgId,
    instanceUrl: org.instanceUrl,
    isDefault: org.isDefaultUsername || org.username === defaultOrg || org.alias === defaultOrg,
    status: org.connectedStatus === 'Connected' ? 'Connected' 
          : org.connectedStatus === 'RefreshTokenInvalid' ? 'Disconnected'
          : 'Unknown',
  }));
}

/**
 * Formats the SFDX org list for display
 */
export function formatSfdxOrgList(orgs: SfdxOrgListItem[]): string {
  if (orgs.length === 0) {
    return 'No authenticated orgs found. Authenticate with: sfdx force:auth:web:login';
  }

  const lines = [
    '',
    '╔════════════════════════════════════════════════════════════════════════╗',
    '║                        AVAILABLE SALESFORCE ORGS                       ║',
    '╠════════════════════════════════════════════════════════════════════════╣',
  ];

  for (const org of orgs) {
    const defaultMarker = org.isDefault ? '★ ' : '  ';
    const statusIcon = org.status === 'Connected' ? '●' : org.status === 'Disconnected' ? '○' : '?';
    const displayName = org.displayName.substring(0, 30).padEnd(30);
    const hostnameParts = new URL(org.instanceUrl).hostname.split('.');
    const instanceShort = (hostnameParts[0] || '').padEnd(15);
    
    lines.push(`║ ${defaultMarker}${statusIcon} ${displayName} ${instanceShort}║`);
  }

  lines.push('╚════════════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push('★ = Default org  ● = Connected  ○ = Disconnected');
  lines.push('');

  return lines.join('\n');
}
