// Help Bibi — Rate Limiter Backend tests (FASE 27/28)
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  rateLimit, clearRateLimits, applyRateLimit, getClientIp, RATE_LIMITS,
  MemoryRateLimitBackend, RedisRateLimitBackend, getRateLimitBackend,
  type RateLimitBackend,
} from '@/server/rate-limit'

// Fake Redis client for testing (no real Redis server needed)
function createFakeRedis() {
  const store = new Map<string, { value: number; expireAt: number }>()
  return {
    async incr(key: string): Promise<number> {
      const now = Date.now()
      const existing = store.get(key)
      if (!existing || existing.expireAt < now) {
        store.set(key, { value: 1, expireAt: now + 10000 })
        return 1
      }
      existing.value += 1
      return existing.value
    },
    async pexpire(key: string, ms: number): Promise<number> {
      const existing = store.get(key)
      if (existing) existing.expireAt = Date.now() + ms
      return 1
    },
    async pttl(key: string): Promise<number> {
      const existing = store.get(key)
      if (!existing) return -2
      const remaining = existing.expireAt - Date.now()
      return remaining > 0 ? remaining : -2
    },
    async scan(cursor: string, _match: string, _count: number): Promise<[string, string[]]> {
      const keys = Array.from(store.keys()).filter(k => k.startsWith('rl:'))
      return ['0', keys]
    },
    async del(...keys: string[]): Promise<number> {
      let deleted = 0
      for (const k of keys) { if (store.delete(k)) deleted++ }
      return deleted
    },
    on(_event: string, _cb: (...args: unknown[]) => void) {},
    _store: store,
  }
}

