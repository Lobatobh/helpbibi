import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/server/auth/session'
import { verifyPassword } from '@/server/auth'
import { db } from '@/server/db/prisma'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'

export async function POST(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'auth/login', RATE_LIMITS.login)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'auth/login' })
    return rateLimited
  }

  logger.info('auth', 'login attempt', { ip: getClientIp(req) })

  try {
    const body = await req.json().catch(() => ({}))
    const { email, password } = body as { email?: string; password?: string }
    const normalizedEmail = email?.trim().toLowerCase()

    if (!normalizedEmail || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true, name: true, email: true, passwordHash: true, status: true },
    })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      logger.warn('auth', 'login failure', { reason: 'invalid credentials', ip: getClientIp(req) })
      audit('login_failure', { ip: getClientIp(req), route: 'auth/login', metadata: { reason: 'invalid_credentials' } })
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    if (user.status !== 'ACTIVE') {
      logger.warn('auth', 'login failure', { reason: 'inactive user', ip: getClientIp(req), userId: user.id })
      audit('login_failure', { actor: user.id, actorRole: user.role, ip: getClientIp(req), route: 'auth/login', metadata: { reason: 'inactive_user' } })
      return NextResponse.json({ message: 'User is not active' }, { status: 403 })
    }

    logger.info('auth', 'login success', { userId: user.id, role: user.role })
    audit('login_success', { actor: user.id, actorRole: user.role, ip: getClientIp(req), route: 'auth/login' })
    const headers = new Headers()
    headers.append('Set-Cookie', setSessionCookie(user.id, user.role))
    return NextResponse.json(
      { ok: true, user: { id: user.id, role: user.role, name: user.name, email: user.email } },
      { headers }
    )
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 })
  }
}
