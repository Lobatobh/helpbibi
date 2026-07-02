// Help Bibi — Payment Repository (FASE 25.3/25.4)
import { db } from '@/server/db/prisma'
import {
  validateTransition, canTransition, isTerminalStatus, toCents, fromCents,
  generateIdempotencyKey, generateSimulatedTransactionId, generateExternalReference,
  type PaymentStatus,
} from '@/server/payments/payment-state-machine'
import { getPaymentGateway, getActiveProvider } from '@/server/payments/gateways'
import { mapToGatewayMethod } from '@/server/payments/gateways/payment-gateway'

export type CreatePaymentInput = {
  serviceRequestId: string; method: string; amount: number; platformFee: number;
  providerPayout: number; discountAmount?: number; couponCode?: string | null;
}

export type PaymentRecordWithEvents = {
  id: string; serviceRequestId: string; method: string; status: PaymentStatus;
  amount: number; platformFee: number; providerPayout: number;
  discountAmount: number | null; couponCode: string | null;
  provider: string | null; providerPaymentId: string | null; externalReference: string | null;
  idempotencyKey: string | null; simulatedTransactionId: string | null;
  paidAt: Date | null; failedAt: Date | null; failureReason: string | null;
  lastWebhookSignature: string | null; webhookVerifiedAt: Date | null;
  createdAt: Date; updatedAt: Date;
  events: Array<{ id: string; eventType: string; fromStatus: PaymentStatus | null; toStatus: PaymentStatus | null; message: string | null; createdAt: Date }>;
}

const toJson = (v: unknown): string | null => { if (v === null || v === undefined) return null; try { return JSON.stringify(v) } catch { return null } }

export async function createPaymentRecord(input: CreatePaymentInput): Promise<PaymentRecordWithEvents> {
  const method = mapToGatewayMethod(input.method)
  const gateway = getPaymentGateway()
  const provider = getActiveProvider()
  const intent = await gateway.createPaymentIntent({
    serviceRequestId: input.serviceRequestId, method, amount: input.amount,
    platformFee: input.platformFee, providerPayout: input.providerPayout,
    discountAmount: input.discountAmount || 0, couponCode: input.couponCode || null,
  })
  const idempotencyKey = intent.idempotencyKey || generateIdempotencyKey('pay', input.serviceRequestId)
  const externalReference = intent.externalReference || generateExternalReference(input.serviceRequestId)
  const providerPaymentId = intent.providerPaymentId
  const simulatedTxId = provider === 'simulated' ? generateSimulatedTransactionId(input.serviceRequestId) : null

  const existing = await db.paymentRecord.findUnique({ where: { idempotencyKey }, include: { events: { orderBy: { createdAt: 'asc' } } } }).catch(() => null)
  if (existing) return sanitizeRecord(existing)

  const record = await db.paymentRecord.create({
    data: {
      serviceRequestId: input.serviceRequestId, method, status: 'PENDING',
      amount: input.amount, platformFee: input.platformFee, providerPayout: input.providerPayout,
      discountAmount: input.discountAmount || 0, couponCode: input.couponCode || null,
      provider, providerPaymentId, externalReference, idempotencyKey, simulatedTransactionId: simulatedTxId,
      metadata: toJson(intent.methodData), rawPayload: toJson(intent.rawPayload),
      events: { create: { eventType: 'CREATED', fromStatus: null, toStatus: 'PENDING', message: `Payment intent created via ${provider}`, rawPayload: toJson(intent.rawPayload) } },
    },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  })
  await db.serviceRequest.update({ where: { id: input.serviceRequestId }, data: { paymentStatus: 'PENDING' } }).catch(() => {})
  return sanitizeRecord(record)
}

export async function transitionPayment(
  paymentRecordId: string, toStatus: PaymentStatus,
  options?: { message?: string; rawPayload?: unknown; webhookSignature?: string }
): Promise<PaymentRecordWithEvents> {
  const record = await db.paymentRecord.findUnique({ where: { id: paymentRecordId }, include: { events: { orderBy: { createdAt: 'asc' } } } })
  if (!record) throw new Error(`PaymentRecord not found: ${paymentRecordId}`)
  const fromStatus = record.status as PaymentStatus
  const validation = validateTransition(fromStatus, toStatus)
  if (!validation.valid) {
    await db.paymentEvent.create({ data: { paymentRecordId: record.id, eventType: 'WEBHOOK', fromStatus, toStatus, message: `Rejected transition: ${validation.message}`, rawPayload: toJson(options?.rawPayload) } }).catch(() => {})
    throw new Error(`Invalid payment transition: ${validation.message}`)
  }
  const eventType = validation.eventType || 'PAID'
  const now = new Date()
  const updateData: Record<string, unknown> = {
    status: toStatus,
    events: { create: { eventType, fromStatus, toStatus, message: options?.message || `${fromStatus} → ${toStatus}`, rawPayload: toJson(options?.rawPayload) } },
  }
  if (toStatus === 'PAID' || toStatus === 'AUTHORIZED') updateData.paidAt = now
  if (toStatus === 'FAILED') { updateData.failedAt = now; updateData.failureReason = options?.message || 'Payment failed' }
  if (options?.webhookSignature) { updateData.lastWebhookSignature = options.webhookSignature; updateData.webhookVerifiedAt = now }
  const updated = await db.paymentRecord.update({ where: { id: paymentRecordId }, data: updateData, include: { events: { orderBy: { createdAt: 'asc' } } } })
  await db.serviceRequest.update({ where: { id: record.serviceRequestId }, data: { paymentStatus: toStatus } }).catch(() => {})
  return sanitizeRecord(updated)
}

