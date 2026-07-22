// Help Bibi — Payment Repository (FASE 25.3/25.4)
import { db } from '@/server/db/prisma'
import {
  validateTransition, canTransition, isTerminalStatus, toCents, fromCents,
  generateIdempotencyKey, generateSimulatedTransactionId, generateExternalReference,
  type PaymentStatus,
} from '@/server/payments/payment-state-machine'
import { getPaymentGateway } from '@/server/payments/gateways'
import { logger } from '@/server/logger'

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

export async function getPaymentByService(serviceRequestId: string): Promise<PaymentRecordWithEvents | null> {
  const record = await db.paymentRecord.findUnique({ where: { serviceRequestId }, include: { events: { orderBy: { createdAt: 'asc' } } } })
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

/**
 * Cancel a payment (PENDING or AUTHORIZED → CANCELED).
 * FASE 29: calls gateway.cancelPayment if provider is not simulated, then transitions.
 */
export async function cancelPayment(paymentRecordId: string, reason?: string): Promise<PaymentRecordWithEvents> {
  const record = await db.paymentRecord.findUnique({ where: { id: paymentRecordId } })
  if (!record) throw new Error(`PaymentRecord not found: ${paymentRecordId}`)
  if (record.status !== 'PENDING' && record.status !== 'AUTHORIZED') {
    throw new Error(`Cannot cancel payment in status ${record.status}`)
  }
  // Call gateway cancel if we have a providerPaymentId and provider is not simulated
  if (record.providerPaymentId && record.provider !== 'simulated') {
    try {
      const gateway = getPaymentGateway()
      await gateway.cancelPayment(record.providerPaymentId, reason)
    } catch (e: any) {
      // Log but don't block — the local transition still happens
      logger.warn('payment', 'Gateway cancel failed (continuing with local cancel)', { message: e.message })
    }
  }
  return transitionPayment(paymentRecordId, 'CANCELED', { message: reason || 'Payment canceled' })
}

/**
 * Refund a payment (PAID → REFUNDED).
 * FASE 29: calls gateway.refundPayment if provider is not simulated, then transitions.
 * Prevents double refund by checking current status.
 */
export async function refundPayment(paymentRecordId: string, amount?: number, reason?: string): Promise<PaymentRecordWithEvents> {
  const record = await db.paymentRecord.findUnique({ where: { id: paymentRecordId } })
  if (!record) throw new Error(`PaymentRecord not found: ${paymentRecordId}`)
  if (record.status !== 'PAID') {
    throw new Error(`Cannot refund payment in status ${record.status} — only PAID can be refunded`)
  }
  // Prevent double refund
  if (record.status === 'REFUNDED') {
    throw new Error('Payment already refunded')
  }
  // Call gateway refund if we have a providerPaymentId and provider is not simulated
  if (record.providerPaymentId && record.provider !== 'simulated') {
    try {
      const gateway = getPaymentGateway()
      await gateway.refundPayment({ providerPaymentId: record.providerPaymentId, amount, reason })
    } catch (e: any) {
      logger.warn('payment', 'Gateway refund failed (continuing with local refund)', { message: e.message })
    }
  }
  return transitionPayment(paymentRecordId, 'REFUNDED', { message: reason || `Refund${amount ? ' of R$ ' + amount : ''}` })
}

export type ReconciliationIssue = {
  paymentRecordId: string
  serviceRequestId: string
  issue: string
  severity: 'warning' | 'error'
  currentStatus: PaymentStatus
  amount: number
}

/**
 * Reconcile PaymentRecords to detect issues.
 * FASE 29: identifies pending-too-long, paid-without-final-event, failed-with-retry, amount mismatches.
 */
export async function reconcilePayments(): Promise<{ issues: ReconciliationIssue[]; totalChecked: number; totalIssues: number }> {
  const records = await db.paymentRecord.findMany({ include: { events: true } })
  const issues: ReconciliationIssue[] = []
  const now = Date.now()
  const ONE_HOUR = 60 * 60 * 1000

  for (const r of records) {
    const ageMs = now - r.createdAt.getTime()

    // Pending too long (>1h)
    if (r.status === 'PENDING' && ageMs > ONE_HOUR) {
      issues.push({ paymentRecordId: r.id, serviceRequestId: r.serviceRequestId, issue: 'PENDING for >1 hour', severity: 'warning', currentStatus: 'PENDING', amount: r.amount })
    }

    // PAID without PAID event
    if (r.status === 'PAID' && !r.events.some(e => e.eventType === 'PAID')) {
      issues.push({ paymentRecordId: r.id, serviceRequestId: r.serviceRequestId, issue: 'PAID status but no PAID event', severity: 'error', currentStatus: 'PAID', amount: r.amount })
    }

    // FAILED with no retry attempt (>24h old)
    if (r.status === 'FAILED' && ageMs > 24 * ONE_HOUR) {
      issues.push({ paymentRecordId: r.id, serviceRequestId: r.serviceRequestId, issue: 'FAILED for >24h with no retry', severity: 'warning', currentStatus: 'FAILED', amount: r.amount })
    }

    // REFUNDED without REFUNDED event
    if (r.status === 'REFUNDED' && !r.events.some(e => e.eventType === 'REFUNDED')) {
      issues.push({ paymentRecordId: r.id, serviceRequestId: r.serviceRequestId, issue: 'REFUNDED status but no REFUNDED event', severity: 'error', currentStatus: 'REFUNDED', amount: r.amount })
    }

    // FASE 29.1: Webhook received but no status change (needs reconciliation)
    const hasWebhookNoChange = r.events.some(e => e.eventType === 'WEBHOOK' && e.fromStatus === e.toStatus && e.message?.includes('needs reconciliation'))
    if (hasWebhookNoChange && r.status === 'PENDING') {
      issues.push({ paymentRecordId: r.id, serviceRequestId: r.serviceRequestId, issue: 'Webhook received without status — needs API lookup/reconciliation', severity: 'warning', currentStatus: 'PENDING', amount: r.amount })
    }
  }

  return { issues, totalChecked: records.length, totalIssues: issues.length }
}

export { validateTransition, canTransition, isTerminalStatus, toCents, fromCents, generateIdempotencyKey, generateSimulatedTransactionId, generateExternalReference }
