// Help Bibi — Session Hardening tests (FASE 26)
// Additional security-focused tests for setSessionCookie/clearSessionCookie/getSessionUser.
import { describe, test, expect, afterEach } from 'bun:test'
import { createHmac } from 'crypto'
import { setSessionCookie, clearSessionCookie, getSessionUser, COOKIE_NAME } from '@/server/auth/session'

// Minimal mock of NextRequest's cookie API surface.
type MockRequest = { cookies: { get: (name: string) => { value: string } | undefined } }
const makeRequest = (cookieValue?: string): MockRequest => ({
  cookies: {
    get: (name: string) => (name === COOKIE_NAME && cookieValue ? { value: cookieValue } : undefined),
  },
})

describe('session-hardening — setSessionCookie security attributes', () => {
  test('1. returns a string containing "HttpOnly"', () => {
    const c = setSessionCookie('user_h1', 'CLIENT')
    expect(c).toContain('HttpOnly')
  })

  test('2. returns a string containing "SameSite=Lax"', () => {
    const c = setSessionCookie('user_h2', 'CLIENT')
    expect(c).toContain('SameSite=Lax')
  })

  test('3. returns a string containing "Path=/"', () => {
    const c = setSessionCookie('user_h3', 'CLIENT')
    expect(c).toContain('Path=/')
  })
})

describe('session-hardening — production Secure flag', () => {
  const originalEnv = process.env.NODE_ENV
  const originalSecret = process.env.SESSION_SECRET

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnv
    if (originalSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = originalSecret
  })

  test('4. in production, setSessionCookie includes "Secure"', () => {
    process.env.NODE_ENV = 'production'
    // Production requires a non-default SESSION_SECRET
    process.env.SESSION_SECRET = 'a_real_secure_random_64_char_string_a_real_secure_random_64_c'
    const c = setSessionCookie('user_prod', 'CLIENT')
    expect(c).toContain('Secure')
  })
})

describe('session-hardening — clearSessionCookie', () => {
  test('5. clearSessionCookie returns a string with "Max-Age=0"', () => {
    const c = clearSessionCookie()
    expect(c).toContain('Max-Age=0')
  })
})

describe('session-hardening — getSessionUser tampering/expiry rejection', () => {
  test('6. tampered cookie signature is rejected (getSessionUser returns null)', () => {
    const c = setSessionCookie('user_h6', 'CLIENT')
    const value = c.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    const [payload, sig] = value.split('.')
    // Flip the last character of the signature
    const tamperedSig = sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a')
    const req = makeRequest(`${payload}.${tamperedSig}`)
    expect(getSessionUser(req as any)).toBe(null)
  })

  test('7. expired session is rejected (exp in the past → null)', () => {
    const secret = process.env.SESSION_SECRET || 'dev_secret_change_me_in_production'
    const pastExp = Date.now() - 10_000 // 10s ago
    const payload = JSON.stringify({ userId: 'expired_h7', role: 'CLIENT', exp: pastExp })
    const b64 = Buffer.from(payload).toString('base64url')
    const sig = createHmac('sha256', secret).update(b64).digest('hex')
    const req = makeRequest(`${b64}.${sig}`)
    expect(getSessionUser(req as any)).toBe(null)
  })

  test('8. cookie with valid signature but tampered payload is rejected', () => {
    const c = setSessionCookie('user_h8_original', 'CLIENT')
    const value = c.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    const [payload, sig] = value.split('.')
    // Decode, modify userId, re-encode (sig won't match the new payload)
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    decoded.userId = 'user_h8_tampered'
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    const req = makeRequest(`${tamperedPayload}.${sig}`)
    expect(getSessionUser(req as any)).toBe(null)
  })
})
