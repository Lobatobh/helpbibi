// Help Bibi — Pricing Engine tests (FASE 25.4)
import { describe, test, expect } from 'bun:test'
import { calculatePrice, DEFAULT_PRICING, formatBRL, getPricingConfig, getAllPricingConfigs, type PricingInput } from '@/server/pricing/pricing-engine'

const baseInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  serviceType: 'reboque',
  pickup: { lat: -23.5505, lng: -46.6333 },
  destination: null,
  providerPosition: null,
  pickupDistanceKm: 0,
  destinationDistanceKm: 0,
  ...overrides,
})

describe('pricing-engine — calculatePrice', () => {
  test('1. base fare is included when no distance', () => {
    const r = calculatePrice(baseInput())
    expect(r.baseFare).toBe(DEFAULT_PRICING.reboque.baseFare)
    expect(r.total).toBeGreaterThanOrEqual(r.baseFare)
  })

  test('2. per-km cost is added for pickup distance', () => {
    const r = calculatePrice(baseInput({ pickupDistanceKm: 10 }))
    const expectedPickupCost = Math.round(10 * DEFAULT_PRICING.reboque.pricePerKm * 100) / 100
    expect(r.pickupDistanceCost).toBe(expectedPickupCost)
    expect(r.pickupDistanceKm).toBe(10)
  })

  test('3. minimum fare is applied when subtotal < minimum', () => {
    // pneu: baseFare=80, pricePerKm=4, minimumFare=100. Zero distance → subtotal=80 < 100.
    const r = calculatePrice(baseInput({ serviceType: 'pneu', pickupDistanceKm: 0 }))
    expect(r.minimumFareApplied).toBe(true)
    expect(r.subtotal).toBe(DEFAULT_PRICING.pneu.minimumFare)
    expect(r.breakdownText.some((t) => t.includes('Tarifa mínima aplicada'))).toBe(true)
  })

  test('4. night surcharge (22-06h) applies 15%', () => {
    const midnight = new Date('2024-01-03T02:00:00') // 02:00 local
    const r = calculatePrice(baseInput({ datetime: midnight }))
    expect(r.surchargeAmount).toBeGreaterThan(0)
    expect(r.surchargeLabel).toContain('noturno')
    // night surcharge percent for reboque = 15
    const expectedSurcharge = Math.round(r.subtotal * 0.15 * 100) / 100
    expect(r.surchargeAmount).toBe(expectedSurcharge)
  })

  test('5. weekend surcharge applies 10% on Saturday/Sunday', () => {
    // 2024-01-06 is a Saturday at noon (no night surcharge)
    const saturday = new Date('2024-01-06T12:00:00')
    const r = calculatePrice(baseInput({ datetime: saturday }))
    expect(r.surchargeAmount).toBeGreaterThan(0)
    expect(r.surchargeLabel).toContain('fim de semana')
    const expectedSurcharge = Math.round(r.subtotal * 0.10 * 100) / 100
    expect(r.surchargeAmount).toBe(expectedSurcharge)
  })

  test('6. percent coupon reduces beforeDiscount by percentage', () => {
    const r = calculatePrice(baseInput({ promoCode: 'PROMO10', promoType: 'percent', promoValue: 10 }))
    const expectedDiscount = Math.round(r.beforeDiscount * 0.10 * 100) / 100
    expect(r.discountAmount).toBe(expectedDiscount)
    expect(r.discountLabel).toContain('PROMO10')
    expect(r.total).toBe(Math.round((r.beforeDiscount - expectedDiscount) * 100) / 100)
  })

  test('7. fixed coupon reduces by fixed amount', () => {
    const r = calculatePrice(baseInput({ promoCode: 'FIX20', promoType: 'fixed', promoValue: 20 }))
    expect(r.discountAmount).toBe(20)
    expect(r.discountLabel).toContain('FIX20')
  })

  test('8. fixed coupon never exceeds beforeDiscount (capped at total)', () => {
    // Use a small service (combustivel: baseFare=70, minimumFare=90) and a R$ 500 coupon
    const r = calculatePrice(baseInput({ serviceType: 'combustivel', promoCode: 'MEGA', promoType: 'fixed', promoValue: 500 }))
    expect(r.discountAmount).toBeLessThanOrEqual(r.beforeDiscount)
    expect(r.total).toBe(0) // discount capped → total floors at 0
  })

  test('9. platformFee is always 20% of total', () => {
    const r = calculatePrice(baseInput({ pickupDistanceKm: 15 }))
    const expected = Math.round(r.total * 0.20 * 100) / 100
    expect(r.platformFee).toBe(expected)
  })

  test('10. providerPayout is always 80% (total - platformFee)', () => {
    const r = calculatePrice(baseInput({ pickupDistanceKm: 25 }))
    const expected = Math.round((r.total - r.platformFee) * 100) / 100
    expect(r.providerPayout).toBe(expected)
  })

  test('11. round2 rounding produces at most 2 decimal places', () => {
    const r = calculatePrice(baseInput({ pickupDistanceKm: 7.333, destination: { lat: -23.6, lng: -46.7 }, destinationDistanceKm: 3.14159 }))
    // All numeric breakdown fields should have at most 2 decimals
    const allValues = [r.baseFare, r.pickupDistanceCost, r.destinationDistanceCost, r.subtotal, r.surchargeAmount, r.beforeDiscount, r.discountAmount, r.total, r.platformFee, r.providerPayout]
    for (const v of allValues) {
      const decimals = (v.toString().split('.')[1] || '').length
      expect(decimals).toBeLessThanOrEqual(2)
    }
  })

  test('12. breakdownText is an array of strings ending with total/platformFee/providerPayout', () => {
    const r = calculatePrice(baseInput({ pickupDistanceKm: 5 }))
    expect(Array.isArray(r.breakdownText)).toBe(true)
    expect(r.breakdownText.length).toBeGreaterThan(0)
    for (const t of r.breakdownText) expect(typeof t).toBe('string')
    const joined = r.breakdownText.join('\n')
    expect(joined).toContain('Tarifa base')
    expect(joined).toContain('Total:')
    expect(joined).toContain('Taxa da plataforma')
    expect(joined).toContain('Repasse ao prestador')
  })
})

describe('pricing-engine — helpers', () => {
  test('formatBRL formats with comma decimal separator', () => {
    expect(formatBRL(123.45)).toBe('R$ 123,45')
  })
  test('getPricingConfig returns config for each service type', () => {
    expect(getPricingConfig('reboque').baseFare).toBe(DEFAULT_PRICING.reboque.baseFare)
    expect(getPricingConfig('pane').baseFare).toBe(DEFAULT_PRICING.pane.baseFare)
  })
  test('getAllPricingConfigs returns 6 configs', () => {
    expect(getAllPricingConfigs().length).toBe(6)
  })
})
