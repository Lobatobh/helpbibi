import { NextRequest, NextResponse } from 'next/server'
import { simulatePaymentOutcome } from '@/server/repositories/payment.repository'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'

export async function POST(req: NextRequest) {
  // FASE 26: rate limiting
  const rateLimited = await applyRateLimit(req, 'payments/simulate', RATE_LIMITS.simulate)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'payments/simulate' })
    return rateLimited
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ message: 'Simulated payments are disabled in production' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { serviceRequestId, outcome, method, amount, platformFee, providerPayout, discountAmount, couponCode } = body
    if (!serviceRequestId || !outcome || !method || typeof amount !== 'number') {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }
    if (outcome !== 'success' && outcome !== 'failure') {
      return NextResponse.json({ message: 'outcome must be success or failure' }, { status: 400 })
    }
    const record = await simulatePaymentOutcome(serviceRequestId, outcome, method, Number(amount), Number(platformFee || 0), Number(providerPayout || 0), Number(discountAmount || 0), couponCode || null)
    // FASE 26: secure logging — do NOT log amount/platformFee
    logger.info('payment', 'simulate', { serviceRequestId, outcome, ip: getClientIp(req) })
    return NextResponse.json({ ok: true, payment: record })
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message || 'Simulate error' }, { status: 500 })
  }
}
