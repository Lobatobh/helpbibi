// Help Bibi — Socket.IO validation helpers (FASE 26)
// Extracted from index.ts for testability.
// Pure functions: isValidLatLng, isValidText, isNonEmptyString.
// Per-socket fixed-window rate limiter: socketRateLimit + socketRateBuckets.

export type SocketRateBucket = { count: number; resetAt: number }

// Per-socket event buckets: socketId -> eventName -> bucket
export const socketRateBuckets = new Map<string, Map<string, SocketRateBucket>>()

/**
 * Clear all per-socket rate limit buckets (mostly for tests).
 */
export function clearSocketRateBuckets(): void {
  socketRateBuckets.clear()
}

/**
 * Fixed-window per-socket, per-event rate limiter.
 * @returns true if request is allowed, false if rate-limited.
 */
export function socketRateLimit(socketId: string, event: string, max: number, windowMs: number): boolean {
  if (!socketRateBuckets.has(socketId)) socketRateBuckets.set(socketId, new Map())
  const buckets = socketRateBuckets.get(socketId)!
  const now = Date.now()
  const existing = buckets.get(event)
  if (!existing || existing.resetAt < now) {
    buckets.set(event, { count: 1, resetAt: now + windowMs })
    return true
  }
  existing.count += 1
  return existing.count <= max
}

/**
 * Validate a lat/lng object. lat in [-90, 90], lng in [-180, 180].
 */
export function isValidLatLng(pos: any): boolean {
  return Boolean(pos && typeof pos.lat === 'number' && typeof pos.lng === 'number'
    && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)
    && pos.lat >= -90 && pos.lat <= 90 && pos.lng >= -180 && pos.lng <= 180)
}

/**
 * Validate a non-empty string within a max length (after trim).
 */
export function isValidText(text: any, maxLen: number): boolean {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= maxLen
}

/**
 * Validate a non-empty string with a default max length of 200.
 */
export function isNonEmptyString(s: any, maxLen: number = 200): boolean {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= maxLen
}
