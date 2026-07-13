import { createHash } from 'crypto'
import type { PaymentStatus, ServiceStatus } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { db } from '@/server/db/prisma'
import type { CurrentUser } from '@/server/auth/session'
import { canTransition, validateTransition } from '@/server/payments/payment-state-machine'
import type { GatewayWebhookEvent } from '@/server/payments/gateways'
import { SimulatedGateway } from '@/server/payments/gateways/simulated-gateway'

export type SimulatedPaymentOutcome = 'success' | 'failure'
export type PaymentViewerRole = 'CLIENT' | 'PROVIDER' | 'ADMIN'

type PaymentRecordWithEvents = Prisma.PaymentRecordGetPayload<{
  include: { events: { orderBy: { createdAt: 'asc' } } }
}>

type ServiceForPayment = Prisma.ServiceRequestGetPayload<{
  include: { provider: { select: { id: true; userId: true } } }
}>

type SimulatedWebhookRecord = Prisma.PaymentRecordGetPayload<{
  include: {
    serviceRequest: { select: { id: true; status: true; paymentStatus: true } }
  }
}>

const ELIGIBLE_PAYMENT_STATUSES = ['COMPLETED'] satisfies ServiceStatus[]
const BLOCKED_SERVICE_STATUSES = ['CANCELED', 'EXPIRED', 'FAILED'] satisfies ServiceStatus[]
const FINAL_INCOMPATIBLE_PAYMENT_STATUSES = ['CANCELED', 'REFUNDED'] satisfies PaymentStatus[]
const SIMULATED_WEBHOOK_EVENTS = ['AUTHORIZED', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED'] as const
const FINANCIAL_SPLIT = {
  platformFeePercent: 20,
  providerPayoutPercent: 80,
}

export class SimulatedPaymentError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'SimulatedPaymentError'
    this.status = status
    this.code = code
  }
}

export function isSimulatedPaymentEnabled(): boolean {
  return process.env.PAYMENT_GATEWAY_PROVIDER === 'simulated'
}

export function assertSimulatedPaymentEnabled() {
  if (!isSimulatedPaymentEnabled()) {
    throw new SimulatedPaymentError(
      403,
      'simulated_payment_disabled',
      'Pagamento simulado desabilitado. Configure PAYMENT_GATEWAY_PROVIDER=simulated para o piloto.',
    )
  }
}

function getStrictSimulatedGateway() {
  assertSimulatedPaymentEnabled()
  const secret = process.env.PAYMENT_WEBHOOK_SECRET
  if (!secret) {
    throw new SimulatedPaymentError(
      503,
      'simulated_webhook_secret_required',
      'PAYMENT_WEBHOOK_SECRET precisa estar configurado para webhook simulado.',
    )
  }
  return new SimulatedGateway(secret)
}

export function getSimulatedPaymentCanonicalIds(serviceRequestId: string) {
  const hash = createHash('sha256').update(serviceRequestId).digest('hex').slice(0, 32)
  const upper = hash.toUpperCase()
  return {
    paymentRecordId: `sim_pay_${hash}`,
    idempotencyKey: `payment:${serviceRequestId}`,
    providerPaymentId: `sim_provider_${hash}`,
    externalReference: `HB-SIM-${upper}`,
    simulatedTransactionId: `SIM_${upper}`,
  }
}

function isSimulatedWebhookEvent(event: string): event is typeof SIMULATED_WEBHOOK_EVENTS[number] {
  return (SIMULATED_WEBHOOK_EVENTS as readonly string[]).includes(event)
}

function normalizeWebhookHeaders(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
}

function signatureFingerprint(signature: string) {
  return `sha256:${createHash('sha256').update(signature).digest('hex')}`
}

function safeWebhookMessage(message: string | null | undefined, fallback: string) {
  const value = typeof message === 'string' ? message.trim() : ''
  return (value || fallback).slice(0, 240)
}

