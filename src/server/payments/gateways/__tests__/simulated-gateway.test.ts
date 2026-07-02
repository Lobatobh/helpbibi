// Help Bibi — Simulated Gateway tests (FASE 25.4)
import { describe, test, expect } from 'bun:test'
import { SimulatedGateway } from '@/server/payments/gateways/simulated-gateway'
import type { GatewayCreateIntentInput } from '@/server/payments/gateways/payment-gateway'

const SECRET = 'test_webhook_secret_12345'

const baseInput = (overrides: Partial<GatewayCreateIntentInput> = {}): GatewayCreateIntentInput => ({
  serviceRequestId: 'svc_abc123def456',
  method: 'PIX',
  amount: 100,
  platformFee: 20,
  providerPayout: 80,
  discountAmount: 0,
  couponCode: null,
  ...overrides,
})

describe('SimulatedGateway — constructor', () => {
  test('1. constructor throws without webhook secret', () => {
    expect(() => new SimulatedGateway('')).toThrow(/secret/i)
    expect(() => new SimulatedGateway(undefined as any)).toThrow(/secret/i)
  })
})

describe('SimulatedGateway — createPaymentIntent', () => {
  test('2. returns PENDING with providerPaymentId/externalReference/idempotencyKey', async () => {
    const gw = new SimulatedGateway(SECRET)
    const intent = await gw.createPaymentIntent(baseInput())
    expect(intent.status).toBe('PENDING')
    expect(intent.providerPaymentId).toBeTruthy()
    expect(intent.externalReference).toBeTruthy()
    expect(intent.idempotencyKey).toBeTruthy()
    expect(intent.rawPayload).toBeDefined()
  })

  test('3. PIX methodData has qrCode', async () => {
    const gw = new SimulatedGateway(SECRET)
    const intent = await gw.createPaymentIntent(baseInput({ method: 'PIX' }))
    expect(intent.methodData).toBeDefined()
    expect(intent.methodData!.qrCode).toBeTruthy()
    expect(typeof intent.methodData!.qrCode).toBe('string')
  })

  test('4. CARD methodData has clientSecret', async () => {
    const gw = new SimulatedGateway(SECRET)
    const intent = await gw.createPaymentIntent(baseInput({ method: 'CARD' }))
    expect(intent.methodData).toBeDefined()
    expect(intent.methodData!.clientSecret).toBeTruthy()
  })

  test('5. CASH methodData has instructions', async () => {
    const gw = new SimulatedGateway(SECRET)
    const intent = await gw.createPaymentIntent(baseInput({ method: 'CASH' }))
    expect(intent.methodData).toBeDefined()
    expect(intent.methodData!.instructions).toBeTruthy()
    expect(intent.methodData!.instructions.toLowerCase()).toContain('dinheiro')
  })
})

describe('SimulatedGateway — webhook signature', () => {
  test('6. generateSignedWebhook produces valid sha256 signature', async () => {
    const gw = new SimulatedGateway(SECRET)
    const { body, signature, headers } = await gw.generateSignedWebhook('pay_123', 'PAID')
    expect(signature).toMatch(/^sha256=/)
    expect(headers['x-helpbibi-signature']).toBe(signature)
    expect(body).toBeTruthy()
  })

  test('7. verifyWebhookSignature returns valid=true for matching signature', async () => {
    const gw = new SimulatedGateway(SECRET)
    const { body, signature } = await gw.generateSignedWebhook('pay_456', 'PAID')
    const result = await gw.verifyWebhookSignature(body, signature)
    expect(result.valid).toBe(true)
  })

  test('8. verifyWebhookSignature rejects invalid signature', async () => {
    const gw = new SimulatedGateway(SECRET)
    const { body } = await gw.generateSignedWebhook('pay_789', 'PAID')
    const result = await gw.verifyWebhookSignature(body, 'sha256=invalid')
    expect(result.valid).toBe(false)
  })

  test('9. verifyWebhookSignature rejects missing signature', async () => {
    const gw = new SimulatedGateway(SECRET)
    const result = await gw.verifyWebhookSignature('body', '')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Missing')
  })
})

describe('SimulatedGateway — parseWebhookEvent', () => {
  test('10. parseWebhookEvent: valid event extracts providerPaymentId; invalid event throws; missing id throws', async () => {
    const gw = new SimulatedGateway(SECRET)
    // valid PAID
    const ev = await gw.parseWebhookEvent(JSON.stringify({ event: 'PAID', providerPaymentId: 'pay_xyz', message: 'paid' }), {})
    expect(ev.event).toBe('PAID')
    expect(ev.providerPaymentId).toBe('pay_xyz')
    // invalid event throws
    expect(gw.parseWebhookEvent(JSON.stringify({ event: 'NOT_A_REAL_EVENT', providerPaymentId: 'pay_xyz' }), {})).rejects.toThrow(/Invalid event/)
    // missing id throws
    expect(gw.parseWebhookEvent(JSON.stringify({ event: 'PAID' }), {})).rejects.toThrow(/Missing providerPaymentId/)
  })
})
