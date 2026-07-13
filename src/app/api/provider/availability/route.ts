import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { db } from '@/server/db/prisma'
import { canProviderOperate, getProviderOperationBlockReason } from '@/server/providers/provider-approval'
import { findActiveServiceForProvider } from '@/server/repositories/service-requests.repository'
import { ConsentRequiredError, requireCurrentConsents } from '@/server/consents/consent-service'

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireCurrentConsents(req, 'PROVIDER')
    const body = await req.json().catch(() => ({}))
    const online = body?.online === true

    const provider = await db.providerProfile.findUnique({
      where: { userId: user.id },
      include: { user: { select: { id: true, status: true } } },
    })
    if (!provider) return NextResponse.json({ message: 'Provider profile not found' }, { status: 404 })

    const blockReason = getProviderOperationBlockReason(provider)
    if (online && blockReason) {
      await db.providerProfile.update({ where: { id: provider.id }, data: { isAvailable: false } }).catch(() => {})
      return NextResponse.json({ ok: false, reason: blockReason, isAvailable: false }, { status: 403 })
    }

    const activeService = await findActiveServiceForProvider(provider.id)
    if (online && activeService) {
      return NextResponse.json({ ok: false, reason: 'provider_busy', isAvailable: false, service: activeService }, { status: 409 })
    }

    const updated = await db.providerProfile.update({
      where: { id: provider.id },
      data: { isAvailable: online },
    })

    return NextResponse.json({
      ok: true,
      isAvailable: updated.isAvailable,
      canOperate: canProviderOperate({ ...updated, user: provider.user }),
    })
  } catch (error) {
    if (error instanceof ConsentRequiredError) {
      return NextResponse.json({
        code: 'consent_required',
        message: 'Aceite os documentos vigentes antes de alterar sua disponibilidade.',
        pending: error.pending,
      }, { status: 428 })
    }
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
  }
}
