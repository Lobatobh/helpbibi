import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth'
import { db } from '@/server/db/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const action = body.action as string

  const profileUpdate: any = {}
  const userUpdate: any = {}

  switch (action) {
    case 'approve':
      profileUpdate.isVerified = true
      profileUpdate.documentStatus = 'APPROVED'
      profileUpdate.vehicleStatus = 'APPROVED'
      profileUpdate.isAvailable = true
      userUpdate.status = 'ACTIVE'
      break
    case 'reject':
      profileUpdate.isVerified = false
      profileUpdate.documentStatus = 'REJECTED'
      profileUpdate.vehicleStatus = 'REJECTED'
      profileUpdate.isAvailable = false
      break
    case 'block':
      userUpdate.status = 'SUSPENDED'
      profileUpdate.isAvailable = false
      break
    case 'unblock':
      userUpdate.status = 'ACTIVE'
      break
    default:
      if (body.isVerified !== undefined) profileUpdate.isVerified = body.isVerified
      if (body.documentStatus !== undefined) profileUpdate.documentStatus = body.documentStatus
      if (body.vehicleStatus !== undefined) profileUpdate.vehicleStatus = body.vehicleStatus
      if (body.isAvailable !== undefined) profileUpdate.isAvailable = body.isAvailable
  }

  if (Object.keys(profileUpdate).length > 0) {
    await db.providerProfile.update({ where: { id }, data: profileUpdate })
  }
  if (Object.keys(userUpdate).length > 0) {
    const profile = await db.providerProfile.findUnique({ where: { id } })
    if (profile) await db.user.update({ where: { id: profile.userId }, data: userUpdate })
  }

  const updated = await db.providerProfile.findUnique({
    where: { id },
    include: { user: { select: { status: true } } },
  })

  return NextResponse.json({ success: true, provider: { id: updated!.id, isVerified: updated!.isVerified, documentStatus: updated!.documentStatus, vehicleStatus: updated!.vehicleStatus, isAvailable: updated!.isAvailable, userStatus: updated!.user.status } })
}
