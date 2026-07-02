// Help Bibi — Payment State Machine
export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELED' | 'REFUNDED'
export type PaymentEventType = 'CREATED' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELED' | 'REFUNDED' | 'RETRY'
export type PaymentTransition = { from: PaymentStatus; to: PaymentStatus; eventType: PaymentEventType }

const VALID_TRANSITIONS: PaymentTransition[] = [
  { from:'PENDING', to:'AUTHORIZED', eventType:'AUTHORIZED' }, { from:'PENDING', to:'PAID', eventType:'PAID' },
  { from:'PENDING', to:'FAILED', eventType:'FAILED' }, { from:'PENDING', to:'CANCELED', eventType:'CANCELED' },
  { from:'AUTHORIZED', to:'PAID', eventType:'PAID' }, { from:'AUTHORIZED', to:'FAILED', eventType:'FAILED' }, { from:'AUTHORIZED', to:'CANCELED', eventType:'CANCELED' },
  { from:'FAILED', to:'PENDING', eventType:'RETRY' }, { from:'FAILED', to:'AUTHORIZED', eventType:'AUTHORIZED' }, { from:'FAILED', to:'CANCELED', eventType:'CANCELED' },
  { from:'PAID', to:'REFUNDED', eventType:'REFUNDED' },
]

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean { return VALID_TRANSITIONS.some(t => t.from===from && t.to===to) }
export function getEventType(from: PaymentStatus, to: PaymentStatus): PaymentEventType | null { const t = VALID_TRANSITIONS.find(t => t.from===from && t.to===to); return t ? t.eventType : null }
export function isTerminalStatus(s: PaymentStatus): boolean { return s==='CANCELED' || s==='REFUNDED' }
export function isPaidLike(s: PaymentStatus): boolean { return s==='PAID' || s==='AUTHORIZED' }
export function canRetry(s: PaymentStatus): boolean { return s==='FAILED' }
export function validateTransition(from: PaymentStatus | undefined | null, to: PaymentStatus): { valid: boolean; eventType?: PaymentEventType; message: string } {
  if (!from) { if (to==='PENDING') return { valid:true, eventType:'CREATED', message:'Payment created' }; return { valid:false, message:`Invalid initial status: ${to}` } }
  if (from===to) return { valid:false, message:`No-op: already ${to}` }
  const et = getEventType(from, to); if (!et) return { valid:false, message:`Invalid: ${from} → ${to}` }
  return { valid:true, eventType:et, message:`${from} → ${to}` }
}
export function toCents(brl: number): number { return Math.round((brl + Number.EPSILON) * 100) }
export function fromCents(cents: number): number { return Math.round((cents / 100 + Number.EPSILON) * 100) / 100 }
export function generateIdempotencyKey(op: string, svcId: string): string { return `${op}_${svcId.slice(-12)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}` }
export function generateSimulatedTransactionId(svcId: string): string { return `SIM_${svcId.slice(-12).toUpperCase()}_${Date.now().toString(36)}` }
export function generateExternalReference(svcId: string): string { return `HB-${svcId.slice(-12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}` }
