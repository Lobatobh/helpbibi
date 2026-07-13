import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/server/auth/session'
import { applyRateLimit, RATE_LIMITS, getClientIp } from '@/server/rate-limit'
import { audit } from '@/server/audit'
import { logger } from '@/server/logger'
import {
  handleSimulatedPaymentError,
  simulateClientServicePayment,
  type SimulatedPaymentOutcome,
} from '@/server/payments/simulated-payment-workflow'

const FORBIDDEN_PAYLOAD_FIELDS = [
  'amount',
  'originalAmount',
  'discountAmount',
  'platformFee',
  'providerPayout',
  'couponCode',
  'promoCode',
  'paymentMethod',
  'gatewayProvider',
  'simulatedTransactionId',
  'status',
  'clientId',
  'userId',
  'role',
  'providerId',
]

export async function POST(req: NextRequest) {
  const rateLimited = await applyRateLimit(req, 'payments/simulate', RATE_LIMITS.simulate)
  if (rateLimited) {
    audit('rate_limit_exceeded', { ip: getClientIp(req), route: 'payments/simulate' })
    return rateLimited
  }

  try {
    const user = await requireCurrentUser(req)
    const body = await req.json().catch(() => ({}))
    const forbidden = FORBIDDEN_PAYLOAD_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field))
    if (forbidden.length > 0) {
      return NextResponse.json(
        { ok: false, code: 'forbidden_payment_payload', message: `Campos nao aceitos: ${forbidden.join(', ')}` },
        { status: 400 },
      )
    }

    const { serviceRequestId, outcome } = body
    if (!serviceRequestId || !outcome) {
      return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 })
    }
    if (outcome !== 'success' && outcome !== 'failure') {
      return NextResponse.json({ ok: false, message: 'outcome must be success or failure' }, { status: 400 })
    }

    const payment = await simulateClientServicePayment({
      user,
      serviceRequestId,
      outcome: outcome as SimulatedPaymentOutcome,
    })
    logger.info('payment', 'simulate', { serviceRequestId, outcome, ip: getClientIp(req) })
    return NextResponse.json({ ok: true, payment })
  } catch (error) {
    const mapped = handleSimulatedPaymentError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
