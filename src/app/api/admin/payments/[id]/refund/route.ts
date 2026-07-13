import { NextRequest, NextResponse } from 'next/server'
import { refundPayment } from '@/server/repositories/payment.repository'
import { requireRole } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import { assertSimulatedPaymentEnabled, handleSimulatedPaymentError } from '@/server/payments/simulated-payment-workflow'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rateLimited = await applyRateLimit(req, 'admin/refund', RATE_LIMITS.admin)
  if (rateLimited) return rateLimited
  try { await requireRole(req, 'ADMIN') }
  catch (e: any) { audit('unauthorized_access', { route: 'admin/refund', ip: getClientIp(req) }); return NextResponse.json({ message: e.message }, { status: e.message?.startsWith('Forbidden') ? 403 : 401 }) }
  const { id } = await params
  try {
    assertSimulatedPaymentEnabled()
    const payment = await db.paymentRecord.findUnique({
      where: { id },
      select: { provider: true },
    })
    if (!payment) {
      return NextResponse.json({ ok: false, message: 'PaymentRecord not found' }, { status: 404 })
    }
    if (payment.provider !== 'simulated') {
      return NextResponse.json({ ok: false, message: 'Only simulated payments can be refunded in this pilot phase' }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const record = await refundPayment(id, undefined, body.reason)
    audit('payment_invalid_transition', { actor: 'admin', actorRole: 'ADMIN', route: 'admin/refund', target: id, metadata: { action: 'refund' } })
    logger.info('admin', 'Payment refunded', { paymentId: id })
    return NextResponse.json({ ok: true, payment: record })
  } catch (e: any) {
    const mapped = handleSimulatedPaymentError(e)
    if (mapped.status !== 500) {
      return NextResponse.json(mapped.body, { status: mapped.status })
    }
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 })
  }
}
