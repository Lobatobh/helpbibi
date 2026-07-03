import { NextRequest, NextResponse } from 'next/server'
import { reconcilePayments } from '@/server/repositories/payment.repository'
import { requireRole } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'

export async function GET(req: NextRequest) {
  const rateLimited = await applyRateLimit(req, 'admin/reconcile', RATE_LIMITS.admin)
  if (rateLimited) return rateLimited
  if (process.env.NODE_ENV === 'production') {
    try { await requireRole(req, 'ADMIN') }
    catch (e: any) { audit('unauthorized_access', { route: 'admin/reconcile', ip: getClientIp(req) }); return NextResponse.json({ message: e.message }, { status: 401 }) }
  }
  const result = await reconcilePayments()
  return NextResponse.json(result)
}
