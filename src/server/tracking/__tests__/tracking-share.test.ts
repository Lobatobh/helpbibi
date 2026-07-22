import { describe, expect, test } from 'bun:test'
import {
  TRACKING_ACTIVE_TTL_MS,
  TRACKING_TERMINAL_TTL_MS,
  createOrReuseTrackingShare,
  getPublicTrackingByToken,
  isTrackingShareValid,
  limitTrackingShareAfterTerminal,
  revokeTrackingShare,
} from '../tracking-share'

type Share = {
  id: string
  serviceId: string
  token: string
  expiresAt: Date | null
  revokedAt: Date | null
  activeKey: string | null
  createdAt: Date
  viewCount: number
}

function fakeDb(status = 'ACCEPTED') {
  const shares: Share[] = []
  const service = {
    id: 'service-1',
    clientId: 'client-1',
    status,
    type: 'REBOQUE',
    etaMin: 12,
    providerLat: -23.55051,
    providerLng: -46.63331,
    createdAt: new Date('2026-07-22T10:00:00.000Z'),
    acceptedAt: new Date('2026-07-22T10:05:00.000Z'),
    completedAt: status === 'COMPLETED' ? new Date('2026-07-22T11:00:00.000Z') : null,
    canceledAt: null,
    provider: {
      userId: 'provider-user-1',
      vehicle: 'Guincho plataforma',
      rating: 4.9,
      user: { name: 'Maria Prestadora' },
    },
    timeline: [
      { status: 'REQUESTED', createdAt: new Date('2026-07-22T10:00:00.000Z'), label: 'private label' },
      { status, createdAt: new Date('2026-07-22T10:05:00.000Z'), label: 'another private label' },
    ],
  }

  const db: any = {
    serviceRequest: {
      findUnique: async ({ where }: any) => where.id === service.id ? service : null,
    },
    trackingShare: {
      findUnique: async ({ where }: any) => {
        if (Object.prototype.hasOwnProperty.call(where, 'activeKey')) return shares.find((item) => item.activeKey === where.activeKey) || null
        if (Object.prototype.hasOwnProperty.call(where, 'token')) {
          const share = shares.find((item) => item.token === where.token)
          return share ? { ...share, service } : null
        }
        return shares.find((item) => item.id === where.id) || null
      },
      create: async ({ data }: any) => {
        if (shares.some((item) => item.activeKey && item.activeKey === data.activeKey)) {
          throw Object.assign(new Error('unique conflict'), { code: 'P2002' })
        }
        const share = {
          id: `share-${shares.length + 1}`,
          createdAt: new Date(),
          viewCount: 0,
          ...data,
        } as Share
        shares.push(share)
        return share
      },
      update: async ({ where, data }: any) => {
        const share = shares.find((item) => item.id === where.id)
        if (!share) throw new Error('share not found')
        if (data.viewCount?.increment) share.viewCount += data.viewCount.increment
        Object.assign(share, { ...data, viewCount: share.viewCount })
        return share
      },
    },
  }
  db.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(db)
  return { db, shares, service }
}

