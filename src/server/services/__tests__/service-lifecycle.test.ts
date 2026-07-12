import { describe, expect, test } from 'bun:test'
import {
  acceptServiceOffer,
  canTransitionServiceStatus,
  createOperationalService,
  declineServiceOffer,
  registerServiceOffers,
  transitionServiceStatus,
} from '../service-lifecycle'

function createFakeDb() {
  const services: any[] = []
  const providers: any[] = []
  const offers: any[] = []
  const timeline: any[] = []
  let seq = 1
  const id = (prefix: string) => `${prefix}_${seq++}`

  const db = {
    _state: { services, providers, offers, timeline },
    serviceRequest: {
      create: async ({ data }: any) => {
        const service = {
          id: id('svc'),
          providerId: null,
          providerLat: null,
          providerLng: null,
          paymentStatus: 'PENDING',
          createdAt: new Date(),
          offeredAt: null,
          acceptedAt: null,
          enRouteAt: null,
          arrivedAt: null,
          startedAt: null,
          completedAt: null,
          canceledAt: null,
          canceledByRole: null,
          canceledByUserId: null,
          cancellationReason: null,
          ...data,
          timeline: undefined,
        }
        services.push(service)
        if (data.timeline?.create) {
          timeline.push({
            id: id('tl'),
            serviceId: service.id,
            createdAt: new Date(),
            ...data.timeline.create,
          })
        }
        return service
      },
      findUnique: async ({ where }: any) => services.find((service) => service.id === where.id) || null,
      update: async ({ where, data }: any) => {
        const service = services.find((item) => item.id === where.id)
        if (!service) throw new Error('service not found')
        Object.assign(service, data)
        return service
      },
    },
    serviceTimelineEvent: {
      create: async ({ data }: any) => {
        const event = { id: id('tl'), createdAt: new Date(), ...data }
        timeline.push(event)
        return event
      },
    },
    providerProfile: {
      findUnique: async ({ where }: any) => providers.find((provider) => provider.id === where.id) || null,
    },
    serviceOffer: {
      findUnique: async ({ where }: any) =>
        offers.find((offer) =>
          offer.serviceId === where.serviceId_providerId.serviceId &&
          offer.providerId === where.serviceId_providerId.providerId,
        ) || null,
      create: async ({ data }: any) => {
        const offer = {
          id: id('offer'),
          reason: null,
          respondedAt: null,
          offeredAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }
        offers.push(offer)
        return offer
      },
      update: async ({ where, data }: any) => {
        const offer = offers.find((item) => item.id === where.id)
        if (!offer) throw new Error('offer not found')
        Object.assign(offer, data, { updatedAt: new Date() })
        return offer
      },
      updateMany: async ({ where, data }: any) => {
        const selected = offers.filter((offer) => {
          if (where.serviceId && offer.serviceId !== where.serviceId) return false
          if (where.status && offer.status !== where.status) return false
          if (where.providerId?.not && offer.providerId === where.providerId.not) return false
          if (where.providerId?.in && !where.providerId.in.includes(offer.providerId)) return false
          return true
        })
        selected.forEach((offer) => Object.assign(offer, data, { updatedAt: new Date() }))
        return { count: selected.length }
      },
    },
  }

  providers.push(
    {
      id: 'provider_approved',
      userId: 'user_provider_approved',
      vehicle: 'Guincho',
      plate: 'AAA1A11',
      approvalStatus: 'APPROVED',
      isVerified: true,
      documentStatus: 'APPROVED',
      vehicleStatus: 'APPROVED',
      isDemoProvider: false,
      user: { id: 'user_provider_approved', status: 'ACTIVE' },
    },
    {
      id: 'provider_pending',
      userId: 'user_provider_pending',
      vehicle: 'Moto',
      plate: 'BBB2B22',
      approvalStatus: 'PENDING',
      isVerified: false,
      documentStatus: 'PENDING',
      vehicleStatus: 'PENDING',
      isDemoProvider: false,
      user: { id: 'user_provider_pending', status: 'ACTIVE' },
    },
    {
      id: 'provider_suspended',
      userId: 'user_provider_suspended',
      vehicle: 'Guincho',
      plate: 'CCC3C33',
      approvalStatus: 'SUSPENDED',
      isVerified: false,
      documentStatus: 'APPROVED',
      vehicleStatus: 'APPROVED',
      isDemoProvider: false,
      user: { id: 'user_provider_suspended', status: 'ACTIVE' },
    },
  )

  return db
}

async function createService(db: ReturnType<typeof createFakeDb>) {
  return createOperationalService(db as any, {
    clientId: 'client_1',
    type: 'REBOQUE',
    description: 'Pane no acostamento',
    pickup: { lat: -23.55, lng: -46.63 },
    pickupLabel: 'Origem',
    destination: { lat: -23.57, lng: -46.65 },
    destinationLabel: 'Destino',
    distanceKm: 4.2,
    etaMin: 12,
    price: 180,
    originalPrice: 180,
    discount: 0,
    promoCode: null,
    paymentMethod: 'PIX',
  })
}

