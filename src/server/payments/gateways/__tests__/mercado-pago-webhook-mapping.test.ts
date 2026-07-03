// Help Bibi — Mercado Pago Webhook Action→Event Mapping tests (FASE 29)
// Validates the FASE 29 fix to parseWebhookEvent that maps the `action` field
// to the proper event type (AUTHORIZED / PAID / FAILED / CANCELED / REFUNDED)
// instead of always returning AUTHORIZED.
import { describe, test, expect } from 'bun:test'
import { MercadoPagoGateway } from '@/server/payments/gateways/mercado-pago-gateway'

const TOKEN = 'MP_TEST_TOKEN_12345'
const WH_SECRET = 'mp_webhook_secret_67890'

const makeBody = (action: string, paymentId: string | number = 'pay_123', webhookId: string = 'wh_abc') =>
  JSON.stringify({ data: { id: paymentId }, action, id: webhookId })

describe('mercado-pago-webhook-mapping — action → event (FASE 29 fix)', () => {
  test('1. action "payment_created" → PAID', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('payment_created'), {})
    expect(ev.event).toBe('PAID')
  })

  test('2. action "authorized" → AUTHORIZED', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('authorized'), {})
    expect(ev.event).toBe('AUTHORIZED')
  })

  test('3. action "approved" → PAID', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('approved'), {})
    expect(ev.event).toBe('PAID')
  })

  test('4. action "rejected" → FAILED', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('rejected'), {})
    expect(ev.event).toBe('FAILED')
  })

  test('5. action "cancelled" → CANCELED', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('cancelled'), {})
    expect(ev.event).toBe('CANCELED')
  })

  test('6. action "refunded" → REFUNDED', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('refunded'), {})
    expect(ev.event).toBe('REFUNDED')
  })

  test('7. unknown action → AUTHORIZED (safe fallback for admin review)', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('something_strange'), {})
    expect(ev.event).toBe('AUTHORIZED')
  })

  test('8. invalid JSON throws', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    expect(gw.parseWebhookEvent('not valid json', {})).rejects.toThrow(/Invalid JSON/)
  })

  test('9. missing data.id throws', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    expect(gw.parseWebhookEvent(JSON.stringify({ action: 'approved' }), {})).rejects.toThrow(/Missing data.id/)
  })

  test('10. webhookId extracted from body into rawPayload', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('approved', 'pay_999', 'wh_unique_42'), {})
    expect(ev.rawPayload.webhookId).toBe('wh_unique_42')
  })

  test('11. action value is included in message', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const action = 'approved'
    const ev = await gw.parseWebhookEvent(makeBody(action), {})
    expect(ev.message).toContain(action)
  })

  test('12. rawPayload is sanitized — no card_number / cvv / security_code', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const body = JSON.stringify({
      data: { id: 'pay_sanitize' },
      action: 'approved',
      card_number: '4111111111111111',
      card_cvv: '123',
      card_exp_month: '12',
      card_exp_year: '2030',
      security_code: '456',
    })
    const ev = await gw.parseWebhookEvent(body, {})
    expect(ev.rawPayload.card_number).toBeUndefined()
    expect(ev.rawPayload.card_cvv).toBeUndefined()
    expect(ev.rawPayload.card_exp_month).toBeUndefined()
    expect(ev.rawPayload.card_exp_year).toBeUndefined()
    expect(ev.rawPayload.security_code).toBeUndefined()
    // The raw string should also not contain these sensitive values
    const rawStr = JSON.stringify(ev.rawPayload)
    expect(rawStr).not.toContain('4111111111111111')
    expect(rawStr).not.toContain('card_number')
    expect(rawStr).not.toContain('cvv')
    expect(rawStr).not.toContain('security_code')
  })

  test('13. providerPaymentId is extracted as string from data.id (numeric)', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('approved', 1234567890123), {})
    expect(ev.providerPaymentId).toBe('1234567890123')
    expect(typeof ev.providerPaymentId).toBe('string')
  })

  test('14. rawPayload includes provider, webhookId, action, paymentId', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('rejected', 'pay_xyz', 'wh_42'), {})
    expect(ev.rawPayload.provider).toBe('mercado_pago')
    expect(ev.rawPayload.webhookId).toBe('wh_42')
    expect(ev.rawPayload.action).toBe('rejected')
    expect(ev.rawPayload.paymentId).toBe('pay_xyz')
  })

  test('15. action "canceled" (American spelling) → CANCELED', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('canceled'), {})
    expect(ev.event).toBe('CANCELED')
  })

  test('16. action "failure" → FAILED', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('payment.failure'), {})
    expect(ev.event).toBe('FAILED')
  })

  test('17. action "paid" → PAID', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('paid'), {})
    expect(ev.event).toBe('PAID')
  })

  test('18. empty action → AUTHORIZED (safe fallback)', async () => {
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody(''), {})
    expect(ev.event).toBe('AUTHORIZED')
  })

  test('19. action "charged_back" is not refunded (not in map) — falls back to AUTHORIZED', async () => {
    // Note: the FASE 29 parseWebhookEvent maps via `action` field (string includes).
    // "charged_back" does not contain "refunded", so it falls back to AUTHORIZED.
    // The MP_STATUS_MAP (used for status field) maps charged_back→REFUNDED but that's
    // a separate code path. The webhook action mapping does NOT include charged_back.
    const gw = new MercadoPagoGateway(TOKEN, WH_SECRET)
    const ev = await gw.parseWebhookEvent(makeBody('charged_back'), {})
    expect(ev.event).toBe('AUTHORIZED')
  })
})