describe('F35-09B secure TrackingShare', () => {
  test('creates a cryptographically random, expiring canonical link and reuses it', async () => {
    const { db, shares } = fakeDb()
    const now = new Date('2026-07-22T12:00:00.000Z')
    const first = await createOrReuseTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)
    const repeated = await createOrReuseTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.token).toBe(repeated.token)
    expect(first.activeKey).toBe('service-1')
    expect(first.expiresAt?.getTime()).toBe(now.getTime() + TRACKING_ACTIVE_TTL_MS)
    expect(shares).toHaveLength(1)
  })

  test('returns the canonical concurrent link after an activeKey unique conflict', async () => {
    const { db, shares } = fakeDb()
    const now = new Date('2026-07-22T12:00:00.000Z')
    db.trackingShare.create = async () => {
      shares.push({
        id: 'share-concurrent',
        serviceId: 'service-1',
        token: 'A'.repeat(43),
        expiresAt: new Date(now.getTime() + TRACKING_ACTIVE_TTL_MS),
        revokedAt: null,
        activeKey: 'service-1',
        createdAt: now,
        viewCount: 0,
      })
      throw Object.assign(new Error('unique conflict'), { code: 'P2002' })
    }

    const result = await createOrReuseTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)
    expect(result.id).toBe('share-concurrent')
    expect(shares.filter((item) => item.activeKey === 'service-1')).toHaveLength(1)
  })

  test('legacy and expired links are unavailable and an expired active key is replaced', async () => {
    const { db, shares } = fakeDb()
    const now = new Date('2026-07-22T12:00:00.000Z')
    shares.push({ id: 'legacy', serviceId: 'service-1', token: 'legacy-token-value-that-is-long-enough-123', expiresAt: null, revokedAt: null, activeKey: null, createdAt: now, viewCount: 0 })
    expect(isTrackingShareValid(shares[0], now)).toBe(false)
    expect((await getPublicTrackingByToken(db, shares[0].token, now)).kind).toBe('expired')

    shares.push({ id: 'expired', serviceId: 'service-1', token: 'expired-token-value-that-is-long-enough-1', expiresAt: new Date(now.getTime() - 1), revokedAt: null, activeKey: 'service-1', createdAt: now, viewCount: 0 })
    const created = await createOrReuseTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)
    expect(shares.find((item) => item.id === 'expired')?.activeKey).toBeNull()
    expect(created.id).not.toBe('expired')
  })

  test('revocation clears activeKey and records revokedAt atomically and idempotently', async () => {
    const { db, shares } = fakeDb()
    const now = new Date('2026-07-22T12:00:00.000Z')
    await createOrReuseTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)
    const revoked = await revokeTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)
    const repeated = await revokeTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)
    expect(revoked.changed).toBe(true)
    expect(repeated.changed).toBe(false)
    expect(shares[0].activeKey).toBeNull()
    expect(shares[0].revokedAt).toEqual(now)
    expect((await getPublicTrackingByToken(db, shares[0].token, now)).kind).toBe('expired')
  })

  test('only a participant can create or revoke a link and a service id is never a token', async () => {
    const { db } = fakeDb()
    await expect(createOrReuseTrackingShare(db, 'service-1', { id: 'other-client', role: 'CLIENT' })).rejects.toThrow('Forbidden')
    await expect(createOrReuseTrackingShare(db, 'service-1', { id: 'admin-1', role: 'ADMIN' })).rejects.toThrow('Forbidden')
    await expect(revokeTrackingShare(db, 'service-1', { id: 'admin-1', role: 'ADMIN' })).rejects.toThrow('Forbidden')
    expect((await getPublicTrackingByToken(db, 'service-1')).kind).toBe('not_found')
  })

  test('public response is minimal, rounds live position and excludes internal and financial data', async () => {
    const { db } = fakeDb()
    const now = new Date('2026-07-22T12:00:00.000Z')
    const share = await createOrReuseTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)
    const result = await getPublicTrackingByToken(db, share.token, now)
    expect(result.kind).toBe('ok')
    const serialized = JSON.stringify(result)
    for (const forbidden of ['clientId', 'providerId', 'serviceId', 'email', 'phone', 'price', 'payment', 'chat', 'private label']) {
      expect(serialized).not.toContain(forbidden)
    }
    expect((result as any).data.providerPosition).toEqual({ lat: -23.551, lng: -46.633 })
  })

  test('terminal state hides position and caps the active link at two hours', async () => {
    const { db } = fakeDb('COMPLETED')
    const now = new Date('2026-07-22T12:00:00.000Z')
    const share = await createOrReuseTrackingShare(db, 'service-1', { id: 'client-1', role: 'CLIENT' }, now)
    expect(share.expiresAt?.getTime()).toBe(now.getTime() + TRACKING_TERMINAL_TTL_MS)
    await limitTrackingShareAfterTerminal(db, 'service-1', now)
    const result = await getPublicTrackingByToken(db, share.token, now)
    expect(result.kind).toBe('ok')
    expect((result as any).data.providerPosition).toBeNull()
    expect((await getPublicTrackingByToken(db, share.token, new Date(now.getTime() + TRACKING_TERMINAL_TTL_MS))).kind).toBe('expired')
  })
})
