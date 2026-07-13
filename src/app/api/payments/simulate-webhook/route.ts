import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import {
  handleSimulatedPaymentError,
  simulateSignedPaymentWebhookReplay,
} from '@/server/payments/simulated-payment-workflow'

/**
 * POST /api/payments/simulate-webhook
 *
 * Admin-only compatibility endpoint that generates a signed simulated webhook
 * and replays it through the same central processor used by
 * /api/payments/webhook/simulated. It does not return the signature or raw
 * webhook payload.
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, 'ADMIN')

    const body = await req.json()
    const result = await simulateSignedPaymentWebhookReplay({
      paymentRecordId: body.paymentRecordId,
      providerPaymentId: body.providerPaymentId,
      externalReference: body.externalReference,
      event: body.event,
      message: body.message,
    })

    return NextResponse.json(result)
  } catch (error) {
    const mapped = handleSimulatedPaymentError(error)
    if (mapped.status !== 500) {
      return NextResponse.json(mapped.body, { status: mapped.status })
    }
    console.error('[api/payments/simulate-webhook] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 },
    )
  }
}
