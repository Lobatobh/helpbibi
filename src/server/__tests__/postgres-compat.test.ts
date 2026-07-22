// Help Bibi — PostgreSQL compatibility tests (FASE 27/28)
import { describe, test, expect, afterEach } from 'bun:test'
import { validateEnv } from '@/server/env'
import { _resetBackend } from '@/server/rate-limit'
import { readFileSync, existsSync } from 'fs'

const ENV_KEYS = ['NODE_ENV', 'DATABASE_URL', 'SESSION_SECRET', 'PAYMENT_WEBHOOK_SECRET', 'RATE_LIMIT_BACKEND', 'REDIS_URL', 'AUDIT_LOG_BACKEND']
const ENV_BACKUP: Record<string, string | undefined> = {}

afterEach(() => {
  // Restore env vars modified by tests
  for (const k of ENV_KEYS) {
    if (ENV_BACKUP[k] === undefined) delete process.env[k]
    else process.env[k] = ENV_BACKUP[k]
    // Record original values on first run
  }
  _resetBackend()
})

// Backup original env values once
for (const k of ENV_KEYS) ENV_BACKUP[k] = process.env[k]

describe('PostgreSQL Compatibility (FASE 27)', () => {
  test('1. schema.prisma (dev) uses sqlite provider', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8')
    expect(schema).toContain('provider = "sqlite"')
  })

  test('2. schema.postgres.prisma (production) uses postgresql provider', () => {
    expect(existsSync('prisma/schema.postgres.prisma')).toBe(true)
    const schema = readFileSync('prisma/schema.postgres.prisma', 'utf8')
    expect(schema).toContain('provider = "postgresql"')
  })

  test('3. postgres schema uses POSTGRES_DATABASE_URL env', () => {
    const schema = readFileSync('prisma/schema.postgres.prisma', 'utf8')
    expect(schema).toContain('env("POSTGRES_DATABASE_URL")')
  })

  test('4. both schemas have AuditLog model', () => {
    const sqliteSchema = readFileSync('prisma/schema.prisma', 'utf8')
    const pgSchema = readFileSync('prisma/schema.postgres.prisma', 'utf8')
    expect(sqliteSchema).toContain('model AuditLog')
    expect(pgSchema).toContain('model AuditLog')
  })

  test('5. both schemas have PaymentRecord model', () => {
    const sqliteSchema = readFileSync('prisma/schema.prisma', 'utf8')
    const pgSchema = readFileSync('prisma/schema.postgres.prisma', 'utf8')
    expect(sqliteSchema).toContain('model PaymentRecord')
    expect(pgSchema).toContain('model PaymentRecord')
  })

  test('6. both schemas have PaymentEvent model', () => {
    const sqliteSchema = readFileSync('prisma/schema.prisma', 'utf8')
    const pgSchema = readFileSync('prisma/schema.postgres.prisma', 'utf8')
    expect(sqliteSchema).toContain('model PaymentEvent')
    expect(pgSchema).toContain('model PaymentEvent')
  })

  test('7. both schemas have User, ServiceRequest, TrackingShare models', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8')
    expect(schema).toContain('model User')
    expect(schema).toContain('model ServiceRequest')
    expect(schema).toContain('model TrackingShare')
  })

  test('8. production env validation blocks SQLite DATABASE_URL', () => {
    const backup = { ...process.env }
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'file:./prod.db'
    process.env.SESSION_SECRET = 'a_real_secure_random_64_char_string_a_real_secure_random_64_c'
    process.env.PAYMENT_WEBHOOK_SECRET = 'a_real_secure_webhook_secret_string_here_64_chars_xx'
    process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
    process.env.RATE_LIMIT_BACKEND = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    expect(() => validateEnv()).toThrow(/SQLite is NOT allowed in production/)
    // restore
    for (const k of Object.keys(backup)) process.env[k] = backup[k]
  })

  test('9. production env validation blocks memory rate limiter', () => {
    const backup = { ...process.env }
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgresql://helpbibi:pass@localhost:5432/helpbibi'
    process.env.SESSION_SECRET = 'a_real_secure_random_64_char_string_a_real_secure_random_64_c'
    process.env.PAYMENT_WEBHOOK_SECRET = 'a_real_secure_webhook_secret_string_here_64_chars_xx'
    process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
    process.env.RATE_LIMIT_BACKEND = 'memory'
    expect(() => validateEnv()).toThrow(/in-memory rate limiting is NOT safe/)
    for (const k of Object.keys(backup)) process.env[k] = backup[k]
  })

  test('10. production accepts postgresql:// DATABASE_URL', () => {
    const backup = { ...process.env }
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgresql://helpbibi:pass@localhost:5432/helpbibi'
    process.env.SESSION_SECRET = 'a_real_secure_random_64_char_string_a_real_secure_random_64_c'
    process.env.PAYMENT_WEBHOOK_SECRET = 'a_real_secure_webhook_secret_string_here_64_chars_xx'
    process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
    process.env.RATE_LIMIT_BACKEND = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    const result = validateEnv()
    expect(result.ok).toBe(true)
    for (const k of Object.keys(backup)) process.env[k] = backup[k]
  })

  test('11. docker-compose.dev.yml exists with postgres + redis', () => {
    expect(existsSync('docker-compose.dev.yml')).toBe(true)
    const compose = readFileSync('docker-compose.dev.yml', 'utf8')
    expect(compose).toContain('postgres')
    expect(compose).toContain('redis')
    expect(compose).toContain('pg_isready')
    expect(compose).toContain('redis-cli')
  })

  test('12. docker-compose.prod.example.yml exists with app + rescue + postgres + redis', () => {
    expect(existsSync('docker-compose.prod.example.yml')).toBe(true)
    const compose = readFileSync('docker-compose.prod.example.yml', 'utf8')
    expect(compose).toContain('app')
    expect(compose).toContain('rescue-service')
    expect(compose).toContain('postgres')
    expect(compose).toContain('redis')
  })

  test('13. .env.example documents safe backends and compose provides REDIS_URL', () => {
    const env = readFileSync('.env.example', 'utf8')
    const compose = readFileSync('docker-compose.yml', 'utf8')
    expect(env).toContain('RATE_LIMIT_BACKEND=redis')
    expect(env).toContain('AUDIT_LOG_BACKEND=database')
    expect(compose).toContain('REDIS_URL: redis://redis:6379')
  })
})
