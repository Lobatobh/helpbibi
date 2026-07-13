import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import {
  acceptCurrentConsents,
  consentErrorResponse,
  getConsentStatus,
} from '@/server/consents/consent-service'

const FORBIDDEN_FIELDS = [
  'consentVersion',
  'version',
  'acceptedAt',
  'userId',
  'role',
  'status',
  'approvalStatus',
]

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser(req)
    const body = await req.json().catch(() => ({}))
    const forbidden = FORBIDDEN_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field))
    if (forbidden.length) {
      return NextResponse.json({
        ok: false,
        code: 'forbidden_consent_payload',
        message: 'O servidor define identidade, tipo permitido, versão e data do aceite.',
      }, { status: 400 })
    }

    await db.$transaction((tx) => acceptCurrentConsents(user.id, user.role, body?.types, tx))
    const consents = await getConsentStatus(user.id, user.role)
    return NextResponse.json({
      ok: true,
      current: consents.every((item) => item.accepted),
      consents: consents.map((item) => ({
        ...item,
        acceptedAt: item.acceptedAt?.toISOString() || null,
      })),
    })
  } catch (error) {
    const mapped = consentErrorResponse(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
