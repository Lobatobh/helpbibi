import { db } from '@/server/db/prisma'
import type { ProviderProfile, VerificationStatus } from '@prisma/client'

export async function createProviderProfile(
  userId: string,
  data: { vehicle: string; plate: string }
): Promise<ProviderProfile> {
  return db.providerProfile.create({
    data: {
      userId,
      vehicle: data.vehicle,
      plate: data.plate,
      isAvailable: true,
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