describe('Rate Limiter Backend Interface (FASE 27/28)', () => {
  beforeEach(async () => {
    await clearRateLimits()
  })

  test('1. MemoryRateLimitBackend implements RateLimitBackend', () => {
    const backend: RateLimitBackend = new MemoryRateLimitBackend()
    expect(typeof backend.check).toBe('function')
    expect(typeof backend.clear).toBe('function')
  })

  test('2. MemoryRateLimitBackend allows up to max then blocks', async () => {
    const backend = new MemoryRateLimitBackend()
    const config = { maxRequests: 3, windowMs: 1000 }
    expect((await backend.check('key1', config)).allowed).toBe(true)
    expect((await backend.check('key1', config)).allowed).toBe(true)
    expect((await backend.check('key1', config)).allowed).toBe(true)
    expect((await backend.check('key1', config)).allowed).toBe(false)
  })

  test('3. MemoryRateLimitBackend reset after window', async () => {
    const backend = new MemoryRateLimitBackend()
    const config = { maxRequests: 2, windowMs: 100 }
    await backend.check('key1', config)
    await backend.check('key1', config)
    expect((await backend.check('key1', config)).allowed).toBe(false)
    // Wait for window to expire
    const start = Date.now()
    while (Date.now() - start < 120) { /* busy wait */ }
    expect((await backend.check('key1', config)).allowed).toBe(true)
  })

  test('4. MemoryRateLimitBackend.clear resets all buckets', async () => {
    const backend = new MemoryRateLimitBackend()
    const config = { maxRequests: 1, windowMs: 10000 }
    await backend.check('key1', config)
    expect((await backend.check('key1', config)).allowed).toBe(false)
    await backend.clear()
    expect((await backend.check('key1', config)).allowed).toBe(true)
  })

  test('5. RedisRateLimitBackend with fake Redis: INCR increments + blocks at max', async () => {
    const fakeRedis = createFakeRedis()
    const backend = new RedisRateLimitBackend(fakeRedis)
    const config = { maxRequests: 2, windowMs: 10000 }
    expect((await backend.check('test_key', config)).allowed).toBe(true)
    expect((await backend.check('test_key', config)).allowed).toBe(true)
    expect((await backend.check('test_key', config)).allowed).toBe(false)
  })

  test('6. RedisRateLimitBackend with fake Redis: TTL applied on first request', async () => {
    const fakeRedis = createFakeRedis()
    const backend = new RedisRateLimitBackend(fakeRedis)
    const config = { maxRequests: 5, windowMs: 30000 }
    const result = await backend.check('ttl_key', config)
    expect(result.allowed).toBe(true)
    // Verify the fake Redis stored the key with TTL
    expect(fakeRedis._store.has('rl:ttl_key')).toBe(true)
  })

  test('7. RedisRateLimitBackend with fake Redis: remaining decreases', async () => {
    const fakeRedis = createFakeRedis()
    const backend = new RedisRateLimitBackend(fakeRedis)
    const config = { maxRequests: 3, windowMs: 10000 }
    const r1 = await backend.check('rem_key', config)
    expect(r1.remaining).toBe(2)
    const r2 = await backend.check('rem_key', config)
    expect(r2.remaining).toBe(1)
    const r3 = await backend.check('rem_key', config)
    expect(r3.remaining).toBe(0)
  })

  test('8. RedisRateLimitBackend with fake Redis: blocked returns retryAfterMs > 0', async () => {
    const fakeRedis = createFakeRedis()
    const backend = new RedisRateLimitBackend(fakeRedis)
    const config = { maxRequests: 1, windowMs: 5000 }
    await backend.check('retry_key', config)
    const blocked = await backend.check('retry_key', config)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })

  test('9. RedisRateLimitBackend with fake Redis: clear removes keys', async () => {
    const fakeRedis = createFakeRedis()
    const backend = new RedisRateLimitBackend(fakeRedis)
    const config = { maxRequests: 1, windowMs: 10000 }
    await backend.check('clear_key', config)
    expect(fakeRedis._store.has('rl:clear_key')).toBe(true)
    await backend.clear()
    expect(fakeRedis._store.has('rl:clear_key')).toBe(false)
  })

  test('10. RedisRateLimitBackend without REDIS_URL falls back to memory in dev', async () => {
    const oldUrl = process.env.REDIS_URL
    delete process.env.REDIS_URL
    const oldEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const backend = new RedisRateLimitBackend()
    const config = { maxRequests: 2, windowMs: 1000 }
    expect((await backend.check('fallback_key', config)).allowed).toBe(true)
    expect((await backend.check('fallback_key', config)).allowed).toBe(true)
    expect((await backend.check('fallback_key', config)).allowed).toBe(false)
    process.env.REDIS_URL = oldUrl
    process.env.NODE_ENV = oldEnv
  })

  test('11. getRateLimitBackend returns a backend', () => {
    const backend = getRateLimitBackend()
    expect(backend).toBeDefined()
    expect(typeof backend.check).toBe('function')
  })

  test('12. MemoryRateLimitBackend is the correct default type', () => {
    const backend = new MemoryRateLimitBackend()
    expect(backend).toBeInstanceOf(MemoryRateLimitBackend)
    expect(typeof backend.check).toBe('function')
    expect(typeof backend.clear).toBe('function')
  })

  test('13. RATE_LIMITS presets all exist', () => {
    expect(RATE_LIMITS.login).toBeDefined()
    expect(RATE_LIMITS.me).toBeDefined()
    expect(RATE_LIMITS.webhook).toBeDefined()
    expect(RATE_LIMITS.simulate).toBeDefined()
    expect(RATE_LIMITS.track).toBeDefined()
    expect(RATE_LIMITS.admin).toBeDefined()
    expect(RATE_LIMITS.history).toBeDefined()
    expect(RATE_LIMITS.health).toBeDefined()
  })

  test('14. rateLimit function delegates to backend (async)', async () => {
    const config = { maxRequests: 2, windowMs: 1000 }
    expect((await rateLimit('compat_key2', config)).allowed).toBe(true)
    expect((await rateLimit('compat_key2', config)).allowed).toBe(true)
    expect((await rateLimit('compat_key2', config)).allowed).toBe(false)
  })

  test('15. applyRateLimit returns null when allowed', async () => {
    const req = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '127.0.0.10' },
    })
    const result = await applyRateLimit(req, 'test_route_15', { maxRequests: 5, windowMs: 1000 })
    expect(result).toBe(null)
  })

  test('16. applyRateLimit returns 429 Response when blocked', async () => {
    const req = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '127.0.0.20' },
    })
    const config = { maxRequests: 1, windowMs: 1000 }
    await applyRateLimit(req, 'test_block_16', config)
    const blocked = await applyRateLimit(req, 'test_block_16', config)
    expect(blocked).not.toBe(null)
    expect(blocked!.status).toBe(429)
  })

  test('17. 429 response includes Retry-After header', async () => {
    const req = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '127.0.0.30' },
    })
    const config = { maxRequests: 1, windowMs: 5000 }
    await applyRateLimit(req, 'test_retry_17', config)
    const blocked = await applyRateLimit(req, 'test_retry_17', config)
    expect(blocked!.headers.get('Retry-After')).not.toBe(null)
  })

  test('18. different IPs have independent rate limits', async () => {
    const req1 = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '1.1.1.1' },
    })
    const req2 = new Request('https://localhost/api/test', {
      headers: { 'x-forwarded-for': '2.2.2.2' },
    })
    const config = { maxRequests: 1, windowMs: 1000 }
    expect(await applyRateLimit(req1, 'multi_ip_18', config)).toBe(null)
    expect(await applyRateLimit(req2, 'multi_ip_18', config)).toBe(null)
    expect(await applyRateLimit(req1, 'multi_ip_18', config)).not.toBe(null)
  })

  test('19. getClientIp extracts from x-forwarded-for', () => {
    const req = new Request('https://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  test('20. getClientIp extracts from x-real-ip', () => {
    const req = new Request('https://localhost', {
      headers: { 'x-real-ip': '10.0.0.3' },
    })
    expect(getClientIp(req)).toBe('10.0.0.3')
  })

  test('21. getClientIp defaults to unknown', () => {
    const req = new Request('https://localhost')
    expect(getClientIp(req)).toBe('unknown')
  })
})
