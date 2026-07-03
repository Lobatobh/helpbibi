import { NextRequest, NextResponse } from 'next/server'
import { getPublicTracking } from '@/server/repositories/tracking.repository'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'

/**
 * GET /api/track/[serviceId]
 * Public tracking endpoint — no auth required.
 * Returns only safe public data (no client name, phone, payment, plate, chat).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'track', RATE_LIMITS.track)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'track' })
    return rateLimited
  }

  try {
    const { serviceId } = await params
    const data = await getPublicTracking(serviceId)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/track] Error:', error)
    return NextResponse.json(
      { available: false, message: 'Rastreamento indisponível ou encerrado.' },
      { status: 500 }
    )
  }
}
