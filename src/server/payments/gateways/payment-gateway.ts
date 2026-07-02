// Help Bibi — Payment Gateway Contract
import type { PaymentStatus } from '../payment-state-machine'
export type GatewayProvider = 'simulated' | 'mercado_pago' | 'stripe' | 'pagarme'
export type GatewayPaymentMethod = 'PIX' | 'CARD' | 'CASH'
export type GatewayPaymentStatus = 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELED' | 'REFUNDED'
export type GatewayPaymentIntent = { providerPaymentId: string; externalReference: string; idempotencyKey: string; status: GatewayPaymentStatus; methodData?: Record<string, any>; rawPayload: Record<string, any> }
export type GatewayWebhookEvent = { event: 'AUTHORIZED'|'PAID'|'FAILED'|'CANCELED'|'REFUNDED'; providerPaymentId?: string; externalReference?: string; message: string; rawPayload: Record<string, any> }
export type GatewayWebhookVerification = { valid: boolean; reason?: string }
export type GatewayCreateIntentInput = { serviceRequestId: string; method: GatewayPaymentMethod; amount: number; platformFee: number; providerPayout: number; discountAmount: number; couponCode?: string | null; simulateOutcome?: 'success'|'failure' }
export type GatewayRefundInput = { providerPaymentId: string; amount?: number; reason?: string }

export interface PaymentGateway {
  readonly provider: GatewayProvider
  createPaymentIntent(input: GatewayCreateIntentInput): Promise<GatewayPaymentIntent>
  authorizePayment(providerPaymentId: string): Promise<GatewayPaymentIntent>
  capturePayment(providerPaymentId: string): Promise<GatewayPaymentIntent>
  cancelPayment(providerPaymentId: string, reason?: string): Promise<GatewayPaymentIntent>
  refundPayment(input: GatewayRefundInput): Promise<GatewayPaymentIntent>
  parseWebhookEvent(rawBody: string, headers: Record<string, string>): Promise<GatewayWebhookEvent>
  verifyWebhookSignature(rawBody: string, signature: string, options?: { dataId?: string; requestId?: string }): Promise<GatewayWebhookVerification>
  generateSignedWebhook?(providerPaymentId: string, event: GatewayWebhookEvent['event'], message?: string): Promise<{ body: string; signature: string; headers: Record<string, string> }>
}
export function mapGatewayStatus(s: GatewayPaymentStatus): PaymentStatus { return s }
export function mapToGatewayMethod(m: string): GatewayPaymentMethod { const u=m.toUpperCase(); return u==='PIX'||u==='CARD'||u==='CASH'?u:'PIX' }
