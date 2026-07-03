// Help Bibi — Mercado Pago Gateway (adapter, pendente homologação real)
import { createHmac, timingSafeEqual } from 'crypto'
import type { PaymentGateway, GatewayProvider, GatewayPaymentIntent, GatewayWebhookEvent, GatewayWebhookVerification, GatewayCreateIntentInput, GatewayRefundInput } from './payment-gateway'
import type { PaymentStatus } from '../payment-state-machine'

const MP_STATUS_MAP: Record<string, PaymentStatus> = { pending:'PENDING', in_process:'PENDING', authorized:'AUTHORIZED', approved:'PAID', rejected:'FAILED', cancelled:'CANCELED', refunded:'REFUNDED', charged_back:'REFUNDED' }
const sanitize = (o: Record<string,any>): Record<string, any> => { const { card_number, card_cvv, card_exp_month, card_exp_year, security_code, ...safe } = o; return safe }

export class MercadoPagoGateway implements PaymentGateway {
  readonly provider: GatewayProvider = 'mercado_pago'
  private webhookSecret: string; private accessToken: string
  constructor(accessToken: string, webhookSecret: string) {
    if (!accessToken) throw new Error('MercadoPagoGateway requires MERCADO_PAGO_ACCESS_TOKEN')
    if (!webhookSecret) throw new Error('MercadoPagoGateway requires MERCADO_PAGO_WEBHOOK_SECRET')
    this.accessToken = accessToken; this.webhookSecret = webhookSecret
  }
  async createPaymentIntent(input: GatewayCreateIntentInput): Promise<GatewayPaymentIntent> {
    if (input.method === 'CASH') return { providerPaymentId:`mp_cash_${input.serviceRequestId.slice(-12)}`, externalReference:`HB-${input.serviceRequestId.slice(-12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`, idempotencyKey:`mp_idem_${Date.now().toString(36)}`, status:'PENDING', methodData:{instructions:'Cash'}, rawPayload:{provider:'mercado_pago',method:'CASH',note:'Cash payment'} }
    throw new Error('Mercado Pago API calls require real credentials (not available in this environment)')
  }
  async authorizePayment(id: string): Promise<GatewayPaymentIntent> { throw new Error('Requires MP API') }
  async capturePayment(id: string): Promise<GatewayPaymentIntent> { throw new Error('Requires MP API') }
  async cancelPayment(id: string, reason?: string): Promise<GatewayPaymentIntent> { throw new Error('Requires MP API') }
  async refundPayment(input: GatewayRefundInput): Promise<GatewayPaymentIntent> { throw new Error('Requires MP API') }
  async parseWebhookEvent(rawBody: string, _h: Record<string,string>): Promise<GatewayWebhookEvent> {
    let b: any; try { b = JSON.parse(rawBody) } catch { throw new Error('Invalid JSON') }
    const pid = b?.data?.id; if (!pid) throw new Error('Missing data.id')
    // FASE 29.1: SECURE webhook mapping — never auto-approve from action alone.
    // MP webhooks contain action (e.g. "payment.created", "payment.updated") but NOT the payment status.
    // The only way to know the real status is to call the MP API: GET /v1/payments/{id}
    // Until sandbox credentials are available, we return WEBHOOK_RECEIVED (no state change).
    // The reconciliation process or admin will fetch the real status separately.
    const action = (b.action || '').toLowerCase()
    return {
      event: 'WEBHOOK_RECEIVED',
      providerPaymentId: String(pid),
      message: `MP webhook received: ${b.action || 'unknown'} (status not in payload — needs API lookup)`,
      rawPayload: sanitize({ provider: 'mercado_pago', webhookId: b.id, action: b.action, paymentId: String(pid), needsStatusLookup: true }),
    }
  }

  /**
   * FASE 29.1: Fetch the real payment status from Mercado Pago API.
   * Requires a valid access token. In sandbox/dev without credentials, returns null.
   *
   * Production flow:
   *   1. Webhook received → parseWebhookEvent returns WEBHOOK_RECEIVED (no state change)
   *   2. processWebhook calls getPaymentStatus(providerPaymentId) to fetch real status
   *   3. If status found, transition PaymentRecord accordingly
   *   4. If status not available (no credentials), mark as needs_reconciliation
   *
   * @returns PaymentStatus | null (null = cannot determine, needs reconciliation)
   */
  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus | null> {
    // Without a real access token (sandbox), we cannot call the MP API.
    // In production with real credentials, this would do:
    //   const response = await fetch(`https://api.mercadopago.com/v1/payments/${providerPaymentId}`, {
    //     headers: { Authorization: `Bearer ${this.accessToken}` }
    //   })
    //   const data = await response.json()
    //   return MP_STATUS_MAP[data.status] || null
    //
    // For now, return null to indicate "needs reconciliation" — the caller should
    // log a PaymentEvent and flag the record for manual/admin review.
    if (!this.accessToken || this.accessToken.startsWith('test_') === false) {
      // Dev/test: no real API call
      return null
    }
    // Production with real token: TODO implement actual API call when sandbox credentials available
    return null
  }
  async verifyWebhookSignature(rawBody: string, signature: string, options?: { dataId?: string; requestId?: string }): Promise<GatewayWebhookVerification> {
    if (!signature) return { valid:false, reason:'Missing x-signature' }
    try {
      const parts = signature.split(',').reduce((a,p)=>{ const [k,v]=p.split('='); if(k&&v) a[k.trim()]=v.trim(); return a }, {} as Record<string,string>)
      const ts = parts['ts']; const v1 = parts['v1']; if (!ts||!v1) return { valid:false, reason:'Invalid format' }
      let dataId = options?.dataId||''; if (!dataId) { try { dataId = JSON.parse(rawBody)?.data?.id||'' } catch {} }
      if (dataId) dataId = dataId.toLowerCase()
      const reqId = options?.requestId||''
      const manifestParts: string[] = []
      if (dataId) manifestParts.push(`id:${dataId}`); if (reqId) manifestParts.push(`request-id:${reqId}`)
      manifestParts.push(`ts:${ts}`)
      const manifest = manifestParts.join(';')+';'
      const hmac = createHmac('sha256', this.webhookSecret).update(manifest).digest('hex')
      const a = Buffer.from(hmac); const b = Buffer.from(v1)
      if (a.length !== b.length) return { valid:false, reason:'Length mismatch' }
      if (!timingSafeEqual(a, b)) return { valid:false, reason:'Mismatch' }
      return { valid:true }
    } catch (e: any) { return { valid:false, reason:`Error: ${e.message}` } }
  }
}

let cached: MercadoPagoGateway | null = null
export function getMercadoPagoGateway(): MercadoPagoGateway {
  if (!cached) { const t = process.env.MERCADO_PAGO_ACCESS_TOKEN; const s = process.env.MERCADO_PAGO_WEBHOOK_SECRET; if (!t||!s) throw new Error('MERCADO_PAGO_ACCESS_TOKEN or MERCADO_PAGO_WEBHOOK_SECRET not set'); cached = new MercadoPagoGateway(t, s) }
  return cached
}
export function isMercadoPagoConfigured(): boolean { return !!(process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_WEBHOOK_SECRET) }
