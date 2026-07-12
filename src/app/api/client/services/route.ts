import { NextRequest, NextResponse } from 'next/server'
import { getClientServices } from '@/server/repositories/history.repository'
import { requireRole } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { createOperationalService } from '@/server/services/service-lifecycle'
import { findRealtimeServiceById } from '@/server/repositories/service-requests.repository'
import { calculatePrice } from '@/server/pricing/pricing-engine'
import { db } from '@/server/db/prisma'

type LatLng = { lat: number; lng: number }

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

function isLatLng(value: unknown): value is LatLng {
  return !!value &&
    typeof value === 'object' &&
    typeof (value as LatLng).lat === 'number' &&
    typeof (value as LatLng).lng === 'number'
}

function distanceKm(a: LatLng, b: LatLng): number {
  const r = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return Number((2 * r * Math.asin(Math.sqrt(h))).toFixed(2))
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
    const user = await requireRole(req, 'CLIENT')
    const body = await req.json().catch(() => ({}))
    const type = TYPE_MAP[String(body?.type || '').toLowerCase()]
    const paymentMethod = PAYMENT_MAP[String(body?.paymentMethod || 'pix').toLowerCase()] || 'PIX'

    if (!type || !isLatLng(body?.pickup) || !isLatLng(body?.destination)) {
      return NextResponse.json({ message: 'Invalid service payload' }, { status: 400 })
    }
    if (typeof body?.pickupLabel !== 'string' || typeof body?.destinationLabel !== 'string') {
      return NextResponse.json({ message: 'Pickup and destination labels are required' }, { status: 400 })
    }

    const km = distanceKm(body.pickup, body.destination)
    const breakdown = calculatePrice({
      serviceType: String(body.type).toLowerCase() as any,
      pickup: body.pickup,
      destination: body.destination,
      providerPosition: null,
      pickupDistanceKm: 0,
      destinationDistanceKm: km,
    })
    const service = await createOperationalService(db as any, {
      clientId: user.id,
      type,
      description: String(body?.description || '').slice(0, 500),
      pickup: body.pickup,
      pickupLabel: body.pickupLabel.slice(0, 200),
      destination: body.destination,
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
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
