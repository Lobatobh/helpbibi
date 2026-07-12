import type { ServiceRequest } from '@prisma/client'
import { db } from '@/server/db/prisma'
import type { CurrentUser } from '@/server/auth/session'

export class ServiceAccessError extends Error {
  status: number

  constructor(status: number, message = 'Service not found') {
    super(message)
    this.status = status
  }
}

export type ServiceParticipantRole = 'client' | 'provider'

export type ServiceParticipant = {
  role: ServiceParticipantRole
  userId: string
  providerProfileId: string | null
  displayName: string
}

export const serviceParticipantInclude = {
  client: { select: { id: true, name: true, email: true, phone: true } },
  provider: {
    select: {
      id: true,
      userId: true,
      vehicle: true,
      plate: true,
      city: true,
      approvalStatus: true,
      rating: true,
      ratingSum: true,
      ratingCount: true,
      completedCount: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
  timeline: { orderBy: { createdAt: 'asc' as const } },
  chatMessages: { orderBy: { createdAt: 'asc' as const } },
  ratings: { orderBy: { createdAt: 'asc' as const } },
  paymentRecords: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} as const

export type ServiceWithParticipants = ServiceRequest & {
  client?: { id: string; name: string; email: string | null; phone: string | null } | null
  provider?: {
    id: string
    userId: string
    vehicle: string
    plate: string
    city: string | null
    approvalStatus: string
    rating: number
    ratingSum: number
    ratingCount: number
    completedCount: number
    user?: { id: string; name: string; email: string | null; phone: string | null } | null
  } | null
  timeline?: Array<{ id: string; status: string; label: string; eventType: string | null; createdAt: Date }>
  chatMessages?: Array<{ id: string; serviceId: string; authorRole: string; authorName: string; text: string; createdAt: Date }>
  ratings?: Array<{ id: string; serviceId: string; authorId: string; targetRole: string; stars: number; comment: string; createdAt: Date }>
  paymentRecords?: Array<{
    id: string
    status: string
    method: string
    amount: number
    platformFee: number
    providerPayout: number
    paidAt: Date | null
    failedAt: Date | null
    failureReason: string | null
    createdAt: Date
  }>
}

export async function getProviderProfileIdForUser(userId: string): Promise<string | null> {
  const profile = await db.providerProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  return profile?.id || null
}

export function resolveServiceParticipant(
  service: Pick<ServiceWithParticipants, 'clientId' | 'client' | 'providerId' | 'provider'>,
  user: CurrentUser,
): ServiceParticipant | null {
  if (user.role === 'CLIENT' && service.clientId === user.id) {
    return {
      role: 'client',
      userId: user.id,
      providerProfileId: null,
      displayName: service.client?.name || user.name || 'Cliente',
    }
  }

  if (user.role === 'PROVIDER' && service.providerId && service.provider?.userId === user.id) {
    return {
      role: 'provider',
      userId: user.id,
      providerProfileId: service.providerId,
      displayName: service.provider.user?.name || user.name || 'Prestador',
    }
  }

  return null
}

export async function loadServiceWithParticipants(serviceId: string): Promise<ServiceWithParticipants | null> {
  return db.serviceRequest.findUnique({
    where: { id: serviceId },
    include: serviceParticipantInclude,
  }) as Promise<ServiceWithParticipants | null>
}

export async function requireServiceParticipant(serviceId: string, user: CurrentUser) {
  const service = await loadServiceWithParticipants(serviceId)
  if (!service) throw new ServiceAccessError(404)

  const participant = resolveServiceParticipant(service, user)
  if (!participant) throw new ServiceAccessError(404)

  return { service, participant }
}
