import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createHmac } from 'crypto'
import { readFileSync } from 'fs'
import { NextRequest } from 'next/server'
import { GET as getAdminPayments } from '@/app/api/admin/payments/route'
import { GET as getPaymentByService } from '@/app/api/payments/[serviceId]/route'
import { POST as postSimulatedPayment } from '@/app/api/payments/simulate/route'
import { POST as postSimulatedWebhookReplay } from '@/app/api/payments/simulate-webhook/route'
import { POST as postSimulatedWebhook } from '@/app/api/payments/webhook/simulated/route'
import { setSessionCookie } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import { clearRateLimits } from '@/server/rate-limit'
import {
  getSimulatedPaymentCanonicalIds,
  isSimulatedPaymentEnabled,
  simulateClientServicePayment,
} from '@/server/payments/simulated-payment-workflow'

const PICKUP = JSON.stringify({ lat: -23.5505, lng: -46.6333 })
const DESTINATION = JSON.stringify({ lat: -23.5614, lng: -46.6559 })

const createdServiceIds: string[] = []
const createdUserIds: string[] = []
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PAYMENT_GATEWAY_PROVIDER: process.env.PAYMENT_GATEWAY_PROVIDER,
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
}

function uniqueEmail(kind: string) {
  return `f35-07-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}@helpbibi.test`
}

function sessionCookie(userId: string, role: 'CLIENT' | 'PROVIDER' | 'ADMIN') {
  return setSessionCookie(userId, role).split(';')[0]
}

