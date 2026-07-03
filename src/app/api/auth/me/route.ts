import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'

export async function GET(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'auth/me', RATE_LIMITS.me)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'auth/me' })
    return rateLimited
  }

  const user = await getCurrentUserFromRequest(req)
  if (!user) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({ user })
}
