// Help Bibi — Matching logic tests (FASE 25.4)
import { describe, test, expect } from 'bun:test'
import {
  createPublicDemoMatchingOptions, getMatchingRejectionReason,
  haversineDistance, isEligibleForMatching, rankProvidersByDistance, getMatchingMode,
  type MatchingProvider, type MatchingOptions,
} from '../matching'

const baseProvider = (overrides: Partial<MatchingProvider> = {}): MatchingProvider => ({
  id: 'p1',
  name: 'Provider 1',
  online: true,
  position: { lat: -23.5505, lng: -46.6333 },
  currentServiceId: null,
  isDemoProvider: false,
  isVerified: true,
  documentStatus: 'APPROVED',
  vehicleStatus: 'APPROVED',
  userStatus: 'ACTIVE',
  isGpsPosition: false,
  ...overrides,
})

const devOptions: MatchingOptions = { isDevMode: true }
const prodOptions: MatchingOptions = { isDevMode: false }

describe('matching — haversineDistance', () => {
  test('1. same point returns 0', () => {
    expect(haversineDistance({ lat: -23.5, lng: -46.6 }, { lat: -23.5, lng: -46.6 })).toBe(0)
  })

  test('2. known distance is approximately correct', () => {
    // São Paulo (Av. Paulista) to Rio de Janeiro (Copacabana): ~360 km as the crow flies
    const sp = { lat: -23.5614, lng: -46.6559 }
    const rj = { lat: -22.9711, lng: -43.1822 }
    const d = haversineDistance(sp, rj)
    expect(d).toBeGreaterThan(355)
    expect(d).toBeLessThan(365)
  })
})

describe('matching — isEligibleForMatching', () => {
  test('3. userStatus != ACTIVE is rejected', () => {
    const p = baseProvider({ userStatus: 'INACTIVE' })
    expect(isEligibleForMatching(p, devOptions)).toBe(false)
  })

  test('4. offline provider is rejected', () => {
    const p = baseProvider({ online: false })
    expect(isEligibleForMatching(p, devOptions)).toBe(false)
  })

  test('5. provider with currentServiceId is rejected', () => {
    const p = baseProvider({ currentServiceId: 'svc_123' })
    expect(isEligibleForMatching(p, devOptions)).toBe(false)
  })

  test('6. demo provider in dev mode is eligible', () => {
    const p = baseProvider({ isDemoProvider: true })
    expect(isEligibleForMatching(p, devOptions)).toBe(true)
  })

  test('7. demo provider in prod mode is rejected', () => {
    const p = baseProvider({ isDemoProvider: true })
    expect(isEligibleForMatching(p, prodOptions)).toBe(false)
  })

  test('8. verified provider with APPROVED docs in prod is eligible', () => {
    const p = baseProvider({ isDemoProvider: false, isVerified: true, documentStatus: 'APPROVED', vehicleStatus: 'APPROVED' })
    expect(isEligibleForMatching(p, prodOptions)).toBe(true)
  })

  test('9. unverified provider is rejected in prod', () => {
    const p = baseProvider({ isDemoProvider: false, isVerified: false })
    expect(isEligibleForMatching(p, prodOptions)).toBe(false)
  })

  test('10. PENDING docs are rejected in prod', () => {
    const p = baseProvider({ isDemoProvider: false, isVerified: true, documentStatus: 'PENDING', vehicleStatus: 'APPROVED' })
    expect(isEligibleForMatching(p, prodOptions)).toBe(false)
  })

  test('11. REJECTED vehicle is rejected in prod', () => {
    const p = baseProvider({ isDemoProvider: false, isVerified: true, documentStatus: 'APPROVED', vehicleStatus: 'REJECTED' })
    expect(isEligibleForMatching(p, prodOptions)).toBe(false)
  })

  test('12. demo provider in devMode=false but demoMode=true is eligible', () => {
    const p = baseProvider({ isDemoProvider: true })
    expect(isEligibleForMatching(p, { isDevMode: false, demoMode: true })).toBe(true)
  })

  test('13. explains why an online demo provider is rejected when demoMode is disabled', () => {
    const p = baseProvider({ isDemoProvider: true })
    expect(getMatchingRejectionReason(p, prodOptions)).toBe('demo_mode_disabled')
  })
})

