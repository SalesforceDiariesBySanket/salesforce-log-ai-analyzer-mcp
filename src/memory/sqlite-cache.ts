/**
 * @module memory/sqlite-cache
 * @description Encrypted persistent storage layer using SQLite
 * @status COMPLETE
 * @see src/memory/STATE.md
 * @dependencies better-sqlite3
 * @lastModified 2026-01-31
 */

import type { StorageProvider, SQLiteStorageOptions } from '../types/memory';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types for better-sqlite3 (dynamic import)
// ============================================================================

/**
 * Minimal type definition for better-sqlite3 Database
 * @internal
 */
interface DatabaseInstance {
  pragma(pragma: string): unknown;
  exec(sql: string): void;
  prepare(sql: string): StatementInstance;
  close(): void;
}

/**
 * Minimal type definition for better-sqlite3 Statement
 * @internal
 */
interface StatementInstance {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number };
}

/**
 * Database constructor type
 * @internal
 */
type DatabaseConstructor = new (path: string) => DatabaseInstance;

// ============================================================================
// Constants
// ============================================================================

/** PBKDF2 iteration count for key derivation */
const PBKDF2_ITERATIONS = 100000;

/** Salt length in bytes */
const SALT_LENGTH_BYTES = 16;

/** Metadata table key for storing encryption salt */
const SALT_METADATA_KEY = '__encryption_salt__';

// ============================================================================
// Encryption Utilities
// ============================================================================

/**
 * Generates a cryptographically random salt
 * @returns Hex-encoded random salt
 */
export function generateSalt(): string {
  return crypto.randomBytes(SALT_LENGTH_BYTES).toString('hex');
}

/**
 * Encrypt data using AES-256-GCM
 * @param data - Data to encrypt
 * @param key - 32-byte encryption key
 * @returns Encrypted data in format: iv:authTag:ciphertext
 */
