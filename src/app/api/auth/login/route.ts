import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/server/auth/session'
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
    const body = await req.json()
    const { userId, role, name } = body
    if (!userId || !role) return NextResponse.json({ message: 'userId and role required' }, { status: 400 })
    // Verify user exists in DB
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true } })
    if (!user) {
      logger.warn('auth', 'login failure', { reason: 'user not found', ip: getClientIp(req) })
      audit('login_failure', { ip: getClientIp(req), route: 'auth/login', metadata: { reason: 'user_not_found' } })
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }
    logger.info('auth', 'login success', { userId: user.id, role: user.role })
    audit('login_success', { actor: user.id, actorRole: user.role, ip: getClientIp(req), route: 'auth/login' })
    const headers = new Headers()
    headers.append('Set-Cookie', setSessionCookie(user.id, user.role))
    return NextResponse.json({ ok: true, user: { id: user.id, role: user.role, name: user.name } }, { headers })
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 })
  }
}
