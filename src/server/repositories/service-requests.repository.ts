import { db } from '@/server/db/prisma'
import type { PaymentMethod, Prisma, ServiceRequest, ServiceStatus, ServiceType } from '@prisma/client'
import { ACTIVE_SERVICE_STATUSES, isActiveServiceStatus } from '@/server/services/service-status'

type LatLng = { lat: number; lng: number }

const serviceTypeToPublic: Record<string, string> = {
  REBOQUE: 'reboque',
  PNEU: 'pneu',
  BATERIA: 'bateria',
  COMBUSTIVEL: 'combustivel',
  CHAVEIRO: 'chaveiro',
  PANE: 'pane',
}

const serviceTypeLabel: Record<string, string> = {
  REBOQUE: 'Reboque / Guincho',
  PNEU: 'Troca de Pneu',
  BATERIA: 'Carga de Bateria',
  COMBUSTIVEL: 'Combustivel',
  CHAVEIRO: 'Chaveiro',
  PANE: 'Pane Mecanica',
}

const serviceTypeIcon: Record<string, string> = {
  REBOQUE: 'tow-truck',
  PNEU: 'tire',
  BATERIA: 'battery',
  COMBUSTIVEL: 'fuel',
  CHAVEIRO: 'key',
  PANE: 'wrench',
}

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
  FAILED: 'expired',
}

const paymentToPublic: Record<string, string> = {
  PIX: 'pix',
  CARD: 'card',
  CASH: 'cash',
}

function parseLocation(value: string): LatLng | null {
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
      return { lat: parsed.lat, lng: parsed.lng }
    }
  } catch {
    // fall through
  }
  return null
}

function parseRequiredLocation(value: string): LatLng {
  const location = parseLocation(value)
  if (!location) throw new Error('ServiceRequest has an invalid pickup location')
  return location
}

