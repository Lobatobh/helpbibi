import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import { findActiveServiceForProvider } from '@/server/repositories/service-requests.repository'

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, 'PROVIDER')
    const provider = await db.providerProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!provider) return NextResponse.json({ service: null, providerProfileId: null })
    const service = await findActiveServiceForProvider(provider.id)
    return NextResponse.json({ service, providerProfileId: provider.id })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
