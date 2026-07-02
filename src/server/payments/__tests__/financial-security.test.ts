// Help Bibi — Financial Security tests (FASE 25.4)
import { describe, test, expect } from 'bun:test'
import { calculatePrice, DEFAULT_PRICING, type PricingInput, type ServiceType } from '@/server/pricing/pricing-engine'

const baseInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  serviceType: 'reboque',
  pickup: { lat: -23.5505, lng: -46.6333 },
  destination: null,
  providerPosition: null,
  pickupDistanceKm: 0,
  destinationDistanceKm: 0,
  ...overrides,
})

describe('financial-security — split invariants', () => {
  test('1. platformFee is always 20% of total across all service types', () => {
    const types: ServiceType[] = ['reboque', 'pneu', 'bateria', 'combustivel', 'chaveiro', 'pane']
    for (const serviceType of types) {
      for (const km of [0, 5, 10, 50]) {
        const r = calculatePrice(baseInput({ serviceType, pickupDistanceKm: km }))
        const expected = Math.round(r.total * 0.20 * 100) / 100
        expect(r.platformFee).toBe(expected)
      }
    }
  })

  test('2. providerPayout is always 80% across all service types', () => {
    const types: ServiceType[] = ['reboque', 'pneu', 'bateria', 'combustivel', 'chaveiro', 'pane']
    for (const serviceType of types) {
      const r = calculatePrice(baseInput({ serviceType, pickupDistanceKm: 12 }))
      const expected = Math.round(r.total * 0.80 * 100) / 100
      expect(r.providerPayout).toBe(expected)
    }
  })

  test('3. platformFee + providerPayout === total (no leakage)', () => {
    const r = calculatePrice(baseInput({ pickupDistanceKm: 17, destination: { lat: -23.6, lng: -46.7 }, destinationDistanceKm: 8 }))
    const sum = Math.round((r.platformFee + r.providerPayout) * 100) / 100
    expect(sum).toBe(r.total)
  })

  test('4. platformFee + providerPayout === total even with discount', () => {
    const r = calculatePrice(baseInput({ pickupDistanceKm: 20, promoCode: 'P10', promoType: 'percent', promoValue: 10 }))
    const sum = Math.round((r.platformFee + r.providerPayout) * 100) / 100
    expect(sum).toBe(r.total)
  })

  test('5. DEFAULT_PRICING configs all use 20% platform / 80% payout', () => {
    for (const cfg of Object.values(DEFAULT_PRICING)) {
      expect(cfg.platformFeePercent).toBe(20)
      expect(cfg.providerPayoutPercent).toBe(80)
    }
  })
})

describe('financial-security — discount invariants', () => {
  test('6. discount never exceeds beforeDiscount', () => {
    const r = calculatePrice(baseInput({ serviceType: 'combustivel', promoCode: 'HUGE', promoType: 'fixed', promoValue: 99999 }))
    expect(r.discountAmount).toBeLessThanOrEqual(r.beforeDiscount)
    expect(r.total).toBeGreaterThanOrEqual(0)
  })

  test('7. percent coupon calculation: discount = beforeDiscount * value/100', () => {
    const r = calculatePrice(baseInput({ pickupDistanceKm: 30, promoCode: 'P25', promoType: 'percent', promoValue: 25 }))
    const expected = Math.round(r.beforeDiscount * 0.25 * 100) / 100
    expect(r.discountAmount).toBe(expected)
  })

  test('8. fixed coupon capped at total (no negative total)', () => {
    const r = calculatePrice(baseInput({ serviceType: 'combustivel', promoCode: 'BIG', promoType: 'fixed', promoValue: 500 }))
    expect(r.discountAmount).toBeLessThanOrEqual(r.beforeDiscount)
    expect(r.total).toBeGreaterThanOrEqual(0)
    expect(r.discountAmount).toBe(r.beforeDiscount)
  })

  test('9. coupon applied to beforeDiscount (post-surcharge), not subtotal', () => {
    const midnight = new Date('2024-01-03T02:00:00')
    const r = calculatePrice(baseInput({ datetime: midnight, pickupDistanceKm: 10, promoCode: 'P10', promoType: 'percent', promoValue: 10 }))
    expect(r.surchargeAmount).toBeGreaterThan(0)
    expect(r.beforeDiscount).toBe(Math.round((r.subtotal + r.surchargeAmount) * 100) / 100)
    const expected = Math.round(r.beforeDiscount * 0.10 * 100) / 100
    expect(r.discountAmount).toBe(expected)
  })
})

describe('financial-security — minimum fare invariants', () => {
  test('10. minimum fare applied when subtotal < minimum', () => {
    // combustivel: baseFare=70, minimumFare=90 → subtotal=70 < 90
    const r = calculatePrice(baseInput({ serviceType: 'combustivel', pickupDistanceKm: 0 }))
    expect(r.minimumFareApplied).toBe(true)
    expect(r.subtotal).toBe(DEFAULT_PRICING.combustivel.minimumFare)
  })

  test('11. minimum fare NOT applied when subtotal >= minimum', () => {
    const r = calculatePrice(baseInput({ serviceType: 'reboque', pickupDistanceKm: 50 }))
    expect(r.minimumFareApplied).toBe(false)
  })

  test('12. with coupon + minimum fare, total is still non-negative', () => {
    const r = calculatePrice(baseInput({ serviceType: 'combustivel', promoCode: 'BIG', promoType: 'fixed', promoValue: 50 }))
    expect(r.total).toBeGreaterThanOrEqual(0)
  })
})

describe('financial-security — surcharge percentages', () => {
  test('13. night surcharge is exactly 15% of subtotal', () => {
    const midnight = new Date('2024-01-03T02:00:00')
    const r = calculatePrice(baseInput({ datetime: midnight, pickupDistanceKm: 10 }))
    const expected = Math.round(r.subtotal * 0.15 * 100) / 100
    expect(r.surchargeAmount).toBe(expected)
  })

  test('14. weekend surcharge is exactly 10% of subtotal', () => {
    const saturday = new Date('2024-01-06T12:00:00')
    const r = calculatePrice(baseInput({ datetime: saturday, pickupDistanceKm: 10 }))
    const expected = Math.round(r.subtotal * 0.10 * 100) / 100
    expect(r.surchargeAmount).toBe(expected)
  })

  test('15. no surcharge on weekday daytime', () => {
    // 2024-01-03 is a Wednesday at noon
    const wed = new Date('2024-01-03T12:00:00')
    const r = calculatePrice(baseInput({ datetime: wed, pickupDistanceKm: 10 }))
    expect(r.surchargeAmount).toBe(0)
    expect(r.surchargeLabel).toBe('')
  })
})