const activeServiceInclude = {
  client: { select: { id: true, name: true, email: true, phone: true } },
  provider: {
    select: {
      id: true,
      vehicle: true,
      plate: true,
      rating: true,
      completedCount: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
  timeline: { orderBy: { createdAt: 'asc' as const } },
  offers: {
    include: {
      provider: {
        select: {
          id: true,
          vehicle: true,
          plate: true,
          rating: true,
          completedCount: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const

export type ServiceRealtimeSnapshot = {
  id: string
  dbServiceId: string
  clientId: string
  clientName: string
  type: string
  typeLabel: string
  icon: string
  description: string
  pickup: LatLng
  pickupLabel: string
  destination: LatLng | null
  destinationLabel: string
  price: number
  originalPrice: number
  discount: number
  promoCode: string | null
  distanceKm: number
  etaMin: number
  status: string
  dbStatus: ServiceStatus
  paymentMethod: string
  paymentStatus: string
  providerId: string | null
  notifiedProviderIds: string[]
  notifiedCount: number
  provider: {
    id: string
    name: string
    vehicle: string
    plate: string
    rating: number
    completedCount: number
    position: LatLng | null
  } | null
  createdAt: number
  acceptedAt: number | null
  completedAt: number | null
  canceledAt: number | null
  cancellationReason: string | null
  timeline: Array<{ status: string; label: string; at: number }>
  offers: Array<{
    id: string
    providerId: string
    providerName: string | null
    status: string
    reason: string | null
    offeredAt: number
    respondedAt: number | null
  }>
  loyaltyPoints: number
}

export function serializeRealtimeService(service: any): ServiceRealtimeSnapshot {
  const notifiedProviderIds = (service.offers || [])
    .filter((offer: any) => offer.status === 'PENDING')
    .map((offer: any) => offer.providerId)
  return {
    id: service.id,
    dbServiceId: service.id,
    clientId: service.clientId,
    clientName: service.client?.name || 'Cliente',
    type: serviceTypeToPublic[service.type] || String(service.type).toLowerCase(),
    typeLabel: serviceTypeLabel[service.type] || service.type,
    icon: serviceTypeIcon[service.type] || 'wrench',
    description: service.description || '',
    pickup: parseRequiredLocation(service.pickup),
    pickupLabel: service.pickupLabel,
    destination: parseLocation(service.destination),
    destinationLabel: service.destinationLabel,
    price: service.price,
    originalPrice: service.originalPrice,
    discount: service.discount,
    promoCode: service.promoCode,
    distanceKm: service.distanceKm,
    etaMin: service.etaMin,
    status: statusToPublic[service.status] || 'expired',
    dbStatus: service.status,
    paymentMethod: paymentToPublic[service.paymentMethod] || 'pix',
    paymentStatus: service.paymentStatus,
    providerId: service.providerId || null,
    notifiedProviderIds,
    notifiedCount: notifiedProviderIds.length,
    provider: service.provider
      ? {
          id: service.provider.id,
          name: service.provider.user?.name || 'Prestador',
          vehicle: service.provider.vehicle,
          plate: service.provider.plate,
          rating: service.provider.rating,
          completedCount: service.provider.completedCount,
          position: service.providerLat && service.providerLng
            ? { lat: service.providerLat, lng: service.providerLng }
            : null,
        }
      : null,
    createdAt: service.createdAt.getTime(),
    acceptedAt: service.acceptedAt?.getTime() || null,
    completedAt: service.completedAt?.getTime() || null,
    canceledAt: service.canceledAt?.getTime() || null,
    cancellationReason: service.cancellationReason || null,
    timeline: (service.timeline || []).map((event: any) => ({
      status: statusToPublic[event.status] || 'expired',
      label: event.label,
      at: event.createdAt.getTime(),
    })),
    offers: (service.offers || []).map((offer: any) => ({
      id: offer.id,
      providerId: offer.providerId,
      providerName: offer.provider?.user?.name || null,
      status: offer.status,
      reason: offer.reason || null,
      offeredAt: offer.offeredAt.getTime(),
      respondedAt: offer.respondedAt?.getTime() || null,
    })),
    loyaltyPoints: service.loyaltyPoints || 0,
  }
}

export async function findActiveServiceForClient(clientId: string) {
  const service = await db.serviceRequest.findFirst({
    where: { clientId, status: { in: ACTIVE_SERVICE_STATUSES } },
    include: activeServiceInclude,
    orderBy: { createdAt: 'desc' },
  })
  return service ? serializeRealtimeService(service) : null
}

export async function findActiveServiceForProvider(providerId: string) {
  const service = await db.serviceRequest.findFirst({
    where: { providerId, status: { in: ACTIVE_SERVICE_STATUSES } },
    include: activeServiceInclude,
    orderBy: { createdAt: 'desc' },
  })
  return service ? serializeRealtimeService(service) : null
}

export async function findRealtimeServiceById(id: string) {
  const service = await db.serviceRequest.findUnique({
    where: { id },
    include: activeServiceInclude,
  })
  return service ? serializeRealtimeService(service) : null
}

export async function createServiceRequest(data: {
  clientId: string
  type: ServiceType
  description: string
  pickup: LatLng
  pickupLabel: string
  destination: LatLng | null
  destinationLabel: string
  distanceKm: number
  etaMin: number
  price: number
  originalPrice: number
  discount: number
  promoCode: string | null
  paymentMethod: PaymentMethod
  loyaltyPoints?: number
}): Promise<ServiceRequest> {
  return db.serviceRequest.create({
    data: {
      clientId: data.clientId,
      type: data.type,
      description: data.description,
      status: 'REQUESTED',
      pickup: JSON.stringify(data.pickup),
      pickupLabel: data.pickupLabel,
      destination: JSON.stringify(data.destination),
      destinationLabel: data.destinationLabel,
      distanceKm: data.distanceKm,
      etaMin: data.etaMin,
      price: data.price,
      originalPrice: data.originalPrice,
      discount: data.discount,
      promoCode: data.promoCode,
      paymentMethod: data.paymentMethod,
      loyaltyPoints: data.loyaltyPoints || 0,
      timeline: {
        create: {
          status: 'REQUESTED',
          label: 'Solicitação enviada — procurando prestador próximo',
        },
      },
    },
  })
}

export async function findServiceById(id: string) {
  return db.serviceRequest.findUnique({
    where: { id },
    include: {
      timeline: { orderBy: { createdAt: 'asc' } },
      chatMessages: { orderBy: { createdAt: 'asc' } },
      ratings: true,
      provider: { include: { user: true } },
      client: true,
    },
  })
}

export async function updateServiceStatus(
  serviceId: string,
  status: ServiceStatus,
  label: string,
  extra?: { providerId?: string; acceptedAt?: Date; completedAt?: Date; providerLat?: number; providerLng?: number }
) {
  return db.serviceRequest.update({
    where: { id: serviceId },
    data: {
      status,
      ...(extra?.providerId !== undefined && { providerId: extra.providerId }),
      ...(extra?.acceptedAt && { acceptedAt: extra.acceptedAt }),
      ...(extra?.completedAt && { completedAt: extra.completedAt }),
      ...(extra?.providerLat !== undefined && { providerLat: extra.providerLat }),
      ...(extra?.providerLng !== undefined && { providerLng: extra.providerLng }),
      timeline: {
        create: { status, label },
      },
    },
    include: {
      timeline: { orderBy: { createdAt: 'asc' } },
      provider: { include: { user: true } },
      client: true,
    },
  })
}

export async function addTimelineEvent(serviceId: string, status: ServiceStatus, label: string) {
  return db.serviceTimelineEvent.create({
    data: { serviceId, status, label },
  })
}

export async function updateProviderPosition(serviceId: string, lat: number, lng: number) {
  return db.serviceRequest.update({
    where: { id: serviceId },
    data: { providerLat: lat, providerLng: lng },
  })
}

export async function getActiveServices() {
  return db.serviceRequest.findMany({
    where: {
      status: { in: ['REQUESTED', 'OFFERED', 'ACCEPTED', 'PROVIDER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] },
    },
    include: { provider: { include: { user: true } } },
  })
}

const adminServiceInclude = {
  client: { select: { id: true, name: true, email: true, phone: true } },
  provider: {
    select: {
      id: true,
      vehicle: true,
      plate: true,
      approvalStatus: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
  timeline: { orderBy: { createdAt: 'asc' as const } },
  offers: {
    include: {
      provider: {
        select: {
          id: true,
          vehicle: true,
          plate: true,
          approvalStatus: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  ratings: true,
  paymentRecords: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} as const

export type AdminServiceFilters = {
  status?: ServiceStatus | 'ALL' | null
  query?: string | null
  limit?: number
}

function parseJsonLocation(value: string) {
  try {
    const parsed = JSON.parse(value)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number'
    ) {
      return { lat: parsed.lat, lng: parsed.lng }
    }
  } catch {
    // ignore malformed legacy location strings
  }
  return null
}

function serializeAdminService(service: any) {
  const latestPayment = service.paymentRecords?.[0] || null
  return {
    id: service.id,
    client: service.client
      ? {
          id: service.client.id,
          name: service.client.name,
          email: service.client.email,
          phone: service.client.phone,
        }
      : null,
    clientName: service.client?.name || null,
    provider: service.provider
      ? {
          id: service.provider.id,
          name: service.provider.user?.name || null,
          email: service.provider.user?.email || null,
          phone: service.provider.user?.phone || null,
          vehicle: service.provider.vehicle,
          plate: service.provider.plate,
          approvalStatus: service.provider.approvalStatus,
        }
      : null,
    providerName: service.provider?.user?.name || null,
    type: service.type,
    description: service.description,
    status: service.status,
    pickupLabel: service.pickupLabel,
    destinationLabel: service.destinationLabel,
    pickup: parseJsonLocation(service.pickup),
    destination: parseJsonLocation(service.destination),
    distanceKm: service.distanceKm,
    etaMin: service.etaMin,
    price: service.price,
    originalPrice: service.originalPrice,
    discount: service.discount,
    promoCode: service.promoCode,
    paymentMethod: service.paymentMethod,
    paymentStatus: service.paymentStatus,
    latestPayment: latestPayment
      ? {
          id: latestPayment.id,
          status: latestPayment.status,
          method: latestPayment.method,
          amount: latestPayment.amount,
          platformFee: latestPayment.platformFee,
          providerPayout: latestPayment.providerPayout,
          createdAt: latestPayment.createdAt,
        }
      : null,
    platformFee: latestPayment?.platformFee ?? null,
    providerPayout: latestPayment?.providerPayout ?? null,
    providerLat: service.providerLat,
    providerLng: service.providerLng,
    createdAt: service.createdAt,
    offeredAt: service.offeredAt,
    acceptedAt: service.acceptedAt,
    enRouteAt: service.enRouteAt,
    arrivedAt: service.arrivedAt,
    startedAt: service.startedAt,
    completedAt: service.completedAt,
    canceledAt: service.canceledAt,
    canceledByRole: service.canceledByRole,
    canceledByUserId: service.canceledByUserId,
    cancellationReason: service.cancellationReason,
    timeline: (service.timeline || []).map((event: any) => ({
      id: event.id,
      status: event.status,
      label: event.label,
      eventType: event.eventType,
      actorRole: event.actorRole,
      actorUserId: event.actorUserId,
      providerProfileId: event.providerProfileId,
      metadata: event.metadata,
      createdAt: event.createdAt,
    })),
    offers: (service.offers || []).map((offer: any) => ({
      id: offer.id,
      providerId: offer.providerId,
      providerName: offer.provider?.user?.name || null,
      providerEmail: offer.provider?.user?.email || null,
      vehicle: offer.provider?.vehicle || null,
      plate: offer.provider?.plate || null,
      approvalStatus: offer.provider?.approvalStatus || null,
      status: offer.status,
      reason: offer.reason,
      offeredAt: offer.offeredAt,
      respondedAt: offer.respondedAt,
    })),
    ratingsCount: service.ratings?.length || 0,
    lastTimeline: service.timeline?.length
      ? service.timeline[service.timeline.length - 1].label
      : null,
  }
}

export async function listServicesForAdmin(filters: AdminServiceFilters = {}) {
  const where: Prisma.ServiceRequestWhereInput = {}
  if (filters.status && filters.status !== 'ALL') where.status = filters.status

  const query = filters.query?.trim()
  if (query) {
    where.OR = [
      { id: { contains: query } },
      { pickupLabel: { contains: query } },
      { destinationLabel: { contains: query } },
      { client: { name: { contains: query } } },
      { provider: { user: { name: { contains: query } } } },
    ]
  }

  const services = await db.serviceRequest.findMany({
    where,
    include: adminServiceInclude,
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(filters.limit || 50, 200)),
  })

  return services.map(serializeAdminService)
}

export async function findServiceForAdmin(id: string) {
  const service = await db.serviceRequest.findUnique({
    where: { id },
    include: adminServiceInclude,
  })
  return service ? serializeAdminService(service) : null
}
