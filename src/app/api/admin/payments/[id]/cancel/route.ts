import { NextRequest, NextResponse } from 'next/server'
import { cancelPayment } from '@/server/repositories/payment.repository'
import { requireRole } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rateLimited = await applyRateLimit(req, 'admin/cancel', RATE_LIMITS.admin)
  if (rateLimited) return rateLimited
  if (process.env.NODE_ENV === 'production') {
    try { await requireRole(req, 'ADMIN') }
    catch (e: any) { audit('unauthorized_access', { route: 'admin/cancel', ip: getClientIp(req) }); return NextResponse.json({ message: e.message }, { status: 401 }) }
  }
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const record = await cancelPayment(id, body.reason)
    audit('payment_failed', { actor: 'admin', actorRole: 'ADMIN', route: 'admin/cancel', target: id, metadata: { action: 'cancel', reason: body.reason } })
    logger.info('admin', 'Payment canceled', { paymentId: id })
    return NextResponse.json({ ok: true, payment: record })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 400 })
  }
}
