import { NextRequest, NextResponse } from 'next/server'
import { getClientServices } from '@/server/repositories/history.repository'
import { requireRole } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { createOperationalService } from '@/server/services/service-lifecycle'
import { findRealtimeServiceById } from '@/server/repositories/service-requests.repository'
import { calculatePrice } from '@/server/pricing/pricing-engine'
import { db } from '@/server/db/prisma'
import { ConsentRequiredError, requireCurrentLocationConsent } from '@/server/consents/consent-service'
import { isValidOperationalLocation } from '@/server/tracking/location-validation'

const TYPE_MAP: Record<string, any> = {
  reboque: 'REBOQUE',
  pneu: 'PNEU',
  bateria: 'BATERIA',
  combustivel: 'COMBUSTIVEL',
  chaveiro: 'CHAVEIRO',
  pane: 'PANE',
}

const PAYMENT_MAP: Record<string, any> = {
  pix: 'PIX',
  card: 'CARD',
  cash: 'CASH',
}

export async function GET(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'client/services', RATE_LIMITS.history)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'client/services' })
    return rateLimited
  }

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
  try {
    const user = await requireRole(req, 'CLIENT')
    const services = await getClientServices({ userId: user.id, role: 'CLIENT' }, limit)
    return NextResponse.json({ services, count: services.length })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await applyRateLimit(req, 'client/services/create', RATE_LIMITS.history)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'client/services/create' })
    return rateLimited
  }

  try {
    const user = await requireCurrentLocationConsent(req, 'CLIENT')
    const body = await req.json().catch(() => ({}))
    const type = TYPE_MAP[String(body?.type || '').toLowerCase()]
    const paymentMethod = PAYMENT_MAP[String(body?.paymentMethod || 'pix').toLowerCase()] || 'PIX'

    if (!type || !isValidOperationalLocation(body?.pickup) || body?.destination !== null) {
      return NextResponse.json({ message: 'Invalid service payload' }, { status: 400 })
    }
    if (typeof body?.pickupLabel !== 'string' || typeof body?.destinationLabel !== 'string') {
      return NextResponse.json({ message: 'Pickup and destination labels are required' }, { status: 400 })
    }

    const km = 0
    const breakdown = calculatePrice({
      serviceType: String(body.type).toLowerCase() as any,
      pickup: body.pickup,
      destination: null,
      providerPosition: null,
      pickupDistanceKm: 0,
      destinationDistanceKm: 0,
    })
    const service = await createOperationalService(db as any, {
      clientId: user.id,
      type,
      description: String(body?.description || '').slice(0, 500),
      pickup: body.pickup,
      pickupLabel: body.pickupLabel.slice(0, 200),
      destination: null,
      destinationLabel: body.destinationLabel.slice(0, 200),
      distanceKm: km,
      etaMin: Math.max(3, Math.round(km / 0.5)),
      price: Math.round(breakdown.total),
      originalPrice: Math.round(breakdown.beforeDiscount),
      discount: Math.round(breakdown.discountAmount),
      promoCode: null,
      paymentMethod,
      loyaltyPoints: 0,
    }, { dedupeActive: true, audit: audit as any })

    const snapshot = await findRealtimeServiceById(service.id)
    return NextResponse.json({ service: snapshot, created: !(service as any).deduped })
  } catch (error) {
    if (error instanceof ConsentRequiredError) {
      return NextResponse.json({
        code: 'consent_required',
        message: 'Aceite os documentos vigentes antes de criar uma solicitação.',
        pending: error.pending,
      }, { status: 428 })
    }
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
