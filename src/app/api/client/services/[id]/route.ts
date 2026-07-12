import { NextRequest, NextResponse } from 'next/server'
import { getClientServiceDetail } from '@/server/repositories/history.repository'
import { requireRole } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'client/services/detail', RATE_LIMITS.history)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'client/services/detail' })
    return rateLimited
  }

  const { id } = await params
  try {
    const user = await requireRole(req, 'CLIENT')
    const result = await getClientServiceDetail({ userId: user.id, role: 'CLIENT' }, id)
    return NextResponse.json(result.data, { status: result.status })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