export function encrypt(data: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

import { type Result, ok, err, type AppError } from '../types/common';

/** Decryption error type */
export interface DecryptError extends AppError {
  code: 'INVALID_FORMAT' | 'DECRYPTION_FAILED';
}

/**
 * Decrypt data using AES-256-GCM
 * @param data - Encrypted data in format: iv:authTag:ciphertext
 * @param key - 32-byte encryption key
 * @returns Result with decrypted string or error
 */
export function decrypt(data: string, key: Buffer): Result<string, DecryptError> {
  const parts = data.split(':');
  if (parts.length !== 3) {
    return err({
      code: 'INVALID_FORMAT',
      message: 'Invalid encrypted data format: expected iv:authTag:ciphertext',
    });
  }
  
  const ivHex = parts[0];
  const authTagHex = parts[1];
  const encrypted = parts[2];
  
  if (!ivHex || !authTagHex || !encrypted) {
    return err({
      code: 'INVALID_FORMAT',
      message: 'Invalid encrypted data format: missing components',
    });
  }
  
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return ok(decrypted);
  } catch (error) {
    return err({
      code: 'DECRYPTION_FAILED',
      message: 'Decryption failed: data may be corrupted or key is incorrect',
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Derive encryption key from password using PBKDF2
 * @param password - User password
 * @param salt - Unique salt (hex string) for this database
 * @returns 32-byte encryption key
 */
export function deriveKey(password: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(
    password, 
    Buffer.from(salt, 'hex'), 
    PBKDF2_ITERATIONS, 
    32, 
    'sha256'
  );
}

// ============================================================================
// SQLite Storage Provider
// ============================================================================

/**
 * SQLite-based storage provider with optional encryption
 */
export class SQLiteStorage implements StorageProvider {
  name = 'SQLite';

  private db: DatabaseInstance | null = null;
  private options: SQLiteStorageOptions;
  private encryptionKey: Buffer | null = null;
  private encryptionSalt: string | null = null;
  private initialized = false;
  
  /** Whether storage is using persistent SQLite (true) or in-memory fallback (false) */
  private _isPersistent = false;

  constructor(options: Partial<SQLiteStorageOptions> = {}) {
    this.options = {
      dbPath: options.dbPath ?? '.sf-debug-memory.db',
      encrypted: options.encrypted ?? false,
      encryptionKey: options.encryptionKey,
      walMode: options.walMode ?? true,
      autoVacuum: options.autoVacuum ?? 'INCREMENTAL',
    };
    // Note: encryptionKey is derived in initialize() after loading/generating salt
  }
  
  /**
   * Check if storage is using persistent SQLite database
   * Returns false if using in-memory fallback (e.g., better-sqlite3 not installed)
   */
  get isPersistent(): boolean {
    return this._isPersistent;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to handle missing dependency gracefully
      const Database = await this.loadDatabase();
      
      // Ensure directory exists
      const dir = path.dirname(this.options.dbPath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.options.dbPath);

      // Configure database
      if (this.options.walMode) {
        this.db.pragma('journal_mode = WAL');
      }
      
      this.db.pragma(`auto_vacuum = ${this.options.autoVacuum}`);

      // Create tables (including metadata table for salt storage)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS db_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_expires_at ON kv_store(expires_at);
        CREATE INDEX IF NOT EXISTS idx_key_prefix ON kv_store(key);
      `);

      // Initialize encryption if enabled
      if (this.options.encrypted && this.options.encryptionKey) {
        this.encryptionSalt = this.getOrCreateSalt();
        this.encryptionKey = deriveKey(this.options.encryptionKey, this.encryptionSalt);
      }

      this._isPersistent = true;
      this.initialized = true;
    } catch (error) {
      // If better-sqlite3 is not available, use in-memory fallback
      console.warn(
        '\n⚠️  WARNING: SQLite not available - using in-memory storage.\n' +
        '   Memory/Learning features will NOT persist between sessions.\n' +
        '   To enable persistence, install better-sqlite3:\n' +
        '   npm install better-sqlite3\n'
      );
      this.db = null;
      this._isPersistent = false;
      this.initialized = true;
    }
  }

  /**
   * Get existing salt from database or create a new one
   * This ensures each database file has its own unique salt
   */
  private getOrCreateSalt(): string {
    if (!this.db) {
      // Fallback: generate new salt for in-memory storage
      return generateSalt();
    }

    // Try to get existing salt
    const stmt = this.db.prepare('SELECT value FROM db_metadata WHERE key = ?');
    const row = stmt.get(SALT_METADATA_KEY) as { value: string } | undefined;

    if (row?.value) {
      return row.value;
    }

    // Generate and store new salt
    const newSalt = generateSalt();
    const insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)'
    );
    insertStmt.run(SALT_METADATA_KEY, newSalt);

    return newSalt;
  }

  /**
   * Load database module
   */
  private async loadDatabase(): Promise<DatabaseConstructor> {
    try {
      // Load better-sqlite3 (optional dependency)
      const mod = await import('better-sqlite3');
      return mod.default as DatabaseConstructor;
    } catch {
      throw new Error('better-sqlite3 not available');
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }

  /**
   * Get a value by key
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.db) {
      return this.fallbackGet<T>(key);
    }

    const stmt = this.db.prepare(
      'SELECT value, expires_at FROM kv_store WHERE key = ?'
    );
    const row = stmt.get(key) as { value: string; expires_at: number | null } | undefined;

    if (!row) return null;

    // Check expiration
    if (row.expires_at && row.expires_at < Date.now()) {
      await this.delete(key);
      return null;
    }

    let value: string;
    if (this.encryptionKey) {
      const decryptResult = decrypt(row.value, this.encryptionKey);
      if (!decryptResult.success) {
        // Decryption failed - data may be corrupted
        await this.delete(key);
        return null;
      }
      value = decryptResult.data;
    } else {
      value = row.value;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a value
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.db) {
      return this.fallbackSet(key, value, ttl);
    }

    const serialized = JSON.stringify(value);
    const stored = this.encryptionKey
      ? encrypt(serialized, this.encryptionKey)
      : serialized;

    const now = Date.now();
    const expiresAt = ttl ? now + ttl : null;

    const stmt = this.db.prepare(`
      INSERT INTO kv_store (key, value, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `);

    stmt.run(key, stored, expiresAt, now, now);
  }

  /**
   * Delete a value
   */
  async delete(key: string): Promise<boolean> {
    if (!this.db) {
      return this.fallbackDelete(key);
    }

    const stmt = this.db.prepare('DELETE FROM kv_store WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.db) {
      return this.fallbackExists(key);
    }

    const stmt = this.db.prepare(
      'SELECT 1 FROM kv_store WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)'
    );
    const row = stmt.get(key, Date.now());
    return row !== undefined;
  }

  /**
   * List keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.db) {
      return this.fallbackKeys(pattern);
    }

    // Convert glob pattern to SQL LIKE pattern
    const likePattern = pattern
      .replace(/\*/g, '%')
      .replace(/\?/g, '_');

    const stmt = this.db.prepare(
      'SELECT key FROM kv_store WHERE key LIKE ? AND (expires_at IS NULL OR expires_at > ?)'
    );
    const rows = stmt.all(likePattern, Date.now()) as { key: string }[];
    return rows.map((r) => r.key);
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    if (!this.db) {
      return this.fallbackClear();
    }

    this.db.exec('DELETE FROM kv_store');
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<number> {
    if (!this.db) return 0;

    const stmt = this.db.prepare(
      'DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at < ?'
    );
    const result = stmt.run(Date.now());
    return result.changes;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    expiredKeys: number;
    dbSizeBytes: number;
  }> {
    if (!this.db) {
      return { totalKeys: 0, expiredKeys: 0, dbSizeBytes: 0 };
    }

    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM kv_store').get() as { count: number }
    ).count;

    const expired = (
      this.db
        .prepare(
          'SELECT COUNT(*) as count FROM kv_store WHERE expires_at IS NOT NULL AND expires_at < ?'
        )
        .get(Date.now()) as { count: number }
    ).count;

    let dbSize = 0;
    try {
      const stats = fs.statSync(this.options.dbPath);
      dbSize = stats.size;
    } catch {
      // File might not exist yet
    }

    return {
      totalKeys: total,
      expiredKeys: expired,
      dbSizeBytes: dbSize,
    };
  }

  // ============================================================================
  // In-Memory Fallback (when SQLite is unavailable)
  // ============================================================================

  private fallbackStore = new Map<string, { value: string; expiresAt: number | null }>();

  private fallbackGet<T>(key: string): T | null {
    const entry = this.fallbackStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.fallbackStore.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }

  private fallbackSet<T>(key: string, value: T, ttl?: number): void {
    this.fallbackStore.set(key, {
      value: JSON.stringify(value),
      expiresAt: ttl ? Date.now() + ttl : null,
    });
  }

  private fallbackDelete(key: string): boolean {
    return this.fallbackStore.delete(key);
  }

  private fallbackExists(key: string): boolean {
    const entry = this.fallbackStore.get(key);
    if (!entry) return false;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.fallbackStore.delete(key);
      return false;
    }
    return true;
  }

  private fallbackKeys(pattern: string): string[] {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    const now = Date.now();
    return Array.from(this.fallbackStore.keys()).filter((key) => {
      const entry = this.fallbackStore.get(key)!;
      if (entry.expiresAt && entry.expiresAt < now) {
        this.fallbackStore.delete(key);
        return false;
      }
      return regex.test(key);
    });
  }

  private fallbackClear(): void {
    this.fallbackStore.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a SQLite storage provider
 */
export function createSQLiteStorage(
  options?: Partial<SQLiteStorageOptions>
): SQLiteStorage {
  return new SQLiteStorage(options);
}

/**
 * Create an encrypted SQLite storage provider
 */
export function createEncryptedStorage(
  dbPath: string,
  encryptionKey: string
): SQLiteStorage {
  return new SQLiteStorage({
    dbPath,
    encrypted: true,
    encryptionKey,
    walMode: true,
    autoVacuum: 'INCREMENTAL',
  });
}
