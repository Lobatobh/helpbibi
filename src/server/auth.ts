import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from './db/prisma'

// ============================================================
// Help Bibi — Authentication helpers
// Uses scrypt (Node built-in) for password hashing and DB-backed
// sessions with httpOnly cookies. No external auth library needed.
// ============================================================

const SESSION_COOKIE = 'helpbibi_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

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
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  await db.session.create({ data: { token, userId, expiresAt } })
  return token
}

export async function getSession(token: string | undefined) {
  if (!token) return null
  try {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session) return null
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {})
      return null
    }
    return session
  } catch {
    return null
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const session = await getSession(token)
  return session?.user || null
}

export async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') return null
  return user
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
