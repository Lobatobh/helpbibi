import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { db } from '@/server/db/prisma'

function normalizeText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  return text.slice(0, max)
}

function serializeClientProfile(user: {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  status: string
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, 'CLIENT')
    const profile = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true },
    })
    return NextResponse.json({ profile: serializeClientProfile(profile) })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireRole(req, 'CLIENT')
    const body = await req.json().catch(() => ({}))
    const data: { name?: string; phone?: string | null } = {}
    const name = normalizeText(body?.name, 120)
    const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 40) : undefined
    if (name) data.name = name
    if (phone !== undefined) data.phone = phone || null

    const updated = Object.keys(data).length
      ? await db.user.update({
          where: { id: user.id },
          data,
          select: { id: true, name: true, email: true, phone: true, role: true, status: true },
        })
      : await db.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { id: true, name: true, email: true, phone: true, role: true, status: true },
        })

    return NextResponse.json({ profile: serializeClientProfile(updated) })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
