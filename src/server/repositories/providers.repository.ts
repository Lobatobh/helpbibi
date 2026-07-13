import { db } from '@/server/db/prisma'
import type { ProviderProfile } from '@prisma/client'
import {
  buildProviderApprovalUpdate,
  deriveProviderAdminOperationalState,
  serializeProviderForAdmin,
  type ProviderApprovalAction,
} from '@/server/providers/provider-approval'
import { ACTIVE_SERVICE_STATUSES } from '@/server/services/service-status'

export async function createProviderProfile(
  userId: string,
  data: { vehicle: string; plate: string }
): Promise<ProviderProfile> {
  return db.providerProfile.create({
    data: {
      userId,
      vehicle: data.vehicle,
      plate: data.plate,
      isAvailable: false,
      isVerified: false,
      approvalStatus: 'PENDING',
      documentStatus: 'PENDING',
      vehicleStatus: 'PENDING',
    },
  })
}

export async function findProviderProfileByUserId(userId: string) {
  return db.providerProfile.findUnique({
    where: { userId },
  })
}

export async function updateProviderAvailability(userId: string, isAvailable: boolean) {
  return db.providerProfile.update({
    where: { userId },
    data: { isAvailable },
  })
}

export async function updateProviderRating(userId: string, stars: number) {
  const profile = await db.providerProfile.findUnique({ where: { userId } })
  if (!profile) return null
  const ratingSum = profile.ratingSum + stars
  const ratingCount = profile.ratingCount + 1
  const rating = Number((ratingSum / ratingCount).toFixed(2))
  return db.providerProfile.update({
    where: { userId },
    data: { ratingSum, ratingCount, rating },
  })
}

export async function incrementProviderStats(userId: string, earnings: number) {
  return db.providerProfile.update({
    where: { userId },
    data: {
      completedCount: { increment: 1 },
      earningsToday: { increment: earnings },
      isAvailable: true,
    },
  })
}

export async function getLeaderboard() {
  return db.providerProfile.findMany({
    include: { user: true },
    orderBy: [{ completedCount: 'desc' }, { rating: 'desc' }],
    take: 10,
  })
}

const providerAdminInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
    },
  },
  services: {
    where: { status: { in: ACTIVE_SERVICE_STATUSES } },
    select: {
      id: true,
      status: true,
      type: true,
      client: { select: { id: true, name: true, email: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} as const

function serializeProviderWithOperationalState(provider: any) {
  const base = serializeProviderForAdmin(provider)
  const service = provider.services?.[0] || null
  const activeService = service
    ? {
        id: service.id,
        status: service.status,
        type: service.type,
        clientId: service.client?.id || null,
        clientName: service.client?.name || null,
        clientEmail: service.client?.email || null,
        createdAt: service.createdAt,
      }
    : null

  return {
    ...base,
    activeService,
    operationalState: deriveProviderAdminOperationalState(base, activeService),
  }
}

export async function listProvidersForAdmin() {
  const providers = await db.providerProfile.findMany({
    include: providerAdminInclude,
    orderBy: { createdAt: 'desc' },
  })
  return providers.map(serializeProviderWithOperationalState)
}

export async function findProviderForAdmin(id: string) {
  const provider = await db.providerProfile.findUnique({
    where: { id },
    include: providerAdminInclude,
  })
  return provider ? serializeProviderWithOperationalState(provider) : null
}

export async function changeProviderApprovalStatus(
  id: string,
  action: ProviderApprovalAction,
  adminUserId: string,
  reason?: unknown,
) {
  const data = buildProviderApprovalUpdate(action, adminUserId, reason)
  const provider = await db.providerProfile.update({
    where: { id },
    data,
    include: providerAdminInclude,
  })
  return serializeProviderWithOperationalState(provider)
}
