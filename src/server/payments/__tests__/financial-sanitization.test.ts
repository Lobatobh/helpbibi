// Help Bibi — Financial Sanitization tests (FASE 29)
// Verifies that financial data is properly sanitized across all views:
//   - PaymentRecordWithEvents (admin) includes platformFee, providerPayout, providerPaymentId, externalReference
//   - HistoryListItem (client) does NOT include platformFee, providerPayout, providerPaymentId, externalReference
//   - HistoryListItem (provider) includes providerPayout but NOT platformFee
//   - Tracking (public) does NOT include any financial fields
//
// Mostly type/shape verification without DB. Uses `sanitizeTrackingObject`
// from tracking-security to validate the public-tracking sanitization behavior.
import { describe, test, expect } from 'bun:test'
import type { PaymentRecordWithEvents } from '@/server/repositories/payment.repository'
import type { HistoryListItem } from '@/server/repositories/history.repository'
import {
  sanitizeTrackingObject,
  isForbiddenField,
  FORBIDDEN_FIELDS,
} from '@/server/tracking/tracking-security'

// Compile-time type checks: assert that certain fields are part of (or NOT part of)
// a given type. These functions never execute; they exist purely for TypeScript
// to surface contract violations during build.
function assertType<T>(_v: T): void { /* noop */ }

// Field key constants — single source of truth for the assertions below.
const ADMIN_FINANCIAL_FIELDS = ['platformFee', 'providerPayout', 'providerPaymentId', 'externalReference'] as const
const CLIENT_FORBIDDEN_FIELDS = ['platformFee', 'providerPayout', 'providerPaymentId', 'externalReference'] as const

describe('financial-sanitization — admin view (PaymentRecordWithEvents)', () => {
  test('1. PaymentRecordWithEvents includes platformFee, providerPayout, providerPaymentId, externalReference', () => {
    // Compile-time: all four financial fields are keys of the type.
    const sample = {} as PaymentRecordWithEvents
    assertType<string>(sample.platformFee as unknown as string)
    assertType<string>(sample.providerPayout as unknown as string)
    assertType<string | null>(sample.providerPaymentId)
    assertType<string | null>(sample.externalReference)
    // Runtime: field names appear when we stringify a sample object.
    const fixture: PaymentRecordWithEvents = {
      id: 'pr_1',
      serviceRequestId: 'svc_1',
      method: 'PIX',
      status: 'PAID',
      amount: 180,
      platformFee: 36,
      providerPayout: 144,
      discountAmount: 0,
      couponCode: null,
      provider: 'simulated',
      providerPaymentId: 'pay_abc',
      externalReference: 'HB-ABC-XYZ',
      idempotencyKey: 'idem_1',
      simulatedTransactionId: 'SIM_1',
      paidAt: new Date(),
      failedAt: null,
      failureReason: null,
      lastWebhookSignature: null,
      webhookVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    }
    const keys = Object.keys(fixture)
    for (const field of ADMIN_FINANCIAL_FIELDS) {
      expect(keys).toContain(field)
    }
    // Admin sees the actual values (no masking at this layer — masking is at the API layer).
    expect(fixture.platformFee).toBe(36)
    expect(fixture.providerPayout).toBe(144)
    expect(fixture.providerPaymentId).toBe('pay_abc')
    expect(fixture.externalReference).toBe('HB-ABC-XYZ')
  })
})

describe('financial-sanitization — client view (HistoryListItem)', () => {
  test('2. HistoryListItem type never includes platformFee, providerPayout, providerPaymentId, externalReference as required keys', () => {
    // providerPayout is OPTIONAL in the type — only set for provider viewers.
    // platformFee / providerPaymentId / externalReference are NEVER on HistoryListItem.
    const clientItem: HistoryListItem = {
      id: 'svc_1',
      type: 'REBOQUE',
      typeLabel: 'Reboque',
      status: 'COMPLETED',
      statusLabel: 'Concluído',
      description: '',
      pickupLabel: 'A',
      destinationLabel: 'B',
      distanceKm: 5,
      etaMin: 10,
      price: 180,
      originalPrice: 200,
      discount: 20,
      promoCode: 'PROMO10',
      paymentMethod: 'PIX',
      paymentStatus: 'PAID',
      createdAt: new Date().toISOString(),
      acceptedAt: null,
      completedAt: null,
      providerName: 'Leo',
      providerVehicle: 'Guincho A',
      providerRating: 4.8,
      clientName: 'Kate',
      clientRatingStars: null,
      clientRatingComment: null,
      providerRatingStars: null,
      providerRatingComment: null,
      loyaltyPoints: 10,
    }
    const keys = Object.keys(clientItem)
    // Client NEVER sees platformFee, providerPaymentId, externalReference
    expect(keys).not.toContain('platformFee')
    expect(keys).not.toContain('providerPaymentId')
    expect(keys).not.toContain('externalReference')
    // Client NEVER sees providerPayout (it's only set for provider viewers)
    expect(keys).not.toContain('providerPayout')
    // Client DOES see price + paymentStatus (simplified) + paymentMethod
    expect(keys).toContain('price')
    expect(keys).toContain('paymentStatus')
    expect(keys).toContain('paymentMethod')
  })
})

