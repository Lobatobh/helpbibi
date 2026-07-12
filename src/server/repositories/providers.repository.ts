import { db } from '@/server/db/prisma'
import type { ProviderProfile } from '@prisma/client'
import {
  buildProviderApprovalUpdate,
  serializeProviderForAdmin,
  type ProviderApprovalAction,
} from '@/server/providers/provider-approval'

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
} as const

export async function listProvidersForAdmin() {
  const providers = await db.providerProfile.findMany({
    include: providerAdminInclude,
    orderBy: { createdAt: 'desc' },
  })
  return providers.map(serializeProviderForAdmin)
}

export async function findProviderForAdmin(id: string) {
  const provider = await db.providerProfile.findUnique({
    where: { id },
    include: providerAdminInclude,
  })
  return provider ? serializeProviderForAdmin(provider) : null
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
  return serializeProviderForAdmin(provider)
}
