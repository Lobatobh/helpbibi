// Help Bibi — Admin Login API (FASE 27-B)
// POST /api/admin/login
// Accepts { email, password } and sets an ADMIN session cookie on success.
//
// Security:
//   - Authenticates only an existing ACTIVE user with role ADMIN.
//   - Initial ADMIN creation is exclusive to scripts/bootstrap-admin.ts.
//   - Rate limited with RATE_LIMITS.login (10/min per IP).
//   - All outcomes (success + failure) are recorded in the audit log.

import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/server/auth/session'
import { verifyPassword } from '@/server/auth'
import { normalizeEmail } from '@/server/auth/credentials'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'
import { db } from '@/server/db/prisma'

export async function POST(req: NextRequest) {
  // FASE 26: rate limiting (10/min per IP)
  const rateLimited = await applyRateLimit(req, 'admin/login', RATE_LIMITS.login)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'admin/login' })
    return rateLimited
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { email, password } = body as { email?: string; password?: string }
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 })
    }

    const admin = await db.user.findFirst({
      where: { email: normalizedEmail, role: 'ADMIN' },
      select: { id: true, name: true, role: true, email: true, passwordHash: true, status: true },
    })

    if (admin && admin.status === 'ACTIVE' && verifyPassword(password, admin.passwordHash)) {
      const headers = new Headers()
      headers.append('Set-Cookie', setSessionCookie(admin.id, 'ADMIN'))
      logger.info('admin', 'Admin login success', { userId: admin.id })
      audit('admin_login', {
        actor: admin.id,
        actorRole: 'ADMIN',
        ip: getClientIp(req),
        route: 'admin/login',
      })
      return NextResponse.json(
        {
          ok: true,
          user: { id: admin.id, role: 'ADMIN', name: admin.name, email: admin.email },
        },
        { headers }
      )
    }

    audit('login_failure', {
      ip: getClientIp(req),
      route: 'admin/login',
      metadata: {
        reason: 'invalid_credentials',
      },
    })
    return NextResponse.json(
      { message: 'Invalid credentials' },
      { status: 401 }
    )
  } catch (error: any) {
    logger.error('admin', 'Login error', { message: error?.message })
    return NextResponse.json(
      { message: error?.message || 'Login error' },
      { status: 500 }
    )
  }
}
