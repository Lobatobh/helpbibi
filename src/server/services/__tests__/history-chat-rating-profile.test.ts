import { afterEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { GET as getClientServices } from '@/app/api/client/services/route'
import { GET as getClientServiceDetail } from '@/app/api/client/services/[id]/route'
import { GET as getProviderServices } from '@/app/api/provider/services/route'
import { GET as getProviderServiceDetail } from '@/app/api/provider/services/[id]/route'
import { GET as getChat, POST as postChat } from '@/app/api/services/[id]/chat/route'
import { POST as postRating } from '@/app/api/services/[id]/ratings/route'
import { GET as getClientProfile, PATCH as patchClientProfile } from '@/app/api/client/profile/route'
import { GET as getProviderProfile, PATCH as patchProviderProfile } from '@/app/api/provider/profile/route'
import { setSessionCookie } from '@/server/auth/session'
import { db } from '@/server/db/prisma'

const TEST_MARKER = 'f35-06'
const PICKUP = JSON.stringify({ lat: -23.5505, lng: -46.6333 })
const DESTINATION = JSON.stringify({ lat: -23.5614, lng: -46.6559 })

const createdServiceIds: string[] = []
const createdUserIds: string[] = []

function uniqueEmail(kind: string) {
  return `${TEST_MARKER}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}@helpbibi.test`
}

function sessionCookie(userId: string, role: 'CLIENT' | 'PROVIDER' | 'ADMIN') {
  return setSessionCookie(userId, role).split(';')[0]
}

function request(url: string, cookie?: string) {
  return new NextRequest(url, {
    headers: cookie ? { cookie } : {},
  })
}

function jsonRequest(url: string, body: unknown, cookie?: string, method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function createUser(role: 'CLIENT' | 'PROVIDER' | 'ADMIN', kind: string) {
  const user = await db.user.create({
    data: {
      email: uniqueEmail(kind),
      name: `${TEST_MARKER} ${role} ${kind}`,
      phone: '11999990000',
      passwordHash: `hash-${kind}`,
      role,
      status: 'ACTIVE',
      ...(role === 'CLIENT' ? { clientProfile: { create: {} } } : {}),
      ...(role === 'PROVIDER'
        ? {
            providerProfile: {
              create: {
                vehicle: 'Guincho Plataforma',
                plate: `F35${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
                city: 'Sao Paulo',
                isAvailable: false,
                isVerified: true,
                approvalStatus: 'APPROVED',
                documentStatus: 'APPROVED',
                vehicleStatus: 'APPROVED',
              },
            },
          }
        : {}),
    },
    include: { providerProfile: true },
  })
  createdUserIds.push(user.id)
  return user
}

async function createService(input: {
  clientId: string
  providerId?: string | null
  status?: 'REQUESTED' | 'ACCEPTED' | 'COMPLETED'
  withPayment?: boolean
}) {
  const service = await db.serviceRequest.create({
    data: {
      clientId: input.clientId,
      providerId: input.providerId || null,
      type: 'REBOQUE',
      description: 'Pane no acostamento',
      status: input.status || 'COMPLETED',
      pickup: PICKUP,
      pickupLabel: 'Av. Paulista, 1000',
      destination: DESTINATION,
      destinationLabel: 'Rua Augusta, 500',
      distanceKm: 4.2,
      etaMin: 12,
      price: 180,
      originalPrice: 180,
      discount: 0,
      paymentMethod: 'PIX',
      paymentStatus: input.withPayment ? 'PAID' : 'PENDING',
      acceptedAt: input.providerId ? new Date() : null,
      completedAt: input.status === 'COMPLETED' || !input.status ? new Date() : null,
      timeline: {
        create: [
          { status: 'REQUESTED', label: 'Solicitacao criada' },
          { status: input.status || 'COMPLETED', label: 'Status atual' },
        ],
      },
      ...(input.withPayment
        ? {
            paymentRecords: {
              create: {
                method: 'PIX',
                status: 'PAID',
                amount: 180,
                platformFee: 36,
                providerPayout: 144,
                paidAt: new Date(),
              },
            },
          }
        : {}),
    },
  })
  createdServiceIds.push(service.id)
  return service
}

async function createFixture() {
  const client = await createUser('CLIENT', 'client')
  const otherClient = await createUser('CLIENT', 'other-client')
  const providerUser = await createUser('PROVIDER', 'provider')
  const otherProviderUser = await createUser('PROVIDER', 'other-provider')
  const providerProfile = providerUser.providerProfile!
  const otherProviderProfile = otherProviderUser.providerProfile!
  const service = await createService({
    clientId: client.id,
    providerId: providerProfile.id,
    status: 'COMPLETED',
    withPayment: true,
  })
  const serviceWithoutPayment = await createService({
    clientId: client.id,
    providerId: providerProfile.id,
    status: 'COMPLETED',
    withPayment: false,
  })
  const otherClientService = await createService({
    clientId: otherClient.id,
    providerId: providerProfile.id,
    status: 'COMPLETED',
  })
  const otherProviderService = await createService({
    clientId: client.id,
    providerId: otherProviderProfile.id,
    status: 'COMPLETED',
  })
  const activeService = await createService({
    clientId: client.id,
    providerId: providerProfile.id,
    status: 'ACCEPTED',
  })
  return {
    client,
    otherClient,
    providerUser,
    otherProviderUser,
    providerProfile,
    otherProviderProfile,
    service,
    serviceWithoutPayment,
    otherClientService,
    otherProviderService,
    activeService,
  }
}

afterEach(async () => {
  for (const id of createdServiceIds.splice(0)) {
    await db.serviceRequest.delete({ where: { id } }).catch(() => {})
  }
  for (const id of createdUserIds.splice(0)) {
    await db.user.delete({ where: { id } }).catch(() => {})
  }
})

describe('F35-06 authenticated history access', () => {
  test('client and provider history use session identity and ignore query spoofing', async () => {
    const fixture = await createFixture()
    const clientCookie = sessionCookie(fixture.client.id, 'CLIENT')
    const providerCookie = sessionCookie(fixture.providerUser.id, 'PROVIDER')

    const clientResponse = await getClientServices(request(
      `http://localhost/api/client/services?dbUserId=${fixture.otherClient.id}`,
      clientCookie,
    ))
    const clientPayload = await clientResponse.json()
    expect(clientResponse.status).toBe(200)
    expect(clientPayload.services.some((item: any) => item.id === fixture.service.id)).toBe(true)
    expect(clientPayload.services.some((item: any) => item.id === fixture.otherClientService.id)).toBe(false)

    const providerResponse = await getProviderServices(request(
      `http://localhost/api/provider/services?providerProfileId=${fixture.otherProviderProfile.id}`,
      providerCookie,
    ))
    const providerPayload = await providerResponse.json()
    expect(providerResponse.status).toBe(200)
    expect(providerPayload.providerProfileId).toBe(fixture.providerProfile.id)
    expect(providerPayload.services.some((item: any) => item.id === fixture.service.id)).toBe(true)
    expect(providerPayload.services.some((item: any) => item.id === fixture.otherProviderService.id)).toBe(false)
  })

  test('detail access is blocked across users/providers and services without payment still load', async () => {
    const fixture = await createFixture()
    const clientCookie = sessionCookie(fixture.client.id, 'CLIENT')
    const otherClientCookie = sessionCookie(fixture.otherClient.id, 'CLIENT')
    const providerCookie = sessionCookie(fixture.providerUser.id, 'PROVIDER')
    const otherProviderCookie = sessionCookie(fixture.otherProviderUser.id, 'PROVIDER')

    const ownDetail = await getClientServiceDetail(
      request(`http://localhost/api/client/services/${fixture.serviceWithoutPayment.id}`, clientCookie),
      { params: Promise.resolve({ id: fixture.serviceWithoutPayment.id }) },
    )
    const ownPayload = await ownDetail.json()
    expect(ownDetail.status).toBe(200)
    expect(ownPayload.latestPayment).toBeNull()
    expect(Array.isArray(ownPayload.timeline)).toBe(true)
    expect(ownPayload.timeline.length).toBeGreaterThan(0)

    const wrongClient = await getClientServiceDetail(
      request(`http://localhost/api/client/services/${fixture.service.id}`, otherClientCookie),
      { params: Promise.resolve({ id: fixture.service.id }) },
    )
    expect(wrongClient.status).toBe(404)

    const wrongProvider = await getProviderServiceDetail(
      request(`http://localhost/api/provider/services/${fixture.service.id}`, otherProviderCookie),
      { params: Promise.resolve({ id: fixture.service.id }) },
    )
    expect(wrongProvider.status).toBe(404)

    const providerDetail = await getProviderServiceDetail(
      request(`http://localhost/api/provider/services/${fixture.service.id}`, providerCookie),
      { params: Promise.resolve({ id: fixture.service.id }) },
    )
    const providerPayload = await providerDetail.json()
    expect(providerDetail.status).toBe(200)
    expect(providerPayload.latestPayment.providerPayout).toBe(144)
    expect(JSON.stringify(providerPayload)).not.toContain('platformFee')
  })
})

describe('F35-06 authenticated chat', () => {
  test('participants can read/send chat, third parties cannot, and messages are persisted', async () => {
    const fixture = await createFixture()
    const clientCookie = sessionCookie(fixture.client.id, 'CLIENT')
    const providerCookie = sessionCookie(fixture.providerUser.id, 'PROVIDER')
    const otherClientCookie = sessionCookie(fixture.otherClient.id, 'CLIENT')
    const params = { params: Promise.resolve({ id: fixture.activeService.id }) }

    const empty = await postChat(jsonRequest(
      `http://localhost/api/services/${fixture.activeService.id}/chat`,
      { text: '   ' },
      clientCookie,
    ), params)
    expect(empty.status).toBe(400)

    const tooLong = await postChat(jsonRequest(
      `http://localhost/api/services/${fixture.activeService.id}/chat`,
      { text: 'x'.repeat(501) },
      clientCookie,
    ), params)
    expect(tooLong.status).toBe(400)

    const blocked = await postChat(jsonRequest(
      `http://localhost/api/services/${fixture.activeService.id}/chat`,
      { text: 'Nao sou participante' },
      otherClientCookie,
    ), params)
    expect(blocked.status).toBe(404)

    const created = await postChat(jsonRequest(
      `http://localhost/api/services/${fixture.activeService.id}/chat`,
      { text: ' Mensagem persistida ', role: 'provider', userId: fixture.otherClient.id },
      clientCookie,
    ), params)
    const createdPayload = await created.json()
    expect(created.status).toBe(201)
    expect(createdPayload.message.from).toBe('client')
    expect(createdPayload.message.text).toBe('Mensagem persistida')

    const dbMessage = await db.serviceChatMessage.findUnique({ where: { id: createdPayload.message.id } })
    expect(dbMessage?.text).toBe('Mensagem persistida')

    const providerRead = await getChat(
      request(`http://localhost/api/services/${fixture.activeService.id}/chat`, providerCookie),
      params,
    )
    const providerPayload = await providerRead.json()
    expect(providerRead.status).toBe(200)
    expect(providerPayload.messages.some((item: any) => item.id === createdPayload.message.id)).toBe(true)

    const thirdPartyRead = await getChat(
      request(`http://localhost/api/services/${fixture.activeService.id}/chat`, otherClientCookie),
      params,
    )
    expect(thirdPartyRead.status).toBe(404)
  })
})

describe('F35-06 authenticated ratings', () => {
  test('ratings require completed participant service, derive targetRole and avoid duplicates', async () => {
    const fixture = await createFixture()
    const clientCookie = sessionCookie(fixture.client.id, 'CLIENT')
    const otherClientCookie = sessionCookie(fixture.otherClient.id, 'CLIENT')
    const completedParams = { params: Promise.resolve({ id: fixture.service.id }) }
    const activeParams = { params: Promise.resolve({ id: fixture.activeService.id }) }

    const invalid = await postRating(jsonRequest(
      `http://localhost/api/services/${fixture.service.id}/ratings`,
      { stars: 6 },
      clientCookie,
    ), completedParams)
    expect(invalid.status).toBe(400)

    const beforeCompleted = await postRating(jsonRequest(
      `http://localhost/api/services/${fixture.activeService.id}/ratings`,
      { stars: 5 },
      clientCookie,
    ), activeParams)
    expect(beforeCompleted.status).toBe(409)

    const outsider = await postRating(jsonRequest(
      `http://localhost/api/services/${fixture.service.id}/ratings`,
      { stars: 5 },
      otherClientCookie,
    ), completedParams)
    expect(outsider.status).toBe(404)

    const first = await postRating(jsonRequest(
      `http://localhost/api/services/${fixture.service.id}/ratings`,
      { stars: 5, comment: 'Otimo', targetRole: 'client' },
      clientCookie,
    ), completedParams)
    const firstPayload = await first.json()
    expect(first.status).toBe(201)
    expect(firstPayload.rating.targetRole).toBe('provider')

    const second = await postRating(jsonRequest(
      `http://localhost/api/services/${fixture.service.id}/ratings`,
      { stars: 1, comment: 'Duplicado' },
      clientCookie,
    ), completedParams)
    const secondPayload = await second.json()
    expect(second.status).toBe(200)
    expect(secondPayload.created).toBe(false)

    const count = await db.serviceRating.count({
      where: { serviceId: fixture.service.id, targetRole: 'provider' },
    })
    expect(count).toBe(1)
  })

  test('provider rates client with derived targetRole', async () => {
    const fixture = await createFixture()
    const providerCookie = sessionCookie(fixture.providerUser.id, 'PROVIDER')
    const params = { params: Promise.resolve({ id: fixture.service.id }) }

    const response = await postRating(jsonRequest(
      `http://localhost/api/services/${fixture.service.id}/ratings`,
      { stars: 4, comment: 'Cliente correto', targetRole: 'provider' },
      providerCookie,
    ), params)
    const payload = await response.json()
    expect(response.status).toBe(201)
    expect(payload.rating.targetRole).toBe('client')
  })
})

describe('F35-06 authenticated profiles', () => {
  test('client profile allows only name and phone and never returns passwordHash', async () => {
    const fixture = await createFixture()
    const cookie = sessionCookie(fixture.client.id, 'CLIENT')

    const before = await db.user.findUniqueOrThrow({ where: { id: fixture.client.id } })
    const response = await patchClientProfile(jsonRequest('http://localhost/api/client/profile', {
      name: 'Cliente Atualizado',
      phone: '11888887777',
      email: 'hijack@helpbibi.test',
      role: 'ADMIN',
      status: 'SUSPENDED',
      passwordHash: 'new-hash',
      id: 'other',
    }, cookie, 'PATCH'))
    const payload = await response.json()
    const after = await db.user.findUniqueOrThrow({ where: { id: fixture.client.id } })

    expect(response.status).toBe(200)
    expect(payload.profile.name).toBe('Cliente Atualizado')
    expect(JSON.stringify(payload)).not.toContain('passwordHash')
    expect(after.phone).toBe('11888887777')
    expect(after.email).toBe(before.email)
    expect(after.role).toBe('CLIENT')
    expect(after.status).toBe('ACTIVE')
    expect(after.passwordHash).toBe(before.passwordHash)

    const getResponse = await getClientProfile(request('http://localhost/api/client/profile', cookie))
    expect(JSON.stringify(await getResponse.json())).not.toContain('passwordHash')
  })

  test('provider profile allows public fields but blocks approval/status/availability changes', async () => {
    const fixture = await createFixture()
    const cookie = sessionCookie(fixture.providerUser.id, 'PROVIDER')

    const response = await patchProviderProfile(jsonRequest('http://localhost/api/provider/profile', {
      name: 'Prestador Atualizado',
      phone: '11777776666',
      vehicle: 'Guincho Leve',
      plate: 'ZZZ9Z99',
      city: 'Campinas',
      approvalStatus: 'SUSPENDED',
      isAvailable: true,
      isVerified: false,
      role: 'ADMIN',
      status: 'SUSPENDED',
      passwordHash: 'new-hash',
    }, cookie, 'PATCH'))
    const payload = await response.json()
    const profile = await db.providerProfile.findUniqueOrThrow({
      where: { id: fixture.providerProfile.id },
      include: { user: true },
    })

    expect(response.status).toBe(200)
    expect(payload.profile.vehicle).toBe('Guincho Leve')
    expect(JSON.stringify(payload)).not.toContain('passwordHash')
    expect(profile.user.name).toBe('Prestador Atualizado')
    expect(profile.user.role).toBe('PROVIDER')
    expect(profile.user.status).toBe('ACTIVE')
    expect(profile.approvalStatus).toBe('APPROVED')
    expect(profile.isAvailable).toBe(false)
    expect(profile.isVerified).toBe(true)

    const getResponse = await getProviderProfile(request('http://localhost/api/provider/profile', cookie))
    expect(JSON.stringify(await getResponse.json())).not.toContain('passwordHash')
  })
})
