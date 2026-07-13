import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/server/auth/session'
import { getConsentStatus } from '@/server/consents/consent-service'

export async function GET(req: NextRequest) {
  try {
    const user = await requireCurrentUser(req)
    const consents = await getConsentStatus(user.id, user.role)
    return NextResponse.json({
      consents: consents.map((item) => ({
        ...item,
        acceptedAt: item.acceptedAt?.toISOString() || null,
      })),
      current: consents.every((item) => item.accepted),
    })
  } catch {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
