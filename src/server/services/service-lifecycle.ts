import type {
  PaymentMethod,
  Prisma,
  PrismaClient,
  ServiceStatus,
  ServiceType,
} from '@prisma/client'
import { canProviderOperate } from '../providers/provider-approval'

type DbClient = PrismaClient | Prisma.TransactionClient

export type OperationalAuditEvent =
  | 'request_created'
  | 'offer_sent'
  | 'offer_accepted'
  | 'offer_declined'
  | 'provider_en_route'
  | 'provider_arrived'
  | 'service_started'
  | 'service_completed'
  | 'service_cancelled'

export type LifecycleAudit = (
  event: OperationalAuditEvent,
  context: {
    actor?: string
    actorRole?: string
    target?: string
    severity?: 'info' | 'warning' | 'error'
    metadata?: Record<string, unknown>
  },
) => void

type LatLng = { lat: number; lng: number }

type TimelineInput = {
  label: string
  eventType?: OperationalAuditEvent | 'offer_expired' | 'service_expired'
  actorRole?: string
  actorUserId?: string | null
  providerProfileId?: string | null
  metadata?: Record<string, unknown>
}

export type CreateOperationalServiceInput = {
  clientId: string
  type: ServiceType
  description?: string
  pickup: LatLng
  pickupLabel: string
  destination: LatLng
  destinationLabel: string
  distanceKm: number
  etaMin: number
  price: number
  originalPrice: number
  discount: number
  promoCode?: string | null
  paymentMethod: PaymentMethod
  loyaltyPoints?: number
  label?: string
}

export type TransitionOptions = TimelineInput & {
  providerId?: string | null
  canceledByRole?: string
  canceledByUserId?: string | null
  cancellationReason?: string | null
  audit?: LifecycleAudit
}

const ACTIVE_STATUSES: ServiceStatus[] = [
  'REQUESTED',
  'OFFERED',
  'ACCEPTED',
  'PROVIDER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
]

const TERMINAL_STATUSES: ServiceStatus[] = ['COMPLETED', 'CANCELED', 'EXPIRED', 'FAILED']
const OPERATIONAL_AUDIT_EVENTS = new Set<string>([
  'request_created',
  'offer_sent',
  'offer_accepted',
  'offer_declined',
  'provider_en_route',
  'provider_arrived',
  'service_started',
  'service_completed',
  'service_cancelled',
])

