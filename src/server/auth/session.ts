// Help Bibi — Session/Auth helper (FASE 25.4)
// Cookie-based session using HMAC-signed JSON. No DB Session model needed.
// Cookie name: hb_session. Value: base64(JSON({userId, role, exp})) + "." + HMAC signature.

import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/server/db/prisma'

const COOKIE_NAME = 'hb_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

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

function encodeSession(data: { userId: string; role: string }): string {
  const exp = Date.now() + SESSION_TTL_MS
  const payload = JSON.stringify({ ...data, exp })
  const b64 = Buffer.from(payload).toString('base64url')
  const sig = sign(b64)
  return `${b64}.${sig}`
}

function decodeSession(cookieValue: string): { userId: string; role: string; exp: number } | null {
  try {
    const [b64, sig] = cookieValue.split('.')
    if (!b64 || !sig) return null
    const expectedSig = sign(b64)
    const a = Buffer.from(sig); const b = Buffer.from(expectedSig)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString())
    if (payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}

export function setSessionCookie(userId: string, role: string): string {
  const value = encodeSession({ userId, role })
  const isProd = process.env.NODE_ENV === 'production'
  return `${COOKIE_NAME}=${value}; HttpOnly; ${isProd ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
}

export function clearSessionCookie(): string {
  const isProd = process.env.NODE_ENV === 'production'
  return `${COOKIE_NAME}=; HttpOnly; ${isProd ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`
}

export function getSessionUser(request: NextRequest): { id: string; role: string } | null {
  const cookie = request.cookies.get(COOKIE_NAME)?.value
  if (!cookie) return null
  const decoded = decodeSession(cookie)
  if (!decoded) return null
  return { id: decoded.userId, role: decoded.role }
}

export async function getCurrentUserFromRequest(request: NextRequest): Promise<{ id: string; role: string; name: string } | null> {
  const sessionUser = getSessionUser(request)
  if (!sessionUser) return null
  const user = await db.user.findUnique({ where: { id: sessionUser.id }, select: { id: true, role: true, name: true } })
  if (!user) return null
  return { id: user.id, role: user.role, name: user.name }
}

export async function requireCurrentUser(request: NextRequest): Promise<{ id: string; role: string; name: string }> {
  const user = await getCurrentUserFromRequest(request)
  if (!user) throw new Error('Unauthorized: no valid session')
  return user
}

export async function requireRole(request: NextRequest, role: 'CLIENT' | 'PROVIDER' | 'ADMIN'): Promise<{ id: string; role: string; name: string }> {
  const user = await requireCurrentUser(request)
  if (user.role !== role) throw new Error(`Forbidden: requires ${role} role`)
  return user
}

export { COOKIE_NAME }
