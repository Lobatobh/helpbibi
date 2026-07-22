import { db } from '@/server/db/prisma'
import {
  generateExternalReference,
  generateIdempotencyKey,
  generateSimulatedTransactionId,
  type PaymentStatus,
} from '@/server/payments/payment-state-machine'
import type { PaymentRecordWithEvents } from '@/server/repositories/payment.repository'

export type CreatePaymentInput = {
  serviceRequestId: string
  method: string
  amount: number
  platformFee: number
  providerPayout: number
  discountAmount?: number
  couponCode?: string | null
}

// Test-only fixture. Production payment creation belongs to simulated-payment-workflow.
export async function createPaymentRecord(input: CreatePaymentInput): Promise<PaymentRecordWithEvents> {
  const idempotencyKey = generateIdempotencyKey('test-pay', input.serviceRequestId)
  const record = await db.paymentRecord.create({
    data: {
      serviceRequestId: input.serviceRequestId,
      method: input.method,
      status: 'PENDING',
      amount: input.amount,
      platformFee: input.platformFee,
      providerPayout: input.providerPayout,
      discountAmount: input.discountAmount ?? 0,
      couponCode: input.couponCode ?? null,
      provider: 'simulated',
      providerPaymentId: `test-${idempotencyKey}`,
      externalReference: generateExternalReference(input.serviceRequestId),
      idempotencyKey,
      simulatedTransactionId: generateSimulatedTransactionId(input.serviceRequestId),
      events: {
        create: {
          eventType: 'CREATED',
          fromStatus: null,
          toStatus: 'PENDING',
          message: 'Test payment fixture created',
        },
      },
    },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  })

  await db.serviceRequest.update({
    where: { id: input.serviceRequestId },
    data: { paymentStatus: 'PENDING' },
  })

  return {
    ...record,
    status: record.status as PaymentStatus,
    events: record.events.map((event) => ({
      ...event,
      fromStatus: event.fromStatus as PaymentStatus | null,
      toStatus: event.toStatus as PaymentStatus | null,
    })),
  }
}
