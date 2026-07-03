import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/server/db/prisma'
import {
  validateTransition,
  type PaymentStatus,
} from '@/server/payments/payment-state-machine'
import { getPaymentGateway } from '@/server/payments/gateways'

/**
 * POST /api/payments/webhook/simulated
 *
 * Webhook endpoint (FASE 18) — now uses the plugable gateway architecture.
 * Verifies HMAC-SHA256 signature using PAYMENT_WEBHOOK_SECRET.
 * In production, this endpoint receives webhooks from MercadoPago/Stripe/etc.
 *
 * Security:
 *   - Signature verification (HMAC-SHA256) via gateway.verifyWebhookSignature()
 *   - Invalid signature → 401
 *   - Invalid event → 400
 *   - Idempotent: already in target status → 200 (no duplicate)
 *   - Invalid transition → 409
 *   - PaymentRecord not found → 404
 *   - Public tracking remains safe (no financial data leaks)
 *
 * Headers expected:
 *   x-helpbibi-signature: sha256=<hex>
 *   x-helpbibi-provider: simulated (optional, for routing in future)
 *   content-type: application/json
 */

export async function POST(req: NextRequest) {
  try {
    const gateway = getPaymentGateway()
    const rawBody = await req.text()
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => { headers[key.toLowerCase()] = value })

    // 1. Verify signature
    const signature = headers['x-helpbibi-signature'] || ''
    const verification = await gateway.verifyWebhookSignature(rawBody, signature)
    if (!verification.valid) {
      console.warn(`[webhook] signature verification failed: ${verification.reason}`)
      return NextResponse.json(
        { ok: false, error: 'Invalid signature', reason: verification.reason },
        { status: 401 }
      )
    }

    // 2. Parse webhook event
    let parsed
    try {
      parsed = await gateway.parseWebhookEvent(rawBody, headers)
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e.message || 'Failed to parse webhook' },
        { status: 400 }
      )
    }

    const { event, providerPaymentId, externalReference, message, rawPayload } = parsed

    // 3. Find PaymentRecord by providerPaymentId OR externalReference
    const payment = await db.paymentRecord.findFirst({
      where: {
        OR: [
          ...(providerPaymentId ? [{ providerPaymentId }] : []),
          ...(externalReference ? [{ externalReference }] : []),
        ],
      },
      include: { serviceRequest: { select: { id: true, status: true } } },
    })

    if (!payment) {
      return NextResponse.json(
        { ok: false, error: 'PaymentRecord not found for the given reference' },
        { status: 404 }
      )
    }

    const toStatus: PaymentStatus = event
    const fromStatus = payment.status as PaymentStatus

    // 4. Validate transition via state machine
    const validation = validateTransition(fromStatus, toStatus)
    if (!validation.valid) {
      // Idempotency: if already in the target status, return ok (not an error)
      if (fromStatus === toStatus) {
        return NextResponse.json({
          ok: true,
          idempotent: true,
          message: `Payment already ${toStatus}`,
          paymentId: payment.id,
        })
      }
      return NextResponse.json(
        { ok: false, error: validation.message, fromStatus, toStatus },
        { status: 409 }
      )
    }

    // 5. Apply transition
    const updateData: any = {
      status: toStatus,
      lastWebhookSignature: signature.slice(0, 200),
      webhookVerifiedAt: new Date(),
    }
    if (toStatus === 'AUTHORIZED' || toStatus === 'PAID') {
      updateData.paidAt = new Date()
      updateData.failureReason = null
      updateData.failedAt = null
    }
    if (toStatus === 'FAILED') {
      updateData.failedAt = new Date()
      if (rawPayload?.failureReason) updateData.failureReason = rawPayload.failureReason
      else if (message) updateData.failureReason = message.slice(0, 240)
    }

    await db.paymentRecord.update({
      where: { id: payment.id },
      data: updateData,
    })

    // Update ServiceRequest.paymentStatus
    await db.serviceRequest.update({
      where: { id: payment.serviceRequestId },
      data: { paymentStatus: toStatus },
    })

    // 6. Record PaymentEvent (audit trail)
    await db.paymentEvent.create({
      data: {
        paymentRecordId: payment.id,
        eventType: validation.eventType!,
        fromStatus: fromStatus || null,
        toStatus,
        message: (message || `Webhook: ${fromStatus} → ${toStatus}`).slice(0, 500),
        rawPayload: rawPayload ? JSON.stringify(rawPayload).slice(0, 4000) : JSON.stringify({ event, providerPaymentId, externalReference }).slice(0, 4000),
      },
    })

    // 7. Create ServiceTimelineEvent (internal, filtered from public tracking)
    const timelineLabel = toStatus === 'AUTHORIZED'
      ? `Pagamento ${payment.method} autorizado via webhook`
      : toStatus === 'PAID'
        ? `Pagamento ${payment.method} confirmado via webhook (R$ ${payment.amount.toFixed(2).replace('.', ',')})`
        : toStatus === 'FAILED'
          ? `Pagamento ${payment.method} recusado via webhook`
          : toStatus === 'CANCELED'
            ? `Pagamento ${payment.method} cancelado via webhook`
            : `Pagamento ${payment.method} estornado via webhook`
    await db.serviceTimelineEvent.create({
      data: {
        serviceId: payment.serviceRequestId,
        status: payment.serviceRequest?.status || 'COMPLETED',
        label: timelineLabel,
      },
    }).catch(() => {})

    console.log(`[webhook] payment ${payment.id} transitioned ${fromStatus} → ${toStatus} via ${gateway.provider} gateway (signature verified)`)

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      provider: gateway.provider,
      fromStatus,
      toStatus,
      eventType: validation.eventType,
      signatureVerified: true,
    })
  } catch (error) {
    console.error('[api/payments/webhook/simulated] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 }
    )
  }
}
