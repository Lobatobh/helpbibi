import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { db } from '@/server/db/prisma'

function normalizeText(value: unknown, max: number, allowEmpty = false): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text && !allowEmpty) return undefined
  return text.slice(0, max)
}

function serializeProviderProfile(profile: {
  id: string
  userId: string
  vehicle: string
  plate: string
  city: string | null
  approvalStatus: string
  approvalReason: string | null
  isAvailable: boolean
  isVerified: boolean
  user: { id: string; name: string; email: string | null; phone: string | null; role: string; status: string }
}) {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
    email: profile.user.email,
    phone: profile.user.phone,
    role: profile.user.role,
    status: profile.user.status,
    vehicle: profile.vehicle,
    plate: profile.plate,
    city: profile.city,
    approvalStatus: profile.approvalStatus,
    approvalReason: profile.approvalReason,
    isAvailable: profile.isAvailable,
    isVerified: profile.isVerified,
  }
}

async function loadProviderProfile(userId: string) {
  return db.providerProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, role: true, status: true } },
    },
  })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, 'PROVIDER')
    const profile = await loadProviderProfile(user.id)
    if (!profile) return NextResponse.json({ message: 'Provider profile not found' }, { status: 404 })
    return NextResponse.json({ profile: serializeProviderProfile(profile) })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireRole(req, 'PROVIDER')
    const existingProfile = await loadProviderProfile(user.id)
    if (!existingProfile) return NextResponse.json({ message: 'Provider profile not found' }, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const userData: { name?: string; phone?: string | null } = {}
    const profileData: { vehicle?: string; plate?: string; city?: string | null } = {}

    const name = normalizeText(body?.name, 120)
    const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 40) : undefined
    const vehicle = normalizeText(body?.vehicle, 80)
    const plate = normalizeText(body?.plate, 20)
    const city = normalizeText(body?.city, 80, true)

    if (name) userData.name = name
    if (phone !== undefined) userData.phone = phone || null
    if (vehicle) profileData.vehicle = vehicle
    if (plate) profileData.plate = plate
    if (city !== undefined) profileData.city = city || null

    await db.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id: user.id }, data: userData })
      }
      if (Object.keys(profileData).length) {
        await tx.providerProfile.update({ where: { userId: user.id }, data: profileData })
      }
    })

    const profile = await loadProviderProfile(user.id)
    if (!profile) return NextResponse.json({ message: 'Provider profile not found' }, { status: 404 })
    return NextResponse.json({ profile: serializeProviderProfile(profile) })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
