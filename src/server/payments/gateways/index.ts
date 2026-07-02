// Help Bibi — Gateway Factory
import type { PaymentGateway, GatewayProvider } from './payment-gateway'
import { getSimulatedGateway } from './simulated-gateway'
export type { PaymentGateway, GatewayProvider, GatewayPaymentMethod, GatewayWebhookEvent } from './payment-gateway'
export { mapToGatewayMethod, mapGatewayStatus } from './payment-gateway'

export function getActiveProvider(): GatewayProvider {
  const env = (process.env.PAYMENT_GATEWAY_PROVIDER || 'simulated').toLowerCase() as GatewayProvider
  const supported: GatewayProvider[] = ['simulated','mercado_pago','stripe','pagarme']
  if (!supported.includes(env)) { console.warn(`[gateway] Unsupported "${env}", fallback simulated`); return 'simulated' }
  return env
}
export function getPaymentGateway(): PaymentGateway {
  switch (getActiveProvider()) {
    case 'simulated': return getSimulatedGateway()
    case 'mercado_pago': throw new Error('MERCADO_PAGO_ACCESS_TOKEN or MERCADO_PAGO_WEBHOOK_SECRET not set. Use simulated.')
    case 'stripe': throw new Error('Stripe not implemented. Use simulated or mercado_pago.')
    case 'pagarme': throw new Error('PagarMe not implemented. Use simulated or mercado_pago.')
    default: return getSimulatedGateway()
  }
}
export function isRealGatewayActive(): boolean { return getActiveProvider() !== 'simulated' }
