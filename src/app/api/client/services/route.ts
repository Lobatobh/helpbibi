import { NextRequest, NextResponse } from 'next/server'
import { getClientServices, authorizeHistoryRequest } from '@/server/repositories/history.repository'
import { getSessionUser } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'

export async function GET(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'client/services', RATE_LIMITS.history)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'client/services' })
    return rateLimited
  }

  const url = new URL(req.url)
  const dbUserId = url.searchParams.get('dbUserId')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
  const sessionUser = getSessionUser(req)
  const auth = authorizeHistoryRequest({
    sessionUser: sessionUser ? { id: sessionUser.id, role: sessionUser.role } : null,
    queryDbUserId: dbUserId,
    expectedRole: 'CLIENT',
    nodeEnv: process.env.NODE_ENV,
  })
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })
  const services = await getClientServices(auth.actor, limit)
  return NextResponse.json({ services, count: services.length })
}
