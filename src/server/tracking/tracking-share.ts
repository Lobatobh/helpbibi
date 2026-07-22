import { randomBytes } from 'crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { roundCoords } from './tracking-security'

type DbClient = PrismaClient | Prisma.TransactionClient

export type TrackingActor = {
  id: string
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN'
}

export const TRACKING_ACTIVE_TTL_MS = 24 * 60 * 60 * 1000
export const TRACKING_TERMINAL_TTL_MS = 2 * 60 * 60 * 1000

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELED', 'FAILED', 'EXPIRED'])
const POSITION_STATUSES = new Set(['ACCEPTED', 'PROVIDER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'])

const statusToPublic: Record<string, string> = {
  REQUESTED: 'searching',
  OFFERED: 'offered',
  ACCEPTED: 'accepted',
  PROVIDER_EN_ROUTE: 'arriving',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELED: 'cancelled',
  EXPIRED: 'expired',
  FAILED: 'failed',
}

const typeLabels: Record<string, string> = {
  REBOQUE: 'Reboque / Guincho',
  PNEU: 'Troca de Pneu',
  BATERIA: 'Carga de Bateria',
  COMBUSTIVEL: 'Combustivel',
  CHAVEIRO: 'Chaveiro',
  PANE: 'Pane Mecanica',
}

export function isTrackingShareValid(
  share: { serviceId: string; activeKey: string | null; revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return share.activeKey === share.serviceId &&
    share.revokedAt === null &&
    share.expiresAt !== null &&
    share.expiresAt.getTime() > now.getTime()
}

async function loadAuthorizedService(db: DbClient, serviceId: string, actor: TrackingActor) {
  const service = await db.serviceRequest.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      clientId: true,
      status: true,
      provider: { select: { userId: true } },
    },
  })
  if (!service) throw new Error('ServiceRequest not found')

  const participant = (actor.role === 'CLIENT' && service.clientId === actor.id) ||
    (actor.role === 'PROVIDER' && service.provider?.userId === actor.id)
  if (!participant) {
    throw new Error('Forbidden: tracking share participant required')
  }
  return service
}

function isUniqueConflict(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === 'P2002'
}

async function createInTransaction(
  tx: DbClient,
  serviceId: string,
  actor: TrackingActor,
  now: Date,
) {
  const service = await loadAuthorizedService(tx, serviceId, actor)
  const current = await tx.trackingShare.findUnique({ where: { activeKey: serviceId } })
  const terminalDeadline = new Date(now.getTime() + TRACKING_TERMINAL_TTL_MS)
  if (current && isTrackingShareValid(current, now)) {
    if (TERMINAL_STATUSES.has(service.status) && current.expiresAt!.getTime() > terminalDeadline.getTime()) {
      return tx.trackingShare.update({ where: { id: current.id }, data: { expiresAt: terminalDeadline } })
    }
    return current
  }

  if (current) {
    await tx.trackingShare.update({
      where: { id: current.id },
      data: { activeKey: null },
    })
  }

  return tx.trackingShare.create({
    data: {
      serviceId,
      token: randomBytes(32).toString('base64url'),
      expiresAt: TERMINAL_STATUSES.has(service.status)
        ? terminalDeadline
        : new Date(now.getTime() + TRACKING_ACTIVE_TTL_MS),
      revokedAt: null,
      activeKey: serviceId,
    },
  })
}

export async function createOrReuseTrackingShare(
  db: DbClient,
  serviceId: string,
  actor: TrackingActor,
  now: Date = new Date(),
) {
  try {
    if ('$transaction' in db && typeof db.$transaction === 'function') {
      return await (db as PrismaClient).$transaction(
        (tx) => createInTransaction(tx, serviceId, actor, now),
        { isolationLevel: 'Serializable' },
      )
    }
    return await createInTransaction(db, serviceId, actor, now)
  } catch (error) {
    if (!isUniqueConflict(error)) throw error
    const canonical = await db.trackingShare.findUnique({ where: { activeKey: serviceId } })
    if (canonical && isTrackingShareValid(canonical, now)) return canonical
    throw error
  }
}

export async function revokeTrackingShare(
  db: DbClient,
  serviceId: string,
  actor: TrackingActor,
  now: Date = new Date(),
) {
  const revoke = async (tx: DbClient) => {
    await loadAuthorizedService(tx, serviceId, actor)
    const current = await tx.trackingShare.findUnique({ where: { activeKey: serviceId } })
    if (!current) return { changed: false }
    await tx.trackingShare.update({
      where: { id: current.id },
      data: { revokedAt: now, activeKey: null },
    })
    return { changed: true }
  }

  if ('$transaction' in db && typeof db.$transaction === 'function') {
    return (db as PrismaClient).$transaction((tx) => revoke(tx))
  }
  return revoke(db)
}

export async function limitTrackingShareAfterTerminal(
  db: DbClient,
  serviceId: string,
  now: Date = new Date(),
) {
  if (!(db as any).trackingShare) return null
  const deadline = new Date(now.getTime() + TRACKING_TERMINAL_TTL_MS)
  let current
  try {
    current = await db.trackingShare.findUnique({ where: { activeKey: serviceId } })
  } catch (error) {
    const code = error && typeof error === 'object' ? (error as { code?: string }).code : undefined
    if (code === 'P2021' || code === 'P2022') return null
    throw error
  }
  if (!current || !current.expiresAt || current.expiresAt.getTime() <= deadline.getTime()) return current
  return db.trackingShare.update({ where: { id: current.id }, data: { expiresAt: deadline } })
}

export type PublicTrackingResult =
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'ok'; data: Record<string, unknown> }

export async function getPublicTrackingByToken(
  db: DbClient,
  token: string,
  now: Date = new Date(),
): Promise<PublicTrackingResult> {
  if (!token || token.length < 32 || token.length > 128) return { kind: 'not_found' }

  const share = await db.trackingShare.findUnique({
    where: { token },
    include: {
      service: {
        include: {
          timeline: { orderBy: { createdAt: 'asc' } },
          provider: { include: { user: { select: { name: true } } } },
        },
      },
    },
  })
  if (!share) return { kind: 'not_found' }
  if (!isTrackingShareValid(share, now)) return { kind: 'expired' }

  const service = share.service
  const terminal = TERMINAL_STATUSES.has(service.status)
  const providerName = service.provider?.user?.name?.trim().split(/\s+/)[0] || null
  const providerPosition = !terminal && POSITION_STATUSES.has(service.status) &&
    service.providerLat !== null && service.providerLng !== null &&
    Number.isFinite(service.providerLat) && Number.isFinite(service.providerLng)
      ? { lat: roundCoords(service.providerLat, 3), lng: roundCoords(service.providerLng, 3) }
      : null

  await db.trackingShare.update({
    where: { id: share.id },
    data: { viewCount: { increment: 1 } },
  })

  return {
    kind: 'ok',
    data: {
      available: true,
      status: statusToPublic[service.status] || 'expired',
      typeLabel: typeLabels[service.type] || service.type,
      etaMin: service.etaMin,
      createdAt: service.createdAt.getTime(),
      acceptedAt: service.acceptedAt?.getTime() || null,
      completedAt: service.completedAt?.getTime() || null,
      canceledAt: service.canceledAt?.getTime() || null,
      provider: service.provider
        ? { name: providerName, vehicle: service.provider.vehicle, rating: service.provider.rating }
        : null,
      providerPosition,
      timeline: service.timeline.map((event) => ({
        status: statusToPublic[event.status] || 'expired',
        at: event.createdAt.getTime(),
      })),
    },
  }
}
