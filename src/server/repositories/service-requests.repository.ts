import { db } from '@/server/db/prisma'
import type { PaymentMethod, Prisma, ServiceRequest, ServiceStatus, ServiceType } from '@prisma/client'

type LatLng = { lat: number; lng: number }

export async function createServiceRequest(data: {
  clientId: string
  type: ServiceType
  description: string
  pickup: LatLng
  pickupLabel: string
  destination: LatLng
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
