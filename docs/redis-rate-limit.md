# Help Bibi — Redis Rate Limiting

> FASE 27 — Rate limiting backend architecture.

## Current State

- **Backend**: configurable via `RATE_LIMIT_BACKEND` env var
  - `memory` (default): in-memory sliding window. Dev only.
  - `redis`: Redis-backed (stub implementation — see Production Setup below).
- **Production**: `memory` backend is **BLOCKED** by `validateEnv()` (insecure for multi-instance).

## Presets

| Preset | Max | Window | Routes |
|--------|-----|--------|--------|
| login | 10 | 60s | /api/auth/login, /api/admin/login |
| me | 60 | 60s | /api/auth/me |
| webhook | 30 | 60s | /api/payments/webhook |
| simulate | 20 | 60s | /api/payments/simulate |
| track | 60 | 60s | /api/track/[id] |
| admin | 60 | 60s | /api/admin/* |
| history | 30 | 60s | /api/client/services, /api/provider/services |
| health | 120 | 60s | /api/health, /api/health/db |

## Architecture

```typescript
interface RateLimitBackend {
  check(key: string, config: RateLimitConfig): RateLimitResult
  clear(): void
}
```

- `MemoryRateLimitBackend` — in-memory Map with sliding window + 60s cleanup.
- `RedisRateLimitBackend` — stub that falls back to memory (logs warning). Production must implement real Redis logic.
- `getRateLimitBackend()` — factory, reads `RATE_LIMIT_BACKEND` env. Singleton.

## Production Setup (Redis)

### 1. Install ioredis
```bash
bun add ioredis
```

### 2. Set env
```env
RATE_LIMIT_BACKEND=redis
REDIS_URL=redis://redis:6379
```

### 3. Implement RedisRateLimitBackend.check()
Replace the stub with real Redis INCR + PEXPIRE logic:
```typescript
import Redis from 'ioredis'

class RedisRateLimitBackend implements RateLimitBackend {
  private redis: Redis
  constructor(url: string) { this.redis = new Redis(url) }

  async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const redisKey = `rl:${key}`
    const count = await this.redis.incr(redisKey)
    if (count === 1) await this.redis.pexpire(redisKey, config.windowMs)
    const allowed = count <= config.maxRequests
    const ttl = await this.redis.pttl(redisKey)
    return { allowed, remaining: Math.max(0, config.maxRequests - count), resetAt: Date.now() + ttl, retryAfterMs: allowed ? 0 : ttl }
  }

  async clear(): Promise<void> {
    const keys = await this.redis.keys('rl:*')
    if (keys.length) await this.redis.del(...keys)
  }
}
```

**Note**: The interface may need to become `Promise<RateLimitResult>` for async Redis calls. All callers (`applyRateLimit`) would need to be updated to `await`.

### 4. Alternative: Proxy/WAF
For multi-region deployments, consider rate limiting at the edge:
- Cloudflare Rate Limiting
- NGINX `limit_req`
- Vercel Edge Middleware

This is more scalable than application-level Redis and doesn't require the app to be async.
