import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/server/db/prisma'
import {
  validateTransition,
  type PaymentStatus,
} from '@/server/payments/payment-state-machine'
import { getMercadoPagoGateway, isMercadoPagoConfigured } from '@/server/payments/gateways/mercado-pago-gateway'

/**
 * POST /api/payments/webhook/mercado-pago
 *
 * Mercado Pago webhook endpoint (FASE 19 — sandbox).
 * Receives payment notifications from Mercado Pago with x-signature header.
 *
 * Security:
 *   - Signature verification via MercadoPagoGateway.verifyWebhookSignature()
 *   - Uses MERCADO_PAGO_WEBHOOK_SECRET from env
 *   - Invalid signature → 401
 *   - Invalid event → 400
 *   - Idempotent: already in target status → 200 (no duplicate)
 *   - Invalid transition → 409
 *   - PaymentRecord not found → 404
 *   - Public tracking remains safe (no financial data leaks)
 *
 * Mercado Pago webhook body example:
 *   {
 *     "action": "payment.updated",
 *     "api_version": "v1",
 *     "data": { "id": "123456789" },
 *     "date_created": "2024-01-01T00:00:00.000Z",
 *     "id": "event-id",
 *     "live_mode": false,
 *     "type": "payment",
 *     "user_id": "123"
 *   }
 *
 * Headers:
 *   x-signature: ts=<timestamp>,v1=<hex>
 *   x-request-id: <request-id>
 *   content-type: application/json
 */

export async function POST(req: NextRequest) {
  try {
    // Guard: only allow if Mercado Pago is configured
    if (!isMercadoPagoConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'Mercado Pago gateway not configured. Set MERCADO_PAGO_ACCESS_TOKEN and MERCADO_PAGO_WEBHOOK_SECRET.' },
        { status: 503 }
      )
    }

    const gateway = getMercadoPagoGateway()
    const rawBody = await req.text()
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => { headers[key.toLowerCase()] = value })

    // Extract data.id from URL query params and x-request-id from header
    // (Mercado Pago sends data.id as query param, not in body)
    const url = new URL(req.url)
    const dataId = url.searchParams.get('data.id') || undefined
    const requestId = headers['x-request-id'] || undefined

    // 1. Verify signature (Mercado Pago format: ts=...,v1=...)
    // Manifest template: "id:[data.id];request-id:[x-request-id];ts:[ts];"
    const signature = headers['x-signature'] || ''
    const verification = await gateway.verifyWebhookSignature(rawBody, signature, { dataId, requestId })
    if (!verification.valid) {
      console.warn(`[webhook/mercado-pago] signature verification failed: ${verification.reason}`)
      return NextResponse.json(
        { ok: false, error: 'Invalid signature', reason: verification.reason },
        { status: 401 }
      )
    }

    // 2. Parse webhook event (fetches payment status from MP API)
    let parsed
    try {
      parsed = await gateway.parseWebhookEvent(rawBody, headers)
    } catch (e: any) {
      console.warn(`[webhook/mercado-pago] parse error: ${e.message}`)
      return NextResponse.json(
        { ok: false, error: e.message || 'Failed to parse webhook' },
        { status: 400 }
      )
    }

    const { event, providerPaymentId, externalReference, message, rawPayload } = parsed

    if (!providerPaymentId) {
      return NextResponse.json(
        { ok: false, error: 'Webhook missing payment ID' },
        { status: 400 }
      )
    }

    // 3. Find PaymentRecord by providerPaymentId OR externalReference
    const payment = await db.paymentRecord.findFirst({
      where: {
        OR: [
          { providerPaymentId },
          ...(externalReference ? [{ externalReference }] : []),
        ],
      },
      include: { serviceRequest: { select: { id: true, status: true } } },
    })

    if (!payment) {
      console.warn(`[webhook/mercado-pago] PaymentRecord not found for providerPaymentId=${providerPaymentId}`)
      return NextResponse.json(
        { ok: false, error: 'PaymentRecord not found' },
        { status: 404 }
      )
    }

    const toStatus: PaymentStatus = event
    const fromStatus = payment.status as PaymentStatus

    // 4. Validate transition via state machine
    const validation = validateTransition(fromStatus, toStatus)
    if (!validation.valid) {
      // Idempotency: if already in the target status, return ok
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
      if (rawPayload?.statusDetail) updateData.failureReason = rawPayload.statusDetail
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
        message: (message || `MP Webhook: ${fromStatus} → ${toStatus}`).slice(0, 500),
        rawPayload: rawPayload ? JSON.stringify(rawPayload).slice(0, 4000) : JSON.stringify({ event, providerPaymentId }).slice(0, 4000),
      },
    })

    // 7. Create ServiceTimelineEvent (internal, filtered from public tracking)
    const timelineLabel = toStatus === 'AUTHORIZED'
      ? `Pagamento ${payment.method} autorizado via Mercado Pago`
      : toStatus === 'PAID'
        ? `Pagamento ${payment.method} confirmado via Mercado Pago (R$ ${payment.amount.toFixed(2).replace('.', ',')})`
        : toStatus === 'FAILED'
          ? `Pagamento ${payment.method} recusado via Mercado Pago`
          : toStatus === 'CANCELED'
            ? `Pagamento ${payment.method} cancelado via Mercado Pago`
            : `Pagamento ${payment.method} estornado via Mercado Pago`
    await db.serviceTimelineEvent.create({
      data: {
        serviceId: payment.serviceRequestId,
        status: payment.serviceRequest?.status || 'COMPLETED',
        label: timelineLabel,
      },
    }).catch(() => {})

    console.log(`[webhook/mercado-pago] payment ${payment.id} transitioned ${fromStatus} → ${toStatus} (signature verified)`)

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      provider: 'mercado_pago',
      fromStatus,
      toStatus,
      eventType: validation.eventType,
      signatureVerified: true,
    })
  } catch (error) {
    console.error('[api/payments/webhook/mercado-pago] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 }
    )
  }
}
