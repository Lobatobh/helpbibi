import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth'
import { db } from '@/server/db/prisma'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const services = await db.serviceRequest.findMany({
    include: {
      client: { select: { name: true } },
      provider: { include: { user: { select: { name: true } } } },
      timeline: { orderBy: { createdAt: 'desc' }, take: 1 },
      ratings: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(services.map(s => ({
    id: s.id,
    clientName: s.client.name,
    providerName: s.provider?.user.name || null,
    type: s.type,
    status: s.status,
    pickupLabel: s.pickupLabel,
    destinationLabel: s.destinationLabel,
    price: s.price,
    platformFee: s.platformFee,
    providerPayout: s.providerPayout,
    discount: s.discount,
    promoCode: s.promoCode,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    lastTimeline: s.timeline[0]?.label || null,
    ratingsCount: s.ratings.length,
  })))
}
