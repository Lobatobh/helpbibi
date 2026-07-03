// Help Bibi — Admin Login API (FASE 27-B)
// POST /api/admin/login
// Accepts { email, password } and sets an ADMIN session cookie on success.
//
// Security:
//   - Production ALWAYS blocks the seed admin credentials (admin@helpbibi.local).
//     Production must use real configured admin credentials (e.g. SSO / IdP).
//   - Dev with ADMIN_SEED_ENABLED=true accepts the seed admin credentials so
//     the admin UI is usable in development.
//   - Rate limited with RATE_LIMITS.login (10/min per IP).
//   - All outcomes (success + failure) are recorded in the audit log.

import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'
import { db } from '@/server/db/prisma'

const ADMIN_SEED_EMAIL = 'admin@helpbibi.local'
const ADMIN_SEED_PASSWORD = 'Admin123!'

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
    const isProd = process.env.NODE_ENV === 'production'
    const seedEnabled = process.env.ADMIN_SEED_ENABLED === 'true'

    // Production: block seed credentials entirely.
    if (isProd) {
      logger.warn('admin', 'Seed admin login blocked in production', {
        emailHint: email ? `${email.slice(0, 3)}***` : 'none',
      })
      audit('login_failure', {
        ip: getClientIp(req),
        route: 'admin/login',
        metadata: { reason: 'seed_blocked_in_prod' },
      })
      return NextResponse.json(
        { message: 'Admin login requires configured credentials in production' },
        { status: 403 }
      )
    }

    // Dev: allow seed admin if ADMIN_SEED_ENABLED=true.
    if (
      seedEnabled &&
      email === ADMIN_SEED_EMAIL &&
      password === ADMIN_SEED_PASSWORD
    ) {
      // Find or create the seed admin user.
      let adminUser = await db.user.findFirst({
        where: { email: ADMIN_SEED_EMAIL, role: 'ADMIN' },
        select: { id: true, name: true, role: true },
      })
      if (!adminUser) {
        adminUser = await db.user.create({
          data: { email: ADMIN_SEED_EMAIL, name: 'Admin', role: 'ADMIN' },
          select: { id: true, name: true, role: true },
        })
      }
      const headers = new Headers()
      headers.append('Set-Cookie', setSessionCookie(adminUser.id, 'ADMIN'))
      logger.info('admin', 'Admin login success', { userId: adminUser.id })
      audit('admin_login', {
        actor: adminUser.id,
        actorRole: 'ADMIN',
        ip: getClientIp(req),
        route: 'admin/login',
      })
      return NextResponse.json(
        {
          ok: true,
          user: { id: adminUser.id, role: 'ADMIN', name: adminUser.name },
        },
        { headers }
      )
    }

    // Any other combination: invalid credentials.
    audit('login_failure', {
      ip: getClientIp(req),
      route: 'admin/login',
      metadata: {
        reason: seedEnabled ? 'invalid_credentials' : 'seed_disabled',
      },
    })
    return NextResponse.json(
      {
        message: seedEnabled
          ? 'Invalid credentials'
          : 'Admin seed login is disabled. Set ADMIN_SEED_ENABLED=true in dev.',
      },
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
