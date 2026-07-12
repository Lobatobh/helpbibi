import { NextRequest, NextResponse } from 'next/server'
import { getProviderServiceDetail } from '@/server/repositories/history.repository'
import { requireRole } from '@/server/auth/session'
import { getProviderProfileIdForUser } from '@/server/services/service-access'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'provider/services/detail', RATE_LIMITS.history)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'provider/services/detail' })
    return rateLimited
  }

  const { id } = await params
  try {
    const user = await requireRole(req, 'PROVIDER')
    const profileId = await getProviderProfileIdForUser(user.id)
    const result = await getProviderServiceDetail({ userId: user.id, role: 'PROVIDER' }, profileId, id)
    return NextResponse.json(result.data, { status: result.status })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
