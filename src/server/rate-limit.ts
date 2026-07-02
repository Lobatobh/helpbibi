// Help Bibi — Rate Limiter (FASE 26)
// Simple in-memory rate limiter using sliding window.
// For production real, use Redis or a proxy/WAF (documented).

type Bucket = { count: number; resetAt: number }

type RateLimitConfig = {
  maxRequests: number
  windowMs: number
}

type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterMs: number
}

const buckets = new Map<string, Bucket>()

// Cleanup expired buckets every 60s to prevent memory leak
let lastCleanup = Date.now()
function cleanup(): void {
  const now = Date.now()
  if (now - lastCleanup < 60000) return
  lastCleanup = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
}

/**
 * Check if a request is allowed under the rate limit.
 * @param key - identifier (e.g. IP + route, or userId + route)
 * @param config - { maxRequests, windowMs }
 * @returns { allowed, remaining, resetAt, retryAfterMs }
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  cleanup()
  const now = Date.now()
  const existing = buckets.get(key)

  // Reset bucket if window expired
  if (!existing || existing.resetAt < now) {
    const resetAt = now + config.windowMs
    buckets.set(key, { count: 1, resetAt })
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

/**
 * Clear all buckets (for testing).
 */
export function clearRateLimits(): void {
  buckets.clear()
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