function request(url: string, options: { cookie?: string; method?: string; body?: unknown; ip?: string } = {}) {
  const headers: Record<string, string> = {
    'x-forwarded-for': options.ip || `127.35.7.${Math.floor(Math.random() * 200) + 1}`,
  }
  if (options.cookie) headers.cookie = options.cookie
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  return new NextRequest(url, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
}

async function createUser(role: 'CLIENT' | 'PROVIDER' | 'ADMIN', kind: string) {
  const user = await db.user.create({
    data: {
      email: uniqueEmail(kind),
      name: `F35-07 ${role} ${kind}`,
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
                plate: `P${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                city: 'Sao Paulo',
                approvalStatus: 'APPROVED',
                documentStatus: 'APPROVED',
                vehicleStatus: 'APPROVED',
                isVerified: true,
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
  status?: 'ACCEPTED' | 'COMPLETED' | 'CANCELED' | 'EXPIRED' | 'FAILED'
  price?: number
}) {
  const status = input.status || 'COMPLETED'
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
      price: input.price ?? 180,
      originalPrice: input.price ?? 200,
      discount: input.price === 0 ? 0 : 20,
      promoCode: input.price === 0 ? null : 'PILOTO20',
      paymentMethod: 'PIX',
      paymentStatus: 'PENDING',
      acceptedAt: input.providerId ? new Date() : null,
      completedAt: status === 'COMPLETED' ? new Date() : null,
      canceledAt: status === 'CANCELED' ? new Date() : null,
    },
  })
  createdServiceIds.push(service.id)
  return service
}

async function createCanonicalPendingPayment(input: {
  clientId: string
  providerId?: string | null
  price?: number
}) {
  const service = await createService({
    clientId: input.clientId,
    providerId: input.providerId,
    price: input.price ?? 180,
  })
  const ids = getSimulatedPaymentCanonicalIds(service.id)
  const amount = input.price ?? 180
  const platformFee = Math.round(amount * 0.2 * 100) / 100
  const record = await db.paymentRecord.create({
    data: {
      id: ids.paymentRecordId,
      serviceRequestId: service.id,
      method: 'PIX',
      status: 'PENDING',
      amount,
      platformFee,
      providerPayout: Math.round((amount - platformFee) * 100) / 100,
      discountAmount: amount === 0 ? 0 : 20,
      couponCode: amount === 0 ? null : 'PILOTO20',
      provider: 'simulated',
      providerPaymentId: ids.providerPaymentId,
      externalReference: ids.externalReference,
      idempotencyKey: ids.idempotencyKey,
      simulatedTransactionId: ids.simulatedTransactionId,
      events: {
        create: {
          eventType: 'CREATED',
          fromStatus: null,
          toStatus: 'PENDING',
          message: 'Canonical simulated payment created',
          rawPayload: JSON.stringify({ simulated: true, event: 'CREATED' }),
        },
      },
    },
  })
  return { service, record, ids }
}

function signedWebhookRequest(body: Record<string, unknown>, secret = process.env.PAYMENT_WEBHOOK_SECRET || '') {
  const rawBody = JSON.stringify(body)
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  return new NextRequest('http://localhost/api/payments/webhook/simulated', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-helpbibi-signature': signature,
      'x-helpbibi-provider': 'simulated',
    },
    body: rawBody,
  })
}

function invalidSignatureWebhookRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/payments/webhook/simulated', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-helpbibi-signature': 'sha256=invalid_signature',
      'x-helpbibi-provider': 'simulated',
    },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  process.env.SESSION_SECRET = 'test_session_secret_for_f35_07_64_chars_minimum_value'
  process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
  process.env.PAYMENT_WEBHOOK_SECRET = 'test_webhook_secret_for_f35_07_64_chars_minimum_value'
  await clearRateLimits()
})

afterEach(async () => {
  for (const id of createdServiceIds.splice(0)) {
    await db.serviceRequest.delete({ where: { id } }).catch(() => {})
  }
  for (const id of createdUserIds.splice(0)) {
    await db.user.delete({ where: { id } }).catch(() => {})
  }
  await clearRateLimits()
  if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalEnv.NODE_ENV
  if (originalEnv.PAYMENT_GATEWAY_PROVIDER === undefined) delete process.env.PAYMENT_GATEWAY_PROVIDER
  else process.env.PAYMENT_GATEWAY_PROVIDER = originalEnv.PAYMENT_GATEWAY_PROVIDER
  if (originalEnv.PAYMENT_WEBHOOK_SECRET === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET
  else process.env.PAYMENT_WEBHOOK_SECRET = originalEnv.PAYMENT_WEBHOOK_SECRET
  if (originalEnv.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = originalEnv.SESSION_SECRET
})

describe('F35-07 simulated payment provider gate', () => {
  test('PAYMENT_GATEWAY_PROVIDER must be exactly simulated and NODE_ENV alone does not enable it', async () => {
    const client = await createUser('CLIENT', 'gate-client')
    const service = await createService({ clientId: client.id })
    const user = { id: client.id, role: 'CLIENT' as const, name: client.name, email: client.email }

    delete process.env.PAYMENT_GATEWAY_PROVIDER
    expect(isSimulatedPaymentEnabled()).toBe(false)
    expect(simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' })).rejects.toThrow(/PAYMENT_GATEWAY_PROVIDER=simulated/)

    process.env.NODE_ENV = 'production'
    expect(isSimulatedPaymentEnabled()).toBe(false)
    expect(simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' })).rejects.toThrow(/PAYMENT_GATEWAY_PROVIDER=simulated/)

    process.env.PAYMENT_GATEWAY_PROVIDER = 'mercado_pago'
    expect(isSimulatedPaymentEnabled()).toBe(false)
    expect(simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' })).rejects.toThrow(/PAYMENT_GATEWAY_PROVIDER=simulated/)

    process.env.PAYMENT_GATEWAY_PROVIDER = 'simulated'
    const payment = await simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' })
    expect(payment.status).toBe('PAID')
  })
})

describe('F35-07 client payment authorization and canonical values', () => {
  test('route requires session, CLIENT role, own service, and rejects spoofed financial payload', async () => {
    const client = await createUser('CLIENT', 'client')
    const otherClient = await createUser('CLIENT', 'other-client')
    const provider = await createUser('PROVIDER', 'provider')
    const admin = await createUser('ADMIN', 'admin')
    const service = await createService({ clientId: client.id, providerId: provider.providerProfile!.id })

    const noSession = await postSimulatedPayment(request('http://localhost/api/payments/simulate', {
      body: { serviceRequestId: service.id, outcome: 'success' },
    }))
    expect(noSession.status).toBe(401)

    const providerResponse = await postSimulatedPayment(request('http://localhost/api/payments/simulate', {
      cookie: sessionCookie(provider.id, 'PROVIDER'),
      body: { serviceRequestId: service.id, outcome: 'success' },
    }))
    expect(providerResponse.status).toBe(403)

    const adminResponse = await postSimulatedPayment(request('http://localhost/api/payments/simulate', {
      cookie: sessionCookie(admin.id, 'ADMIN'),
      body: { serviceRequestId: service.id, outcome: 'success' },
    }))
    expect(adminResponse.status).toBe(403)

    const wrongClient = await postSimulatedPayment(request('http://localhost/api/payments/simulate', {
      cookie: sessionCookie(otherClient.id, 'CLIENT'),
      body: { serviceRequestId: service.id, outcome: 'success' },
    }))
    expect(wrongClient.status).toBe(404)

    const spoofed = await postSimulatedPayment(request('http://localhost/api/payments/simulate', {
      cookie: sessionCookie(client.id, 'CLIENT'),
      body: { serviceRequestId: service.id, outcome: 'success', amount: 1, platformFee: 0, providerPayout: 1 },
    }))
    expect(spoofed.status).toBe(400)

    const ok = await postSimulatedPayment(request('http://localhost/api/payments/simulate', {
      cookie: sessionCookie(client.id, 'CLIENT'),
      body: { serviceRequestId: service.id, outcome: 'success' },
    }))
    const payload = await ok.json()
    expect(ok.status).toBe(200)
    expect(payload.payment.amount).toBe(180)
    expect(payload.payment.method).toBe('PIX')
    expect(JSON.stringify(payload)).not.toContain('platformFee')
    expect(JSON.stringify(payload)).not.toContain('providerPayout')
    expect(JSON.stringify(payload)).not.toContain('simulatedTransactionId')
  })

  test('blocked and invalid services do not accept simulated payment', async () => {
    const client = await createUser('CLIENT', 'blocked-client')
    const user = { id: client.id, role: 'CLIENT' as const, name: client.name, email: client.email }

    for (const status of ['CANCELED', 'EXPIRED', 'FAILED', 'ACCEPTED'] as const) {
      const service = await createService({ clientId: client.id, status })
      expect(simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' })).rejects.toThrow()
    }

    const withoutValue = await createService({ clientId: client.id, price: 0 })
    expect(simulateClientServicePayment({ user, serviceRequestId: withoutValue.id, outcome: 'success' })).rejects.toThrow(/valor canonico/)
  })
})

describe('F35-07 canonical PaymentRecord and idempotent events', () => {
  test('concurrent success creates one PaymentRecord and does not duplicate events on retry', async () => {
    const client = await createUser('CLIENT', 'concurrent-client')
    const service = await createService({ clientId: client.id })
    const user = { id: client.id, role: 'CLIENT' as const, name: client.name, email: client.email }

    await Promise.all([
      simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' }),
      simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' }),
    ])
    await simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' })

    const records = await db.paymentRecord.findMany({
      where: { serviceRequestId: service.id },
      include: { events: true },
    })
    expect(records.length).toBe(1)
    expect(records[0].status).toBe('PAID')
    expect(records[0].amount).toBe(180)
    expect(records[0].platformFee).toBe(36)
    expect(records[0].providerPayout).toBe(144)
    expect(records[0].events.filter((event) => event.eventType === 'CREATED').length).toBe(1)
    expect(records[0].events.filter((event) => event.eventType === 'PAID').length).toBe(1)
  })

  test('failure retry is idempotent and opposite terminal outcome returns controlled conflict', async () => {
    const client = await createUser('CLIENT', 'failure-client')
    const service = await createService({ clientId: client.id })
    const user = { id: client.id, role: 'CLIENT' as const, name: client.name, email: client.email }

    await simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'failure' })
    await simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'failure' })
    expect(simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' })).rejects.toThrow(/nao aceita transicao/)

    const record = await db.paymentRecord.findFirstOrThrow({
      where: { serviceRequestId: service.id },
      include: { events: true },
    })
    expect(record.status).toBe('FAILED')
    expect(record.events.filter((event) => event.eventType === 'CREATED').length).toBe(1)
    expect(record.events.filter((event) => event.eventType === 'FAILED').length).toBe(1)
  })
})

describe('F35-07 payment read API sanitizes by role', () => {
  test('GET requires session and enforces client/provider/admin access shapes', async () => {
    const client = await createUser('CLIENT', 'read-client')
    const otherClient = await createUser('CLIENT', 'read-other-client')
    const provider = await createUser('PROVIDER', 'read-provider')
    const otherProvider = await createUser('PROVIDER', 'read-other-provider')
    const admin = await createUser('ADMIN', 'read-admin')
    const service = await createService({ clientId: client.id, providerId: provider.providerProfile!.id })
    const user = { id: client.id, role: 'CLIENT' as const, name: client.name, email: client.email }
    await simulateClientServicePayment({ user, serviceRequestId: service.id, outcome: 'success' })

    const noSession = await getPaymentByService(
      request(`http://localhost/api/payments/${service.id}`),
      { params: Promise.resolve({ serviceId: service.id }) },
    )
    expect(noSession.status).toBe(401)

    const wrongClient = await getPaymentByService(
      request(`http://localhost/api/payments/${service.id}`, { cookie: sessionCookie(otherClient.id, 'CLIENT') }),
      { params: Promise.resolve({ serviceId: service.id }) },
    )
    expect(wrongClient.status).toBe(404)

    const wrongProvider = await getPaymentByService(
      request(`http://localhost/api/payments/${service.id}`, { cookie: sessionCookie(otherProvider.id, 'PROVIDER') }),
      { params: Promise.resolve({ serviceId: service.id }) },
    )
    expect(wrongProvider.status).toBe(404)

    const clientResponse = await getPaymentByService(
      request(`http://localhost/api/payments/${service.id}`, { cookie: sessionCookie(client.id, 'CLIENT') }),
      { params: Promise.resolve({ serviceId: service.id }) },
    )
    const clientPayload = await clientResponse.json()
    expect(clientResponse.status).toBe(200)
    expect(JSON.stringify(clientPayload)).not.toContain('platformFee')
    expect(JSON.stringify(clientPayload)).not.toContain('providerPayout')
    expect(JSON.stringify(clientPayload)).not.toContain('simulatedTransactionId')

    const providerResponse = await getPaymentByService(
      request(`http://localhost/api/payments/${service.id}`, { cookie: sessionCookie(provider.id, 'PROVIDER') }),
      { params: Promise.resolve({ serviceId: service.id }) },
    )
    const providerPayload = await providerResponse.json()
    expect(providerResponse.status).toBe(200)
    expect(providerPayload.payment.providerPayout).toBe(144)
    expect(JSON.stringify(providerPayload)).not.toContain('platformFee')
    expect(JSON.stringify(providerPayload)).not.toContain('simulatedTransactionId')

    const adminResponse = await getPaymentByService(
      request(`http://localhost/api/payments/${service.id}`, { cookie: sessionCookie(admin.id, 'ADMIN') }),
      { params: Promise.resolve({ serviceId: service.id }) },
    )
    const adminPayload = await adminResponse.json()
    expect(adminResponse.status).toBe(200)
    expect(adminPayload.payment.platformFee).toBe(36)
    expect(adminPayload.payment.providerPayout).toBe(144)
    expect(JSON.stringify(adminPayload)).not.toContain('rawPayload')
  })

  test('service without PaymentRecord remains readable', async () => {
    const client = await createUser('CLIENT', 'no-payment-client')
    const service = await createService({ clientId: client.id })
    const response = await getPaymentByService(
      request(`http://localhost/api/payments/${service.id}`, { cookie: sessionCookie(client.id, 'CLIENT') }),
      { params: Promise.resolve({ serviceId: service.id }) },
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.available).toBe(false)
    expect(payload.amount).toBe(180)
    expect(payload.status).toBe('PENDING')
  })
})

