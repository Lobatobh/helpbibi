import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth'
import { db } from '@/server/db/prisma'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const providers = await db.providerProfile.findMany({
    include: { user: { select: { name: true, email: true, phone: true, status: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(providers.map(p => ({
    id: p.id,
    name: p.user.name,
    email: p.user.email,
    phone: p.user.phone,
    vehicle: p.vehicle,
    plate: p.plate,
    city: p.city,
    rating: p.rating,
    completedCount: p.completedCount,
    isAvailable: p.isAvailable,
    isVerified: p.isVerified,
    isDemoProvider: p.isDemoProvider,
    documentStatus: p.documentStatus,
    vehicleStatus: p.vehicleStatus,
    userStatus: p.user.status,
    createdAt: p.user.createdAt,
  })))
}
