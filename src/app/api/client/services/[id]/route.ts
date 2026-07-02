import { NextRequest, NextResponse } from 'next/server'
import { getClientServiceDetail, authorizeHistoryRequest } from '@/server/repositories/history.repository'
import { getSessionUser } from '@/server/auth/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const dbUserId = url.searchParams.get('dbUserId')
  const sessionUser = getSessionUser(req)
  const auth = authorizeHistoryRequest({
    sessionUser: sessionUser ? { id: sessionUser.id, role: sessionUser.role } : null,
    queryDbUserId: dbUserId, expectedRole: 'CLIENT', nodeEnv: process.env.NODE_ENV,
  })
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })
  const result = await getClientServiceDetail(auth.actor, id)
  return NextResponse.json(result.data, { status: result.status })
}
