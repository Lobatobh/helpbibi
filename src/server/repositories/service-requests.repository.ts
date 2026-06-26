import { db } from '@/server/db/prisma'
import type { ServiceRequest, ServiceStatus, ServiceType, PaymentMethod } from '@prisma/client'

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
