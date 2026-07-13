import { NextRequest, NextResponse } from 'next/server'
import {
  handleSimulatedPaymentError,
  processSimulatedPaymentWebhook,
} from '@/server/payments/simulated-payment-workflow'

/**
 * POST /api/payments/webhook/simulated
 *
 * Canonical simulated-provider webhook endpoint for pilot/pre-production.
 * Business rules, signature validation, idempotency, and state transitions are
 * centralized in processSimulatedPaymentWebhook().
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })

    const result = await processSimulatedPaymentWebhook({ rawBody, headers })
    return NextResponse.json(result)
  } catch (error) {
    const mapped = handleSimulatedPaymentError(error)
    if (mapped.status !== 500) {
      return NextResponse.json(mapped.body, { status: mapped.status })
    }
    console.error('[api/payments/webhook/simulated] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 },
    )
  }
}
