import { NextRequest, NextResponse } from 'next/server'
import { getProviderServices, authorizeHistoryRequest } from '@/server/repositories/history.repository'
import { getSessionUser } from '@/server/auth/session'
import { db } from '@/server/db/prisma'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const dbUserId = url.searchParams.get('dbUserId')
  const providerProfileId = url.searchParams.get('providerProfileId')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
  const sessionUser = getSessionUser(req)
  const auth = authorizeHistoryRequest({
    sessionUser: sessionUser ? { id: sessionUser.id, role: sessionUser.role } : null,
    queryDbUserId: dbUserId, expectedRole: 'PROVIDER', nodeEnv: process.env.NODE_ENV,
  })
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })
  let profileId = providerProfileId
  if (!profileId) {
    const profile = await db.providerProfile.findUnique({ where: { userId: auth.actor.userId }, select: { id: true } }).catch(() => null)
    profileId = profile?.id || null
  }
  const services = await getProviderServices(auth.actor, profileId, limit)
  return NextResponse.json({ services, count: services.length, providerProfileId: profileId })
}
