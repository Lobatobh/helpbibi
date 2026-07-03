// Help Bibi — Mercado Pago Webhook Mapping tests (FASE 29.1 SECURE)
// Validates that parseWebhookEvent NEVER auto-approves from action alone.
// All webhooks return WEBHOOK_RECEIVED (no state change) because MP webhooks
// do not contain the payment status — only the API does.
import { describe, test, expect } from 'bun:test'
import { MercadoPagoGateway } from '../mercado-pago-gateway'

const gw = new MercadoPagoGateway('test_token', 'test_webhook_secret')

const makeBody = (action: string, paymentId: string | number = 'pay_123', webhookId: string = 'wh_abc') =>
  JSON.stringify({ data: { id: paymentId }, action, id: webhookId })

describe('mercado-pago-webhook-mapping — SECURE (FASE 29.1)', () => {
  test('1. action "payment.created" → WEBHOOK_RECEIVED (NOT PAID)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('payment.created'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
    expect(ev.event).not.toBe('PAID')
  })

  test('2. action "payment.updated" → WEBHOOK_RECEIVED (NOT PAID)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('payment.updated'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
    expect(ev.event).not.toBe('PAID')
  })

  test('3. action "approved" → WEBHOOK_RECEIVED (NOT PAID — status needs API lookup)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('approved'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
    // MP webhook action "approved" does NOT guarantee payment is approved — must verify via API
    expect(ev.event).not.toBe('PAID')
  })

  test('4. action "authorized" → WEBHOOK_RECEIVED (NOT AUTHORIZED)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('authorized'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
    expect(ev.event).not.toBe('AUTHORIZED')
  })

  test('5. action "rejected" → WEBHOOK_RECEIVED (NOT FAILED)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('rejected'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
    expect(ev.event).not.toBe('FAILED')
  })

  test('6. action "cancelled" → WEBHOOK_RECEIVED (NOT CANCELED)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('cancelled'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
    expect(ev.event).not.toBe('CANCELED')
  })

  test('7. action "refunded" → WEBHOOK_RECEIVED (NOT REFUNDED)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('refunded'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
    expect(ev.event).not.toBe('REFUNDED')
  })

  test('8. unknown action → WEBHOOK_RECEIVED (NOT AUTHORIZED — no unsafe fallback)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('totally_unknown_action'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
    expect(ev.event).not.toBe('AUTHORIZED')
  })

  test('9. empty action → WEBHOOK_RECEIVED', async () => {
    const ev = await gw.parseWebhookEvent(makeBody(''), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
  })

  test('10. invalid JSON throws', () => {
    expect(gw.parseWebhookEvent('not json', {})).rejects.toThrow(/Invalid JSON/)
  })

  test('11. missing data.id throws', () => {
    expect(gw.parseWebhookEvent(JSON.stringify({ action: 'approved' }), {})).rejects.toThrow(/Missing data.id/)
  })

  test('12. providerPaymentId is extracted as string', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('approved', 'pay_999', 'wh_unique_42'), {})
    expect(ev.providerPaymentId).toBe('pay_999')
  })

  test('13. action value is included in message', async () => {
    const action = 'approved'
    const ev = await gw.parseWebhookEvent(makeBody(action), {})
    expect(ev.message).toContain(action)
  })

  test('14. rawPayload includes provider, webhookId, action, paymentId', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('rejected', 'pay_555', 'wh_xyz'), {})
    expect(ev.rawPayload.provider).toBe('mercado_pago')
    expect(ev.rawPayload.webhookId).toBe('wh_xyz')
    expect(ev.rawPayload.action).toBe('rejected')
    expect(ev.rawPayload.paymentId).toBe('pay_555')
  })

  test('15. rawPayload includes needsStatusLookup flag', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('approved'), {})
    expect(ev.rawPayload.needsStatusLookup).toBe(true)
  })

  test('16. numeric paymentId converted to string', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('approved', 1234567890123), {})
    expect(typeof ev.providerPaymentId).toBe('string')
    expect(ev.providerPaymentId).toBe('1234567890123')
  })

  test('17. rawPayload is sanitized (no card_number/cvv/security_code)', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('approved'), {})
    expect(ev.rawPayload.card_number).toBeUndefined()
    expect(ev.rawPayload.card_cvv).toBeUndefined()
    expect(ev.rawPayload.security_code).toBeUndefined()
  })

  test('18. action "canceled" (American spelling) → WEBHOOK_RECEIVED', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('canceled'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
  })

  test('19. action "failure" → WEBHOOK_RECEIVED', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('failure'), {})
    expect(ev.event).toBe('WEBHOOK_RECEIVED')
  })

  test('20. message indicates needs API lookup', async () => {
    const ev = await gw.parseWebhookEvent(makeBody('approved'), {})
    expect(ev.message.toLowerCase()).toContain('needs api lookup')
  })
})

describe('mercado-pago — getPaymentStatus (FASE 29.1)', () => {
  test('21. getPaymentStatus returns null without real credentials', async () => {
    const status = await gw.getPaymentStatus('pay_123')
    expect(status).toBe(null)
  })

  test('22. getPaymentStatus is a function', () => {
    expect(typeof gw.getPaymentStatus).toBe('function')
  })
})

describe('mercado-pago — cancel/refund stubs (FASE 29.1)', () => {
  test('23. cancelPayment throws controlled error (not implemented)', async () => {
    expect(gw.cancelPayment('pay_123', 'test')).rejects.toThrow(/Requires MP API/)
  })

  test('24. refundPayment throws controlled error (not implemented)', async () => {
    expect(gw.refundPayment({ providerPaymentId: 'pay_123', amount: 100 })).rejects.toThrow(/Requires MP API/)
  })

  test('25. authorizePayment throws controlled error (not implemented)', async () => {
    expect(gw.authorizePayment('pay_123')).rejects.toThrow(/Requires MP API/)
  })

  test('26. capturePayment throws controlled error (not implemented)', async () => {
    expect(gw.capturePayment('pay_123')).rejects.toThrow(/Requires MP API/)
  })
})
