import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { NextRequest } from 'next/server'
import { GET as getAuditEvents } from '@/app/api/admin/audit/route'
import { POST as login } from '@/app/api/auth/login/route'
import { GET as getClientServices } from '@/app/api/client/services/route'
import { POST as postClientAction } from '@/app/api/admin/clients/[id]/actions/route'
import { PATCH as patchProvider } from '@/app/api/admin/providers/[id]/route'
import { POST as postProviderAction } from '@/app/api/admin/providers/[id]/actions/route'
import { POST as postServiceAction } from '@/app/api/admin/services/[id]/actions/route'
import { setSessionCookie } from '@/server/auth/session'
import { hashPassword } from '@/server/auth'
import { _clearAuditBufferForTests, getRecentAuditEvents } from '@/server/audit'
import { db } from '@/server/db/prisma'
import { clearRateLimits } from '@/server/rate-limit'
import { registerServiceOffers } from '@/server/services/service-lifecycle'
import { performAdminServiceAction } from '@/server/services/admin-service-actions'

const TEST_MARKER = 'f35-08'
const PICKUP = JSON.stringify({ lat: -23.5505, lng: -46.6333 })
const DESTINATION = JSON.stringify({ lat: -23.5614, lng: -46.6559 })
const ADMIN_REASON = 'Acao administrativa necessaria para suporte operacional'

const createdServiceIds: string[] = []
const createdUserIds: string[] = []
const originalAuditBackend = process.env.AUDIT_LOG_BACKEND

function uniqueEmail(kind: string) {
  return `${TEST_MARKER}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}@helpbibi.test`
}

function sessionCookie(userId: string, role: 'CLIENT' | 'PROVIDER' | 'ADMIN') {
  return setSessionCookie(userId, role).split(';')[0]
}

