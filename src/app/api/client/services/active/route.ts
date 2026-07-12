import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { findActiveServiceForClient } from '@/server/repositories/service-requests.repository'

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, 'CLIENT')
    const service = await findActiveServiceForClient(user.id)
    return NextResponse.json({ service })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