describe('service lifecycle persistence', () => {
  test('creates a persisted request with request_created timeline and audit', async () => {
    const db = createFakeDb()
    const auditEvents: string[] = []

    const service = await createOperationalService(db as any, {
      clientId: 'client_1',
      type: 'PNEU',
      description: 'Pneu furado',
      pickup: { lat: 1, lng: 2 },
      pickupLabel: 'Avenida A',
      destination: { lat: 3, lng: 4 },
      destinationLabel: 'Avenida B',
      distanceKm: 2,
      etaMin: 8,
      price: 100,
      originalPrice: 100,
      discount: 0,
      paymentMethod: 'PIX',
    }, {
      audit: (event) => auditEvents.push(event),
    })

    expect(service.status).toBe('REQUESTED')
    expect(db._state.services).toHaveLength(1)
    expect(db._state.timeline[0].eventType).toBe('request_created')
    expect(auditEvents).toEqual(['request_created'])
  })

  test('registers offers only for approved providers', async () => {
    const db = createFakeDb()
    const service = await createService(db)

    const result = await registerServiceOffers(db as any, service.id, [
      'provider_pending',
      'provider_approved',
      'provider_suspended',
    ], {
      label: 'Oferta enviada',
    })

    expect(result.offeredProviderIds).toEqual(['provider_approved'])
    expect(result.blockedProviderIds.sort()).toEqual(['provider_pending', 'provider_suspended'])
    expect(db._state.services[0].status).toBe('OFFERED')
    expect(db._state.offers).toHaveLength(1)
    expect(db._state.offers[0].status).toBe('PENDING')
  })

  test('acceptance links provider, cancels competing offers and supports valid transitions', async () => {
    const db = createFakeDb()
    const service = await createService(db)
    await registerServiceOffers(db as any, service.id, ['provider_approved'], { label: 'Oferta enviada' })

    await acceptServiceOffer(db as any, service.id, 'provider_approved', {
      label: 'Prestador aceitou',
      actorRole: 'PROVIDER',
      providerProfileId: 'provider_approved',
    })
    expect(db._state.services[0].status).toBe('ACCEPTED')
    expect(db._state.services[0].providerId).toBe('provider_approved')
    expect(db._state.offers[0].status).toBe('ACCEPTED')

    await transitionServiceStatus(db as any, service.id, 'PROVIDER_EN_ROUTE', { label: 'A caminho' })
    await transitionServiceStatus(db as any, service.id, 'ARRIVED', { label: 'Chegou' })
    await transitionServiceStatus(db as any, service.id, 'IN_PROGRESS', { label: 'Iniciou' })
    await transitionServiceStatus(db as any, service.id, 'COMPLETED', { label: 'Concluiu' })

    expect(db._state.services[0].status).toBe('COMPLETED')
    expect(db._state.services[0].completedAt).toBeInstanceOf(Date)
    const before = db._state.timeline.length
    const repeated = await transitionServiceStatus(db as any, service.id, 'COMPLETED', { label: 'Concluiu novamente' })
    expect(repeated.changed).toBe(false)
    expect(db._state.timeline).toHaveLength(before)
  })

  test('decline and cancel keep operational reasons', async () => {
    const db = createFakeDb()
    const service = await createService(db)
    await registerServiceOffers(db as any, service.id, ['provider_approved'], { label: 'Oferta enviada' })

    await declineServiceOffer(db as any, service.id, 'provider_approved', {
      label: 'Prestador recusou',
      reason: 'provider_declined',
    })
    expect(db._state.offers[0].status).toBe('DECLINED')
    expect(db._state.offers[0].reason).toBe('provider_declined')

    await transitionServiceStatus(db as any, service.id, 'REQUESTED', { label: 'Voltando a busca' })
    await transitionServiceStatus(db as any, service.id, 'CANCELED', {
      label: 'Cliente cancelou',
      actorRole: 'CLIENT',
      actorUserId: 'client_1',
      canceledByRole: 'CLIENT',
      canceledByUserId: 'client_1',
      cancellationReason: 'client_cancelled',
    })
    expect(db._state.services[0].status).toBe('CANCELED')
    expect(db._state.services[0].cancellationReason).toBe('client_cancelled')
    expect(db._state.services[0].canceledByRole).toBe('CLIENT')
  })

  test('blocks invalid status transitions', async () => {
    expect(canTransitionServiceStatus('REQUESTED', 'COMPLETED')).toBe(false)

    const db = createFakeDb()
    const service = await createService(db)
    await expect(
      transitionServiceStatus(db as any, service.id, 'COMPLETED', { label: 'Invalid' }),
    ).rejects.toThrow(/Invalid service transition/)
  })
})