function request(url: string, options: { cookie?: string; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {
    'x-forwarded-for': `127.35.8.${Math.floor(Math.random() * 200) + 1}`,
  }
  if (options.cookie) headers.cookie = options.cookie
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  return new NextRequest(url, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function createUser(role: 'CLIENT' | 'PROVIDER' | 'ADMIN', kind: string, input: { isAvailable?: boolean } = {}) {
  const user = await db.user.create({
    data: {
      email: uniqueEmail(kind),
      name: `${TEST_MARKER} ${role} ${kind}`,
      phone: '11999990000',
      passwordHash: hashPassword('Senha123!'),
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
                isAvailable: input.isAvailable ?? false,
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
  status?: 'REQUESTED' | 'OFFERED' | 'ACCEPTED' | 'PROVIDER_EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'FAILED'
  paymentStatus?: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELED'
}) {
  const status = input.status || 'REQUESTED'
  const service = await db.serviceRequest.create({
    data: {
      clientId: input.clientId,
      providerId: input.providerId || null,
      type: 'REBOQUE',
      description: 'Pane no acostamento',
      status,
      pickup: PICKUP,
      pickupLabel: 'Av. Paulista, 1000',
      destination: DESTINATION,
      destinationLabel: 'Rua Augusta, 500',
      distanceKm: 4.2,
      etaMin: 12,
      price: 180,
      originalPrice: 200,
      discount: 20,
      paymentMethod: 'PIX',
      paymentStatus: input.paymentStatus || 'PENDING',
      acceptedAt: input.providerId ? new Date() : null,
      startedAt: status === 'IN_PROGRESS' ? new Date() : null,
      completedAt: status === 'COMPLETED' ? new Date() : null,
      canceledAt: status === 'CANCELED' ? new Date() : null,
      timeline: {
        create: { status, label: 'Fixture operacional' },
      },
    },
  })
  createdServiceIds.push(service.id)
  return service
}

async function createPayment(serviceId: string, status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'CANCELED') {
  return db.paymentRecord.create({
    data: {
      serviceRequestId: serviceId,
      method: 'PIX',
      status,
      amount: 180,
      platformFee: 36,
      providerPayout: 144,
      provider: 'simulated',
      providerPaymentId: `${TEST_MARKER}-provider-${status}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      externalReference: `${TEST_MARKER}-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      idempotencyKey: `${TEST_MARKER}-idem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      paidAt: status === 'PAID' ? new Date() : null,
      events: {
        create: {
          eventType: status,
          fromStatus: null,
          toStatus: status,
          message: 'Fixture payment event',
          rawPayload: JSON.stringify({ fixture: TEST_MARKER, status }),
        },
      },
    },
  })
}

async function cleanup() {
  if (createdServiceIds.length) {
    await db.serviceRequest.deleteMany({ where: { id: { in: [...createdServiceIds] } } }).catch(() => {})
  }
  if (createdUserIds.length) {
    await db.user.deleteMany({ where: { id: { in: [...createdUserIds] } } }).catch(() => {})
  }
  await db.user.deleteMany({ where: { email: { contains: TEST_MARKER } } }).catch(() => {})
  createdServiceIds.length = 0
  createdUserIds.length = 0
  _clearAuditBufferForTests()
  await clearRateLimits()
}

beforeEach(async () => {
  process.env.AUDIT_LOG_BACKEND = 'memory'
  await cleanup()
})

afterEach(cleanup)

afterAll(() => {
  if (originalAuditBackend === undefined) delete process.env.AUDIT_LOG_BACKEND
  else process.env.AUDIT_LOG_BACKEND = originalAuditBackend
})

describe('F35-08 admin service action authorization and validation', () => {
  test('anonymous, CLIENT and PROVIDER cannot execute ADMIN service actions', async () => {
    const client = await createUser('CLIENT', 'auth-client')
    const provider = await createUser('PROVIDER', 'auth-provider')
    const service = await createService({ clientId: client.id })

    const anonymous = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      body: { action: 'cancel', reason: ADMIN_REASON },
    }), params(service.id))
    const clientResponse = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      cookie: sessionCookie(client.id, 'CLIENT'),
      body: { action: 'cancel', reason: ADMIN_REASON },
    }), params(service.id))
    const providerResponse = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      cookie: sessionCookie(provider.id, 'PROVIDER'),
      body: { action: 'cancel', reason: ADMIN_REASON },
    }), params(service.id))

    expect(anonymous.status).toBe(401)
    expect(clientResponse.status).toBe(403)
    expect(providerResponse.status).toBe(403)
  })

  test('reason is required, length-limited and centrally enforced', async () => {
    const admin = await createUser('ADMIN', 'reason-admin')
    const client = await createUser('CLIENT', 'reason-client')
    const service = await createService({ clientId: client.id })
    const cookie = sessionCookie(admin.id, 'ADMIN')

    const missing = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      cookie,
      body: { action: 'cancel' },
    }), params(service.id))
    const short = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      cookie,
      body: { action: 'cancel', reason: 'curto' },
    }), params(service.id))
    const long = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      cookie,
      body: { action: 'cancel', reason: 'x'.repeat(501) },
    }), params(service.id))

    expect(missing.status).toBe(400)
    expect(short.status).toBe(400)
    expect(long.status).toBe(400)
  })
})

describe('F35-08 admin service status transitions', () => {
  test('ADMIN cancels active service with actor, reason, timeline, audit and PENDING simulated payment cancel', async () => {
    const admin = await createUser('ADMIN', 'cancel-admin')
    const client = await createUser('CLIENT', 'cancel-client')
    const service = await createService({ clientId: client.id, status: 'ACCEPTED' })
    const payment = await createPayment(service.id, 'PENDING')

    const response = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      cookie: sessionCookie(admin.id, 'ADMIN'),
      body: { action: 'cancel', reason: ADMIN_REASON },
    }), params(service.id))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.changed).toBe(true)
    expect(payload.payment.changed).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('passwordHash')
    expect(JSON.stringify(payload)).not.toContain('SESSION_SECRET')
    expect(JSON.stringify(payload)).not.toContain('PAYMENT_WEBHOOK_SECRET')

    const updated = await db.serviceRequest.findUniqueOrThrow({
      where: { id: service.id },
      include: { timeline: true },
    })
    const updatedPayment = await db.paymentRecord.findUniqueOrThrow({
      where: { id: payment.id },
      include: { events: true },
    })
    expect(updated.status).toBe('CANCELED')
    expect(updated.canceledByRole).toBe('ADMIN')
    expect(updated.canceledByUserId).toBe(admin.id)
    expect(updated.cancellationReason).toBe(ADMIN_REASON)
    expect(updated.timeline.some((event) => event.eventType === 'admin_service_cancelled')).toBe(true)
    expect(updatedPayment.status).toBe('CANCELED')
    expect(updatedPayment.events.filter((event) => event.eventType === 'CANCELED')).toHaveLength(1)
  })

  test('ADMIN marks active service as FAILED and cancels AUTHORIZED simulated payment', async () => {
    const admin = await createUser('ADMIN', 'fail-admin')
    const client = await createUser('CLIENT', 'fail-client')
    const service = await createService({ clientId: client.id, status: 'PROVIDER_EN_ROUTE', paymentStatus: 'AUTHORIZED' })
    const payment = await createPayment(service.id, 'AUTHORIZED')

    const response = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      cookie: sessionCookie(admin.id, 'ADMIN'),
      body: { action: 'fail', reason: ADMIN_REASON },
    }), params(service.id))

    expect(response.status).toBe(200)
    const updated = await db.serviceRequest.findUniqueOrThrow({ where: { id: service.id }, include: { timeline: true } })
    const updatedPayment = await db.paymentRecord.findUniqueOrThrow({ where: { id: payment.id }, include: { events: true } })
    expect(updated.status).toBe('FAILED')
    expect(updated.timeline.some((event) => event.eventType === 'admin_service_failed')).toBe(true)
    expect(updatedPayment.status).toBe('CANCELED')
    expect(updatedPayment.events.filter((event) => event.eventType === 'CANCELED')).toHaveLength(1)
  })

  test('complete only works from IN_PROGRESS and does not alter payment', async () => {
    const admin = await createUser('ADMIN', 'complete-admin')
    const client = await createUser('CLIENT', 'complete-client')
    const requested = await createService({ clientId: client.id, status: 'REQUESTED' })
    const accepted = await createService({ clientId: client.id, status: 'ACCEPTED' })
    const inProgress = await createService({ clientId: client.id, status: 'IN_PROGRESS' })
    const payment = await createPayment(inProgress.id, 'PENDING')
    const cookie = sessionCookie(admin.id, 'ADMIN')

    const requestedResponse = await postServiceAction(request(`http://localhost/api/admin/services/${requested.id}/actions`, {
      cookie,
      body: { action: 'complete', reason: ADMIN_REASON },
    }), params(requested.id))
    const acceptedResponse = await postServiceAction(request(`http://localhost/api/admin/services/${accepted.id}/actions`, {
      cookie,
      body: { action: 'complete', reason: ADMIN_REASON },
    }), params(accepted.id))
    const completeResponse = await postServiceAction(request(`http://localhost/api/admin/services/${inProgress.id}/actions`, {
      cookie,
      body: { action: 'complete', reason: ADMIN_REASON },
    }), params(inProgress.id))

    expect(requestedResponse.status).toBe(409)
    expect(acceptedResponse.status).toBe(409)
    expect(completeResponse.status).toBe(200)

    const completed = await db.serviceRequest.findUniqueOrThrow({ where: { id: inProgress.id }, include: { timeline: true } })
    const unchangedPayment = await db.paymentRecord.findUniqueOrThrow({ where: { id: payment.id }, include: { events: true } })
    expect(completed.status).toBe('COMPLETED')
    expect(completed.timeline.some((event) => event.eventType === 'admin_service_completed')).toBe(true)
    expect(unchangedPayment.status).toBe('PENDING')
    expect(unchangedPayment.events.filter((event) => event.eventType === 'CANCELED')).toHaveLength(0)
  })

  test('invalid fail on terminal service does not alter data', async () => {
    const admin = await createUser('ADMIN', 'invalid-fail-admin')
    const client = await createUser('CLIENT', 'invalid-fail-client')
    const service = await createService({ clientId: client.id, status: 'COMPLETED' })

    const response = await postServiceAction(request(`http://localhost/api/admin/services/${service.id}/actions`, {
      cookie: sessionCookie(admin.id, 'ADMIN'),
      body: { action: 'fail', reason: ADMIN_REASON },
    }), params(service.id))
    const unchanged = await db.serviceRequest.findUniqueOrThrow({ where: { id: service.id } })

    expect(response.status).toBe(409)
    expect(unchanged.status).toBe('COMPLETED')
  })

  test('terminal repeated action is idempotent and does not duplicate timeline or audit', async () => {
    const admin = await createUser('ADMIN', 'repeat-admin')
    const client = await createUser('CLIENT', 'repeat-client')
    const service = await createService({ clientId: client.id, status: 'IN_PROGRESS' })

    await performAdminServiceAction({ serviceId: service.id, action: 'complete', reason: ADMIN_REASON, admin })
    const afterFirst = await db.serviceRequest.findUniqueOrThrow({ where: { id: service.id }, include: { timeline: true } })
    const auditsAfterFirst = await getRecentAuditEvents(20)

    await performAdminServiceAction({ serviceId: service.id, action: 'complete', reason: ADMIN_REASON, admin })
    const afterSecond = await db.serviceRequest.findUniqueOrThrow({ where: { id: service.id }, include: { timeline: true } })
    const auditsAfterSecond = await getRecentAuditEvents(20)

    expect(afterFirst.timeline.length).toBe(afterSecond.timeline.length)
    expect(auditsAfterFirst.filter((event) => event.event === 'admin_service_completed')).toHaveLength(1)
    expect(auditsAfterSecond.filter((event) => event.event === 'admin_service_completed')).toHaveLength(1)
  })

  test('PAID payment is not refunded automatically and service without payment works', async () => {
    const admin = await createUser('ADMIN', 'paid-admin')
    const client = await createUser('CLIENT', 'paid-client')
    const paidService = await createService({ clientId: client.id, status: 'IN_PROGRESS', paymentStatus: 'PAID' })
    const noPaymentService = await createService({ clientId: client.id, status: 'ACCEPTED' })
    const payment = await createPayment(paidService.id, 'PAID')
    const cookie = sessionCookie(admin.id, 'ADMIN')

    const paidResponse = await postServiceAction(request(`http://localhost/api/admin/services/${paidService.id}/actions`, {
      cookie,
      body: { action: 'cancel', reason: ADMIN_REASON },
    }), params(paidService.id))
    const noPaymentResponse = await postServiceAction(request(`http://localhost/api/admin/services/${noPaymentService.id}/actions`, {
      cookie,
      body: { action: 'cancel', reason: ADMIN_REASON },
    }), params(noPaymentService.id))
    const paidPayload = await paidResponse.json()
    const updatedPayment = await db.paymentRecord.findUniqueOrThrow({ where: { id: payment.id }, include: { events: true } })

    expect(paidResponse.status).toBe(200)
    expect(paidPayload.warnings.some((warning: any) => warning.code === 'paid_payment_not_refunded')).toBe(true)
    expect(updatedPayment.status).toBe('PAID')
    expect(updatedPayment.events.filter((event) => event.eventType === 'REFUNDED')).toHaveLength(0)
    expect(noPaymentResponse.status).toBe(200)
  })
})

describe('F35-08 provider and client administrative actions', () => {
  test('force_offline only sets isAvailable=false and never true', async () => {
    const admin = await createUser('ADMIN', 'force-admin')
    const providerUser = await createUser('PROVIDER', 'force-provider', { isAvailable: true })
    const providerId = providerUser.providerProfile!.id

    const response = await postProviderAction(request(`http://localhost/api/admin/providers/${providerId}/actions`, {
      cookie: sessionCookie(admin.id, 'ADMIN'),
      body: { action: 'force_offline', isAvailable: true },
    }), params(providerId))
    const payload = await response.json()
    const updated = await db.providerProfile.findUniqueOrThrow({ where: { id: providerId } })

    expect(response.status).toBe(200)
    expect(payload.changed).toBe(true)
    expect(updated.isAvailable).toBe(false)

    const repeated = await postProviderAction(request(`http://localhost/api/admin/providers/${providerId}/actions`, {
      cookie: sessionCookie(admin.id, 'ADMIN'),
      body: { action: 'force_offline', isAvailable: true },
    }), params(providerId))
    const repeatedPayload = await repeated.json()
    expect(repeated.status).toBe(200)
    expect(repeatedPayload.changed).toBe(false)
  })

  test('provider suspension with active service warns, blocks new offers and does not auto-cancel active service', async () => {
    const admin = await createUser('ADMIN', 'suspend-provider-admin')
    const client = await createUser('CLIENT', 'suspend-provider-client')
    const providerUser = await createUser('PROVIDER', 'suspend-provider', { isAvailable: true })
    const providerId = providerUser.providerProfile!.id
    const activeService = await createService({ clientId: client.id, providerId, status: 'ACCEPTED' })
    const newService = await createService({ clientId: client.id, status: 'REQUESTED' })

    const response = await patchProvider(request(`http://localhost/api/admin/providers/${providerId}`, {
      method: 'PATCH',
      cookie: sessionCookie(admin.id, 'ADMIN'),
      body: { action: 'suspend', reason: ADMIN_REASON },
    }), params(providerId))
    const payload = await response.json()
    const suspended = await db.providerProfile.findUniqueOrThrow({ where: { id: providerId } })
    const stillActive = await db.serviceRequest.findUniqueOrThrow({ where: { id: activeService.id } })
    const offers = await registerServiceOffers(db as any, newService.id, [providerId], { label: 'Oferta teste' })

    expect(response.status).toBe(200)
    expect(payload.warnings.some((warning: any) => warning.serviceId === activeService.id)).toBe(true)
    expect(suspended.approvalStatus).toBe('SUSPENDED')
    expect(suspended.isAvailable).toBe(false)
    expect(stillActive.status).toBe('ACCEPTED')
    expect(offers.offeredProviderIds).toHaveLength(0)
    expect(offers.blockedProviderIds).toEqual([providerId])
  })

  test('anonymous, CLIENT and PROVIDER cannot suspend a client', async () => {
    const client = await createUser('CLIENT', 'client-action-auth-client')
    const otherClient = await createUser('CLIENT', 'client-action-auth-target')
    const provider = await createUser('PROVIDER', 'client-action-auth-provider')

    const anonymous = await postClientAction(request(`http://localhost/api/admin/clients/${otherClient.id}/actions`, {
      body: { action: 'suspend' },
    }), params(otherClient.id))
    const clientResponse = await postClientAction(request(`http://localhost/api/admin/clients/${otherClient.id}/actions`, {
      cookie: sessionCookie(client.id, 'CLIENT'),
      body: { action: 'suspend' },
    }), params(otherClient.id))
    const providerResponse = await postClientAction(request(`http://localhost/api/admin/clients/${otherClient.id}/actions`, {
      cookie: sessionCookie(provider.id, 'PROVIDER'),
      body: { action: 'suspend' },
    }), params(otherClient.id))

    expect(anonymous.status).toBe(401)
    expect(clientResponse.status).toBe(403)
    expect(providerResponse.status).toBe(403)
    expect((await db.user.findUniqueOrThrow({ where: { id: otherClient.id } })).status).toBe('ACTIVE')
  })

  test('ADMIN suspension is idempotent, audits once and does not cancel an active service', async () => {
    const admin = await createUser('ADMIN', 'suspend-client-admin')
    const client = await createUser('CLIENT', 'suspend-client')
    const activeService = await createService({ clientId: client.id, status: 'REQUESTED' })
    const clientCookie = sessionCookie(client.id, 'CLIENT')
    const adminCookie = sessionCookie(admin.id, 'ADMIN')

    const response = await postClientAction(request(`http://localhost/api/admin/clients/${client.id}/actions`, {
      cookie: adminCookie,
      body: { action: 'suspend' },
    }), params(client.id))
    const payload = await response.json()
    const repeated = await postClientAction(request(`http://localhost/api/admin/clients/${client.id}/actions`, {
      cookie: adminCookie,
      body: { action: 'suspend' },
    }), params(client.id))
    const repeatedPayload = await repeated.json()
    const apiAfterSuspend = await getClientServices(request('http://localhost/api/client/services', { cookie: clientCookie }))
    const loginAfterSuspend = await login(request('http://localhost/api/auth/login', {
      body: { email: client.email, password: 'Senha123!' },
    }))
    const unchangedService = await db.serviceRequest.findUniqueOrThrow({ where: { id: activeService.id } })
    const audits = await getRecentAuditEvents(20)

    expect(response.status).toBe(200)
    expect(payload.changed).toBe(true)
    expect(payload.warnings.some((warning: any) => warning.code === 'active_service_not_cancelled')).toBe(true)
    expect(payload.warnings.some((warning: any) => warning.serviceId === activeService.id)).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('passwordHash')
    expect(JSON.stringify(payload)).not.toContain(client.email)
    expect(repeated.status).toBe(200)
    expect(repeatedPayload.changed).toBe(false)
    expect(audits.filter((event) => event.event === 'client_suspended')).toHaveLength(1)
    expect(unchangedService.status).toBe('REQUESTED')
    expect(apiAfterSuspend.status).toBe(401)
    expect(loginAfterSuspend.status).toBe(403)
  })

  test('client suspension UI sends only the action and refreshes the admin snapshot', () => {
    const source = readFileSync('src/app/admin/services/[id]/admin-service-actions-panel.tsx', 'utf8')
    const suspendBlock = source.slice(
      source.indexOf('async function suspendClient()'),
      source.indexOf('const isTerminal'),
    )

    expect(suspendBlock).toContain('window.confirm')
    expect(suspendBlock).toContain("action: 'suspend'")
    expect(suspendBlock).toContain('router.refresh()')
    expect(suspendBlock).toContain('setWarnings(data.warnings || [])')
    expect(suspendBlock).not.toContain('reason:')
    expect(suspendBlock).not.toContain('adminId')
    expect(suspendBlock).not.toContain('actorId')
    expect(suspendBlock).not.toContain('role:')
    expect(suspendBlock).not.toContain('status:')
  })
})

describe('F35-08 audit and socket hardening', () => {
  test('/api/admin/audit requires ADMIN and no longer uses NODE_ENV as auth bypass', async () => {
    const admin = await createUser('ADMIN', 'audit-admin')
    const client = await createUser('CLIENT', 'audit-client')
    const source = readFileSync('src/app/api/admin/audit/route.ts', 'utf8')

    const anonymous = await getAuditEvents(request('http://localhost/api/admin/audit'))
    const clientResponse = await getAuditEvents(request('http://localhost/api/admin/audit', {
      cookie: sessionCookie(client.id, 'CLIENT'),
    }))
    const adminResponse = await getAuditEvents(request('http://localhost/api/admin/audit', {
      cookie: sessionCookie(admin.id, 'ADMIN'),
    }))

    expect(source).not.toContain('process.env.NODE_ENV')
    expect(anonymous.status).toBe(401)
    expect(clientResponse.status).toBe(403)
    expect(adminResponse.status).toBe(200)
  })

  test('authenticated socket events revalidate User.status and public demo remains wired', () => {
    const service = readFileSync('mini-services/rescue-service/index.ts', 'utf8')
    const home = readFileSync('src/app/page.tsx', 'utf8')
    const requestBlock = service.slice(
      service.indexOf("socket.on('auth:client:request'"),
      service.indexOf("socket.on('auth:service:accept'"),
    )

    expect(service).toContain('const currentActiveAuth = async ()')
    expect(service).toContain('const currentOperationalAuth = async ()')
    expect(service).toContain("user.status !== 'ACTIVE'")
    expect(service).toContain('await currentActiveAuth()')
    expect(service).toContain('await hasCurrentConsents(auth.userId, auth.role, db as any)')
    expect(requestBlock).toContain('await currentOperationalAuth()')
    expect(home).toContain('ClientPanel')
    expect(home).toContain('ProviderPanel')
  })
})
