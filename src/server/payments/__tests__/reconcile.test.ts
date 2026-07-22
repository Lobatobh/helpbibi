// Help Bibi — Reconcile tests (FASE 29)
// Integration tests against the real Prisma SQLite DB.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { db } from '@/server/db/prisma'
import {
  transitionPayment,
  reconcilePayments,
  type ReconciliationIssue,
} from '@/server/repositories/payment.repository'
import { createPaymentRecord } from './payment-test-fixture'

const PICKUP_JSON = JSON.stringify({ lat: -23.5505, lng: -46.6333 })
const DEST_JSON = JSON.stringify({ lat: -23.56, lng: -46.64 })

describe('reconcile — repository integration (FASE 29)', () => {
  let clientUser: { id: string }
  let serviceRequest: { id: string }
  const createdServiceIds: string[] = []
  const createdUserIds: string[] = []
  const createdPaymentIds: string[] = []

  beforeEach(async () => {
    const email = `rc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@helpbibi.com`
    const user = await db.user.create({ data: { email, name: 'RC Test Client', role: 'CLIENT' } })
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
    for (const id of createdServiceIds) {
      await db.serviceRequest.delete({ where: { id } }).catch(() => {})
    }
    createdServiceIds.length = 0
    for (const id of createdUserIds) {
      await db.user.delete({ where: { id } }).catch(() => {})
    }
    createdUserIds.length = 0
    createdPaymentIds.length = 0
  })

  test('1. reconcilePayments returns { issues, totalChecked, totalIssues }', async () => {
    const result = await reconcilePayments()
    expect(result).toHaveProperty('issues')
    expect(result).toHaveProperty('totalChecked')
    expect(result).toHaveProperty('totalIssues')
    expect(Array.isArray(result.issues)).toBe(true)
    expect(typeof result.totalChecked).toBe('number')
    expect(typeof result.totalIssues).toBe('number')
    expect(result.totalIssues).toBe(result.issues.length)
  })

  test('2. totalChecked matches number of PaymentRecords in DB', async () => {
    const beforeCount = await db.paymentRecord.count()
    const r1 = await createPaymentRecord({
      serviceRequestId: serviceRequest.id,
      method: 'PIX', amount: 180, platformFee: 36, providerPayout: 144,
    })
    createdPaymentIds.push(r1.id)
    const result = await reconcilePayments()
    const afterCount = await db.paymentRecord.count()
    expect(result.totalChecked).toBe(afterCount)
    expect(result.totalChecked).toBe(beforeCount + 1)
  })

  test('3. detects PENDING >1h (creates old PENDING record)', async () => {
    const record = await createPaymentRecord({
      serviceRequestId: serviceRequest.id,
      method: 'PIX', amount: 180, platformFee: 36, providerPayout: 144,
    })
    createdPaymentIds.push(record.id)
    // Backdate createdAt to 2 hours ago
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await db.paymentRecord.update({ where: { id: record.id }, data: { createdAt: oldDate } })

    const result = await reconcilePayments()
    const myIssue = result.issues.find((i) => i.paymentRecordId === record.id)
    expect(myIssue).toBeTruthy()
    expect(myIssue!.issue).toContain('PENDING')
    expect(myIssue!.issue).toContain('>1 hour')
    expect(myIssue!.currentStatus).toBe('PENDING')
    expect(myIssue!.amount).toBe(180)
    expect(myIssue!.severity).toBe('warning')
  })

  test('4. detects PAID without PAID event (PAID record, deleted PAID event)', async () => {
    const record = await createPaymentRecord({
      serviceRequestId: serviceRequest.id,
      method: 'PIX', amount: 250, platformFee: 50, providerPayout: 200,
    })
    createdPaymentIds.push(record.id)
    await transitionPayment(record.id, 'PAID', { message: 'paid' })
    // Delete the PAID event to simulate inconsistency
    const paidEvents = await db.paymentEvent.findMany({ where: { paymentRecordId: record.id, eventType: 'PAID' } })
    for (const e of paidEvents) {
      await db.paymentEvent.delete({ where: { id: e.id } })
    }

    const result = await reconcilePayments()
    const myIssue = result.issues.find((i) => i.paymentRecordId === record.id)
    expect(myIssue).toBeTruthy()
    expect(myIssue!.issue).toContain('PAID status but no PAID event')
    expect(myIssue!.currentStatus).toBe('PAID')
    expect(myIssue!.amount).toBe(250)
    expect(myIssue!.severity).toBe('error')
  })

  test('5. detects FAILED >24h', async () => {
    const record = await createPaymentRecord({
      serviceRequestId: serviceRequest.id,
      method: 'CARD', amount: 300, platformFee: 60, providerPayout: 240,
    })
    createdPaymentIds.push(record.id)
    await transitionPayment(record.id, 'FAILED', { message: 'failed' })
    // Backdate to 25 hours ago
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await db.paymentRecord.update({ where: { id: record.id }, data: { createdAt: oldDate } })

    const result = await reconcilePayments()
    const myIssue = result.issues.find((i) => i.paymentRecordId === record.id)
    expect(myIssue).toBeTruthy()
    expect(myIssue!.issue).toContain('FAILED')
    expect(myIssue!.issue).toContain('>24h')
    expect(myIssue!.currentStatus).toBe('FAILED')
    expect(myIssue!.severity).toBe('warning')
  })

  test('6. clean records produce no issues', async () => {
    // Fresh PENDING record (created just now — not >1h)
    const r1 = await createPaymentRecord({
      serviceRequestId: serviceRequest.id,
      method: 'PIX', amount: 180, platformFee: 36, providerPayout: 144,
    })
    createdPaymentIds.push(r1.id)
    const svc2 = await db.serviceRequest.create({
      data: {
        clientId: clientUser.id,
        type: 'PNEU',
        pickup: PICKUP_JSON,
        pickupLabel: 'A',
        destination: DEST_JSON,
        destinationLabel: 'B',
        price: 200,
        paymentMethod: 'PIX',
        paymentStatus: 'PENDING',
      },
    })
    createdServiceIds.push(svc2.id)
    // PAID with PAID event (clean), attached to a distinct service.
    const r2 = await createPaymentRecord({
      serviceRequestId: svc2.id,
      method: 'PIX', amount: 200, platformFee: 40, providerPayout: 160,
    })
    createdPaymentIds.push(r2.id)
    await transitionPayment(r2.id, 'PAID', { message: 'paid' })

    const result = await reconcilePayments()
    const myIssues = result.issues.filter((i) => createdPaymentIds.includes(i.paymentRecordId))
    expect(myIssues.length).toBe(0)
  })

  test('7. issues have correct shape (paymentRecordId, serviceRequestId, issue, severity, currentStatus, amount)', async () => {
    const record = await createPaymentRecord({
      serviceRequestId: serviceRequest.id,
      method: 'PIX', amount: 180, platformFee: 36, providerPayout: 144,
    })
    createdPaymentIds.push(record.id)
    // Force an issue: backdate to >1h
    await db.paymentRecord.update({
      where: { id: record.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    })

    const result = await reconcilePayments()
    const myIssue = result.issues.find((i) => i.paymentRecordId === record.id)
    expect(myIssue).toBeTruthy()
    // Verify all required fields exist with correct types
    expect(typeof myIssue!.paymentRecordId).toBe('string')
    expect(typeof myIssue!.serviceRequestId).toBe('string')
    expect(typeof myIssue!.issue).toBe('string')
    expect(['warning', 'error']).toContain(myIssue!.severity)
    expect(['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED']).toContain(myIssue!.currentStatus)
    expect(typeof myIssue!.amount).toBe('number')
    // serviceRequestId matches
    expect(myIssue!.serviceRequestId).toBe(serviceRequest.id)
  })

  test('8. detects REFUNDED without REFUNDED event', async () => {
    const record = await createPaymentRecord({
      serviceRequestId: serviceRequest.id,
      method: 'PIX', amount: 400, platformFee: 80, providerPayout: 320,
    })
    createdPaymentIds.push(record.id)
    await transitionPayment(record.id, 'PAID', { message: 'paid' })
    await transitionPayment(record.id, 'REFUNDED', { message: 'refunded' })
    // Delete the REFUNDED event to simulate inconsistency
    const refundEvents = await db.paymentEvent.findMany({ where: { paymentRecordId: record.id, eventType: 'REFUNDED' } })
    for (const e of refundEvents) {
      await db.paymentEvent.delete({ where: { id: e.id } })
    }

    const result = await reconcilePayments()
    const myIssue = result.issues.find((i) => i.paymentRecordId === record.id)
    expect(myIssue).toBeTruthy()
    expect(myIssue!.issue).toContain('REFUNDED status but no REFUNDED event')
    expect(myIssue!.currentStatus).toBe('REFUNDED')
    expect(myIssue!.severity).toBe('error')
  })

  test('9. CANCELED records never produce issues (terminal clean state)', async () => {
    const record = await createPaymentRecord({
      serviceRequestId: serviceRequest.id,
      method: 'PIX', amount: 150, platformFee: 30, providerPayout: 120,
    })
    createdPaymentIds.push(record.id)
    await transitionPayment(record.id, 'CANCELED', { message: 'canceled' })
    // Even backdated — CANCELED is terminal, no issue rule applies
    await db.paymentRecord.update({
      where: { id: record.id },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    })

    const result = await reconcilePayments()
    const myIssue = result.issues.find((i) => i.paymentRecordId === record.id)
    expect(myIssue).toBeUndefined()
  })

  test('10. ReconciliationIssue type fields match contract', async () => {
    // Type-only assertion at compile time (runtime no-op, just verifies type compiles)
    const sample: ReconciliationIssue = {
      paymentRecordId: 'x',
      serviceRequestId: 'y',
      issue: 'PENDING for >1 hour',
      severity: 'warning',
      currentStatus: 'PENDING',
      amount: 100,
    }
    expect(sample.severity).toBe('warning')
  })
})
