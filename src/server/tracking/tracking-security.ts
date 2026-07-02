// Help Bibi — Tracking Security helpers (FASE 25.4)
// Pure utility functions that enforce the public-tracking visibility rules:
// no financial fields, no payment identifiers, no sensitive client/payment labels.

export const FORBIDDEN_FIELDS = [
  'price', 'originalPrice', 'discount', 'platformFee', 'providerPayout',
  'paymentStatus', 'paymentMethod', 'paymentRecords', 'couponCode',
  'providerPaymentId', 'externalReference', 'idempotencyKey', 'simulatedTransactionId',
  'failureReason', 'lastWebhookSignature', 'webhookVerifiedAt', 'paidAt', 'failedAt',
] as const

export const FORBIDDEN_KW = [
  'cupom', 'desconto', 'r$', 'pagamento', 'pix', 'cartão', 'cartao',
  'dinheiro', 'webhook', 'taxa da plataforma', 'repasse',
] as const

export function isForbiddenField(field: string): boolean {
  return (FORBIDDEN_FIELDS as readonly string[]).includes(field)
}

export function containsForbiddenKeyword(text: string): boolean {
  const lower = text.toLowerCase()
  return (FORBIDDEN_KW as readonly string[]).some((kw) => lower.includes(kw))
}

export function roundCoords(value: number, decimals: number = 3): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function sanitizeTrackingObject<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (isForbiddenField(k)) continue
    out[k] = v
  }
  return out as Partial<T>
}
