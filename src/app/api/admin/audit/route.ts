// Help Bibi — Admin Audit Log API (FASE 27-B)
// GET /api/admin/audit
// Returns the most recent audit events (default 50).
//
// In production, requires an ADMIN session. In dev, open (matches the existing
// admin route guard pattern in /api/admin/payments and /api/admin/providers/[id]/approve).
// Rate limited with RATE_LIMITS.admin (60/min per IP).

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { getRecentAuditEvents, audit } from '@/server/audit'

export async function GET(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = applyRateLimit(req, 'admin/audit', RATE_LIMITS.admin)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'admin/audit' })
    return rateLimited
  }

  // Production: require ADMIN session.
  if (process.env.NODE_ENV === 'production') {
    try {
      await requireRole(req, 'ADMIN')
    } catch (e: any) {
      audit('unauthorized_access', {
        route: 'admin/audit',
        ip: getClientIp(req),
        actorRole: 'unknown',
      })
      return NextResponse.json({ message: e?.message || 'Unauthorized' }, { status: 401 })
    }
  }

  const events = await getRecentAuditEvents(50)
  return NextResponse.json({ events, count: events.length })
}
