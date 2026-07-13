// Help Bibi — Admin Audit Log API (FASE 27-B)
// GET /api/admin/audit
// Returns the most recent audit events (default 50).
//
// Requires an ADMIN session in every NODE_ENV. NODE_ENV is never an auth bypass.
// Rate limited with RATE_LIMITS.admin (60/min per IP).

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { getRecentAuditEvents, audit } from '@/server/audit'

export async function GET(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'admin/audit', RATE_LIMITS.admin)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'admin/audit' })
    return rateLimited
  }

  try {
    await requireRole(req, 'ADMIN')
  } catch (e: any) {
    audit('unauthorized_access', {
      route: 'admin/audit',
      ip: getClientIp(req),
      actorRole: 'unknown',
    })
    const message = e?.message || 'Unauthorized'
    return NextResponse.json({ message }, { status: message.startsWith('Forbidden') ? 403 : 401 })
  }

  const events = await getRecentAuditEvents(50)
  return NextResponse.json({ events, count: events.length })
}
