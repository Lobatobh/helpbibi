// Help Bibi — Rate Limiter (FASE 27/28 refactor)
// Backend interface for rate limiting with memory + REAL Redis (ioredis).
// Production MUST use Redis (or a proxy/WAF) — the memory backend is single-instance only.

import { logger } from './logger'

type Bucket = { count: number; resetAt: number }

export type RateLimitConfig = {
  maxRequests: number
  windowMs: number
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterMs: number
}

/**
 * Backend interface for rate limit storage.
 * FASE 28: check() is async to support Redis I/O.
 */
export interface RateLimitBackend {
  check(key: string, config: RateLimitConfig): Promise<RateLimitResult>
  clear(): Promise<void>
}

/**
 * In-memory rate limiter using a fixed window per key.
 * Suitable for dev/single-instance deployments. NOT safe for multi-instance production.
 */
export class MemoryRateLimitBackend implements RateLimitBackend {
  private readonly buckets = new Map<string, Bucket>()
  private lastCleanup = Date.now()

  async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    this.cleanup()
    const now = Date.now()
    const existing = this.buckets.get(key)

    if (!existing || existing.resetAt < now) {
      const resetAt = now + config.windowMs
      this.buckets.set(key, { count: 1, resetAt })
      return { allowed: true, remaining: config.maxRequests - 1, resetAt, retryAfterMs: 0 }
    }

    existing.count += 1
    const allowed = existing.count <= config.maxRequests
    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - existing.count),
      resetAt: existing.resetAt,
      retryAfterMs: allowed ? 0 : existing.resetAt - now,
    }
  }

  async clear(): Promise<void> {
    this.buckets.clear()
  }

  private cleanup(): void {
    const now = Date.now()
    if (now - this.lastCleanup < 60000) return
    this.lastCleanup = now
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt < now) this.buckets.delete(key)
    }
  }
}

/**
 * Redis-backed rate limiter (FASE 28 — REAL implementation using ioredis).
 *
 * Uses INCR + PEXPIRE for atomic fixed-window rate limiting:
 *   - INCR increments the counter (creates key with value 1 if it doesn't exist)
 *   - On first increment (count === 1), set PEXPIRE to the window duration
 *   - TTL gives us the time until reset
 *
 * If Redis is unavailable in production, check() throws an error (no silent fallback).
 * In dev, it logs a warning and falls back to memory.
 */
export class RedisRateLimitBackend implements RateLimitBackend {
  private redis: any // ioredis instance
  private fallback: MemoryRateLimitBackend | null = null
  private readonly isProd: boolean

  constructor(redisUrlOrClient?: string | any) {
    this.isProd = process.env.NODE_ENV === 'production'
    // FASE 28: support injecting a fake Redis client for testing
    if (redisUrlOrClient && typeof redisUrlOrClient === 'object') {
      this.redis = redisUrlOrClient
      return
    }
    const url = (typeof redisUrlOrClient === 'string' ? redisUrlOrClient : null) || process.env.REDIS_URL
    if (!url) {
      if (this.isProd) {
        throw new Error('[rate-limit] REDIS_URL is required when RATE_LIMIT_BACKEND=redis in production')
      }
      logger.warn('rate-limit', 'REDIS_URL not set — Redis backend falling back to memory (dev only)')
      this.fallback = new MemoryRateLimitBackend()
      return
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require('ioredis')
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times: number) => Math.min(times * 100, 1000),
      })
      this.redis.on('error', (err: Error) => {
        logger.error('rate-limit', 'Redis connection error', { message: err.message })
      })
      this.redis.on('connect', () => {
        logger.info('rate-limit', 'Redis connected', { url: url.replace(/:[^:@]+@/, ':***@') })
      })
    } catch (e: any) {
      if (this.isProd) {
        throw new Error(`[rate-limit] Failed to initialize ioredis: ${e.message}`)
      }
      logger.warn('rate-limit', 'ioredis not available — falling back to memory (dev only)', { error: e.message })
      this.fallback = new MemoryRateLimitBackend()
    }
  }

  async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    // Dev fallback to memory if Redis not available
    if (this.fallback) {
      return this.fallback.check(key, config)
    }

    const redisKey = `rl:${key}`
    try {
      // Atomic INCR + PEXPIRE pattern (fixed window)
      const count = await this.redis.incr(redisKey)
      if (count === 1) {
        // First request in window — set TTL
        await this.redis.pexpire(redisKey, config.windowMs)
      }
      const ttl = await this.redis.pttl(redisKey)
      const now = Date.now()
      const allowed = count <= config.maxRequests
      return {
        allowed,
        remaining: Math.max(0, config.maxRequests - count),
        resetAt: now + (ttl > 0 ? ttl : config.windowMs),
        retryAfterMs: allowed ? 0 : (ttl > 0 ? ttl : config.windowMs),
      }
    } catch (e: any) {
      if (this.isProd) {
        // Production: NO silent fallback — throw to prevent allow-all
        logger.error('rate-limit', 'Redis check failed in production — rejecting request', { message: e.message })
        throw new Error(`[rate-limit] Redis unavailable in production: ${e.message}`)
      }
      // Dev: log warning and allow the request (better DX than blocking)
      logger.warn('rate-limit', 'Redis check failed in dev — allowing request', { message: e.message })
      return { allowed: true, remaining: config.maxRequests - 1, resetAt: Date.now() + config.windowMs, retryAfterMs: 0 }
    }
  }

  async clear(): Promise<void> {
    if (this.fallback) {
      return this.fallback.clear()
    }
    try {
      // Use SCAN to find rl:* keys (avoid KEYS in production — O(N))
      let cursor = '0'
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'rl:*', 'COUNT', 100)
        cursor = nextCursor
        if (keys.length > 0) {
          await this.redis.del(...keys)
        }
      } while (cursor !== '0')
    } catch (e: any) {
      logger.error('rate-limit', 'Redis clear failed', { message: e.message })
    }
  }
}

