// Help Bibi — Simulated Gateway
import { createHmac, timingSafeEqual } from 'crypto'
import type { PaymentGateway, GatewayProvider, GatewayPaymentIntent, GatewayWebhookEvent, GatewayWebhookVerification, GatewayCreateIntentInput, GatewayRefundInput } from './payment-gateway'

const generateId = (p: string): string => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`
const generateExtRef = (svcId: string): string => `HB-${svcId.slice(-12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
const sign = (body: string, secret: string): string => { const h = createHmac('sha256', secret); h.update(body); return `sha256=${h.digest('hex')}` }
const verify = (body: string, sig: string, secret: string): boolean => { try { const e = sign(body, secret); const a = Buffer.from(e); const b = Buffer.from(sig); return a.length===b.length && timingSafeEqual(a, b) } catch { return false } }

export class SimulatedGateway implements PaymentGateway {
  readonly provider: GatewayProvider = 'simulated'
  private webhookSecret: string
  constructor(secret: string) { if (!secret) throw new Error('SimulatedGateway requires webhook secret'); this.webhookSecret = secret }

  async createPaymentIntent(input: GatewayCreateIntentInput): Promise<GatewayPaymentIntent> {
    const providerPaymentId = generateId('pay'); const externalReference = generateExtRef(input.serviceRequestId); const idempotencyKey = generateId('idem'); const method = input.method
    const methodData: Record<string, any> = {}
    if (method === 'PIX') { methodData.qrCode = `00020126360014BR.GOV.BCB.PIX0114helpbibi@sim5204000053039865802BR5913HELP BIBI SIM6009SAO PAULO6304SIM${externalReference.slice(-6)}${Math.round(input.amount*100)}`; methodData.qrCodeImage = 'data:image/svg+xml;base64,PHN2Zz4='; methodData.expiresAt = new Date(Date.now()+30*60*1000).toISOString() }
    else if (method === 'CARD') { methodData.clientSecret = generateId('cs'); methodData.requires3ds = false }
    else if (method === 'CASH') { methodData.instructions = 'Pagamento em dinheiro ao prestador na conclusão do serviço' }
    const rawPayload: Record<string, any> = { provider:'simulated', providerPaymentId, externalReference, method, amount:input.amount, platformFee:input.platformFee, providerPayout:input.providerPayout, discountAmount:input.discountAmount, couponCode:input.couponCode||null, status:'PENDING', createdAt:new Date().toISOString(), amountCents:Math.round(input.amount*100), platformFeeCents:Math.round(input.platformFee*100), providerPayoutCents:Math.round(input.providerPayout*100) }
    return { providerPaymentId, externalReference, idempotencyKey, status:'PENDING', methodData, rawPayload }
  }
  async authorizePayment(id: string): Promise<GatewayPaymentIntent> { return { providerPaymentId:id, externalReference:`HB-SIM-${id.slice(-8)}`, idempotencyKey:generateId('idem'), status:'AUTHORIZED', rawPayload:{provider:'simulated',providerPaymentId:id,status:'AUTHORIZED'} } }
  async capturePayment(id: string): Promise<GatewayPaymentIntent> { return { providerPaymentId:id, externalReference:`HB-SIM-${id.slice(-8)}`, idempotencyKey:generateId('idem'), status:'PAID', rawPayload:{provider:'simulated',providerPaymentId:id,status:'PAID'} } }
  async cancelPayment(id: string, reason?: string): Promise<GatewayPaymentIntent> { return { providerPaymentId:id, externalReference:`HB-SIM-${id.slice(-8)}`, idempotencyKey:generateId('idem'), status:'CANCELED', rawPayload:{provider:'simulated',providerPaymentId:id,status:'CANCELED',reason} } }
  async refundPayment(input: GatewayRefundInput): Promise<GatewayPaymentIntent> { return { providerPaymentId:input.providerPaymentId, externalReference:`HB-SIM-${input.providerPaymentId.slice(-8)}`, idempotencyKey:generateId('idem'), status:'REFUNDED', rawPayload:{provider:'simulated',providerPaymentId:input.providerPaymentId,status:'REFUNDED',amount:input.amount} } }
  async parseWebhookEvent(rawBody: string, _h: Record<string,string>): Promise<GatewayWebhookEvent> { let b:any; try { b=JSON.parse(rawBody) } catch { throw new Error('Invalid JSON') } const valid=['AUTHORIZED','PAID','FAILED','CANCELED','REFUNDED']; if (!b.event||!valid.includes(b.event)) throw new Error(`Invalid event: ${b.event}`); if (!b.providerPaymentId&&!b.externalReference) throw new Error('Missing providerPaymentId/externalReference'); return { event:b.event, providerPaymentId:b.providerPaymentId, externalReference:b.externalReference, message:b.message||`Webhook: ${b.event}`, rawPayload:b } }
  async verifyWebhookSignature(rawBody: string, signature: string, _o?: any): Promise<GatewayWebhookVerification> { if (!signature) return { valid:false, reason:'Missing signature' }; return verify(rawBody, signature, this.webhookSecret) ? { valid:true } : { valid:false, reason:'Signature mismatch' } }
  async generateSignedWebhook(providerPaymentId: string, event: GatewayWebhookEvent['event'], message?: string): Promise<{ body: string; signature: string; headers: Record<string,string> }> { const body = JSON.stringify({ provider:'simulated', providerPaymentId, event, message:message||`Simulated: ${event}`, timestamp:new Date().toISOString() }); const signature = sign(body, this.webhookSecret); return { body, signature, headers:{ 'x-helpbibi-signature':signature, 'x-helpbibi-provider':'simulated', 'content-type':'application/json' } } }
}

let cached: SimulatedGateway | null = null
export function getSimulatedGateway(): SimulatedGateway { if (!cached) cached = new SimulatedGateway(process.env.PAYMENT_WEBHOOK_SECRET || 'dev_webhook_secret_change_me'); return cached }
