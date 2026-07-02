// Help Bibi — History Repository integration tests (FASE 25.4)
// Uses the real Prisma SQLite database. Cleanup via ServiceRequest cascade.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { db } from '@/server/db/prisma'
import {
  authorizeHistoryRequest,
  getClientServices, getClientServiceDetail,
  getProviderServices, getProviderServiceDetail,
  type HistoryActor,
} from '@/server/repositories/history.repository'

const PICKUP_JSON = JSON.stringify({ lat: -23.5505, lng: -46.6333 })
const DEST_JSON = JSON.stringify({ lat: -23.56, lng: -46.64 })

describe('history-integration — DB integration', () => {
  const createdServiceIds: string[] = []
  const createdUserIds: string[] = []
  const createdProviderIds: string[] = []
  let clientUser: { id: string }
  let otherClientUser: { id: string }
  let providerUser: { id: string }
  let otherProviderUser: { id: string }
  let providerProfile: { id: string }
  let otherProviderProfile: { id: string }
  let ownService: { id: string }
  let otherClientService: { id: string }
  let providerOwnedService: { id: string }
  let otherProviderService: { id: string }

  beforeEach(async () => {
    const ts = Date.now()
    const rnd = Math.random().toString(36).slice(2, 8)
    // Client + other client
    clientUser = await db.user.create({ data: { email: `c1_${ts}_${rnd}@helpbibi.com`, name: 'Client 1', role: 'CLIENT' } })
    otherClientUser = await db.user.create({ data: { email: `c2_${ts}_${rnd}@helpbibi.com`, name: 'Client 2', role: 'CLIENT' } })
    // Provider + other provider
    providerUser = await db.user.create({ data: { email: `p1_${ts}_${rnd}@helpbibi.com`, name: 'Provider 1', role: 'PROVIDER' } })
    otherProviderUser = await db.user.create({ data: { email: `p2_${ts}_${rnd}@helpbibi.com`, name: 'Provider 2', role: 'PROVIDER' } })
    createdUserIds.push(clientUser.id, otherClientUser.id, providerUser.id, otherProviderUser.id)

    // Provider profiles
    providerProfile = await db.providerProfile.create({
      data: { userId: providerUser.id, vehicle: 'Guincho A', plate: 'AAA-1111', isVerified: true, documentStatus: 'APPROVED', vehicleStatus: 'APPROVED' },
    })
    otherProviderProfile = await db.providerProfile.create({
      data: { userId: otherProviderUser.id, vehicle: 'Guincho B', plate: 'BBB-2222', isVerified: true, documentStatus: 'APPROVED', vehicleStatus: 'APPROVED' },
    })
    createdProviderIds.push(providerProfile.id, otherProviderProfile.id)

    // Service 1: clientUser is the client, no provider yet
    ownService = await db.serviceRequest.create({
      data: {
        clientId: clientUser.id, type: 'REBOQUE',
        pickup: PICKUP_JSON, pickupLabel: 'Av. Paulista, 1000',
        destination: DEST_JSON, destinationLabel: 'Rua Augusta, 500',
        price: 180, originalPrice: 200, discount: 20, promoCode: 'PROMO10',
        paymentMethod: 'PIX', paymentStatus: 'PAID',
        distanceKm: 5.5, etaMin: 12, status: 'COMPLETED',
        providerId: providerProfile.id, acceptedAt: new Date(Date.now() - 3600_000), completedAt: new Date(),
      },
    })
    // Service 2: otherClientUser is the client
    otherClientService = await db.serviceRequest.create({
      data: {
        clientId: otherClientUser.id, type: 'PNEU',
        pickup: PICKUP_JSON, pickupLabel: 'Other Pickup',
        destination: DEST_JSON, destinationLabel: 'Other Dest',
        price: 100, originalPrice: 100, discount: 0,
        paymentMethod: 'CASH', paymentStatus: 'PENDING',
        distanceKm: 2.0, etaMin: 8, status: 'REQUESTED',
      },
    })
    // Service 3: owned by providerProfile (provider view)
    providerOwnedService = await db.serviceRequest.create({
      data: {
        clientId: otherClientUser.id, type: 'BATERIA',
        pickup: PICKUP_JSON, pickupLabel: 'Bat Pickup',
        destination: DEST_JSON, destinationLabel: 'Bat Dest',
        price: 110, originalPrice: 110, discount: 0,
        paymentMethod: 'PIX', paymentStatus: 'PAID',
        distanceKm: 3.0, etaMin: 10, status: 'COMPLETED',
        providerId: providerProfile.id, acceptedAt: new Date(Date.now() - 1800_000), completedAt: new Date(),
      },
    })
    // Service 4: owned by otherProviderProfile
    otherProviderService = await db.serviceRequest.create({
      data: {
        clientId: clientUser.id, type: 'COMBUSTIVEL',
        pickup: PICKUP_JSON, pickupLabel: 'Fuel Pickup',
        destination: DEST_JSON, destinationLabel: 'Fuel Dest',
        price: 90, originalPrice: 90, discount: 0,
        paymentMethod: 'CARD', paymentStatus: 'PENDING',
        distanceKm: 1.5, etaMin: 6, status: 'REQUESTED',
        providerId: otherProviderProfile.id,
      },
    })
    createdServiceIds.push(ownService.id, otherClientService.id, providerOwnedService.id, otherProviderService.id)

    // Add a timeline event to ownService
    await db.serviceTimelineEvent.create({
      data: { serviceId: ownService.id, status: 'ACCEPTED', label: 'Prestador aceitou a chamada' },
    })
    await db.serviceTimelineEvent.create({
      data: { serviceId: ownService.id, status: 'COMPLETED', label: 'Serviço concluído' },
    })
  })

  afterEach(async () => {
    for (const id of createdServiceIds) {
      await db.serviceRequest.delete({ where: { id } }).catch(() => {})
    }
    createdServiceIds.length = 0
    for (const id of createdProviderIds) {
      await db.providerProfile.delete({ where: { id } }).catch(() => {})
    }
    createdProviderIds.length = 0
    for (const id of createdUserIds) {
      await db.user.delete({ where: { id } }).catch(() => {})
    }
    createdUserIds.length = 0
  })

  describe('authorizeHistoryRequest', () => {
    test('1. no session + no dbUserId → 401', () => {
      const r = authorizeHistoryRequest({ sessionUser: null, queryDbUserId: null, expectedRole: 'CLIENT', nodeEnv: 'development' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(401)
    })

    test('2. dev dbUserId → ok', () => {
      const r = authorizeHistoryRequest({ sessionUser: null, queryDbUserId: clientUser.id, expectedRole: 'CLIENT', nodeEnv: 'development' })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.actor.userId).toBe(clientUser.id)
    })

    test('3. prod dbUserId → 401', () => {
      const r = authorizeHistoryRequest({ sessionUser: null, queryDbUserId: clientUser.id, expectedRole: 'CLIENT', nodeEnv: 'production' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(401)
    })

    test('4. session takes priority over dbUserId', () => {
      const r = authorizeHistoryRequest({ sessionUser: { id: 'session_user', role: 'CLIENT' }, queryDbUserId: 'db_user', expectedRole: 'CLIENT', nodeEnv: 'development' })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.actor.userId).toBe('session_user')
    })

    test('5. role mismatch (session PROVIDER, expected CLIENT) → 401 in prod', () => {
      const r = authorizeHistoryRequest({ sessionUser: { id: 'u', role: 'PROVIDER' }, queryDbUserId: null, expectedRole: 'CLIENT', nodeEnv: 'production' })
      expect(r.ok).toBe(false)
    })

    test('6. role mismatch falls back to dbUserId in dev', () => {
      const r = authorizeHistoryRequest({ sessionUser: { id: 'u', role: 'PROVIDER' }, queryDbUserId: 'db_u', expectedRole: 'CLIENT', nodeEnv: 'development' })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.actor.userId).toBe('db_u')
    })
  })

  describe('Client access', () => {
    const clientActor = (): HistoryActor => ({ userId: clientUser.id, role: 'CLIENT' })

    test('7. client sees own services', async () => {
      const services = await getClientServices(clientActor(), 50)
      const ids = services.map((s) => s.id)
      expect(ids).toContain(ownService.id)
    })

    test('8. client does NOT see other client services', async () => {
      const services = await getClientServices(clientActor(), 50)
      const ids = services.map((s) => s.id)
      expect(ids).not.toContain(otherClientService.id)
    })

    test('9. client detail includes timeline', async () => {
      const r = await getClientServiceDetail(clientActor(), ownService.id)
      expect(r.status).toBe(200)
      if (r.status === 200) {
        expect(Array.isArray(r.data.timeline)).toBe(true)
        expect(r.data.timeline.length).toBeGreaterThanOrEqual(2)
      }
    })

    test('10. cross-access (client trying other client service) → 404', async () => {
      const r = await getClientServiceDetail(clientActor(), otherClientService.id)
      expect(r.status).toBe(404)
    })
  })

  describe('Provider access', () => {
    const providerActor = (): HistoryActor => ({ userId: providerUser.id, role: 'PROVIDER' })

    test('11. provider sees own services', async () => {
      const services = await getProviderServices(providerActor(), providerProfile.id, 50)
      const ids = services.map((s) => s.id)
      expect(ids).toContain(providerOwnedService.id)
      expect(ids).toContain(ownService.id) // also assigned to this provider
    })

    test('12. provider does NOT see other provider services', async () => {
      const services = await getProviderServices(providerActor(), providerProfile.id, 50)
      const ids = services.map((s) => s.id)
      expect(ids).not.toContain(otherProviderService.id)
    })

    test('13. provider detail shows providerPayout but NOT platformFee', async () => {
      const r = await getProviderServiceDetail(providerActor(), providerProfile.id, ownService.id)
      expect(r.status).toBe(200)
      if (r.status === 200) {
        expect(r.data.providerPayout).toBeDefined()
        expect(r.data.providerPayout).toBeGreaterThan(0)
        // platformFee is NOT a field on HistoryListItem/HistoryDetail
        expect((r.data as any).platformFee).toBeUndefined()
      }
    })

    test('14. cross-access (provider trying other provider service) → 404', async () => {
      const r = await getProviderServiceDetail(providerActor(), providerProfile.id, otherProviderService.id)
      expect(r.status).toBe(404)
    })
  })

  describe('Security — visibility rules (FASE 25.4)', () => {
    test('15. client list items do NOT include platformFee', async () => {
      const clientActor: HistoryActor = { userId: clientUser.id, role: 'CLIENT' }
      const services = await getClientServices(clientActor, 50)
      for (const s of services) {
        expect((s as any).platformFee).toBeUndefined()
      }
    })

    test('16. provider list items do NOT include platformFee but DO include providerPayout', async () => {
      const providerActor: HistoryActor = { userId: providerUser.id, role: 'PROVIDER' }
      const services = await getProviderServices(providerActor, providerProfile.id, 50)
      for (const s of services) {
        expect((s as any).platformFee).toBeUndefined()
        expect(s.providerPayout).toBeDefined()
        expect(s.providerPayout).toBeGreaterThan(0)
      }
    })

    test('17. FASE 25.4 NEW: client detail does NOT include platformFee or providerPayout', async () => {
      const clientActor: HistoryActor = { userId: clientUser.id, role: 'CLIENT' }
      const r = await getClientServiceDetail(clientActor, ownService.id)
      expect(r.status).toBe(200)
      if (r.status === 200) {
        expect((r.data as any).platformFee).toBeUndefined()
        expect((r.data as any).providerPayout).toBeUndefined()
      }
    })

    test('18. FASE 25.4 NEW: provider detail includes providerPayout but NOT platformFee', async () => {
      const providerActor: HistoryActor = { userId: providerUser.id, role: 'PROVIDER' }
      const r = await getProviderServiceDetail(providerActor, providerProfile.id, ownService.id)
      expect(r.status).toBe(200)
      if (r.status === 200) {
        expect(r.data.providerPayout).toBeDefined()
        expect(r.data.providerPayout).toBeGreaterThan(0)
        expect((r.data as any).platformFee).toBeUndefined()
      }
    })

    test('19. provider payout is exactly 80% of price', async () => {
      const providerActor: HistoryActor = { userId: providerUser.id, role: 'PROVIDER' }
      const r = await getProviderServiceDetail(providerActor, providerProfile.id, ownService.id)
      expect(r.status).toBe(200)
      if (r.status === 200) {
        const expected = Math.round(180 * 0.8 * 100) / 100 // price=180
        expect(r.data.providerPayout).toBe(expected)
      }
    })

    test('20. client detail breakdownText does NOT contain "Taxa da plataforma" or "Repasse"', async () => {
      const clientActor: HistoryActor = { userId: clientUser.id, role: 'CLIENT' }
      const r = await getClientServiceDetail(clientActor, ownService.id)
      expect(r.status).toBe(200)
      if (r.status === 200) {
        const joined = (r.data.breakdownText || []).join('|')
        expect(joined.toLowerCase()).not.toContain('taxa da plataforma')
        expect(joined.toLowerCase()).not.toContain('repasse')
      }
    })

    test('21. provider detail breakdownText contains "repasse" but NOT "taxa da plataforma"', async () => {
      const providerActor: HistoryActor = { userId: providerUser.id, role: 'PROVIDER' }
      const r = await getProviderServiceDetail(providerActor, providerProfile.id, ownService.id)
      expect(r.status).toBe(200)
      if (r.status === 200) {
        const joined = (r.data.breakdownText || []).join('|').toLowerCase()
        expect(joined).toContain('repasse')
        expect(joined).not.toContain('taxa da plataforma')
      }
    })
  })
})