let backend: RateLimitBackend | null = null

/**
 * Factory: returns the configured RateLimitBackend (singleton, lazily created).
 * Reads `RATE_LIMIT_BACKEND` env var (default: 'memory'; supports 'redis').
 */
export function getRateLimitBackend(): RateLimitBackend {
  if (backend) return backend

  const requested = (process.env.RATE_LIMIT_BACKEND || 'memory').toLowerCase()
  const isProd = process.env.NODE_ENV === 'production'

  if (requested === 'redis') {
    backend = new RedisRateLimitBackend()
  } else {
    if (isProd) {
      logger.warn(
        'rate-limit',
        '⚠️ RATE_LIMIT_BACKEND=memory in PRODUCTION. In-memory rate limiting does NOT work across ' +
          'multiple instances/processes. Set RATE_LIMIT_BACKEND=redis (with REDIS_URL) or use a proxy/WAF.',
        { backend: 'memory', nodeEnv: process.env.NODE_ENV }
      )
    }
    backend = new MemoryRateLimitBackend()
  }

  return backend
}

// ─── Backward-compatible public API ─────────────────────────────────────────
// FASE 28: rateLimit() and applyRateLimit() are now ASYNC to support Redis.
// All API route callers have been updated to `await` them.

export async function rateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  return getRateLimitBackend().check(key, config)
}

export async function clearRateLimits(): Promise<void> {
  await getRateLimitBackend().clear()
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

export const RATE_LIMITS = {
  login: { maxRequests: 10, windowMs: 60_000 },
  me: { maxRequests: 60, windowMs: 60_000 },
  webhook: { maxRequests: 30, windowMs: 60_000 },
  simulate: { maxRequests: 20, windowMs: 60_000 },
  track: { maxRequests: 60, windowMs: 60_000 },
  admin: { maxRequests: 60, windowMs: 60_000 },
  history: { maxRequests: 30, windowMs: 60_000 },
  health: { maxRequests: 120, windowMs: 60_000 },
} as const

/**
 * Apply rate limiting to a Next.js route handler (FASE 28: async).
 * Returns null if allowed, or a Response (429) if rate limited.
 */
export async function applyRateLimit(
  request: Request,
  routeName: string,
  config: RateLimitConfig
): Promise<null | Response> {
  const ip = getClientIp(request)
  const key = `${routeName}:${ip}`
  const result = await rateLimit(key, config)
  if (result.allowed) return null
  return new Response(
    JSON.stringify({
      message: 'Too many requests',
      retryAfterMs: result.retryAfterMs,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(result.resetAt),
      },
    }
  )
}

// Reset backend singleton (for testing)
export function _resetBackend(): void {
  backend = null
}
