import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { audit } from '@/server/audit'
import { getClientIp } from '@/server/rate-limit'
import { listProvidersForAdmin } from '@/server/repositories/providers.repository'

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, 'ADMIN')
  } catch {
    audit('unauthorized_access', {
      actor: 'anonymous',
      actorRole: 'unknown',
      ip: getClientIp(req),
      route: 'admin/providers',
      severity: 'warning',
    })
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const providers = await listProvidersForAdmin()
  return NextResponse.json({ providers, count: providers.length })
}
