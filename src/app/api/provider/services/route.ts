import { NextRequest, NextResponse } from 'next/server'
import { getProviderServices } from '@/server/repositories/history.repository'
import { requireRole } from '@/server/auth/session'
import { getProviderProfileIdForUser } from '@/server/services/service-access'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'

export async function GET(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'provider/services', RATE_LIMITS.history)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'provider/services' })
    return rateLimited
  }

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
  try {
    const user = await requireRole(req, 'PROVIDER')
    const profileId = await getProviderProfileIdForUser(user.id)
    const services = await getProviderServices({ userId: user.id, role: 'PROVIDER' }, profileId, limit)
    return NextResponse.json({ services, count: services.length, providerProfileId: profileId })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