describe('matching — rankProvidersByDistance', () => {
  test('14. returns only eligible providers (filters out ineligible)', () => {
    const pickup = { lat: -23.5505, lng: -46.6333 }
    const providers = [
      baseProvider({ id: 'p1', position: { lat: -23.55, lng: -46.63 } }),
      baseProvider({ id: 'p2', position: { lat: -23.60, lng: -46.70 }, online: false }), // ineligible
      baseProvider({ id: 'p3', position: { lat: -23.58, lng: -46.65 }, currentServiceId: 'svc' }), // ineligible
    ]
    const ranked = rankProvidersByDistance(providers, pickup, devOptions, 5)
    expect(ranked.length).toBe(1)
    expect(ranked[0].id).toBe('p1')
  })

  test('15. sorted by distance ascending', () => {
    const pickup = { lat: -23.5505, lng: -46.6333 }
    const providers = [
      baseProvider({ id: 'far', position: { lat: -23.60, lng: -46.70 } }),
      baseProvider({ id: 'mid', position: { lat: -23.58, lng: -46.65 } }),
      baseProvider({ id: 'near', position: { lat: -23.551, lng: -46.634 } }),
    ]
    const ranked = rankProvidersByDistance(providers, pickup, devOptions, 5)
    expect(ranked[0].id).toBe('near')
    expect(ranked[1].id).toBe('mid')
    expect(ranked[2].id).toBe('far')
  })

  test('16. limited to limit parameter', () => {
    const pickup = { lat: -23.5505, lng: -46.6333 }
    const providers = [
      baseProvider({ id: 'p1', position: { lat: -23.55, lng: -46.63 } }),
      baseProvider({ id: 'p2', position: { lat: -23.56, lng: -46.64 } }),
      baseProvider({ id: 'p3', position: { lat: -23.57, lng: -46.65 } }),
      baseProvider({ id: 'p4', position: { lat: -23.58, lng: -46.66 } }),
    ]
    const ranked = rankProvidersByDistance(providers, pickup, devOptions, 2)
    expect(ranked.length).toBe(2)
  })

  test('17. default limit is 3', () => {
    const pickup = { lat: -23.5505, lng: -46.6333 }
    const providers = [
      baseProvider({ id: 'p1', position: { lat: -23.55, lng: -46.63 } }),
      baseProvider({ id: 'p2', position: { lat: -23.56, lng: -46.64 } }),
      baseProvider({ id: 'p3', position: { lat: -23.57, lng: -46.65 } }),
      baseProvider({ id: 'p4', position: { lat: -23.58, lng: -46.66 } }),
      baseProvider({ id: 'p5', position: { lat: -23.59, lng: -46.67 } }),
    ]
    const ranked = rankProvidersByDistance(providers, pickup, devOptions) // default limit=3
    expect(ranked.length).toBe(3)
  })

  test('18. production public demo runtime matches an online Guincho Plataforma provider for Reboque / Guincho', () => {
    const pickup = { lat: -23.5614, lng: -46.6559 }
    const provider = baseProvider({
      id: 'demo_guincho',
      name: 'Pedro',
      isDemoProvider: true,
      isVerified: false,
      documentStatus: 'PENDING',
      vehicleStatus: 'PENDING',
      position: { lat: -23.56, lng: -46.654 },
    })

    const ranked = rankProvidersByDistance(
      [provider],
      pickup,
      createPublicDemoMatchingOptions(true),
      1
    )

    expect(ranked.map((p) => p.id)).toEqual(['demo_guincho'])
  })
})

describe('matching — getMatchingMode', () => {
  test('19. GPS pickup → gps matching', () => {
    const result = getMatchingMode('GPS', null)
    expect(result.matching).toBe('gps')
    expect(result.pickup).toBe('GPS')
  })

  test('20. DEMO pickup → demo matching', () => {
    const result = getMatchingMode('DEMO', null)
    expect(result.matching).toBe('demo')
    expect(result.pickup).toBe('DEMO')
  })

  test('21. lowercase gps normalised to GPS', () => {
    const result = getMatchingMode('gps', null)
    expect(result.pickup).toBe('GPS')
    expect(result.matching).toBe('gps')
  })

  test('22. unknown pickup source defaults to DEMO', () => {
    const result = getMatchingMode('xyz', null)
    expect(result.pickup).toBe('DEMO')
    expect(result.matching).toBe('demo')
  })

  test('23. provider isGpsPosition affects pos field', () => {
    const p = baseProvider({ isGpsPosition: true })
    const result = getMatchingMode('GPS', p)
    expect(result.pos).toBe('gps')
    const result2 = getMatchingMode('GPS', baseProvider({ isGpsPosition: false }))
    expect(result2.pos).toBe('demo')
  })
})
