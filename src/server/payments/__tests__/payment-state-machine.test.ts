// Help Bibi — Payment State Machine tests (FASE 25.4)
import { describe, test, expect } from 'bun:test'
import {
  canTransition, getEventType, isTerminalStatus, isPaidLike, canRetry, validateTransition,
  toCents, fromCents, generateIdempotencyKey, generateSimulatedTransactionId, generateExternalReference,
  type PaymentStatus,
} from '@/server/payments/payment-state-machine'

describe('payment-state-machine — canTransition', () => {
  test('1. all valid transitions return true', () => {
    const valid: Array<[PaymentStatus, PaymentStatus]> = [
      ['PENDING', 'AUTHORIZED'], ['PENDING', 'PAID'], ['PENDING', 'FAILED'], ['PENDING', 'CANCELED'],
      ['AUTHORIZED', 'PAID'], ['AUTHORIZED', 'FAILED'], ['AUTHORIZED', 'CANCELED'],
      ['FAILED', 'PENDING'], ['FAILED', 'AUTHORIZED'], ['FAILED', 'CANCELED'],
      ['PAID', 'REFUNDED'],
    ]
    for (const [from, to] of valid) {
      expect(canTransition(from, to)).toBe(true)
    }
  })

  test('2. invalid transitions return false (e.g. PAID→FAILED)', () => {
    const invalid: Array<[PaymentStatus, PaymentStatus]> = [
      ['PAID', 'FAILED'], ['PAID', 'PENDING'], ['PAID', 'CANCELED'],
      ['CANCELED', 'PAID'], ['CANCELED', 'REFUNDED'],
      ['REFUNDED', 'PAID'], ['REFUNDED', 'CANCELED'],
      ['PENDING', 'PENDING'],
    ]
    for (const [from, to] of invalid) {
      expect(canTransition(from, to)).toBe(false)
    }
  })
})

describe('payment-state-machine — status helpers', () => {
  test('3. isTerminalStatus: CANCELED and REFUNDED are terminal', () => {
    expect(isTerminalStatus('CANCELED')).toBe(true)
    expect(isTerminalStatus('REFUNDED')).toBe(true)
    expect(isTerminalStatus('PENDING')).toBe(false)
    expect(isTerminalStatus('PAID')).toBe(false)
    expect(isTerminalStatus('AUTHORIZED')).toBe(false)
    expect(isTerminalStatus('FAILED')).toBe(false)
  })

  test('4. isPaidLike: PAID and AUTHORIZED are paid-like', () => {
    expect(isPaidLike('PAID')).toBe(true)
    expect(isPaidLike('AUTHORIZED')).toBe(true)
    expect(isPaidLike('PENDING')).toBe(false)
    expect(isPaidLike('FAILED')).toBe(false)
    expect(isPaidLike('CANCELED')).toBe(false)
    expect(isPaidLike('REFUNDED')).toBe(false)
  })

  test('5. canRetry: only FAILED can retry', () => {
    expect(canRetry('FAILED')).toBe(true)
    expect(canRetry('PENDING')).toBe(false)
    expect(canRetry('PAID')).toBe(false)
    expect(canRetry('CANCELED')).toBe(false)
  })
})

describe('payment-state-machine — validateTransition', () => {
  test('6. validateTransition returns valid + eventType for valid transition', () => {
    const r = validateTransition('PENDING', 'PAID')
    expect(r.valid).toBe(true)
    expect(r.eventType).toBe('PAID')
  })

  test('7. validateTransition rejects no-op (same status)', () => {
    const r = validateTransition('PAID', 'PAID')
    expect(r.valid).toBe(false)
    expect(r.message).toContain('No-op')
  })

  test('8. validateTransition rejects null/undefined → non-PENDING', () => {
    const r = validateTransition(null, 'PAID')
    expect(r.valid).toBe(false)
    expect(r.message).toContain('Invalid initial')
  })

  test('9. validateTransition allows null/undefined → PENDING (CREATED)', () => {
    const r = validateTransition(undefined, 'PENDING')
    expect(r.valid).toBe(true)
    expect(r.eventType).toBe('CREATED')
  })

  test('10. getEventType returns null for invalid transition', () => {
    expect(getEventType('PAID', 'FAILED')).toBe(null)
    expect(getEventType('PENDING', 'PAID')).toBe('PAID')
  })
})

describe('payment-state-machine — money conversion', () => {
  test('11. toCents/fromCents round-trip preserves value', () => {
    const values = [0, 1, 12.34, 99.99, 1234.56, 0.5, 0.01]
    for (const v of values) {
      expect(fromCents(toCents(v))).toBe(v)
    }
  })
})

describe('payment-state-machine — id/keys generation', () => {
  test('12. generateIdempotencyKey format: op_svcIdSlice_ts_random', () => {
    const k = generateIdempotencyKey('pay', 'svc_abc123def456')
    expect(k.startsWith('pay_')).toBe(true)
    expect(k.split('_').length).toBe(4)
  })

  test('13. generateSimulatedTransactionId starts with SIM_', () => {
    const id = generateSimulatedTransactionId('svc_abc123def456')
    expect(id.startsWith('SIM_')).toBe(true)
  })

  test('14. generateExternalReference starts with HB-', () => {
    const ref = generateExternalReference('svc_abc123def456')
    expect(ref.startsWith('HB-')).toBe(true)
  })

  test('15. each call to generators produces unique output (random)', () => {
    const svcId = 'svc_unique_test_id'
    const a = generateIdempotencyKey('op', svcId)
    const b = generateIdempotencyKey('op', svcId)
    // Time component may be identical for fast consecutive calls, but the random component differs
    expect(a).not.toBe(b)
  })

  test('16. validateTransition with explicit invalid pair returns invalid', () => {
    const r = validateTransition('CANCELED', 'PAID')
    expect(r.valid).toBe(false)
  })

  test('17. validateTransition returns event type RETRY for FAILED→PENDING', () => {
    const r = validateTransition('FAILED', 'PENDING')
    expect(r.valid).toBe(true)
    expect(r.eventType).toBe('RETRY')
  })
})
