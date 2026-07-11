import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'
import {
  COOKIE_NAME,
  getCurrentUserFromCookies,
  setSessionCookie as createSignedSessionCookie,
  type AuthRole,
} from './auth/session'

// ============================================================
// Help Bibi — Authentication helpers
// Uses scrypt (Node built-in) for password hashing and HMAC-signed
// httpOnly session cookies. No external auth library needed.
// ============================================================


// ----------------------- Password hashing -----------------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  try {
    const hashBuf = Buffer.from(hash, 'hex')
    const testBuf = scryptSync(password, salt, 64)
    return hashBuf.length === testBuf.length && timingSafeEqual(hashBuf, testBuf)
  } catch {
    return false
  }
}

// ----------------------- Sessions -----------------------
export async function createSession(userId: string, role: AuthRole = 'CLIENT'): Promise<string> {
  return createSignedSessionCookie(userId, role)
}

export async function getCurrentUser() {
  return getCurrentUserFromCookies()
}

export async function requireAdmin() {
  const user = await getCurrentUserFromCookies()
  if (!user || user.role !== 'ADMIN') return null
  return user
}

export {
  canAccessRole,
  clearSessionCookie,
  getCurrentUserFromCookies,
  getCurrentUserFromRequest,
  getDefaultPathForRole,
  getSessionUser,
  requireCurrentUser,
  requireRole,
  setSessionCookie,
  type AuthRole,
  type CurrentUser,
} from './auth/session'

export const SESSION_COOKIE_NAME = COOKIE_NAME