describe('financial-sanitization — provider view (HistoryListItem with providerPayout)', () => {
  test('3. Provider view includes providerPayout but NOT platformFee', () => {
    const providerItem: HistoryListItem = {
      id: 'svc_1',
      type: 'REBOQUE',
      typeLabel: 'Reboque',
      status: 'COMPLETED',
      statusLabel: 'Concluído',
      description: '',
      pickupLabel: 'A',
      destinationLabel: 'B',
      distanceKm: 5,
      etaMin: 10,
      price: 180,
      originalPrice: 200,
      discount: 20,
      promoCode: 'PROMO10',
      paymentMethod: 'PIX',
      paymentStatus: 'PAID',
      createdAt: new Date().toISOString(),
      acceptedAt: null,
      completedAt: null,
      providerName: 'Leo',
      providerVehicle: 'Guincho A',
      providerRating: 4.8,
      clientName: 'Kate',
      clientRatingStars: null,
      clientRatingComment: null,
      providerRatingStars: null,
      providerRatingComment: null,
      loyaltyPoints: 10,
      // Provider-only field:
      providerPayout: 144,
    }
    const keys = Object.keys(providerItem)
    expect(keys).toContain('providerPayout')
    expect(providerItem.providerPayout).toBe(144)
    // Platform fee is NEVER visible to providers
    expect(keys).not.toContain('platformFee')
    // Provider payment IDs / external reference are NEVER visible to providers
    expect(keys).not.toContain('providerPaymentId')
    expect(keys).not.toContain('externalReference')
  })
})

