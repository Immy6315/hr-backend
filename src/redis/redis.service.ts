import { Inject, Injectable, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

interface L1Entry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class RedisService {
  private readonly l1 = new Map<string, L1Entry<any>>();

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    @Optional() private readonly defaultTtlSec: number = 60,
  ) {}

  async get<T>(key: string, useL1 = true): Promise<T | null> {
    if (useL1) {
      const e = this.l1.get(key);
      if (e && e.expiresAt > Date.now()) return e.data as T;
    }
    try {
      const val = await this.cache.get<T>(key);
      return (val as any) ?? null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSec?: number, l1TtlMs?: number): Promise<void> {
    if (l1TtlMs && l1TtlMs > 0) {
      this.l1.set(key, { data: value, expiresAt: Date.now() + l1TtlMs });
    }
    try {
      await this.cache.set(key, value as any, ttlSec ?? this.defaultTtlSec);
    } catch {}
  }

  async del(key: string): Promise<void> {
    this.l1.delete(key);
    try {
      await this.cache.del(key);
    } catch {}
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    opts?: { ttlSec?: number; l1TtlMs?: number; useL1?: boolean },
  ): Promise<T> {
    const useL1 = opts?.useL1 !== false;
    const l1TtlMs = opts?.l1TtlMs ?? 10_000;
    const ttlSec = opts?.ttlSec ?? this.defaultTtlSec;

    const fromCache = await this.get<T>(key, useL1);
    if (fromCache !== null && fromCache !== undefined) return fromCache;

    const data = await factory();
    await this.set<T>(key, data, ttlSec, useL1 ? l1TtlMs : 0);
    return data;
  }

  /**
   * Acquire a distributed lock
   */
  async acquireLock(lockKey: string, ttlSeconds: number = 300): Promise<boolean> {
    try {
      const lockValue = Date.now().toString();
      const store = (this.cache as any).store;

      if (!store || !store.client) {
        return true; // Fallback: allow operation if Redis unavailable
      }

      const result = await store.client.set(lockKey, lockValue, {
        NX: true,
        EX: ttlSeconds,
      });

      return result === 'OK';
    } catch (error) {
      return true;
    }
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.del(lockKey);
    } catch (error) {
      // Ignore errors on release
    }
  }

  /**
   * Execute a function with a distributed lock
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 300,
  ): Promise<T | null> {
    const acquired = await this.acquireLock(lockKey, ttlSeconds);

    if (!acquired) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey);
    }
  }
}

