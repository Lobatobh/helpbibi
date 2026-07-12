import { createHmac, timingSafeEqual } from 'crypto'

export const COOKIE_NAME = 'hb_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type AuthRole = 'CLIENT' | 'PROVIDER' | 'ADMIN'

export type SessionPayload = {
  userId: string
  role: string
  exp: number
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET || 'dev_secret_change_me_in_production'
  if (process.env.NODE_ENV === 'production' && (secret === 'dev_secret_change_me_in_production' || !secret)) {
    throw new Error('[session] SESSION_SECRET must be set in production')
  }
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex')
}

export function encodeSession(data: { userId: string; role: AuthRole | string }): string {
  const exp = Date.now() + SESSION_TTL_MS
  const payload = JSON.stringify({ ...data, exp })
  const b64 = Buffer.from(payload).toString('base64url')
  const sig = sign(b64)
  return `${b64}.${sig}`
}

export function decodeSession(cookieValue: string): SessionPayload | null {
  try {
    const [b64, sig] = cookieValue.split('.')
    if (!b64 || !sig) return null
    const expectedSig = sign(b64)
    const actual = Buffer.from(sig)
    const expected = Buffer.from(expectedSig)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString())
    if (!payload || typeof payload.userId !== 'string' || typeof payload.role !== 'string') return null
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function parseCookieHeader(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=')
    if (index <= 0) return acc
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) acc[key] = value
    return acc
  }, {})
}

export function getSessionUserFromCookieValue(cookieValue: string | null | undefined): { id: string; role: string } | null {
  if (!cookieValue) return null
  const decoded = decodeSession(cookieValue)
  if (!decoded) return null
  return { id: decoded.userId, role: decoded.role }
}

export function getSessionUserFromCookieHeader(cookieHeader: string | null | undefined): { id: string; role: string } | null {
  return getSessionUserFromCookieValue(parseCookieHeader(cookieHeader)[COOKIE_NAME])
}
