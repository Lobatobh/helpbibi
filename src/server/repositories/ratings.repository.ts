import { db } from '@/server/db/prisma'

export async function createRating(data: {
  serviceId: string
  authorId: string
  targetRole: 'provider' | 'client'
  stars: number
  comment: string
}) {
  return db.serviceRating.create({
    data: {
      serviceId: data.serviceId,
      authorId: data.authorId,
      targetRole: data.targetRole,
      stars: Math.max(1, Math.min(5, Math.round(data.stars))),
      comment: data.comment.slice(0, 240),
    },
  })
}

export async function getRatingsForService(serviceId: string) {
  return db.serviceRating.findMany({
    where: { serviceId },
  })
}

export async function hasRated(serviceId: string, targetRole: string) {
  const existing = await db.serviceRating.findUnique({
    where: { serviceId_targetRole: { serviceId, targetRole } },
  })
  return !!existing
}
