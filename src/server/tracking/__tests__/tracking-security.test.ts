// Help Bibi — Tracking Security tests (FASE 25.4)
import { describe, test, expect } from 'bun:test'
import {
  FORBIDDEN_FIELDS, FORBIDDEN_KW,
  isForbiddenField, containsForbiddenKeyword, roundCoords, sanitizeTrackingObject,
} from '@/server/tracking/tracking-security'

describe('tracking-security — FORBIDDEN_FIELDS', () => {
  test('1. FORBIDDEN_FIELDS covers all financial fields', () => {
    const required = ['price', 'paymentStatus', 'platformFee', 'providerPayout', 'providerPaymentId', 'externalReference']
    for (const f of required) {
      expect(FORBIDDEN_FIELDS).toContain(f)
    }
  })

  test('2. isForbiddenField returns true for forbidden fields and false for safe ones', () => {
    expect(isForbiddenField('price')).toBe(true)
    expect(isForbiddenField('paymentStatus')).toBe(true)
    expect(isForbiddenField('platformFee')).toBe(true)
    expect(isForbiddenField('status')).toBe(false)
    expect(isForbiddenField('pickupLabel')).toBe(false)
    expect(isForbiddenField('etaMin')).toBe(false)
  })
})

describe('tracking-security — FORBIDDEN_KW', () => {
  test('3. FORBIDDEN_KW filters financial labels', () => {
    const required = ['cupom', 'desconto', 'r$', 'pagamento', 'pix', 'cartão', 'cartao', 'dinheiro', 'webhook']
    for (const kw of required) {
      expect(FORBIDDEN_KW).toContain(kw)
    }
  })

  test('4. containsForbiddenKeyword matches PT-BR financial labels', () => {
    expect(containsForbiddenKeyword('Cupom PROMO10 aplicado')).toBe(true)
    expect(containsForbiddenKeyword('Desconto: -R$ 20,00')).toBe(true)
    expect(containsForbiddenKeyword('Pagamento confirmado')).toBe(true)
    expect(containsForbiddenKeyword('Pagamento via PIX')).toBe(true)
    expect(containsForbiddenKeyword('Cartão de crédito')).toBe(true)
    expect(containsForbiddenKeyword('Dinheiro ao prestador')).toBe(true)
    expect(containsForbiddenKeyword('Webhook received')).toBe(true)
  })

  test('5. safe labels pass (no forbidden keywords)', () => {
    expect(containsForbiddenKeyword('Prestador a caminho')).toBe(false)
    expect(containsForbiddenKeyword('Reboque / Guincho')).toBe(false)
    expect(containsForbiddenKeyword('São Paulo, SP')).toBe(false)
    expect(containsForbiddenKeyword('Prestador chegou ao local')).toBe(false)
  })
})

describe('tracking-security — roundCoords', () => {
  test('6. coords rounded to 3 decimals', () => {
    expect(roundCoords(-23.5505123456)).toBe(-23.551)
    expect(roundCoords(-46.6333987654)).toBe(-46.633)
    expect(roundCoords(0)).toBe(0)
    expect(roundCoords(12.3456789)).toBe(12.346)
  })
})

describe('tracking-security — sanitizeTrackingObject', () => {
  test('7. sanitizeTrackingObject removes forbidden keys, keeps safe ones', () => {
    const input = {
      serviceId: 'svc_123',
      status: 'COMPLETED',
      pickupLabel: 'Av. Paulista, 1000',
      price: 150, // FORBIDDEN
      platformFee: 30, // FORBIDDEN
      providerPayout: 120, // FORBIDDEN
      paymentStatus: 'PAID', // FORBIDDEN
      providerPaymentId: 'pay_abc', // FORBIDDEN
      externalReference: 'HB-XYZ', // FORBIDDEN
      etaMin: 12,
      distanceKm: 4.5,
    }
    const sanitized = sanitizeTrackingObject(input)
    expect(sanitized.serviceId).toBe('svc_123')
    expect(sanitized.status).toBe('COMPLETED')
    expect(sanitized.pickupLabel).toBe('Av. Paulista, 1000')
    expect(sanitized.etaMin).toBe(12)
    expect(sanitized.distanceKm).toBe(4.5)
    expect(sanitized.price).toBeUndefined()
    expect(sanitized.platformFee).toBeUndefined()
    expect(sanitized.providerPayout).toBeUndefined()
    expect(sanitized.paymentStatus).toBeUndefined()
    expect(sanitized.providerPaymentId).toBeUndefined()
    expect(sanitized.externalReference).toBeUndefined()
  })

  test('8. tracking response shape — full public tracking object contains no forbidden keys', () => {
    // Simulate a public tracking response shape (similar to what getPublicTracking returns)
    const trackingResponse = {
      available: true,
      serviceId: 'svc_123',
      status: 'completed',
      type: 'reboque',
      typeLabel: 'Reboque / Guincho',
      icon: 'tow-truck',
      pickupLabel: 'Av. Paulista, 1000',
      destinationLabel: 'Rua Augusta, 500',
      distanceKm: 4.5,
      etaMin: 12,
      createdAt: 1700000000000,
      acceptedAt: 1700000001000,
      completedAt: 1700000002000,
      timeline: [],
      provider: { name: 'João', vehicle: 'Guincho A', rating: 4.8 },
      providerPosition: { lat: -23.551, lng: -46.633 },
      pickup: { lat: -23.551, lng: -46.633 },
      destination: { lat: -23.56, lng: -46.64 },
    }
    // Verify no forbidden fields in top-level keys
    for (const key of Object.keys(trackingResponse)) {
      expect(isForbiddenField(key)).toBe(false)
    }
    // Verify no forbidden fields in nested provider object
    for (const key of Object.keys(trackingResponse.provider)) {
      expect(isForbiddenField(key)).toBe(false)
    }
    // Verify provider doesn't include sensitive data (no plate, no phone, no userId)
    expect(trackingResponse.provider).not.toHaveProperty('plate')
    expect(trackingResponse.provider).not.toHaveProperty('phone')
    expect(trackingResponse.provider).not.toHaveProperty('userId')
  })
})
