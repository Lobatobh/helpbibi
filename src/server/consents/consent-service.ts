import type { ConsentRecord, Prisma, PrismaClient } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { requireCurrentUser, type AuthRole, type CurrentUser } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import {
  CURRENT_CONSENT_VERSIONS,
  isConsentTypeName,
  requiredConsentTypesForRole,
  type ConsentTypeName,
} from './consent-versions'

type DbClient = PrismaClient | Prisma.TransactionClient

export type ConsentStatus = {
  type: ConsentTypeName
  version: string
  accepted: boolean
  acceptedAt: Date | null
}

export class ConsentRequiredError extends Error {
  constructor(public readonly pending: ConsentTypeName[]) {
    super('Current consent acceptance required')
    this.name = 'ConsentRequiredError'
  }
}

function activeCurrentConsent(record: Pick<ConsentRecord, 'type' | 'version' | 'revokedAt'>) {
  const type = record.type as ConsentTypeName
  return isConsentTypeName(type) &&
    record.version === CURRENT_CONSENT_VERSIONS[type] &&
    record.revokedAt === null
}

export async function getConsentStatus(
  userId: string,
  role: AuthRole | string,
  client: DbClient = db,
): Promise<ConsentStatus[]> {
  const required = requiredConsentTypesForRole(role)
  if (!required.length) return []

  const records = await client.consentRecord.findMany({
    where: {
      userId,
      type: { in: required as any },
      version: { in: required.map((type) => CURRENT_CONSENT_VERSIONS[type]) },
    },
    select: { type: true, version: true, acceptedAt: true, revokedAt: true },
  })

  return required.map((type) => {
    const current = records.find((record) => record.type === type && activeCurrentConsent(record as any))
    return {
      type,
      version: CURRENT_CONSENT_VERSIONS[type],
      accepted: !!current,
      acceptedAt: current?.acceptedAt || null,
    }
  })
}

export async function pendingConsentTypes(
  userId: string,
  role: AuthRole | string,
  client: DbClient = db,
): Promise<ConsentTypeName[]> {
  const status = await getConsentStatus(userId, role, client)
  return status.filter((item) => !item.accepted).map((item) => item.type)
}

export async function hasCurrentConsents(
  userId: string,
  role: AuthRole | string,
  client: DbClient = db,
): Promise<boolean> {
  return (await pendingConsentTypes(userId, role, client)).length === 0
}

export async function acceptCurrentConsents(
  userId: string,
  role: AuthRole | string,
  requestedTypes: unknown,
  client: DbClient = db,
) {
  if (!Array.isArray(requestedTypes) || requestedTypes.length === 0) {
    throw new Error('At least one consent type is required')
  }

  const allowed = requiredConsentTypesForRole(role)
  const types = Array.from(new Set(requestedTypes))
  if (types.some((type) => !isConsentTypeName(type) || !allowed.includes(type))) {
    throw new Error('Consent type is not allowed for this role')
  }

  const accepted: ConsentRecord[] = []
  for (const type of types as ConsentTypeName[]) {
    const version = CURRENT_CONSENT_VERSIONS[type]
    const existing = await client.consentRecord.findUnique({
      where: { userId_type_version: { userId, type: type as any, version } },
    })
    if (existing?.revokedAt === null) {
      accepted.push(existing)
      continue
    }
    if (existing) {
      accepted.push(await client.consentRecord.update({
        where: { id: existing.id },
        data: { revokedAt: null, acceptedAt: new Date() },
      }))
      continue
    }
    accepted.push(await client.consentRecord.create({
      data: { userId, type: type as any, version },
    }))
  }
  return accepted
}

export async function requireCurrentConsents(
  request: NextRequest,
  expectedRole?: AuthRole,
): Promise<CurrentUser> {
  const user = await requireCurrentUser(request)
  if (expectedRole && user.role !== expectedRole) {
    throw new Error(`Forbidden: requires ${expectedRole} role`)
  }
  const pending = await pendingConsentTypes(user.id, user.role)
  if (pending.length) throw new ConsentRequiredError(pending)
  return user
}

export function consentErrorResponse(error: unknown) {
  if (error instanceof ConsentRequiredError) {
    return {
      status: 428,
      body: {
        ok: false,
        code: 'consent_required',
        message: 'Aceite os documentos vigentes antes de continuar.',
        pending: error.pending,
      },
    }
  }
  const message = error instanceof Error ? error.message : 'Consent operation failed'
  if (message.startsWith('Forbidden')) return { status: 403, body: { ok: false, message } }
  if (message.startsWith('Unauthorized')) return { status: 401, body: { ok: false, message } }
  return { status: 400, body: { ok: false, message } }
}
