// Help Bibi — Rate Limiter Backend tests (FASE 27)
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  rateLimit, clearRateLimits, applyRateLimit, getClientIp, RATE_LIMITS,
  MemoryRateLimitBackend, RedisRateLimitBackend, getRateLimitBackend,
  type RateLimitBackend,
} from '@/server/rate-limit'

describe('Rate Limiter Backend Interface (FASE 27)', () => {
  beforeEach(() => {
    clearRateLimits()
  })

  test('1. MemoryRateLimitBackend implements RateLimitBackend', () => {
    const backend: RateLimitBackend = new MemoryRateLimitBackend()
    expect(typeof backend.check).toBe('function')
    expect(typeof backend.clear).toBe('function')
  })

  test('2. MemoryRateLimitBackend allows up to max then blocks', () => {
    const backend = new MemoryRateLimitBackend()
    const config = { maxRequests: 3, windowMs: 1000 }
    expect(backend.check('key1', config).allowed).toBe(true)
    expect(backend.check('key1', config).allowed).toBe(true)
    expect(backend.check('key1', config).allowed).toBe(true)
    expect(backend.check('key1', config).allowed).toBe(false)
  })

  test('3. MemoryRateLimitBackend reset after window', () => {
    const backend = new MemoryRateLimitBackend()
    const config = { maxRequests: 2, windowMs: 100 }
    backend.check('key1', config)
    backend.check('key1', config)
    expect(backend.check('key1', config).allowed).toBe(false)
    // Wait for window to expire
    const start = Date.now()
    while (Date.now() - start < 120) { /* busy wait */ }
    expect(backend.check('key1', config).allowed).toBe(true)
  })

  test('4. MemoryRateLimitBackend.clear resets all buckets', () => {
    const backend = new MemoryRateLimitBackend()
    const config = { maxRequests: 1, windowMs: 10000 }
    backend.check('key1', config)
    expect(backend.check('key1', config).allowed).toBe(false)
    backend.clear()
    expect(backend.check('key1', config).allowed).toBe(true)
  })

  test('5. RedisRateLimitBackend is a stub that falls back to memory', () => {
    const backend = new RedisRateLimitBackend()
    expect(typeof backend.check).toBe('function')
    expect(typeof backend.clear).toBe('function')
    // Should work (delegating to memory internally)
    const config = { maxRequests: 2, windowMs: 1000 }
    expect(backend.check('redis_key1', config).allowed).toBe(true)
    expect(backend.check('redis_key1', config).allowed).toBe(true)
    expect(backend.check('redis_key1', config).allowed).toBe(false)
  })

  test('6. getRateLimitBackend returns a backend', () => {
    const backend = getRateLimitBackend()
    expect(backend).toBeDefined()
    expect(typeof backend.check).toBe('function')
  })

  test('7. getRateLimitBackend defaults to memory', () => {
    // In dev (no RATE_LIMIT_BACKEND set, or set to memory), returns MemoryRateLimitBackend
    const backend = getRateLimitBackend()
    expect(backend).toBeInstanceOf(MemoryRateLimitBackend)
  })

  test('8. RATE_LIMITS presets all exist', () => {
    expect(RATE_LIMITS.login).toBeDefined()
    expect(RATE_LIMITS.me).toBeDefined()
    expect(RATE_LIMITS.webhook).toBeDefined()
    expect(RATE_LIMITS.simulate).toBeDefined()
    expect(RATE_LIMITS.track).toBeDefined()
    expect(RATE_LIMITS.admin).toBeDefined()
    expect(RATE_LIMITS.history).toBeDefined()
    expect(RATE_LIMITS.health).toBeDefined()
  })

  test('9. rateLimit function delegates to backend (backward compat)', () => {
    const config = { maxRequests: 2, windowMs: 1000 }
    expect(rateLimit('compat_key', config).allowed).toBe(true)
    expect(rateLimit('compat_key', config).allowed).toBe(true)
    expect(rateLimit('compat_key', config).allowed).toBe(false)
  })

  test('10. applyRateLimit returns null when allowed', () => {
    const req = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    })
    const result = applyRateLimit(req, 'test_route', { maxRequests: 5, windowMs: 1000 })
    expect(result).toBe(null)
  })

  test('11. applyRateLimit returns 429 Response when blocked', () => {
    const req = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '127.0.0.2' },
    })
    const config = { maxRequests: 1, windowMs: 1000 }
    applyRateLimit(req, 'test_block', config) // first call allowed
    const blocked = applyRateLimit(req, 'test_block', config)
    expect(blocked).not.toBe(null)
    expect(blocked!.status).toBe(429)
  })

  test('12. 429 response includes Retry-After header', () => {
    const req = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '127.0.0.3' },
    })
    const config = { maxRequests: 1, windowMs: 5000 }
    applyRateLimit(req, 'test_retry', config)
    const blocked = applyRateLimit(req, 'test_retry', config)!
    expect(blocked.headers.get('Retry-After')).not.toBe(null)
  })

  test('13. different IPs have independent rate limits', () => {
    const req1 = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '1.1.1.1' },
    })
    const req2 = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '2.2.2.2' },
    })
    const config = { maxRequests: 1, windowMs: 1000 }
    expect(applyRateLimit(req1, 'multi_ip', config)).toBe(null)
    expect(applyRateLimit(req2, 'multi_ip', config)).toBe(null) // different IP, allowed
    expect(applyRateLimit(req1, 'multi_ip', config)).not.toBe(null) // same IP, blocked
  })

  test('14. getClientIp extracts from x-forwarded-for', () => {
    const req = new Request('https://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  test('15. getClientIp extracts from x-real-ip', () => {
    const req = new Request('https://localhost', {
      headers: { 'x-real-ip': '10.0.0.3' },
    })
    expect(getClientIp(req)).toBe('10.0.0.3')
  })

  test('16. getClientIp defaults to unknown', () => {
    const req = new Request('https://localhost')
    expect(getClientIp(req)).toBe('unknown')
  })
})
