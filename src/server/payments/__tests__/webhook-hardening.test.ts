// Help Bibi — Webhook Hardening tests (FASE 26)
// Audit-focused tests around processWebhook signature/idempotency handling.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createHmac } from 'crypto'
import { db } from '@/server/db/prisma'
import { processWebhook } from '@/server/repositories/payment.repository'
import { SimulatedGateway } from '@/server/payments/gateways/simulated-gateway'

const SECRET = 'dev_webhook_secret_change_me' // matches .env so processWebhook's cached SimulatedGateway verifies our signatures
const PICKUP_JSON = JSON.stringify({ lat: -23.5505, lng: -46.6333 })
const DEST_JSON = JSON.stringify({ lat: -23.56, lng: -46.64 })

describe('webhook-hardening — signature/idempotency', () => {
  let gateway: SimulatedGateway
  let serviceRequestId: string
  let clientUserId: string
  let providerPaymentId: string
  let signedWebhook: { body: string; signature: string; headers: Record<string, string> }

  beforeEach(async () => {
    gateway = new SimulatedGateway(SECRET)
    // Ensure the factory uses our test secret (the cached SimulatedGateway is
    // created with process.env.PAYMENT_WEBHOOK_SECRET on first call).
    process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET
    // Note: if another test already cached a SimulatedGateway with a different
    // secret, the cached instance is reused. We therefore align our test secret
    // with .env's default ('dev_webhook_secret_change_me') so signatures match
    // regardless of cache state.

    // Create a client user + service request in the DB
    const email = `wh_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@helpbibi.com`
    const user = await db.user.create({ data: { email, name: 'WH Test', role: 'CLIENT' } })
    clientUserId = user.id
    const svc = await db.serviceRequest.create({
      data: {
        clientId: user.id,
        type: 'REBOQUE',
        pickup: PICKUP_JSON, pickupLabel: 'A',
        destination: DEST_JSON, destinationLabel: 'B',
        price: 180, paymentMethod: 'PIX', paymentStatus: 'PENDING',
        distanceKm: 5, etaMin: 10,
      },
    })
    serviceRequestId = svc.id

    // Create a PaymentRecord with a known providerPaymentId so the webhook
    // can find it via processWebhook.
    providerPaymentId = `pay_wh_${Date.now().toString(36)}`
    await db.paymentRecord.create({
      data: {
        serviceRequestId,
        method: 'PIX', status: 'PENDING',
        amount: 180, platformFee: 36, providerPayout: 144,
        discountAmount: 0, couponCode: null,
        provider: 'simulated',
        providerPaymentId,
        externalReference: `HB-WH-${providerPaymentId.slice(-6).toUpperCase()}`,
        idempotencyKey: `idem_wh_${providerPaymentId}`,
        events: { create: { eventType: 'CREATED', fromStatus: null, toStatus: 'PENDING', message: 'init' } },
      },
    })

    // Generate a properly-signed webhook for the duplicate test
    signedWebhook = await gateway.generateSignedWebhook(providerPaymentId, 'PAID')
  })

  afterEach(async () => {
    // Cleanup: delete the service request (cascades to PaymentRecord + events)
    if (serviceRequestId) {
      await db.serviceRequest.delete({ where: { id: serviceRequestId } }).catch(() => {})
    }
    if (clientUserId) {
      await db.user.delete({ where: { id: clientUserId } }).catch(() => {})
    }
  })

  test('1. webhook with invalid signature returns processed=false', async () => {
    const body = signedWebhook.body
    const result = await processWebhook(body, 'sha256=invalid_signature_xyz', signedWebhook.headers)
    expect(result.processed).toBe(false)
    expect(result.reason).toContain('Signature')
  })

  test('2. webhook with missing signature returns processed=false', async () => {
    const result = await processWebhook(signedWebhook.body, '', signedWebhook.headers)
    expect(result.processed).toBe(false)
    expect(result.reason).toContain('Signature')
  })

  test('3. duplicate webhook (same signature) returns processed=false with reason containing "Duplicate"', async () => {
    // First call: should succeed (transition PENDING → PAID)
    const first = await processWebhook(signedWebhook.body, signedWebhook.signature, signedWebhook.headers)
    expect(first.processed).toBe(true)

    // Second call with same signature: idempotent skip
    const second = await processWebhook(signedWebhook.body, signedWebhook.signature, signedWebhook.headers)
    expect(second.processed).toBe(false)
    expect(second.reason).toContain('Duplicate')
  })

  test('4. unknown webhook event returns processed=false (parse error or unknown event reason)', async () => {
    // SimulatedGateway.parseWebhookEvent throws on invalid events.
    // Build a webhook with a non-standard event name, signed with our secret.
    const body = JSON.stringify({ provider: 'simulated', providerPaymentId, event: 'NOT_A_REAL_EVENT' })
    const sig = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`
    const headers = { 'x-helpbibi-signature': sig, 'content-type': 'application/json' }

    // processWebhook will throw because parseWebhookEvent rejects unknown events.
    // We assert that it does NOT process successfully.
    let processed = true
    let reason = ''
    try {
      const result = await processWebhook(body, sig, headers)
      processed = result.processed
      reason = result.reason
    } catch (e: any) {
      processed = false
      reason = e.message
    }
    expect(processed).toBe(false)
    // Reason should reference an invalid/unknown event
    expect(reason.toLowerCase()).toMatch(/invalid|unknown|event/)
  })
})
