// Help Bibi — Session/Auth helper (FASE 25.4)
// Cookie-based session using HMAC-signed JSON. No DB Session model needed.
// Cookie name: hb_session. Value: base64(JSON({userId, role, exp})) + "." + HMAC signature.

import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { db } from '@/server/db/prisma'
import {
  COOKIE_NAME,
  SESSION_TTL_MS,
  decodeSession,
  encodeSession,
  getSessionUserFromCookieHeader,
  getSessionUserFromCookieValue,
  type AuthRole,
} from './session-token'

export type CurrentUser = {
  id: string
  role: AuthRole
  name: string
  email: string | null
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
  return getSessionUserFromCookieValue(request.cookies.get(COOKIE_NAME)?.value)
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

export { COOKIE_NAME, getSessionUserFromCookieHeader, getSessionUserFromCookieValue }
export type { AuthRole }
