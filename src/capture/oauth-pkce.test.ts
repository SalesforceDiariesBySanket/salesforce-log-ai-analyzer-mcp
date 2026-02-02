/**
 * @module capture/oauth-pkce.test
 * @description Unit tests for OAuth PKCE authentication
 * @status COMPLETE
 * @see src/capture/STATE.md
 * @dependencies src/capture/oauth-pkce.ts
 * @lastModified 2026-02-01
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  createPKCEConfig,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserIdentity,
  canUsePKCEFlow,
  PRODUCTION_LOGIN_URL,
  SANDBOX_LOGIN_URL,
  DEFAULT_SCOPES,
} from './oauth-pkce';

describe('oauth-pkce', () => {
  // ==========================================================================
  // PKCE Utilities Tests
  // ==========================================================================

  describe('generateCodeVerifier', () => {
    it('generates a string of correct length', () => {
      const verifier = generateCodeVerifier();
      
      // Should be 43 characters (32 bytes base64url encoded)
      expect(verifier.length).toBe(43);
    });

    it('generates URL-safe characters only', () => {
      const verifier = generateCodeVerifier();
      
      // Base64 URL encoding uses only alphanumeric, -, _
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates unique values each time', () => {
      const verifiers = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        verifiers.add(generateCodeVerifier());
      }
      
      // All 100 should be unique
      expect(verifiers.size).toBe(100);
    });
  });

  describe('generateCodeChallenge', () => {
    it('generates a valid SHA256 challenge', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      
      // Should be 43 characters (256 bits / 6 bits per char)
      expect(challenge.length).toBe(43);
    });

    it('is deterministic for same verifier', () => {
      const verifier = 'test-verifier-12345678901234567890123';
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);
      
      expect(challenge1).toBe(challenge2);
    });

    it('produces different challenges for different verifiers', () => {
      const challenge1 = generateCodeChallenge('verifier-a-1234567890123456789012');
      const challenge2 = generateCodeChallenge('verifier-b-1234567890123456789012');
      
      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('generateState', () => {
    it('generates a 32-character hex string', () => {
      const state = generateState();
      
      expect(state.length).toBe(32);
      expect(state).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique values', () => {
      const states = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        states.add(generateState());
      }
      
      expect(states.size).toBe(100);
    });
  });

  // ==========================================================================
  // PKCE Configuration Tests
  // ==========================================================================

  describe('createPKCEConfig', () => {
    it('creates config with defaults', () => {
      const config = createPKCEConfig({});
      
      expect(config.loginUrl).toBe(PRODUCTION_LOGIN_URL);
      expect(config.scopes).toEqual(DEFAULT_SCOPES);
      expect(config.codeChallengeMethod).toBe('S256');
      expect(config.codeVerifier).toBeDefined();
      expect(config.codeChallenge).toBeDefined();
    });

    it('uses provided options', () => {
      const config = createPKCEConfig({
        clientId: 'my-client-id',
        loginUrl: SANDBOX_LOGIN_URL,
        scopes: ['api'],
      });
      
      expect(config.clientId).toBe('my-client-id');
      expect(config.loginUrl).toBe(SANDBOX_LOGIN_URL);
      expect(config.scopes).toEqual(['api']);
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('builds a valid authorization URL', () => {
      const config = createPKCEConfig({ clientId: 'test-client' });
      const state = 'test-state-12345';
      
      const url = buildAuthorizationUrl(config, state);
      
      expect(url).toContain(PRODUCTION_LOGIN_URL);
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test-client');
      expect(url).toContain('state=test-state-12345');
      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('includes all scopes', () => {
      const config = createPKCEConfig({ scopes: ['api', 'refresh_token', 'openid'] });
      const url = buildAuthorizationUrl(config, 'state');
      
      expect(url).toContain('scope=api+refresh_token+openid');
    });
  });

  // ==========================================================================
  // Token Exchange Tests (with mocked fetch)
  // ==========================================================================

  describe('exchangeCodeForTokens', () => {
    const mockFetch = vi.fn();
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.resetAllMocks();
    });

    it('exchanges code for tokens successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          instance_url: 'https://na123.salesforce.com',
          token_type: 'Bearer',
          issued_at: String(Date.now()),
          expires_in: 7200,
        }),
      });

      const config = createPKCEConfig({ clientId: 'test-client' });
      const result = await exchangeCodeForTokens(config, 'auth-code-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessToken).toBe('test-access-token');
        expect(result.data.refreshToken).toBe('test-refresh-token');
        expect(result.data.instanceUrl).toBe('https://na123.salesforce.com');
      }
    });

    it('returns error result on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Authorization code expired',
        }),
      });

      const config = createPKCEConfig({ clientId: 'test-client' });
      const result = await exchangeCodeForTokens(config, 'expired-code');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Authorization code expired');
      }
    });
  });

  // ==========================================================================
  // Environment Detection Tests
  // ==========================================================================

  describe('canUsePKCEFlow', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns false in SSH environment', () => {
      process.env = { ...originalEnv, SSH_CLIENT: '192.168.1.1 12345 22' };
      expect(canUsePKCEFlow()).toBe(false);
    });

    it('returns false in CI environment', () => {
      process.env = { ...originalEnv, CI: 'true' };
      expect(canUsePKCEFlow()).toBe(false);
    });

    it('returns false in Docker container', () => {
      process.env = { ...originalEnv, container: 'docker' };
      expect(canUsePKCEFlow()).toBe(false);
    });
  });
});
