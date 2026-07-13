import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from '@/server/db/prisma'
import { CURRENT_CONSENT_VERSIONS, type ConsentTypeName } from './consent-versions'

export class RegistrationConflictError extends Error {
  constructor() {
    super('Registration conflict')
    this.name = 'RegistrationConflictError'
  }
}

export async function createUserWithCurrentConsents(
  userData: Prisma.UserCreateInput,
  consentTypes: ConsentTypeName[],
  client: PrismaClient = db,
) {
  return client.$transaction(async (tx) => {
    if (userData.email) {
      const existing = await tx.user.findUnique({ where: { email: userData.email } })
      if (existing) throw new RegistrationConflictError()
    }

    return tx.user.create({
      data: {
        ...userData,
        consentRecords: {
          create: consentTypes.map((type) => ({
            type: type as any,
            version: CURRENT_CONSENT_VERSIONS[type],
          })),
        },
      },
      include: {
        clientProfile: true,
        providerProfile: true,
        loyaltyAccount: true,
        consentRecords: true,
      },
    })
  })
}
