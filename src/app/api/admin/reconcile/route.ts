import { NextRequest, NextResponse } from 'next/server'
import { reconcilePayments } from '@/server/repositories/payment.repository'
import { requireRole } from '@/server/auth/session'
import { assertSimulatedPaymentEnabled, handleSimulatedPaymentError } from '@/server/payments/simulated-payment-workflow'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'

export async function GET(req: NextRequest) {
  const rateLimited = await applyRateLimit(req, 'admin/reconcile', RATE_LIMITS.admin)
  if (rateLimited) return rateLimited
  try { await requireRole(req, 'ADMIN') }
  catch (e: any) { audit('unauthorized_access', { route: 'admin/reconcile', ip: getClientIp(req) }); return NextResponse.json({ message: e.message }, { status: e.message?.startsWith('Forbidden') ? 403 : 401 }) }
  try {
    assertSimulatedPaymentEnabled()
  } catch (e) {
    const mapped = handleSimulatedPaymentError(e)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
  const result = await reconcilePayments()
  return NextResponse.json(result)
}
