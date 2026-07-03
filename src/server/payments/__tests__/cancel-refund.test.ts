// Help Bibi — Cancel & Refund tests (FASE 29)
// Integration tests against the real Prisma SQLite DB.
// Mirrors the setup pattern in payment-persistence.test.ts.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { db } from '@/server/db/prisma'
import {
  createPaymentRecord,
  transitionPayment,
  getPaymentById,
  cancelPayment,
  refundPayment,
  type CreatePaymentInput,
} from '@/server/repositories/payment.repository'

const PICKUP_JSON = JSON.stringify({ lat: -23.5505, lng: -46.6333 })
const DEST_JSON = JSON.stringify({ lat: -23.56, lng: -46.64 })

describe('cancel-refund — repository integration (FASE 29)', () => {
  let clientUser: { id: string }
  let serviceRequest: { id: string }
  const createdServiceIds: string[] = []
  const createdUserIds: string[] = []

  beforeEach(async () => {
    const email = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@helpbibi.com`
    const user = await db.user.create({ data: { email, name: 'CR Test Client', role: 'CLIENT' } })
    createdUserIds.push(user.id)
    clientUser = user

    const svc = await db.serviceRequest.create({
      data: {
        clientId: user.id,
        type: 'REBOQUE',
        pickup: PICKUP_JSON,
        pickupLabel: 'Av. Paulista, 1000',
        destination: DEST_JSON,
        destinationLabel: 'Rua Augusta, 500',
        price: 180,
        originalPrice: 200,
        discount: 20,
        paymentMethod: 'PIX',
        paymentStatus: 'PENDING',
        distanceKm: 5.5,
        etaMin: 12,
      },
    })
    createdServiceIds.push(svc.id)
    serviceRequest = svc
  })

  afterEach(async () => {
    // ServiceRequest cascade deletes PaymentRecord + PaymentEvent + Timeline + Chat
    for (const id of createdServiceIds) {
      await db.serviceRequest.delete({ where: { id } }).catch(() => {})
    }
    createdServiceIds.length = 0
    for (const id of createdUserIds) {
      await db.user.delete({ where: { id } }).catch(() => {})
    }
    createdUserIds.length = 0
  })

  const baseInput = (): CreatePaymentInput => ({
    serviceRequestId: serviceRequest.id,
    method: 'PIX',
    amount: 180,
    platformFee: 36,
    providerPayout: 144,
  })

  test('1. cancelPayment PENDING → CANCELED creates CANCELED event', async () => {
    const record = await createPaymentRecord(baseInput())
    const canceled = await cancelPayment(record.id)
    expect(canceled.status).toBe('CANCELED')
    const canceledEvents = canceled.events.filter((e) => e.eventType === 'CANCELED')
    expect(canceledEvents.length).toBe(1)
    expect(canceledEvents[0].fromStatus).toBe('PENDING')
    expect(canceledEvents[0].toStatus).toBe('CANCELED')
    // ServiceRequest.paymentStatus synced
    const svc = await db.serviceRequest.findUnique({ where: { id: serviceRequest.id } })
    expect(svc!.paymentStatus).toBe('CANCELED')
  })

  test('2. cancelPayment AUTHORIZED → CANCELED works', async () => {
    const record = await createPaymentRecord(baseInput())
    await transitionPayment(record.id, 'AUTHORIZED', { message: 'authorized' })
    const canceled = await cancelPayment(record.id)
    expect(canceled.status).toBe('CANCELED')
    const canceledEvents = canceled.events.filter((e) => e.eventType === 'CANCELED')
    expect(canceledEvents.length).toBe(1)
    expect(canceledEvents[0].fromStatus).toBe('AUTHORIZED')
    expect(canceledEvents[0].toStatus).toBe('CANCELED')
  })

  test('3. cancelPayment PAID → CANCELED throws (invalid transition)', async () => {
    const record = await createPaymentRecord(baseInput())
    await transitionPayment(record.id, 'PAID', { message: 'paid' })
    expect(cancelPayment(record.id)).rejects.toThrow(/Cannot cancel payment in status PAID/)
    // Verify state unchanged
    const fetched = await getPaymentById(record.id)
    expect(fetched!.status).toBe('PAID')
  })

  test('4. cancelPayment REFUNDED → CANCELED throws', async () => {
    const record = await createPaymentRecord(baseInput())
    await transitionPayment(record.id, 'PAID', { message: 'paid' })
    await transitionPayment(record.id, 'REFUNDED', { message: 'refunded' })
    expect(cancelPayment(record.id)).rejects.toThrow(/Cannot cancel payment in status REFUNDED/)
    const fetched = await getPaymentById(record.id)
    expect(fetched!.status).toBe('REFUNDED')
  })

  test('5. refundPayment PAID → REFUNDED creates REFUNDED event', async () => {
    const record = await createPaymentRecord(baseInput())
    await transitionPayment(record.id, 'PAID', { message: 'paid' })
    const refunded = await refundPayment(record.id)
    expect(refunded.status).toBe('REFUNDED')
    const refundEvents = refunded.events.filter((e) => e.eventType === 'REFUNDED')
    expect(refundEvents.length).toBe(1)
    expect(refundEvents[0].fromStatus).toBe('PAID')
    expect(refundEvents[0].toStatus).toBe('REFUNDED')
    const svc = await db.serviceRequest.findUnique({ where: { id: serviceRequest.id } })
    expect(svc!.paymentStatus).toBe('REFUNDED')
  })

  test('6. refundPayment PENDING → REFUNDED throws (only PAID can be refunded)', async () => {
    const record = await createPaymentRecord(baseInput())
    expect(refundPayment(record.id)).rejects.toThrow(/only PAID can be refunded/)
    const fetched = await getPaymentById(record.id)
    expect(fetched!.status).toBe('PENDING')
  })

  test('7. refundPayment double refund throws (REFUNDED → REFUNDED blocked)', async () => {
    const record = await createPaymentRecord(baseInput())
    await transitionPayment(record.id, 'PAID', { message: 'paid' })
    await refundPayment(record.id)
    expect(refundPayment(record.id)).rejects.toThrow(/only PAID can be refunded/)
    const fetched = await getPaymentById(record.id)
    expect(fetched!.status).toBe('REFUNDED')
    // Only one REFUNDED event should exist
    const refundEvents = fetched!.events.filter((e) => e.eventType === 'REFUNDED')
    expect(refundEvents.length).toBe(1)
  })

  test('8. cancelPayment with reason stores reason in message', async () => {
    const record = await createPaymentRecord(baseInput())
    const reason = 'Cliente desistiu antes do pagamento'
    const canceled = await cancelPayment(record.id, reason)
    const canceledEvents = canceled.events.filter((e) => e.eventType === 'CANCELED')
    expect(canceledEvents.length).toBe(1)
    expect(canceledEvents[0].message).toBe(reason)
  })

  test('9. refundPayment with amount stores amount in message', async () => {
    const record = await createPaymentRecord(baseInput())
    await transitionPayment(record.id, 'PAID', { message: 'paid' })
    const refunded = await refundPayment(record.id, 100)
    const refundEvents = refunded.events.filter((e) => e.eventType === 'REFUNDED')
    expect(refundEvents.length).toBe(1)
    expect(refundEvents[0].message).toContain('100')
    expect(refundEvents[0].message).toContain('Refund')
  })

  test('10. cancelPayment on unknown id throws', async () => {
    expect(cancelPayment('non_existent_id')).rejects.toThrow(/PaymentRecord not found/)
  })

  test('11. refundPayment on unknown id throws', async () => {
    expect(refundPayment('non_existent_id')).rejects.toThrow(/PaymentRecord not found/)
  })

  test('12. cancelPayment with FAILED status throws', async () => {
    const record = await createPaymentRecord(baseInput())
    await transitionPayment(record.id, 'FAILED', { message: 'failed' })
    expect(cancelPayment(record.id)).rejects.toThrow(/Cannot cancel payment in status FAILED/)
  })
})
