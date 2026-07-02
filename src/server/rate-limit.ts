// Help Bibi — Rate Limiter (FASE 27 refactor)
// Backend interface for rate limiting with memory + redis stub.
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
 * Implementations: MemoryRateLimitBackend (default), RedisRateLimitBackend (stub).
 */
export interface RateLimitBackend {
  /**
   * Check if a request is allowed under the rate limit.
   * @param key - identifier (e.g. IP + route, or userId + route)
   * @param config - { maxRequests, windowMs }
   * @returns { allowed, remaining, resetAt, retryAfterMs }
   */
  check(key: string, config: RateLimitConfig): RateLimitResult
  /** Clear all buckets (for testing). */
  clear(): void
}

/**
 * In-memory rate limiter using a fixed window per key.
 * Suitable for dev/single-instance deployments. NOT safe for multi-instance production
 * because each process keeps its own buckets — use RedisRateLimitBackend (or a proxy/WAF)
 * in production.
 */
export class MemoryRateLimitBackend implements RateLimitBackend {
  private readonly buckets = new Map<string, Bucket>()
  private lastCleanup = Date.now()

  check(key: string, config: RateLimitConfig): RateLimitResult {
    this.cleanup()
    const now = Date.now()
    const existing = this.buckets.get(key)

    // Reset bucket if window expired
    if (!existing || existing.resetAt < now) {
      const resetAt = now + config.windowMs
      this.buckets.set(key, { count: 1, resetAt })
      return { allowed: true, remaining: config.maxRequests - 1, resetAt, retryAfterMs: 0 }
    }

    // Increment and check
    existing.count += 1
    const allowed = existing.count <= config.maxRequests
    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - existing.count),
      resetAt: existing.resetAt,
      retryAfterMs: allowed ? 0 : existing.resetAt - now,
    }
  }

  clear(): void {
    this.buckets.clear()
  }

  // Cleanup expired buckets every 60s to prevent memory leak
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
 * Redis-backed rate limiter STUB.
 *
 * ⚠️ `ioredis` is NOT installed in this project. This stub logs a warning on construction
 * and falls back to MemoryRateLimitBackend so the app still works in dev/staging.
 *
 * To finish the implementation in production:
 *   1. `bun add ioredis`
 *   2. Set `REDIS_URL` (or `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`) in your env.
 *   3. Implement `check()` using a Redis INCR + PEXPIRE pattern, e.g.:
 *        const redisKey = `rl:${key}`
 *        const count = await redis.incr(redisKey)
 *        if (count === 1) await redis.pexpire(redisKey, config.windowMs)
 *        const ttl = await redis.pttl(redisKey)
 *        const allowed = count <= config.maxRequests
 *        return {
 *          allowed,
 *          remaining: Math.max(0, config.maxRequests - count),
 *          resetAt: Date.now() + ttl,
 *          retryAfterMs: allowed ? 0 : ttl,
 *        }
 *   4. Implement `clear()` using SCAN over `rl:*` keys → DEL (avoid KEYS in prod).
 *   5. Note: `check()` becomes async — callers like `applyRateLimit` must be updated to
 *      `await` it. Either add a `checkAsync()` to this interface or migrate the whole
 *      `RateLimitBackend` interface to return `Promise<RateLimitResult>`.
 */
export class RedisRateLimitBackend implements RateLimitBackend {
  private readonly fallback: MemoryRateLimitBackend

  constructor() {
    logger.warn(
      'rate-limit',
      'RedisRateLimitBackend is a STUB — ioredis is not installed. Falling back to MemoryRateLimitBackend. ' +
        'Install ioredis, set REDIS_URL, and implement the real INCR+EXPIRE logic before using in production.',
      { backend: 'redis-stub' }
    )
    this.fallback = new MemoryRateLimitBackend()
  }

  check(key: string, config: RateLimitConfig): RateLimitResult {
    return this.fallback.check(key, config)
  }

  clear(): void {
    this.fallback.clear()
  }
}

let backend: RateLimitBackend | null = null

/**
 * Factory: returns the configured RateLimitBackend (singleton, lazily created).
 * Reads `RATE_LIMIT_BACKEND` env var (default: 'memory'; supports 'redis' for the stub).
 *
 * In production with 'memory', logs a strong warning — the memory backend does NOT work
 * across multiple instances/processes and is reset on every deploy/restart, so it is
 * easily bypassed.
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
          'multiple instances/processes (each process has its own buckets) and is reset on every deploy/restart. ' +
          'Set RATE_LIMIT_BACKEND=redis (with ioredis installed) or put a real rate limiter (e.g. Cloudflare, ' +
          'Vercel Edge rate limit, NGINX limit_req) in front of the app.',
        { backend: 'memory', nodeEnv: process.env.NODE_ENV }
      )
    }
    backend = new MemoryRateLimitBackend()
  }

  return backend
}

// ─── Backward-compatible public API ─────────────────────────────────────────
// These keep the original module exports working for the 11 API routes and the
// existing FASE 26 test suite. Internally they delegate to the active backend.

/**
 * Check if a request is allowed under the rate limit. (Backward-compatible wrapper.)
 * @param key - identifier (e.g. IP + route, or userId + route)
 * @param config - { maxRequests, windowMs }
 * @returns { allowed, remaining, resetAt, retryAfterMs }
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  return getRateLimitBackend().check(key, config)
}

/**
 * Clear all buckets (for testing). (Backward-compatible wrapper.)
 */
export function clearRateLimits(): void {
  getRateLimitBackend().clear()
}

/**
 * Get the client IP from a Next.js request, accounting for proxies.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

// Pre-configured rate limit presets
export const RATE_LIMITS = {
  login: { maxRequests: 10, windowMs: 60_000 },         // 10/min per IP
  me: { maxRequests: 60, windowMs: 60_000 },            // 60/min per IP
  webhook: { maxRequests: 30, windowMs: 60_000 },       // 30/min per IP
  simulate: { maxRequests: 20, windowMs: 60_000 },      // 20/min per IP (dev)
  track: { maxRequests: 60, windowMs: 60_000 },         // 60/min per IP
  admin: { maxRequests: 60, windowMs: 60_000 },         // 60/min per IP
  history: { maxRequests: 30, windowMs: 60_000 },       // 30/min per IP
  health: { maxRequests: 120, windowMs: 60_000 },       // 120/min per IP
} as const

/**
 * Apply rate limiting to a Next.js route handler.
 * Returns null if allowed, or a Response (429) if rate limited.
 */
export function applyRateLimit(
  request: Request,
  routeName: string,
  config: RateLimitConfig
): null | Response {
  const ip = getClientIp(request)
  const key = `${routeName}:${ip}`
  const result = rateLimit(key, config)
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
