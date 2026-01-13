/**
 * Task Lock Module
 *
 * Provides a locking mechanism to prevent concurrent task creation
 * for the same fingerprint across multiple tabs/requests.
 */

/**
 * Lock entry with metadata
 */
interface LockEntry {
  /** Lock acquisition timestamp */
  acquiredAt: number;
  /** Lock expiration timestamp */
  expiresAt: number;
  /** Optional owner identifier */
  owner?: string;
}

/**
 * Lock configuration options
 */
export interface LockOptions {
  /** Lock timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Owner identifier for debugging */
  owner?: string;
  /** Whether to wait for lock if already held (default: false) */
  wait?: boolean;
  /** Maximum wait time in milliseconds (default: 5000) */
  maxWaitTime?: number;
  /** Retry interval when waiting (default: 100ms) */
  retryInterval?: number;
}

const DEFAULT_LOCK_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_WAIT_TIME = 5000; // 5 seconds
const DEFAULT_RETRY_INTERVAL = 100; // 100ms

/**
 * TaskLock class
 * Provides in-memory locking mechanism for task creation
 */
export class TaskLock {
  private locks: Map<string, LockEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic cleanup of expired locks
    this.startCleanup();
  }

  /**
   * Acquire a lock for the given key
   * @param key Lock key (typically task fingerprint)
   * @param options Lock options
   * @returns True if lock was acquired, false otherwise
   */
  async acquire(key: string, options: LockOptions = {}): Promise<boolean> {
    const {
      timeout = DEFAULT_LOCK_TIMEOUT,
      owner,
      wait = false,
      maxWaitTime = DEFAULT_MAX_WAIT_TIME,
      retryInterval = DEFAULT_RETRY_INTERVAL,
    } = options;

    // Try to acquire immediately
    if (this.tryAcquire(key, timeout, owner)) {
      return true;
    }

    // If not waiting, return false immediately
    if (!wait) {
      return false;
    }

    // Wait and retry
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      await this.sleep(retryInterval);

      // Clean up expired lock if any
      this.cleanupExpired(key);

      if (this.tryAcquire(key, timeout, owner)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Try to acquire lock without waiting
   */
  private tryAcquire(key: string, timeout: number, owner?: string): boolean {
    const existing = this.locks.get(key);

    // Check if lock exists and is still valid
    if (existing && existing.expiresAt > Date.now()) {
      return false;
    }

    // Acquire the lock
    const now = Date.now();
    this.locks.set(key, {
      acquiredAt: now,
      expiresAt: now + timeout,
      owner,
    });

    return true;
  }

  /**
   * Release a lock
   * @param key Lock key
   * @param owner Optional owner to verify (only release if owner matches)
   * @returns True if lock was released, false if not found or owner mismatch
   */
  release(key: string, owner?: string): boolean {
    const existing = this.locks.get(key);

    if (!existing) {
      return false;
    }

    // If owner is specified, verify it matches
    if (owner && existing.owner && existing.owner !== owner) {
      console.warn(`[TaskLock] Owner mismatch for key ${key}: expected ${existing.owner}, got ${owner}`);
      return false;
    }

    this.locks.delete(key);
    return true;
  }

  /**
   * Check if a key is currently locked
   * @param key Lock key
   * @returns True if locked, false otherwise
   */
  isLocked(key: string): boolean {
    const existing = this.locks.get(key);

    if (!existing) {
      return false;
    }

    // Check if lock has expired
    if (existing.expiresAt <= Date.now()) {
      this.locks.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get lock info for a key
   * @param key Lock key
   * @returns Lock entry or null if not locked
   */
  getLockInfo(key: string): LockEntry | null {
    const existing = this.locks.get(key);

    if (!existing || existing.expiresAt <= Date.now()) {
      return null;
    }

    return { ...existing };
  }

  /**
   * Extend lock timeout
   * @param key Lock key
   * @param additionalTime Additional time in milliseconds
   * @param owner Optional owner to verify
   * @returns True if extended, false if not found or owner mismatch
   */
  extend(key: string, additionalTime: number, owner?: string): boolean {
    const existing = this.locks.get(key);

    if (!existing || existing.expiresAt <= Date.now()) {
      return false;
    }

    if (owner && existing.owner && existing.owner !== owner) {
      return false;
    }

    existing.expiresAt += additionalTime;
    return true;
  }

  /**
   * Get all active locks
   * @returns Map of active locks
   */
  getActiveLocks(): Map<string, LockEntry> {
    const now = Date.now();
    const active = new Map<string, LockEntry>();

    for (const [key, entry] of this.locks) {
      if (entry.expiresAt > now) {
        active.set(key, { ...entry });
      }
    }

    return active;
  }

  /**
   * Clear all locks
   */
  clearAll(): void {
    this.locks.clear();
  }

  /**
   * Clean up expired lock for a specific key
   */
  private cleanupExpired(key: string): void {
    const existing = this.locks.get(key);
    if (existing && existing.expiresAt <= Date.now()) {
      this.locks.delete(key);
    }
  }

  /**
   * Start periodic cleanup of expired locks
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    // Clean up every 60 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.locks) {
        if (entry.expiresAt <= now) {
          this.locks.delete(key);
        }
      }
    }, 60000);
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.locks.clear();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance for SW context
let instance: TaskLock | null = null;

/**
 * Get the singleton TaskLock instance
 */
export function getTaskLock(): TaskLock {
  if (!instance) {
    instance = new TaskLock();
  }
  return instance;
}

export default TaskLock;
