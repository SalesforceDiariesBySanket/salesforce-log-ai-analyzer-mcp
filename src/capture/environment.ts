/**
 * @module capture/environment
 * @description Shared environment detection utilities for authentication flows
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/types/capture.ts
 * @lastModified 2026-02-01
 */

import type { EnvironmentInfo, AuthMethod } from '../types/capture';

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if running in an SSH session
 */
export function isSSHSession(): boolean {
  return !!process.env.SSH_CLIENT || !!process.env.SSH_TTY;
}

/**
 * Check if running in a Docker container
 */
export function isDockerContainer(): boolean {
  return process.env.container === 'docker';
}

/**
 * Check if running in a CI environment
 */
export function isCIEnvironment(): boolean {
  return !!process.env.CI;
}

/**
 * Check if running in a headless environment (no GUI)
 */
export function isHeadlessEnvironment(): boolean {
  return isSSHSession() || isDockerContainer() || isCIEnvironment();
}

/**
 * Check if a display server is available (Linux)
 */
export function hasDisplayServer(): boolean {
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

/**
 * Check if the environment can open a local browser
 */
export function canOpenBrowser(): boolean {
  // On Windows or macOS, we can usually open a browser
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return !isHeadlessEnvironment();
  }

  // On Linux, check for display server
  return !isHeadlessEnvironment() && hasDisplayServer();
}

/**
 * Checks if the environment requires device code flow
 * Device code flow is needed when:
 * 1. We're in an SSH session
 * 2. We're in a Docker container
 * 3. We're in a CI environment
 * 4. There's no display available (Linux)
 */
export function requiresDeviceCodeFlow(): boolean {
  if (isHeadlessEnvironment()) {
    return true;
  }

  // Check for display on Linux
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    if (!hasDisplayServer()) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the environment supports browser-based OAuth (PKCE)
 * PKCE requires:
 * 1. Node.js environment (not browser)
 * 2. Ability to start local server
 * 3. Ability to open browser
 */
export function canUsePKCEFlowCheck(): boolean {
  // If in SSH, Docker, or CI, PKCE won't work (no browser)
  if (isHeadlessEnvironment()) {
    return false;
  }

  // Check if we have a display (Linux)
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    if (!hasDisplayServer()) {
      return false;
    }
  }

  return true;
}

/**
 * Detects the current environment capabilities
 * @param hasSfdx - Whether SFDX CLI is installed (must be determined externally)
 */
export function detectEnvironmentSync(hasSfdx: boolean = false): EnvironmentInfo {
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  const isBrowser = false; // This is a Node.js package, not browser
  const isHeadless = isHeadlessEnvironment();
  const hasLocalBrowser = isNode && canOpenBrowser();

  // Determine recommended auth methods
  const recommendedMethods: AuthMethod[] = [];

  // In browser, PKCE is the way to go
  if (isBrowser) {
    recommendedMethods.push('oauth_pkce');
  }

  // In Node.js with browser support
  if (isNode && hasLocalBrowser) {
    recommendedMethods.push('oauth_pkce');
  }

  // SFDX is a great fallback
  if (hasSfdx) {
    recommendedMethods.push('sfdx');
  }

  // Device code for headless environments
  if (isHeadless || !hasLocalBrowser) {
    recommendedMethods.push('device_code');
  }

  // Manual token as last resort
  recommendedMethods.push('manual_token');

  return {
    isBrowser,
    isNode,
    isHeadless,
    isSSH: isSSHSession(),
    hasSfdx,
    hasLocalBrowser,
    recommendedMethods,
  };
}
