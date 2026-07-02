// Help Bibi — Session helper tests (FASE 25.4 NEW)
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createHmac } from 'crypto'
import { setSessionCookie, clearSessionCookie, getSessionUser, COOKIE_NAME } from '@/server/auth/session'

// Minimal mock of NextRequest's cookie API surface.
type MockRequest = { cookies: { get: (name: string) => { value: string } | undefined } }

const makeRequest = (cookieValue?: string): MockRequest => ({
  cookies: {
    get: (name: string) => (name === COOKIE_NAME && cookieValue ? { value: cookieValue } : undefined),
  },
})

describe('session — setSessionCookie', () => {
  test('1. returns a string starting with "hb_session="', () => {
    const c = setSessionCookie('user_123', 'CLIENT')
    expect(typeof c).toBe('string')
    expect(c.startsWith(`${COOKIE_NAME}=`)).toBe(true)
  })

  test('2. cookie value contains payload.signature (HMAC signed)', () => {
    const c = setSessionCookie('user_123', 'CLIENT')
    // Strip the "hb_session=" prefix and attributes
    const valuePart = c.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    expect(valuePart).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]+$/)
    const [payload, sig] = valuePart.split('.')
    expect(payload.length).toBeGreaterThan(10)
    expect(sig.length).toBeGreaterThan(10) // sha256 hex = 64 chars
  })

  test('3. cookie includes HttpOnly and SameSite=Lax and Path=/', () => {
    const c = setSessionCookie('user_123', 'CLIENT')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Path=/')
  })

  test('4. cookie includes Max-Age (7-day TTL = 604800 seconds)', () => {
    const c = setSessionCookie('user_123', 'CLIENT')
    expect(c).toContain('Max-Age=604800')
  })
})

describe('session — clearSessionCookie', () => {
  test('5. returns a string with Max-Age=0', () => {
    const c = clearSessionCookie()
    expect(c.startsWith(`${COOKIE_NAME}=;`)).toBe(true)
    expect(c).toContain('Max-Age=0')
  })

  test('6. clearSessionCookie includes HttpOnly', () => {
    const c = clearSessionCookie()
    expect(c).toContain('HttpOnly')
  })
})

describe('session — getSessionUser', () => {
  test('7. returns null when no cookie present', () => {
    const req = makeRequest(undefined)
    expect(getSessionUser(req as any)).toBe(null)
  })

  test('8. round-trip: setSessionCookie → getSessionUser returns same user', () => {
    const c = setSessionCookie('user_456', 'PROVIDER')
    const value = c.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    const req = makeRequest(value)
    const user = getSessionUser(req as any)
    expect(user).toEqual({ id: 'user_456', role: 'PROVIDER' })
  })

  test('9. round-trip with CLIENT role preserves role', () => {
    const c = setSessionCookie('client_abc', 'CLIENT')
    const value = c.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    const req = makeRequest(value)
    const user = getSessionUser(req as any)
    expect(user!.id).toBe('client_abc')
    expect(user!.role).toBe('CLIENT')
  })

  test('10. signature verification rejects tampered cookies', () => {
    const c = setSessionCookie('user_789', 'CLIENT')
    const value = c.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    const [payload, sig] = value.split('.')
    // Tamper: flip a char in the signature
    const tamperedSig = sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a')
    const tamperedValue = `${payload}.${tamperedSig}`
    const req = makeRequest(tamperedValue)
    expect(getSessionUser(req as any)).toBe(null)
  })

  test('11. tampered payload (modified userId) rejects signature', () => {
    const c = setSessionCookie('user_original', 'CLIENT')
    const value = c.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    const [payload, sig] = value.split('.')
    // Decode payload, change userId, re-encode
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    decoded.userId = 'user_tampered'
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    const tamperedValue = `${tamperedPayload}.${sig}` // old sig won't match
    const req = makeRequest(tamperedValue)
    expect(getSessionUser(req as any)).toBe(null)
  })

  test('12. malformed cookie (no dot) returns null', () => {
    const req = makeRequest('justsomerandomstring')
    expect(getSessionUser(req as any)).toBe(null)
  })

  test('13. expired session returns null (TTL exceeded)', () => {
    // Manually craft a cookie with exp in the past, signed with the current secret
    const { createHmac: _ch } = { createHmac } // use top-level import
    const secret = process.env.SESSION_SECRET || 'dev_secret_change_me_in_production'
    const pastExp = Date.now() - 1000 // 1 second ago
    const payload = JSON.stringify({ userId: 'expired_user', role: 'CLIENT', exp: pastExp })
    const b64 = Buffer.from(payload).toString('base64url')
    const sig = createHmac('sha256', secret).update(b64).digest('hex')
    const value = `${b64}.${sig}`
    const req = makeRequest(value)
    expect(getSessionUser(req as any)).toBe(null)
  })

  test('14. session encodes role correctly for ADMIN', () => {
    const c = setSessionCookie('admin_1', 'ADMIN')
    const value = c.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    const req = makeRequest(value)
    const user = getSessionUser(req as any)
    expect(user!.role).toBe('ADMIN')
  })

  test('15. COOKIE_NAME constant is "hb_session"', () => {
    expect(COOKIE_NAME).toBe('hb_session')
  })
})

describe('session — production secure flag', () => {
  const originalEnv = process.env.NODE_ENV
  const originalSecret = process.env.SESSION_SECRET
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnv
    if (originalSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = originalSecret
  })

  test('16. Secure flag present in production', () => {
    process.env.NODE_ENV = 'production'
    // Note: production mode requires SESSION_SECRET to be a secure value (not the default).
    // We temporarily set a long secure secret to allow the cookie to be encoded.
    process.env.SESSION_SECRET = 'a_real_secure_random_64_char_string_a_real_secure_random_64_c'
    const c = setSessionCookie('user_prod', 'CLIENT')
    expect(c).toContain('Secure')
  })

  test('17. Secure flag absent in development', () => {
    process.env.NODE_ENV = 'development'
    const c = setSessionCookie('user_dev', 'CLIENT')
    expect(c).not.toContain('Secure')
  })
})
