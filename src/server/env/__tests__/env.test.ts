// Help Bibi — Environment validation tests (FASE 25.4)
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { validateEnv, requireEnv } from '@/server/env'

const ENV_BACKUP: Record<string, string | undefined> = {}

function backupEnv(keys: string[]) {
  for (const k of keys) ENV_BACKUP[k] = process.env[k]
}
function restoreEnv(keys: string[]) {
  for (const k of keys) {
    if (ENV_BACKUP[k] === undefined) delete process.env[k]
    else process.env[k] = ENV_BACKUP[k]
  }
}

const ENV_KEYS = [
  'NODE_ENV', 'DATABASE_URL', 'SESSION_SECRET', 'PAYMENT_WEBHOOK_SECRET',
  'SOCKET_CORS_ORIGIN', 'PAYMENT_GATEWAY_PROVIDER',
  'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SOCKET_URL',
  'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET',
  'RATE_LIMIT_BACKEND', 'REDIS_URL', 'AUDIT_LOG_BACKEND', 'ADMIN_SEED_ENABLED',
]

const PROD_DB = 'postgresql://helpbibi:secure_pass@localhost:5432/helpbibi?schema=public'
const PROD_SESSION = 'a_real_secure_random_64_char_string_a_real_secure_random_64_c'
const PROD_WEBHOOK = 'a_real_secure_webhook_secret_string_here_64_chars_xx'

describe('env — validateEnv', () => {
  beforeEach(() => {
    backupEnv(ENV_KEYS)
    // Clean slate for each test
    for (const k of ENV_KEYS) delete process.env[k]
  })
  afterEach(() => {
    restoreEnv(ENV_KEYS)
  })

  test('1. dev with missing vars returns ok=false but does NOT throw', () => {
    process.env.NODE_ENV = 'development'
    // Do not set DATABASE_URL / SESSION_SECRET / PAYMENT_WEBHOOK_SECRET
    let threw = false
    let result
    try {
      result = validateEnv()
    } catch (e) {
      threw = true
    }
    expect(threw).toBe(false)
    expect(result!.ok).toBe(false)
    expect(result!.missing).toContain('DATABASE_URL')
    expect(result!.missing).toContain('SESSION_SECRET')
    expect(result!.missing).toContain('PAYMENT_WEBHOOK_SECRET')
  })

  test('2. production with insecure SESSION_SECRET throws', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = PROD_DB
    process.env.SESSION_SECRET = 'dev_secret' // insecure (in INSECURE_VALUES set)
    process.env.PAYMENT_WEBHOOK_SECRET = 'secure_real_secret'
    expect(() => validateEnv()).toThrow(/Production validation failed/)
  })

  test('3. production with insecure PAYMENT_WEBHOOK_SECRET throws', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = PROD_DB
    process.env.SESSION_SECRET = 'a_real_secure_random_64_char_string_a_real_secure_random_64_c'
    process.env.PAYMENT_WEBHOOK_SECRET = 'dev_webhook_secret_change_me' // insecure
    expect(() => validateEnv()).toThrow(/Production validation failed/)
  })

  test('4. production with all valid vars returns ok=true', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = PROD_DB
    process.env.SESSION_SECRET = PROD_SESSION
    process.env.PAYMENT_WEBHOOK_SECRET = PROD_WEBHOOK
    process.env.RATE_LIMIT_BACKEND = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    const result = validateEnv()
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.insecure).toEqual([])
  })

  test('5. warnings for missing NEXT_PUBLIC_* vars in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = PROD_DB
    process.env.SESSION_SECRET = PROD_SESSION
    process.env.PAYMENT_WEBHOOK_SECRET = PROD_WEBHOOK
    process.env.SOCKET_CORS_ORIGIN = 'https://app.helpbibi.com'
    process.env.PAYMENT_GATEWAY_PROVIDER = 'mercado_pago'
    process.env.RATE_LIMIT_BACKEND = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    // NEXT_PUBLIC_* not set
    const result = validateEnv()
    expect(result.warnings.some((w) => w.includes('NEXT_PUBLIC_APP_URL'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('NEXT_PUBLIC_SOCKET_URL'))).toBe(true)
  })

  test('6. production warns about simulated gateway', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = PROD_DB
    process.env.SESSION_SECRET = PROD_SESSION
    process.env.PAYMENT_WEBHOOK_SECRET = PROD_WEBHOOK
    process.env.SOCKET_CORS_ORIGIN = 'https://app.helpbibi.com'
    process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
    process.env.RATE_LIMIT_BACKEND = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    const result = validateEnv()
    expect(result.warnings.some((w) => w.includes('simulated'))).toBe(true)
  })

  test('7. production warns about missing SOCKET_CORS_ORIGIN', () => {
    process.env.NODE_ENV = 'production'
    process.env.DATABASE_URL = PROD_DB
    process.env.SESSION_SECRET = PROD_SESSION
    process.env.PAYMENT_WEBHOOK_SECRET = PROD_WEBHOOK
    process.env.PAYMENT_GATEWAY_PROVIDER = 'mercado_pago'
    process.env.RATE_LIMIT_BACKEND = 'redis'
    process.env.REDIS_URL = 'redis://localhost:6379'
    // SOCKET_CORS_ORIGIN not set
    const result = validateEnv()
    expect(result.warnings.some((w) => w.includes('SOCKET_CORS_ORIGIN'))).toBe(true)
  })

  test('8. dev with all required vars returns ok=true', () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL = 'file:./dev.db'
    process.env.SESSION_SECRET = 'dev_secret'
    process.env.PAYMENT_WEBHOOK_SECRET = 'dev_webhook_secret'
    const result = validateEnv()
    expect(result.ok).toBe(true)
  })
})

describe('env — requireEnv', () => {
  beforeEach(() => {
    backupEnv(ENV_KEYS)
  })
  afterEach(() => {
    restoreEnv(ENV_KEYS)
  })

  test('9. requireEnv returns value if set', () => {
    process.env.NODE_ENV = 'development'
    process.env.MY_TEST_VAR = 'my_value'
    expect(requireEnv('MY_TEST_VAR')).toBe('my_value')
    delete process.env.MY_TEST_VAR
  })

  test('10. requireEnv returns fallback if provided and var missing', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.MY_MISSING_VAR
    expect(requireEnv('MY_MISSING_VAR', 'fallback_value')).toBe('fallback_value')
  })

  test('11. requireEnv throws in production if missing and no fallback', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.MY_REQUIRED_VAR
    expect(() => requireEnv('MY_REQUIRED_VAR')).toThrow(/Required env var MY_REQUIRED_VAR is not set/)
  })

  test('12. requireEnv returns empty string in dev if missing and no fallback', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.MY_OPTIONAL_VAR
    expect(requireEnv('MY_OPTIONAL_VAR')).toBe('')
  })
})
