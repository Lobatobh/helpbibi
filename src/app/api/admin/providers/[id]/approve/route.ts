import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/server/auth/session'
import { audit } from '@/server/audit'
import { getClientIp } from '@/server/rate-limit'
import {
  changeProviderApprovalStatus,
  findProviderForAdmin,
} from '@/server/repositories/providers.repository'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin
  try {
    admin = await requireRole(req, 'ADMIN')
  } catch {
    audit('unauthorized_access', {
      actor: 'anonymous',
      actorRole: 'unknown',
      ip: getClientIp(req),
      route: 'admin/providers/:id/approve',
      severity: 'warning',
    })
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const before = await findProviderForAdmin(id)
  if (!before) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  const provider = await changeProviderApprovalStatus(id, 'approve', admin.id)
  audit('provider_approved', {
    actor: admin.id,
    actorRole: admin.role,
    ip: getClientIp(req),
    route: 'admin/providers/:id/approve',
    target: id,
    metadata: { previousStatus: before.approvalStatus, nextStatus: provider.approvalStatus },
  })

  return NextResponse.json({ ok: true, provider })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, 'ADMIN')
  } catch {
    audit('unauthorized_access', {
      actor: 'anonymous',
      actorRole: 'unknown',
      ip: getClientIp(req),
      route: 'admin/providers/:id/approve',
      severity: 'warning',
    })
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const provider = await findProviderForAdmin(id)
  if (!provider) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  return NextResponse.json({ provider })
}
