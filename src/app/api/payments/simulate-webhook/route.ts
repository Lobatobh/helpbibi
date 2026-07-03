import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/server/db/prisma'
import { getPaymentGateway } from '@/server/payments/gateways'

/**
 * POST /api/payments/simulate-webhook
 *
 * Internal endpoint (FASE 18) that generates a signed webhook payload using the
 * simulated gateway and replays it to the webhook endpoint.
 *
 * This is for demo/testing only — in production, webhooks come from the gateway.
 *
 * Body:
 *   {
 *     "paymentRecordId": "..." OR "providerPaymentId": "..." OR "externalReference": "...",
 *     "event": "AUTHORIZED" | "PAID" | "FAILED" | "CANCELED" | "REFUNDED",
 *     "message"?: "optional"
 *   }
 *
 * Security: admin-only (or client-own-payment in demo mode).
 * For simplicity in MVP, this endpoint is open in simulated mode — production
 * will require auth + only work with the simulated gateway.
 */

export async function POST(req: NextRequest) {
  try {
    // FASE 24: Block in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { ok: false, error: 'Webhook simulation not available in production' },
        { status: 403 }
      )
    }

    const gateway = getPaymentGateway()

    // Only allow in simulated mode
    if (gateway.provider !== 'simulated') {
      return NextResponse.json(
        { ok: false, error: 'Webhook simulation only available in simulated mode' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { paymentRecordId, providerPaymentId, externalReference, event, message } = body

    const validEvents = ['AUTHORIZED', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED']
    if (!event || !validEvents.includes(event)) {
      return NextResponse.json(
        { ok: false, error: `Invalid event. Must be one of: ${validEvents.join(', ')}` },
        { status: 400 }
      )
    }

    // Find PaymentRecord
    const payment = await db.paymentRecord.findFirst({
      where: {
        OR: [
          ...(paymentRecordId ? [{ id: paymentRecordId }] : []),
          ...(providerPaymentId ? [{ providerPaymentId }] : []),
          ...(externalReference ? [{ externalReference }] : []),
        ],
      },
      select: { id: true, providerPaymentId: true, externalReference: true, status: true }
    })

    if (!payment) {
      return NextResponse.json(
        { ok: false, error: 'PaymentRecord not found' },
        { status: 404 }
      )
    }

    if (!payment.providerPaymentId) {
      return NextResponse.json(
        { ok: false, error: 'PaymentRecord has no providerPaymentId (legacy record)' },
        { status: 400 }
      )
    }

    // Generate signed webhook payload
    if (!gateway.generateSignedWebhook) {
      return NextResponse.json(
        { ok: false, error: 'Gateway does not support webhook simulation' },
        { status: 400 }
      )
    }

    const { body: webhookBody, signature, headers } = await gateway.generateSignedWebhook(
      payment.providerPaymentId,
      event,
      message
    )

    // Replay to the webhook endpoint (internal call)
    const webhookUrl = '/api/payments/webhook/simulated'
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`
    const response = await fetch(`${baseUrl}${webhookUrl}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-helpbibi-signature': signature,
        'x-helpbibi-provider': 'simulated',
      },
      body: webhookBody,
    })

    const result = await response.json()

    return NextResponse.json({
      ok: response.ok,
      webhookResult: result,
      generatedPayload: JSON.parse(webhookBody),
      signatureProvided: signature,
    })
  } catch (error) {
    console.error('[api/payments/simulate-webhook] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 }
    )
  }
}
