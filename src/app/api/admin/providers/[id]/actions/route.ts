import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { audit } from '@/server/audit'
import { getClientIp } from '@/server/rate-limit'
import {
  AdminOperationalActionError,
  forceProviderOffline,
} from '@/server/services/admin-service-actions'

function errorResponse(error: unknown) {
  if (error instanceof AdminOperationalActionError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status })
  }
  return NextResponse.json({ ok: false, message: 'Admin provider action failed' }, { status: 500 })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin
  try {
    admin = await requireRole(req, 'ADMIN')
  } catch (error) {
    audit('unauthorized_access', {
      actor: 'anonymous',
      actorRole: 'unknown',
      ip: getClientIp(req),
      route: 'admin/providers/:id/actions',
      severity: 'warning',
    })
    const message = error instanceof Error ? error.message : 'Unauthorized'
    const status = message.startsWith('Forbidden') ? 403 : 401
    return NextResponse.json({ ok: false, message }, { status })
  }

  const body = await req.json().catch(() => ({}))
  if (body?.action !== 'force_offline') {
    return NextResponse.json({ ok: false, code: 'invalid_action', message: 'Acao administrativa invalida.' }, { status: 400 })
  }

  const { id } = await params
  try {
    const result = await forceProviderOffline({ providerId: id, admin, ip: getClientIp(req) })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
