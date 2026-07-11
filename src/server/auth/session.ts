// Help Bibi — Session/Auth helper (FASE 25.4)
// Cookie-based session using HMAC-signed JSON. No DB Session model needed.
// Cookie name: hb_session. Value: base64(JSON({userId, role, exp})) + "." + HMAC signature.

import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { db } from '@/server/db/prisma'

const COOKIE_NAME = 'hb_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
export type AuthRole = 'CLIENT' | 'PROVIDER' | 'ADMIN'

export type CurrentUser = {
  id: string
  role: AuthRole
  name: string
  email: string | null
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

function encodeSession(data: { userId: string; role: AuthRole | string }): string {
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

function normalizeRole(role: string): AuthRole | null {
  if (role === 'CLIENT' || role === 'PROVIDER' || role === 'ADMIN') return role
  return null
}

function isActiveStatus(status: string | null | undefined): boolean {
  return !status || status === 'ACTIVE'
}

async function resolveCurrentUser(sessionUser: { id: string; role: string } | null): Promise<CurrentUser | null> {
  if (!sessionUser) return null
  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, name: true, email: true, status: true },
  })
  if (!user) return null
  const role = normalizeRole(user.role)
  if (!role || role !== sessionUser.role || !isActiveStatus(user.status)) return null
  return { id: user.id, role, name: user.name, email: user.email }
}

export async function getCurrentUserFromRequest(request: NextRequest): Promise<CurrentUser | null> {
  return resolveCurrentUser(getSessionUser(request))
}

export async function getCurrentUserFromCookies(): Promise<CurrentUser | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)?.value
  if (!cookie) return null
  const decoded = decodeSession(cookie)
  if (!decoded) return null
  return resolveCurrentUser({ id: decoded.userId, role: decoded.role })
}

export async function requireCurrentUser(request: NextRequest): Promise<CurrentUser> {
  const user = await getCurrentUserFromRequest(request)
  if (!user) throw new Error('Unauthorized: no valid session')
  return user
}

export function canAccessRole(user: { role: string } | null | undefined, role: AuthRole): boolean {
  return user?.role === role
}

export function getDefaultPathForRole(role: AuthRole | string): string {
  switch (role) {
    case 'CLIENT':
      return '/cliente'
    case 'PROVIDER':
      return '/prestador'
    case 'ADMIN':
      return '/admin'
    default:
      return '/login'
  }
}

export async function requireRole(request: NextRequest, role: AuthRole): Promise<CurrentUser> {
  const user = await requireCurrentUser(request)
  if (!canAccessRole(user, role)) throw new Error(`Forbidden: requires ${role} role`)
  return user
}

export { COOKIE_NAME }
