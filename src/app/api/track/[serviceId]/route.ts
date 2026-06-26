import { NextRequest, NextResponse } from 'next/server'
import { getPublicTracking } from '@/server/repositories/tracking.repository'

/**
 * GET /api/track/[serviceId]
 * Public tracking endpoint — no auth required.
 * Returns only safe public data (no client name, phone, payment, plate, chat).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
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
