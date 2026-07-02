import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/server/auth/session'

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req)
  if (!user) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({ user })
}
