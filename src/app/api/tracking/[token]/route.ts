import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { getPublicTracking } from '@/server/repositories/tracking.repository'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const rateLimited = await applyRateLimit(req, 'tracking-token', RATE_LIMITS.track)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'tracking-token' })
    return rateLimited
  }

  try {
    const { token } = await params
    const result = await getPublicTracking(token)
    if (result.kind === 'not_found') {
      return NextResponse.json(
        { available: false, message: 'Rastreamento indisponivel ou encerrado.' },
        { status: 404 },
      )
    }
    if (result.kind === 'expired') {
      return NextResponse.json(
        { available: false, message: 'Este link de rastreamento expirou ou foi revogado.' },
        { status: 410 },
      )
    }
    return NextResponse.json(result.data)
  } catch {
    return NextResponse.json(
      { available: false, message: 'Rastreamento indisponivel ou encerrado.' },
      { status: 404 },
    )
  }
}