function safeWebhookPayload(event: GatewayWebhookEvent) {
  return JSON.stringify({
    provider: 'simulated',
    event: event.event,
    providerPaymentId: event.providerPaymentId || null,
    externalReference: event.externalReference || null,
  })
}

function assertCanonicalSimulatedPaymentRecord(record: Pick<SimulatedWebhookRecord, 'id' | 'serviceRequestId' | 'provider' | 'providerPaymentId' | 'externalReference' | 'idempotencyKey'>) {
  const ids = getSimulatedPaymentCanonicalIds(record.serviceRequestId)
  if (record.provider !== 'simulated') {
    throw new SimulatedPaymentError(403, 'non_simulated_payment_record', 'Operacao permitida somente para pagamento simulado.')
  }
  if (
    record.id !== ids.paymentRecordId ||
    record.providerPaymentId !== ids.providerPaymentId ||
    record.externalReference !== ids.externalReference ||
    record.idempotencyKey !== ids.idempotencyKey
  ) {
    throw new SimulatedPaymentError(409, 'non_canonical_payment_record', 'Webhook simulado aceita somente PaymentRecord canonico do servico.')
  }
}

export function canInitiateSimulatedPayment(service: Pick<ServiceForPayment, 'status' | 'price' | 'paymentStatus'>) {
  if (BLOCKED_SERVICE_STATUSES.includes(service.status)) {
    return { ok: false, reason: `Servico em status ${service.status} nao aceita pagamento.` }
  }
  if (!ELIGIBLE_PAYMENT_STATUSES.includes(service.status)) {
    return { ok: false, reason: 'Pagamento simulado do piloto fica disponivel somente apos o atendimento ser concluido.' }
  }
  if (!Number.isFinite(service.price) || service.price <= 0) {
    return { ok: false, reason: 'Servico sem valor canonico valido.' }
  }
  if (FINAL_INCOMPATIBLE_PAYMENT_STATUSES.includes(service.paymentStatus)) {
    return { ok: false, reason: `Pagamento em status ${service.paymentStatus} nao pode ser simulado novamente.` }
  }
  return { ok: true, reason: null }
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function deriveCanonicalAmounts(service: ServiceForPayment) {
  if (!Number.isFinite(service.price) || service.price <= 0) {
    throw new SimulatedPaymentError(409, 'invalid_service_amount', 'Servico sem valor canonico valido.')
  }
  const amount = round2(service.price)
  const platformFee = round2((amount * FINANCIAL_SPLIT.platformFeePercent) / 100)
  return {
    method: service.paymentMethod,
    amount,
    platformFee,
    providerPayout: round2(amount - platformFee),
    discountAmount: round2(service.discount || 0),
    couponCode: service.promoCode || null,
  }
}

function assertClientOwnsService(user: CurrentUser, service: ServiceForPayment) {
  if (user.role !== 'CLIENT') {
    throw new SimulatedPaymentError(403, 'client_role_required', 'Apenas CLIENT pode iniciar pagamento do proprio servico.')
  }
  if (service.clientId !== user.id) {
    throw new SimulatedPaymentError(404, 'service_not_found', 'Servico nao encontrado.')
  }
}

function ensureRecordMatchesService(record: PaymentRecordWithEvents, service: ServiceForPayment) {
  const values = deriveCanonicalAmounts(service)
  if (round2(record.amount) !== values.amount || record.method !== values.method) {
    throw new SimulatedPaymentError(
      409,
      'payment_record_mismatch',
      'Pagamento existente nao corresponde ao valor canonico do servico.',
    )
  }
}

function isUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

async function loadService(serviceRequestId: string): Promise<ServiceForPayment | null> {
  return db.serviceRequest.findUnique({
    where: { id: serviceRequestId },
    include: { provider: { select: { id: true, userId: true } } },
  })
}

async function findCanonicalRecord(tx: Prisma.TransactionClient, serviceRequestId: string): Promise<PaymentRecordWithEvents | null> {
  const ids = getSimulatedPaymentCanonicalIds(serviceRequestId)
  const byId = await tx.paymentRecord.findUnique({
    where: { id: ids.paymentRecordId },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  })
  if (byId) return byId

  const byKey = await tx.paymentRecord.findUnique({
    where: { idempotencyKey: ids.idempotencyKey },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  }).catch(() => null)
  if (byKey) return byKey

  return tx.paymentRecord.findFirst({
    where: { serviceRequestId },
    include: { events: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
}

async function runCanonicalPaymentTransaction(serviceRequestId: string, outcome: SimulatedPaymentOutcome) {
  return db.$transaction(async (tx) => {
    const service = await tx.serviceRequest.findUnique({
      where: { id: serviceRequestId },
      include: { provider: { select: { id: true, userId: true } } },
    })
    if (!service) {
      throw new SimulatedPaymentError(404, 'service_not_found', 'Servico nao encontrado.')
    }

    const eligibility = canInitiateSimulatedPayment(service)
    if (!eligibility.ok) {
      throw new SimulatedPaymentError(409, 'service_not_eligible', eligibility.reason || 'Servico inelegivel para pagamento.')
    }

    const values = deriveCanonicalAmounts(service)
    const ids = getSimulatedPaymentCanonicalIds(service.id)
    let record = await findCanonicalRecord(tx, service.id)

    if (!record) {
      record = await tx.paymentRecord.create({
        data: {
          id: ids.paymentRecordId,
          serviceRequestId: service.id,
          method: values.method,
          status: 'PENDING',
          amount: values.amount,
          platformFee: values.platformFee,
          providerPayout: values.providerPayout,
          discountAmount: values.discountAmount,
          couponCode: values.couponCode,
          provider: 'simulated',
          providerPaymentId: ids.providerPaymentId,
          externalReference: ids.externalReference,
          idempotencyKey: ids.idempotencyKey,
          simulatedTransactionId: ids.simulatedTransactionId,
          metadata: JSON.stringify({ provider: 'simulated', canonical: true }),
          rawPayload: JSON.stringify({ provider: 'simulated', canonical: true }),
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
        include: { events: { orderBy: { createdAt: 'asc' } } },
      })
      await tx.serviceRequest.update({
        where: { id: service.id },
        data: { paymentStatus: 'PENDING' },
      })
    } else {
      ensureRecordMatchesService(record, service)
    }

    const targetStatus: PaymentStatus = outcome === 'success' ? 'PAID' : 'FAILED'
    const fromStatus = record.status as PaymentStatus

    if (fromStatus === targetStatus) {
      return record
    }

    if (!canTransition(fromStatus, targetStatus)) {
      throw new SimulatedPaymentError(
        409,
        'payment_status_conflict',
        `Pagamento em status ${fromStatus} nao aceita transicao para ${targetStatus}.`,
      )
    }

    const now = new Date()
    const updated = await tx.paymentRecord.update({
      where: { id: record.id },
      data: {
        status: targetStatus,
        ...(targetStatus === 'PAID' ? { paidAt: now } : {}),
        ...(targetStatus === 'FAILED' ? { failedAt: now, failureReason: 'Simulated failure' } : {}),
        events: {
          create: {
            eventType: targetStatus,
            fromStatus,
            toStatus: targetStatus,
            message: outcome === 'success' ? 'Canonical simulated payment approved' : 'Canonical simulated payment failed',
            rawPayload: JSON.stringify({ simulated: true, outcome }),
          },
        },
      },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })

    await tx.serviceRequest.update({
      where: { id: service.id },
      data: { paymentStatus: targetStatus },
    })

    return updated
  })
}

export async function simulateClientServicePayment(params: {
  user: CurrentUser
  serviceRequestId: string
  outcome: SimulatedPaymentOutcome
}) {
  assertSimulatedPaymentEnabled()

  if (params.outcome !== 'success' && params.outcome !== 'failure') {
    throw new SimulatedPaymentError(400, 'invalid_outcome', 'outcome deve ser success ou failure.')
  }

  const service = await loadService(params.serviceRequestId)
  if (!service) {
    throw new SimulatedPaymentError(404, 'service_not_found', 'Servico nao encontrado.')
  }
  assertClientOwnsService(params.user, service)

  const eligibility = canInitiateSimulatedPayment(service)
  if (!eligibility.ok) {
    throw new SimulatedPaymentError(409, 'service_not_eligible', eligibility.reason || 'Servico inelegivel para pagamento.')
  }

  try {
    const record = await runCanonicalPaymentTransaction(service.id, params.outcome)
    return serializePaymentForRole(record, 'CLIENT')
  } catch (error) {
    if (!isUniqueConflict(error)) throw error
    const record = await runCanonicalPaymentTransaction(service.id, params.outcome)
    return serializePaymentForRole(record, 'CLIENT')
  }
}

function assertCanViewPayment(user: CurrentUser, service: ServiceForPayment): PaymentViewerRole {
  if (user.role === 'ADMIN') return 'ADMIN'
  if (user.role === 'CLIENT' && service.clientId === user.id) return 'CLIENT'
  if (user.role === 'PROVIDER' && service.provider?.userId === user.id) return 'PROVIDER'
  throw new SimulatedPaymentError(404, 'service_not_found', 'Servico nao encontrado.')
}

export async function processSimulatedPaymentWebhook(params: {
  rawBody: string
  headers: Record<string, string>
}) {
  const gateway = getStrictSimulatedGateway()
  const headers = normalizeWebhookHeaders(params.headers)
  const signature = headers['x-helpbibi-signature'] || ''
  const verification = await gateway.verifyWebhookSignature(params.rawBody, signature)

  if (!verification.valid) {
    throw new SimulatedPaymentError(401, 'invalid_webhook_signature', 'Assinatura do webhook simulado invalida.')
  }

  let parsed: GatewayWebhookEvent
  try {
    parsed = await gateway.parseWebhookEvent(params.rawBody, headers)
  } catch (error) {
    throw new SimulatedPaymentError(
      400,
      'invalid_webhook_payload',
      error instanceof Error ? error.message : 'Payload de webhook simulado invalido.',
    )
  }

  if (!isSimulatedWebhookEvent(parsed.event)) {
    throw new SimulatedPaymentError(400, 'invalid_webhook_event', 'Evento de webhook simulado invalido.')
  }

  const payloadServiceRequestId = typeof parsed.rawPayload?.serviceRequestId === 'string'
    ? parsed.rawPayload.serviceRequestId
    : null

  return db.$transaction(async (tx) => {
    const payment = await tx.paymentRecord.findFirst({
      where: {
        provider: 'simulated',
        OR: [
          ...(parsed.providerPaymentId ? [{ providerPaymentId: parsed.providerPaymentId }] : []),
          ...(parsed.externalReference ? [{ externalReference: parsed.externalReference }] : []),
        ],
      },
      include: {
        serviceRequest: { select: { id: true, status: true, paymentStatus: true } },
      },
    })

    if (!payment) {
      throw new SimulatedPaymentError(404, 'payment_record_not_found', 'PaymentRecord canonico nao encontrado para o webhook simulado.')
    }

    assertCanonicalSimulatedPaymentRecord(payment)

    if (payloadServiceRequestId && payloadServiceRequestId !== payment.serviceRequestId) {
      throw new SimulatedPaymentError(409, 'webhook_service_mismatch', 'Webhook simulado referencia servico diferente do PaymentRecord canonico.')
    }

    const toStatus = parsed.event as PaymentStatus
    const fromStatus = payment.status as PaymentStatus

    if (fromStatus === toStatus) {
      return {
        ok: true,
        idempotent: true,
        paymentId: payment.id,
        provider: 'simulated',
        fromStatus,
        toStatus,
        signatureVerified: true,
      }
    }

    const validation = validateTransition(fromStatus, toStatus)
    if (!validation.valid) {
      throw new SimulatedPaymentError(409, 'invalid_payment_transition', validation.message)
    }

    const now = new Date()
    const updateData: Prisma.PaymentRecordUpdateManyMutationInput = {
      status: toStatus,
      lastWebhookSignature: signatureFingerprint(signature),
      webhookVerifiedAt: now,
    }
    if (toStatus === 'AUTHORIZED' || toStatus === 'PAID') {
      updateData.paidAt = now
      updateData.failedAt = null
      updateData.failureReason = null
    }
    if (toStatus === 'FAILED') {
      updateData.failedAt = now
      updateData.failureReason = safeWebhookMessage(parsed.message, 'Pagamento simulado recusado via webhook.')
    }

    const update = await tx.paymentRecord.updateMany({
      where: { id: payment.id, status: fromStatus },
      data: updateData,
    })

    if (update.count === 0) {
      const current = await tx.paymentRecord.findUnique({
        where: { id: payment.id },
        select: { status: true },
      })
      if (current?.status === toStatus) {
        return {
          ok: true,
          idempotent: true,
          paymentId: payment.id,
          provider: 'simulated',
          fromStatus: current.status as PaymentStatus,
          toStatus,
          signatureVerified: true,
        }
      }
      throw new SimulatedPaymentError(409, 'payment_status_conflict', 'Pagamento foi atualizado por outra operacao.')
    }

    await tx.serviceRequest.update({
      where: { id: payment.serviceRequestId },
      data: { paymentStatus: toStatus },
    })

    await tx.paymentEvent.create({
      data: {
        paymentRecordId: payment.id,
        eventType: validation.eventType!,
        fromStatus,
        toStatus,
        message: safeWebhookMessage(parsed.message, `Webhook simulado: ${fromStatus} -> ${toStatus}`),
        rawPayload: safeWebhookPayload(parsed),
      },
    })

    await tx.serviceTimelineEvent.create({
      data: {
        serviceId: payment.serviceRequestId,
        status: payment.serviceRequest?.status || 'COMPLETED',
        label: toStatus === 'AUTHORIZED'
          ? `Pagamento ${payment.method} autorizado via webhook simulado`
          : toStatus === 'PAID'
            ? `Pagamento ${payment.method} confirmado via webhook simulado`
            : toStatus === 'FAILED'
              ? `Pagamento ${payment.method} recusado via webhook simulado`
              : toStatus === 'CANCELED'
                ? `Pagamento ${payment.method} cancelado via webhook simulado`
                : `Pagamento ${payment.method} estornado via webhook simulado`,
      },
    }).catch(() => {})

    return {
      ok: true,
      idempotent: false,
      paymentId: payment.id,
      provider: 'simulated',
      fromStatus,
      toStatus,
      eventType: validation.eventType,
      signatureVerified: true,
    }
  })
}

export async function simulateSignedPaymentWebhookReplay(params: {
  paymentRecordId?: string
  providerPaymentId?: string
  externalReference?: string
  event: string
  message?: string
}) {
  const gateway = getStrictSimulatedGateway()

  if (!isSimulatedWebhookEvent(params.event)) {
    throw new SimulatedPaymentError(
      400,
      'invalid_webhook_event',
      `Evento invalido. Use um destes: ${SIMULATED_WEBHOOK_EVENTS.join(', ')}`,
    )
  }

  const payment = await db.paymentRecord.findFirst({
    where: {
      provider: 'simulated',
      OR: [
        ...(params.paymentRecordId ? [{ id: params.paymentRecordId }] : []),
        ...(params.providerPaymentId ? [{ providerPaymentId: params.providerPaymentId }] : []),
        ...(params.externalReference ? [{ externalReference: params.externalReference }] : []),
      ],
    },
    include: {
      serviceRequest: { select: { id: true, status: true, paymentStatus: true } },
    },
  })

  if (!payment) {
    throw new SimulatedPaymentError(404, 'payment_record_not_found', 'PaymentRecord canonico nao encontrado.')
  }

  assertCanonicalSimulatedPaymentRecord(payment)

  if (!payment.providerPaymentId) {
    throw new SimulatedPaymentError(400, 'missing_provider_payment_id', 'PaymentRecord canonico sem providerPaymentId.')
  }

  const generated = await gateway.generateSignedWebhook!(
    payment.providerPaymentId,
    params.event,
    safeWebhookMessage(params.message, `Simulated: ${params.event}`),
  )
  const webhookResult = await processSimulatedPaymentWebhook({
    rawBody: generated.body,
    headers: generated.headers,
  })

  return {
    ok: true,
    webhookResult,
    webhook: {
      event: params.event,
      paymentId: payment.id,
      providerPaymentId: payment.providerPaymentId,
      externalReference: payment.externalReference,
      signatureGenerated: Boolean(generated.signature),
    },
  }
}

export async function getPaymentViewForService(user: CurrentUser, serviceRequestId: string) {
  const service = await loadService(serviceRequestId)
  if (!service) {
    throw new SimulatedPaymentError(404, 'service_not_found', 'Servico nao encontrado.')
  }
  const viewerRole = assertCanViewPayment(user, service)
  const record = await db.paymentRecord.findFirst({
    where: { serviceRequestId: service.id },
    include: { events: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) {
    const values = deriveCanonicalAmounts(service)
    return {
      available: false,
      serviceRequestId: service.id,
      status: service.paymentStatus,
      amount: values.amount,
      method: values.method,
      ...(viewerRole === 'PROVIDER' ? { providerPayout: values.providerPayout } : {}),
    }
  }

  return {
    available: true,
    payment: serializePaymentForRole(record, viewerRole),
  }
}

export function serializePaymentForRole(record: PaymentRecordWithEvents, viewerRole: PaymentViewerRole) {
  const base = {
    serviceRequestId: record.serviceRequestId,
    status: record.status,
    amount: record.amount,
    method: record.method,
    paidAt: record.paidAt?.getTime() || null,
    failedAt: record.failedAt?.getTime() || null,
    createdAt: record.createdAt.getTime(),
  }

  if (viewerRole === 'CLIENT') return base

  if (viewerRole === 'PROVIDER') {
    return {
      ...base,
      providerPayout: record.providerPayout,
    }
  }

  return {
    ...base,
    id: record.id,
    platformFee: record.platformFee,
    providerPayout: record.providerPayout,
    discountAmount: record.discountAmount,
    couponCode: record.couponCode,
    provider: record.provider,
    providerPaymentId: record.providerPaymentId,
    externalReference: record.externalReference,
    idempotencyKey: record.idempotencyKey,
    simulatedTransactionId: record.simulatedTransactionId,
    failureReason: record.failureReason,
    updatedAt: record.updatedAt.getTime(),
    events: record.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      message: event.message,
      createdAt: event.createdAt.getTime(),
    })),
  }
}

export function handleSimulatedPaymentError(error: unknown) {
  if (error instanceof SimulatedPaymentError) {
    return { status: error.status, body: { ok: false, code: error.code, message: error.message } }
  }
  if (error instanceof Error && error.message.startsWith('Unauthorized')) {
    return { status: 401, body: { ok: false, code: 'unauthorized', message: error.message } }
  }
  if (error instanceof Error && error.message.startsWith('Forbidden')) {
    return { status: 403, body: { ok: false, code: 'forbidden', message: error.message } }
  }
  return { status: 500, body: { ok: false, code: 'payment_error', message: 'Erro ao processar pagamento.' } }
}

export const SIMULATED_PAYMENT_ELIGIBLE_STATUSES = ELIGIBLE_PAYMENT_STATUSES
