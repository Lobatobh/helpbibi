import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/server/db/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ message: 'Admin approval requires authenticated session in production' }, { status: 403 })
  }
  const { id } = await params
  try {
    const body = await req.json()
    const { documentStatus, vehicleStatus, isVerified } = body
    const data: Record<string, unknown> = {}
    if (documentStatus) data.documentStatus = documentStatus
    if (vehicleStatus) data.vehicleStatus = vehicleStatus
    if (typeof isVerified === 'boolean') data.isVerified = isVerified
    const updated = await db.providerProfile.update({ where: { id }, data, include: { user: true } })
    return NextResponse.json({ ok: true, provider: updated })
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message || 'Approval error' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const provider = await db.providerProfile.findUnique({ where: { id }, include: { user: true } }).catch(() => null)
  if (!provider) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  return NextResponse.json({ provider })
}
