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
    // FASE 29: map action to event type
    const action = (b.action || '').toLowerCase()
    let event: GatewayWebhookEvent['event']
    if (action.includes('authorized')) event = 'AUTHORIZED'
    else if (action.includes('approved') || action.includes('paid') || action.includes('payment_created')) event = 'PAID'
    else if (action.includes('rejected') || action.includes('failure')) event = 'FAILED'
    else if (action.includes('cancelled') || action.includes('canceled')) event = 'CANCELED'
    else if (action.includes('refunded')) event = 'REFUNDED'
    else event = 'AUTHORIZED' // default to AUTHORIZED for unknown actions (safe fallback — admin reviews)
    return { event, providerPaymentId:String(pid), message:`MP webhook: ${b.action||'updated'}`, rawPayload: sanitize({ provider:'mercado_pago', webhookId:b.id, action:b.action, paymentId:String(pid) }) }
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