describe('F35-07 simulated webhook hardening', () => {
  test('webhook fails without PAYMENT_WEBHOOK_SECRET configured', async () => {
    const client = await createUser('CLIENT', 'webhook-no-secret-client')
    const { ids } = await createCanonicalPendingPayment({ clientId: client.id })

    delete process.env.PAYMENT_WEBHOOK_SECRET
    const response = await postSimulatedWebhook(signedWebhookRequest({
      provider: 'simulated',
      providerPaymentId: ids.providerPaymentId,
      event: 'PAID',
    }, 'temporary_secret_for_signature'))
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.code).toBe('simulated_webhook_secret_required')
  })

  test('webhook rejects invalid signature and non-simulated provider configuration', async () => {
    const client = await createUser('CLIENT', 'webhook-invalid-client')
    const { ids } = await createCanonicalPendingPayment({ clientId: client.id })
    const body = {
      provider: 'simulated',
      providerPaymentId: ids.providerPaymentId,
      event: 'PAID',
    }

    const invalidSignature = await postSimulatedWebhook(invalidSignatureWebhookRequest(body))
    expect(invalidSignature.status).toBe(401)

    process.env.PAYMENT_GATEWAY_PROVIDER = 'mercado_pago'
    const disabledProvider = await postSimulatedWebhook(signedWebhookRequest(body))
    expect(disabledProvider.status).toBe(403)

    const record = await db.paymentRecord.findUniqueOrThrow({
      where: { id: ids.paymentRecordId },
      include: { events: true },
    })
    expect(record.status).toBe('PENDING')
    expect(record.events.filter((event) => event.eventType === 'PAID').length).toBe(0)
  })

  test('webhook repeated delivery is idempotent and does not duplicate PaymentEvent', async () => {
    const client = await createUser('CLIENT', 'webhook-idem-client')
    const { ids } = await createCanonicalPendingPayment({ clientId: client.id })
    const body = {
      provider: 'simulated',
      providerPaymentId: ids.providerPaymentId,
      event: 'PAID',
      message: 'approved once',
    }

    const first = await postSimulatedWebhook(signedWebhookRequest(body))
    const second = await postSimulatedWebhook(signedWebhookRequest(body))
    const firstPayload = await first.json()
    const secondPayload = await second.json()

    expect(first.status).toBe(200)
    expect(firstPayload.idempotent).toBe(false)
    expect(second.status).toBe(200)
    expect(secondPayload.idempotent).toBe(true)

    const record = await db.paymentRecord.findUniqueOrThrow({
      where: { id: ids.paymentRecordId },
      include: { events: true },
    })
    expect(record.status).toBe('PAID')
    expect(record.lastWebhookSignature).toMatch(/^sha256:/)
    expect(record.lastWebhookSignature).not.toContain('sha256=')
    expect(record.events.filter((event) => event.eventType === 'PAID').length).toBe(1)
  })

  test('webhook rejects arbitrary status and mismatched serviceRequestId', async () => {
    const client = await createUser('CLIENT', 'webhook-invalid-status-client')
    const otherClient = await createUser('CLIENT', 'webhook-other-client')
    const { ids } = await createCanonicalPendingPayment({ clientId: client.id })
    const otherService = await createService({ clientId: otherClient.id })

    const invalidStatus = await postSimulatedWebhook(signedWebhookRequest({
      provider: 'simulated',
      providerPaymentId: ids.providerPaymentId,
      event: 'COMPLETED',
    }))
    expect(invalidStatus.status).toBe(400)

    const mismatch = await postSimulatedWebhook(signedWebhookRequest({
      provider: 'simulated',
      providerPaymentId: ids.providerPaymentId,
      serviceRequestId: otherService.id,
      event: 'PAID',
    }))
    expect(mismatch.status).toBe(409)

    const record = await db.paymentRecord.findUniqueOrThrow({
      where: { id: ids.paymentRecordId },
      include: { events: true },
    })
    expect(record.status).toBe('PENDING')
    expect(record.events.filter((event) => event.eventType === 'PAID').length).toBe(0)
  })

  test('webhook ignores spoofed financial fields and preserves canonical amount', async () => {
    const client = await createUser('CLIENT', 'webhook-value-client')
    const { ids } = await createCanonicalPendingPayment({ clientId: client.id, price: 180 })

    const response = await postSimulatedWebhook(signedWebhookRequest({
      provider: 'simulated',
      providerPaymentId: ids.providerPaymentId,
      event: 'PAID',
      amount: 1,
      platformFee: 0,
      providerPayout: 1,
      discount: 999,
    }))
    expect(response.status).toBe(200)

    const record = await db.paymentRecord.findUniqueOrThrow({
      where: { id: ids.paymentRecordId },
      include: { events: true },
    })
    expect(record.amount).toBe(180)
    expect(record.platformFee).toBe(36)
    expect(record.providerPayout).toBe(144)
    const paidEvent = record.events.find((event) => event.eventType === 'PAID')
    expect(paidEvent?.rawPayload || '').not.toContain('amount')
    expect(paidEvent?.rawPayload || '').not.toContain('platformFee')
    expect(paidEvent?.rawPayload || '').not.toContain('providerPayout')
    expect(paidEvent?.rawPayload || '').not.toContain('discount')
  })

  test('admin simulate-webhook delegates to the central processor without returning raw signature or payload', async () => {
    const client = await createUser('CLIENT', 'webhook-replay-client')
    const admin = await createUser('ADMIN', 'webhook-replay-admin')
    const { ids } = await createCanonicalPendingPayment({ clientId: client.id })

    const response = await postSimulatedWebhookReplay(request('http://localhost/api/payments/simulate-webhook', {
      cookie: sessionCookie(admin.id, 'ADMIN'),
      body: {
        paymentRecordId: ids.paymentRecordId,
        event: 'PAID',
      },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.webhookResult.toStatus).toBe('PAID')
    expect(payload.webhook.signatureGenerated).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('x-helpbibi-signature')
    expect(JSON.stringify(payload)).not.toContain('generatedPayload')
    expect(JSON.stringify(payload)).not.toContain(process.env.PAYMENT_WEBHOOK_SECRET!)
  })
})

describe('F35-07 admin and public demo hardening', () => {
  test('admin payments API requires ADMIN in development too', async () => {
    process.env.NODE_ENV = 'development'
    const client = await createUser('CLIENT', 'admin-block-client')
    const admin = await createUser('ADMIN', 'admin-ok')

    const noSession = await getAdminPayments(request('http://localhost/api/admin/payments'))
    expect(noSession.status).toBe(401)

    const clientResponse = await getAdminPayments(request('http://localhost/api/admin/payments', {
      cookie: sessionCookie(client.id, 'CLIENT'),
    }))
    expect(clientResponse.status).toBe(403)

    const adminResponse = await getAdminPayments(request('http://localhost/api/admin/payments', {
      cookie: sessionCookie(admin.id, 'ADMIN'),
    }))
    expect(adminResponse.status).toBe(200)
  })

  test('public demo payment socket returns before any persistent PaymentRecord write', () => {
    const source = readFileSync('mini-services/rescue-service/index.ts', 'utf8')
    const start = source.indexOf("socket.on('payment:simulate'")
    const end = source.indexOf("socket.on('service:rate'", start)
    const block = source.slice(start, end)
    expect(block).toContain('[payment:demo]')
    expect(block).not.toContain('db.paymentRecord.create')
    expect(block).not.toContain('db.serviceRequest.update')
  })

  test('webhook routes delegate to the central simulated payment service', () => {
    const replayRoute = readFileSync('src/app/api/payments/simulate-webhook/route.ts', 'utf8')
    const webhookRoute = readFileSync('src/app/api/payments/webhook/simulated/route.ts', 'utf8')

    expect(replayRoute).toContain('simulateSignedPaymentWebhookReplay')
    expect(webhookRoute).toContain('processSimulatedPaymentWebhook')
    expect(replayRoute).not.toContain('db.paymentRecord')
    expect(webhookRoute).not.toContain('db.paymentRecord')
    expect(webhookRoute).not.toContain('validateTransition')
  })

  test('admin cancel refund and reconcile routes stay admin-only and simulated-only', () => {
    const cancelRoute = readFileSync('src/app/api/admin/payments/[id]/cancel/route.ts', 'utf8')
    const refundRoute = readFileSync('src/app/api/admin/payments/[id]/refund/route.ts', 'utf8')
    const reconcileRoute = readFileSync('src/app/api/admin/reconcile/route.ts', 'utf8')

    for (const source of [cancelRoute, refundRoute, reconcileRoute]) {
      expect(source).toContain("requireRole(req, 'ADMIN')")
      expect(source).toContain('assertSimulatedPaymentEnabled')
      expect(source).not.toContain('getPaymentGateway')
    }
    expect(cancelRoute).toContain("payment.provider !== 'simulated'")
    expect(refundRoute).toContain("payment.provider !== 'simulated'")
    expect(refundRoute).toContain('refundPayment(id, undefined, body.reason)')
  })
})
