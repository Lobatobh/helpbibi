import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth'
import { findServiceForAdmin } from '@/server/repositories/service-requests.repository'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const service = await findServiceForAdmin(id)
  if (!service) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  return NextResponse.json({ service })
}