export async function simulatePaymentOutcome(
  serviceRequestId: string, outcome: 'success' | 'failure', method: string,
  amount: number, platformFee: number, providerPayout: number,
  discountAmount: number = 0, couponCode: string | null = null
): Promise<PaymentRecordWithEvents> {
  let record = await db.paymentRecord.findFirst({ where: { serviceRequestId }, include: { events: { orderBy: { createdAt: 'asc' } } } })
  if (!record) {
    const created = await createPaymentRecord({ serviceRequestId, method, amount, platformFee, providerPayout, discountAmount, couponCode })
    record = await db.paymentRecord.findUnique({ where: { id: created.id }, include: { events: { orderBy: { createdAt: 'asc' } } } })
  }
  if (!record) throw new Error('Failed to create/find payment record')
  if (outcome === 'success') {
    return transitionPayment(record.id, 'PAID', { message: `Simulated approval (${method})`, rawPayload: { simulated: true, outcome, method } })
  } else {
    return transitionPayment(record.id, 'FAILED', { message: `Simulated failure (${method})`, rawPayload: { simulated: true, outcome, method } })
  }
}

export async function processWebhook(rawBody: string, signature: string, headers: Record<string, string>): Promise<{ processed: boolean; reason: string; recordId?: string }> {
  const gateway = getPaymentGateway()
  const verification = await gateway.verifyWebhookSignature(rawBody, signature, headers as any)
  if (!verification.valid) return { processed: false, reason: `Signature invalid: ${verification.reason}` }
  const event = await gateway.parseWebhookEvent(rawBody, headers).catch((e) => { throw new Error(`Webhook parse error: ${e.message}`) })
  const record = await db.paymentRecord.findFirst({ where: { OR: [{ providerPaymentId: event.providerPaymentId || '' }, { externalReference: event.externalReference || '' }] } })
  if (!record) return { processed: false, reason: 'No PaymentRecord matches webhook providerPaymentId/externalReference' }
  if (record.lastWebhookSignature === signature) {
    await db.paymentEvent.create({ data: { paymentRecordId: record.id, eventType: 'WEBHOOK', fromStatus: record.status as PaymentStatus, toStatus: record.status as PaymentStatus, message: `Duplicate webhook ignored (same signature)`, rawPayload: toJson(event.rawPayload) } }).catch(() => {})
    return { processed: false, reason: 'Duplicate webhook (idempotent skip)', recordId: record.id }
  }
  const statusMap: Record<string, PaymentStatus> = { AUTHORIZED: 'AUTHORIZED', PAID: 'PAID', FAILED: 'FAILED', CANCELED: 'CANCELED', REFUNDED: 'REFUNDED' }
  const target = statusMap[event.event]
  if (!target) return { processed: false, reason: `Unknown webhook event: ${event.event}`, recordId: record.id }
  if (!canTransition(record.status as PaymentStatus, target)) {
    await db.paymentEvent.create({ data: { paymentRecordId: record.id, eventType: 'WEBHOOK', fromStatus: record.status as PaymentStatus, toStatus: target, message: `Webhook transition not allowed: ${record.status} → ${target}`, rawPayload: toJson(event.rawPayload) } }).catch(() => {})
    return { processed: false, reason: `Transition not allowed: ${record.status} → ${target}`, recordId: record.id }
  }
  await transitionPayment(record.id, target, { message: event.message, rawPayload: event.rawPayload, webhookSignature: signature })
  return { processed: true, reason: `Webhook processed: ${event.event}`, recordId: record.id }
}

export async function getPaymentByService(serviceRequestId: string): Promise<PaymentRecordWithEvents | null> {
  const record = await db.paymentRecord.findFirst({ where: { serviceRequestId }, include: { events: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } })
  return record ? sanitizeRecord(record) : null
}
export async function getPaymentById(id: string): Promise<PaymentRecordWithEvents | null> {
  const record = await db.paymentRecord.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } } } })
  return record ? sanitizeRecord(record) : null
}
export async function listPaymentsByStatus(status?: PaymentStatus): Promise<PaymentRecordWithEvents[]> {
  const records = await db.paymentRecord.findMany({ where: status ? { status } : undefined, include: { events: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } })
  return records.map(sanitizeRecord)
}

function sanitizeRecord(r: any): PaymentRecordWithEvents {
  return {
    id: r.id, serviceRequestId: r.serviceRequestId, method: r.method, status: r.status as PaymentStatus,
    amount: r.amount, platformFee: r.platformFee, providerPayout: r.providerPayout,
    discountAmount: r.discountAmount, couponCode: r.couponCode, provider: r.provider,
    providerPaymentId: r.providerPaymentId, externalReference: r.externalReference, idempotencyKey: r.idempotencyKey,
    simulatedTransactionId: r.simulatedTransactionId, paidAt: r.paidAt, failedAt: r.failedAt, failureReason: r.failureReason,
    lastWebhookSignature: r.lastWebhookSignature, webhookVerifiedAt: r.webhookVerifiedAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
    events: (r.events || []).map((e: any) => ({ id: e.id, eventType: e.eventType, fromStatus: e.fromStatus as PaymentStatus | null, toStatus: e.toStatus as PaymentStatus | null, message: e.message, createdAt: e.createdAt })),
  }
}

export { validateTransition, canTransition, isTerminalStatus, toCents, fromCents, generateIdempotencyKey, generateSimulatedTransactionId, generateExternalReference }
