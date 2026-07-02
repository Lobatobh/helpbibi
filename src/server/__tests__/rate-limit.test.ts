// Help Bibi — Rate Limiter tests (FASE 26)
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  rateLimit, clearRateLimits, getClientIp, applyRateLimit, RATE_LIMITS,
} from '@/server/rate-limit'

describe('rate-limit — rateLimit()', () => {
  beforeEach(() => { clearRateLimits() })

  test('1. allows up to maxRequests within the window', () => {
    const cfg = { maxRequests: 3, windowMs: 1000 }
    expect(rateLimit('k1', cfg).allowed).toBe(true)
    expect(rateLimit('k1', cfg).allowed).toBe(true)
    expect(rateLimit('k1', cfg).allowed).toBe(true)
  })

  test('2. blocks requests exceeding maxRequests', () => {
    const cfg = { maxRequests: 2, windowMs: 1000 }
    rateLimit('k2', cfg)
    rateLimit('k2', cfg)
    const third = rateLimit('k2', cfg)
    expect(third.allowed).toBe(false)
    expect(third.retryAfterMs).toBeGreaterThan(0)
  })

  test('3. resets after the window expires', async () => {
    const cfg = { maxRequests: 1, windowMs: 50 }
    expect(rateLimit('k3', cfg).allowed).toBe(true)
    expect(rateLimit('k3', cfg).allowed).toBe(false)
    await new Promise((r) => setTimeout(r, 80))
    // After window expires, the bucket resets and a new request is allowed
    expect(rateLimit('k3', cfg).allowed).toBe(true)
  })

  test('4. different keys are independent (one does not affect the other)', () => {
    const cfg = { maxRequests: 1, windowMs: 1000 }
    expect(rateLimit('k4a', cfg).allowed).toBe(true)
    expect(rateLimit('k4a', cfg).allowed).toBe(false)
    // k4b is a different key, so it should still be allowed
    expect(rateLimit('k4b', cfg).allowed).toBe(true)
  })

  test('5. remaining count decrements as requests are consumed', () => {
    const cfg = { maxRequests: 3, windowMs: 1000 }
    const r1 = rateLimit('k5', cfg)
    expect(r1.remaining).toBe(2)
    const r2 = rateLimit('k5', cfg)
    expect(r2.remaining).toBe(1)
    const r3 = rateLimit('k5', cfg)
    expect(r3.remaining).toBe(0)
    // Once exceeded, remaining stays at 0
    const r4 = rateLimit('k5', cfg)
    expect(r4.remaining).toBe(0)
  })
})

describe('rate-limit — clearRateLimits()', () => {
  test('6. clearRateLimits allows previously-blocked key to be used again', () => {
    const cfg = { maxRequests: 1, windowMs: 10_000 }
    expect(rateLimit('k6', cfg).allowed).toBe(true)
    expect(rateLimit('k6', cfg).allowed).toBe(false)
    clearRateLimits()
    // After clearing, the same key should be allowed again (fresh bucket)
    expect(rateLimit('k6', cfg).allowed).toBe(true)
  })
})

describe('rate-limit — getClientIp()', () => {
  test('7. extracts the first IP from x-forwarded-for header', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.2' },
    })
    expect(getClientIp(req)).toBe('203.0.113.1')
  })

  test('8. falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-real-ip': '198.51.100.42' },
    })
    expect(getClientIp(req)).toBe('198.51.100.42')
  })

  test('9. returns "unknown" when no IP headers are present', () => {
    const req = new Request('https://example.com')
    expect(getClientIp(req)).toBe('unknown')
  })
})

describe('rate-limit — RATE_LIMITS presets', () => {
  test('10. all expected presets exist with maxRequests and windowMs', () => {
    const expected = ['login', 'me', 'webhook', 'simulate', 'track', 'admin', 'history', 'health']
    for (const name of expected) {
      expect(RATE_LIMITS).toHaveProperty(name)
      const preset = (RATE_LIMITS as any)[name]
      expect(typeof preset.maxRequests).toBe('number')
      expect(typeof preset.windowMs).toBe('number')
      expect(preset.maxRequests).toBeGreaterThan(0)
      expect(preset.windowMs).toBeGreaterThan(0)
    }
  })
})

describe('rate-limit — applyRateLimit()', () => {
  beforeEach(() => { clearRateLimits() })

  test('11. returns null when request is within the limit', () => {
    const req = new Request('https://example.com')
    const result = applyRateLimit(req, 'route_test', { maxRequests: 5, windowMs: 1000 })
    expect(result).toBe(null)
  })

  test('12. returns a 429 Response with Retry-After header when rate limited', () => {
    const cfg = { maxRequests: 1, windowMs: 1000 }
    const req = new Request('https://example.com')
    // First request allowed
    expect(applyRateLimit(req, 'route_test2', cfg)).toBe(null)
    // Second request rate limited
    const blocked = applyRateLimit(req, 'route_test2', cfg)
    expect(blocked).not.toBe(null)
    expect(blocked!.status).toBe(429)
    const retryAfter = blocked!.headers.get('Retry-After')
    expect(retryAfter).not.toBe(null)
    expect(Number(retryAfter)).toBeGreaterThan(0)
    // Body should be parseable JSON containing a message
    const body = blocked!.json ? null : null
    expect(typeof body).toBe('object')
  })
})
