import { Prisma } from '@prisma/client'
import { db } from '@/server/db/prisma'
import type { CurrentUser } from '@/server/auth/session'
import { ServiceAccessError, requireServiceParticipant } from '@/server/services/service-access'
import { RATING_COMMENT_MAX_LENGTH, canRateService } from '@/server/services/service-status'

export type ServiceRatingDto = {
  id: string
  serviceId: string
  targetRole: 'client' | 'provider'
  stars: number
  comment: string
  createdAt: string
}

export class ServiceRatingError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function serializeRating(rating: {
  id: string
  serviceId: string
  targetRole: string
  stars: number
  comment: string
  createdAt: Date
}): ServiceRatingDto {
  return {
    id: rating.id,
    serviceId: rating.serviceId,
    targetRole: rating.targetRole === 'client' ? 'client' : 'provider',
    stars: rating.stars,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
  }
}

function normalizeStars(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return Number.NaN
  return value
}

function normalizeComment(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (text.length > RATING_COMMENT_MAX_LENGTH) return text.slice(0, RATING_COMMENT_MAX_LENGTH)
  return text
}

export async function createServiceRating(
  serviceId: string,
  user: CurrentUser,
  input: { stars: unknown; comment?: unknown },
): Promise<{ rating: ServiceRatingDto; created: boolean }> {
  const stars = normalizeStars(input.stars)
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new ServiceRatingError(400, 'Rating score must be an integer from 1 to 5')
  }

  const { service, participant } = await requireServiceParticipant(serviceId, user)
  if (!canRateService(service.status)) {
    throw new ServiceRatingError(409, 'Service must be completed before rating')
  }

  const targetRole = participant.role === 'client' ? 'provider' : 'client'
  if (targetRole === 'provider' && !service.providerId) {
    throw new ServiceRatingError(409, 'Service has no provider to rate')
  }

  const comment = normalizeComment(input.comment)

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.serviceRating.findUnique({
        where: { serviceId_targetRole: { serviceId: service.id, targetRole } },
      })
      if (existing) return { rating: existing, created: false }

      const rating = await tx.serviceRating.create({
        data: {
          serviceId: service.id,
          authorId: user.id,
          targetRole,
          stars,
          comment,
        },
      })

      if (targetRole === 'provider' && service.providerId) {
        const provider = await tx.providerProfile.findUnique({
          where: { id: service.providerId },
          select: { ratingSum: true, ratingCount: true },
        })
        if (provider) {
          const ratingSum = provider.ratingSum + stars
          const ratingCount = provider.ratingCount + 1
          await tx.providerProfile.update({
            where: { id: service.providerId },
            data: {
              ratingSum,
              ratingCount,
              rating: Number((ratingSum / ratingCount).toFixed(2)),
            },
          })
        }
      }

      return { rating, created: true }
    })

    return { rating: serializeRating(result.rating), created: result.created }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await db.serviceRating.findUnique({
        where: { serviceId_targetRole: { serviceId: service.id, targetRole } },
      })
      if (existing) return { rating: serializeRating(existing), created: false }
    }
    throw error
  }
}

export function serviceRatingErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof ServiceRatingError || error instanceof ServiceAccessError) {
    return { status: error.status, message: error.message }
  }
  return { status: 500, message: 'Unable to process rating' }
}