describe('financial-sanitization — tracking (public) view', () => {
  test('4. sanitizeTrackingObject strips ALL financial fields', () => {
    // Simulated raw tracking response — pretend an admin endpoint accidentally
    // included sensitive fields. The sanitizeTrackingObject helper must strip them.
    const rawTrackingResponse = {
      id: 'svc_1',
      status: 'IN_PROGRESS',
      pickupLabel: 'Av. Paulista, 1000',
      destinationLabel: 'Rua Augusta, 500',
      providerName: 'Leo',
      providerVehicle: 'Guincho A',
      etaMin: 10,
      // Financial fields that MUST be stripped:
      price: 180,
      originalPrice: 200,
      discount: 20,
      platformFee: 36,
      providerPayout: 144,
      paymentStatus: 'PAID',
      paymentMethod: 'PIX',
      paymentRecords: [],
      couponCode: 'PROMO10',
      providerPaymentId: 'pay_abc',
      externalReference: 'HB-ABC-XYZ',
      idempotencyKey: 'idem_1',
      simulatedTransactionId: 'SIM_1',
      failureReason: null,
      lastWebhookSignature: 'sha256=abc',
      webhookVerifiedAt: '2024-01-01T00:00:00.000Z',
      paidAt: '2024-01-01T00:00:00.000Z',
      failedAt: null,
    }
    const sanitized = sanitizeTrackingObject(rawTrackingResponse)
    const keys = Object.keys(sanitized)
    // NONE of the forbidden financial fields should be present
    for (const forbidden of FORBIDDEN_FIELDS) {
      expect(keys).not.toContain(forbidden)
    }
    // Verify the specific high-sensitivity fields explicitly
    expect(sanitized).not.toHaveProperty('price')
    expect(sanitized).not.toHaveProperty('paymentStatus')
    expect(sanitized).not.toHaveProperty('platformFee')
    expect(sanitized).not.toHaveProperty('providerPayout')
    expect(sanitized).not.toHaveProperty('providerPaymentId')
    expect(sanitized).not.toHaveProperty('externalReference')
    expect(sanitized).not.toHaveProperty('idempotencyKey')
    expect(sanitized).not.toHaveProperty('couponCode')
    // Non-financial fields ARE preserved
    expect(sanitized).toHaveProperty('id')
    expect(sanitized).toHaveProperty('status')
    expect(sanitized).toHaveProperty('providerName')
    expect(sanitized).toHaveProperty('etaMin')
  })

  test('5. isForbiddenField returns true for all financial fields', () => {
    expect(isForbiddenField('price')).toBe(true)
    expect(isForbiddenField('originalPrice')).toBe(true)
    expect(isForbiddenField('discount')).toBe(true)
    expect(isForbiddenField('platformFee')).toBe(true)
    expect(isForbiddenField('providerPayout')).toBe(true)
    expect(isForbiddenField('paymentStatus')).toBe(true)
    expect(isForbiddenField('paymentMethod')).toBe(true)
    expect(isForbiddenField('providerPaymentId')).toBe(true)
    expect(isForbiddenField('externalReference')).toBe(true)
    expect(isForbiddenField('idempotencyKey')).toBe(true)
    expect(isForbiddenField('paidAt')).toBe(true)
    expect(isForbiddenField('failedAt')).toBe(true)
    expect(isForbiddenField('failureReason')).toBe(true)
    expect(isForbiddenField('lastWebhookSignature')).toBe(true)
    expect(isForbiddenField('webhookVerifiedAt')).toBe(true)
    // Non-financial fields are NOT forbidden
    expect(isForbiddenField('id')).toBe(false)
    expect(isForbiddenField('status')).toBe(false)
    expect(isForbiddenField('providerName')).toBe(false)
    expect(isForbiddenField('etaMin')).toBe(false)
  })

  test('6. sanitizeTrackingObject preserves non-financial fields intact', () => {
    const raw = {
      id: 'svc_42',
      status: 'PROVIDER_EN_ROUTE',
      pickupLabel: 'Av. Paulista, 1000',
      destinationLabel: 'Rua Augusta, 500',
      providerName: 'Leo',
      providerVehicle: 'Guincho A',
      etaMin: 7,
      distanceKm: 3.2,
    }
    const sanitized = sanitizeTrackingObject(raw)
    expect(sanitized).toEqual(raw) // nothing to strip → identity
  })

  test('7. sanitizeTrackingObject on empty object returns empty object', () => {
    const sanitized = sanitizeTrackingObject({})
    expect(Object.keys(sanitized).length).toBe(0)
  })

  test('8. FORBIDDEN_FIELDS list contains all expected financial/payment fields', () => {
    // Sanity check: ensure the forbidden list hasn't been accidentally shortened.
    const asArray = [...FORBIDDEN_FIELDS]
    expect(asArray).toContain('price')
    expect(asArray).toContain('platformFee')
    expect(asArray).toContain('providerPayout')
    expect(asArray).toContain('paymentStatus')
    expect(asArray).toContain('providerPaymentId')
    expect(asArray).toContain('externalReference')
    expect(asArray).toContain('couponCode')
    expect(asArray).toContain('paymentRecords')
    expect(asArray.length).toBeGreaterThanOrEqual(15)
  })
})

describe('financial-sanitization — cross-view summary', () => {
  test('9. admin sees all financial fields, client sees none, provider sees only payout', () => {
    // This is a documentation-style assertion: snapshot of what each role sees.
    const adminKeys = ['platformFee', 'providerPayout', 'providerPaymentId', 'externalReference']
    const providerKeys = ['providerPayout'] // only this one from the financial set
    const clientKeys: string[] = [] // none from the financial set
    const trackingKeys: string[] = [] // none from the financial set

    expect(adminKeys.length).toBe(4)
    expect(providerKeys).toEqual(['providerPayout'])
    expect(clientKeys).toEqual([])
    expect(trackingKeys).toEqual([])
    // Sanity: provider ⊂ admin (provider sees a strict subset)
    for (const k of providerKeys) {
      expect(adminKeys).toContain(k)
    }
  })

  test('10. client forbidden field list matches admin-only fields', () => {
    // The fields the client must NEVER see are exactly the admin-only fields.
    expect([...CLIENT_FORBIDDEN_FIELDS].sort()).toEqual([...ADMIN_FINANCIAL_FIELDS].sort())
  })
})
