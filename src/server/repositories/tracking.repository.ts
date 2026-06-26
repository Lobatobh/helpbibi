import { db } from '@/server/db/prisma'

/**
 * Get public-safe tracking data for a service.
 * Does NOT return: client name, phone, payment method, plate, chat messages.
 * Returns: status, type, provider (name+vehicle+rating only), ETA, route, timeline.
 */
export async function getPublicTracking(serviceId: string) {
  const svc = await db.serviceRequest.findUnique({
    where: { id: serviceId },
    include: {
      timeline: { orderBy: { createdAt: 'asc' } },
      provider: { include: { user: true } },
    },
  })

  if (!svc) {
    return { available: false, message: 'Rastreamento indisponível ou encerrado.' }
  }

  // Map DB status to display status (compat with frontend)
  const statusMap: Record<string, string> = {
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

  const typeLabels: Record<string, string> = {
    REBOQUE: 'Reboque / Guincho',
    PNEU: 'Troca de Pneu',
    BATERIA: 'Carga de Bateria',
    COMBUSTIVEL: 'Combustível',
    CHAVEIRO: 'Chaveiro',
    PANE: 'Pane Mecânica',
  }

  const typeIcons: Record<string, string> = {
    REBOQUE: 'tow-truck',
    PNEU: 'tire',
    BATERIA: 'battery',
    COMBUSTIVEL: 'fuel',
    CHAVEIRO: 'key',
    PANE: 'wrench',
  }

  return {
    available: true,
    serviceId: svc.id,
    status: statusMap[svc.status] || svc.status.toLowerCase(),
    type: svc.type.toLowerCase(),
    typeLabel: typeLabels[svc.type] || svc.type,
    icon: typeIcons[svc.type] || 'wrench',
    pickupLabel: svc.pickupLabel,
    destinationLabel: svc.destinationLabel,
    distanceKm: svc.distanceKm,
    etaMin: svc.etaMin,
    createdAt: svc.createdAt.getTime(),
    acceptedAt: svc.acceptedAt?.getTime() || null,
    completedAt: svc.completedAt?.getTime() || null,
    timeline: svc.timeline.map((ev) => ({
      status: statusMap[ev.status] || ev.status.toLowerCase(),
      label: ev.label,
      at: ev.createdAt.getTime(),
    })),
    // Provider: only name, vehicle, rating — NO plate, NO phone, NO userId
    provider: svc.provider
      ? { name: svc.provider.user.name, vehicle: svc.provider.vehicle, rating: svc.provider.rating }
      : null,
    // Provider position (for map if needed)
    providerPosition: svc.providerLat && svc.providerLng
      ? { lat: svc.providerLat, lng: svc.providerLng }
      : null,
    pickup: JSON.parse(svc.pickup),
    destination: JSON.parse(svc.destination),
    // NO client data, NO payment method, NO chat, NO price
  }
}

export async function createTrackingShare(serviceId: string) {
  return db.trackingShare.create({
    data: { serviceId },
  })
}
