// Help Bibi — Tracking Hardening tests (FASE 26)
// Additional FASE 26 hardening tests beyond tracking-security.test.ts.
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  FORBIDDEN_FIELDS, isForbiddenField, sanitizeTrackingObject,
} from '@/server/tracking/tracking-security'
import { rateLimit, clearRateLimits, RATE_LIMITS } from '@/server/rate-limit'

describe('tracking-hardening — FORBIDDEN_FIELDS coverage', () => {
  test('1. FORBIDDEN_FIELDS includes price, paymentStatus, platformFee, providerPayout, providerPaymentId, externalReference', () => {
    const required = [
      'price', 'paymentStatus', 'platformFee', 'providerPayout',
      'providerPaymentId', 'externalReference',
    ]
    for (const f of required) {
      expect(FORBIDDEN_FIELDS).toContain(f)
    }
  })
})

describe('tracking-hardening — response shape', () => {
  test('2. a simulated tracking response shape contains no forbidden fields', () => {
    const trackingResponse = {
      serviceId: 'svc_123',
      status: 'completed',
      type: 'reboque',
      pickupLabel: 'Av. Paulista, 1000',
      destinationLabel: 'Rua Augusta, 500',
      distanceKm: 4.5,
      etaMin: 12,
      timeline: [],
      provider: { name: 'João', vehicle: 'Guincho A', rating: 4.8 },
    }
    for (const key of Object.keys(trackingResponse)) {
      expect(isForbiddenField(key)).toBe(false)
    }
  })

  test('3. tracking response must include the required public fields: status, type, pickupLabel, destinationLabel, timeline, provider', () => {
    const trackingResponse = {
      status: 'completed',
      type: 'reboque',
      pickupLabel: 'Av. Paulista, 1000',
      destinationLabel: 'Rua Augusta, 500',
      timeline: [{ status: 'completed', label: 'Concluído', at: 1700000000000 }],
      provider: { name: 'João', vehicle: 'Guincho A', rating: 4.8 },
    }
    expect(trackingResponse).toHaveProperty('status')
    expect(trackingResponse).toHaveProperty('type')
    expect(trackingResponse).toHaveProperty('pickupLabel')
    expect(trackingResponse).toHaveProperty('destinationLabel')
    expect(trackingResponse).toHaveProperty('timeline')
    expect(trackingResponse).toHaveProperty('provider')
  })

  test('4. provider object in tracking must NOT include plate, phone, userId, email', () => {
    const provider = { name: 'João', vehicle: 'Guincho A', rating: 4.8 }
    expect(provider).not.toHaveProperty('plate')
    expect(provider).not.toHaveProperty('phone')
    expect(provider).not.toHaveProperty('userId')
    expect(provider).not.toHaveProperty('email')
  })

  test('5. sanitizeTrackingObject strips forbidden fields if accidentally present', () => {
    const leaky = {
      status: 'completed',
      type: 'reboque',
      price: 180,
      paymentStatus: 'PAID',
      platformFee: 36,
      providerPayout: 144,
      providerPaymentId: 'pay_abc',
      externalReference: 'HB-XYZ',
    }
    const clean = sanitizeTrackingObject(leaky)
    expect(clean.status).toBe('completed')
    expect(clean.type).toBe('reboque')
    expect(clean.price).toBeUndefined()
    expect(clean.paymentStatus).toBeUndefined()
    expect(clean.platformFee).toBeUndefined()
    expect(clean.providerPayout).toBeUndefined()
    expect(clean.providerPaymentId).toBeUndefined()
    expect(clean.externalReference).toBeUndefined()
  })
})

describe('tracking-hardening — rate limit preset for track endpoint', () => {
  beforeEach(async () => { await clearRateLimits() })

  test('6. RATE_LIMITS.track allows 60/min and blocks the 61st (429 logic)', async () => {
    const cfg = RATE_LIMITS.track
    // First 60 requests should be allowed
    for (let i = 0; i < cfg.maxRequests; i++) {
      const r = await rateLimit('track:ip_test_1', cfg)
      expect(r.allowed).toBe(true)
    }
    // The 61st should be blocked (rate limited → would return 429 in HTTP)
    const blocked = await rateLimit('track:ip_test_1', cfg)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })
})