const ALLOWED_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  REQUESTED: ['OFFERED', 'CANCELED', 'EXPIRED', 'FAILED'],
  OFFERED: ['REQUESTED', 'OFFERED', 'ACCEPTED', 'CANCELED', 'EXPIRED', 'FAILED'],
  ACCEPTED: ['PROVIDER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'FAILED'],
  PROVIDER_EN_ROUTE: ['ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'FAILED'],
  ARRIVED: ['IN_PROGRESS', 'COMPLETED', 'CANCELED', 'FAILED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELED', 'FAILED'],
  COMPLETED: [],
  CANCELED: [],
  EXPIRED: [],
  FAILED: [],
}

function safeJson(value: unknown): string | null {
  if (!value) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export function isActiveServiceStatus(status: ServiceStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}

export function canTransitionServiceStatus(from: ServiceStatus, to: ServiceStatus): boolean {
  if (from === to) return true
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

function assertTransitionAllowed(from: ServiceStatus, to: ServiceStatus): void {
  if (!canTransitionServiceStatus(from, to)) {
    throw new Error(`Invalid service transition: ${from} -> ${to}`)
  }
}

function timestampPatch(status: ServiceStatus, now: Date, service: any): Record<string, Date> {
  switch (status) {
    case 'OFFERED':
      return service.offeredAt ? {} : { offeredAt: now }
    case 'ACCEPTED':
      return service.acceptedAt ? {} : { acceptedAt: now }
    case 'PROVIDER_EN_ROUTE':
      return service.enRouteAt ? {} : { enRouteAt: now }
    case 'ARRIVED':
      return service.arrivedAt ? {} : { arrivedAt: now }
    case 'IN_PROGRESS':
      return service.startedAt ? {} : { startedAt: now }
    case 'COMPLETED':
      return service.completedAt ? {} : { completedAt: now }
    case 'CANCELED':
      return service.canceledAt ? {} : { canceledAt: now }
    default:
      return {}
  }
}

async function createTimelineEvent(
  db: DbClient,
  serviceId: string,
  status: ServiceStatus,
  input: TimelineInput,
) {
  return db.serviceTimelineEvent.create({
    data: {
      serviceId,
      status,
      label: input.label,
      eventType: input.eventType || null,
      actorRole: input.actorRole || null,
      actorUserId: input.actorUserId || null,
      providerProfileId: input.providerProfileId || null,
      metadata: safeJson(input.metadata),
    },
  })
}

function emitAudit(
  audit: LifecycleAudit | undefined,
  event: string | undefined,
  serviceId: string,
  input: TimelineInput,
) {
  if (!audit || !event || !OPERATIONAL_AUDIT_EVENTS.has(event)) return
  audit(event as OperationalAuditEvent, {
    actor: input.actorUserId || undefined,
    actorRole: input.actorRole,
    target: serviceId,
    metadata: {
      providerProfileId: input.providerProfileId || undefined,
      ...input.metadata,
    },
  })
}

export async function createOperationalService(
  db: DbClient,
  input: CreateOperationalServiceInput,
  options: { audit?: LifecycleAudit; dedupeActive?: boolean } = {},
) {
  if (options.dedupeActive && 'findFirst' in db.serviceRequest) {
    const existing = await (db.serviceRequest as any).findFirst({
      where: {
        clientId: input.clientId,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) return { ...existing, deduped: true }
  }

  const label = input.label || 'Solicitacao enviada - procurando prestador proximo'
  const service = await db.serviceRequest.create({
    data: {
      clientId: input.clientId,
      type: input.type,
      description: input.description || '',
      status: 'REQUESTED',
      pickup: JSON.stringify(input.pickup),
      pickupLabel: input.pickupLabel,
      destination: JSON.stringify(input.destination),
      destinationLabel: input.destinationLabel,
      distanceKm: input.distanceKm,
      etaMin: input.etaMin,
      price: input.price,
      originalPrice: input.originalPrice,
      discount: input.discount,
      promoCode: input.promoCode || null,
      paymentMethod: input.paymentMethod,
      loyaltyPoints: input.loyaltyPoints || 0,
      timeline: {
        create: {
          status: 'REQUESTED',
          label,
          eventType: 'request_created',
          actorRole: 'CLIENT',
          actorUserId: input.clientId,
        },
      },
    },
  })

  options.audit?.('request_created', {
    actor: input.clientId,
    actorRole: 'CLIENT',
    target: service.id,
    metadata: { type: input.type, paymentMethod: input.paymentMethod },
  })

  return service
}

export async function transitionServiceStatus(
  db: DbClient,
  serviceId: string,
  toStatus: ServiceStatus,
  options: TransitionOptions,
) {
  const service = await db.serviceRequest.findUnique({ where: { id: serviceId } })
  if (!service) throw new Error(`ServiceRequest not found: ${serviceId}`)

  const sameStatus = service.status === toStatus
  if (sameStatus && TERMINAL_STATUSES.includes(toStatus)) {
    return { changed: false, service }
  }

  assertTransitionAllowed(service.status, toStatus)

  const now = new Date()
  const data: Record<string, unknown> = {
    status: toStatus,
    ...timestampPatch(toStatus, now, service),
  }

  if (options.providerId !== undefined) data.providerId = options.providerId
  if (toStatus === 'CANCELED') {
    data.canceledByRole = options.canceledByRole || options.actorRole || null
    data.canceledByUserId = options.canceledByUserId || options.actorUserId || null
    data.cancellationReason = options.cancellationReason || null
  }

  const updated = await db.serviceRequest.update({
    where: { id: serviceId },
    data,
  })

  await createTimelineEvent(db, serviceId, toStatus, options)
  emitAudit(options.audit, options.eventType, serviceId, options)

  return { changed: true, service: updated }
}

function providerBlockReason(provider: any): string | null {
  return canProviderOperate(provider) ? null : 'provider_not_allowed'
}

export async function registerServiceOffers(
  db: DbClient,
  serviceId: string,
  providerIds: string[],
  options: TimelineInput & { audit?: LifecycleAudit },
) {
  const uniqueProviderIds = Array.from(new Set(providerIds.filter(Boolean)))
  const offeredProviderIds: string[] = []
  const blockedProviderIds: string[] = []

  for (const providerId of uniqueProviderIds) {
    const provider = await db.providerProfile.findUnique({
      where: { id: providerId },
      include: { user: { select: { id: true, status: true } } },
    })
    if (!provider || providerBlockReason(provider)) {
      blockedProviderIds.push(providerId)
      continue
    }

    const existing = await db.serviceOffer.findUnique({
      where: { serviceId_providerId: { serviceId, providerId } },
    })
    if (!existing) {
      await db.serviceOffer.create({
        data: { serviceId, providerId, status: 'PENDING' },
      })
      offeredProviderIds.push(providerId)
    } else if (existing.status === 'PENDING') {
      offeredProviderIds.push(providerId)
    }
  }

  await transitionServiceStatus(db, serviceId, 'OFFERED', {
    ...options,
    eventType: 'offer_sent',
    metadata: {
      ...options.metadata,
      providerIds: offeredProviderIds,
      blockedProviderIds,
    },
    audit: options.audit,
  })

  return { offeredProviderIds, blockedProviderIds }
}

export async function acceptServiceOffer(
  db: DbClient,
  serviceId: string,
  providerId: string,
  options: TimelineInput & { audit?: LifecycleAudit },
) {
  const run = async (tx: DbClient) => {
    const provider = await tx.providerProfile.findUnique({
      where: { id: providerId },
      include: { user: { select: { id: true, status: true } } },
    })
    if (!provider) throw new Error(`ProviderProfile not found: ${providerId}`)
    const blockReason = providerBlockReason(provider)
    if (blockReason) throw new Error(`Provider cannot operate: ${blockReason}`)

    const offer = await tx.serviceOffer.findUnique({
      where: { serviceId_providerId: { serviceId, providerId } },
    })
    if (!offer) throw new Error('Service offer not found for provider')

    const service = await tx.serviceRequest.findUnique({ where: { id: serviceId } })
    if (!service) throw new Error(`ServiceRequest not found: ${serviceId}`)

    if (offer.status === 'ACCEPTED') {
      if (service.providerId === providerId && service.status === 'ACCEPTED') {
        return { changed: false, conflict: false, offer, service }
      }
      return { changed: false, conflict: true, reason: 'offer_already_accepted', offer, service }
    }
    if (offer.status !== 'PENDING') {
      return { changed: false, conflict: true, reason: `offer_${String(offer.status).toLowerCase()}`, offer, service }
    }
    if (service.providerId && service.providerId !== providerId) {
      return { changed: false, conflict: true, reason: 'service_already_accepted', offer, service }
    }
    if (!['REQUESTED', 'OFFERED'].includes(service.status)) {
      return { changed: false, conflict: true, reason: `service_${String(service.status).toLowerCase()}`, offer, service }
    }

    const now = new Date()
    const claimService = 'updateMany' in tx.serviceRequest
      ? await (tx.serviceRequest as any).updateMany({
          where: {
            id: serviceId,
            providerId: service.providerId || null,
            status: { in: ['REQUESTED', 'OFFERED'] },
          },
          data: {
            status: 'ACCEPTED',
            providerId,
            ...(service.acceptedAt ? {} : { acceptedAt: now }),
          },
        })
      : { count: 1 }

    if (claimService.count !== 1) {
      const latest = await tx.serviceRequest.findUnique({ where: { id: serviceId } })
      return { changed: false, conflict: true, reason: 'service_claim_conflict', offer, service: latest || service }
    }

    const claimOffer = 'updateMany' in tx.serviceOffer
      ? await tx.serviceOffer.updateMany({
          where: { id: offer.id, status: 'PENDING' },
          data: { status: 'ACCEPTED', respondedAt: now },
        })
      : { count: 1 }

    if (claimOffer.count !== 1) {
      throw new Error('Service offer claim conflict')
    }

    const accepted = 'update' in tx.serviceOffer
      ? await tx.serviceOffer.update({
          where: { id: offer.id },
          data: { status: 'ACCEPTED', respondedAt: now },
        })
      : { ...offer, status: 'ACCEPTED', respondedAt: now }

    await tx.serviceOffer.updateMany({
      where: { serviceId, providerId: { not: providerId }, status: 'PENDING' },
      data: { status: 'CANCELED', respondedAt: now, reason: 'accepted_by_other_provider' },
    })

    await createTimelineEvent(tx, serviceId, 'ACCEPTED', {
      ...options,
      eventType: 'offer_accepted',
      providerProfileId: providerId,
      actorRole: options.actorRole || 'PROVIDER',
      actorUserId: options.actorUserId || provider.userId,
    })
    emitAudit(options.audit, 'offer_accepted', serviceId, {
      ...options,
      providerProfileId: providerId,
      actorRole: options.actorRole || 'PROVIDER',
      actorUserId: options.actorUserId || provider.userId,
    })

    const updatedService = await tx.serviceRequest.findUnique({ where: { id: serviceId } })
    return { changed: true, conflict: false, offer: accepted, service: updatedService }
  }

  if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
    return (db as any).$transaction((tx: DbClient) => run(tx), {
      isolationLevel: 'Serializable',
    })
  }

  return run(db)
}

export async function declineServiceOffer(
  db: DbClient,
  serviceId: string,
  providerId: string,
  options: TimelineInput & { reason?: string | null; audit?: LifecycleAudit },
) {
  const offer = await db.serviceOffer.findUnique({
    where: { serviceId_providerId: { serviceId, providerId } },
  })
  if (!offer) return { changed: false, reason: 'offer_not_found' as const }
  if (offer.status === 'DECLINED') return { changed: false, reason: 'already_declined' as const }
  if (offer.status !== 'PENDING') throw new Error(`Service offer cannot be declined from ${offer.status}`)

  const now = new Date()
  const declined = await db.serviceOffer.update({
    where: { id: offer.id },
    data: {
      status: 'DECLINED',
      respondedAt: now,
      reason: options.reason || null,
    },
  })
  await createTimelineEvent(db, serviceId, 'OFFERED', {
    ...options,
    eventType: 'offer_declined',
    providerProfileId: providerId,
    metadata: { ...options.metadata, reason: options.reason || null },
  })
  emitAudit(options.audit, 'offer_declined', serviceId, {
    ...options,
    providerProfileId: providerId,
    metadata: { ...options.metadata, reason: options.reason || null },
  })

  return { changed: true, offer: declined }
}

export async function expirePendingServiceOffers(
  db: DbClient,
  serviceId: string,
  providerIds: string[],
  options: TimelineInput,
) {
  const where = providerIds.length
    ? { serviceId, providerId: { in: providerIds }, status: 'PENDING' as const }
    : { serviceId, status: 'PENDING' as const }

  const result = await db.serviceOffer.updateMany({
    where,
    data: { status: 'EXPIRED', respondedAt: new Date(), reason: 'offer_timeout' },
  })

  if (result.count > 0) {
    await createTimelineEvent(db, serviceId, 'OFFERED', {
      ...options,
      eventType: 'offer_expired',
      metadata: { ...options.metadata, providerIds },
    })
  }

  return result
}

export async function updateServiceProviderPosition(
  db: DbClient,
  serviceId: string,
  position: LatLng,
) {
  return db.serviceRequest.update({
    where: { id: serviceId },
    data: { providerLat: position.lat, providerLng: position.lng },
  })
}

export function operationalEventForStatus(status: ServiceStatus): OperationalAuditEvent | undefined {
  switch (status) {
    case 'PROVIDER_EN_ROUTE':
      return 'provider_en_route'
    case 'ARRIVED':
      return 'provider_arrived'
    case 'IN_PROGRESS':
      return 'service_started'
    case 'COMPLETED':
      return 'service_completed'
    case 'CANCELED':
      return 'service_cancelled'
    default:
      return undefined
  }
}
